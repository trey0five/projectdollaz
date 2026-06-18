// ─────────────────────────────────────────────────────────────
// Pure role + period classification. Combines the filename and the
// detected SheetMetadata into a suggested role with a confidence score,
// resolves a batch of files into cy/py/audit slots (surfacing conflicts
// rather than ever silently misassigning), and infers the reporting
// period (date + type) from metadata.
//
// PLACEMENT: this lives in @finrep/ingestion (not apps/web) because it is
// a byte-free PURE function of {fileName, metadata} — it completes
// ingestion's job of "turn a file into a typed dataset", sits beside the
// metadata it consumes, and is unit-testable with vitest alongside the
// adapters. apps/web only wires the results into derived state.
//
// CALIBRATION NOTE: in the sample set both TB_PriorYear_FY25 and
// TB_AuditedFYEnd_FY25 are FY25 — so fiscal year ALONE cannot split
// prior-vs-audited. The role KEYWORD (prior / audited) is therefore
// weighted ABOVE the fiscal year; FY is only a CY-vs-PY tiebreaker.
// ─────────────────────────────────────────────────────────────
import type { SheetMetadata } from './types.js'

export type Role = 'cy' | 'py' | 'audit' | 'ignore' | 'unknown'

export interface RoleClassification {
  role: Role
  /** 0..1 — high (>=0.8) keyword+content agree, ~0.5-0.7 one source, <0.4 none. */
  confidence: number
  signals: {
    fromFileName?: Role
    fromTitle?: Role
    /** Content-derived role hint — 'audit' when auditStatus === 'audited'. */
    fromContent?: Role
    fiscalYear?: number
    /** In-sheet period-end date (YYYY-MM-DD), explicit or FY-derived. */
    periodEndDate?: string
    periodEndSource?: 'explicit' | 'fiscal-year-end'
    auditStatus?: 'audited' | 'unaudited'
    reasons: string[]
  }
}

export interface ClassifyInput {
  fileName: string
  metadata?: SheetMetadata
}

// ── Keyword scoring helpers ───────────────────────────────────
// Order matters: 'audit' is checked before current/prior because an
// audited file should never be mistaken for CY/PY. 'prior' before
// 'current' so "prior" wins if both somehow appear.
function roleFromText(text: string): Role | undefined {
  // Normalize separators and camelCase boundaries so "TB_PriorYear_FY25"
  // and "CurrentYearTB" expose word boundaries ("prior year", "current year").
  const t = ` ${text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-./]+/g, ' ').toLowerCase()} `
  if (/\baudit(ed)?\b/.test(t)) return 'audit'
  if (/\bprior\b|\bpy\b/.test(t)) return 'py'
  if (/\bcurrent\b|\bcy\b/.test(t)) return 'cy'
  return undefined
}

/** Strip directory + extension to a comparable basename. */
function baseName(fileName: string): string {
  const noPath = fileName.split(/[\\/]/).pop() ?? fileName
  return noPath.replace(/\.[a-z0-9]+$/i, '')
}

/**
 * Classify one file's role from its filename + detected metadata.
 * Per-file only — batch-relative resolution (collisions, highest-FY=CY)
 * is handled by resolveRoles.
 */
export function classifyRole({ fileName, metadata }: ClassifyInput): RoleClassification {
  const reasons: string[] = []
  const base = baseName(fileName)

  const fromFileName = roleFromText(base)
  if (fromFileName) reasons.push(`filename "${base}" suggests ${fromFileName}`)

  const fromTitle = metadata?.periodTitle ? roleFromText(metadata.periodTitle) : undefined
  if (fromTitle) reasons.push(`sheet title suggests ${fromTitle}`)

  const fiscalYear = metadata?.fiscalYear
  const periodEndDate = metadata?.periodEndDate
  const periodEndSource = metadata?.periodEndSource
  const auditStatus = metadata?.auditStatus

  // CONTENT signal: an explicit in-sheet "Audited" marker is a strong role hint
  // (audit) that does not depend on the filename at all.
  const fromContent: Role | undefined = auditStatus === 'audited' ? 'audit' : undefined
  if (fromContent) reasons.push('sheet marked "Audited" — content suggests audit')

  let role: Role = 'unknown'
  let confidence = 0

  // 1) Content "audited" flag is the most reliable single signal for the audit
  //    role (filenames lie; the in-sheet flag is authored with the statement).
  if (fromContent === 'audit') {
    role = 'audit'
    // Even higher if a keyword corroborates.
    confidence = fromTitle === 'audit' || fromFileName === 'audit' ? 0.95 : 0.85
    if (fromTitle === 'audit' || fromFileName === 'audit') {
      reasons.push('audited flag + role keyword agree')
    }
  } else if (fromTitle && fromFileName && fromTitle === fromFileName) {
    role = fromTitle
    confidence = 0.95
    reasons.push('filename and title agree')
  } else if (fromTitle) {
    // Title (sheet content) is the strongest single keyword signal.
    role = fromTitle
    confidence = fromFileName ? 0.75 : 0.7
    if (fromFileName && fromFileName !== fromTitle) {
      reasons.push(`filename disagreed (${fromFileName}); trusting sheet title`)
    }
  } else if (fromFileName) {
    role = fromFileName
    confidence = 0.6
  } else if (periodEndDate) {
    // No role keyword anywhere, but we DO have an in-sheet period-end date. The
    // batch resolver will use that date to pick cy/py; per-file we stay
    // 'unknown' (the date alone cannot name a slot in isolation) but raise the
    // confidence floor since real content was detected.
    role = 'unknown'
    confidence = periodEndSource === 'explicit' ? 0.5 : 0.4
    reasons.push(
      `no role keyword; period-end ${periodEndDate} (${periodEndSource}) will drive batch resolution`
    )
  } else {
    role = 'unknown'
    confidence = 0.2
    reasons.push('no role keyword in filename or title')
  }

  return {
    role,
    confidence,
    signals: {
      fromFileName,
      fromTitle,
      fromContent,
      fiscalYear,
      periodEndDate,
      periodEndSource,
      auditStatus,
      reasons,
    },
  }
}

// ── Batch resolution ──────────────────────────────────────────
// ROLE-FIRST and BATCH-AWARE: a file is placed by its DETECTED ROLE — a file
// classified 'py' goes to the PY slot, an audited file to the AUDIT slot, a
// 'cy' file to the CY slot. (Recall classifyRole already fuses filename + sheet
// title + the audited flag into that per-file role, so "content-first" is baked
// INTO the role.) Only files with NO role signal at all ('unknown') fall back to
// the date/audit ordering, and ONLY to fill slots still left empty. This means a
// LONE prior-year file lands in PY (not CY) and the required CY slot surfaces as
// missing-current — the user is never shown a card whose slot contradicts its
// role chip.
export interface ResolvedFile {
  id: string
  /** Per-file keyword-derived role (corroboration only). */
  role: Role
  fiscalYear?: number
  /** In-sheet period-end (YYYY-MM-DD) — drives the cy/py latest/earlier split. */
  periodEndDate?: string
  periodEndSource?: 'explicit' | 'fiscal-year-end'
  /** In-sheet audited flag — drives the audit slot. */
  auditStatus?: 'audited' | 'unaudited'
  confidence?: number
  /**
   * The user has explicitly confirmed/overridden this file's role. When true,
   * `role` is treated as a HARD assignment and the file's content signals
   * (date / audited flag) are NOT used for auto-resolution — the user's choice
   * always wins, per the never-silently-misassign safety contract.
   */
  override?: boolean
}

export type RoleConflict =
  | { kind: 'duplicate'; role: Exclude<Role, 'ignore' | 'unknown'>; fileIds: string[] }
  | { kind: 'unresolved'; fileIds: string[] }
  | { kind: 'missing-current' }
  /** 2+ unaudited files share the SAME period-end — user must split cy/py. */
  | { kind: 'ambiguous-period'; fileIds: string[] }

export interface ResolveResult {
  slots: { cy?: string; py?: string; audit?: string }
  conflicts: RoleConflict[]
}

/** A file is an audit candidate if its content is marked audited OR keyword=audit. */
function isAuditCandidate(f: ResolvedFile): boolean {
  return f.auditStatus === 'audited' || f.role === 'audit'
}

/**
 * Resolve a batch of files into single cy/py/audit slots, ROLE-FIRST.
 *
 * Algorithm (placement order — each file is claimed by the FIRST phase that
 * applies, so a file never competes for two slots):
 *
 *  P0. USER OVERRIDES win (hard assignment): a file flagged `override` with a
 *      concrete role (cy/py/audit) claims that slot. Two overrides on the same
 *      slot -> 'duplicate' (slot stays empty). User intent always wins.
 *  PA. AUDIT by signal: files that are audit candidates (auditStatus 'audited'
 *      OR role 'audit') claim the audit slot. 1 -> assigned; >1 -> 'duplicate'.
 *      Claimed here so an audited file NEVER also competes for cy/py.
 *  PB. DETECTED ROLE: among the rest, files whose detected role is 'cy' claim
 *      cy, files whose role is 'py' claim py. 1 -> assigned; >1 -> 'duplicate'.
 *  PC. DATE/AUDIT FALLBACK for SIGNAL-LESS files only ('unknown'): fill any
 *      STILL-EMPTY cy/py slots from the unknown cohort's period-end dates —
 *      latest -> cy, earlier -> py. Two newest share a date -> 'ambiguous-period'
 *      (slots stay empty). Then, per the DECISION, a LONE remaining signal-less
 *      file (even DATELESS) defaults to the required cy slot if it is still empty.
 *  PD. UNRESOLVED: any remaining file that found no slot (e.g. an unknown file
 *      with no date, or a surplus) -> 'unresolved'. Never dropped silently.
 *  PE. MISSING-CURRENT: if cy is still empty and nothing is contesting it.
 *
 * Files classified 'ignore' are never slotted. The never-silently-misassign
 * contract is preserved: any collision leaves the slot EMPTY and is surfaced.
 */
export function resolveRoles(files: ResolvedFile[]): ResolveResult {
  const slots: { cy?: string; py?: string; audit?: string } = {}
  const conflicts: RoleConflict[] = []

  const active = files.filter((f) => f.role !== 'ignore')

  // Tracks every file that has already been claimed by an earlier phase so it
  // never competes again. (`unresolved` is computed from what's left over.)
  const claimed = new Set<string>()

  // Claim a single slot from a set of candidates, emitting a duplicate conflict
  // (and leaving the slot empty) when more than one file contends.
  const claimSlot = (
    role: 'cy' | 'py' | 'audit',
    candidates: ResolvedFile[]
  ): void => {
    // If the slot is already filled by a higher-priority phase (e.g. a P0
    // override or PA audit claim), do NOT mark these losing candidates as
    // claimed — that would silently drop them. Let them fall through to PD so
    // they surface as 'unresolved' (the never-drop / "Needs a role" contract).
    if (slots[role]) return
    for (const c of candidates) claimed.add(c.id)
    if (candidates.length === 1) {
      slots[role] = candidates[0]!.id
    } else if (candidates.length > 1) {
      conflicts.push({ kind: 'duplicate', role, fileIds: candidates.map((f) => f.id) })
    }
  }

  // ── P0. USER OVERRIDES (hard assignments) ─────────────────────
  // A confirmed override claims its slot and is removed from auto-resolution.
  // Overrides without a concrete cy/py/audit role (ignore/unknown) are simply
  // withheld from auto-resolution — the user deliberately parked the file.
  for (const role of ['cy', 'py', 'audit'] as const) {
    claimSlot(role, active.filter((f) => f.override && f.role === role))
  }
  for (const f of active) if (f.override) claimed.add(f.id)

  // ── PA. AUDIT by signal (audited flag OR keyword) ─────────────
  // Claimed before cy/py so an audited file never also contends for them.
  claimSlot('audit', active.filter((f) => !claimed.has(f.id) && isAuditCandidate(f)))

  // ── PB. DETECTED ROLE -> its own slot ─────────────────────────
  for (const role of ['cy', 'py'] as const) {
    claimSlot(role, active.filter((f) => !claimed.has(f.id) && f.role === role))
  }

  // ── PC. DATE/AUDIT FALLBACK for SIGNAL-LESS files only ────────
  // Only 'unknown' files reach here (cy/py/audit were claimed above). Use their
  // in-sheet period-end dates to fill whatever cy/py slots remain empty: latest
  // -> cy, earlier -> py. This is the ONLY place ordering is used.
  let cyResolvedByDate = false
  const unknownPool = active.filter((f) => !claimed.has(f.id))
  const dated = unknownPool
    .filter((f) => !!f.periodEndDate)
    .sort((a, b) =>
      a.periodEndDate! < b.periodEndDate! ? 1 : a.periodEndDate! > b.periodEndDate! ? -1 : 0
    )

  const openSlots = (['cy', 'py'] as const).filter((r) => !slots[r])
  if (openSlots.length === 2 && dated.length >= 2) {
    const [newest, second] = dated
    if (newest!.periodEndDate === second!.periodEndDate) {
      // Two newest share a date — never guess; surface for the user.
      const tiedIds = dated
        .filter((f) => f.periodEndDate === newest!.periodEndDate)
        .map((f) => f.id)
      for (const id of tiedIds) claimed.add(id)
      conflicts.push({ kind: 'ambiguous-period', fileIds: tiedIds })
    } else {
      slots.cy = newest!.id
      slots.py = second!.id
      claimed.add(newest!.id)
      claimed.add(second!.id)
      cyResolvedByDate = true
    }
  } else if (openSlots.length === 2 && dated.length === 1) {
    slots.cy = dated[0]!.id
    claimed.add(dated[0]!.id)
    cyResolvedByDate = true
  } else if (openSlots.length === 1 && dated.length >= 1) {
    // One slot pre-filled above; give the newest remaining dated file the other.
    slots[openSlots[0]!] = dated[0]!.id
    claimed.add(dated[0]!.id)
    if (openSlots[0] === 'cy') cyResolvedByDate = true
  }

  // ── PC.2 LONE SIGNAL-LESS file defaults to CY (per the DECISION) ──
  // "A file with NO role signal still defaults to Current Year." If cy is STILL
  // empty and exactly ONE unknown file remains unclaimed — even with no date —
  // it fills the required cy slot. (With 2+ dateless unknowns we can't pick, so
  // they fall through to 'unresolved' below.)
  if (!slots.cy) {
    // Only truly SIGNAL-LESS leftovers default to cy. A file carrying a real
    // signal that merely lost its slot (e.g. an audited file beaten by an
    // override) is NOT silently repurposed as cy — it falls through to
    // 'unresolved' so the user can re-place it.
    const remaining = active.filter(
      (f) => !claimed.has(f.id) && f.role === 'unknown' && !isAuditCandidate(f)
    )
    if (remaining.length === 1) {
      slots.cy = remaining[0]!.id
      claimed.add(remaining[0]!.id)
      cyResolvedByDate = true
    }
  }

  // ── PD. UNRESOLVED: anything still unclaimed (no slot, no signal) ──
  const unresolved = active.filter((f) => !claimed.has(f.id)).map((f) => f.id)
  if (unresolved.length) conflicts.push({ kind: 'unresolved', fileIds: unresolved })

  // ── PE. MISSING CURRENT YEAR ──────────────────────────────────
  const cyHasConflict =
    conflicts.some((c) => c.kind === 'duplicate' && c.role === 'cy') ||
    (!cyResolvedByDate && conflicts.some((c) => c.kind === 'ambiguous-period'))
  if (!slots.cy && !cyHasConflict) {
    conflicts.push({ kind: 'missing-current' })
  }

  return { slots, conflicts }
}

// ── Period inference ──────────────────────────────────────────
export type PeriodType = 'ytd' | 'mtd' | 'fy'

export interface PeriodInference {
  periodEndDate?: string
  periodType: PeriodType
  fiscalYear?: number
}

/** FL private-school fiscal-year end. */
export const FL_FISCAL_YEAR_END = { month: 6, day: 30 } as const

/** Whether a YYYY-MM-DD string lands on the FL fiscal-year end (Jun 30). */
export function isFiscalYearEnd(date: string): boolean {
  const m = date.match(/^\d{4}-(\d{2})-(\d{2})$/)
  if (!m) return false
  return (
    parseInt(m[1]!, 10) === FL_FISCAL_YEAR_END.month &&
    parseInt(m[2]!, 10) === FL_FISCAL_YEAR_END.day
  )
}

/**
 * Infer reporting period from sheet metadata. periodType is 'fy' when the
 * detected date is the fiscal-year end (Jun 30), else 'ytd' (interim) to
 * match today's default. The user can always override.
 */
export function inferPeriod(metadata?: SheetMetadata): PeriodInference {
  const periodEndDate = metadata?.periodEndDate
  const fiscalYear = metadata?.fiscalYear
  const periodType: PeriodType =
    periodEndDate && isFiscalYearEnd(periodEndDate) ? 'fy' : 'ytd'
  return { periodEndDate, periodType, fiscalYear }
}

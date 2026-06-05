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
// CONTENT-FIRST and BATCH-AWARE: the audited flag picks the audit slot, then
// among the remaining (unaudited) files the LATEST in-sheet period-end date
// becomes cy and the earlier becomes py. The filename/title keyword is kept
// only as corroboration. This differentiates all three sample files even when
// their filenames carry NO role keyword (because PY and Audit share FY25, the
// keyword used to be the only separator — now the audited flag + dates are).
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
 * Resolve a batch of files into single cy/py/audit slots, CONTENT-FIRST.
 *
 * Algorithm:
 *  A. AUDIT: files marked audited (or keyword 'audit') claim the audit slot.
 *     0 -> audit simply empty (audit is optional); 1 -> assigned; >1 -> duplicate.
 *  B. Among the remaining NON-audit, non-ignore files, rank those that carry a
 *     usable period-end date DESC. The latest -> cy, the next-latest -> py.
 *     - two newest share the SAME date -> 'ambiguous-period' (slots empty).
 *     - exactly one dated file -> it is cy (no py).
 *  C. Files with neither a date NOR a usable keyword -> 'unresolved'.
 *  D. If still no cy (and no duplicate/ambiguous covering it) -> 'missing-current'.
 *
 * Back-compat: callers passing bare { id, role } (no dates) fall back to the
 * original keyword mapping, so existing behavior is preserved verbatim.
 */
export function resolveRoles(files: ResolvedFile[]): ResolveResult {
  const slots: { cy?: string; py?: string; audit?: string } = {}
  const conflicts: RoleConflict[] = []

  const active = files.filter((f) => f.role !== 'ignore')

  // ── 0. USER OVERRIDES win first (hard assignments) ────────────
  // A confirmed override claims its slot and is removed from auto-resolution.
  // Duplicate overrides on the same slot surface as a conflict (empty slot).
  const overridden = new Set<string>()
  for (const role of ['cy', 'py', 'audit'] as const) {
    const claimants = active.filter((f) => f.override && f.role === role)
    for (const c of claimants) overridden.add(c.id)
    if (claimants.length === 1) {
      slots[role] = claimants[0]!.id
    } else if (claimants.length > 1) {
      conflicts.push({ kind: 'duplicate', role, fileIds: claimants.map((f) => f.id) })
    }
  }
  // Files the user explicitly set to 'ignore'/'unknown' as an override are
  // simply withheld from auto-resolution (no conflict raised for them).
  for (const f of active) if (f.override) overridden.add(f.id)

  const auto = active.filter((f) => !overridden.has(f.id))

  // ── A. AUDIT slot (content audited flag OR keyword) ──────────
  const auditCandidates = slots.audit ? [] : auto.filter(isAuditCandidate)
  if (auditCandidates.length === 1) {
    slots.audit = auditCandidates[0]!.id
  } else if (auditCandidates.length > 1) {
    conflicts.push({
      kind: 'duplicate',
      role: 'audit',
      fileIds: auditCandidates.map((f) => f.id),
    })
  }
  const auditIds = new Set(auditCandidates.map((f) => f.id))

  // ── B. cy / py among the remaining (non-audit) auto cohort ────
  const cohort = auto.filter((f) => !auditIds.has(f.id))

  // Files that carry a usable in-sheet date drive the content-first split.
  // Slots already filled by a user override are respected: if cy is taken,
  // the newest dated file becomes py; if py is taken, newest becomes cy.
  const dated = cohort
    .filter((f) => !!f.periodEndDate)
    .sort((a, b) => (a.periodEndDate! < b.periodEndDate! ? 1 : a.periodEndDate! > b.periodEndDate! ? -1 : 0))

  let cyResolvedByDate = false
  const openSlots = (['cy', 'py'] as const).filter((r) => !slots[r])

  if (openSlots.length === 2 && dated.length >= 2) {
    const [newest, second] = dated
    if (newest!.periodEndDate === second!.periodEndDate) {
      // Two newest share a date — never guess; surface for the user.
      const tiedIds = dated
        .filter((f) => f.periodEndDate === newest!.periodEndDate)
        .map((f) => f.id)
      conflicts.push({ kind: 'ambiguous-period', fileIds: tiedIds })
    } else {
      slots.cy = newest!.id
      slots.py = second!.id
      cyResolvedByDate = true
    }
  } else if (openSlots.length === 2 && dated.length === 1) {
    slots.cy = dated[0]!.id
    cyResolvedByDate = true
  } else if (openSlots.length === 1 && dated.length >= 1) {
    // One slot pre-filled by an override; assign the newest remaining dated file.
    slots[openSlots[0]!] = dated[0]!.id
    if (openSlots[0] === 'cy') cyResolvedByDate = true
  }

  // ── B'. Keyword fallback for the OPEN slots when NO date is present ──
  // (Pure back-compat path: bare { id, role } callers map keywords directly.)
  if (dated.length === 0) {
    for (const role of (['cy', 'py'] as const).filter((r) => !slots[r])) {
      const claimants = cohort.filter((f) => f.role === role)
      if (claimants.length === 1) {
        slots[role] = claimants[0]!.id
      } else if (claimants.length > 1) {
        conflicts.push({ kind: 'duplicate', role, fileIds: claimants.map((f) => f.id) })
      }
    }
  }

  // ── C. Unresolved: a cohort file that landed in no slot and is not already
  //    flagged. Covers (a) keywordless/dateless files and (b) surplus dated
  //    files beyond cy/py (e.g. a 3rd unaudited statement) — never dropped
  //    silently; the user resolves via chips.
  const placed = new Set<string>([slots.cy, slots.py, slots.audit].filter(Boolean) as string[])
  const tiedAmbig = new Set(
    conflicts.flatMap((c) => (c.kind === 'ambiguous-period' ? c.fileIds : []))
  )
  const dupIds = new Set(
    conflicts.flatMap((c) => (c.kind === 'duplicate' ? c.fileIds : []))
  )
  const unresolved = cohort
    .filter((f) => !placed.has(f.id) && !tiedAmbig.has(f.id) && !dupIds.has(f.id))
    .map((f) => f.id)
  if (unresolved.length) conflicts.push({ kind: 'unresolved', fileIds: unresolved })

  // ── D. Missing current year ───────────────────────────────────
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

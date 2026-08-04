// Phase 2 — PURE roster normalization shared by every LIVE adapter (Blackbaud,
// OneRoster REST, FACTS, Veracross) and the manual path. The API providers are
// customer-gated (no open sandbox for most), so this is the unit-tested seam: an
// adapter reduces its provider JSON to RawStudentRow[], and this module maps grade
// labels → GradeKey and counts the active headcount. Never throws (a bad grade
// degrades to a warning), so a partial roster still imports. Mirrors the OneRoster
// CSV parser's semantics (active headcount, withdrawn split, unknown→warnings).
import { GRADE_KEYS, type GradeKey } from '@finrep/analytics'
import type { EnrollmentProviderKey, NormalizedEnrollmentSnapshot } from '@finrep/db'
import { ONEROSTER_GRADE_MAP } from '@finrep/ingestion/oneroster'

/**
 * One student as seen by a live adapter.
 *
 * The first three fields drive the HEADCOUNT and are all this interface used to
 * carry — which is precisely why a connected school got a number and never a
 * roster: the adapters fetched people and this shape threw the people away.
 *
 * The identity fields are OPTIONAL and stay optional. A provider that returns no
 * names still syncs its headcount exactly as before; one that does lets the sync
 * create the same student records a file upload would. Nothing here is required,
 * so no adapter is broken by the widening.
 *
 * FERPA: these are student names. They travel adapter → sync → StudentsService and
 * stop there, in the same role-gated register the file path writes to. No aggregate,
 * no snapshot, no warning and no audit row may carry one.
 */
export interface RawStudentRow {
  /** Raw grade label/code from the provider ('Grade 9', 'KG', '10th', 'PK4', …). */
  grade?: string | null
  /** Raw status; a withdrawn/inactive student is split into byStatus, not the headcount. */
  status?: string | null
  /** Full-time-equivalent when the provider reports it (averaged into snapshot.fte). */
  fte?: number | null
  /** The provider's own stable id — becomes `externalId`, the re-sync match key. */
  externalId?: string | null
  /** Given name, as the provider spells it. */
  firstName?: string | null
  /** Family name, as the provider spells it. */
  lastName?: string | null
  /** ISO yyyy-mm-dd when the provider returns one; used only as a match fallback. */
  birthDate?: string | null
}

/** Statuses that mean "no longer enrolled" — case-insensitive. */
const DEFAULT_WITHDRAWN = ['inactive', 'withdrawn', 'tobedeleted', 'deleted', 'disabled', 'former']

const lc = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase()

/**
 * Is this provider status "no longer enrolled"?
 *
 * Exported so the RECORD-creating sync and the HEADCOUNT-building snapshot ask the
 * same question of the same row. Re-deriving it at the second call site is how a
 * school ends up with a register that disagrees with its own total — a pupil
 * counted as withdrawn in the headcount and stored as enrolled in the register.
 */
export function isWithdrawnStatus(
  status: string | null | undefined,
  withdrawnStatuses: readonly string[] = DEFAULT_WITHDRAWN,
): boolean {
  const t = lc(status)
  return t !== '' && withdrawnStatuses.some((w) => w.toLowerCase() === t)
}

/**
 * Lenient grade-label → GradeKey mapper covering OneRoster codes AND the free-text
 * labels the SIS REST APIs emit ('Kindergarten', '1st Grade', 'Grade 09', 'Pre-K 4').
 * Order matters: exact OneRoster code first, then PreK tiers, then K, then a numeric
 * fallback (first 1–2 digit run, 1..12). Anything else → null (unknown → warning).
 */
export function gradeKeyFromLabel(raw: string | null | undefined): GradeKey | null {
  if (raw == null) return null
  const t = String(raw).trim()
  if (!t) return null
  // Exact OneRoster grade code (e.g. 'KG', 'PK', '09') — case-tolerant on the alpha codes.
  if (ONEROSTER_GRADE_MAP[t]) return ONEROSTER_GRADE_MAP[t]
  const upper = t.toUpperCase()
  if (ONEROSTER_GRADE_MAP[upper]) return ONEROSTER_GRADE_MAP[upper]

  const s = t.toLowerCase()
  // PreK tiers (check the 3s/4s split BEFORE the generic pre-k catch-all).
  if (/\b(pk\s*3|pre-?k\s*3|preschool\s*3|3-?\s*year|\b3s\b)/.test(s)) return 'PK3'
  if (/\b(pk\s*4|pre-?k\s*4|vpk|tk\b|transitional|4-?\s*year|\b4s\b)/.test(s)) return 'PK4'
  if (/(pre-?k|prekindergarten|preschool|nursery)/.test(s)) return 'PK4'
  // Kindergarten.
  if (/(kindergarten|\bkinder|^k$|^kg$)/.test(s)) return 'K'
  // Numeric grade — first 1–2 digit run, constrained to 1..12.
  const m = /(\d{1,2})/.exec(s)
  if (m) {
    const n = Number(m[1])
    if (n >= 1 && n <= 12) return String(n) as GradeKey
  }
  return null
}

/**
 * Reduce raw student rows to a normalized snapshot: map grades, count the active
 * headcount, split withdrawn into byStatus, and average any FTEs. Unknown grade
 * codes are dropped from byGrade/total but retained in `raw.rawGradeCounts` + a
 * warning, so the total is an honest known-grade headcount.
 */
export function buildNormalizedSnapshot(
  provider: EnrollmentProviderKey,
  rows: RawStudentRow[],
  opts: { observedOn: string; withdrawnStatuses?: string[] },
): NormalizedEnrollmentSnapshot {
  const withdrawnSet = new Set((opts.withdrawnStatuses ?? DEFAULT_WITHDRAWN).map((s) => s.toLowerCase()))
  const byGrade: Partial<Record<GradeKey, number>> = {}
  const rawGradeCounts: Record<string, number> = {}
  const unknownGrades = new Set<string>()
  let totalEnrolled = 0
  let withdrawn = 0
  let fteSum = 0
  let fteCount = 0

  for (const row of rows) {
    const status = lc(row.status)
    if (status && withdrawnSet.has(status)) {
      withdrawn++
      continue
    }
    const label = (row.grade ?? '').trim()
    const bucket = label || '(blank)'
    rawGradeCounts[bucket] = (rawGradeCounts[bucket] ?? 0) + 1

    const gk = gradeKeyFromLabel(label)
    if (!gk) {
      unknownGrades.add(bucket)
      continue
    }
    byGrade[gk] = (byGrade[gk] ?? 0) + 1
    totalEnrolled++
    if (typeof row.fte === 'number' && Number.isFinite(row.fte)) {
      fteSum += row.fte
      fteCount++
    }
  }

  const warnings: string[] = []
  if (unknownGrades.size > 0) {
    warnings.push(
      `Unrecognized grade label(s) not counted in the headcount: ${[...unknownGrades].sort().join(', ')}.`,
    )
  }

  return {
    observedOn: opts.observedOn,
    provider,
    totalEnrolled,
    byGrade,
    byStatus: { enrolled: totalEnrolled, withdrawn },
    fte: fteCount > 0 ? Number((fteSum).toFixed(2)) : null,
    warnings,
    raw: { rawGradeCounts, unknownGrades: [...unknownGrades] },
  }
}

/**
 * Build a snapshot from a hand-entered byGrade map (the manual path). Validates each
 * key is a real GradeKey and each value a non-negative integer; unknown keys are
 * dropped into warnings rather than throwing, so a mostly-valid entry still saves.
 */
export function normalizeManualSnapshot(
  byGradeInput: Record<string, unknown>,
  observedOn: string,
): NormalizedEnrollmentSnapshot {
  const valid = new Set<string>(GRADE_KEYS as readonly string[])
  const byGrade: Partial<Record<GradeKey, number>> = {}
  const warnings: string[] = []
  let totalEnrolled = 0
  for (const [key, raw] of Object.entries(byGradeInput ?? {})) {
    if (!valid.has(key)) {
      warnings.push(`Ignored unknown grade key "${key}".`)
      continue
    }
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) {
      warnings.push(`Ignored non-numeric count for grade "${key}".`)
      continue
    }
    const count = Math.round(n)
    if (count === 0) continue
    byGrade[key as GradeKey] = count
    totalEnrolled += count
  }
  return {
    observedOn,
    provider: 'manual',
    totalEnrolled,
    byGrade,
    byStatus: { enrolled: totalEnrolled },
    fte: null,
    warnings,
  }
}

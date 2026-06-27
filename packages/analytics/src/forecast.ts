// ─────────────────────────────────────────────────────────────
// @finrep/analytics — Phase-2 FY-End Forecast feeder merge.
//
// The ONE analytics addition for the forecast. PURE, TOTAL, NEVER-THROWS.
// Imported by BOTH the API (authoritative server save) AND the web (live
// preview) so the merge cannot drift. driver.ts is UNTOUCHED — the feeder is
// folded into the driver's enrollmentByGrade BEFORE computeDriverBudget runs.
// ─────────────────────────────────────────────────────────────
import { GRADE_KEYS, type GradeKey } from './driver.js'

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/**
 * Merge anticipated feeder enrollment ADDITIVELY into the driver's per-grade
 * enrollment. For each of the 14 GRADE_KEYS the output is
 * `max(0, enrollment[g]) + max(0, feeder[g])`. Keys whose sum is 0 are omitted
 * (so the result stays a sparse Partial map, like the form's input). Only the
 * 14 GRADE_KEYS participate — unknown keys on either input are ignored. Feeder is
 * net-new on top of the revised base enrollment; this raises projected gross
 * tuition through computeDriverBudget's existing tuition = Σ enrollment × rate path.
 */
export function mergeFeederEnrollment(
  enrollmentByGrade: Partial<Record<GradeKey, number>>,
  feeder: Partial<Record<GradeKey, number>> | null | undefined,
): Partial<Record<GradeKey, number>> {
  const out: Partial<Record<GradeKey, number>> = {}
  for (const g of GRADE_KEYS) {
    const sum = Math.max(0, num(enrollmentByGrade?.[g])) + Math.max(0, num(feeder?.[g]))
    if (sum !== 0) out[g] = sum
  }
  return out
}

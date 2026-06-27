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

// ─────────────────────────────────────────────────────────────
// Phase 4 — COHORT GRADE ROLL-FORWARD projection.
//
// Fixes the manual-mode feeder double-count: instead of typing a returning
// roster AND adding feeder on top, the returning roster is COMPUTED by aging
// this year's roster up one grade with retention, dropping the graduating
// cohort, then layering new entrants (= the existing feeder field). Like
// mergeFeederEnrollment this is PURE, TOTAL, NEVER-THROWS, deterministic, and
// reuses GRADE_KEYS as the single source of grade order so it cannot drift.
// ─────────────────────────────────────────────────────────────

const nn = (v: unknown): number => Math.max(0, num(v))
const clampPct = (p: unknown): number => Math.min(100, Math.max(0, num(p)))

/** Input for the pure cohort roll-forward primitive. */
export interface RollForwardInput {
  /** This year's actual enrollment by grade (the cohort being aged up). */
  currentByGrade: Partial<Record<GradeKey, number>>
  /** Default retention %, applied to any grade lacking a per-grade override. 0..100. */
  retentionPct: number
  /** Optional per-grade retention %, keyed by the SOURCE grade (the grade leaving). 0..100. */
  retentionByGrade?: Partial<Record<GradeKey, number>>
  /** New entrants / transfers added at ANY grade (= the feeder field). */
  newEntrantsByGrade?: Partial<Record<GradeKey, number>> | null
  /** Grade whose current cohort GRADUATES OUT (does not roll up). Default '8'. */
  graduatingGrade?: GradeKey
}

/**
 * Age this year's roster forward one grade and add new entrants. For each
 * destination grade i (1..13) exactly one source cohort GRADE_KEYS[i-1] feeds
 * it: `round(current[src] * retOf(src) / 100)` — a SINGLE rounding boundary per
 * grade (no compounding). The graduating grade's cohort exits and never rolls
 * up. The first grade (PK0) has no lower source, so it starts at 0 returning;
 * its only population is new entrants. New entrants are then added at any grade
 * (entry grades get the bulk, transfers allowed anywhere). Result is SPARSE
 * (zeros omitted) — same shape as mergeFeederEnrollment. NEVER throws: retention
 * clamps to [0,100], counts floor at 0, non-finite → 0, unknown keys ignored.
 *
 * Per-grade projected OVERRIDES are NOT applied here — they live in the shared
 * effectiveEnrollment dispatcher so the cohort math stays a clean primitive.
 */
export function rollForwardEnrollment(
  input: RollForwardInput,
): Partial<Record<GradeKey, number>> {
  const current = input?.currentByGrade ?? {}
  const grad: GradeKey = GRADE_KEYS.includes(input?.graduatingGrade as GradeKey)
    ? (input.graduatingGrade as GradeKey)
    : '8'
  const retOf = (g: GradeKey): number =>
    clampPct(input?.retentionByGrade?.[g] ?? input?.retentionPct)

  // 1. Everyone starts at 0 RETURNING.
  const projected: Record<GradeKey, number> = {} as Record<GradeKey, number>
  for (const g of GRADE_KEYS) projected[g] = 0

  // 2. Age-up: each destination grade i gets its single source cohort i-1
  //    (PK0 is never a destination → stays 0 returning). Graduating cohort exits.
  for (let i = 1; i < GRADE_KEYS.length; i++) {
    const src = GRADE_KEYS[i - 1]
    if (src === grad) continue // graduating cohort leaves the school
    projected[GRADE_KEYS[i]] += Math.round((nn(current[src]) * retOf(src)) / 100)
  }

  // 3. New entrants / transfers, additive at any grade.
  const entrants = input?.newEntrantsByGrade
  for (const g of GRADE_KEYS) projected[g] += nn(entrants?.[g])

  // 4. Emit SPARSE (omit zeros).
  const out: Partial<Record<GradeKey, number>> = {}
  for (const g of GRADE_KEYS) if (projected[g] !== 0) out[g] = projected[g]
  return out
}

// ── Shared dispatcher — the ONE source of effectiveEnrollmentByGrade ──────────

export type ProjectionMethod = 'manual' | 'rollforward'

/** Roll-forward config stored inside lines.forecast.rollForward. */
export interface RollForwardConfig {
  currentByGrade: Partial<Record<GradeKey, number>>
  retentionPct: number
  retentionByGrade?: Partial<Record<GradeKey, number>>
  graduatingGrade?: GradeKey
  /** Sparse per-grade REPLACEMENT of the computed projected roster (applied last). */
  projectedOverrideByGrade?: Partial<Record<GradeKey, number>>
}

/** Input to the shared effectiveEnrollment dispatcher (API save + web preview). */
export interface EffectiveEnrollmentInput {
  projectionMethod?: ProjectionMethod | null
  enrollmentByGrade: Partial<Record<GradeKey, number>>
  feederEnrollmentByGrade?: Partial<Record<GradeKey, number>> | null
  rollForward?: RollForwardConfig | null
}

/**
 * The SINGLE source of effectiveEnrollmentByGrade for BOTH the API server save
 * AND the web live preview, so the preview can never drift from what is stored.
 *
 * - manual (missing/unknown/null projectionMethod ⇒ manual): returns
 *   mergeFeederEnrollment(enrollmentByGrade, feederEnrollmentByGrade) EXACTLY as
 *   today — manual-mode math is UNCHANGED.
 * - rollforward: ages the current roster (rollForwardEnrollment), feeding the
 *   feeder field as newEntrantsByGrade, then applies the per-grade override LAST
 *   (a present override key REPLACES the computed value for that grade; clamps
 *   >= 0). assumptions.enrollmentByGrade is DERIVED/IGNORED in this mode.
 *
 * Result is sparse. computeDriverBudget then consumes it as enrollmentByGrade.
 */
export function effectiveEnrollment(
  input: EffectiveEnrollmentInput,
): Partial<Record<GradeKey, number>> {
  const method: ProjectionMethod =
    input?.projectionMethod === 'rollforward' ? 'rollforward' : 'manual'

  if (method === 'manual') {
    return mergeFeederEnrollment(input.enrollmentByGrade, input.feederEnrollmentByGrade)
  }

  const rf: RollForwardConfig = input.rollForward ?? { currentByGrade: {}, retentionPct: 0 }
  const computed = rollForwardEnrollment({
    currentByGrade: rf.currentByGrade,
    retentionPct: rf.retentionPct,
    retentionByGrade: rf.retentionByGrade,
    newEntrantsByGrade: input.feederEnrollmentByGrade,
    graduatingGrade: rf.graduatingGrade,
  })

  // Apply per-grade overrides LAST: a present key replaces the computed value.
  const override = rf.projectedOverrideByGrade
  const out: Partial<Record<GradeKey, number>> = {}
  for (const g of GRADE_KEYS) {
    const v =
      override?.[g] !== undefined ? Math.max(0, num(override[g])) : num(computed[g])
    if (v !== 0) out[g] = v
  }
  return out
}

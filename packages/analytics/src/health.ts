// ─────────────────────────────────────────────────────────────
// Phase 4D — target bands + pure health status.
//
// PURE: no Date, no clock, no random, no IO. Given a metric value and its target
// band, classify it good / watch / risk. Metrics with NO band (contextual ones)
// resolve 'neutral' — no risk coloring.
//
// The DEFAULT_BANDS are SENSIBLE PRIVATE-SCHOOL SECTOR DEFAULTS, documented as
// tunable per-school later — NOT hard truths. Neutrality is decided by ABSENCE
// from DEFAULT_BANDS (e.g. net_tuition_per_student has goodDirection 'higher' but
// is intentionally NEUTRAL: there is no universal $ band).
// ─────────────────────────────────────────────────────────────
import type { HealthStatus, MetricKey, TargetBands } from './types.js'

/**
 * Per-metric target bands. Only the metrics with a universal good/bad appear
 * here; all others are NEUTRAL by absence.
 *
 *   operating_margin (higher):        good >= 0.03,  risk < 0
 *   days_cash_on_hand (higher):       good >= 60,    risk < 30
 *   months_operating_reserve (higher):good >= 6,     risk < 3
 *   tuition_dependency (lower):       good <= 0.70,  risk > 0.85
 *   tuition_discount_rate (lower):    good <= 0.20,  risk > 0.35
 *   enrollment_change_yoy (higher):   good >= 0,     risk < -0.05
 *   student_teacher_ratio (lower):    good <= 12,    risk > 16
 *   teaching_staff_share (higher):    good >= 0.60,  risk < 0.45
 *   forecast_vs_budget_net (higher):  good >= -0.01, risk < -0.05
 *   forecast_operating_margin (higher): good >= 0.03, risk < 0
 *   plan_readiness (higher):          good >= 1,     risk < 0.33
 *
 * Boundary semantics (see TargetBands): `good` inclusive of good, `risk` is the
 * watch/risk frontier and is inclusive of WATCH (exactly == risk lands in watch).
 */
export const DEFAULT_BANDS: Partial<Record<MetricKey, TargetBands>> = {
  operating_margin: { goodDirection: 'higher', good: 0.03, risk: 0 },
  days_cash_on_hand: { goodDirection: 'higher', good: 60, risk: 30 },
  months_operating_reserve: { goodDirection: 'higher', good: 6, risk: 3 },
  tuition_dependency: { goodDirection: 'lower', good: 0.7, risk: 0.85 },
  tuition_discount_rate: { goodDirection: 'lower', good: 0.2, risk: 0.35 },
  // Enrollment (thin wedge): flat-or-growing = good; a single-year decline up to
  // 5% = watch; a steeper-than-5% drop = risk (a genuine revenue-sustainability
  // threat for a tuition-dependent school). Tunable sector default.
  enrollment_change_yoy: { goodDirection: 'higher', good: 0, risk: -0.05 },
  // Enrollment vs plan (Phase 2): within 2% of plan (or above) = good; a shortfall
  // between 2% and 5% below plan = watch; more than 5% below plan = risk (a real
  // tuition-revenue / cash threat — the cross-domain briefing item extends exactly
  // this band). Tunable sector default, mirrors the enrollment_change_yoy scale.
  enrollment_vs_plan: { goodDirection: 'higher', good: -0.02, risk: -0.05 },
  // HR (staffing load): ~12:1 or better = good; a load above 16:1 flags a
  // staffing-load / class-size concern worth a briefing item. Lower is better.
  // TUNABLE SECTOR DEFAULT (like enrollment_change_yoy) — private-school ratios
  // vary widely by model (Montessori/special-ed run low, large schools higher);
  // per-school override deferred. Not a hard truth.
  student_teacher_ratio: { goodDirection: 'lower', good: 12, risk: 16 },
  // HR (staffing composition): ≥60% of all staff FTEs teaching = good; under 45%
  // flags an instructional-vs-overhead composition concern. TUNABLE SECTOR
  // DEFAULT (like student_teacher_ratio) — composition varies widely by model
  // (boarding/large-campus schools run lower); per-school override deferred. Not
  // a hard truth. (total_staff_fte / fte_change_yoy stay NEUTRAL by absence —
  // staffing size/growth has no universal good/bad.)
  teaching_staff_share: { goodDirection: 'higher', good: 0.6, risk: 0.45 },
  // Planning: forecast net within 1% of budgeted revenue of the budgeted net (or
  // better) = good; slipping more than 5% of budgeted revenue below the budgeted
  // net = risk. TUNABLE SECTOR DEFAULT, mirroring the enrollment_vs_plan scale.
  forecast_vs_budget_net: { goodDirection: 'higher', good: -0.01, risk: -0.05 },
  // Planning: the PROJECTED FY-end margin carries operating_margin's exact band —
  // a projected deficit is as actionable as an actual one. (Its own entry, not a
  // shared reference, so the two can be tuned independently later.)
  forecast_operating_margin: { goodDirection: 'higher', good: 0.03, risk: 0 },
  // Planning coverage: ALL three artifacts (budget · forecast · enrollment plan)
  // in place = good; one of three (≤ 1/3) = risk. TUNABLE default.
  plan_readiness: { goodDirection: 'higher', good: 1, risk: 0.33 },
}

/** The target band for a metric, or undefined when the metric is contextual. */
export function bandsFor(key: MetricKey): TargetBands | undefined {
  return DEFAULT_BANDS[key]
}

/**
 * Classify a value against its target band.
 *
 * Returns 'neutral' when the metric is unavailable, the value is null, or there
 * is no band (contextual metric). Otherwise:
 *   higher: value >= good => good; value < risk => risk; else watch.
 *   lower:  value <= good => good; value > risk  => risk; else watch.
 *
 * Boundaries are deterministic: `good` is inclusive of good; the watch/risk
 * frontier (`risk`) is inclusive of WATCH (exactly == risk is watch, never risk).
 */
export function healthStatus(
  value: number | null,
  bands: TargetBands | undefined,
  available: boolean,
): HealthStatus {
  if (!available || value === null || !bands) return 'neutral'
  if (bands.goodDirection === 'higher') {
    if (value >= bands.good) return 'good'
    if (value < bands.risk) return 'risk'
    return 'watch'
  }
  // 'lower'
  if (value <= bands.good) return 'good'
  if (value > bands.risk) return 'risk'
  return 'watch'
}

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

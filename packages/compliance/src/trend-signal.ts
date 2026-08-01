// ─────────────────────────────────────────────────────────────────────────────
// Accreditation Intelligence Phase D — TREND STATISTICS (PURE).
//
// This module is the arithmetic that decides whether a number is allowed to be
// called a trend, and refuses — in four named ways — when it is not.
//
// THE ONE HONESTY RULE THAT GOVERNS EVERY LINE BELOW: the word "trend" is a
// claim about arithmetic, not about a picture, and the product may not use it
// until the arithmetic has earned it — five readings and an exact two-sided
// Mann-Kendall p <= 0.05, on an axis that is not a lie.
//
// THE CONFIDENCE LADDER IS LAW and is a TOTAL function with no gaps:
//   n <= 1              -> 'insufficient'
//   n === 2             -> 'observation'   (the word "trend" is FORBIDDEN)
//   n === 3 or 4        -> 'directional'   (four points can NEVER be significant:
//                                           the smallest reachable two-sided p at
//                                           n=4 is 2/4! = 0.0833)
//   n >= 5 AND exact MK p <= 0.05 -> 'trend'
// There is no other path to 'trend'. A cap may only ever move DOWN the ladder.
//
// WHY THIS LIVES IN `compliance`, NOT `analytics` (F8): compliance already
// depends on analytics and never the reverse, and the Hinnant civil-date helpers
// this module needs already live here in `review-status.ts`. Nothing in
// `packages/analytics` moves. This module imports NO RUNTIME VALUE from
// analytics — types only (`import type`), so tsup's `external` contract holds.
//
// WHAT IT CONSUMES: an already-built `MetricTrend` — a TYPE. That is what makes
// it compose for free with `computeTrend`, with the API's
// `AnalyticsService.trends()`, and with the org rollup: none of them has to
// change, and this module cannot reach into any of them.
//
// THE MONTHLY LIE, REFUSED TWICE. `MonthlySnapshot` is CUMULATIVE YEAR-TO-DATE.
// A month-over-month difference inside one fiscal year is therefore arithmetic
// nonsense — it differences two running totals and calls the result a rate of
// change. Two INDEPENDENT gates refuse it (§1.6): the declared
// `granularity: 'monthly'` label, AND a structural check that no two usable
// readings share a fiscal year. The second gate does not trust the first,
// because `granularity` is OPTIONAL in the type and an unlabelled monthly series
// would otherwise walk straight through.
//
// DETERMINISM / PURITY CONTRACT: obeys the package purity guard verbatim — no
// clock, no randomness, no I/O, no DOM. All time arrives as ISO `yyyy-mm-dd`
// strings and every date computation runs through `daysFromCivil` / `toCivil`
// from `./review-status.js`. `now` is a PARAMETER and is used for ONE thing
// only: `asOfAgeDays`. It never enters the statistics. Throwing is permitted and
// is pure — it is how strict mode reports a caller error (§1.6).
//
// DOCUMENTED LIMITATION (honesty-ledger row 27, in its concrete form). There is
// no registry metric for enrollment LEVEL; only `enrollment_change_yoy`, which
// is already a first difference. A slope over a first difference is a second
// difference ("the decline is accelerating"), which three readings cannot
// support. THEREFORE PHASE D PRODUCES NO TREND CLAIM ABOUT ENROLLMENT HEADCOUNT.
// Headcount reaches the twin as a SIGNAL (from `EnrollmentSnapshot`), and the
// enrollment rules fire off LEVELS and BANDS, never off a slope.
//
// MATERIALITY AND SIGNIFICANCE ARE TWO FIELDS AND ARE NEVER MERGED. Materiality
// governs `direction`; significance governs `confidence`. A `direction:'flat'`
// result at `confidence:'trend'` is legitimate and means "five consistent
// readings, and the movement is still smaller than the floor" — one of the most
// useful sentences this product can say. Do not collapse them.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  GoodDirection,
  MetricKey,
  MetricTrend,
  MetricUnit,
  TargetBands,
} from '@finrep/analytics'
import { daysFromCivil, toCivil, type Civil } from './review-status.js'

// ─────────────────────────────────────────────────────────────────────────────
// §1.2 Constants (exact)
// ─────────────────────────────────────────────────────────────────────────────

export const TREND_SIGNAL_VERSION = '1.0.0'

/** Gregorian mean year. The x axis is fractional YEARS, never the point index. */
export const DAYS_PER_YEAR = 365.2425

/** Two-sided significance level. The ONLY alpha in this program. */
export const MK_ALPHA = 0.05

/**
 * Smallest n at which the exact two-sided test can reach MK_ALPHA at all.
 * n=4 -> min p = 2/4! = 0.0833; n=5 -> min p = 2/5! = 0.0167. Not a taste.
 */
export const MIN_N_FOR_TREND = 5

/** Exact null distribution below this n; normal approximation at or above it. */
export const MIN_N_FOR_NORMAL_APPROX = 9

/** A gap wider than this multiple of the median gap caps confidence at 'directional'. */
export const IRREGULAR_GAP_MULTIPLE = 1.5

/**
 * Points whose calendar month differs from the series' modal month by more than
 * this many months break "same month across FYs" and cap at 'directional'.
 */
export const MONTH_ALIGNMENT_TOLERANCE_MONTHS = 1

/** Horizons beyond one accreditation cycle are not horizons. */
export const MAX_HORIZON_YEARS = 6

/** Float comparison epsilon (mirrors DOMAIN_WEIGHT_EPSILON's precedent). */
export const TREND_EPSILON = 1e-9

/**
 * Maximum number of DISCORDANT PAIRS (inversions) at which the exact two-sided
 * Mann-Kendall p-value is still <= 0.05. Verified against the Mahonian numbers:
 *
 *   n=5 (120 perms):   d=0 -> p=2/120   = 0.016667 OK ; d=1 -> 10/120  = 0.083333 NO
 *   n=6 (720 perms):   d=1 -> p=12/720  = 0.016667 OK ; d=2 -> 40/720  = 0.055556 NO
 *   n=7 (5040 perms):  d=3 -> p=152/5040= 0.030159 OK ; d=4 -> 348/5040= 0.069048 NO
 *   n=8 (40320 perms): d=5 -> p=1256/40320=0.031151 OK; d=6 -> 2460/40320=0.061012 NO
 *
 * PUBLISHED FOR REVIEWABILITY ONLY. `mannKendallExact` does NOT read this table —
 * it computes the p-value from the inversion distribution and compares it to
 * MK_ALPHA. The table exists so a reviewer can check the engine against four
 * hand-verifiable numbers, and a spec asserts the two agree at every n in 5..8.
 */
export const MAX_INVERSIONS_AT_05: Readonly<Record<5 | 6 | 7 | 8, number>> = {
  5: 0,
  6: 1,
  7: 3,
  8: 5,
}

/** The banned word, exported so the copy spec and the engine share one regex. */
export const TREND_WORD = /trend/i

// ─────────────────────────────────────────────────────────────────────────────
// §1.3 MIN_ANNUAL_MOVE — the materiality floor, per metric
// ─────────────────────────────────────────────────────────────────────────────

export type MoveFloor =
  /** Absolute floor in the metric's OWN unit (fractions for 'percent'). */
  | { kind: 'absolute'; value: number; basis: string }
  /** Floor as a fraction of the series' median |value| — for unbounded currency/count metrics. */
  | { kind: 'relative'; fractionOfBaseline: number; basis: string }
  /** The metric may not be trended at all, and the payload says why. */
  | { kind: 'not_eligible'; reason: MetricIneligibility; basis: string }

export type MetricIneligibility =
  /** `value` is a TOTAL, not the thing the unit claims. */
  | 'mix_metric'
  /** Trending it would be a second difference. */
  | 'already_a_delta'
  /** Measures how the school forecasts, not how it performs. */
  | 'forecast_not_actual'
  /** A 4-level ordinal coverage counter, not a quantity. */
  | 'coverage_not_performance'

/**
 * EXHAUSTIVE over MetricKey — a Record, so a 22nd metric fails the BUILD rather
 * than silently defaulting. Same discipline as DOMAIN_TO_MODULE in
 * `metric-gating.ts`.
 *
 * EVERY NUMERIC VALUE BELOW IS A TUNABLE SECTOR DEFAULT, documented as such
 * exactly like DEFAULT_BANDS in `packages/analytics/src/health.ts`. None is a
 * hard truth; each `basis` is the justification sentence, shipped in the payload
 * so the product can explain its own floor.
 *
 * 14 eligible, 7 not.
 */
export const MIN_ANNUAL_MOVE: Readonly<Record<MetricKey, MoveFloor>> = {
  operating_margin: {
    kind: 'absolute',
    value: 0.005,
    basis:
      '0.5 percentage points a year. The band spans risk 0 to good 0.03 — 3 points, crossed in six years, which is one accreditation cycle. Sector default.',
  },
  days_cash_on_hand: {
    kind: 'absolute',
    value: 3,
    basis:
      '3 days a year. The band spans 30 to 60 days, or ten years. Below about 3 days is one payroll run’s timing inside a trial balance. Sector default.',
  },
  months_operating_reserve: {
    kind: 'absolute',
    value: 0.25,
    basis:
      'One week of operating expense a year. The band spans 3 to 6 months, or twelve years. Sector default.',
  },
  tuition_dependency: {
    kind: 'absolute',
    value: 0.01,
    basis: '1 percentage point a year. The band spans 0.70 to 0.85 — 15 points. Sector default.',
  },
  revenue_mix: {
    kind: 'not_eligible',
    reason: 'mix_metric',
    basis:
      'revenueMix.compute returns value = total revenue — a currency total under a share unit label, with goodDirection neutral. Following it over time would follow revenue while the unit claimed a share.',
  },
  expense_mix: {
    kind: 'not_eligible',
    reason: 'mix_metric',
    basis:
      'expenseMix.compute has the identical shape: value = total expense under a share unit label.',
  },
  cost_per_pupil: {
    kind: 'relative',
    fractionOfBaseline: 0.02,
    basis:
      '2% a year. Below general cost inflation a smaller slope is not distinguishable from the price level, and a fixed dollar floor is wrong across an $8k–$30k sector. Sector default.',
  },
  net_tuition_per_student: {
    kind: 'relative',
    fractionOfBaseline: 0.02,
    basis: '2% a year — the same inflation argument as cost per pupil. Sector default.',
  },
  financial_aid_per_student: {
    kind: 'relative',
    fractionOfBaseline: 0.03,
    basis:
      '3% a year. Aid budgets move in discrete board decisions; 3% is the smallest deliberate step a board actually takes. Sector default.',
  },
  aid_per_aided_student: {
    kind: 'relative',
    fractionOfBaseline: 0.03,
    basis: '3% a year — the same board-decision argument as aid per student. Sector default.',
  },
  tuition_discount_rate: {
    kind: 'absolute',
    value: 0.01,
    basis: '1 percentage point a year. The band spans 0.20 to 0.35 — 15 points. Sector default.',
  },
  pct_students_on_aid: {
    kind: 'absolute',
    value: 0.02,
    basis:
      '2 percentage points a year. In a 200-student school that is about four students — the smallest count-driven move that is not one family. Sector default.',
  },
  enrollment_change_yoy: {
    kind: 'not_eligible',
    reason: 'already_a_delta',
    basis:
      'It is already a year-over-year change. A slope over it is a second difference. Enrollment decline is caught as a LEVEL against this metric’s own band and needs no slope.',
  },
  enrollment_vs_plan: {
    kind: 'absolute',
    value: 0.02,
    basis:
      '2 percentage points of plan a year, mirroring its own band scale (good -0.02, risk -0.05). Sector default.',
  },
  student_teacher_ratio: {
    kind: 'absolute',
    value: 0.5,
    basis:
      'Half a student per teacher a year. The band spans 12 to 16, or eight years. Below 0.5 is one FTE rounding in a small school. Sector default.',
  },
  total_staff_fte: {
    kind: 'relative',
    fractionOfBaseline: 0.02,
    basis:
      '2% of median headcount a year; below that is a single part-time contract. goodDirection is neutral, so this is reported as change, never as good or bad. Sector default.',
  },
  fte_change_yoy: {
    kind: 'not_eligible',
    reason: 'already_a_delta',
    basis:
      'It is already a year-over-year change, so a slope over it is a second difference. FTE change is also NOT staff turnover and must never be presented as it.',
  },
  teaching_staff_share: {
    kind: 'absolute',
    value: 0.01,
    basis: '1 percentage point a year. The band spans 0.45 to 0.60 — 15 points. Sector default.',
  },
  forecast_vs_budget_net: {
    kind: 'not_eligible',
    reason: 'forecast_not_actual',
    basis:
      'A slope over forecast variance measures how the school forecasts, not how it performs.',
  },
  forecast_operating_margin: {
    kind: 'not_eligible',
    reason: 'forecast_not_actual',
    basis:
      'It carries operating margin’s exact band — and operating margin is the actual, and is the one we follow. Following both would double-count one fact into two findings against one standard.',
  },
  plan_readiness: {
    kind: 'not_eligible',
    reason: 'coverage_not_performance',
    basis:
      'A 0 / one-third / two-thirds / 1 coverage counter with four reachable values. A median-slope fit over a four-level ordinal is not a rate of change.',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// §1.4 Theil-Sen
// ─────────────────────────────────────────────────────────────────────────────

export interface XY {
  x: number
  y: number
}

export interface TheilSenResult {
  /** Median pairwise slope, in metric units PER YEAR (x is fractional years). */
  slopePerYear: number
  /** Median of (y_i - slope*x_i). The fitted value at x = 0, i.e. at the FIRST point. */
  interceptAtFirst: number
  /** Pairs actually used (pairs with equal x are skipped). */
  pairsUsed: number
}

/**
 * Median of a numeric list. EXPORTED for the spec: the median of an EVEN count is
 * the ARITHMETIC MEAN of the two middle values, never a picked side. Throws on an
 * empty list rather than inventing a number.
 */
export function medianOf(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError('medianOf: empty list')
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  if (n % 2 === 1) return sorted[(n - 1) / 2]
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2
}

/**
 * Theil-Sen: the median of all pairwise slopes.
 *
 * Chosen over least squares because a five-point series with one restated year
 * would let OLS invent a direction; Theil-Sen tolerates roughly 29% contamination
 * and is the estimator that pairs with Mann-Kendall (both are rank-based, so the
 * slope and the significance test agree about what "monotone" means).
 *
 * DETERMINISM: slopes are collected in (i,j) index order, then sorted with a
 * strict numeric comparator; the median of an EVEN count is the arithmetic mean
 * of the two middle values. Pairs with |x_j - x_i| <= TREND_EPSILON are skipped.
 * Fewer than 2 points, or zero usable pairs, THROWS — `computeTrendSignal` never
 * reaches this with fewer than 2 points, and gate 3 guarantees distinct x.
 */
export function theilSen(points: readonly XY[]): TheilSenResult {
  if (points.length < 2) throw new RangeError('theilSen: at least 2 points are required')
  const slopes: number[] = []
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].x - points[i].x
      if (Math.abs(dx) <= TREND_EPSILON) continue
      slopes.push((points[j].y - points[i].y) / dx)
    }
  }
  if (slopes.length === 0) throw new RangeError('theilSen: no usable pairs (all x are identical)')
  const slopePerYear = medianOf(slopes)
  const interceptAtFirst = medianOf(points.map((p) => p.y - slopePerYear * p.x))
  return { slopePerYear, interceptAtFirst, pairsUsed: slopes.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// §1.5 Mann-Kendall — EXACT below n=9
// ─────────────────────────────────────────────────────────────────────────────

export type MannKendallMethod = 'exact' | 'normal'

export interface MannKendallResult {
  n: number
  /** Kendall S = concordant - discordant over all i<j pairs. */
  s: number
  concordant: number
  discordant: number
  /** Pairs with y_j === y_i. Counted, reported, and NEVER silently dropped. */
  tiedPairs: number
  /** Tie-corrected Var(S). Null on the exact path. */
  varS: number | null
  method: MannKendallMethod
  /** Two-sided p-value. */
  p: number
  significant: boolean
}

/**
 * I(n, k) — the number of permutations of n distinct items with exactly k
 * inversions (the Mahonian / Gaussian-binomial triangle), by the integer DP
 *
 *   I(1, 0) = 1
 *   I(n, k) = SUM_{j = 0..min(k, n-1)} I(n-1, k-j)
 *
 * Memoised at module scope. Only ever evaluated for n <= 8, where the largest
 * value is 8! = 40320 — integer arithmetic throughout, no overflow, no float.
 */
const INVERSION_MEMO = new Map<string, number>()

function inversionCount(n: number, k: number): number {
  if (k < 0) return 0
  if (n <= 1) return k === 0 ? 1 : 0
  const key = `${n}:${k}`
  const hit = INVERSION_MEMO.get(key)
  if (hit !== undefined) return hit
  let total = 0
  const upper = Math.min(k, n - 1)
  for (let j = 0; j <= upper; j++) total += inversionCount(n - 1, k - j)
  INVERSION_MEMO.set(key, total)
  return total
}

function factorial(n: number): number {
  let f = 1
  for (let i = 2; i <= n; i++) f *= i
  return f
}

/**
 * Standard normal CDF — Zelen & Severo, Abramowitz & Stegun 26.2.17.
 * |error| < 7.5e-8. Coefficients frozen here so the p-value is reproducible
 * byte-for-byte on any host.
 */
const AS_P = 0.2316419
const AS_B = [0.319381530, -0.356563782, 1.781477937, -1.821255978, 1.330274429] as const

function standardNormalCdf(x: number): number {
  if (x < 0) return 1 - standardNormalCdf(-x)
  const t = 1 / (1 + AS_P * x)
  const pdf = Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI)
  let poly = 0
  let tp = t
  for (const b of AS_B) {
    poly += b * tp
    tp *= t
  }
  return 1 - pdf * poly
}

/**
 * EXACT two-sided Mann-Kendall for n in [2, 8]; tie-corrected normal
 * approximation for n >= MIN_N_FOR_NORMAL_APPROX (9).
 *
 * ── the exact path ─────────────────────────────────────────────────────────
 * With no ties, S = C - D and C + D = N = n(n-1)/2, so D = (N - S)/2, and the
 * null distribution of D is exactly the INVERSION distribution of a uniform
 * random permutation (the Mahonian numbers) computed by `inversionCount`:
 *
 *   d  = ceil((N - |S|) / 2)          // exact when there are no ties
 *   d* = min(d, N - d)
 *   p  = min(1, 2 * SUM_{k = 0..d*} I(n, k) / n!)
 *
 * ── ties on the exact path (frozen, and deliberately CONSERVATIVE) ──────────
 * Ties reduce |S| without reducing N, so `ceil` rounds d UP and the no-tie null
 * (which has LARGER variance than the true tied null) is evaluated at a LARGER
 * d. Both effects push p UP. The exact path with ties therefore UNDER-claims
 * significance and can never manufacture it. Pinned by spec.
 *
 * ── the normal path (n >= 9) ───────────────────────────────────────────────
 *   Var(S) = [ n(n-1)(2n+5) - SUM_g t_g(t_g-1)(2t_g+5) ] / 18   (t_g = tie-group size)
 *   z      = 0 when S = 0, else (S - sign(S)) / sqrt(Var(S))   (continuity correction)
 *   p      = 2 * (1 - PHI(|z|))
 * Var(S) <= 0 (a fully tied series) -> p = 1, significant = false.
 */
export function mannKendallExact(values: readonly number[]): MannKendallResult {
  const n = values.length
  const pairTotal = (n * (n - 1)) / 2

  let concordant = 0
  let discordant = 0
  let tiedPairs = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const diff = values[j] - values[i]
      if (diff > 0) concordant++
      else if (diff < 0) discordant++
      else tiedPairs++
    }
  }
  const s = concordant - discordant

  // Degenerate: fewer than two readings has no pair and therefore no evidence.
  if (n < 2) {
    return { n, s: 0, concordant: 0, discordant: 0, tiedPairs: 0, varS: null, method: 'exact', p: 1, significant: false }
  }

  if (n < MIN_N_FOR_NORMAL_APPROX) {
    const d = Math.ceil((pairTotal - Math.abs(s)) / 2)
    const dStar = Math.min(d, pairTotal - d)
    let cumulative = 0
    for (let k = 0; k <= dStar; k++) cumulative += inversionCount(n, k)
    const p = Math.min(1, (2 * cumulative) / factorial(n))
    return { n, s, concordant, discordant, tiedPairs, varS: null, method: 'exact', p, significant: p <= MK_ALPHA }
  }

  // Normal approximation with the standard tie correction.
  const groups = new Map<number, number>()
  for (const v of values) groups.set(v, (groups.get(v) ?? 0) + 1)
  let tieTerm = 0
  for (const t of groups.values()) {
    if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5)
  }
  const varS = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18
  if (!(varS > 0)) {
    return { n, s, concordant, discordant, tiedPairs, varS, method: 'normal', p: 1, significant: false }
  }
  const z = s === 0 ? 0 : (s - Math.sign(s)) / Math.sqrt(varS)
  const p = Math.min(1, 2 * (1 - standardNormalCdf(Math.abs(z))))
  return { n, s, concordant, discordant, tiedPairs, varS, method: 'normal', p, significant: p <= MK_ALPHA }
}

// ─────────────────────────────────────────────────────────────────────────────
// §1.6 The granularity gate + the fiscal-year helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FY label = the calendar year the June end falls in. The repo's fiscal year runs
 * Jul-Jun, so Jul..Dec belongs to y+1 and Jan..Jun belongs to y.
 * Throws RangeError on an unparseable date — `computeTrendSignal` never calls it
 * with one, because unparseable points are dropped as unusable first.
 */
export function fiscalYearOf(isoDate: string): number {
  const c = toCivil(isoDate)
  if (c === null) throw new RangeError(`fiscalYearOf: unparseable date "${isoDate}"`)
  return fiscalYearOfCivil(c)
}

/** The single implementation of the Jul-Jun rule; `fiscalYearOf` and the point
 *  loop both call it, so the exported helper and the engine can never drift. */
function fiscalYearOfCivil(c: Civil): number {
  return c.m >= 7 ? c.y + 1 : c.y
}

/**
 * Thrown by `computeTrendSignal` in STRICT mode, for the three structural
 * refusals only (`monthly_granularity`, `intra_fy_points`, `duplicate_period_end`).
 * The pure default is `strict: false` — the function never throws unasked. The
 * API passes `strict: process.env.NODE_ENV !== 'production'` so dev and CI blow up
 * loudly while production degrades honestly; reading `process.env` happens in
 * `apps/api`, never here.
 */
export class TrendGranularityError extends Error {
  readonly refusal: TrendRefusal
  readonly detail: string
  constructor(refusal: TrendRefusal, detail: string) {
    super(detail)
    this.name = 'TrendGranularityError'
    this.refusal = refusal
    this.detail = detail
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §1.8 computeTrendSignal — the total function
// ─────────────────────────────────────────────────────────────────────────────

export type TrendConfidence = 'insufficient' | 'observation' | 'directional' | 'trend'
export type TrendDirection = 'improving' | 'declining' | 'flat' | 'unknown'
export type TrendFavourability = 'favourable' | 'unfavourable' | 'neutral'

export type TrendRefusal =
  | 'monthly_granularity'
  | 'intra_fy_points'
  | 'duplicate_period_end'
  | 'metric_not_eligible'
  | 'no_usable_points'

export type TrendCapReason =
  | 'irregular_spacing'
  | 'months_not_aligned'
  | 'not_significant'
  /**
   * DECLARED, NEVER EMITTED. At n = 3-4 the LADDER ITSELF stops at 'directional',
   * so there is nothing to cap and no cap is pushed (see Example A, which pins
   * `caps: []` at n=4). The member exists so a reader of the union sees that
   * "too few readings" is a recognised reason and is handled by the ladder rather
   * than by a cap. A spec asserts it is never emitted.
   */
  | 'below_min_n'

export interface TrendCap {
  reason: TrendCapReason
  from: TrendConfidence
  to: TrendConfidence
  detail: string
  /** Present on `irregular_spacing` only (§1.7). */
  maxGapYears?: number
  /** Present on `irregular_spacing` only (§1.7). */
  medianGapYears?: number
}

export interface TrendSignalOptions {
  /** yyyy-mm-dd. Used ONLY for asOfAgeDays. Never enters the statistics. */
  now: string
  /** Throw TrendGranularityError instead of returning a refusal. Default false. */
  strict?: boolean
  /** Test-only absolute floor override. Production never passes it. */
  minAnnualMoveOverride?: number
}

export interface TrendMateriality {
  floorKind: MoveFloor['kind']
  floor: number | null
  observed: number | null
  met: boolean
  basis: string
}

export interface TrendSignal {
  metric: MetricKey
  label: string
  unit: MetricUnit
  goodDirection: GoodDirection

  eligible: boolean
  refusal: TrendRefusal | null
  /** Frozen sentence, rendered VERBATIM. Never composed by a caller. */
  reason: string | null

  n: number
  droppedPoints: number
  firstDate: string | null
  lastDate: string | null
  spanYears: number | null
  spacing: 'regular' | 'irregular' | 'unknown'
  monthsAligned: boolean
  fiscalYears: number[]

  slopePerYear: number | null
  interceptAtFirst: number | null
  firstValue: number | null
  lastValue: number | null

  direction: TrendDirection
  /** null when goodDirection === 'neutral' — a neutral metric has no favourable side. */
  favourability: TrendFavourability | null
  materiality: TrendMateriality

  mannKendall: MannKendallResult | null
  confidence: TrendConfidence
  /**
   * The ONLY word the UI may use. Equals `confidence` — shipped as its own field
   * so a future confidence value cannot silently unlock the vocabulary.
   */
  vocabulary: TrendConfidence
  caps: TrendCap[]

  asOfAgeDays: number | null
  version: string
}

const CONFIDENCE_RANK: Readonly<Record<TrendConfidence, number>> = {
  insufficient: 0,
  observation: 1,
  directional: 2,
  trend: 3,
}

// ── pure presentation helpers (no locale, no Intl — host-deterministic) ───────

function trimNumber(value: number, dp: number): string {
  let s = value.toFixed(dp)
  if (s.indexOf('.') >= 0) {
    s = s.replace(/0+$/, '')
    s = s.replace(/\.$/, '')
  }
  // Normalise a signed zero so "-0" never reaches copy.
  if (s === '-0') s = '0'
  return s
}

function groupThousands(whole: string): string {
  const negative = whole.startsWith('-')
  const digits = negative ? whole.slice(1) : whole
  let out = ''
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ','
    out += digits[i]
  }
  return negative ? `-${out}` : out
}

/** A metric VALUE in its own unit, for the copy placeholders. */
function formatValue(value: number, unit: MetricUnit): string {
  switch (unit) {
    case 'percent':
    case 'share':
      return `${trimNumber(value * 100, 2)}%`
    case 'days':
      return `${trimNumber(value, 1)} days`
    case 'months':
      return `${trimNumber(value, 2)} months`
    case 'currency':
      return `$${groupThousands(trimNumber(Math.round(value), 0))}`
    case 'ratio':
      return trimNumber(value, 2)
  }
}

/** A MAGNITUDE (a floor or a per-year movement) in the metric's own unit. */
function formatMagnitude(magnitude: number, unit: MetricUnit): string {
  switch (unit) {
    case 'percent':
    case 'share':
      return `${trimNumber(magnitude * 100, 2)} percentage points`
    case 'days':
      return `${trimNumber(magnitude, 1)} days`
    case 'months':
      return `${trimNumber(magnitude, 2)} months`
    case 'currency':
      return `$${groupThousands(trimNumber(Math.round(magnitude), 0))}`
    case 'ratio':
      return trimNumber(magnitude, 2)
  }
}

function formatP(p: number): string {
  if (p < 0.0001) return '<0.0001'
  return trimNumber(p, 4)
}

function fyLabel(fy: number): string {
  return `FY${fy}`
}

// ── frozen copy (§1.10) ──────────────────────────────────────────────────────

const INELIGIBILITY_COPY: Readonly<Record<MetricIneligibility, (label: string) => string>> = {
  mix_metric: (label) => `${label} reports a total, not a rate — there is nothing here to project.`,
  already_a_delta: (label) =>
    `${label} is already a year-over-year change. Projecting a change in a change would not mean anything.`,
  forecast_not_actual: (label) =>
    `${label} is a forecast. Following it over time measures how this school forecasts, not how it performs.`,
  coverage_not_performance: (label) =>
    `${label} counts which planning artifacts exist. It moves in whole steps and is not a quantity to project.`,
}

const MONTHLY_GRANULARITY_COPY =
  'These are month-to-date readings inside one fiscal year. They accumulate, so the differences between them are not comparable — we need one reading per year.'

const HORIZON_NOT_ENOUGH_READINGS = 'Not enough consistent readings to project a date.'
const HORIZON_NOT_MOVING = 'This measure is not moving toward its threshold.'
const HORIZON_NO_BANDS = 'This measure has no target band to breach.'
const HORIZON_ALREADY_PAST =
  'Already below its risk threshold — this is a condition, not a forecast.'
const HORIZON_TOO_FAR = 'Beyond a six-year accreditation cycle — too far out to call.'

// ── internal working shapes ──────────────────────────────────────────────────

interface UsablePoint {
  iso: string
  civil: Civil
  day: number
  value: number
  fy: number
}

function refusalShape(
  trend: MetricTrend,
  floor: MoveFloor,
  refusal: TrendRefusal,
  reason: string,
  droppedPoints: number,
): TrendSignal {
  return {
    metric: trend.metric,
    label: trend.label,
    unit: trend.unit,
    goodDirection: trend.goodDirection,
    eligible: false,
    refusal,
    reason,
    n: 0,
    droppedPoints,
    firstDate: null,
    lastDate: null,
    spanYears: null,
    spacing: 'unknown',
    monthsAligned: true,
    fiscalYears: [],
    slopePerYear: null,
    interceptAtFirst: null,
    firstValue: null,
    lastValue: null,
    direction: 'unknown',
    favourability: null,
    materiality: {
      floorKind: floor.kind,
      floor: null,
      observed: null,
      met: false,
      basis: floor.basis,
    },
    mannKendall: null,
    confidence: 'insufficient',
    vocabulary: 'insufficient',
    caps: [],
    asOfAgeDays: null,
    version: TREND_SIGNAL_VERSION,
  }
}

/**
 * Turn an already-built `MetricTrend` into a statistically honest verdict.
 *
 * The algorithm runs in the frozen order of §1.8 and is TOTAL: every input
 * produces exactly one of a refusal, an `insufficient`, an `observation`, a
 * `directional` or a `trend`. `now` is used for `asOfAgeDays` and nothing else.
 */
export function computeTrendSignal(trend: MetricTrend, opts: TrendSignalOptions): TrendSignal {
  const strict = opts.strict === true
  const floor = MIN_ANNUAL_MOVE[trend.metric]
  const pointCount = trend.points.length

  // ── 1. Eligibility. No points are read. NOT a strict-mode throw: an ineligible
  //       metric is a fact about the catalog, not a caller error.
  if (floor.kind === 'not_eligible') {
    return refusalShape(
      trend,
      floor,
      'metric_not_eligible',
      INELIGIBILITY_COPY[floor.reason](trend.label),
      0,
    )
  }

  // ── 2. Gate 1 — the DECLARED label.
  if (trend.granularity === 'monthly') {
    if (strict) throw new TrendGranularityError('monthly_granularity', MONTHLY_GRANULARITY_COPY)
    return refusalShape(trend, floor, 'monthly_granularity', MONTHLY_GRANULARITY_COPY, pointCount)
  }

  // ── 3. Usable points. Never interpolated, never zero-filled. A point whose
  //       periodEndDate does not parse is unusable too — we will not place a
  //       reading we cannot date on a time axis.
  const usable: UsablePoint[] = []
  for (const p of trend.points) {
    if (p.available !== true) continue
    if (p.value === null || p.value === undefined || !Number.isFinite(p.value)) continue
    const civil = toCivil(p.periodEndDate)
    if (civil === null) continue
    usable.push({
      iso: p.periodEndDate,
      civil,
      day: daysFromCivil(civil.y, civil.m, civil.d),
      value: p.value,
      fy: fiscalYearOfCivil(civil),
    })
  }
  // Defensive re-sort oldest -> newest (computeTrend already does this; a stable
  // comparator keeps equal days in input order so gate 3 is deterministic).
  usable.sort((a, b) => a.day - b.day)
  const n = usable.length
  const droppedPoints = pointCount - n

  // ── 4. No usable points.
  if (n === 0) {
    return refusalShape(
      trend,
      floor,
      'no_usable_points',
      `No readings are available for ${trend.label} yet.`,
      droppedPoints,
    )
  }

  // ── 5. Gate 2 — the STRUCTURAL check, which does not trust the label. Any two
  //       usable readings sharing a fiscal year means we are being handed
  //       within-year rows, whatever `granularity` claimed.
  const fySeen = new Map<number, number>()
  for (const u of usable) fySeen.set(u.fy, (fySeen.get(u.fy) ?? 0) + 1)
  const repeatedFys = [...fySeen.entries()]
    .filter(([, count]) => count > 1)
    .map(([fy]) => fy)
    .sort((a, b) => a - b)
  if (repeatedFys.length > 0) {
    const detail = `Two or more readings fall in the same fiscal year (${repeatedFys
      .map(fyLabel)
      .join(', ')}). We compare the same point of the year across years, never months within one.`
    if (strict) throw new TrendGranularityError('intra_fy_points', detail)
    return refusalShape(trend, floor, 'intra_fy_points', detail, droppedPoints)
  }

  // ── 5b. Gate 3 — defensive. Unreachable after gate 2; specified so the failure
  //        mode is NAMED rather than dividing by zero.
  for (let i = 1; i < n; i++) {
    if (usable[i].day === usable[i - 1].day) {
      const detail = `Two readings share the same period-end date (${usable[i].iso}). We cannot place them on a time axis.`
      if (strict) throw new TrendGranularityError('duplicate_period_end', detail)
      return refusalShape(trend, floor, 'duplicate_period_end', detail, droppedPoints)
    }
  }

  const nowCivil = toCivil(opts.now)
  const nowDays = nowCivil === null ? null : daysFromCivil(nowCivil.y, nowCivil.m, nowCivil.d)
  const first = usable[0]
  const last = usable[n - 1]
  const asOfAgeDays = nowDays === null ? null : nowDays - last.day
  const fiscalYears = usable.map((u) => u.fy)

  // ── 6. n <= 1 -> insufficient. NOT a refusal: the input was valid, the record
  //       is just short.
  if (n <= 1) {
    return {
      metric: trend.metric,
      label: trend.label,
      unit: trend.unit,
      goodDirection: trend.goodDirection,
      eligible: true,
      refusal: null,
      reason: `One reading (${fyLabel(first.fy)}: ${formatValue(first.value, trend.unit)}). We need a second before anything can be said to have moved.`,
      n,
      droppedPoints,
      firstDate: first.iso,
      lastDate: last.iso,
      spanYears: 0,
      spacing: 'unknown',
      monthsAligned: true,
      fiscalYears,
      slopePerYear: null,
      interceptAtFirst: null,
      firstValue: first.value,
      lastValue: last.value,
      direction: 'unknown',
      favourability: null,
      materiality: {
        floorKind: floor.kind,
        floor: null,
        observed: null,
        met: false,
        basis: floor.basis,
      },
      mannKendall: null,
      confidence: 'insufficient',
      vocabulary: 'insufficient',
      caps: [],
      asOfAgeDays,
      version: TREND_SIGNAL_VERSION,
    }
  }

  // ── 7. The x axis in fractional YEARS, spacing, month alignment.
  const xs = usable.map((u) => (u.day - first.day) / DAYS_PER_YEAR)
  const ys = usable.map((u) => u.value)
  const gaps: number[] = []
  for (let i = 1; i < n; i++) gaps.push(xs[i] - xs[i - 1])
  const medianGap = medianOf(gaps)
  const maxGap = Math.max(...gaps)
  let maxGapAt = 0
  for (let i = 0; i < gaps.length; i++) {
    if (gaps[i] > gaps[maxGapAt]) maxGapAt = i
  }
  const spacing: 'regular' | 'irregular' =
    maxGap > IRREGULAR_GAP_MULTIPLE * medianGap + TREND_EPSILON ? 'irregular' : 'regular'

  // Modal calendar month; ties resolve to the SMALLEST month number.
  const monthCounts = new Map<number, number>()
  for (const u of usable) monthCounts.set(u.civil.m, (monthCounts.get(u.civil.m) ?? 0) + 1)
  let modalMonth = 12
  let modalCount = -1
  for (const [month, count] of [...monthCounts.entries()].sort((a, b) => a[0] - b[0])) {
    if (count > modalCount) {
      modalCount = count
      modalMonth = month
    }
  }
  const circularMonthDistance = (a: number, b: number): number => {
    const raw = Math.abs(a - b)
    return Math.min(raw, 12 - raw)
  }
  const monthsAligned = usable.every(
    (u) => circularMonthDistance(u.civil.m, modalMonth) <= MONTH_ALIGNMENT_TOLERANCE_MONTHS,
  )

  const spanYears = xs[n - 1]

  // ── 8. Theil-Sen.
  const fit = theilSen(xs.map((x, i) => ({ x, y: ys[i] })))

  // ── 9. Materiality. Governs DIRECTION only; never confidence.
  const baseline = medianOf(ys.map((v) => Math.abs(v)))
  const noBaseline = floor.kind === 'relative' && Math.abs(baseline) <= TREND_EPSILON
  let materialityFloor: number | null
  let floorKind: MoveFloor['kind'] = floor.kind
  let materialityBasis = floor.basis
  if (opts.minAnnualMoveOverride !== undefined && Number.isFinite(opts.minAnnualMoveOverride)) {
    materialityFloor = Math.abs(opts.minAnnualMoveOverride)
    floorKind = 'absolute'
    materialityBasis = 'Test override: an absolute floor supplied by the caller.'
  } else if (floor.kind === 'absolute') {
    materialityFloor = floor.value
  } else if (noBaseline) {
    materialityFloor = null
  } else {
    materialityFloor = floor.fractionOfBaseline * baseline
  }
  const observed = Math.abs(fit.slopePerYear)
  const materialityMet =
    materialityFloor !== null && observed >= materialityFloor - TREND_EPSILON

  // ── 10. Direction describes the SERIES, not the goodness. `slope > 0 =>
  //        improving` would lie about student_teacher_ratio.
  let direction: TrendDirection
  let favourability: TrendFavourability | null
  if (!materialityMet) {
    direction = 'flat'
    favourability = trend.goodDirection === 'neutral' ? null : 'neutral'
  } else if (trend.goodDirection === 'lower') {
    direction = fit.slopePerYear < 0 ? 'improving' : 'declining'
    favourability = fit.slopePerYear < 0 ? 'favourable' : 'unfavourable'
  } else if (trend.goodDirection === 'higher') {
    direction = fit.slopePerYear > 0 ? 'improving' : 'declining'
    favourability = fit.slopePerYear > 0 ? 'favourable' : 'unfavourable'
  } else {
    // neutral: the words carry NO verdict, so favourability is null.
    direction = fit.slopePerYear > 0 ? 'improving' : 'declining'
    favourability = null
  }

  // ── 11. Mann-Kendall: computed and REPORTED at n >= 3 (so a reader can see why
  //        four points cannot get there), CONSULTED for the ladder only at n >= 5.
  const mk = n >= 3 ? mannKendallExact(ys) : null

  // ── 12. The ladder (total, no gaps).
  const ladder: TrendConfidence =
    n === 2
      ? 'observation'
      : n < MIN_N_FOR_TREND
        ? 'directional'
        : mk !== null && mk.significant
          ? 'trend'
          : 'directional'

  // ── 13. Caps. Monotone DOWNWARD only; each is evaluated against the ceiling the
  //        reading count alone would allow, so a series can record more than one
  //        reason without any cap ever raising a level.
  const ceiling: TrendConfidence = n >= MIN_N_FOR_TREND ? 'trend' : ladder
  const caps: TrendCap[] = []
  if (n >= MIN_N_FOR_TREND && mk !== null && !mk.significant) {
    caps.push({
      reason: 'not_significant',
      from: 'trend',
      to: 'directional',
      detail: `Mann-Kendall p = ${formatP(mk.p)} at n = ${n}; the ladder requires p <= ${MK_ALPHA}.`,
    })
  }
  if (spacing === 'irregular' && CONFIDENCE_RANK[ceiling] > CONFIDENCE_RANK.directional) {
    caps.push({
      reason: 'irregular_spacing',
      from: ceiling,
      to: 'directional',
      detail: `Largest gap ${trimNumber(maxGap, 2)} years against a median of ${trimNumber(medianGap, 2)} years (more than ${IRREGULAR_GAP_MULTIPLE}x).`,
      maxGapYears: maxGap,
      medianGapYears: medianGap,
    })
  }
  if (!monthsAligned && CONFIDENCE_RANK[ceiling] > CONFIDENCE_RANK.directional) {
    caps.push({
      reason: 'months_not_aligned',
      from: ceiling,
      to: 'directional',
      detail: `Readings do not all fall within ${MONTH_ALIGNMENT_TOLERANCE_MONTHS} month of the series' usual month (month ${modalMonth}).`,
    })
  }
  const confidence: TrendConfidence = caps.length > 0 ? 'directional' : ladder

  // ── 15. The frozen sentence for the resulting state.
  const reason = composeReason({
    trend,
    n,
    confidence,
    direction,
    caps,
    mk,
    firstFy: first.fy,
    lastFy: last.fy,
    firstValue: first.value,
    lastValue: last.value,
    slopePerYear: fit.slopePerYear,
    floor,
    floorValue: materialityFloor,
    noBaseline,
    usable,
    maxGapAt,
    maxGap,
  })

  return {
    metric: trend.metric,
    label: trend.label,
    unit: trend.unit,
    goodDirection: trend.goodDirection,
    eligible: true,
    refusal: null,
    reason,
    n,
    droppedPoints,
    firstDate: first.iso,
    lastDate: last.iso,
    spanYears,
    spacing,
    monthsAligned,
    fiscalYears,
    slopePerYear: fit.slopePerYear,
    interceptAtFirst: fit.interceptAtFirst,
    firstValue: first.value,
    lastValue: last.value,
    direction,
    favourability,
    materiality: {
      floorKind,
      floor: materialityFloor,
      observed,
      met: materialityMet,
      basis: materialityBasis,
    },
    mannKendall: mk,
    confidence,
    vocabulary: confidence,
    caps,
    asOfAgeDays,
    version: TREND_SIGNAL_VERSION,
  }
}

interface ReasonInput {
  trend: MetricTrend
  n: number
  confidence: TrendConfidence
  direction: TrendDirection
  caps: TrendCap[]
  mk: MannKendallResult | null
  firstFy: number
  lastFy: number
  firstValue: number
  lastValue: number
  slopePerYear: number
  floor: MoveFloor
  floorValue: number | null
  noBaseline: boolean
  usable: UsablePoint[]
  maxGapAt: number
  maxGap: number
}

/**
 * §1.10 frozen copy. Precedence, in order:
 *   1. no usable baseline (a relative floor over an all-zero series)
 *   2. `direction === 'flat'` — the movement is real-but-immaterial sentence
 *   3. `confidence === 'trend'` — the ONLY sentence permitted to use the word
 *   4. the FIRST cap (push order: not_significant, irregular_spacing, months_not_aligned)
 *   5. the n=2 observation sentence / the n=3-4 directional sentence
 * A spec asserts TREND_WORD.test(reason) === false for every state except (3).
 */
function composeReason(r: ReasonInput): string {
  const { trend, n, direction } = r
  const unit = trend.unit
  const fyFirst = fyLabel(r.firstFy)
  const fyLast = fyLabel(r.lastFy)

  if (r.noBaseline) {
    return `${trend.label} has no usable baseline in this series, so we cannot say whether it moved.`
  }

  if (direction === 'flat') {
    const floorText =
      r.floor.kind === 'relative' && r.floorValue !== null
        ? `${trimNumber(r.floor.fractionOfBaseline * 100, 2)}% of its typical level`
        : formatMagnitude(r.floorValue ?? 0, unit)
    return `${n} readings, ${fyFirst} to ${fyLast}: no movement beyond ${floorText} a year.`
  }

  // A goodDirection 'neutral' metric has no favourable side, so the verdict WORDS
  // may not be used: "Improving" against a $1,000/yr rise in cost per pupil, or
  // against a 3pp/yr rise in tuition dependency, is a false claim in the sentence
  // the spec says is rendered VERBATIM. `favourability: null` is carried in a
  // sibling field and no reader recovers the disclaimer from an adjacent null, so
  // the SENTENCE has to be sign-neutral. `direction` itself is unchanged — the
  // enum still describes the series; only the copy stops passing judgement.
  const directionWordCapped =
    trend.goodDirection === 'neutral'
      ? r.slopePerYear > 0
        ? 'Rising'
        : 'Falling'
      : direction === 'improving'
        ? 'Improving'
        : 'Declining'

  if (r.confidence === 'trend') {
    const slopeText = `${formatMagnitude(Math.abs(r.slopePerYear), unit)} ${r.slopePerYear > 0 ? 'higher' : 'lower'}`
    const p = r.mk === null ? '' : formatP(r.mk.p)
    return `${directionWordCapped} across ${n} readings, ${fyFirst} to ${fyLast} — about ${slopeText} a year (Mann-Kendall p = ${p}). This is a trend.`
  }

  /**
   * The honest sentence for a series that MOVED but did not move CONSISTENTLY.
   * Written once and used twice: by the n>=5 `not_significant` cap, and — since
   * the monotonicity fix below — by any 3-4 point series that is not monotone.
   */
  const notConsistentSentence = (): string => {
    const p = r.mk === null ? '' : formatP(r.mk.p)
    const directionWord = r.slopePerYear > 0 ? 'up' : 'down'
    return `${n} readings, ${fyFirst} to ${fyLast}, moving ${directionWord} but not consistently enough to be distinguished from ordinary variation (p = ${p}).`
  }

  const cap = r.caps[0]
  if (cap !== undefined) {
    if (cap.reason === 'not_significant') {
      return notConsistentSentence()
    }
    if (cap.reason === 'irregular_spacing') {
      const gapFrom = fyLabel(r.usable[r.maxGapAt].fy)
      const gapTo = fyLabel(r.usable[r.maxGapAt + 1].fy)
      return `${n} readings with a ${trimNumber(r.maxGap, 1)}-year gap between ${gapFrom} and ${gapTo}. Unevenly spaced readings can only support a direction.`
    }
    return 'These readings do not fall at the same point of each year, so they can only support a direction.'
  }

  if (n === 2) {
    return `Two readings — ${fyFirst}: ${formatValue(r.firstValue, unit)}, then ${fyLast}: ${formatValue(r.lastValue, unit)}. Two points show a change, not a direction.`
  }

  // "{Direction} in each of {n} readings" is a MONOTONICITY CLAIM, and the engine
  // has the evidence to check it: Mann-Kendall is computed and reported from n=3
  // precisely so a reader can see the weakness. A 3-4 point series that clears the
  // materiality floor is NOT necessarily monotone (95 -> 60 -> 80 fits a declining
  // Theil-Sen slope while the most recent year ROSE 33%), and saying it moved "in
  // each of" its readings would be a false factual claim in the one phase whose
  // point is that the copy may not out-run the arithmetic. When the series is not
  // monotone we fall back to the already-written not-consistent sentence, which is
  // exactly what the n>=5 cap says about the same shape.
  const monotone = r.mk !== null && (r.mk.discordant === 0 || r.mk.concordant === 0)
  if (!monotone) return notConsistentSentence()

  const minP = 2 / factorial(n)
  // Name the readings ACTUALLY needed: at n=3 a fifth reading alone cannot settle
  // anything, because the ladder needs five and the school has three.
  const remaining = MIN_N_FOR_TREND - n
  const remainingWord = remaining === 1 ? 'One' : remaining === 2 ? 'Two' : String(remaining)
  const remainingNoun = remaining === 1 ? 'reading' : 'readings'
  return `${directionWordCapped} in each of ${n} readings, ${fyFirst} to ${fyLast}. With ${n} readings the arithmetic cannot confirm a direction — the smallest result ${n} readings can produce is p = ${formatP(minP)}. ${remainingWord} more ${remainingNoun} can settle it.`
}

// ─────────────────────────────────────────────────────────────────────────────
// §1.9 estimateHorizon — the ONLY sanctioned way to a `periods_to_breach`
// ─────────────────────────────────────────────────────────────────────────────

export type HorizonKind = 'by_date' | 'periods_to_breach' | 'none'

export interface Horizon {
  kind: HorizonKind
  /** yyyy-mm-dd for 'by_date'; a whole number of ANNUAL periods for 'periods_to_breach'; null for 'none'. */
  value: string | number | null
  confidence: TrendConfidence | null
  /** Non-null whenever kind === 'none'. Rendered verbatim. */
  reason: string | null
}

/**
 * A horizon is NEVER emitted below `confidence: 'trend'`. `kind: 'none'` is a
 * legitimate and common answer — requiring a date on every finding is exactly how
 * a product manufactures horizons it cannot support.
 *
 * `kind: 'by_date'` is NEVER produced by this function. Date horizons come from
 * register facts that carry real dates (a strategic plan's end date, a trustee's
 * term end, a maintenance item's target date) and are assembled by the rule
 * engine. Stated here so nobody adds a date extrapolator later.
 */
export function estimateHorizon(
  signal: TrendSignal,
  opts: { currentValue: number | null; bands: TargetBands | undefined },
): Horizon {
  const none = (reason: string): Horizon => ({ kind: 'none', value: null, confidence: null, reason })

  // 1. Below 'trend' there is no projection to make.
  if (signal.confidence !== 'trend') return none(HORIZON_NOT_ENOUGH_READINGS)

  // 2. An immaterial slope is not travel. `direction: 'flat'` means the movement
  //    is smaller than the metric's own floor, whatever its sign.
  if (signal.direction === 'flat' || signal.direction === 'unknown') {
    return none(HORIZON_NOT_MOVING)
  }

  // 3. No band, no breach. The bands are read BEFORE the direction of travel is
  //    decided, because it is the BAND GEOMETRY that says which way is dangerous.
  const bands = opts.bands
  const current = opts.currentValue
  if (bands === undefined || bands === null || current === null) return none(HORIZON_NO_BANDS)

  const slope = signal.slopePerYear
  if (slope === null || !Number.isFinite(slope) || Math.abs(slope) <= TREND_EPSILON) {
    return none(HORIZON_NOT_MOVING)
  }

  // 4. IS THIS SERIES TRAVELLING TOWARD THE RISK SIDE OF ITS BAND?
  //
  //    This used to gate on `signal.direction === 'declining'` — a word derived
  //    from the METRIC's goodDirection — while selecting the threshold from
  //    `bands.goodDirection`. For every metric whose two agree that is the same
  //    question asked twice. For `tuition_dependency` they DISAGREE: the metric is
  //    goodDirection 'neutral' (a documented intentional asymmetry) while its
  //    bands are goodDirection 'lower' (good 0.70, risk 0.85). The result was
  //    inverted in both directions: a school reducing its dependency by 3pp a year
  //    was told it would breach 0.85 in three years, and a school actually rising
  //    toward 0.85 was told it "is not moving toward its threshold".
  //
  //    So: gate on the SIGN OF THE SLOPE against the band's own risk side, and
  //    select the threshold on that same sign. `declining` is then only a label,
  //    never the predicate.
  const riskIsAbove = bands.goodDirection !== 'higher'
  const travellingTowardRisk = riskIsAbove ? slope > 0 : slope < 0
  if (!travellingTowardRisk) return none(HORIZON_NOT_MOVING)

  // 5. The next threshold IN THE DIRECTION OF TRAVEL — nearest first, so a value
  //    still inside the good band meets `good` before it meets `risk`.
  let threshold: number | null = null
  if (riskIsAbove) {
    // Travelling UP toward risk: the SMALLEST threshold strictly above `current`.
    for (const t of [bands.good, bands.risk]) {
      if (t > current + TREND_EPSILON && (threshold === null || t < threshold)) threshold = t
    }
  } else {
    // Travelling DOWN toward risk: the LARGEST threshold strictly below `current`.
    for (const t of [bands.good, bands.risk]) {
      if (t < current - TREND_EPSILON && (threshold === null || t > threshold)) threshold = t
    }
  }
  if (threshold === null) return none(HORIZON_ALREADY_PAST)

  // 6. Years to the threshold at the fitted rate.
  const years = Math.abs(current - threshold) / Math.abs(slope)
  if (!Number.isFinite(years)) return none(HORIZON_NOT_MOVING)

  // 7. Beyond one accreditation cycle is not a horizon.
  if (years > MAX_HORIZON_YEARS) return none(HORIZON_TOO_FAR)

  // 8. A whole number of ANNUAL periods. No probability, no percentage.
  return { kind: 'periods_to_breach', value: Math.ceil(years), confidence: 'trend', reason: null }
}

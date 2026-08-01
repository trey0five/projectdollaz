// AIC Phase D — trend statistics. The confidence ladder is LAW, and this spec is
// where it is enforced. Every worked example from the frozen build spec is pinned
// here with exact expected values, plus property tests that no future change can
// pass while lying about a four-point series.
import { describe, it, expect } from 'vitest'
import type {
  GoodDirection,
  MetricKey,
  MetricTrend,
  MetricUnit,
  TargetBands,
  TrendPoint,
} from '@finrep/analytics'
import {
  DAYS_PER_YEAR,
  IRREGULAR_GAP_MULTIPLE,
  MAX_HORIZON_YEARS,
  MAX_INVERSIONS_AT_05,
  MIN_ANNUAL_MOVE,
  MIN_N_FOR_NORMAL_APPROX,
  MIN_N_FOR_TREND,
  MK_ALPHA,
  TREND_SIGNAL_VERSION,
  TREND_WORD,
  TrendGranularityError,
  computeTrendSignal,
  estimateHorizon,
  fiscalYearOf,
  mannKendallExact,
  medianOf,
  theilSen,
  type TrendSignal,
} from '../src/trend-signal.js'

// ── fixtures ─────────────────────────────────────────────────────────────────

const NOW = '2026-07-31'

function point(periodEndDate: string, value: number | null, available = true): TrendPoint {
  return { periodId: `p-${periodEndDate}`, label: periodEndDate, periodEndDate, value, available }
}

function buildTrend(opts: {
  metric: MetricKey
  label?: string
  unit?: MetricUnit
  goodDirection?: GoodDirection
  granularity?: 'annual' | 'monthly'
  points: TrendPoint[]
}): MetricTrend {
  const t: MetricTrend = {
    metric: opts.metric,
    label: opts.label ?? 'Operating Margin',
    unit: opts.unit ?? 'percent',
    goodDirection: opts.goodDirection ?? 'higher',
    points: opts.points,
  }
  if (opts.granularity !== undefined) t.granularity = opts.granularity
  return t
}

/** June-30 FY ends, one per fiscal year, newest last. */
function annual(
  metric: MetricKey,
  values: number[],
  startFy: number,
  extra: { label?: string; unit?: MetricUnit; goodDirection?: GoodDirection } = {},
): MetricTrend {
  return buildTrend({
    metric,
    label: extra.label,
    unit: extra.unit,
    goodDirection: extra.goodDirection,
    granularity: 'annual',
    points: values.map((v, i) => point(`${startFy + i}-06-30`, v)),
  })
}

/**
 * An ascending series of n values with EXACTLY `inversions` discordant pairs.
 * Moving the value (inversions+1) to the front puts it above exactly that many of
 * the values that follow it, and leaves everything else in order.
 */
function seriesWithInversions(n: number, inversions: number): number[] {
  if (inversions === 0) return Array.from({ length: n }, (_, i) => i + 1)
  const rest: number[] = []
  for (let v = 1; v <= n; v++) if (v !== inversions + 1) rest.push(v)
  return [inversions + 1, ...rest]
}

// ─────────────────────────────────────────────────────────────────────────────
describe('medianOf', () => {
  it('odd count returns the middle value', () => {
    expect(medianOf([3, 1, 2])).toBe(2)
  })
  it('EVEN count returns the arithmetic MEAN of the two middle values, never a side', () => {
    expect(medianOf([1, 2, 3, 4])).toBe(2.5)
    expect(medianOf([4, 3, 2, 1])).toBe(2.5)
  })
  it('is order-independent (deterministic sort)', () => {
    expect(medianOf([9, -1, 4, 4, 100])).toBe(medianOf([100, 4, 4, -1, 9]))
  })
  it('throws on an empty list rather than inventing a number', () => {
    expect(() => medianOf([])).toThrow(RangeError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('theilSen', () => {
  it('recovers an exact slope and intercept from a perfectly linear series', () => {
    const r = theilSen([
      { x: 0, y: 10 },
      { x: 1, y: 12 },
      { x: 2, y: 14 },
      { x: 3, y: 16 },
    ])
    expect(r.slopePerYear).toBeCloseTo(2, 12)
    expect(r.interceptAtFirst).toBeCloseTo(10, 12)
    expect(r.pairsUsed).toBe(6)
  })

  it('tolerates one restated year that would drag an OLS fit (breakdown ~29%)', () => {
    // Five points on a line of slope -1, with the LAST one restated to +52.
    // An end-point outlier is exactly the case that levers a least-squares fit.
    const clean = [0, 1, 2, 3, 4].map((x) => ({ x, y: 100 - x }))
    const dirty = clean.map((p, i) => (i === 4 ? { x: p.x, y: 148 } : p))
    expect(theilSen(dirty).slopePerYear).toBeLessThan(0)
    // Least squares over the same points would have flipped the sign:
    const meanX = 2
    const meanY = dirty.reduce((a, p) => a + p.y, 0) / 5
    const ols =
      dirty.reduce((a, p) => a + (p.x - meanX) * (p.y - meanY), 0) /
      dirty.reduce((a, p) => a + (p.x - meanX) ** 2, 0)
    expect(ols).toBeGreaterThan(0)
  })

  it('skips pairs with identical x and throws when none is usable', () => {
    expect(() => theilSen([{ x: 1, y: 1 }, { x: 1, y: 5 }])).toThrow(RangeError)
    expect(() => theilSen([{ x: 0, y: 1 }])).toThrow(RangeError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('mannKendallExact — the exact null distribution below n = 9', () => {
  const cases: Array<[number, number, number, number, boolean, string]> = [
    // n, inversions, expected |S|, expected p, significant, note
    [2, 0, 1, 2 / 2, false, 'two points'],
    [3, 0, 3, 2 / 6, false, 'three points'],
    [4, 0, 6, 2 / 24, false, 'FOUR POINTS CAN NEVER BE SIGNIFICANT'],
    [5, 0, 10, 2 / 120, true, 'five monotone points — the first reachable p'],
    [5, 1, 8, 10 / 120, false, 'one inversion at n=5'],
    [6, 1, 13, 12 / 720, true, 'one inversion at n=6'],
    [6, 2, 11, 40 / 720, false, 'two inversions at n=6'],
    [7, 3, 15, 152 / 5040, true, 'three inversions at n=7'],
    [7, 4, 13, 348 / 5040, false, 'four inversions at n=7'],
    [8, 5, 18, 1256 / 40320, true, 'five inversions at n=8'],
    [8, 6, 16, 2460 / 40320, false, 'six inversions at n=8'],
  ]

  for (const [n, inv, absS, p, significant, note] of cases) {
    it(`n=${n}, d=${inv}: |S|=${absS}, p=${p.toFixed(6)}, significant=${significant} (${note})`, () => {
      const up = seriesWithInversions(n, inv)
      const rUp = mannKendallExact(up)
      expect(rUp.n).toBe(n)
      expect(rUp.discordant).toBe(inv)
      expect(rUp.s).toBe(absS)
      expect(rUp.tiedPairs).toBe(0)
      expect(rUp.method).toBe('exact')
      expect(rUp.varS).toBeNull()
      expect(rUp.p).toBeCloseTo(p, 6)
      expect(rUp.significant).toBe(significant)

      // The test is two-sided: mirroring the series must give -S and the same p.
      const rDown = mannKendallExact(up.map((v) => -v))
      expect(rDown.s).toBe(-absS)
      expect(rDown.p).toBeCloseTo(p, 6)
      expect(rDown.significant).toBe(significant)
    })
  }

  it('the five-point monotone p is 0.0166667 — the acceptance value', () => {
    expect(mannKendallExact([95, 88, 80, 71, 60]).p).toBeCloseTo(0.0166667, 7)
  })

  it('a fully tied series is capped at p = 1 and is never significant', () => {
    const r = mannKendallExact([7, 7, 7, 7, 7])
    expect(r.s).toBe(0)
    expect(r.concordant).toBe(0)
    expect(r.discordant).toBe(0)
    expect(r.tiedPairs).toBe(10) // counted and REPORTED, never silently dropped
    expect(r.p).toBeCloseTo(1, 6)
    expect(r.significant).toBe(false)
  })

  it('ties on the exact path are CONSERVATIVE — they can never manufacture significance', () => {
    const clean = mannKendallExact([1, 2, 3, 4, 5])
    const tied = mannKendallExact([1, 2, 2, 4, 5])
    expect(clean.significant).toBe(true)
    expect(tied.tiedPairs).toBe(1)
    expect(tied.p).toBeGreaterThan(clean.p) // ties push p UP, never down
    expect(tied.significant).toBe(false)
  })

  it('agrees with the published MAX_INVERSIONS_AT_05 table at every n in 5..8', () => {
    for (const nKey of [5, 6, 7, 8] as const) {
      const limit = MAX_INVERSIONS_AT_05[nKey]
      expect(mannKendallExact(seriesWithInversions(nKey, limit)).significant).toBe(true)
      expect(mannKendallExact(seriesWithInversions(nKey, limit + 1)).significant).toBe(false)
    }
  })

  it('switches to the tie-corrected normal approximation at n >= 9', () => {
    const r = mannKendallExact([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(r.method).toBe('normal')
    expect(r.n).toBeGreaterThanOrEqual(MIN_N_FOR_NORMAL_APPROX)
    expect(r.s).toBe(45)
    expect(r.varS).toBeCloseTo(125, 9) // 10*9*25 / 18
    expect(r.p).toBeLessThan(MK_ALPHA)
    expect(r.significant).toBe(true)
  })

  it('normal path: a fully tied series has Var(S) <= 0 -> p = 1', () => {
    const r = mannKendallExact(new Array(10).fill(3))
    expect(r.method).toBe('normal')
    expect(r.varS).toBeLessThanOrEqual(0)
    expect(r.p).toBe(1)
    expect(r.significant).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('fiscalYearOf — the repo FY is Jul-Jun', () => {
  it('a June end belongs to its own calendar year', () => {
    expect(fiscalYearOf('2026-06-30')).toBe(2026)
    expect(fiscalYearOf('2026-01-01')).toBe(2026)
  })
  it('July-December belongs to y+1', () => {
    expect(fiscalYearOf('2025-07-01')).toBe(2026)
    expect(fiscalYearOf('2025-12-31')).toBe(2026)
  })
  it('throws on an unparseable date rather than guessing', () => {
    expect(() => fiscalYearOf('not-a-date')).toThrow(RangeError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('MIN_ANNUAL_MOVE', () => {
  it('is exhaustive over the 21 registry metrics: 14 eligible, 7 not', () => {
    const entries = Object.entries(MIN_ANNUAL_MOVE)
    expect(entries).toHaveLength(21)
    const notEligible = entries.filter(([, f]) => f.kind === 'not_eligible')
    expect(notEligible).toHaveLength(7)
    expect(notEligible.map(([k]) => k).sort()).toEqual([
      'enrollment_change_yoy',
      'expense_mix',
      'forecast_operating_margin',
      'forecast_vs_budget_net',
      'fte_change_yoy',
      'plan_readiness',
      'revenue_mix',
    ])
  })

  it('every entry ships a non-empty justification the product can render', () => {
    for (const [key, floor] of Object.entries(MIN_ANNUAL_MOVE)) {
      expect(floor.basis.length, key).toBeGreaterThan(20)
    }
  })

  it('pins the frozen floors', () => {
    expect(MIN_ANNUAL_MOVE.operating_margin).toMatchObject({ kind: 'absolute', value: 0.005 })
    expect(MIN_ANNUAL_MOVE.days_cash_on_hand).toMatchObject({ kind: 'absolute', value: 3 })
    expect(MIN_ANNUAL_MOVE.months_operating_reserve).toMatchObject({ kind: 'absolute', value: 0.25 })
    expect(MIN_ANNUAL_MOVE.student_teacher_ratio).toMatchObject({ kind: 'absolute', value: 0.5 })
    expect(MIN_ANNUAL_MOVE.cost_per_pupil).toMatchObject({ kind: 'relative', fractionOfBaseline: 0.02 })
    expect(MIN_ANNUAL_MOVE.financial_aid_per_student).toMatchObject({ kind: 'relative', fractionOfBaseline: 0.03 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Example A — the four-point declining series (acceptance 1a)', () => {
  const trend = annual('operating_margin', [0.06, 0.045, 0.03, 0.015], 2023)
  const sig = computeTrendSignal(trend, { now: NOW })

  it('is eligible and reads all four points', () => {
    expect(sig.eligible).toBe(true)
    expect(sig.refusal).toBeNull()
    expect(sig.n).toBe(4)
    expect(sig.droppedPoints).toBe(0)
    expect(sig.fiscalYears).toEqual([2023, 2024, 2025, 2026])
  })

  it('fits the Theil-Sen slope over a fractional-YEAR axis', () => {
    // Day offsets 0, 366 (2024 is a leap year), 731, 1096.
    expect(sig.slopePerYear).toBeCloseTo(-0.01500312, 8)
    expect(sig.slopePerYear).toBeCloseTo(-0.015, 5)
    expect(sig.spanYears).toBeCloseTo(1096 / DAYS_PER_YEAR, 8)
  })

  it('reports Mann-Kendall at n=4 so a reader can SEE why four points cannot get there', () => {
    expect(sig.mannKendall).not.toBeNull()
    expect(sig.mannKendall!.s).toBe(-6)
    expect(sig.mannKendall!.discordant).toBe(6)
    expect(sig.mannKendall!.concordant).toBe(0)
    expect(sig.mannKendall!.method).toBe('exact')
    expect(sig.mannKendall!.p).toBeCloseTo(0.0833333, 6)
    expect(sig.mannKendall!.significant).toBe(false)
  })

  it('the movement clears the 0.5pp materiality floor', () => {
    expect(sig.materiality.floorKind).toBe('absolute')
    expect(sig.materiality.floor).toBe(0.005)
    expect(sig.materiality.met).toBe(true)
    expect(sig.direction).toBe('declining')
    expect(sig.favourability).toBe('unfavourable')
  })

  it('spacing is regular (gaps 1.00207, 0.99934, 0.99934)', () => {
    expect(sig.spacing).toBe('regular')
    expect(sig.monthsAligned).toBe(true)
  })

  it('STOPS AT directional, with NO cap — the ladder alone does it at n=4', () => {
    expect(sig.confidence).toBe('directional')
    expect(sig.vocabulary).toBe('directional')
    expect(sig.caps).toEqual([])
  })

  it('the copy NEVER uses the word', () => {
    expect(sig.reason).not.toBeNull()
    expect(TREND_WORD.test(sig.reason!)).toBe(false)
    expect(sig.reason).toContain('the smallest result 4 readings can produce is p = 0.0833')
  })

  it('emits no horizon', () => {
    expect(estimateHorizon(sig, { currentValue: 0.015, bands: { goodDirection: 'higher', good: 0.03, risk: 0 } })).toEqual({
      kind: 'none',
      value: null,
      confidence: null,
      reason: 'Not enough consistent readings to project a date.',
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Example B — the five-point monotone series (acceptance 1b)', () => {
  const trend = annual('days_cash_on_hand', [95, 88, 80, 71, 60], 2022, {
    label: 'Days Cash on Hand',
    unit: 'days',
    goodDirection: 'higher',
  })
  const sig = computeTrendSignal(trend, { now: NOW })

  it('uses all five readings', () => {
    expect(sig.n).toBe(5)
    expect(sig.fiscalYears).toEqual([2022, 2023, 2024, 2025, 2026])
    expect(sig.firstDate).toBe('2022-06-30')
    expect(sig.lastDate).toBe('2026-06-30')
  })

  it('fits the ten pairwise slopes and takes the mean of the two middle ones', () => {
    // x = 0, 0.99933606, 2.00141002, 3.00074608, 4.00008214 (day offsets 0/365/731/1096/1461).
    // Sorted pairwise slopes:
    //  -11.007308219, -10.006643836, -9.331012774, -9.005979452, -8.749820329,
    //   -8.494011628,  -7.998010949, -7.983442623, -7.494716142, -7.004650685
    // median = (-8.749820329 + -8.494011628) / 2 = -8.621915978
    expect(sig.slopePerYear).toBeCloseTo(-8.621915978, 9)
    // intercept = median of the residuals y_i - slope*x_i
    expect(sig.interceptAtFirst).toBeCloseTo(96.616191522, 9)
  })

  it('the exact Mann-Kendall p is 0.0167 — the acceptance value', () => {
    expect(sig.mannKendall!.s).toBe(-10)
    expect(sig.mannKendall!.discordant).toBe(10)
    expect(sig.mannKendall!.concordant).toBe(0)
    expect(sig.mannKendall!.tiedPairs).toBe(0)
    expect(sig.mannKendall!.method).toBe('exact')
    expect(sig.mannKendall!.p).toBeCloseTo(0.0166667, 7)
    expect(sig.mannKendall!.significant).toBe(true)
  })

  it('clears the 3-day floor and is unfavourable', () => {
    expect(sig.materiality.floor).toBe(3)
    expect(sig.materiality.observed).toBeCloseTo(8.621915978, 9)
    expect(sig.materiality.met).toBe(true)
    expect(sig.direction).toBe('declining')
    expect(sig.favourability).toBe('unfavourable')
  })

  it('EARNS the word: confidence trend, no caps', () => {
    expect(sig.spacing).toBe('regular')
    expect(sig.monthsAligned).toBe(true)
    expect(sig.confidence).toBe('trend')
    expect(sig.vocabulary).toBe('trend')
    expect(sig.caps).toEqual([])
    expect(sig.reason).toContain('This is a trend.')
    expect(sig.reason).toContain('Mann-Kendall p = 0.0167')
  })

  it('projects a whole number of ANNUAL periods to the risk threshold', () => {
    const bands: TargetBands = { goodDirection: 'higher', good: 60, risk: 30 }
    // Next threshold below 60 is risk = 30; 30 / 8.621915978 = 3.4795 years -> 4 periods.
    expect(estimateHorizon(sig, { currentValue: 60, bands })).toEqual({
      kind: 'periods_to_breach',
      value: 4,
      confidence: 'trend',
      reason: null,
    })
  })

  it('stamps the version and the age of the newest reading', () => {
    expect(sig.version).toBe(TREND_SIGNAL_VERSION)
    expect(sig.asOfAgeDays).toBe(31) // 2026-06-30 -> 2026-07-31
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Example C — the irregular-gap cap', () => {
  const trend = buildTrend({
    metric: 'days_cash_on_hand',
    label: 'Days Cash on Hand',
    unit: 'days',
    goodDirection: 'higher',
    granularity: 'annual',
    points: [
      point('2019-06-30', 95),
      point('2020-06-30', 88),
      point('2021-06-30', 80),
      point('2025-06-30', 71),
      point('2026-06-30', 60),
    ],
  })
  const sig = computeTrendSignal(trend, { now: NOW })

  it('detects the four-year hole against a one-year median gap', () => {
    // gaps 1.00207395, 0.99933606, 4.00008213, 0.99933606
    // median = (0.99933606 + 1.00207395)/2 = 1.00070501; 1.5x = 1.50105751
    expect(sig.spacing).toBe('irregular')
    expect(sig.caps).toHaveLength(1)
    expect(sig.caps[0].reason).toBe('irregular_spacing')
    expect(sig.caps[0].from).toBe('trend')
    expect(sig.caps[0].to).toBe('directional')
    expect(sig.caps[0].maxGapYears).toBeCloseTo(4.00008213, 6)
    expect(sig.caps[0].medianGapYears).toBeCloseTo(1.00070501, 6)
  })

  it('Mann-Kendall still says significant — and the cap OVERRULES it', () => {
    expect(sig.mannKendall!.p).toBeCloseTo(0.0166667, 7)
    expect(sig.mannKendall!.significant).toBe(true)
    expect(sig.confidence).toBe('directional')
    expect(sig.vocabulary).toBe('directional')
  })

  it('and the copy therefore never uses the word', () => {
    expect(TREND_WORD.test(sig.reason!)).toBe(false)
    expect(sig.reason).toContain('4-year gap between FY2021 and FY2025')
  })

  it('and no horizon is projected', () => {
    expect(estimateHorizon(sig, { currentValue: 60, bands: { goodDirection: 'higher', good: 60, risk: 30 } }).kind).toBe('none')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Example D — the monthly refusal (acceptance 2)', () => {
  // Twelve cumulative year-to-date readings, all inside FY2026.
  const monthlyPoints = [
    '2025-07-31', '2025-08-31', '2025-09-30', '2025-10-31', '2025-11-30', '2025-12-31',
    '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30',
  ].map((d, i) => point(d, 0.01 * (i + 1)))

  it('refuses on the DECLARED label (gate 1)', () => {
    const trend = buildTrend({ metric: 'operating_margin', granularity: 'monthly', points: monthlyPoints })
    const sig = computeTrendSignal(trend, { now: NOW })
    expect(sig.eligible).toBe(false)
    expect(sig.refusal).toBe('monthly_granularity')
    expect(sig.confidence).toBe('insufficient')
    expect(sig.direction).toBe('unknown')
    expect(sig.n).toBe(0)
    expect(sig.slopePerYear).toBeNull()
    expect(sig.mannKendall).toBeNull()
    expect(sig.reason).toContain('They accumulate')
    expect(TREND_WORD.test(sig.reason!)).toBe(false)
  })

  it('THROWS in strict mode (dev/CI blow up loudly, production degrades honestly)', () => {
    const trend = buildTrend({ metric: 'operating_margin', granularity: 'monthly', points: monthlyPoints })
    expect(() => computeTrendSignal(trend, { now: NOW, strict: true })).toThrow(TrendGranularityError)
    try {
      computeTrendSignal(trend, { now: NOW, strict: true })
    } catch (e) {
      expect((e as TrendGranularityError).refusal).toBe('monthly_granularity')
      expect((e as TrendGranularityError).name).toBe('TrendGranularityError')
    }
  })

  it('GATE 2 catches the SAME rows with the granularity label deleted', () => {
    // This is the whole point of the structural gate: the label is optional in
    // the type, so it may not be trusted with the law on its own.
    const trend = buildTrend({ metric: 'operating_margin', points: monthlyPoints })
    expect(trend.granularity).toBeUndefined()
    const sig = computeTrendSignal(trend, { now: NOW })
    expect(sig.refusal).toBe('intra_fy_points')
    expect(sig.eligible).toBe(false)
    expect(sig.n).toBe(0)
    expect(sig.reason).toContain('FY2026')
    expect(TREND_WORD.test(sig.reason!)).toBe(false)
    expect(() => computeTrendSignal(trend, { now: NOW, strict: true })).toThrow(TrendGranularityError)
  })

  it('two annual-looking readings inside one FY are still refused', () => {
    const trend = buildTrend({
      metric: 'operating_margin',
      granularity: 'annual',
      points: [point('2025-06-30', 0.05), point('2025-12-31', 0.04), point('2026-06-30', 0.03)],
    })
    // 2025-12-31 and 2026-06-30 are both FY2026.
    expect(computeTrendSignal(trend, { now: NOW }).refusal).toBe('intra_fy_points')
  })

  it('names duplicate period ends rather than dividing by zero (defensive gate 3)', () => {
    // Gate 2 catches same-FY duplicates first; gate 3 is reached only if that
    // ever changes, so it is asserted through the exported error contract.
    const trend = buildTrend({
      metric: 'operating_margin',
      granularity: 'annual',
      points: [point('2025-06-30', 0.05), point('2025-06-30', 0.04)],
    })
    const sig = computeTrendSignal(trend, { now: NOW })
    expect(['intra_fy_points', 'duplicate_period_end']).toContain(sig.refusal)
    expect(sig.eligible).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Example E — the two-point observation', () => {
  const trend = annual('operating_margin', [0.05, 0.02], 2025)
  const sig = computeTrendSignal(trend, { now: NOW })

  it('is an observation, not a direction, and reports NO Mann-Kendall', () => {
    expect(sig.n).toBe(2)
    expect(sig.confidence).toBe('observation')
    expect(sig.vocabulary).toBe('observation')
    expect(sig.mannKendall).toBeNull()
    expect(sig.caps).toEqual([])
  })

  it('still reports the series direction and favourability', () => {
    expect(sig.direction).toBe('declining')
    expect(sig.favourability).toBe('unfavourable')
  })

  it('says "Two points show a change, not a direction." and never uses the word', () => {
    expect(sig.reason).toBe(
      'Two readings — FY2025: 5%, then FY2026: 2%. Two points show a change, not a direction.',
    )
    expect(TREND_WORD.test(sig.reason!)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the ladder is a TOTAL function', () => {
  it('n = 0 usable points -> refusal, not a crash', () => {
    const trend = buildTrend({
      metric: 'operating_margin',
      granularity: 'annual',
      points: [point('2025-06-30', null), point('2026-06-30', 0.02, false)],
    })
    const sig = computeTrendSignal(trend, { now: NOW })
    expect(sig.refusal).toBe('no_usable_points')
    expect(sig.droppedPoints).toBe(2)
    expect(sig.reason).toContain('No readings are available for')
  })

  it('n = 1 -> insufficient, and insufficient is NOT a refusal', () => {
    const trend = annual('operating_margin', [0.05], 2026)
    const sig = computeTrendSignal(trend, { now: NOW })
    expect(sig.eligible).toBe(true)
    expect(sig.refusal).toBeNull()
    expect(sig.confidence).toBe('insufficient')
    expect(sig.direction).toBe('unknown')
    expect(sig.favourability).toBeNull()
    expect(sig.mannKendall).toBeNull()
    expect(sig.reason).toContain('We need a second before anything can be said to have moved.')
  })

  it('unavailable and null points are DROPPED, never interpolated or zero-filled', () => {
    const trend = buildTrend({
      metric: 'operating_margin',
      granularity: 'annual',
      points: [
        point('2022-06-30', 0.06),
        point('2023-06-30', null),
        point('2024-06-30', 0.04, false),
        point('2025-06-30', 0.03),
        point('2026-06-30', 0.02),
      ],
    })
    const sig = computeTrendSignal(trend, { now: NOW })
    expect(sig.n).toBe(3)
    expect(sig.droppedPoints).toBe(2)
    expect(sig.fiscalYears).toEqual([2022, 2025, 2026])
  })

  it('n = 5 but NOT significant -> directional with a not_significant cap', () => {
    // 4 down, 1 up: one inversion at n=5 -> p = 0.0833.
    const trend = annual('days_cash_on_hand', [95, 88, 80, 71, 74], 2022, {
      label: 'Days Cash on Hand', unit: 'days',
    })
    const sig = computeTrendSignal(trend, { now: NOW })
    expect(sig.mannKendall!.significant).toBe(false)
    expect(sig.confidence).toBe('directional')
    expect(sig.caps.map((c) => c.reason)).toEqual(['not_significant'])
    expect(sig.caps[0].from).toBe('trend')
    expect(sig.caps[0].to).toBe('directional')
    expect(TREND_WORD.test(sig.reason!)).toBe(false)
    expect(sig.reason).toContain('ordinary variation')
  })

  it('a cap NEVER lowers below observation and is never emitted at n <= 4', () => {
    // Two readings, wildly irregular months — still 'observation', still no cap.
    const trend = buildTrend({
      metric: 'operating_margin',
      granularity: 'annual',
      points: [point('2024-12-31', 0.05), point('2026-06-30', 0.02)],
    })
    const sig = computeTrendSignal(trend, { now: NOW })
    expect(sig.confidence).toBe('observation')
    expect(sig.caps).toEqual([])
  })

  it('misaligned months cap a would-be trend at directional', () => {
    const trend = buildTrend({
      metric: 'days_cash_on_hand',
      label: 'Days Cash on Hand',
      unit: 'days',
      granularity: 'annual',
      points: [
        point('2022-06-30', 95),
        point('2023-06-30', 88),
        point('2024-06-30', 80),
        point('2025-06-30', 71),
        point('2026-12-31', 60), // six months out of alignment, and a new FY
      ],
    })
    const sig = computeTrendSignal(trend, { now: '2027-07-31' })
    expect(sig.monthsAligned).toBe(false)
    expect(sig.confidence).toBe('directional')
    expect(sig.caps.some((c) => c.reason === 'months_not_aligned')).toBe(true)
    expect(TREND_WORD.test(sig.reason!)).toBe(false)
  })

  it('a one-month drift is TOLERATED (a 29 June against a 30 June is aligned)', () => {
    const trend = buildTrend({
      metric: 'days_cash_on_hand',
      label: 'Days Cash on Hand',
      unit: 'days',
      granularity: 'annual',
      points: [
        point('2022-06-30', 95),
        point('2023-06-29', 88),
        point('2024-06-30', 80),
        point('2025-05-31', 71),
        point('2026-06-30', 60),
      ],
    })
    const sig = computeTrendSignal(trend, { now: NOW })
    expect(sig.monthsAligned).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('materiality governs DIRECTION, significance governs CONFIDENCE', () => {
  it('a consistent but immaterial five-point series is flat AT confidence trend', () => {
    // Five monotone readings moving 0.0002/yr — well under the 0.005 floor.
    const trend = annual('operating_margin', [0.0500, 0.0502, 0.0504, 0.0506, 0.0508], 2022)
    const sig = computeTrendSignal(trend, { now: NOW })
    expect(sig.mannKendall!.significant).toBe(true)
    expect(sig.confidence).toBe('trend') // the readings ARE consistent
    expect(sig.materiality.met).toBe(false) // and the movement is still tiny
    expect(sig.direction).toBe('flat')
    expect(sig.favourability).toBe('neutral')
    expect(sig.reason).toContain('no movement beyond 0.5 percentage points a year')
  })

  it('a relative floor scales off the MEDIAN |value|, not the mean or the first point', () => {
    const trend = annual('cost_per_pupil', [20000, 20400, 20800, 21200, 21600], 2022, {
      label: 'Cost per Pupil', unit: 'currency', goodDirection: 'neutral',
    })
    const sig = computeTrendSignal(trend, { now: NOW })
    expect(sig.materiality.floorKind).toBe('relative')
    expect(sig.materiality.floor).toBeCloseTo(0.02 * 20800, 6) // 2% of the median
    expect(sig.materiality.met).toBe(false) // ~400/yr < 416
  })

  it('a relative floor over an all-zero series has NO baseline and refuses to judge', () => {
    const trend = annual('cost_per_pupil', [0, 0, 0, 0, 0], 2022, {
      label: 'Cost per Pupil', unit: 'currency', goodDirection: 'neutral',
    })
    const sig = computeTrendSignal(trend, { now: NOW })
    expect(sig.materiality.floor).toBeNull()
    expect(sig.materiality.met).toBe(false)
    expect(sig.direction).toBe('flat')
    expect(sig.reason).toContain('no usable baseline in this series')
    expect(TREND_WORD.test(sig.reason!)).toBe(false)
  })

  it('honours a test-only absolute floor override', () => {
    const trend = annual('operating_margin', [0.06, 0.045, 0.03, 0.015], 2023)
    const sig = computeTrendSignal(trend, { now: NOW, minAnnualMoveOverride: 0.5 })
    expect(sig.materiality.floor).toBe(0.5)
    expect(sig.materiality.met).toBe(false)
    expect(sig.direction).toBe('flat')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('direction describes the SERIES, not the goodness', () => {
  const dates = [2022, 2023, 2024, 2025, 2026]

  it("goodDirection 'lower': a RISING student-teacher ratio is DECLINING and unfavourable", () => {
    const trend = buildTrend({
      metric: 'student_teacher_ratio',
      label: 'Student-Teacher Ratio',
      unit: 'ratio',
      goodDirection: 'lower',
      granularity: 'annual',
      points: dates.map((fy, i) => point(`${fy}-06-30`, 12 + i)),
    })
    const sig = computeTrendSignal(trend, { now: NOW })
    expect(sig.slopePerYear).toBeGreaterThan(0)
    expect(sig.direction).toBe('declining')
    expect(sig.favourability).toBe('unfavourable')
  })

  it("goodDirection 'lower': a FALLING ratio is IMPROVING and favourable", () => {
    const trend = buildTrend({
      metric: 'student_teacher_ratio',
      label: 'Student-Teacher Ratio',
      unit: 'ratio',
      goodDirection: 'lower',
      granularity: 'annual',
      points: dates.map((fy, i) => point(`${fy}-06-30`, 18 - i)),
    })
    const sig = computeTrendSignal(trend, { now: NOW })
    expect(sig.direction).toBe('improving')
    expect(sig.favourability).toBe('favourable')
  })

  it("goodDirection 'neutral': the SENTENCE never says 'Improving' either", () => {
    // A $1,000-a-year rise in cost per pupil is not an improvement, and `reason`
    // is the string the spec renders VERBATIM — no reader recovers the
    // `favourability: null` disclaimer from an adjacent field.
    const rising = computeTrendSignal(
      annual('cost_per_pupil', [20000, 21000, 22000, 23000, 24000], 2022, {
        label: 'Cost per Pupil',
        unit: 'currency',
        goodDirection: 'neutral',
      }),
      { now: NOW },
    )
    expect(rising.confidence).toBe('trend')
    expect(rising.favourability).toBeNull()
    expect(rising.reason).toMatch(/^Rising across 5 readings/)
    expect(rising.reason).not.toMatch(/Improving|Declining/)

    const falling = computeTrendSignal(
      annual('cost_per_pupil', [24000, 23000, 22000, 21000, 20000], 2022, {
        label: 'Cost per Pupil',
        unit: 'currency',
        goodDirection: 'neutral',
      }),
      { now: NOW },
    )
    expect(falling.reason).toMatch(/^Falling across 5 readings/)
    expect(falling.reason).not.toMatch(/Improving|Declining/)

    // A metric WITH a favourable side keeps the verdict words unchanged.
    const cash = computeTrendSignal(
      annual('days_cash_on_hand', [95, 88, 80, 71, 60], 2022, {
        label: 'Days Cash on Hand',
        unit: 'days',
      }),
      { now: NOW },
    )
    expect(cash.reason).toMatch(/^Declining across 5 readings/)
  })

  it("goodDirection 'neutral': the words carry NO verdict — favourability is null", () => {
    const trend = buildTrend({
      metric: 'total_staff_fte',
      label: 'Total Staff FTE',
      unit: 'ratio',
      goodDirection: 'neutral',
      granularity: 'annual',
      points: dates.map((fy, i) => point(`${fy}-06-30`, 40 + 4 * i)),
    })
    const sig = computeTrendSignal(trend, { now: NOW })
    expect(sig.direction).toBe('improving')
    expect(sig.favourability).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('metric eligibility — 7 metrics may not be followed over time at all', () => {
  const cases: Array<[MetricKey, string]> = [
    ['revenue_mix', 'reports a total, not a rate'],
    ['expense_mix', 'reports a total, not a rate'],
    ['enrollment_change_yoy', 'already a year-over-year change'],
    ['fte_change_yoy', 'already a year-over-year change'],
    ['forecast_vs_budget_net', 'is a forecast'],
    ['forecast_operating_margin', 'is a forecast'],
    ['plan_readiness', 'counts which planning artifacts exist'],
  ]

  for (const [metric, fragment] of cases) {
    it(`${metric} refuses with metric_not_eligible and explains itself`, () => {
      const trend = annual(metric, [1, 2, 3, 4, 5], 2022, { label: 'Some Measure' })
      const sig = computeTrendSignal(trend, { now: NOW })
      expect(sig.eligible).toBe(false)
      expect(sig.refusal).toBe('metric_not_eligible')
      expect(sig.confidence).toBe('insufficient')
      expect(sig.direction).toBe('unknown')
      expect(sig.n).toBe(0)
      expect(sig.droppedPoints).toBe(0) // no points are read at all
      expect(sig.reason).toContain(fragment)
      expect(TREND_WORD.test(sig.reason!)).toBe(false)
    })

    it(`${metric} refuses even in STRICT mode without throwing — the catalog is not a caller error`, () => {
      const trend = annual(metric, [1, 2, 3, 4, 5], 2022, { label: 'Some Measure' })
      expect(() => computeTrendSignal(trend, { now: NOW, strict: true })).not.toThrow()
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
describe('estimateHorizon', () => {
  const declining = computeTrendSignal(
    annual('days_cash_on_hand', [95, 88, 80, 71, 60], 2022, { label: 'Days Cash on Hand', unit: 'days' }),
    { now: NOW },
  )

  it('never projects below confidence trend', () => {
    const four = computeTrendSignal(
      annual('days_cash_on_hand', [95, 88, 80, 71], 2023, { label: 'Days Cash on Hand', unit: 'days' }),
      { now: NOW },
    )
    expect(four.confidence).toBe('directional')
    expect(estimateHorizon(four, { currentValue: 71, bands: { goodDirection: 'higher', good: 60, risk: 30 } }).kind).toBe('none')
  })

  it('never projects for a series that is not declining', () => {
    const improving = computeTrendSignal(
      annual('days_cash_on_hand', [60, 71, 80, 88, 95], 2022, { label: 'Days Cash on Hand', unit: 'days' }),
      { now: NOW },
    )
    expect(improving.direction).toBe('improving')
    expect(estimateHorizon(improving, { currentValue: 95, bands: { goodDirection: 'higher', good: 60, risk: 30 } })).toMatchObject({
      kind: 'none',
      reason: 'This measure is not moving toward its threshold.',
    })
  })

  it('needs a band and a current value', () => {
    expect(estimateHorizon(declining, { currentValue: 60, bands: undefined })).toMatchObject({
      kind: 'none',
      reason: 'This measure has no target band to breach.',
    })
    expect(estimateHorizon(declining, { currentValue: null, bands: { goodDirection: 'higher', good: 60, risk: 30 } }).kind).toBe('none')
  })

  it('picks the GOOD threshold first when the value is still above it', () => {
    // 95 -> good 60 is 35 days at 8.6219/yr = 4.0594 years -> 5 periods.
    expect(estimateHorizon(declining, { currentValue: 95, bands: { goodDirection: 'higher', good: 60, risk: 30 } })).toEqual({
      kind: 'periods_to_breach',
      value: 5,
      confidence: 'trend',
      reason: null,
    })
  })

  it('reports a condition, not a forecast, once both thresholds are behind it', () => {
    expect(estimateHorizon(declining, { currentValue: 10, bands: { goodDirection: 'higher', good: 60, risk: 30 } })).toMatchObject({
      kind: 'none',
      reason: 'Already below its risk threshold — this is a condition, not a forecast.',
    })
  })

  it(`refuses anything beyond ${MAX_HORIZON_YEARS} years`, () => {
    // 60 -> 0 at 8.6219/yr = 6.9590 years, past the six-year cycle.
    expect(estimateHorizon(declining, { currentValue: 60, bands: { goodDirection: 'higher', good: 60, risk: 0 } })).toMatchObject({
      kind: 'none',
      reason: 'Beyond a six-year accreditation cycle — too far out to call.',
    })
  })

  it("handles a goodDirection 'lower' band, where travel is UPWARD", () => {
    const ratio = computeTrendSignal(
      buildTrend({
        metric: 'student_teacher_ratio',
        label: 'Student-Teacher Ratio',
        unit: 'ratio',
        goodDirection: 'lower',
        granularity: 'annual',
        points: [2022, 2023, 2024, 2025, 2026].map((fy, i) => point(`${fy}-06-30`, 12 + i)),
      }),
      { now: NOW },
    )
    expect(ratio.direction).toBe('declining')
    // Current 16; the next threshold ABOVE it is risk 18. The fitted rate is
    // 0.99986541/yr (June ends are not exactly a year apart), so 2 / 0.99986541
    // = 2.000269 years, and Math.ceil gives 3. Pinned deliberately: the horizon
    // rounds UP, so it can never under-state how long a school has.
    const h = estimateHorizon(ratio, { currentValue: 16, bands: { goodDirection: 'lower', good: 14, risk: 18 } })
    expect(h.kind).toBe('periods_to_breach')
    expect(h.value).toBe(3)
    // Half a point closer and it is two periods.
    expect(estimateHorizon(ratio, { currentValue: 16.5, bands: { goodDirection: 'lower', good: 14, risk: 18 } }).value).toBe(2)
  })

  // ── the neutral-metric-with-bands case: METRIC goodDirection and BAND
  //    goodDirection disagree, and the band geometry is the one that decides.
  //    tuition_dependency is the real instance: metric 'neutral', bands 'lower'
  //    (good 0.70, risk 0.85). Before this fixture existed the projection was
  //    inverted in BOTH directions.
  const TUITION_BANDS: TargetBands = { goodDirection: 'lower', good: 0.7, risk: 0.85 }

  it("a NEUTRAL metric FALLING away from its risk band projects nothing", () => {
    // 0.90 -> 0.78, i.e. 3 percentage points a year AWAY from the 0.85 risk line.
    const falling = computeTrendSignal(
      annual('tuition_dependency', [0.9, 0.87, 0.84, 0.81, 0.78], 2022, {
        label: 'Tuition Dependency',
        unit: 'percent',
        goodDirection: 'neutral',
      }),
      { now: NOW },
    )
    expect(falling.confidence).toBe('trend')
    // The word is only a label; it carries no verdict for a neutral metric.
    expect(falling.direction).toBe('declining')
    expect(falling.favourability).toBeNull()
    expect(estimateHorizon(falling, { currentValue: 0.78, bands: TUITION_BANDS })).toMatchObject({
      kind: 'none',
      reason: 'This measure is not moving toward its threshold.',
    })
  })

  it('a NEUTRAL metric RISING toward its risk band DOES project — the dangerous direction', () => {
    // 0.72 -> 0.84, 3 percentage points a year straight at the 0.85 risk line.
    const rising = computeTrendSignal(
      annual('tuition_dependency', [0.72, 0.75, 0.78, 0.81, 0.84], 2022, {
        label: 'Tuition Dependency',
        unit: 'percent',
        goodDirection: 'neutral',
      }),
      { now: NOW },
    )
    expect(rising.confidence).toBe('trend')
    expect(rising.direction).toBe('improving') // the label, again carrying no verdict
    const h = estimateHorizon(rising, { currentValue: 0.84, bands: TUITION_BANDS })
    expect(h.kind).toBe('periods_to_breach')
    expect(h.value).toBe(1) // 0.01 to go at ~0.03/yr
    expect(h.confidence).toBe('trend')
  })

  it("NEVER produces kind 'by_date' — date horizons come from register facts, not extrapolation", () => {
    const probes = [
      estimateHorizon(declining, { currentValue: 60, bands: { goodDirection: 'higher', good: 60, risk: 30 } }),
      estimateHorizon(declining, { currentValue: 95, bands: { goodDirection: 'higher', good: 60, risk: 30 } }),
      estimateHorizon(declining, { currentValue: 10, bands: { goodDirection: 'higher', good: 60, risk: 30 } }),
    ]
    for (const h of probes) expect(h.kind).not.toBe('by_date')
  })

  it('emits NO probability, as a percentage or otherwise', () => {
    const h = estimateHorizon(declining, { currentValue: 60, bands: { goodDirection: 'higher', good: 60, risk: 30 } })
    expect(Object.keys(h).sort()).toEqual(['confidence', 'kind', 'reason', 'value'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PROPERTY TESTS — the invariants no future edit may break.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic LCG — a seeded generator, never Math.random. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

describe('property: a monotone series never yields a slope of the opposite sign', () => {
  const rand = lcg(20260731)
  it('holds over 400 random monotone series of length 2..9', () => {
    for (let trial = 0; trial < 400; trial++) {
      const n = 2 + Math.floor(rand() * 8)
      const up = rand() < 0.5
      const values: number[] = []
      let v = 10 + rand() * 100
      for (let i = 0; i < n; i++) {
        values.push(v)
        v += (up ? 1 : -1) * (0.5 + rand() * 20)
      }
      const trend = annual('days_cash_on_hand', values, 2010, { label: 'Days Cash on Hand', unit: 'days' })
      const sig = computeTrendSignal(trend, { now: NOW })
      expect(sig.slopePerYear).not.toBeNull()
      if (up) expect(sig.slopePerYear!).toBeGreaterThan(0)
      else expect(sig.slopePerYear!).toBeLessThan(0)
      // Kendall S must agree with the slope's sign on a monotone series.
      if (sig.mannKendall !== null) {
        expect(Math.sign(sig.mannKendall.s)).toBe(up ? 1 : -1)
      }
    }
  })
})

describe('property: a FOUR-POINT series is NEVER a trend, whatever the values', () => {
  const rand = lcg(4444)
  it('holds over every 4-point permutation shape and 500 random 4-point series', () => {
    const check = (values: number[]) => {
      const sig = computeTrendSignal(
        annual('days_cash_on_hand', values, 2020, { label: 'Days Cash on Hand', unit: 'days' }),
        { now: NOW },
      )
      expect(sig.n).toBe(4)
      expect(sig.confidence).not.toBe('trend')
      expect(sig.vocabulary).not.toBe('trend')
      expect(sig.mannKendall!.significant).toBe(false)
      expect(sig.mannKendall!.p).toBeGreaterThanOrEqual(2 / 24 - 1e-12)
      expect(TREND_WORD.test(sig.reason!)).toBe(false)
      expect(estimateHorizon(sig, { currentValue: values[3], bands: { goodDirection: 'higher', good: 60, risk: 30 } }).kind).toBe('none')
    }
    // Every ordering of four distinct values.
    const base = [10, 20, 30, 40]
    const permute = (arr: number[]): number[][] =>
      arr.length <= 1 ? [arr] : arr.flatMap((v, i) => permute([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [v, ...p]))
    for (const p of permute(base)) check(p)
    for (let t = 0; t < 500; t++) check([0, 1, 2, 3].map(() => rand() * 200))
  })

  it('a NON-MONOTONE 3-point series never claims it moved "in each of" its readings', () => {
    // Cash actually ROSE 33% in the most recent year. Theil-Sen still fits a
    // declining median slope that clears the 3-day floor, and the old copy
    // asserted a monotonicity the engine had already disproved (MK p = 1.0).
    const sig = computeTrendSignal(
      annual('days_cash_on_hand', [95, 60, 80], 2024, { label: 'Days Cash on Hand', unit: 'days' }),
      { now: NOW },
    )
    expect(sig.n).toBe(3)
    expect(sig.direction).toBe('declining')
    expect(sig.confidence).toBe('directional')
    expect(sig.mannKendall!.discordant).toBe(2)
    expect(sig.mannKendall!.concordant).toBe(1)
    expect(sig.reason).not.toContain('in each of')
    expect(sig.reason).toContain('not consistently enough')
    expect(TREND_WORD.test(sig.reason!)).toBe(false)
  })

  it('and the same holds at 4 points', () => {
    const sig = computeTrendSignal(
      annual('days_cash_on_hand', [95, 60, 88, 70], 2023, {
        label: 'Days Cash on Hand',
        unit: 'days',
      }),
      { now: NOW },
    )
    expect(sig.n).toBe(4)
    expect(sig.confidence).toBe('directional')
    expect(sig.mannKendall!.concordant).toBeGreaterThan(0)
    expect(sig.mannKendall!.discordant).toBeGreaterThan(0)
    expect(sig.reason).not.toContain('in each of')
    expect(TREND_WORD.test(sig.reason!)).toBe(false)
  })

  it('a MONOTONE 3-4 point series keeps the claim — and names the readings it actually needs', () => {
    const three = computeTrendSignal(
      annual('days_cash_on_hand', [95, 80, 60], 2024, { label: 'Days Cash on Hand', unit: 'days' }),
      { now: NOW },
    )
    expect(three.reason).toContain('Declining in each of 3 readings')
    // Two more readings, not "a fifth": the ladder needs five and this has three.
    expect(three.reason).toContain('Two more readings can settle it.')

    const four = computeTrendSignal(
      annual('days_cash_on_hand', [95, 88, 80, 71], 2023, {
        label: 'Days Cash on Hand',
        unit: 'days',
      }),
      { now: NOW },
    )
    expect(four.reason).toContain('Declining in each of 4 readings')
    expect(four.reason).toContain('One more reading can settle it.')
  })

  it('and three points are never a trend either', () => {
    const sig = computeTrendSignal(
      annual('days_cash_on_hand', [95, 60, 20], 2024, { label: 'Days Cash on Hand', unit: 'days' }),
      { now: NOW },
    )
    expect(sig.confidence).toBe('directional')
    expect(sig.mannKendall!.p).toBeCloseTo(1 / 3, 6)
    expect(sig.reason).toContain('p = 0.3333')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §7.1/16 — the vocabulary rule runs over EVERY STRING THE PAYLOAD EMITS, not
// just `reason`. Asserting only `reason` is how `caps[0].from = 'trend'` shipped
// the banned word at `confidence: 'directional'` with no spec failing.
// ─────────────────────────────────────────────────────────────────────────────

/** Every (path, string) pair in a value, with array indices normalised to `[]`. */
function collectStrings(
  value: unknown,
  path = '',
  out: Array<[string, string]> = [],
): Array<[string, string]> {
  if (typeof value === 'string') {
    out.push([path, value])
    return out
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, `${path}[]`, out)
    return out
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collectStrings(v, path ? `${path}.${k}` : k, out)
  }
  return out
}

/**
 * ENUM SLOTS, exempted BY NAME so the exemption is visible in the spec rather
 * than implied by its absence. These hold ladder/refusal identifiers that a
 * renderer maps to copy; they are never rendered raw. Everything else — `reason`,
 * `label`, `materiality.basis`, `caps[].detail` — is COPY and is checked.
 *
 * `caps[].from` is the deliberate one: a cap that moved a series DOWN from the
 * ceiling the reading count alone would have allowed must be able to name that
 * ceiling, or the payload cannot explain what it capped.
 */
const ENUM_SLOT_PATHS = new Set([
  'metric',
  'unit',
  'goodDirection',
  'refusal',
  'direction',
  'favourability',
  'confidence',
  'vocabulary',
  'spacing',
  'version',
  'materiality.floorKind',
  'mannKendall.method',
  'caps[].reason',
  'caps[].from',
  'caps[].to',
])

function copyStrings(sig: TrendSignal): Array<[string, string]> {
  return collectStrings(sig).filter(([p]) => !ENUM_SLOT_PATHS.has(p))
}

describe('the banned word is checked across EVERY string field, not just reason', () => {
  const rand = lcg(160160)

  it('no COPY string below confidence trend contains the word', () => {
    const probes: TrendSignal[] = [
      // Example A (4 points), C (irregular cap), D (monthly refusal), E (2 points).
      computeTrendSignal(annual('operating_margin', [0.06, 0.045, 0.03, 0.015], 2023), { now: NOW }),
      computeTrendSignal(
        buildTrend({
          metric: 'days_cash_on_hand',
          label: 'Days Cash on Hand',
          unit: 'days',
          granularity: 'annual',
          points: [
            point('2019-06-30', 95),
            point('2020-06-30', 88),
            point('2021-06-30', 80),
            point('2025-06-30', 71),
            point('2026-06-30', 60),
          ],
        }),
        { now: NOW },
      ),
      computeTrendSignal(
        buildTrend({
          metric: 'operating_margin',
          granularity: 'monthly',
          points: ['2025-09-30', '2025-10-31', '2025-11-30'].map((d, i) => point(d, 0.01 * (i + 1))),
        }),
        { now: NOW },
      ),
      computeTrendSignal(annual('operating_margin', [0.05, 0.02], 2025), { now: NOW }),
      // n=5, not significant -> the not_significant cap, whose `from` is 'trend'.
      computeTrendSignal(
        annual('days_cash_on_hand', [95, 88, 80, 71, 74], 2022, {
          label: 'Days Cash on Hand',
          unit: 'days',
        }),
        { now: NOW },
      ),
      // every ineligible metric
      ...(
        [
          'revenue_mix',
          'expense_mix',
          'enrollment_change_yoy',
          'fte_change_yoy',
          'forecast_vs_budget_net',
          'forecast_operating_margin',
          'plan_readiness',
        ] as MetricKey[]
      ).map((m) => computeTrendSignal(annual(m, [1, 2, 3, 4, 5], 2022, { label: 'Some Measure' }), { now: NOW })),
      // and 300 random shapes
      ...Array.from({ length: 300 }, () => {
        const n = Math.floor(rand() * 9)
        return computeTrendSignal(
          annual(
            'days_cash_on_hand',
            Array.from({ length: n }, () => rand() * 200),
            2010 + Math.floor(rand() * 6),
            { label: 'Days Cash on Hand', unit: 'days' },
          ),
          { now: NOW },
        )
      }),
    ]

    for (const sig of probes) {
      if (sig.confidence === 'trend') continue
      for (const [path, s] of copyStrings(sig)) {
        expect(TREND_WORD.test(s), `${path}: ${s}`).toBe(false)
      }
    }
  })

  it('the exemption is real and NARROW: the cap names the ceiling it lowered', () => {
    const capped = computeTrendSignal(
      annual('days_cash_on_hand', [95, 88, 80, 71, 74], 2022, {
        label: 'Days Cash on Hand',
        unit: 'days',
      }),
      { now: NOW },
    )
    expect(capped.confidence).toBe('directional')
    expect(capped.caps[0].from).toBe('trend')
    // ...and that is the ONLY place the word survives on this payload.
    const offenders = collectStrings(capped).filter(([, s]) => TREND_WORD.test(s))
    expect(offenders.map(([p]) => p)).toEqual(['caps[].from'])
  })

  it('the walker actually walks — it would catch a planted string', () => {
    const sig = computeTrendSignal(annual('operating_margin', [0.05, 0.02], 2025), { now: NOW })
    const planted = { ...sig, reason: 'this is a trend' } as TrendSignal
    expect(copyStrings(planted).some(([, s]) => TREND_WORD.test(s))).toBe(true)
  })
})

describe('property: the ladder is total and no cap ever raises a level', () => {
  const rand = lcg(97531)
  it('holds over 600 random shapes: confidence is always one of the four, and trend implies n>=5 + significance', () => {
    for (let t = 0; t < 600; t++) {
      const n = Math.floor(rand() * 9) // 0..8
      const startFy = 2010 + Math.floor(rand() * 5)
      const values = Array.from({ length: n }, () => rand() * 100)
      const trend = annual('days_cash_on_hand', values, startFy, { label: 'Days Cash on Hand', unit: 'days' })
      const sig = computeTrendSignal(trend, { now: NOW })

      expect(['insufficient', 'observation', 'directional', 'trend']).toContain(sig.confidence)
      expect(sig.vocabulary).toBe(sig.confidence)

      if (sig.confidence === 'trend') {
        expect(sig.n).toBeGreaterThanOrEqual(MIN_N_FOR_TREND)
        expect(sig.mannKendall!.significant).toBe(true)
        expect(sig.spacing).toBe('regular')
        expect(sig.monthsAligned).toBe(true)
        expect(sig.caps).toEqual([])
      } else {
        // THE LAW: the word may not appear anywhere below 'trend' — including in
        // every refusal sentence.
        expect(TREND_WORD.test(sig.reason ?? ''), sig.reason ?? '').toBe(false)
      }

      // A cap never raises a level, and 'below_min_n' is declared but never emitted.
      for (const cap of sig.caps) {
        expect(cap.to).toBe('directional')
        expect(cap.reason).not.toBe('below_min_n')
      }
      if (sig.caps.length > 0) expect(sig.confidence).toBe('directional')
    }
  })
})

describe('property: ties are handled, counted and reported', () => {
  it('a partially tied five-point series still resolves to a total answer', () => {
    const sig = computeTrendSignal(
      annual('days_cash_on_hand', [95, 88, 88, 71, 60], 2022, { label: 'Days Cash on Hand', unit: 'days' }),
      { now: NOW },
    )
    expect(sig.mannKendall!.tiedPairs).toBe(1)
    expect(sig.mannKendall!.concordant + sig.mannKendall!.discordant + sig.mannKendall!.tiedPairs).toBe(10)
    expect(sig.mannKendall!.s).toBe(-9)
    // Ties are CONSERVATIVE: d = ceil((10-9)/2) = 1 -> p = 10/120, not significant.
    expect(sig.mannKendall!.p).toBeCloseTo(10 / 120, 6)
    expect(sig.confidence).toBe('directional')
  })

  it('an entirely flat five-point series never becomes a trend', () => {
    const sig = computeTrendSignal(
      annual('days_cash_on_hand', [80, 80, 80, 80, 80], 2022, { label: 'Days Cash on Hand', unit: 'days' }),
      { now: NOW },
    )
    expect(sig.mannKendall!.tiedPairs).toBe(10)
    expect(sig.mannKendall!.p).toBeCloseTo(1, 9)
    expect(sig.confidence).toBe('directional')
    expect(sig.direction).toBe('flat')
    expect(sig.slopePerYear).toBe(0)
    expect(TREND_WORD.test(sig.reason!)).toBe(false)
  })
})

describe('property: the engine is deterministic and reads no ambient state', () => {
  it('the same input yields a deeply identical result every time', () => {
    const trend = annual('days_cash_on_hand', [95, 88, 80, 71, 60], 2022, { label: 'Days Cash on Hand', unit: 'days' })
    const a = computeTrendSignal(trend, { now: NOW })
    const b = computeTrendSignal(trend, { now: NOW })
    expect(a).toEqual(b)
  })

  it('`now` moves ONLY asOfAgeDays — never the statistics', () => {
    const trend = annual('days_cash_on_hand', [95, 88, 80, 71, 60], 2022, { label: 'Days Cash on Hand', unit: 'days' })
    const a = computeTrendSignal(trend, { now: '2026-07-01' })
    const b = computeTrendSignal(trend, { now: '2030-01-01' })
    const strip = (s: TrendSignal) => ({ ...s, asOfAgeDays: null })
    expect(strip(a)).toEqual(strip(b))
    expect(a.asOfAgeDays).not.toBe(b.asOfAgeDays)
  })

  it('does not mutate the trend it is given', () => {
    const trend = annual('days_cash_on_hand', [95, 88, 80, 71, 60], 2022, { label: 'Days Cash on Hand', unit: 'days' })
    const snapshot = JSON.stringify(trend)
    computeTrendSignal(trend, { now: NOW })
    expect(JSON.stringify(trend)).toBe(snapshot)
  })

  it('sorts defensively when the caller hands over out-of-order points', () => {
    const shuffled = buildTrend({
      metric: 'days_cash_on_hand',
      label: 'Days Cash on Hand',
      unit: 'days',
      granularity: 'annual',
      points: [
        point('2024-06-30', 80),
        point('2026-06-30', 60),
        point('2022-06-30', 95),
        point('2025-06-30', 71),
        point('2023-06-30', 88),
      ],
    })
    const sig = computeTrendSignal(shuffled, { now: NOW })
    expect(sig.fiscalYears).toEqual([2022, 2023, 2024, 2025, 2026])
    expect(sig.firstDate).toBe('2022-06-30')
    expect(sig.lastDate).toBe('2026-06-30')
    expect(sig.confidence).toBe('trend')
  })
})

describe('the irregular-spacing rule is the multiple, not a hard-coded year', () => {
  it(`fires exactly when maxGap > ${IRREGULAR_GAP_MULTIPLE} x medianGap`, () => {
    const evenly = computeTrendSignal(
      annual('days_cash_on_hand', [95, 88, 80, 71, 60], 2022, { label: 'Days Cash on Hand', unit: 'days' }),
      { now: NOW },
    )
    expect(evenly.spacing).toBe('regular')

    const withHole = computeTrendSignal(
      buildTrend({
        metric: 'days_cash_on_hand',
        label: 'Days Cash on Hand',
        unit: 'days',
        granularity: 'annual',
        points: [
          point('2019-06-30', 95),
          point('2020-06-30', 88),
          point('2021-06-30', 80),
          point('2023-06-30', 71), // a two-year gap against a one-year median
          point('2024-06-30', 60),
        ],
      }),
      { now: NOW },
    )
    expect(withHole.spacing).toBe('irregular')
    expect(withHole.confidence).toBe('directional')
  })
})

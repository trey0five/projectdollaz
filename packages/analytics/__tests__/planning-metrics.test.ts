// ─────────────────────────────────────────────────────────────
// Phase 6 Planning — forecast_vs_budget_net / forecast_operating_margin /
// plan_readiness on the NEW 'planning' domain. Availability guards (missing
// budget/forecast, zero denominators), band boundaries, the $-operand inputs[],
// and the org rollup on summed extensive $ / artifact counts (incl. the
// MANDATORY sumOperational fold of all six threaded fields).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import type { PeriodOperational } from '../src/types.js'
import { computeMetricsRecord } from '../src/compute.js'
import { computeOrgMetrics, sumOperational, type SchoolPeriodInputs } from '../src/org-compute.js'
import { fromBundle } from '../src/adapt.js'
import { METRIC_KEYS, METRIC_META } from '../src/registry.js'
import { DEFAULT_BANDS } from '../src/health.js'
import { FULL_BUNDLE } from './fixtures.js'

/** An operational row carrying ONLY the Phase-6 planning threading fields. */
function op(over: Partial<PeriodOperational> = {}): PeriodOperational {
  return {
    enrollment: null,
    enrollmentFte: null,
    studentsOnAid: null,
    financialAidTotal: null,
    teachingFte: null,
    totalStaffFte: null,
    ...over,
  }
}

/** A fully-planned period: budget 1000/950 (net 50), forecast 980/960 (net 20). */
const PLANNED = {
  budgetTotalRevenue: 1000,
  budgetTotalExpense: 950,
  forecastTotalRevenue: 980,
  forecastTotalExpense: 960,
  planArtifactsPresent: 3,
  planArtifactsTotal: 3,
}

function record(cur: PeriodOperational) {
  return computeMetricsRecord({ current: FULL_BUNDLE, currentOperational: cur })
}

describe('Phase 6 planning — registry wiring', () => {
  it('the three planning keys are appended LAST in the frozen contract order', () => {
    expect(METRIC_KEYS.slice(18)).toEqual([
      'forecast_vs_budget_net',
      'forecast_operating_margin',
      'plan_readiness',
    ])
    expect(METRIC_KEYS).toHaveLength(21)
  })

  it('metadata: planning domain, directions, units, rollup rules, bands', () => {
    const fvb = METRIC_META.find((m) => m.key === 'forecast_vs_budget_net')!
    expect(fvb.domain).toBe('planning')
    expect(fvb.goodDirection).toBe('higher')
    expect(fvb.unit).toBe('percent')
    expect(fvb.scopeAggregation).toBe('recompute-from-components')
    expect(fvb.bands).toEqual({ goodDirection: 'higher', good: -0.01, risk: -0.05 })

    const fom = METRIC_META.find((m) => m.key === 'forecast_operating_margin')!
    expect(fom.domain).toBe('planning')
    expect(fom.unit).toBe('percent')
    // Shares operating_margin's numbers but has its OWN entry (tunable apart).
    expect(fom.bands).toEqual({ goodDirection: 'higher', good: 0.03, risk: 0 })
    expect(DEFAULT_BANDS.forecast_operating_margin).toEqual(DEFAULT_BANDS.operating_margin)

    const pr = METRIC_META.find((m) => m.key === 'plan_readiness')!
    expect(pr.domain).toBe('planning')
    expect(pr.unit).toBe('share')
    expect(pr.scopeAggregation).toBe('weighted-by-components')
    expect(pr.bands).toEqual({ goodDirection: 'higher', good: 1, risk: 0.33 })
  })
})

describe('forecast_vs_budget_net — math + guards + $ operands', () => {
  it('((fRev−fExp) − (bRev−bExp)) / bRev, with the raw $ nets on inputs[]', () => {
    const r = record(op(PLANNED)).forecast_vs_budget_net
    expect(r.available).toBe(true)
    // forecast net 20, budget net 50 → (20−50)/1000 = −0.03 → watch.
    expect(r.value).toBeCloseTo(-0.03, 12)
    expect(r.status).toBe('watch')
    const byKey = Object.fromEntries(r.inputs.map((i) => [i.key, i]))
    expect(byKey.forecastNet.value).toBe(20)
    expect(byKey.forecastNet.unit).toBe('currency')
    expect(byKey.budgetNet.value).toBe(50)
    expect(byKey.budgetNet.unit).toBe('currency')
  })

  it('band: exactly −0.01 => good; −0.02 => watch; exactly −0.05 => watch; −0.06 => risk', () => {
    const at = (fNet: number) =>
      record(
        op({ ...PLANNED, forecastTotalRevenue: 1000, forecastTotalExpense: 1000 - (50 + fNet * 1000) }),
      ).forecast_vs_budget_net.status
    // forecast net = budget net + x·bRev → value = x exactly.
    expect(at(-0.01)).toBe('good')
    expect(at(-0.02)).toBe('watch')
    expect(at(-0.05)).toBe('watch')
    expect(at(-0.06)).toBe('risk')
  })

  it("missing forecast → inputsMissing ['forecast']; missing budget → ['budget']", () => {
    const noForecast = record(
      op({ ...PLANNED, forecastTotalRevenue: null, forecastTotalExpense: null }),
    ).forecast_vs_budget_net
    expect(noForecast.available).toBe(false)
    expect(noForecast.inputsMissing).toEqual(['forecast'])

    const noBudget = record(
      op({ ...PLANNED, budgetTotalRevenue: null, budgetTotalExpense: null }),
    ).forecast_vs_budget_net
    expect(noBudget.available).toBe(false)
    expect(noBudget.inputsMissing).toEqual(['budget'])
  })

  it('budgeted revenue of 0 → unavailable (normalizer guard), never Infinity', () => {
    const r = record(op({ ...PLANNED, budgetTotalRevenue: 0 })).forecast_vs_budget_net
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['budget'])
  })

  it('nothing threaded (finance-only period) → unavailable, both sources missing', () => {
    const r = record(op()).forecast_vs_budget_net
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['forecast', 'budget'])
  })
})

describe('forecast_operating_margin — math + guards', () => {
  it('(fRev − fExp) / fRev', () => {
    const r = record(op(PLANNED)).forecast_operating_margin
    expect(r.available).toBe(true)
    expect(r.value).toBeCloseTo(20 / 980, 12)
    expect(r.status).toBe('watch') // ~2.0%, under the 3% good line, above 0
  })

  it('a projected deficit lands risk (operating_margin band semantics)', () => {
    const r = record(
      op({ forecastTotalRevenue: 900, forecastTotalExpense: 950 }),
    ).forecast_operating_margin
    expect(r.value).toBeCloseTo(-50 / 900, 12)
    expect(r.status).toBe('risk')
  })

  it('forecast revenue null or 0 → unavailable, precise inputsMissing', () => {
    const none = record(op()).forecast_operating_margin
    expect(none.available).toBe(false)
    expect(none.inputsMissing).toEqual(['forecastTotalRevenue', 'forecastTotalExpense'])

    const zero = record(
      op({ forecastTotalRevenue: 0, forecastTotalExpense: 10 }),
    ).forecast_operating_margin
    expect(zero.available).toBe(false)
    expect(zero.inputsMissing).toEqual(['forecastTotalRevenue'])
  })
})

describe('plan_readiness — math + guards', () => {
  const ready = (present: number | null, total: number | null) =>
    record(op({ planArtifactsPresent: present, planArtifactsTotal: total })).plan_readiness

  it('present / total; 0-of-3 is a LEGITIMATE (risk) value', () => {
    expect(ready(3, 3).value).toBe(1)
    expect(ready(3, 3).status).toBe('good')
    expect(ready(2, 3).value).toBeCloseTo(2 / 3, 12)
    expect(ready(2, 3).status).toBe('watch')
    expect(ready(1, 3).value).toBeCloseTo(1 / 3, 12)
    expect(ready(1, 3).status).toBe('watch') // 0.333… ≥ 0.33 frontier → watch
    expect(ready(0, 3).value).toBe(0)
    expect(ready(0, 3).status).toBe('risk')
  })

  it('counts not threaded / zero total → unavailable', () => {
    expect(ready(null, null).available).toBe(false)
    expect(ready(null, null).inputsMissing).toEqual(['planArtifactsPresent', 'planArtifactsTotal'])
    expect(ready(1, 0).available).toBe(false)
    expect(ready(1, 0).inputsMissing).toEqual(['planArtifactsTotal'])
  })
})

describe('Phase 6 planning — org rollup (formula on summed $, weighted coverage)', () => {
  const school = (id: string, cur: PeriodOperational): SchoolPeriodInputs => ({
    schoolId: id,
    financials: fromBundle(FULL_BUNDLE),
    operational: cur,
  })

  it('sumOperational folds ALL SIX threaded fields (the mandatory paired edit)', () => {
    const summed = sumOperational([
      op({ ...PLANNED }),
      op({
        budgetTotalRevenue: 500,
        budgetTotalExpense: 400,
        forecastTotalRevenue: 520,
        forecastTotalExpense: 410,
        planArtifactsPresent: 1,
        planArtifactsTotal: 3,
      }),
    ])!
    expect(summed.budgetTotalRevenue).toBe(1500)
    expect(summed.budgetTotalExpense).toBe(1350)
    expect(summed.forecastTotalRevenue).toBe(1500)
    expect(summed.forecastTotalExpense).toBe(1370)
    expect(summed.planArtifactsPresent).toBe(4)
    expect(summed.planArtifactsTotal).toBe(6)
    // absent-as-null: a school with nothing threaded contributes NOTHING…
    const partial = sumOperational([op(PLANNED), op()])!
    expect(partial.budgetTotalRevenue).toBe(1000)
    // …and when EVERY school is null the org field is null (not 0).
    const none = sumOperational([op(), op()])!
    expect(none.budgetTotalRevenue).toBeNull()
    expect(none.planArtifactsPresent).toBeNull()
  })

  it('org forecast_vs_budget_net = the metric’s own formula on the Σ$ (never avg)', () => {
    // A: budget net 50 of rev 1000, forecast net 20. B: budget net 100 of rev
    // 500, forecast net 110. Org: (130 − 150) / 1500 = −0.01333…
    const org = computeOrgMetrics([
      school('A', op(PLANNED)),
      school(
        'B',
        op({
          budgetTotalRevenue: 500,
          budgetTotalExpense: 400,
          forecastTotalRevenue: 520,
          forecastTotalExpense: 410,
          planArtifactsPresent: 1,
          planArtifactsTotal: 3,
        }),
      ),
    ])
    const fvb = org.find((m) => m.key === 'forecast_vs_budget_net')!
    expect(fvb.value).toBeCloseTo((130 - 150) / 1500, 12)
    const fom = org.find((m) => m.key === 'forecast_operating_margin')!
    expect(fom.value).toBeCloseTo((1500 - 1370) / 1500, 12)
    // Org plan_readiness = Σpresent / Σtotal = 4/6 (artifact-count-weighted).
    const pr = org.find((m) => m.key === 'plan_readiness')!
    expect(pr.value).toBeCloseTo(4 / 6, 12)
  })

  it('no school threaded planning figures → org planning metrics honestly unavailable', () => {
    const org = computeOrgMetrics([school('A', op()), school('B', op())])
    for (const key of ['forecast_vs_budget_net', 'forecast_operating_margin', 'plan_readiness'] as const) {
      const m = org.find((x) => x.key === key)!
      expect(m.available).toBe(false)
      expect(m.value).toBeNull()
    }
  })
})

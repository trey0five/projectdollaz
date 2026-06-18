import { describe, it, expect } from 'vitest'
import {
  computeMetricsRecord,
  fromBundle,
  getMetric,
  METRIC_KEYS,
} from '../src/index.js'
import {
  FULL_BUNDLE,
  PRIOR_BUNDLE,
  NO_SFP_BUNDLE,
  ZERO_REV_BUNDLE,
  ZERO_EXP_BUNDLE,
} from './fixtures.js'

describe('Tier-1 metric arithmetic (full bundle)', () => {
  const r = computeMetricsRecord({ current: FULL_BUNDLE })

  it('operating margin = netChange / totalRev', () => {
    expect(r.operating_margin.available).toBe(true)
    expect(r.operating_margin.value).toBeCloseTo(0.1, 10)
    expect(r.operating_margin.unit).toBe('percent')
    expect(r.operating_margin.goodDirection).toBe('higher')
  })

  it('days cash on hand = cash / (totalExp/365)', () => {
    expect(r.days_cash_on_hand.available).toBe(true)
    expect(r.days_cash_on_hand.value).toBeCloseTo(730, 6)
  })

  it('months of operating reserve = naWithout / (totalExp/12)', () => {
    expect(r.months_operating_reserve.available).toBe(true)
    expect(r.months_operating_reserve.value).toBeCloseTo(20, 6)
  })

  it('tuition dependency = tuition / totalRev, in 0..1', () => {
    expect(r.tuition_dependency.available).toBe(true)
    expect(r.tuition_dependency.value).toBeCloseTo(0.7, 10)
    expect(r.tuition_dependency.value as number).toBeGreaterThanOrEqual(0)
    expect(r.tuition_dependency.value as number).toBeLessThanOrEqual(1)
  })

  it('revenue mix shares sum to ~1 and carry totalRev as value', () => {
    const m = r.revenue_mix
    expect(m.available).toBe(true)
    expect(m.value).toBe(1000)
    const sum = (m.components ?? []).reduce((a, c) => a + c.share, 0)
    expect(sum).toBeCloseTo(1, 10)
    const tuition = m.components?.find((c) => c.key === 'tuition')
    expect(tuition?.share).toBeCloseTo(0.7, 10)
  })

  it('expense mix shares sum to ~1 and carry totalExp as value', () => {
    const m = r.expense_mix
    expect(m.available).toBe(true)
    expect(m.value).toBe(900)
    const sum = (m.components ?? []).reduce((a, c) => a + c.share, 0)
    expect(sum).toBeCloseTo(1, 10)
    const instr = m.components?.find((c) => c.key === 'instructional')
    expect(instr?.share).toBeCloseTo(600 / 900, 10)
  })
})

describe('period-over-period deltas (full vs prior)', () => {
  const r = computeMetricsRecord({ current: FULL_BUNDLE, prior: PRIOR_BUNDLE })

  it('operating margin delta = 0.10 - 0.05', () => {
    expect(r.operating_margin.periodOverPeriodDelta).toBeCloseTo(0.05, 10)
  })
  it('days cash delta = 730 - 365', () => {
    expect(r.days_cash_on_hand.periodOverPeriodDelta).toBeCloseTo(365, 6)
  })
  it('months reserve delta = 20 - 12', () => {
    expect(r.months_operating_reserve.periodOverPeriodDelta).toBeCloseTo(8, 6)
  })
  it('tuition dependency delta = 0.7 - 0.8 (can be negative)', () => {
    expect(r.tuition_dependency.periodOverPeriodDelta).toBeCloseTo(-0.1, 10)
  })
  it('delta is null when no prior is supplied', () => {
    const noPrior = computeMetricsRecord({ current: FULL_BUNDLE })
    expect(noPrior.operating_margin.periodOverPeriodDelta).toBeNull()
  })
})

describe('available:false contract — missing SFP', () => {
  const r = computeMetricsRecord({ current: NO_SFP_BUNDLE })

  it('days cash on hand is unavailable with inputsMissing cash', () => {
    expect(r.days_cash_on_hand.available).toBe(false)
    expect(r.days_cash_on_hand.value).toBeNull()
    expect(r.days_cash_on_hand.inputsMissing).toContain('cash')
  })
  it('months reserve is unavailable with inputsMissing naWithout', () => {
    expect(r.months_operating_reserve.available).toBe(false)
    expect(r.months_operating_reserve.value).toBeNull()
    expect(r.months_operating_reserve.inputsMissing).toContain('naWithout')
  })
  it('SOA-only metrics remain available', () => {
    expect(r.operating_margin.available).toBe(true)
    expect(r.tuition_dependency.available).toBe(true)
    expect(r.revenue_mix.available).toBe(true)
    expect(r.expense_mix.available).toBe(true)
  })
})

describe('available:false contract — zero denominators', () => {
  it('zero revenue makes ratio metrics unavailable (never zero)', () => {
    const r = computeMetricsRecord({ current: ZERO_REV_BUNDLE })
    expect(r.operating_margin.available).toBe(false)
    expect(r.operating_margin.value).toBeNull()
    expect(r.operating_margin.inputsMissing).toContain('totalRev')
    expect(r.tuition_dependency.available).toBe(false)
    expect(r.revenue_mix.available).toBe(false)
    // expense mix still works (totalExp > 0)
    expect(r.expense_mix.available).toBe(true)
  })

  it('zero expenses makes SFP + expense-mix metrics unavailable', () => {
    const r = computeMetricsRecord({ current: ZERO_EXP_BUNDLE })
    expect(r.days_cash_on_hand.available).toBe(false)
    expect(r.days_cash_on_hand.inputsMissing).toContain('totalExp')
    expect(r.months_operating_reserve.available).toBe(false)
    expect(r.months_operating_reserve.inputsMissing).toContain('totalExp')
    expect(r.expense_mix.available).toBe(false)
    expect(r.expense_mix.inputsMissing).toContain('totalExp')
    // operating margin still works (totalRev > 0)
    expect(r.operating_margin.available).toBe(true)
  })
})

describe('registry shape', () => {
  it('every metric key resolves to a def with the right key', () => {
    for (const k of METRIC_KEYS) {
      expect(getMetric(k).key).toBe(k)
    }
  })
  it('PoP delta is null when current is unavailable even with a prior', () => {
    const r = computeMetricsRecord({ current: ZERO_REV_BUNDLE, prior: FULL_BUNDLE })
    expect(r.operating_margin.periodOverPeriodDelta).toBeNull()
  })
})

describe('adapter (fromBundle)', () => {
  it('projects SOA + SFP fields', () => {
    const f = fromBundle(FULL_BUNDLE)
    expect(f.totalRev).toBe(1000)
    expect(f.totalExp).toBe(900)
    expect(f.cash).toBe(1800)
    expect(f.naWithout).toBe(1500)
    expect(f.hasSFP).toBe(true)
  })
  it('nulls SFP fields when no CY SFP', () => {
    const f = fromBundle(NO_SFP_BUNDLE)
    expect(f.hasSFP).toBe(false)
    expect(f.cash).toBeNull()
    expect(f.naWithout).toBeNull()
  })
})

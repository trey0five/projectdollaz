import { describe, it, expect } from 'vitest'
import { computeMetricsForPeriod, computeMetricsRecord, computeTrend } from '../src/index.js'
import { FULL_BUNDLE, PRIOR_BUNDLE, SERIES } from './fixtures.js'

describe('determinism / reproducibility', () => {
  it('computing metrics twice from the same snapshot yields identical output', () => {
    const a = computeMetricsForPeriod({ current: FULL_BUNDLE, prior: PRIOR_BUNDLE })
    const b = computeMetricsForPeriod({ current: FULL_BUNDLE, prior: PRIOR_BUNDLE })
    expect(a).toEqual(b)
    // deep-equal AND value-identical (no NaN drift, no clock dependence).
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('computing a trend twice yields identical output', () => {
    const a = computeTrend('months_operating_reserve', SERIES)
    const b = computeTrend('months_operating_reserve', SERIES)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('mix shares are full-precision, reproducible, and sum to exactly 1 (float epsilon)', () => {
    const a = computeMetricsRecord({ current: FULL_BUNDLE })
    const b = computeMetricsRecord({ current: FULL_BUNDLE })

    for (const key of ['revenue_mix', 'expense_mix'] as const) {
      const ca = a[key].components ?? []
      const cb = b[key].components ?? []
      expect(ca.length).toBeGreaterThan(0)
      // byte-identical shares across runs (no rounding, no clock dependence).
      expect(JSON.stringify(ca)).toBe(JSON.stringify(cb))
      // raw (un-rounded) shares sum to 1 within IEEE-754 epsilon, NOT just
      // toBeCloseTo — proves the package itself never drifts to 0.999/1.001.
      const sum = ca.reduce((s, c) => s + c.share, 0)
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9)
    }
  })
})

// ─────────────────────────────────────────────────────────────
// Phase 2 — FY-End Forecast feeder merge. The ONE analytics addition, shared by
// the API (server save) and web (live preview), so it carries dedicated coverage.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { mergeFeederEnrollment, GRADE_KEYS, computeDriverBudget, defaultAssumptions } from '../src/index.js'

describe('mergeFeederEnrollment', () => {
  it('adds feeder per grade and omits zero-sum keys', () => {
    const out = mergeFeederEnrollment({ PK4: 40, K: 60, '1': 58 }, { PK4: 12, K: 18, '6': 4 })
    expect(out).toEqual({ PK4: 52, K: 78, '1': 58, '6': 4 })
    // A grade absent from both stays absent (zero-sum omitted).
    expect(out).not.toHaveProperty('2')
  })

  it('clamps negatives to 0 on each side and never throws', () => {
    expect(mergeFeederEnrollment({ K: -5 }, { K: 10 })).toEqual({ K: 10 })
    expect(mergeFeederEnrollment({ K: 8 }, { K: -3 })).toEqual({ K: 8 })
    expect(mergeFeederEnrollment({ K: 0 }, { K: 0 })).toEqual({})
  })

  it('treats null/undefined feeder as no additions', () => {
    expect(mergeFeederEnrollment({ K: 20 }, null)).toEqual({ K: 20 })
    expect(mergeFeederEnrollment({ K: 20 }, undefined)).toEqual({ K: 20 })
  })

  it('ignores unknown keys on both inputs (only the 14 GRADE_KEYS participate)', () => {
    const out = mergeFeederEnrollment(
      { K: 10, bogus: 99 } as Record<string, number>,
      { K: 5, alsoBogus: 7 } as Record<string, number>,
    )
    expect(out).toEqual({ K: 15 })
    for (const k of Object.keys(out)) expect(GRADE_KEYS).toContain(k)
  })

  it('feeder raises projected gross tuition through computeDriverBudget', () => {
    const base = defaultAssumptions()
    base.enrollmentByGrade = { K: 100 }
    base.tuitionRates = { prek3: 0, prek5: 0, elem: 1000, middle: 0 }
    const withoutFeeder = computeDriverBudget(base, { priorRevenue: {}, priorExpense: {} })
    const merged = { ...base, enrollmentByGrade: mergeFeederEnrollment(base.enrollmentByGrade, { K: 20 }) }
    const withFeeder = computeDriverBudget(merged, { priorRevenue: {}, priorExpense: {} })
    // 20 extra K students × $1000 = +$20,000 tuition; enrollment total +20.
    expect(withFeeder.revenue.tuition - withoutFeeder.revenue.tuition).toBe(20000)
    expect(withFeeder.kpis.enrollmentTotal - withoutFeeder.kpis.enrollmentTotal).toBe(20)
  })
})

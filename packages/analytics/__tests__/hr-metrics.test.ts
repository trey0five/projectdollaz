// ─────────────────────────────────────────────────────────────
// Phase 6 HR & Staffing — total_staff_fte / fte_change_yoy / teaching_staff_share.
// Availability guards (null vs legit-0, zero denominators), band boundaries for
// the banded share, neutrality of the size/growth metrics, and the org rollup
// (FTE-weighted share, YoY on summed FTEs, summed total).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import type { PeriodOperational } from '../src/types.js'
import { computeMetricsRecord } from '../src/compute.js'
import { computeOrgMetrics, type SchoolPeriodInputs } from '../src/org-compute.js'
import { fromBundle } from '../src/adapt.js'
import { METRIC_KEYS, METRIC_META } from '../src/registry.js'
import { DEFAULT_BANDS } from '../src/health.js'
import { FULL_BUNDLE } from './fixtures.js'

function op(teachingFte: number | null, totalStaffFte: number | null): PeriodOperational {
  return {
    enrollment: null,
    enrollmentFte: null,
    studentsOnAid: null,
    financialAidTotal: null,
    teachingFte,
    totalStaffFte,
  }
}

function record(cur: PeriodOperational, prior?: PeriodOperational) {
  return computeMetricsRecord({
    current: FULL_BUNDLE,
    prior: prior ? FULL_BUNDLE : undefined,
    currentOperational: cur,
    priorOperational: prior,
  })
}

describe('Phase 6 HR — registry wiring', () => {
  it('the three hr keys are appended in the frozen contract order', () => {
    expect(METRIC_KEYS.slice(15, 18)).toEqual([
      'total_staff_fte',
      'fte_change_yoy',
      'teaching_staff_share',
    ])
  })

  it('metadata: domains, directions, units, rollup rules', () => {
    const total = METRIC_META.find((m) => m.key === 'total_staff_fte')!
    expect(total.domain).toBe('hr')
    expect(total.goodDirection).toBe('neutral')
    expect(total.unit).toBe('ratio')
    expect(total.scopeAggregation).toBe('sum')
    expect(total.bands).toBeUndefined()

    const yoy = METRIC_META.find((m) => m.key === 'fte_change_yoy')!
    expect(yoy.domain).toBe('hr')
    expect(yoy.goodDirection).toBe('neutral')
    expect(yoy.unit).toBe('percent')
    expect(yoy.scopeAggregation).toBe('recompute-from-components')
    expect(yoy.bands).toBeUndefined()

    const share = METRIC_META.find((m) => m.key === 'teaching_staff_share')!
    expect(share.domain).toBe('hr')
    expect(share.goodDirection).toBe('higher')
    expect(share.unit).toBe('percent')
    expect(share.scopeAggregation).toBe('recompute-from-components')
    expect(share.bands).toEqual({ goodDirection: 'higher', good: 0.6, risk: 0.45 })
    expect(DEFAULT_BANDS.teaching_staff_share).toEqual({ goodDirection: 'higher', good: 0.6, risk: 0.45 })
  })
})

describe('total_staff_fte — availability', () => {
  it('value = the entered total; 0 is a LEGITIMATE value (available)', () => {
    const r = record(op(null, 42.5)).total_staff_fte
    expect(r.available).toBe(true)
    expect(r.value).toBe(42.5)
    expect(r.status).toBe('neutral')

    const zero = record(op(null, 0)).total_staff_fte
    expect(zero.available).toBe(true)
    expect(zero.value).toBe(0)
  })

  it('null (not entered) → unavailable with precise inputsMissing', () => {
    const r = record(op(5, null)).total_staff_fte
    expect(r.available).toBe(false)
    expect(r.value).toBeNull()
    expect(r.inputsMissing).toEqual(['totalStaffFte'])
  })
})

describe('fte_change_yoy — availability + math', () => {
  it('(cur − prior) / prior on teachingFte', () => {
    const r = record(op(11, null), op(10, null)).fte_change_yoy
    expect(r.available).toBe(true)
    expect(r.value).toBeCloseTo(0.1, 12)
    expect(r.status).toBe('neutral') // no band — growth is contextual
  })

  it('no prior period → unavailable (never a fabricated 0%)', () => {
    const r = record(op(11, null)).fte_change_yoy
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toContain('priorTeachingFte')
  })

  it('prior of 0 → unavailable (0→N ramp has no defensible rate)', () => {
    const r = record(op(11, null), op(0, null)).fte_change_yoy
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['priorTeachingFte'])
  })

  it('current missing → unavailable naming teachingFte', () => {
    const r = record(op(null, 8), op(10, null)).fte_change_yoy
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toContain('teachingFte')
  })

  it('periodOverPeriodDelta is ALWAYS null (change-of-a-change, documented)', () => {
    const r = record(op(11, null), op(10, null)).fte_change_yoy
    expect(r.periodOverPeriodDelta).toBeNull()
  })
})

describe('teaching_staff_share — availability + band boundaries', () => {
  const share = (t: number | null, tot: number | null) => record(op(t, tot)).teaching_staff_share

  it('teachingFte / totalStaffFte', () => {
    const r = share(30, 50)
    expect(r.available).toBe(true)
    expect(r.value).toBeCloseTo(0.6, 12)
  })

  it('band: exactly 0.60 => good; 0.59 => watch; exactly 0.45 => watch; 0.44 => risk', () => {
    expect(share(60, 100).status).toBe('good')
    expect(share(59, 100).status).toBe('watch')
    expect(share(45, 100).status).toBe('watch')
    expect(share(44, 100).status).toBe('risk')
  })

  it('zero/null denominator → unavailable, never Infinity', () => {
    expect(share(5, 0).available).toBe(false)
    expect(share(5, 0).inputsMissing).toEqual(['totalStaffFte'])
    expect(share(5, null).inputsMissing).toEqual(['totalStaffFte'])
  })

  it('missing numerator → unavailable naming teachingFte', () => {
    const r = share(null, 10)
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['teachingFte'])
  })
})

describe('Phase 6 HR — org rollup (formula on summed FTEs)', () => {
  const school = (
    id: string,
    cur: PeriodOperational,
    prior?: PeriodOperational,
  ): SchoolPeriodInputs => ({
    schoolId: id,
    financials: fromBundle(FULL_BUNDLE),
    operational: cur,
    priorFinancials: prior ? fromBundle(FULL_BUNDLE) : null,
    priorOperational: prior ?? null,
  })

  it('org teaching_staff_share = ΣteachingFte / ΣtotalStaffFte (FTE-weighted, not avg of shares)', () => {
    // A: 9/10 (0.9), B: 10/40 (0.25). Naive mean = 0.575; weighted = 19/50 = 0.38.
    const org = computeOrgMetrics([school('A', op(9, 10)), school('B', op(10, 40))])
    const r = org.find((m) => m.key === 'teaching_staff_share')!
    expect(r.value).toBeCloseTo(19 / 50, 12)
    expect(r.status).toBe('risk') // 0.38 < 0.45
  })

  it('org total_staff_fte = ΣtotalStaffFte (a genuine sum metric)', () => {
    const org = computeOrgMetrics([school('A', op(9, 10)), school('B', op(10, 40))])
    expect(org.find((m) => m.key === 'total_staff_fte')!.value).toBe(50)
  })

  it('org fte_change_yoy = (Σcur − Σprior) / Σprior over the prior-bearing schools', () => {
    const org = computeOrgMetrics([
      school('A', op(11, null), op(10, null)),
      school('B', op(22, null), op(20, null)),
    ])
    const r = org.find((m) => m.key === 'fte_change_yoy')!
    expect(r.value).toBeCloseTo((33 - 30) / 30, 12)
  })

  it('no school entered staff FTEs → org hr metrics honestly unavailable', () => {
    const org = computeOrgMetrics([school('A', op(null, null))])
    expect(org.find((m) => m.key === 'total_staff_fte')!.available).toBe(false)
    expect(org.find((m) => m.key === 'teaching_staff_share')!.available).toBe(false)
    expect(org.find((m) => m.key === 'fte_change_yoy')!.available).toBe(false)
  })
})

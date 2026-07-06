// ─────────────────────────────────────────────────────────────
// Phase 2 Enrollment Intelligence — enrollment_vs_plan: actual headcount vs the
// planned/budgeted enrollment. Registry wiring, banding, availability guards
// (never fabricate / divide-by-zero), and org recompute from summed components.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import type { PeriodOperational } from '../src/types.js'
import { computeMetricsRecord } from '../src/compute.js'
import { computeOrgMetrics, type SchoolPeriodInputs } from '../src/org-compute.js'
import { fromBundle } from '../src/adapt.js'
import { METRIC_KEYS, METRIC_META } from '../src/registry.js'
import { DEFAULT_BANDS } from '../src/health.js'
import { FULL_BUNDLE } from './fixtures.js'

function op(enrollment: number | null, enrollmentPlan: number | null): PeriodOperational {
  return {
    enrollment,
    enrollmentPlan,
    enrollmentFte: null,
    studentsOnAid: null,
    financialAidTotal: null,
    teachingFte: null,
    totalStaffFte: null,
  }
}

function vsPlan(enrollment: number | null, plan: number | null) {
  return computeMetricsRecord({
    current: FULL_BUNDLE,
    currentOperational: op(enrollment, plan),
  }).enrollment_vs_plan
}

describe('enrollment_vs_plan — registry wiring', () => {
  it('is registered LAST and declares enrollment domain / higher / percent / recompute', () => {
    expect(METRIC_KEYS).toContain('enrollment_vs_plan')
    expect(METRIC_KEYS[METRIC_KEYS.length - 1]).toBe('enrollment_vs_plan')
    const m = METRIC_META.find((x) => x.key === 'enrollment_vs_plan')!
    expect(m.domain).toBe('enrollment')
    expect(m.goodDirection).toBe('higher')
    expect(m.unit).toBe('percent')
    expect(m.scopeAggregation).toBe('recompute-from-components')
    expect(m.boardLabel).toBe('Enrollment vs Plan')
    expect(m.bands).toEqual({ goodDirection: 'higher', good: -0.02, risk: -0.05 })
  })

  it('DEFAULT_BANDS carries the vs-plan band', () => {
    expect(DEFAULT_BANDS.enrollment_vs_plan).toEqual({
      goodDirection: 'higher', good: -0.02, risk: -0.05,
    })
  })
})

describe('enrollment_vs_plan — banding', () => {
  it('ABOVE PLAN: 110 vs 100 is +10%, good', () => {
    const r = vsPlan(110, 100)
    expect(r.available).toBe(true)
    expect(r.value).toBeCloseTo(0.1, 12)
    expect(r.status).toBe('good')
  })

  it('AT PLAN: 100 vs 100 is 0%, good', () => {
    const r = vsPlan(100, 100)
    expect(r.value).toBe(0)
    expect(r.status).toBe('good')
  })

  it('WITHIN 2%: 99 vs 100 is -1%, good (good frontier inclusive)', () => {
    const r = vsPlan(99, 100)
    expect(r.value).toBeCloseTo(-0.01, 12)
    expect(r.status).toBe('good')
  })

  it('MODEST SHORTFALL: 97 vs 100 is -3%, watch', () => {
    const r = vsPlan(97, 100)
    expect(r.value).toBeCloseTo(-0.03, 12)
    expect(r.status).toBe('watch')
  })

  it('BOUNDARY: -5% exactly lands in WATCH (risk frontier inclusive of watch)', () => {
    const r = vsPlan(95, 100)
    expect(r.value).toBeCloseTo(-0.05, 12)
    expect(r.status).toBe('watch')
  })

  it('STEEP SHORTFALL: 90 vs 100 is -10%, risk', () => {
    const r = vsPlan(90, 100)
    expect(r.value).toBeCloseTo(-0.1, 12)
    expect(r.status).toBe('risk')
  })
})

describe('enrollment_vs_plan — availability guards', () => {
  it('no plan → unavailable, missing enrollmentPlan', () => {
    const r = vsPlan(100, null)
    expect(r.available).toBe(false)
    expect(r.value).toBeNull()
    expect(r.inputsMissing).toEqual(['enrollmentPlan'])
  })

  it('plan 0 → unavailable (divide-by-zero guard)', () => {
    const r = vsPlan(100, 0)
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['enrollmentPlan'])
  })

  it('plan negative → unavailable', () => {
    const r = vsPlan(100, -10)
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['enrollmentPlan'])
  })

  it('no actual (plan present) → unavailable, missing enrollment', () => {
    const r = vsPlan(null, 100)
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['enrollment'])
  })

  it('actual 0 against a positive plan → available, -100% risk (never swallowed)', () => {
    const r = vsPlan(0, 100)
    expect(r.available).toBe(true)
    expect(r.value).toBeCloseTo(-1, 12)
    expect(r.status).toBe('risk')
  })

  it('no operational at all → unavailable, both flagged', () => {
    const r = computeMetricsRecord({ current: FULL_BUNDLE }).enrollment_vs_plan
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['enrollment', 'enrollmentPlan'])
  })

  it('reports both operands in inputs[] even when available', () => {
    const r = vsPlan(110, 100)
    expect(r.inputs.map((i) => i.key)).toEqual(['enrollment', 'enrollmentPlan'])
    expect(r.inputs.find((i) => i.key === 'enrollment')?.value).toBe(110)
    expect(r.inputs.find((i) => i.key === 'enrollmentPlan')?.value).toBe(100)
  })
})

describe('enrollment_vs_plan — org scope recomputes from summed components', () => {
  function school(id: string, enrollment: number, plan: number): SchoolPeriodInputs {
    return { schoolId: id, financials: fromBundle(FULL_BUNDLE), operational: op(enrollment, plan) }
  }

  it('org value = (Σenroll − Σplan) / Σplan, banded', () => {
    // Σenroll = 90 + 40 = 130; Σplan = 100 + 50 = 150 → (130−150)/150 = −0.1333… risk.
    const org = computeOrgMetrics([school('A', 90, 100), school('B', 40, 50)])
    const m = org.find((x) => x.key === 'enrollment_vs_plan')!
    expect(m.available).toBe(true)
    expect(m.value).toBeCloseTo((130 - 150) / 150, 12)
    expect(m.status).toBe('risk')
    expect(m.scope).toBe('org')
  })

  it('no school has a plan → unavailable via the metric guard', () => {
    const org = computeOrgMetrics([school('A', 90, 0), school('B', 40, 0)])
    const m = org.find((x) => x.key === 'enrollment_vs_plan')!
    expect(m.available).toBe(false)
    expect(m.inputsMissing).toContain('enrollmentPlan')
  })
})

describe('enrollment_vs_plan — purity', () => {
  it('computing twice from the same inputs is byte-identical', () => {
    expect(vsPlan(110, 100)).toEqual(vsPlan(110, 100))
  })
})

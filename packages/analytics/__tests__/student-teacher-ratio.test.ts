// ─────────────────────────────────────────────────────────────
// HR wedge — student_teacher_ratio: the first HR-domain BANDED metric, computed
// from the ALREADY-collected staff-FTE data. Ratio math, band boundaries,
// divide-by-zero guards, and FTE-weighted org rollup (Σenroll / ΣteachingFte).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import type { PeriodOperational } from '../src/types.js'
import { computeMetricsRecord } from '../src/compute.js'
import { computeOrgMetrics, type SchoolPeriodInputs } from '../src/org-compute.js'
import { fromBundle } from '../src/adapt.js'
import { METRIC_KEYS, METRIC_META } from '../src/registry.js'
import { DEFAULT_BANDS } from '../src/health.js'
import { FULL_BUNDLE } from './fixtures.js'

function op(enrollment: number | null, teachingFte: number | null): PeriodOperational {
  return {
    enrollment,
    enrollmentFte: null,
    studentsOnAid: null,
    financialAidTotal: null,
    teachingFte,
    totalStaffFte: null,
  }
}

// Compute student_teacher_ratio from a current enrollment + teachingFte. The
// financial bundle is irrelevant (the metric reads only operational).
function ratio(enrollment: number | null, teachingFte: number | null) {
  return computeMetricsRecord({
    current: FULL_BUNDLE,
    currentOperational: op(enrollment, teachingFte),
  }).student_teacher_ratio
}

describe('student_teacher_ratio — registry wiring', () => {
  it('is registered LAST (after enrollment_change_yoy), first 12 keys byte-identical', () => {
    expect(METRIC_KEYS).toContain('student_teacher_ratio')
    expect(METRIC_KEYS[METRIC_KEYS.length - 1]).toBe('student_teacher_ratio')
    expect(METRIC_KEYS).toHaveLength(14)
    expect(METRIC_KEYS.slice(0, 12)).toEqual([
      'operating_margin', 'days_cash_on_hand', 'months_operating_reserve',
      'tuition_dependency', 'revenue_mix', 'expense_mix', 'cost_per_pupil',
      'net_tuition_per_student', 'financial_aid_per_student', 'aid_per_aided_student',
      'tuition_discount_rate', 'pct_students_on_aid',
    ])
  })

  it('declares hr domain, lower goodDirection, ratio unit, recompute-from-components rollup', () => {
    const m = METRIC_META.find((x) => x.key === 'student_teacher_ratio')!
    expect(m.domain).toBe('hr')
    expect(m.goodDirection).toBe('lower')
    expect(m.unit).toBe('ratio')
    expect(m.scopeAggregation).toBe('recompute-from-components')
    expect(m.bands).toEqual({ goodDirection: 'lower', good: 12, risk: 16 })
  })

  it('DEFAULT_BANDS carries the hr band', () => {
    expect(DEFAULT_BANDS.student_teacher_ratio).toEqual({
      goodDirection: 'lower', good: 12, risk: 16,
    })
  })
})

describe('student_teacher_ratio — value + banding', () => {
  it('240 students / 16 teachers = 15.0, watch (12 < 15 <= 16)', () => {
    const r = ratio(240, 16)
    expect(r.available).toBe(true)
    expect(r.value).toBeCloseTo(15, 12)
    expect(r.status).toBe('watch')
  })

  it('GOOD: 120 / 12 = 10.0 → good (<= 12)', () => {
    const r = ratio(120, 12)
    expect(r.value).toBeCloseTo(10, 12)
    expect(r.status).toBe('good')
  })

  it('BOUNDARY good: exactly 12 is good (inclusive)', () => {
    const r = ratio(120, 10) // 12.0
    expect(r.value).toBeCloseTo(12, 12)
    expect(r.status).toBe('good')
  })

  it('BOUNDARY risk frontier: exactly 16 lands in WATCH (not risk)', () => {
    const r = ratio(160, 10) // 16.0
    expect(r.value).toBeCloseTo(16, 12)
    expect(r.status).toBe('watch')
  })

  it('just past the frontier: 16.1 is risk', () => {
    const r = ratio(161, 10)
    expect(r.value).toBeCloseTo(16.1, 12)
    expect(r.status).toBe('risk')
  })
})

describe('student_teacher_ratio — availability guards (no divide-by-zero / Infinity)', () => {
  it('teachingFte null → unavailable, missing teachingFte', () => {
    const r = ratio(240, null)
    expect(r.available).toBe(false)
    expect(r.value).toBeNull()
    expect(r.inputsMissing).toEqual(['teachingFte'])
  })

  it('teachingFte 0 → unavailable (divide-by-zero guard), NEVER Infinity', () => {
    const r = ratio(240, 0)
    expect(r.available).toBe(false)
    expect(r.value).toBeNull()
    expect(r.inputsMissing).toEqual(['teachingFte'])
    expect(Number.isFinite(r.value as number)).toBe(false)
  })

  it('teachingFte negative → unavailable', () => {
    const r = ratio(240, -4)
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['teachingFte'])
  })

  it('enrollment null (teachingFte present) → unavailable, missing enrollment', () => {
    const r = ratio(null, 16)
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['enrollment'])
  })

  it('both missing → both flagged in order', () => {
    const r = ratio(null, null)
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['enrollment', 'teachingFte'])
  })

  it('no operational at all → unavailable, both missing', () => {
    const r = computeMetricsRecord({ current: FULL_BUNDLE }).student_teacher_ratio
    expect(r.available).toBe(false)
    expect(r.inputsMissing).toEqual(['enrollment', 'teachingFte'])
  })

  it('reports both operands in inputs[] even when available', () => {
    const r = ratio(240, 16)
    const keys = r.inputs.map((i) => i.key)
    expect(keys).toEqual(['enrollment', 'teachingFte'])
    expect(r.inputs.find((i) => i.key === 'enrollment')?.value).toBe(240)
    expect(r.inputs.find((i) => i.key === 'teachingFte')?.value).toBe(16)
  })
})

describe('student_teacher_ratio — org scope recomputes from summed components (NOT an average)', () => {
  function school(id: string, enrollment: number, teachingFte: number): SchoolPeriodInputs {
    return { schoolId: id, financials: fromBundle(FULL_BUNDLE), operational: op(enrollment, teachingFte) }
  }

  it('org value = Σenrollment / ΣteachingFte (FTE-weighted), not avg of per-school ratios', () => {
    // A: 200/10 = 20 ; B: 300/20 = 15. Org = 500/30 = 16.666…, NOT avg(20,15)=17.5.
    const org = computeOrgMetrics([school('A', 200, 10), school('B', 300, 20)])
    const m = org.find((x) => x.key === 'student_teacher_ratio')!
    expect(m.available).toBe(true)
    expect(m.value).toBeCloseTo(500 / 30, 12)
    expect(m.value).not.toBeCloseTo((20 + 15) / 2, 6)
    // 16.67 > 16 risk ceiling → risk.
    expect(m.status).toBe('risk')
    expect(m.scope).toBe('org')
  })

  it('a school missing teachingFte contributes enrollment but not the denominator', () => {
    // A: 300/25 ; B: enrollment 500 but NO teachingFte. Org = (300+500)/25 = 32.
    const org = computeOrgMetrics([school('A', 300, 25), school('B', 500, null as never)])
    const m = org.find((x) => x.key === 'student_teacher_ratio')!
    expect(m.value).toBeCloseTo(800 / 25, 12)
  })

  it('NO school entered teachingFte → org unavailable via the metric OWN guard', () => {
    const org = computeOrgMetrics([
      school('A', 300, null as never),
      school('B', 500, null as never),
    ])
    const m = org.find((x) => x.key === 'student_teacher_ratio')!
    expect(m.available).toBe(false)
    expect(m.value).toBeNull()
    expect(m.inputsMissing).toContain('teachingFte')
    expect(m.inputsMissing).not.toContain('scope:not-aggregatable')
  })
})

describe('student_teacher_ratio — purity/determinism', () => {
  it('computing twice from the same inputs is byte-identical', () => {
    expect(ratio(240, 16)).toEqual(ratio(240, 16))
  })
})

// ─────────────────────────────────────────────────────────────
// Tier-2 operational metric arithmetic + the available:false / inputsMissing
// contract. Operational data is passed in as plain numbers (the API converts
// Prisma Decimal -> number); the package never reads the DB. Math is asserted
// against hand-controlled numbers.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import type { PeriodOperational } from '../src/index.js'
import { computeMetricsRecord } from '../src/index.js'
import { FULL_BUNDLE, PRIOR_BUNDLE } from './fixtures.js'

// FULL_BUNDLE: tuition 700, totalExp 900.
// Operational: enrollment 100, studentsOnAid 40, aid 210.
//   cost_per_pupil            = 900 / 100        = 9
//   net_tuition_per_student   = (700 - 210) / 100 = 4.9
//   financial_aid_per_student = 210 / 100        = 2.1
//   aid_per_aided_student     = 210 / 40         = 5.25
//   tuition_discount_rate     = 210 / 700        = 0.3
//   pct_students_on_aid       = 40 / 100         = 0.4
const OP: PeriodOperational = {
  enrollment: 100,
  enrollmentFte: 95,
  studentsOnAid: 40,
  financialAidTotal: 210,
}

describe('Tier-2 operational metric arithmetic', () => {
  const r = computeMetricsRecord({ current: FULL_BUNDLE, currentOperational: OP })

  it('cost per pupil = totalExp / enrollment', () => {
    expect(r.cost_per_pupil.available).toBe(true)
    expect(r.cost_per_pupil.value).toBeCloseTo(9, 10)
    expect(r.cost_per_pupil.unit).toBe('currency')
    expect(r.cost_per_pupil.goodDirection).toBe('neutral')
    expect(r.cost_per_pupil.category).toBe('operational')
  })

  it('net tuition per student = (grossTuition - aid) / enrollment', () => {
    expect(r.net_tuition_per_student.available).toBe(true)
    expect(r.net_tuition_per_student.value).toBeCloseTo(4.9, 10)
    expect(r.net_tuition_per_student.goodDirection).toBe('higher')
  })

  it('financial aid per enrolled student = aid / enrollment', () => {
    expect(r.financial_aid_per_student.available).toBe(true)
    expect(r.financial_aid_per_student.value).toBeCloseTo(2.1, 10)
  })

  it('aid per aided student = aid / studentsOnAid', () => {
    expect(r.aid_per_aided_student.available).toBe(true)
    expect(r.aid_per_aided_student.value).toBeCloseTo(5.25, 10)
  })

  it('tuition discount rate = aid / grossTuition (0..1)', () => {
    expect(r.tuition_discount_rate.available).toBe(true)
    expect(r.tuition_discount_rate.value).toBeCloseTo(0.3, 10)
    expect(r.tuition_discount_rate.unit).toBe('percent')
    expect(r.tuition_discount_rate.goodDirection).toBe('lower')
  })

  it('% of students on aid = studentsOnAid / enrollment (0..1)', () => {
    expect(r.pct_students_on_aid.available).toBe(true)
    expect(r.pct_students_on_aid.value).toBeCloseTo(0.4, 10)
    expect(r.pct_students_on_aid.unit).toBe('percent')
  })
})

describe('Tier-2 available:false contract — no operational data', () => {
  const r = computeMetricsRecord({ current: FULL_BUNDLE })

  it('every Tier-2 metric is unavailable with the right inputsMissing', () => {
    expect(r.cost_per_pupil.available).toBe(false)
    expect(r.cost_per_pupil.value).toBeNull()
    expect(r.cost_per_pupil.inputsMissing).toEqual(['enrollment'])

    expect(r.net_tuition_per_student.available).toBe(false)
    expect(r.net_tuition_per_student.inputsMissing).toEqual(['financialAidTotal', 'enrollment'])

    expect(r.financial_aid_per_student.available).toBe(false)
    expect(r.financial_aid_per_student.inputsMissing).toEqual(['financialAidTotal', 'enrollment'])

    expect(r.aid_per_aided_student.available).toBe(false)
    expect(r.aid_per_aided_student.inputsMissing).toEqual(['financialAidTotal', 'studentsOnAid'])

    expect(r.tuition_discount_rate.available).toBe(false)
    expect(r.tuition_discount_rate.inputsMissing).toEqual(['financialAidTotal'])

    expect(r.pct_students_on_aid.available).toBe(false)
    expect(r.pct_students_on_aid.inputsMissing).toEqual(['studentsOnAid', 'enrollment'])
  })

  it('Tier-1 metrics remain available without operational data', () => {
    expect(r.operating_margin.available).toBe(true)
    expect(r.tuition_dependency.available).toBe(true)
  })
})

describe('Tier-2 partial inputs + zero-as-valid contract', () => {
  it('enrollment <= 0 is treated as missing (no divide-by-zero)', () => {
    const r = computeMetricsRecord({
      current: FULL_BUNDLE,
      currentOperational: { enrollment: 0, enrollmentFte: null, studentsOnAid: 10, financialAidTotal: 100 },
    })
    expect(r.cost_per_pupil.available).toBe(false)
    expect(r.cost_per_pupil.inputsMissing).toContain('enrollment')
    expect(r.pct_students_on_aid.available).toBe(false)
    expect(r.pct_students_on_aid.inputsMissing).toContain('enrollment')
  })

  it('financialAidTotal === 0 is a VALID value (zero-aid school)', () => {
    const r = computeMetricsRecord({
      current: FULL_BUNDLE,
      currentOperational: { enrollment: 100, enrollmentFte: null, studentsOnAid: 0, financialAidTotal: 0 },
    })
    // 0 aid -> discount rate 0%, aid per student $0 — both AVAILABLE, not hidden.
    expect(r.tuition_discount_rate.available).toBe(true)
    expect(r.tuition_discount_rate.value).toBe(0)
    expect(r.financial_aid_per_student.available).toBe(true)
    expect(r.financial_aid_per_student.value).toBe(0)
    // studentsOnAid 0 is NOT a usable denominator -> aid_per_aided_student missing.
    expect(r.aid_per_aided_student.available).toBe(false)
    expect(r.aid_per_aided_student.inputsMissing).toContain('studentsOnAid')
    // but pct_students_on_aid uses studentsOnAid as a NUMERATOR -> 0% is valid.
    expect(r.pct_students_on_aid.available).toBe(true)
    expect(r.pct_students_on_aid.value).toBe(0)
  })

  it('only the missing field is named when enrollment is present but aid is not', () => {
    const r = computeMetricsRecord({
      current: FULL_BUNDLE,
      currentOperational: { enrollment: 100, enrollmentFte: null, studentsOnAid: 40, financialAidTotal: null },
    })
    expect(r.financial_aid_per_student.inputsMissing).toEqual(['financialAidTotal'])
    expect(r.cost_per_pupil.available).toBe(true)
    expect(r.pct_students_on_aid.available).toBe(true)
  })
})

describe('Tier-2 period-over-period delta uses the PRIOR period operational data', () => {
  it('delta = cur metric - prior metric, each on its OWN operational data', () => {
    // cur cost_per_pupil = 900/100 = 9 ; prior = 950/95 = 10 ; delta = -1.
    const curOp: PeriodOperational = { enrollment: 100, enrollmentFte: null, studentsOnAid: 40, financialAidTotal: 210 }
    const priorOp: PeriodOperational = { enrollment: 95, enrollmentFte: null, studentsOnAid: 30, financialAidTotal: 200 }
    const r = computeMetricsRecord({
      current: FULL_BUNDLE,
      prior: PRIOR_BUNDLE,
      currentOperational: curOp,
      priorOperational: priorOp,
    })
    expect(r.cost_per_pupil.periodOverPeriodDelta).toBeCloseTo(9 - 950 / 95, 10)
  })

  it('delta is null when prior operational data is absent', () => {
    const curOp: PeriodOperational = { enrollment: 100, enrollmentFte: null, studentsOnAid: 40, financialAidTotal: 210 }
    const r = computeMetricsRecord({
      current: FULL_BUNDLE,
      prior: PRIOR_BUNDLE,
      currentOperational: curOp,
    })
    expect(r.cost_per_pupil.available).toBe(true)
    expect(r.cost_per_pupil.periodOverPeriodDelta).toBeNull()
  })
})

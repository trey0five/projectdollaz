// ─────────────────────────────────────────────────────────────
// Phase 4D — per-metric input breakdown (traceability for the drawer).
//
// Each metric names the SAME operands it already reads, with their actual values.
// Reported even when unavailable (value may be null).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { computeMetricsRecord } from '../src/index.js'
import type { PeriodOperational } from '../src/index.js'
import { FULL_BUNDLE, NO_SFP_BUNDLE } from './fixtures.js'

// FULL_BUNDLE: totalRev 1000, totalExp 900, netChange 100, tuition 700,
//              cash 1800, naWithout 1500.
const OP: PeriodOperational = {
  enrollment: 100,
  enrollmentFte: 95,
  studentsOnAid: 40,
  financialAidTotal: 210,
  teachingFte: null,
  totalStaffFte: null,
}

const named = (inputs: { key: string; value: number | null }[]) =>
  Object.fromEntries(inputs.map((i) => [i.key, i.value]))

describe('metric input breakdowns (FULL_BUNDLE + operational)', () => {
  const r = computeMetricsRecord({ current: FULL_BUNDLE, currentOperational: OP })

  it('operating_margin -> netChange + totalRev', () => {
    expect(named(r.operating_margin.inputs)).toEqual({ netChange: 100, totalRev: 1000 })
  })
  it('days_cash_on_hand -> cash + totalExp', () => {
    expect(named(r.days_cash_on_hand.inputs)).toEqual({ cash: 1800, totalExp: 900 })
  })
  it('months_operating_reserve -> naWithout + totalExp', () => {
    expect(named(r.months_operating_reserve.inputs)).toEqual({ naWithout: 1500, totalExp: 900 })
  })
  it('tuition_dependency -> tuition + totalRev', () => {
    expect(named(r.tuition_dependency.inputs)).toEqual({ tuition: 700, totalRev: 1000 })
  })
  it('cost_per_pupil -> totalExp + enrollment', () => {
    expect(named(r.cost_per_pupil.inputs)).toEqual({ totalExp: 900, enrollment: 100 })
  })
  it('net_tuition_per_student -> tuition + financialAidTotal + enrollment', () => {
    expect(named(r.net_tuition_per_student.inputs)).toEqual({
      tuition: 700,
      financialAidTotal: 210,
      enrollment: 100,
    })
  })
  it('financial_aid_per_student -> financialAidTotal + enrollment', () => {
    expect(named(r.financial_aid_per_student.inputs)).toEqual({
      financialAidTotal: 210,
      enrollment: 100,
    })
  })
  it('aid_per_aided_student -> financialAidTotal + studentsOnAid', () => {
    expect(named(r.aid_per_aided_student.inputs)).toEqual({
      financialAidTotal: 210,
      studentsOnAid: 40,
    })
  })
  it('tuition_discount_rate -> financialAidTotal + tuition', () => {
    expect(named(r.tuition_discount_rate.inputs)).toEqual({
      financialAidTotal: 210,
      tuition: 700,
    })
  })
  it('pct_students_on_aid -> studentsOnAid + enrollment', () => {
    expect(named(r.pct_students_on_aid.inputs)).toEqual({
      studentsOnAid: 40,
      enrollment: 100,
    })
  })
  it('revenue_mix / expense_mix carry the total operand', () => {
    expect(named(r.revenue_mix.inputs)).toEqual({ totalRev: 1000 })
    expect(named(r.expense_mix.inputs)).toEqual({ totalExp: 900 })
  })

  it('every input has a non-empty label and a unit', () => {
    for (const res of Object.values(r)) {
      for (const inp of res.inputs) {
        expect(typeof inp.label).toBe('string')
        expect(inp.label.length).toBeGreaterThan(0)
        expect(typeof inp.unit).toBe('string')
      }
    }
  })
})

describe('inputs reported even when unavailable', () => {
  it('days_cash_on_hand on a no-SFP bundle names cash (null) + totalExp', () => {
    const r = computeMetricsRecord({ current: NO_SFP_BUNDLE })
    expect(r.days_cash_on_hand.available).toBe(false)
    expect(named(r.days_cash_on_hand.inputs)).toEqual({ cash: null, totalExp: 480 })
  })
  it('cost_per_pupil with no operational names enrollment (null)', () => {
    const r = computeMetricsRecord({ current: FULL_BUNDLE })
    expect(r.cost_per_pupil.available).toBe(false)
    expect(named(r.cost_per_pupil.inputs)).toEqual({ totalExp: 900, enrollment: null })
  })
})

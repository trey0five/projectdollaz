import { describe, it, expect } from 'vitest'
import { computeTrend } from '../src/index.js'
import { SERIES } from './fixtures.js'

describe('computeTrend', () => {
  it('orders points oldest -> newest by periodEndDate', () => {
    const t = computeTrend('operating_margin', SERIES)
    expect(t.points.map((p) => p.periodEndDate)).toEqual([
      '2024-06-30',
      '2025-06-30',
      '2026-06-30',
    ])
  })

  it('carries metric metadata', () => {
    const t = computeTrend('days_cash_on_hand', SERIES)
    expect(t.metric).toBe('days_cash_on_hand')
    expect(t.unit).toBe('days')
    expect(t.goodDirection).toBe('higher')
  })

  it('emits null values for unavailable periods (NO_SFP) but keeps the point', () => {
    const t = computeTrend('days_cash_on_hand', SERIES)
    // FY24 (NO_SFP_BUNDLE) has no SFP => days cash null/unavailable.
    const fy24 = t.points.find((p) => p.periodEndDate === '2024-06-30')
    expect(fy24?.available).toBe(false)
    expect(fy24?.value).toBeNull()
    // FY26 (FULL_BUNDLE) available.
    const fy26 = t.points.find((p) => p.periodEndDate === '2026-06-30')
    expect(fy26?.available).toBe(true)
    expect(fy26?.value).toBeCloseTo(730, 6)
  })

  it('does not mutate the input series order', () => {
    const before = SERIES.map((s) => s.periodId)
    computeTrend('operating_margin', SERIES)
    expect(SERIES.map((s) => s.periodId)).toEqual(before)
  })

  it('handles an empty series', () => {
    const t = computeTrend('operating_margin', [])
    expect(t.points).toEqual([])
  })

  it('threads per-period operational data into Tier-2 trend points', () => {
    // FY25 (PRIOR_BUNDLE, totalExp 950) has operational data; FY26 (FULL_BUNDLE,
    // totalExp 900) has it too; FY24 (NO_SFP_BUNDLE) has NONE -> unavailable point.
    const series = [
      { ...SERIES[0], operational: { enrollment: 95, enrollmentFte: null, studentsOnAid: 30, financialAidTotal: 200, teachingFte: null, totalStaffFte: null } },
      { ...SERIES[1], operational: { enrollment: 100, enrollmentFte: null, studentsOnAid: 40, financialAidTotal: 210, teachingFte: null, totalStaffFte: null } },
      { ...SERIES[2] }, // FY24: no operational
    ]
    const t = computeTrend('cost_per_pupil', series)
    const fy25 = t.points.find((p) => p.periodEndDate === '2025-06-30')
    const fy26 = t.points.find((p) => p.periodEndDate === '2026-06-30')
    const fy24 = t.points.find((p) => p.periodEndDate === '2024-06-30')
    expect(fy25?.available).toBe(true)
    expect(fy25?.value).toBeCloseTo(950 / 95, 10)
    expect(fy26?.available).toBe(true)
    expect(fy26?.value).toBeCloseTo(900 / 100, 10)
    // No operational row for FY24 -> unavailable point (never a fabricated zero).
    expect(fy24?.available).toBe(false)
    expect(fy24?.value).toBeNull()
  })
})

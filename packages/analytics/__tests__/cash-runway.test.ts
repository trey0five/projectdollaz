// ─────────────────────────────────────────────────────────────
// Phase 2 — projectCashRunway: the pure 12-month days-cash shock projection that
// powers the cash-consequence clause of the cross-domain enrollment→tuition→cash
// briefing item. Total + never-throws: thin inputs → null, never an exception.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { projectCashRunway } from '../src/cashRunway.js'

const flat = (annual: number): number[] => Array.from({ length: 12 }, () => annual / 12)

describe('projectCashRunway — guards (never throw, null on thin inputs)', () => {
  it('null openingCash → null', () => {
    expect(
      projectCashRunway({ openingCash: null, monthlyNetCashflow: flat(0), annualExpense: 3650, shockAnnual: -100, threshold: 60 }),
    ).toBeNull()
  })
  it('missing monthly spread → null', () => {
    expect(
      projectCashRunway({ openingCash: 1000, monthlyNetCashflow: null, annualExpense: 3650, shockAnnual: -100, threshold: 60 }),
    ).toBeNull()
  })
  it('annualExpense <= 0 → null (undefined days-cash denominator)', () => {
    expect(
      projectCashRunway({ openingCash: 1000, monthlyNetCashflow: flat(0), annualExpense: 0, shockAnnual: -100, threshold: 60 }),
    ).toBeNull()
  })
})

describe('projectCashRunway — projection', () => {
  it('no breach when the balance stays above threshold', () => {
    // annualExpense 3650 → daily 10 → threshold 60 days = 600 cash. Opening 10000,
    // flat-zero net, tiny shock → never below 600.
    const r = projectCashRunway({
      openingCash: 10_000,
      monthlyNetCashflow: flat(0),
      annualExpense: 3650,
      shockAnnual: -1200,
      threshold: 60,
    })
    expect(r).not.toBeNull()
    expect(r!.firstMonthBelowThreshold).toBeNull()
    expect(r!.series).toHaveLength(12)
  })

  it('finds the FIRST month days-cash falls below the threshold', () => {
    // daily expense = 10 (annual 3650), threshold 60 → 600 floor. Opening 800, net 0,
    // shock −1200/yr = −100/month → balance 700,600,500,… crosses below 600 at month 2
    // (index 2 = Sep): 500/10 = 50 days < 60.
    const r = projectCashRunway({
      openingCash: 800,
      monthlyNetCashflow: flat(0),
      annualExpense: 3650,
      shockAnnual: -1200,
      threshold: 60,
    })
    expect(r).not.toBeNull()
    expect(r!.firstMonthBelowThreshold).not.toBeNull()
    expect(r!.firstMonthBelowThreshold!.monthIndex).toBe(2)
    expect(r!.firstMonthBelowThreshold!.monthLabel).toBe('Sep')
    expect(r!.firstMonthBelowThreshold!.daysCash).toBeCloseTo(50, 6)
  })

  it('a positive shock (surplus) pushes the balance UP (no breach)', () => {
    const r = projectCashRunway({
      openingCash: 700,
      monthlyNetCashflow: flat(0),
      annualExpense: 3650,
      shockAnnual: 1200,
      threshold: 60,
    })
    expect(r!.firstMonthBelowThreshold).toBeNull()
  })

  it('is deterministic — same inputs, byte-identical result', () => {
    const args = { openingCash: 800, monthlyNetCashflow: flat(0), annualExpense: 3650, shockAnnual: -1200, threshold: 60 }
    expect(projectCashRunway(args)).toEqual(projectCashRunway(args))
  })
})

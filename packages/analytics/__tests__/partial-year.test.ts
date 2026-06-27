import { describe, it, expect } from 'vitest'
import { computeMetricsRecord } from '../src/index.js'
import { FULL_BUNDLE } from './fixtures.js'

// ─────────────────────────────────────────────────────────────
// Partial-year parameterization guard (Monthly Actuals Foundation).
//
// days_cash_on_hand and months_operating_reserve gained an optional elapsed
// basis (elapsedDays / elapsedMonths). The ANNUAL path passes NEITHER, so the
// denominators must fall back to the full-year 365 / 12 constants and reproduce
// the pre-change numbers EXACTLY. The partial-year path divides by the elapsed
// basis instead.
// ─────────────────────────────────────────────────────────────
describe('partial-year metric parameterization', () => {
  it('WITHOUT elapsed* reproduces the full-year days_cash / months_reserve (byte-identical)', () => {
    const rec = computeMetricsRecord({ current: FULL_BUNDLE })

    const days = rec.days_cash_on_hand
    const months = rec.months_operating_reserve
    expect(days.available).toBe(true)
    expect(months.available).toBe(true)

    // The legacy expressions, recomputed here from the same inputs the metric
    // reads. If the `?? 365` / `?? 12` defaults ever drift, this fails.
    const cash = days.inputs.find((i) => i.key === 'cash')?.value as number
    const totalExpDays = days.inputs.find((i) => i.key === 'totalExp')?.value as number
    expect(days.value).toBe(cash / (totalExpDays / 365))

    const naWithout = months.inputs.find((i) => i.key === 'naWithout')?.value as number
    const totalExpMonths = months.inputs.find((i) => i.key === 'totalExp')?.value as number
    expect(months.value).toBe(naWithout / (totalExpMonths / 12))
  })

  it('WITH elapsed* annualizes off the elapsed basis (run-rate), not 365/12', () => {
    const elapsedDays = 153
    const elapsedMonths = 5
    const rec = computeMetricsRecord({
      current: FULL_BUNDLE,
      elapsedDays,
      elapsedMonths,
    })

    const days = rec.days_cash_on_hand
    const months = rec.months_operating_reserve

    const cash = days.inputs.find((i) => i.key === 'cash')?.value as number
    const totalExpDays = days.inputs.find((i) => i.key === 'totalExp')?.value as number
    expect(days.value).toBe(cash / (totalExpDays / elapsedDays))

    const naWithout = months.inputs.find((i) => i.key === 'naWithout')?.value as number
    const totalExpMonths = months.inputs.find((i) => i.key === 'totalExp')?.value as number
    expect(months.value).toBe(naWithout / (totalExpMonths / elapsedMonths))

    // The two bases are independent (153/365 != 5/12), proving we did NOT
    // collapse them into a single lossy fraction.
    expect(days.value).not.toBe(cash / (totalExpDays / ((elapsedMonths / 12) * 365)))
  })

  it('null elapsed* falls back to full-year (defensive ?? handling)', () => {
    const rec = computeMetricsRecord({
      current: FULL_BUNDLE,
      elapsedDays: null,
      elapsedMonths: null,
    })
    const ref = computeMetricsRecord({ current: FULL_BUNDLE })
    expect(rec.days_cash_on_hand.value).toBe(ref.days_cash_on_hand.value)
    expect(rec.months_operating_reserve.value).toBe(ref.months_operating_reserve.value)
  })
})

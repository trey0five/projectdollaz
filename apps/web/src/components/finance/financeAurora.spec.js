import { describe, it, expect } from 'vitest'
import { comparisonBasis, kpiCaption, NO_LAST_YEAR } from './financeAurora.js'

// ─────────────────────────────────────────────────────────────────────────────
// The Finance glass-card captions say WHICH year a change is against.
// Verifier 2026-10-15: every card read "Same as last year" on Sample 01, whose
// FY 2025 was never saved — the API (nearestPriorBundle) had diffed FY 2026
// with FY 2024. A school with no earlier saved year must not be told about
// "last year" at all.
// ─────────────────────────────────────────────────────────────────────────────
const P = (id, label, periodEndDate, hasSnapshot = true) => ({ id, label, periodEndDate, hasSnapshot })
const fy26 = P('26', 'FY 2026', '2026-06-30')
const fy25 = P('25', 'FY 2025', '2025-06-30')
const fy24 = P('24', 'FY 2024', '2024-06-30')
const fy23 = P('23', 'FY 2023', '2023-06-30')

describe('comparisonBasis — mirrors the API nearest-earlier-saved-year rule', () => {
  it('no earlier saved year → null', () => {
    expect(comparisonBasis([fy26], fy26)).toBeNull()
    expect(comparisonBasis([fy26, P('25', 'FY 2025', '2025-06-30', false)], fy26)).toBeNull()
    expect(comparisonBasis([], null)).toBeNull()
  })
  it('the immediately prior year → lastYear', () => {
    expect(comparisonBasis([fy26, fy25, fy24], fy26)).toEqual({ label: 'FY 2025', lastYear: true })
  })
  it('a gap year (FY 2025 never saved) → the older year, named', () => {
    expect(comparisonBasis([fy26, fy24, fy23], fy26)).toEqual({ label: 'FY 2024', lastYear: false })
  })
  it('only EARLIER years count, and the label formatter is applied', () => {
    expect(comparisonBasis([P('27', 'FY 2027', '2027-06-30'), fy26], fy26)).toBeNull()
    expect(comparisonBasis([fy26, fy25], fy26, (l) => `<${l}>`).label).toBe('<FY 2025>')
  })
})

describe('kpiCaption — honest about the comparison year', () => {
  const m = (d) => ({ available: true, periodOverPeriodDelta: d })
  it('no earlier saved year: says so, never "Same as last year"', () => {
    expect(kpiCaption(m(0), 'percent', 'Jun 30, 2026', null)).toBe(NO_LAST_YEAR)
    expect(kpiCaption(m(null), 'days', 'Jun 30, 2026', null)).toBe('No last-year numbers yet')
  })
  it('the immediately prior year: "last year"', () => {
    const basis = { label: 'FY 2025', lastYear: true }
    expect(kpiCaption(m(0), 'percent', null, basis)).toBe('Same as last year')
    expect(kpiCaption(m(0.004), 'percent', null, basis)).toBe('Up 0.4 pts on last year')
  })
  it('two years back: names the year', () => {
    const basis = { label: 'FY 2024', lastYear: false }
    expect(kpiCaption(m(0), 'percent', null, basis)).toBe('Same as FY 2024')
    expect(kpiCaption(m(-3), 'days', null, basis)).toBe('Down 3 on FY 2024')
    expect(kpiCaption(m(null), 'days', 'Jun 30, 2026', basis)).toBe('On Jun 30, 2026')
  })
})

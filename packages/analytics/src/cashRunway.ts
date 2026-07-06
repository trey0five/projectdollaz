// ─────────────────────────────────────────────────────────────
// @finrep/analytics — Phase-2 pure CASH-RUNWAY shock projection.
//
// PURE, TOTAL, NEVER-THROWS. Given an opening cash balance, a 12-month net-
// cashflow spread, an annual operating expense (the days-cash denominator), and a
// one-off ANNUAL shock (e.g. a tuition shortfall from below-plan enrollment),
// project the month-by-month cash balance and find the FIRST month whose implied
// days-cash-on-hand drops below a threshold. This is the cash consequence half of
// the cross-domain enrollment→tuition→cash briefing item — it consumes ONLY plain
// numbers (no DB, no clock), so the briefing can degrade gracefully around it.
//
// The shock is spread evenly across the 12 months (reuses driver.ts evenMonths, so
// the cent distribution matches the budget spread exactly). daysCash at each month
// end = runningBalance ÷ (annualExpense ÷ 365).
// ─────────────────────────────────────────────────────────────
import { evenMonths } from './driver.js'

/** Fiscal-year month labels (Jul-start), indexed 0..11 → 'Jul'..'Jun'. */
const FY_MONTH_LABELS = [
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
] as const

export interface CashRunwayInput {
  /** Opening (current) unrestricted cash balance. null → cannot project (returns null). */
  openingCash: number | null
  /** Net cashflow (revenue − expense) for each of the 12 fiscal months. */
  monthlyNetCashflow: number[] | null | undefined
  /** Annual operating expense — the days-cash denominator (÷365). Must be > 0. */
  annualExpense: number | null | undefined
  /** One-off ANNUAL shock applied evenly across the 12 months (negative = a loss). */
  shockAnnual: number
  /** Days-cash threshold that constitutes a breach (e.g. 60). */
  threshold: number
}

export interface CashRunwayBreach {
  /** 0-based fiscal month index (0 = Jul). */
  monthIndex: number
  /** Human month label, e.g. 'Mar'. */
  monthLabel: string
  /** The days-cash-on-hand at that month end (already below threshold). */
  daysCash: number
}

export interface CashRunwayResult {
  /** The first month whose days-cash falls below the threshold, or null if none do. */
  firstMonthBelowThreshold: CashRunwayBreach | null
  /** The running cash balance at each of the 12 month ends. */
  series: number[]
}

/**
 * Project a 12-month cash runway under a one-off annual shock and find the first
 * month days-cash drops below `threshold`. Returns null when the inputs are too
 * thin to project honestly (no opening cash, no monthly spread, or a non-positive
 * annual expense — which would make days-cash undefined/Infinity). Never throws.
 */
export function projectCashRunway(input: CashRunwayInput): CashRunwayResult | null {
  const { openingCash, monthlyNetCashflow, annualExpense, shockAnnual, threshold } = input
  if (
    openingCash === null ||
    openingCash === undefined ||
    !Number.isFinite(openingCash) ||
    !monthlyNetCashflow ||
    monthlyNetCashflow.length === 0 ||
    annualExpense === null ||
    annualExpense === undefined ||
    !(annualExpense > 0)
  ) {
    return null
  }

  const dailyExpense = annualExpense / 365
  const shockPerMonth = evenMonths(shockAnnual)
  const months = Math.min(12, monthlyNetCashflow.length)

  const series: number[] = []
  let firstMonthBelowThreshold: CashRunwayBreach | null = null
  let bal = openingCash
  for (let m = 0; m < months; m++) {
    const net = Number.isFinite(monthlyNetCashflow[m]) ? monthlyNetCashflow[m] : 0
    const shock = Number.isFinite(shockPerMonth[m]) ? shockPerMonth[m] : 0
    bal += net + shock
    series.push(bal)
    const daysCash = bal / dailyExpense
    if (firstMonthBelowThreshold === null && daysCash < threshold) {
      firstMonthBelowThreshold = {
        monthIndex: m,
        monthLabel: FY_MONTH_LABELS[m] ?? `M${m + 1}`,
        daysCash,
      }
    }
  }

  return { firstMonthBelowThreshold, series }
}

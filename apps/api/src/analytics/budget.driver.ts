// ─────────────────────────────────────────────────────────────
// Driver-budget spread builder. Turns a computed DriverBudgetResult into the
// EXACT synthetic-account spread shape MonthlySpreadGrid + budget-rollup
// consume ({acct,label,category,section,rollupLine,includedInTotals,months,
// annual}), so the Monthly Spread grid + Organizational Roll-up populate from a driver
// budget with zero per-consumer code.
//
// Each category becomes ONE synthetic GL row whose `acct` is a representative
// standard-chart account for that rollup line (so categoryOf(acct) maps it back to
// the intended category), carrying the even-12-month split and the category
// annual. This lives in the API (not @finrep/analytics) because it depends on
// @finrep/engine account NUMBERS; the pure package depends only on engine types.
// ─────────────────────────────────────────────────────────────
import { categoryOf } from '@finrep/engine'
import {
  REVENUE_LINE_LABELS,
  EXPENSE_LINE_LABELS,
  evenMonths,
  type DriverBudgetResult,
  type RevenueKey,
  type ExpenseKey,
} from '@finrep/analytics'

/** Representative standard-chart account# per rollup line (each maps back via categoryOf). */
const REVENUE_ACCT: Record<RevenueKey, number> = {
  tuition: 401,
  dev: 475,
  studAct: 440,
  textbook: 410,
  other: 419,
  support: 465,
  intlRev: 407,
  investments: 453,
  interest: 470,
}

const EXPENSE_ACCT: Record<ExpenseKey, number> = {
  instructional: 510,
  facilities: 700,
  fixedOther: 820,
  intlExp: 988,
  bus: 925,
  food: 935,
  studActExp: 0, // studActExp has no mapped standard-chart acct; synthetic-only row
  athletics: 950,
  admin: 600,
  restricted: 963,
}

export interface DriverSpreadAccount {
  acct: number
  label: string
  category: string
  section: 'revenue' | 'expense'
  rollupLine: string
  includedInTotals: boolean
  months: number[]
  annual: number
}

export interface DriverSpread {
  format: 'driver'
  computedAt: string
  fiscalYearStart: string | null
  monthKeys: string[]
  monthLabels: string[]
  accounts: DriverSpreadAccount[]
}

const MONTH_LABELS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']

/** 12 'YYYY-MM' keys for a Jul→Jun fiscal year starting at fiscalYearStart ('YYYY-07'). */
function monthKeysFor(fiscalYearStart: string | null): string[] {
  if (!fiscalYearStart || !/^\d{4}-\d{2}$/.test(fiscalYearStart)) {
    // Fall back to bare labels when we don't know the FY start.
    return MONTH_LABELS.map((_, i) => `m${i + 1}`)
  }
  const [ys, ms] = fiscalYearStart.split('-').map((x) => parseInt(x, 10))
  const keys: string[] = []
  let y = ys
  let m = ms
  for (let i = 0; i < 12; i++) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return keys
}

/**
 * Build the driver spread (format:'driver') from a computed result. Synthetic
 * rows carry section/rollupLine/includedInTotals so the grid groups + subtotals
 * and the rollup sums them by rollupLine, reconciling to lines.revenue/expense.
 */
export function buildDriverSpread(
  result: DriverBudgetResult,
  fiscalYearStart: string | null,
): DriverSpread {
  const accounts: DriverSpreadAccount[] = []

  for (const [key, annual] of Object.entries(result.revenue) as [RevenueKey, number][]) {
    if (annual === 0) continue // no all-zero synthetic rows (declutters the grid)
    const acct = REVENUE_ACCT[key]
    accounts.push({
      acct,
      label: REVENUE_LINE_LABELS[key],
      category: (categoryOf(acct) as string) ?? key,
      section: 'revenue',
      rollupLine: key,
      includedInTotals: true,
      months: evenMonths(annual),
      annual,
    })
  }

  for (const [key, annual] of Object.entries(result.expense) as [ExpenseKey, number][]) {
    if (annual === 0) continue // skip zero rows (also avoids the studActExp acct-0 row)
    const acct = EXPENSE_ACCT[key]
    accounts.push({
      acct,
      label: EXPENSE_LINE_LABELS[key],
      category: (acct ? (categoryOf(acct) as string) : null) ?? key,
      section: 'expense',
      rollupLine: key,
      includedInTotals: true,
      months: evenMonths(annual),
      annual,
    })
  }

  return {
    format: 'driver',
    computedAt: new Date().toISOString(),
    fiscalYearStart: fiscalYearStart ?? null,
    monthKeys: monthKeysFor(fiscalYearStart),
    monthLabels: MONTH_LABELS,
    accounts,
  }
}

/** Derive 'YYYY-07' fiscal-year-start from a period end date (Jul→Jun convention). */
export function deriveFiscalYearStart(periodEndDate: string): string | null {
  if (!/^\d{4}-\d{2}/.test(periodEndDate)) return null
  const y = parseInt(periodEndDate.slice(0, 4), 10)
  const m = parseInt(periodEndDate.slice(5, 7), 10)
  const startYear = m <= 6 ? y - 1 : y
  return `${startYear}-07`
}

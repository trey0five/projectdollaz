// ─────────────────────────────────────────────────────────────
// Pure budget-spread rollup. Maps parsed spread accounts -> SCoA
// categories -> rollup lines via @finrep/engine ONLY (no duplicated
// mapping), and folds them into the existing PeriodBudget.lines shape
// so Budget-vs-Actual (which reads lines.revenue/lines.expense keyed by
// rollupLine) keeps working unchanged.
//
// SIGN: amounts are summed AS-IS from the spread. A budget spread is
// entered in DISPLAY orientation (revenue positive; the 409 allowance is
// genuinely negative and nets inside tuition), so we do NOT multiply by
// SCoA def.sign — that metadata exists to flip credit-natural trial-
// balance numbers and would double-negate a budget here.
//
// TOTALS: PeriodBudget.totalRevenue/totalExpenses use the sheet's printed
// grand totals (authoritative, 5,383,000 in the diocesan sample) when the
// parser captured them, else fall back to the computed rollup sum.
// ─────────────────────────────────────────────────────────────
import { categoryOf, categoryDef } from '@finrep/engine'
import type { BudgetSpread } from '@finrep/ingestion'

export interface SpreadAccountAnnotated {
  acct: number
  label: string
  category: string // SCoaCategory | 'unmapped'
  section: 'revenue' | 'expense' | null
  rollupLine: string | null
  includedInTotals: boolean
  months: (number | null)[]
  annual: number
}

export interface SpreadRollup {
  revenue: Record<string, number>
  expense: Record<string, number>
  accounts: SpreadAccountAnnotated[]
  unmappedAccts: number[]
  /** Sum of included rollup lines (computed, deterministic). */
  computedRevenue: number
  computedExpense: number
  /** Authoritative grand totals (sheet printed totals if present, else computed). */
  totalRevenue: number
  totalExpenses: number
  reconciliation: {
    sheetRevenueTotal: number | null
    sheetExpenseTotal: number | null
    computedRevenue: number
    computedExpense: number
    revenueDelta: number
    expenseDelta: number
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Map + roll up a parsed BudgetSpread. Pure: spread in -> rollup out.
 * Reused by the import endpoint AND the org-rollup summation path.
 */
export function rollupSpread(spread: BudgetSpread): SpreadRollup {
  const revenue: Record<string, number> = {}
  const expense: Record<string, number> = {}
  const accounts: SpreadAccountAnnotated[] = []
  const unmappedAccts: number[] = []

  for (const a of spread.accounts) {
    const cat = categoryOf(a.acct)
    if (!cat) {
      // Keep the line visible on the spread; exclude from rollup totals.
      accounts.push({
        acct: a.acct,
        label: a.label,
        category: 'unmapped',
        section: null,
        rollupLine: null,
        includedInTotals: false,
        months: a.months,
        annual: a.annual,
      })
      if (a.annual) unmappedAccts.push(a.acct)
      continue
    }
    const def = categoryDef(cat)!
    accounts.push({
      acct: a.acct,
      label: a.label,
      category: cat,
      section: def.section,
      rollupLine: def.rollupLine || null,
      includedInTotals: def.includedInTotals,
      months: a.months,
      annual: a.annual,
    })
    if (!def.includedInTotals || !def.rollupLine) continue
    const bucket = def.section === 'revenue' ? revenue : expense
    bucket[def.rollupLine] = round2((bucket[def.rollupLine] ?? 0) + a.annual)
  }

  const computedRevenue = round2(Object.values(revenue).reduce((s, v) => s + v, 0))
  const computedExpense = round2(Object.values(expense).reduce((s, v) => s + v, 0))

  const sheetRev = spread.sheetTotals?.revenue ?? null
  const sheetExp = spread.sheetTotals?.expense ?? null
  const totalRevenue = sheetRev ?? computedRevenue
  const totalExpenses = sheetExp ?? computedExpense

  return {
    revenue,
    expense,
    accounts,
    unmappedAccts,
    computedRevenue,
    computedExpense,
    totalRevenue,
    totalExpenses,
    reconciliation: {
      sheetRevenueTotal: sheetRev,
      sheetExpenseTotal: sheetExp,
      computedRevenue,
      computedExpense,
      revenueDelta: round2(computedRevenue - (sheetRev ?? computedRevenue)),
      expenseDelta: round2(computedExpense - (sheetExp ?? computedExpense)),
    },
  }
}

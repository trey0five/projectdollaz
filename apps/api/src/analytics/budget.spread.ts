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
import type { SCoaCategory } from '@finrep/engine'
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
  /** How this row's category was resolved: GL account number vs. label keyword. */
  mappedBy?: 'acct' | 'keyword'
}

/**
 * Guess a SCoA category from an account NAME (label-only / acct=0 rows from
 * QuickBooks-style exports). First match wins; ORDER matters (specific terms
 * before generic so e.g. "interest expense" doesn't match revenue "interest").
 * Returns null when nothing matches — the line stays visible but unmapped.
 */
export function labelToCategory(label: string): SCoaCategory | null {
  const s = label.toLowerCase()

  // ── EXPENSE intercepts FIRST — these share keywords with revenue rules, so a
  // naive order would mis-route an expense into revenue (the worst error: it
  // distorts the revenue/expense split). Run them before any revenue test.
  // Compensation is always an expense — route by role.
  if (/salar|salaries|\bwage|payroll|stipend|\bpay\b/.test(s)) {
    if (/admin|office|principal|business\s*manager|clerical|secretar|bookkeep|development\s*(office|director|officer)/.test(s))
      return 'adminSal'
    if (/facilit|plant|maintenance|custodial|janitor|grounds|security|operations/.test(s))
      return 'facilSal'
    return 'instrSal' // teachers / faculty / aides / substitutes / default comp
  }
  if (/professional\s*development|staff\s*development|faculty\s*development|continuing\s*ed/.test(s))
    return 'instrSup'
  if (/development\s*(office|director|officer|department)/.test(s)) return 'adminCost'
  if (/interest\s*expense/.test(s)) return 'fixedOther'
  if (/depreciation|amortization|\bdebt\b|mortgage|\bloan\b|capital\s*(expenditure|outlay|expense|improvement)/.test(s))
    return 'fixedOther'
  if (/benefit|pension|payroll\s*tax|health\s*insurance|\bdental\b|retirement/.test(s)) return 'fixedOther'

  // ── REVENUE ──
  if (/tuition|registration/.test(s)) return 'tuition'
  if (/fundrais|donation|gift|gala|annual\s*fund|advancement|capital\s*campaign|\bdevelopment\s*(income|revenue|fund)\b|^development$/.test(s))
    return 'development'
  if (/support|parish|grant|subsid|diocesan|offertory/.test(s)) return 'support'
  if (/interest|dividend/.test(s)) return 'interest'
  if (/investment|endowment/.test(s)) return 'investments'
  if (/textbook/.test(s)) return 'textbook'

  // ── EXPENSE (non-compensation) ──
  if (/athletic|\bsports?\b/.test(s)) return 'athletics' // anchored so "transport" can't match
  if (/food|cafeteria|lunch|meal|nutrition/.test(s)) return 'food'
  if (/transport|\bbus(es)?\b/.test(s)) return 'bus'
  if (/facilit|plant|maintenance|utilit|janitor|custodial|building|repair|grounds|security|rent|lease/.test(s))
    return 'facilCost'
  if (/instruction|classroom|curriculum|teaching|\bbook/.test(s)) return 'instrSup'
  if (/admin|office|principal|management|legal|accounting|\baudit|professional\s*fee|\bdues\b|postage|advertis|marketing|insurance/.test(s))
    return 'adminCost'
  if (/restricted/.test(s)) return 'restricted'
  if (/international/.test(s)) return 'other'
  // NOTE: deliberately NO bare "fee" → tuition fallback — "bank/late/audit fees"
  // are expenses and would inflate revenue. Education fees say "registration".
  return null
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
    // acct>0  -> map by GL number (categoryOf), UNCHANGED (diocesan path).
    // acct===0 -> label-only row; guess the category from the account NAME.
    const mappedBy: 'acct' | 'keyword' = a.acct > 0 ? 'acct' : 'keyword'
    const cat = a.acct > 0 ? categoryOf(a.acct) : labelToCategory(a.label)
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
        mappedBy,
      })
      // unmappedAccts is a GL-number list; skip the meaningless 0 for label-only.
      if (a.annual && a.acct > 0) unmappedAccts.push(a.acct)
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
      mappedBy,
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

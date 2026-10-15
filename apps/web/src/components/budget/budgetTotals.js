// ─────────────────────────────────────────────────────────────────────────────
// budgetTotals — the ONE budget-vs-actual totals derivation for the Budget page
// (its band) and BudgetVsActual (its table). Budget figures are read straight
// from the period's SAVED budget JSON; actuals from the generated statements'
// revenue_mix / expense_mix metrics. Budgeted totals are summed over the
// statement LINES (the mix components) for the per-line rows, but the budget
// TOTALS are the plan's own totals (budgetPlanTotals — the SAME derivation the
// "Your budget" summary prints), so the band, the bridge and the summary can
// never disagree — even for a spread-only or top-line-only budget whose lines
// don't key to the statement mix. Pure — no React, no fetching.
// ─────────────────────────────────────────────────────────────────────────────

/** A line's budgeted amount, read directly from the saved budget JSON (null if unset). */
export function budOf(lines, kind, key) {
  const v = lines?.[kind]?.[key]
  return Number.isFinite(Number(v)) ? Number(v) : null
}

function sumValues(map) {
  if (!map) return 0
  return Object.values(map).reduce((s, v) => {
    const n = Number(v)
    return s + (Number.isFinite(n) ? n : 0)
  }, 0)
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/**
 * The plan's own totals — the ONE derivation BudgetSummary ("Your budget")
 * prints: prefer the driver-model KPIs; else sum the category rollups; else the
 * stored top-line totals (a spread import's totals live there). sumValues is 0
 * (not null) for an empty map, so `||` lets a real stored total win when there
 * is no by-category detail.
 */
export function budgetPlanTotals(budget) {
  const lines = budget?.lines ?? {}
  const kpis = lines.driverModel?.kpis ?? null
  const totalRevenue = kpis?.totalRevenue ?? (sumValues(lines.revenue) || num(budget?.totalRevenue))
  const totalExpense = kpis?.totalExpense ?? (sumValues(lines.expense) || num(budget?.totalExpenses))
  const netIncome = kpis?.netIncome ?? totalRevenue - totalExpense
  return { totalRevenue: num(totalRevenue), totalExpense: num(totalExpense), netIncome: num(netIncome) }
}

/**
 * Totals for one period (`budget` is the saved PeriodBudget — lines + stored
 * top-line totals):
 *   revLines / expLines   the statement lines (mix components)
 *   hasLines              statements exist with a revenue/expense breakdown
 *   actRevTotal / actExpTotal  actual totals (null when unavailable — never 0)
 *   budRevTotal / budExpTotal  the plan's budgeted totals (budgetPlanTotals)
 *   noBudget              nothing budgeted at all
 *   netBud / netAct       planned / actual left over (netAct null without actuals)
 */
export function budgetTotals(budget = null, metrics = []) {
  const metric = (k) => (metrics ?? []).find((x) => x.key === k)
  const revM = metric('revenue_mix')
  const expM = metric('expense_mix')
  const revLines = revM?.components ?? []
  const expLines = expM?.components ?? []
  const hasLines = revLines.length > 0 || expLines.length > 0
  const actRevTotal = revM?.available ? revM.value : null
  const actExpTotal = expM?.available ? expM.value : null
  const { totalRevenue: budRevTotal, totalExpense: budExpTotal } = budgetPlanTotals(budget)
  const noBudget = budRevTotal === 0 && budExpTotal === 0
  const netBud = budRevTotal - budExpTotal
  const netAct = actRevTotal != null && actExpTotal != null ? actRevTotal - actExpTotal : null
  return {
    revLines,
    expLines,
    hasLines,
    actRevTotal,
    actExpTotal,
    budRevTotal,
    budExpTotal,
    noBudget,
    netBud,
    netAct,
  }
}

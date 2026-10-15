/* global process */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import BudgetSummary from './BudgetSummary.jsx'
import { budgetPlanTotals, budgetTotals } from './budgetTotals.js'

// ─────────────────────────────────────────────────────────────────────────────
// THE BAND MAY NEVER CONTRADICT "YOUR BUDGET".
//
// The /budget band used to sum the budget only over lines keyed to the
// statements' mix components. A spread import (or a top-line budget) keeps its
// spending in the stored totals, so the band read "half set up. No spending in
// this budget yet." with Budgeted spending $0 — directly above a "Your budget"
// summary showing Total spending $2,457,100. The band, the Budget-vs-actual
// bridge and its "vs. plan" pill now read budgetPlanTotals — the SAME function
// BudgetSummary prints.
// ─────────────────────────────────────────────────────────────────────────────

// Statements whose mix keys do NOT match anything the budget is keyed by.
const METRICS = [
  { key: 'revenue_mix', available: true, value: 4_800_000, components: [{ key: 'tuition_fees', label: 'Tuition', value: 4_800_000 }] },
  { key: 'expense_mix', available: true, value: 4_370_000, components: [{ key: 'salaries', label: 'Salaries', value: 4_370_000 }] },
]

const SPREAD_ONLY = {
  totalRevenue: '4360000.00',
  totalExpenses: '2600000.00',
  lines: { spread: { format: 'driver', accounts: [] } },
}

// The live Sample-01 shape: income by category, spending only in the stored total.
const TOP_LINE_SPENDING = {
  totalRevenue: '4545850.00',
  totalExpenses: '2457100.00',
  lines: { revenue: { tuition: 5_000_000 }, expense: {} },
}

describe('budget band totals agree with the "Your budget" summary', () => {
  it('a spread-only budget: band totals = summary totals, never $0 spending', async () => {
    const t = budgetTotals(SPREAD_ONLY, METRICS)
    const p = budgetPlanTotals(SPREAD_ONLY)
    expect(t.budRevTotal).toBe(4_360_000)
    expect(t.budExpTotal).toBe(2_600_000)
    expect(t.budRevTotal).toBe(p.totalRevenue)
    expect(t.budExpTotal).toBe(p.totalExpense)
    expect(t.netBud).toBe(p.netIncome)
    expect(t.noBudget).toBe(false)

    render(<BudgetSummary budget={SPREAD_ONLY} canEdit={false} />)
    // Total money in / Total spending count up on mount — wait for the settle.
    const wait = { timeout: 10000 }
    expect((await screen.findAllByText('$4,360,000', {}, wait)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('$2,600,000', {}, wait)).length).toBeGreaterThan(0)
    expect(screen.getAllByText('$1,760,000').length).toBeGreaterThan(0)
  }, 25000)

  it('spending kept only in the stored total still counts (no false "No spending")', () => {
    const t = budgetTotals(TOP_LINE_SPENDING, METRICS)
    expect(t.budRevTotal).toBe(5_000_000)
    expect(t.budExpTotal).toBe(2_457_100)
    expect(t.netBud).toBe(2_542_900)
    // The bridge's identity holds on the same totals.
    const revVar = t.actRevTotal - t.budRevTotal
    const expVar = t.actExpTotal - t.budExpTotal
    expect(t.netBud + revVar - expVar).toBeCloseTo(t.netAct)
  })

  it('an empty budget is still "no budget"', () => {
    expect(budgetTotals({ lines: {} }, METRICS).noBudget).toBe(true)
    expect(budgetTotals(null, METRICS).noBudget).toBe(true)
  })

  it('BudgetPage and BudgetVsActual hand budgetTotals the whole budget (not just its lines)', () => {
    const at = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8')
    for (const src of [at('src/pages/BudgetPage.jsx'), at('src/components/analytics/BudgetVsActual.jsx')]) {
      expect(src).toMatch(/budgetTotals\(budget, metrics\)/)
    }
  })
})

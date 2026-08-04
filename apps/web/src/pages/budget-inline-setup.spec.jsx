/* global process */
// `process` is declared explicitly rather than disabling no-undef: apps/web's
// eslint config is browser-scoped, and this spec reads its subjects off disk in
// the node-side vitest context (same pattern as wizard-finish.spec.jsx).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// SET UP THE BUDGET WHERE YOU ARE.
//
// /budget's Budget tab used to be "view-only — setup lives in the Data hub",
// with every CTA navigating to /data. Under ui.v2, /data is a redirect that
// DROPS QUERY STRINGS, so the budget ask landed on the trial-balance chooser:
// the wrong wizard, one hop from where the user already was. The fix mounts
// BudgetSetup (the SAME component the Add-data wizard embeds — one setup
// surface, two doors) directly in the Budget tab, and BudgetVsActual's
// no-budget CTA flips to the Budget tab instead of leaving the page.
//
// Proven RED before the fix: BudgetPage imported BudgetSummary (not BudgetSetup),
// carried two navigate('/data') calls, and BudgetVsActual's no-budget branch
// linked to="/data" — every assertion below failed.
// ─────────────────────────────────────────────────────────────────────────────

const at = (rel) => resolve(process.cwd(), rel)
const BUDGET_PAGE = readFileSync(at('src/pages/BudgetPage.jsx'), 'utf8')
const BVA = readFileSync(at('src/components/analytics/BudgetVsActual.jsx'), 'utf8')

describe('BudgetPage — the Budget tab mounts the real setup surface', () => {
  it('imports BudgetSetup (the same component the Add-data wizard embeds)', () => {
    expect(BUDGET_PAGE).toMatch(/import BudgetSetup from/)
  })

  it('renderBudget mounts <BudgetSetup', () => {
    const start = BUDGET_PAGE.indexOf('const renderBudget = ')
    expect(start, 'renderBudget not found — was it renamed?').toBeGreaterThan(-1)
    const end = BUDGET_PAGE.indexOf('\n  const render', start + 1)
    expect(end, 'could not delimit renderBudget').toBeGreaterThan(start)
    expect(BUDGET_PAGE.slice(start, end)).toMatch(/<BudgetSetup/)
  })

  it('never navigates or links to /data (the redirect strips query strings)', () => {
    expect(BUDGET_PAGE).not.toMatch(/navigate\(\s*['"`]\/data['"`]\s*\)/)
    expect(BUDGET_PAGE).not.toMatch(/['"`]\/data['"`]/)
  })

  it('never mentions the retired Data hub', () => {
    expect(BUDGET_PAGE).not.toMatch(/data hub/i)
  })
})

describe('BudgetVsActual — the no-budget CTA sets up in place', () => {
  /** The noBudget branch: from the `noBudget ?` ternary arm to the `) : (` that
   *  opens the has-budget arm. */
  function noBudgetBranch() {
    const start = BVA.indexOf('noBudget ? (')
    expect(start, 'noBudget branch not found — was the ternary restructured?').toBeGreaterThan(-1)
    const end = BVA.indexOf(') : (', start)
    expect(end, 'could not delimit the noBudget branch').toBeGreaterThan(start)
    return BVA.slice(start, end)
  }

  it('offers an onSetUp action (BudgetPage wires it to its own Budget tab)', () => {
    expect(noBudgetBranch()).toMatch(/onSetUp/)
  })

  it('never links to /data', () => {
    expect(noBudgetBranch()).not.toMatch(/['"`]\/data['"`]/)
    expect(BVA).not.toMatch(/to=["']\/data["']/)
  })

  it('never mentions the retired Data hub in rendered copy', () => {
    // Strip comments — the file-top prose may lawfully describe history; the
    // RENDERED strings may not.
    const code = BVA.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')
    expect(code).not.toMatch(/data hub/i)
  })
})

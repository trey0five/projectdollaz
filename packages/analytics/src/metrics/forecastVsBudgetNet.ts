import type { MetricDef } from '../types.js'

/**
 * Forecast vs Budget (Net) =
 *   ((forecast rev − forecast exp) − (budget rev − budget exp)) ÷ budget rev.
 *
 * Phase 6 — the FIRST 'planning'-domain metric: how far the saved FY-end
 * forecast's projected NET result has slipped from (or beaten) the budgeted net,
 * NORMALIZED by budgeted revenue so it is bandable and rolls up honestly at org
 * scope (all four operands are extensive $; the raw dollar nets are preserved in
 * inputs[] so the drawer/board see dollars while the band sees a percent).
 *
 * The four $ figures are API-THREADED onto PeriodOperational (budget row totals +
 * `lines.forecast.projected.kpis`), exactly the enrollmentPlan precedent — the
 * metric layer stays pure. Available ONLY when all four are non-null AND
 * budgetTotalRevenue > 0 (the normalizer guard). inputsMissing is coarse by
 * SOURCE — 'forecast' when either forecast figure is absent (no forecast saved),
 * 'budget' when either budget figure is absent/unusable — matching how the UI
 * fixes it (save a forecast / save a budget), not per-field noise.
 *
 * scopeAggregation 'recompute-from-components': all four operands are extensive
 * $, so the org value is the metric's OWN formula on the sums.
 */
export const forecastVsBudgetNet: MetricDef = {
  key: 'forecast_vs_budget_net',
  label: 'Forecast vs Budget (Net)',
  boardLabel: 'Forecast vs Budget (Net)',
  unit: 'percent',
  category: 'profitability',
  goodDirection: 'higher',
  domain: 'planning',
  scopeAggregation: 'recompute-from-components',
  inputs: [
    { key: 'forecastNet', source: 'operational', label: 'Forecast net (projected)' },
    { key: 'budgetNet', source: 'operational', label: 'Budget net' },
  ],
  basis: 'Projected FY-end net result vs the budgeted net, as a share of budgeted revenue. Needs a saved budget and a saved FY-end forecast.',
  formula: '(Forecast net − Budget net) ÷ Budgeted revenue',
  description: 'How far the FY-end forecast’s net result runs ahead of (or behind) the budgeted net, relative to budgeted revenue.',
  compute(_cur, _prior, curOp) {
    const fRev = curOp?.forecastTotalRevenue ?? null
    const fExp = curOp?.forecastTotalExpense ?? null
    const bRev = curOp?.budgetTotalRevenue ?? null
    const bExp = curOp?.budgetTotalExpense ?? null
    // The $ nets are the named operands (currency) so the drawer/board and the
    // /planning chart read real dollars off inputs[] — no side-channel fetch.
    const forecastNet = fRev !== null && fExp !== null ? fRev - fExp : null
    const budgetNet = bRev !== null && bExp !== null ? bRev - bExp : null
    const inputs = [
      { key: 'forecastNet', label: 'Forecast net (projected)', value: forecastNet, unit: 'currency' as const },
      { key: 'budgetNet', label: 'Budget net', value: budgetNet, unit: 'currency' as const },
    ]
    const missing: string[] = []
    if (fRev === null || fExp === null) missing.push('forecast')
    // Budget revenue is also the normalizer: absent OR <= 0 → no defensible ratio.
    if (bRev === null || bExp === null || bRev <= 0) missing.push('budget')
    if (missing.length > 0 || forecastNet === null || budgetNet === null || bRev === null || bRev <= 0) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return {
      value: (forecastNet - budgetNet) / bRev,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}

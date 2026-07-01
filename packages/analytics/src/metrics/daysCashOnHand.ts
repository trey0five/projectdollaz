import type { MetricDef } from '../types.js'

/**
 * Days cash on hand = unrestricted operating cash ÷ (total expenses ÷ 365).
 * Higher is better. Requires a current-year SFP (for cash) and totalExp > 0.
 *
 * Basis caveat: at 4A granularity totalExp is the cash-operating-expense proxy
 * (depreciation is not separately removed), so the figure is conservative. The
 * DoD only requires days >= 0, which holds for non-negative cash.
 */
export const daysCashOnHand: MetricDef = {
  key: 'days_cash_on_hand',
  label: 'Days Cash on Hand',
  unit: 'days',
  category: 'liquidity',
  goodDirection: 'higher',
  domain: 'finance',
  // Org = Σcash / (Σexp/365) — cash-weighted by construction.
  scopeAggregation: 'recompute-from-components',
  inputs: [
    { key: 'cash', source: 'financials', label: 'Unrestricted cash' },
    { key: 'totalExp', source: 'financials', label: 'Total expenses' },
  ],
  basis:
    'Unrestricted cash ÷ (total expenses ÷ 365). Uses total expenses as the cash op-ex proxy (depreciation not separately removed).',
  formula: 'Unrestricted cash ÷ (Total expenses ÷ 365)',
  description: 'How many days of operating expenses the school could cover from cash.',
  compute(cur) {
    const missing: string[] = []
    if (!cur.hasSFP || cur.cash === null) missing.push('cash')
    if (cur.totalExp === 0) missing.push('totalExp')
    const inputs = [
      { key: 'cash', label: 'Unrestricted cash', value: cur.cash, unit: 'currency' as const },
      { key: 'totalExp', label: 'Total expenses', value: cur.totalExp, unit: 'currency' as const },
    ]
    if (missing.length > 0) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    // cur.cash is non-null here (guarded above). For a partial-year (monthly)
    // YTD, totalExp covers only the elapsed days, so annualize off elapsedDays
    // instead of 365 to keep the run-rate honest. Annual path: elapsedDays is
    // undefined => `?? 365` => exact same expression as before (byte-identical).
    const days = cur.elapsedDays ?? 365
    return {
      value: (cur.cash as number) / (cur.totalExp / days),
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}

import type { MetricDef, MixComponent } from '../types.js'
import { EXPENSE_LINE_KEYS, EXPENSE_LINE_LABELS } from '../adapt.js'

/**
 * Expense mix = each expense rollup line as a share of total expenses.
 * Breakdown metric (drives the expense donut). Unavailable when totalExp is 0.
 * The engine excludes 'ancillary' from totals, so it never appears here.
 * `value` carries totalExp; shares are in `components` (each line ÷ totalExp).
 *
 * Shares are returned at FULL float precision and are NOT rounded here — rounding
 * is a UI-layer concern. Each share divides by the same denominator (totalExp),
 * so the raw shares are reproducible and sum to 1 up to float epsilon.
 */
export const expenseMix: MetricDef = {
  key: 'expense_mix',
  label: 'Expense Mix',
  unit: 'share',
  category: 'expense-mix',
  goodDirection: 'neutral',
  basis: 'Each expense category as a share of total expenses.',
  formula: 'Each expense category ÷ Total expenses',
  description: 'Where the school’s money goes, by expense category.',
  compute(cur) {
    const inputs = [
      { key: 'totalExp', label: 'Total expenses', value: cur.totalExp, unit: 'currency' as const },
    ]
    if (cur.totalExp === 0) {
      return { value: null, available: false, inputsMissing: ['totalExp'], inputs }
    }
    const components: MixComponent[] = EXPENSE_LINE_KEYS.map((k) => {
      const value = cur.expenseLines[k]
      return {
        key: k,
        label: EXPENSE_LINE_LABELS[k],
        value,
        share: value / cur.totalExp,
      }
    })
    return {
      value: cur.totalExp,
      available: true,
      inputsMissing: [],
      components,
      inputs,
    }
  },
}

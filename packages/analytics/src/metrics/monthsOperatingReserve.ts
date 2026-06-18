import type { MetricDef } from '../types.js'

/**
 * Months of operating reserve = unrestricted net assets ÷ (annual op-ex ÷ 12).
 * Higher is better. Requires a current-year SFP (for naWithout) and totalExp > 0.
 */
export const monthsOperatingReserve: MetricDef = {
  key: 'months_operating_reserve',
  label: 'Months of Operating Reserve',
  unit: 'months',
  category: 'reserves',
  goodDirection: 'higher',
  basis: 'Unrestricted net assets ÷ (total expenses ÷ 12).',
  formula: 'Unrestricted net assets ÷ (Total expenses ÷ 12)',
  description: 'Months of operations the school could fund from unrestricted reserves.',
  compute(cur) {
    const missing: string[] = []
    if (!cur.hasSFP || cur.naWithout === null) missing.push('naWithout')
    if (cur.totalExp === 0) missing.push('totalExp')
    const inputs = [
      { key: 'naWithout', label: 'Net assets without restrictions', value: cur.naWithout, unit: 'currency' as const },
      { key: 'totalExp', label: 'Total expenses', value: cur.totalExp, unit: 'currency' as const },
    ]
    if (missing.length > 0) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return {
      value: (cur.naWithout as number) / (cur.totalExp / 12),
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}

import type { MetricDef } from '../types.js'

/**
 * Tuition discount rate = financial aid total ÷ gross tuition. 0..1.
 * Lower is better (a high discount rate erodes net tuition). The SOA tuition
 * rollup line (PeriodFinancials.tuition) IS gross tuition revenue.
 *
 * Requires financialAidTotal present (0 is valid -> a 0% discount rate) and gross
 * tuition > 0. Missing inputs named precisely; never a fabricated zero.
 */
export const tuitionDiscountRate: MetricDef = {
  key: 'tuition_discount_rate',
  label: 'Tuition Discount Rate',
  unit: 'percent',
  category: 'operational',
  goodDirection: 'lower',
  domain: 'aid',
  // Org = Σaid / Σtuition — recompute on extensive components, not avg of rates.
  scopeAggregation: 'recompute-from-components',
  inputs: [
    { key: 'financialAidTotal', source: 'operational', label: 'Financial aid' },
    { key: 'tuition', source: 'financials', label: 'Gross tuition' },
  ],
  basis: 'Total financial aid ÷ gross tuition. Tuition rollup line = gross tuition.',
  formula: 'Financial aid ÷ Gross tuition',
  description: 'Share of gross tuition given back as aid — a high rate erodes net tuition.',
  compute(cur, _prior, curOp) {
    const missing: string[] = []
    const aid = curOp?.financialAidTotal ?? null
    if (aid === null) missing.push('financialAidTotal')
    if (cur.tuition <= 0) missing.push('tuition')
    const inputs = [
      { key: 'financialAidTotal', label: 'Financial aid', value: aid, unit: 'currency' as const },
      { key: 'tuition', label: 'Gross tuition', value: cur.tuition, unit: 'currency' as const },
    ]
    if (missing.length > 0 || aid === null) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return {
      value: aid / cur.tuition,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}

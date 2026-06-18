import type { MetricDef } from '../types.js'

/**
 * Operating margin = (Revenue - Expenses) / Revenue = netChange / totalRev.
 * Higher is better. Unavailable when totalRev is 0 (divide-by-zero denominator).
 */
export const operatingMargin: MetricDef = {
  key: 'operating_margin',
  label: 'Operating Margin',
  unit: 'percent',
  category: 'profitability',
  goodDirection: 'higher',
  basis: '(Total revenue − total expenses) ÷ total revenue.',
  formula: '(Total revenue − Total expenses) ÷ Total revenue',
  description: 'Share of revenue left after operating expenses — a positive surplus.',
  compute(cur) {
    const inputs = [
      { key: 'netChange', label: 'Change in net assets', value: cur.netChange, unit: 'currency' as const },
      { key: 'totalRev', label: 'Total revenue', value: cur.totalRev, unit: 'currency' as const },
    ]
    if (cur.totalRev === 0) {
      return { value: null, available: false, inputsMissing: ['totalRev'], inputs }
    }
    return {
      value: cur.netChange / cur.totalRev,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}

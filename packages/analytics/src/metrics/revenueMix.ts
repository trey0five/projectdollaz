import type { MetricDef, MixComponent } from '../types.js'
import { REVENUE_LINE_KEYS, REVENUE_LINE_LABELS } from '../adapt.js'

/**
 * Revenue mix = each revenue rollup line as a share of total revenue.
 * Breakdown metric (drives the revenue donut). Unavailable when totalRev is 0.
 * `value` carries totalRev so the UI can show the total; shares are in
 * `components` (each line ÷ totalRev), summing to ~1.
 *
 * Shares are returned at FULL float precision (e.g. 0.0414746543...). The package
 * intentionally does NOT round — share rounding is a UI-layer concern. Because
 * each share is `line / totalRev` against the same denominator, the raw shares
 * are reproducible and sum to exactly 1 up to IEEE-754 float epsilon; any visible
 * "99.9% / 100.1%" drift would come from inconsistent display rounding, not here.
 */
export const revenueMix: MetricDef = {
  key: 'revenue_mix',
  label: 'Revenue Mix',
  unit: 'share',
  category: 'revenue-mix',
  goodDirection: 'neutral',
  basis: 'Each revenue category as a share of total revenue.',
  formula: 'Each revenue category ÷ Total revenue',
  description: 'Where the school’s revenue comes from, by category.',
  compute(cur) {
    const inputs = [
      { key: 'totalRev', label: 'Total revenue', value: cur.totalRev, unit: 'currency' as const },
    ]
    if (cur.totalRev === 0) {
      return { value: null, available: false, inputsMissing: ['totalRev'], inputs }
    }
    const components: MixComponent[] = REVENUE_LINE_KEYS.map((k) => {
      const value = cur.revenueLines[k]
      return {
        key: k,
        label: REVENUE_LINE_LABELS[k],
        value,
        share: value / cur.totalRev,
      }
    })
    return {
      value: cur.totalRev,
      available: true,
      inputsMissing: [],
      components,
      inputs,
    }
  },
}

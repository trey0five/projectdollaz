import type { MetricDef } from '../types.js'

/**
 * Forecast operating margin = (forecast rev − forecast exp) ÷ forecast rev.
 *
 * Phase 6 ('planning' domain) — the FY-end forecast's projected margin, the
 * forward-looking twin of operating_margin: a PROJECTED deficit is as actionable
 * as an actual one, so it carries operating_margin's exact band. Reads the
 * API-threaded forecast $ figures off PeriodOperational
 * (`lines.forecast.projected.kpis`, enrollmentPlan threading precedent) — pure.
 *
 * Available ONLY when both forecast figures are non-null AND
 * forecastTotalRevenue > 0 (divide-by-zero guard). Never a fabricated 0.
 *
 * scopeAggregation 'recompute-from-components': both operands are extensive $,
 * so org = (ΣfRev − ΣfExp) ÷ ΣfRev — the consolidated projected margin, never an
 * average of per-school margins.
 */
export const forecastOperatingMargin: MetricDef = {
  key: 'forecast_operating_margin',
  label: 'Forecast Operating Margin',
  boardLabel: 'Forecast Operating Margin',
  unit: 'percent',
  category: 'profitability',
  goodDirection: 'higher',
  domain: 'planning',
  scopeAggregation: 'recompute-from-components',
  inputs: [
    { key: 'forecastTotalRevenue', source: 'operational', label: 'Forecast revenue (projected)' },
    { key: 'forecastTotalExpense', source: 'operational', label: 'Forecast expenses (projected)' },
  ],
  basis: 'Projected FY-end margin from the saved forecast, not actuals.',
  formula: '(Forecast revenue − Forecast expenses) ÷ Forecast revenue',
  description: 'The operating margin your saved FY-end forecast projects for this period.',
  compute(_cur, _prior, curOp) {
    const fRev = curOp?.forecastTotalRevenue ?? null
    const fExp = curOp?.forecastTotalExpense ?? null
    const inputs = [
      { key: 'forecastTotalRevenue', label: 'Forecast revenue (projected)', value: fRev, unit: 'currency' as const },
      { key: 'forecastTotalExpense', label: 'Forecast expenses (projected)', value: fExp, unit: 'currency' as const },
    ]
    const missing: string[] = []
    // Revenue is the denominator: absent OR <= 0 → no defensible margin.
    if (fRev === null || fRev <= 0) missing.push('forecastTotalRevenue')
    if (fExp === null) missing.push('forecastTotalExpense')
    if (missing.length > 0 || fRev === null || fRev <= 0 || fExp === null) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return {
      value: (fRev - fExp) / fRev,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}

import type { MetricDef } from '../types.js'

/**
 * SAT Total = Σ(student totals) ÷ students tested.
 *
 * The ACT's sibling, on the 400–1600 scale. Same extensive-components rule and
 * same reason (see act_composite): the org value is Σscore ÷ Σtested, weighted
 * by who actually sat the exam.
 *
 * A school reports one exam, the other, or both — each metric stands alone and
 * resolves available:false when its own testers are absent, so a
 * predominantly-ACT school never shows a fabricated SAT figure.
 *
 * Bands: ~1050 is close to the national mean; 1200 is a strong school average.
 */
export const satTotal: MetricDef = {
  key: 'sat_total',
  label: 'SAT Total',
  unit: 'ratio',
  category: 'operational',
  goodDirection: 'higher',
  domain: 'academics',
  scopeAggregation: 'recompute-from-components',
  inputs: [
    { key: 'satScoreSum', source: 'operational', label: 'Sum of SAT totals' },
    { key: 'satTestedCount', source: 'operational', label: 'Students tested (SAT)' },
  ],
  basis: 'Average SAT total across every student who sat the exam in the period.',
  formula: 'Σ SAT total scores ÷ students tested',
  description: 'Average SAT total score (400–1600).',
  compute(_cur, _prior, curOp) {
    const sum = curOp?.satScoreSum ?? null
    const tested = curOp?.satTestedCount ?? null
    const inputs = [
      { key: 'satScoreSum', label: 'Sum of SAT totals', value: sum, unit: 'ratio' as const },
      { key: 'satTestedCount', label: 'Students tested (SAT)', value: tested, unit: 'ratio' as const },
    ]
    const missing: string[] = []
    if (sum === null) missing.push('satScoreSum')
    if (tested === null || tested <= 0) missing.push('satTestedCount')
    if (missing.length > 0 || sum === null || tested === null || tested <= 0) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return { value: sum / tested, available: true, inputsMissing: [], inputs }
  },
}

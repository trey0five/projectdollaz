import type { MetricDef } from '../types.js'

/**
 * Cost per pupil = total operating expenses ÷ enrollment (headcount).
 * Contextual (neutral). Requires operational enrollment > 0. When enrollment is
 * absent/null/<=0 the metric is unavailable (never a fabricated zero).
 */
export const costPerPupil: MetricDef = {
  key: 'cost_per_pupil',
  label: 'Cost per Pupil',
  boardLabel: 'Avg Cost / Student',
  unit: 'currency',
  category: 'operational',
  goodDirection: 'neutral',
  domain: 'operations',
  // Org = Σexp / Σenrollment — the enrollment-weighted mean of per-school
  // cost-per-pupil (recompute path; 'weighted' is the honest label).
  scopeAggregation: 'weighted-by-components',
  inputs: [
    { key: 'totalExp', source: 'financials', label: 'Total expenses' },
    { key: 'enrollment', source: 'operational', label: 'Enrollment' },
  ],
  basis: 'Total expenses ÷ enrollment (headcount).',
  formula: 'Total expenses ÷ Enrollment',
  description: 'Average operating cost to educate one enrolled student.',
  compute(cur, _prior, curOp) {
    const enrollment = curOp?.enrollment ?? null
    const inputs = [
      { key: 'totalExp', label: 'Total expenses', value: cur.totalExp, unit: 'currency' as const },
      { key: 'enrollment', label: 'Enrollment', value: enrollment, unit: 'ratio' as const },
    ]
    if (!curOp || enrollment === null || enrollment <= 0) {
      return { value: null, available: false, inputsMissing: ['enrollment'], inputs }
    }
    return {
      value: cur.totalExp / enrollment,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}

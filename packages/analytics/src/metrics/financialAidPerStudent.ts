import type { MetricDef } from '../types.js'

/**
 * Financial aid per enrolled student = financial aid total ÷ enrollment.
 * Contextual (neutral). Requires financialAidTotal present (0 is valid) and
 * enrollment > 0. Missing inputs named precisely; never a fabricated zero.
 */
export const financialAidPerStudent: MetricDef = {
  key: 'financial_aid_per_student',
  label: 'Aid per Enrolled Student',
  unit: 'currency',
  category: 'operational',
  goodDirection: 'neutral',
  domain: 'aid',
  // Org = Σaid / Σenrollment — enrollment-weighted mean.
  scopeAggregation: 'weighted-by-components',
  inputs: [
    { key: 'financialAidTotal', source: 'operational', label: 'Financial aid' },
    { key: 'enrollment', source: 'operational', label: 'Enrollment' },
  ],
  basis: 'Total financial aid ÷ enrollment (all enrolled students).',
  formula: 'Financial aid ÷ Enrollment',
  description: 'Average aid spread across every enrolled student.',
  compute(_cur, _prior, curOp) {
    const missing: string[] = []
    const aid = curOp?.financialAidTotal ?? null
    const enrollment = curOp?.enrollment ?? null
    if (aid === null) missing.push('financialAidTotal')
    if (enrollment === null || enrollment <= 0) missing.push('enrollment')
    const inputs = [
      { key: 'financialAidTotal', label: 'Financial aid', value: aid, unit: 'currency' as const },
      { key: 'enrollment', label: 'Enrollment', value: enrollment, unit: 'ratio' as const },
    ]
    if (missing.length > 0 || aid === null || enrollment === null) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return {
      value: aid / enrollment,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}

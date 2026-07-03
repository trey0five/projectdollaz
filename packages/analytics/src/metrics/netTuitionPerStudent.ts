import type { MetricDef } from '../types.js'

/**
 * Net tuition per student = (gross tuition − financial aid) ÷ enrollment.
 * Higher is better. The SOA tuition rollup line (PeriodFinancials.tuition) IS
 * gross tuition revenue; net tuition = gross − financialAidTotal.
 *
 * Requires gross tuition > 0, financialAidTotal present (0 is valid), and
 * enrollment > 0. Missing inputs are named precisely; never a fabricated zero.
 */
export const netTuitionPerStudent: MetricDef = {
  key: 'net_tuition_per_student',
  label: 'Net Tuition per Student',
  boardLabel: 'Avg Net Tuition / Student',
  unit: 'currency',
  category: 'operational',
  goodDirection: 'higher',
  domain: 'aid',
  // Org = (Σtuition − Σaid) / Σenrollment — enrollment-weighted mean.
  scopeAggregation: 'weighted-by-components',
  inputs: [
    { key: 'tuition', source: 'financials', label: 'Gross tuition' },
    { key: 'financialAidTotal', source: 'operational', label: 'Financial aid' },
    { key: 'enrollment', source: 'operational', label: 'Enrollment' },
  ],
  basis: '(Gross tuition − financial aid) ÷ enrollment. Tuition rollup line = gross tuition.',
  formula: '(Gross tuition − Financial aid) ÷ Enrollment',
  description: 'Average tuition the school keeps per student after aid is applied.',
  compute(cur, _prior, curOp) {
    const missing: string[] = []
    if (cur.tuition <= 0) missing.push('tuition')
    const aid = curOp?.financialAidTotal ?? null
    const enrollment = curOp?.enrollment ?? null
    if (aid === null) missing.push('financialAidTotal')
    if (enrollment === null || enrollment <= 0) missing.push('enrollment')
    const inputs = [
      { key: 'tuition', label: 'Gross tuition', value: cur.tuition, unit: 'currency' as const },
      { key: 'financialAidTotal', label: 'Financial aid', value: aid, unit: 'currency' as const },
      { key: 'enrollment', label: 'Enrollment', value: enrollment, unit: 'ratio' as const },
    ]
    if (missing.length > 0 || aid === null || enrollment === null) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return {
      value: (cur.tuition - aid) / enrollment,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}

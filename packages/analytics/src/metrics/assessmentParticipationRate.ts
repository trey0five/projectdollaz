import type { MetricDef } from '../types.js'

/**
 * Assessment Participation = students tested ÷ students eligible.
 *
 * The metric that decides whether every OTHER assessment number is comparable.
 * A school where a third of the class sits the exam can post a flattering
 * average for reasons that have nothing to do with teaching, so participation
 * belongs on the scorecard beside the scores rather than in a footnote under
 * them.
 *
 * Extensive on both sides → org scope is Σtested ÷ Σeligible, an eligible-cohort
 * weighted rate.
 *
 * Bands are deliberately demanding: below ~70% a comparison starts to be about
 * who took the test rather than how the school taught.
 */
export const assessmentParticipationRate: MetricDef = {
  key: 'assessment_participation_rate',
  label: 'Assessment Participation',
  unit: 'percent',
  category: 'operational',
  goodDirection: 'higher',
  domain: 'academics',
  scopeAggregation: 'recompute-from-components',
  inputs: [
    { key: 'actTestedCount', source: 'operational', label: 'Students tested' },
    { key: 'assessmentEligibleCount', source: 'operational', label: 'Students eligible' },
  ],
  basis: 'Share of eligible students who sat the exam — the figure that decides whether a score comparison is fair.',
  formula: 'Students tested ÷ students eligible',
  description: 'Percentage of eligible students who sat the assessment.',
  bands: { good: 0.9, warn: 0.7 },
  compute(_cur, _prior, curOp) {
    // Whichever exam the school runs, the tested count is the numerator; a school
    // reporting both contributes both cohorts.
    const act = curOp?.actTestedCount ?? null
    const sat = curOp?.satTestedCount ?? null
    const tested = act === null && sat === null ? null : (act ?? 0) + (sat ?? 0)
    const eligible = curOp?.assessmentEligibleCount ?? null
    const inputs = [
      { key: 'actTestedCount', label: 'Students tested', value: tested, unit: 'ratio' as const },
      { key: 'assessmentEligibleCount', label: 'Students eligible', value: eligible, unit: 'ratio' as const },
    ]
    const missing: string[] = []
    if (tested === null) missing.push('actTestedCount')
    if (eligible === null || eligible <= 0) missing.push('assessmentEligibleCount')
    if (missing.length > 0 || tested === null || eligible === null || eligible <= 0) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return { value: tested / eligible, available: true, inputsMissing: [], inputs }
  },
}

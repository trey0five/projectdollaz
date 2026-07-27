import type { MetricDef } from '../types.js'

/**
 * Teaching FTE change (YoY) = (cur.teachingFte − prior.teachingFte) / prior.teachingFte.
 *
 * Phase 6 (HR & Staffing) — a line-for-line mirror of enrollmentChangeYoy on the
 * TEACHING-FTE stock: staffing is a stock, so its trend is a period-over-period
 * delta, not a within-period ratio. Reads teachingFte off BOTH the current and
 * immediately-prior period's operational row (priorOp) — NO new store.
 *
 * Like enrollmentChangeYoy, this metric's compute() consumes priorOp INSIDE its
 * own value. (Side-effect: the registry's PoP recompute calls compute(prior,
 * undefined, priorOp, undefined) — the prior period with NO prior-of-prior — so
 * this metric's periodOverPeriodDelta is always null. That is HONEST: a
 * change-of-a-change needs a 3-year window we don't have. Cards hide a null
 * delta chip.)
 *
 * NO band, goodDirection 'neutral': staffing growth is CONTEXTUAL — a rising FTE
 * count is good for a growing school and bad for a shrinking one; we never
 * fabricate a universal good/bad.
 *
 * Available ONLY when prior teachingFte is present AND > 0 (divide-by-zero guard;
 * a school going 0→N teachers has no defensible rate) AND current teachingFte is
 * present (>= 0). Missing/zero-prior → available:false with precise
 * inputsMissing — never a fabricated 0% and never Infinity.
 *
 * scopeAggregation 'recompute-from-components': teachingFte is EXTENSIVE, so the
 * org YoY is the metric's OWN formula on the sums — (ΣcurFte − ΣpriorFte)/ΣpriorFte
 * (priorOp is already summed at org scope by org-compute).
 */
export const fteChangeYoy: MetricDef = {
  key: 'fte_change_yoy',
  label: 'Teaching FTE Change (YoY)',
  boardLabel: 'Teaching FTE Change (YoY)',
  unit: 'percent',
  category: 'operational',
  goodDirection: 'neutral',
  domain: 'hr',
  scopeAggregation: 'recompute-from-components',
  inputs: [
    { key: 'teachingFte', source: 'operational', label: 'Teaching FTE (current)' },
    { key: 'priorTeachingFte', source: 'operational', label: 'Teaching FTE (prior year)' },
  ],
  basis: 'Year-over-year change in teaching full-time equivalents vs. the prior period. Needs two years of staffing FTEs.',
  formula: '(Teaching FTE − Prior-year teaching FTE) ÷ Prior-year teaching FTE',
  description: 'Year-over-year growth (or decline) in teaching staff FTEs.',
  compute(_cur, _prior, curOp, priorOp) {
    const teachingFte = curOp?.teachingFte ?? null
    const priorTeachingFte = priorOp?.teachingFte ?? null
    const inputs = [
      { key: 'teachingFte', label: 'Teaching FTE (current)', value: teachingFte, unit: 'ratio' as const },
      { key: 'priorTeachingFte', label: 'Teaching FTE (prior year)', value: priorTeachingFte, unit: 'ratio' as const },
    ]
    const missing: string[] = []
    if (teachingFte === null) missing.push('teachingFte')
    // Prior must be present AND > 0: guards divide-by-zero and a 0→N ramp that has
    // no defensible growth rate.
    if (priorTeachingFte === null || priorTeachingFte <= 0) missing.push('priorTeachingFte')
    if (missing.length > 0 || teachingFte === null || priorTeachingFte === null || priorTeachingFte <= 0) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return {
      value: (teachingFte - priorTeachingFte) / priorTeachingFte,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}

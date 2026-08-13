import type { MetricDef } from '../types.js'

/**
 * ACT Composite = Σ(student composites) ÷ students tested.
 *
 * The first ACADEMICS-domain metric — the wedge that puts classroom outcomes
 * beside the financial ones in the same scorecard, banded and briefed like any
 * other. It reads two EXTENSIVE components (a score sum and a tester count)
 * rather than a stored average, and that choice is the whole point: at org scope
 * the metric's own formula on the summed components yields Σscore ÷ Σtested, a
 * tester-weighted diocesan composite. Averaging school averages would let a
 * twelve-tester school swing the network as hard as a three-hundred-tester one.
 *
 * Available only when the tester count is present AND > 0 (a school with no
 * testers has no defensible composite) — a missing denominator yields
 * available:false with precise inputsMissing, never Infinity, NaN or a
 * fabricated 0.
 *
 * Bands follow the national composite: 21 is roughly the national average, and
 * the ACT's own college-readiness benchmarks sit in the 18–23 band per section.
 */
export const actComposite: MetricDef = {
  key: 'act_composite',
  label: 'ACT Composite',
  unit: 'ratio',
  category: 'operational',
  goodDirection: 'higher',
  domain: 'academics',
  scopeAggregation: 'recompute-from-components',
  inputs: [
    { key: 'actScoreSum', source: 'operational', label: 'Sum of ACT composites' },
    { key: 'actTestedCount', source: 'operational', label: 'Students tested (ACT)' },
  ],
  basis: 'Average ACT composite across every student who sat the exam in the period — the college-exam headline for a high school.',
  formula: 'Σ ACT composite scores ÷ students tested',
  description: 'Average ACT composite score (1–36).',
  compute(_cur, _prior, curOp) {
    const sum = curOp?.actScoreSum ?? null
    const tested = curOp?.actTestedCount ?? null
    const inputs = [
      { key: 'actScoreSum', label: 'Sum of ACT composites', value: sum, unit: 'ratio' as const },
      { key: 'actTestedCount', label: 'Students tested (ACT)', value: tested, unit: 'ratio' as const },
    ]
    const missing: string[] = []
    if (sum === null) missing.push('actScoreSum')
    if (tested === null || tested <= 0) missing.push('actTestedCount')
    if (missing.length > 0 || sum === null || tested === null || tested <= 0) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return { value: sum / tested, available: true, inputsMissing: [], inputs }
  },
}

import type { MetricDef } from '../types.js'

/**
 * Tuition dependency = tuition & fees ÷ total revenue. 0..1.
 * Contextual (neutral) — neither rise nor fall is inherently good; high
 * dependency signals concentration risk. Unavailable when totalRev is 0.
 *
 * INTENTIONAL ASYMMETRY (do not "fix"): goodDirection is 'neutral' so a
 * period-over-period move is NOT auto-colored as improvement/decline (the
 * rule-insight movement sentence skips neutral-direction metrics). YET this
 * metric carries a health BAND in DEFAULT_BANDS (good <= 0.70, risk > 0.85)
 * because a sustained high level genuinely is a concentration risk. So the
 * metrics response will legitimately show goodDirection:'neutral' alongside a
 * non-neutral status (e.g. status:'risk' at 0.87). That is by design: the level
 * is banded for health, the delta is direction-neutral. High dependency surfaces
 * via the dedicated insight flag / risk lead, never via a directional delta.
 */
export const tuitionDependency: MetricDef = {
  key: 'tuition_dependency',
  label: 'Tuition Dependency',
  unit: 'percent',
  category: 'composition',
  goodDirection: 'neutral',
  basis: 'Tuition & fees ÷ total revenue.',
  formula: 'Tuition & fees ÷ Total revenue',
  description: 'How concentrated the school’s revenue is in tuition — diversification risk.',
  compute(cur) {
    const inputs = [
      { key: 'tuition', label: 'Tuition & fees', value: cur.tuition, unit: 'currency' as const },
      { key: 'totalRev', label: 'Total revenue', value: cur.totalRev, unit: 'currency' as const },
    ]
    if (cur.totalRev === 0) {
      return { value: null, available: false, inputsMissing: ['totalRev'], inputs }
    }
    return {
      value: cur.tuition / cur.totalRev,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}

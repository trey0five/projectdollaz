// ─────────────────────────────────────────────────────────────
// Phase 4D — rule-based insight generator: deterministic, stable sentences.
//
// We feed hand-built MetricResult fixtures so the prose is asserted against
// numbers we control. Also exercises the real compute path for an end-to-end
// determinism check.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { generateInsight, computeMetricsForPeriod } from '../src/index.js'
import type { MetricResult } from '../src/index.js'
import { FULL_BUNDLE, PRIOR_BUNDLE } from './fixtures.js'

// A minimal MetricResult builder for fixtures (only fields the generator reads).
function mr(over: Partial<MetricResult> & Pick<MetricResult, 'key' | 'label' | 'unit'>): MetricResult {
  return {
    category: 'profitability',
    goodDirection: 'higher',
    formula: '',
    description: '',
    available: true,
    value: 0,
    inputsMissing: [],
    periodOverPeriodDelta: null,
    status: 'neutral',
    inputs: [],
    ...over,
  } as MetricResult
}

describe('generateInsight', () => {
  it('returns a stable fallback when nothing is available', () => {
    const out = generateInsight([
      mr({ key: 'operating_margin', label: 'Operating Margin', unit: 'percent', available: false, value: null }),
    ])
    expect(out).toBe('Not enough data to summarize this period yet.')
  })

  it('leads with the worst risk metric (registry priority breaks ties)', () => {
    const out = generateInsight([
      mr({ key: 'operating_margin', label: 'Operating Margin', unit: 'percent', value: -0.02, status: 'risk', goodDirection: 'higher' }),
      mr({ key: 'days_cash_on_hand', label: 'Days Cash on Hand', unit: 'days', value: 20, status: 'risk', goodDirection: 'higher' }),
    ])
    // operating_margin precedes days_cash_on_hand in the registry -> it leads.
    expect(out).toBe('Operating Margin is a risk at -2% — the top priority to address.')
  })

  it('leads with a good headline (operating margin preferred) when no risk', () => {
    const out = generateInsight([
      mr({ key: 'operating_margin', label: 'Operating Margin', unit: 'percent', value: 0.04, status: 'good' }),
    ])
    expect(out).toBe('Operating Margin is healthy at 4%.')
  })

  it('notes the biggest movement, signed by goodDirection', () => {
    const out = generateInsight([
      mr({ key: 'operating_margin', label: 'Operating Margin', unit: 'percent', value: 0.04, status: 'good' }),
      mr({ key: 'days_cash_on_hand', label: 'Days Cash on Hand', unit: 'days', value: 43, status: 'watch', goodDirection: 'higher', periodOverPeriodDelta: 8 }),
    ])
    expect(out).toBe(
      'Operating Margin is healthy at 4%. Days Cash on Hand improved by 8 days to 43 days.',
    )
  })

  it('flags high tuition dependency as a 3rd sentence when it is not the lead risk', () => {
    // Dependency 0.82 sits in the WATCH band (>0.70, <=0.85) so it is not a risk
    // lead; margin leads, days cash moves, and the dependency flag closes it out —
    // reproducing the brief's example shape.
    const out = generateInsight([
      mr({ key: 'operating_margin', label: 'Operating Margin', unit: 'percent', value: 0.04, status: 'good' }),
      mr({ key: 'days_cash_on_hand', label: 'Days Cash on Hand', unit: 'days', value: 43, status: 'watch', goodDirection: 'higher', periodOverPeriodDelta: 8 }),
      mr({ key: 'tuition_dependency', label: 'Tuition Dependency', unit: 'percent', value: 0.82, status: 'watch', goodDirection: 'neutral' }),
    ])
    expect(out).toBe(
      'Operating Margin is healthy at 4%. Days Cash on Hand improved by 8 days to 43 days. Tuition dependency remains high at 82% — consider diversifying revenue.',
    )
  })

  it('leads with tuition dependency when it is the worst risk (demo case ~87%)', () => {
    const out = generateInsight([
      mr({ key: 'operating_margin', label: 'Operating Margin', unit: 'percent', value: 0.04, status: 'good' }),
      mr({ key: 'tuition_dependency', label: 'Tuition Dependency', unit: 'percent', value: 0.87, status: 'risk', goodDirection: 'neutral' }),
    ])
    expect(out).toBe('Tuition Dependency is a risk at 87% — the top priority to address.')
  })

  it('caps at 3 sentences', () => {
    const out = generateInsight([
      mr({ key: 'operating_margin', label: 'Operating Margin', unit: 'percent', value: -0.02, status: 'risk' }),
      mr({ key: 'days_cash_on_hand', label: 'Days Cash on Hand', unit: 'days', value: 43, status: 'watch', goodDirection: 'higher', periodOverPeriodDelta: 8 }),
      mr({ key: 'tuition_dependency', label: 'Tuition Dependency', unit: 'percent', value: 0.9, status: 'risk', goodDirection: 'neutral' }),
    ])
    expect(out.split('. ').length).toBeLessThanOrEqual(3)
  })

  it('is deterministic — identical input twice yields the identical string', () => {
    const metrics = computeMetricsForPeriod({ current: FULL_BUNDLE, prior: PRIOR_BUNDLE })
    expect(generateInsight(metrics)).toBe(generateInsight(metrics))
  })

  it('produces stable text from the real compute path', () => {
    const metrics = computeMetricsForPeriod({ current: FULL_BUNDLE, prior: PRIOR_BUNDLE })
    expect(generateInsight(metrics)).toBe(
      'Operating Margin is healthy at 10%. Days Cash on Hand improved by 365 days to 730 days.',
    )
  })
})

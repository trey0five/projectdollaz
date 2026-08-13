import { describe, it, expect } from 'vitest'
import { DEFAULT_BANDS, healthStatus } from '../src/health.js'

/**
 * A metric with no DEFAULT_BANDS entry renders 'neutral' — grey, uncoloured, and
 * silently absent from every attention rail that keys off status. The four
 * academics metrics originally carried a `bands` object on their own MetricDef,
 * which reads exactly like configuration and is read by nothing: they computed
 * real values and still came back neutral on the live scorecard.
 *
 * This file pins the bands where they actually live, and pins the deliberate
 * ABSENCE of a band on percentile-scored tests, so neither can be lost quietly.
 */
describe('academics health bands', () => {
  it('all four academics metrics are banded — none resolve neutral by accident', () => {
    for (const key of ['act_composite', 'sat_total', 'benchmark_attainment', 'assessment_participation_rate'] as const) {
      expect(DEFAULT_BANDS[key], `${key} has no band and would render grey`).toBeDefined()
      expect(DEFAULT_BANDS[key]!.goodDirection).toBe('higher')
    }
  })

  it('the ACT band is the publisher line, not a sector guess', () => {
    expect(healthStatus(25, DEFAULT_BANDS.act_composite, true)).toBe('good')
    expect(healthStatus(23.6, DEFAULT_BANDS.act_composite, true)).toBe('watch')
    expect(healthStatus(17, DEFAULT_BANDS.act_composite, true)).toBe('risk')
  })

  it('the SAT band brackets the 1010 benchmark total (ERW 480 + Math 530)', () => {
    expect(healthStatus(1100, DEFAULT_BANDS.sat_total, true)).toBe('good')
    expect(healthStatus(1010, DEFAULT_BANDS.sat_total, true)).toBe('watch')
    expect(healthStatus(900, DEFAULT_BANDS.sat_total, true)).toBe('risk')
  })

  it('participation bands where a comparison stops being fair', () => {
    expect(healthStatus(0.95, DEFAULT_BANDS.assessment_participation_rate, true)).toBe('good')
    expect(healthStatus(0.6, DEFAULT_BANDS.assessment_participation_rate, true)).toBe('risk')
  })

  it('percentile-scored tests stay UNBANDED on purpose', () => {
    // A national percentile is defined so 50 is average. Coloring a school
    // "risk" for sitting at the national midpoint would describe its students,
    // not its teaching — so no norm-referenced metric may acquire a band.
    for (const key of Object.keys(DEFAULT_BANDS)) {
      expect(key).not.toMatch(/percentile|terranova|nrt/i)
    }
  })

  it('an unavailable metric is neutral even where a band exists', () => {
    expect(healthStatus(null, DEFAULT_BANDS.act_composite, false)).toBe('neutral')
  })
})

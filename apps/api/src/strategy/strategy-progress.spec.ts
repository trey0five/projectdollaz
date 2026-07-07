import { describe, expect, it } from 'vitest'
import {
  clamp01,
  computePace,
  expectedFraction,
  meanFraction,
  worstPace,
  RISK_TOLERANCE,
  SLIP_TOLERANCE,
} from './strategy-progress.js'

// ─────────────────────────────────────────────────────────────────────────────
// The PURE pace verdict — the heart of Strategic Planning. asOf is passed IN (no
// clock), so these are deterministic. Covers every paceStatus (no_data / achieved /
// overshoot / on_track / at_risk / behind) for BOTH up-is-good and down-is-good
// metrics with NO special-casing (direction is a property of (target − baseline)).
// ─────────────────────────────────────────────────────────────────────────────

const START = '2026-01-01'
const TARGET = '2027-01-01'
const HALF = '2026-07-02' // ≈ 50% through the one-year window

describe('computePace — no_data', () => {
  it('null current → no_data (pctToTarget null, expectedPct still computed)', () => {
    const r = computePace({ baseline: 0, current: null, target: 100, startDate: START, targetDate: TARGET, asOf: HALF })
    expect(r.paceStatus).toBe('no_data')
    expect(r.pctToTarget).toBeNull()
    expect(r.expectedPct).not.toBeNull()
  })
  it('null baseline → no_data', () => {
    const r = computePace({ baseline: null, current: 50, target: 100, startDate: START, targetDate: TARGET, asOf: HALF })
    expect(r.paceStatus).toBe('no_data')
  })
  it('target === baseline (zero-width) → no_data, never divide-by-zero', () => {
    const r = computePace({ baseline: 100, current: 100, target: 100, startDate: START, targetDate: TARGET, asOf: HALF })
    expect(r.paceStatus).toBe('no_data')
    expect(r.pctToTarget).toBeNull()
  })
})

describe('computePace — achieved / overshoot', () => {
  it('reached target → achieved, pctToTarget clamped 1, not overshoot', () => {
    const r = computePace({ baseline: 0, current: 100, target: 100, startDate: START, targetDate: TARGET, asOf: HALF })
    expect(r.paceStatus).toBe('achieved')
    expect(r.pctToTarget).toBe(1)
    expect(r.overshoot).toBe(false)
  })
  it('passed target → achieved + overshoot true, still clamped 1', () => {
    const r = computePace({ baseline: 0, current: 120, target: 100, startDate: START, targetDate: TARGET, asOf: HALF })
    expect(r.paceStatus).toBe('achieved')
    expect(r.overshoot).toBe(true)
    expect(r.pctToTarget).toBe(1)
  })
})

describe('computePace — up-is-good pacing', () => {
  it('ahead of schedule → on_track', () => {
    const r = computePace({ baseline: 0, current: 60, target: 100, startDate: START, targetDate: TARGET, asOf: HALF })
    expect(r.pctToTarget).toBeCloseTo(0.6, 5)
    expect(r.paceStatus).toBe('on_track')
  })
  it('slightly behind (within RISK band) → at_risk', () => {
    const r = computePace({ baseline: 0, current: 42, target: 100, startDate: START, targetDate: TARGET, asOf: HALF })
    // behindBy ≈ 0.499 − 0.42 = 0.079 → (SLIP, RISK] → at_risk
    expect(r.paceStatus).toBe('at_risk')
  })
  it('well behind (beyond RISK band) → behind', () => {
    const r = computePace({ baseline: 0, current: 20, target: 100, startDate: START, targetDate: TARGET, asOf: HALF })
    expect(r.paceStatus).toBe('behind')
  })
})

describe('computePace — down-is-good works with NO special-casing', () => {
  // tuition_discount_rate style: baseline 0.30 → target 0.20 (lower is better).
  it('halfway down → 0.5 progress, on pace → on_track', () => {
    const r = computePace({ baseline: 0.3, current: 0.25, target: 0.2, startDate: START, targetDate: TARGET, asOf: HALF })
    expect(r.pctToTarget).toBeCloseTo(0.5, 5)
    expect(r.paceStatus).toBe('on_track')
  })
  it('barely moved down → behind', () => {
    const r = computePace({ baseline: 0.3, current: 0.29, target: 0.2, startDate: START, targetDate: TARGET, asOf: HALF })
    expect(r.pctToTarget).toBeCloseTo(0.1, 5)
    expect(r.paceStatus).toBe('behind')
  })
  it('reached the lower target → achieved', () => {
    const r = computePace({ baseline: 0.3, current: 0.2, target: 0.2, startDate: START, targetDate: TARGET, asOf: HALF })
    expect(r.paceStatus).toBe('achieved')
  })
  it('went WRONG way (up) → clamped 0, behind', () => {
    const r = computePace({ baseline: 0.3, current: 0.34, target: 0.2, startDate: START, targetDate: TARGET, asOf: HALF })
    expect(r.pctToTarget).toBe(0)
    expect(r.paceStatus).toBe('behind')
  })
})

describe('computePace — no schedule window', () => {
  it('missing targetDate → expectedPct null, progressing goal reads on_track', () => {
    const r = computePace({ baseline: 0, current: 10, target: 100, startDate: START, targetDate: null, asOf: HALF })
    expect(r.expectedPct).toBeNull()
    expect(r.paceStatus).toBe('on_track')
  })
})

describe('helpers', () => {
  it('clamp01 clamps to [0,1]', () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(clamp01(0.4)).toBe(0.4)
  })
  it('expectedFraction: before start → 0, after target → 1, zero-window → 1', () => {
    expect(expectedFraction(START, TARGET, '2025-01-01')).toBe(0)
    expect(expectedFraction(START, TARGET, '2028-01-01')).toBe(1)
    expect(expectedFraction(TARGET, START, HALF)).toBe(1) // target ≤ start
    expect(expectedFraction(null, TARGET, HALF)).toBeNull()
  })
  it('worstPace: behind > at_risk > on_track; achieved/no_data ignored', () => {
    expect(worstPace(['on_track', 'behind', 'achieved'])).toBe('behind')
    expect(worstPace(['on_track', 'at_risk', 'achieved'])).toBe('at_risk')
    expect(worstPace(['achieved', 'no_data'])).toBe('on_track')
  })
  it('meanFraction: equal-weight mean of defined values, null when none', () => {
    expect(meanFraction([0.2, 0.4, null])).toBeCloseTo(0.3, 5)
    expect(meanFraction([null, null])).toBeNull()
  })
  it('tolerances are the frozen contract values', () => {
    expect(SLIP_TOLERANCE).toBe(0.05)
    expect(RISK_TOLERANCE).toBe(0.15)
  })
})

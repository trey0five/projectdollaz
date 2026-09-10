// ─────────────────────────────────────────────────────────────────────────────
// THE HEAT-MAP SCALE CONTRACT — pinned so it cannot quietly un-happen.
//
//   1. Sequential = ONE hue, light → dark, MONOTONE lightness, five steps.
//   2. Diverging = two hues + a NEUTRAL grey midpoint; each arm monotone.
//   3. Every step's ink clears WCAG AA (≥ 4.5:1) on that step's own fill — the
//      "ink flips where neither ink is legible" bug the stepped ramp replaced.
//   4. Suppressed (<5) and absent are DIFFERENT surfaces; suppressed is hatched.
//   5. Domains are STABLE: the diverging scale steps by the material gap and a
//      server `direction` beats the sign; the sequential top is a nice number.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import {
  ABSENT_STYLE,
  DIVERGING_MID,
  DIVERGING_NEG,
  DIVERGING_POS,
  DIVERGING_STEPS,
  SEQUENTIAL_STEPS,
  SUPPRESSED_STYLE,
  divergingScale,
  niceCeil,
  sequentialScale,
} from './heatScales.js'

// WCAG relative luminance + contrast (sRGB), local so the spec has no runtime deps.
const chan = (v) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const lum = (hex) => {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
}
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

const monotoneDarker = (steps) => steps.every((s, i) => i === 0 || lum(s.fill) < lum(steps[i - 1].fill))

describe('sequential steps', () => {
  it('are five, one hue, and strictly darker step by step', () => {
    expect(SEQUENTIAL_STEPS).toHaveLength(5)
    expect(monotoneDarker(SEQUENTIAL_STEPS)).toBe(true)
    // One hue: blue channel dominates on every step (sky), never a hue jump.
    for (const s of SEQUENTIAL_STEPS) {
      const [r, g, b] = rgb(s.fill)
      expect(b).toBeGreaterThan(r)
      expect(b).toBeGreaterThanOrEqual(g)
    }
  })

  it('every step ink clears AA on its own fill', () => {
    for (const s of SEQUENTIAL_STEPS) expect(contrast(s.fill, s.ink)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('diverging steps', () => {
  it('each arm is four monotone steps of one hue, and the midpoint is grey', () => {
    expect(DIVERGING_POS).toHaveLength(4)
    expect(DIVERGING_NEG).toHaveLength(4)
    expect(monotoneDarker(DIVERGING_POS)).toBe(true)
    expect(monotoneDarker(DIVERGING_NEG)).toBe(true)
    for (const s of DIVERGING_POS) {
      const [r, , b] = rgb(s.fill)
      expect(b).toBeGreaterThan(r) // blue arm
    }
    for (const s of DIVERGING_NEG) {
      const [r, , b] = rgb(s.fill)
      expect(r).toBeGreaterThan(b) // red arm — never green
    }
    const [r, g, b] = rgb(DIVERGING_MID.fill)
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(20) // grey, not a hue
    expect(DIVERGING_STEPS).toHaveLength(9)
    expect(DIVERGING_STEPS[4]).toBe(DIVERGING_MID)
  })

  it('every step ink clears AA on its own fill', () => {
    for (const s of DIVERGING_STEPS) expect(contrast(s.fill, s.ink)).toBeGreaterThanOrEqual(4.5)
  })

  it('the first step of each arm is visibly darker than the neutral — level ≠ one gap', () => {
    // Relative luminance stands in for OKLCH L here; the validator run (ΔL ≥ 0.06
    // including the neutral) is the authoritative check, this pins the direction.
    expect(lum(DIVERGING_POS[0].fill)).toBeLessThan(lum(DIVERGING_MID.fill) * 0.72)
    expect(lum(DIVERGING_NEG[0].fill)).toBeLessThan(lum(DIVERGING_MID.fill) * 0.72)
  })
})

describe('suppressed versus absent', () => {
  it('are two different surfaces, and only the suppressed one is hatched', () => {
    expect(SUPPRESSED_STYLE.background).not.toBe(ABSENT_STYLE.background)
    expect(SUPPRESSED_STYLE.background).toMatch(/repeating-linear-gradient/)
    expect(ABSENT_STYLE.background).not.toMatch(/gradient/)
    expect(SUPPRESSED_STYLE.color).not.toBe(ABSENT_STYLE.color)
  })
})

describe('divergingScale — stepped by the material gap, direction beats sign', () => {
  const s = divergingScale(5)
  it('is level within one gap, then one step per further gap, capped at four', () => {
    expect(s.stepFor(0)).toBe(s.mid)
    expect(s.stepFor(4.9)).toBe(s.mid)
    expect(s.stepFor(-4.9)).toBe(s.mid)
    expect(s.stepFor(5)).toBe(s.pos[0])
    expect(s.stepFor(-12)).toBe(s.neg[1])
    expect(s.stepFor(19.9)).toBe(s.pos[2])
    expect(s.stepFor(40)).toBe(s.pos[3])
    expect(s.stepFor(-400)).toBe(s.neg[3])
    expect(s.stepFor(null)).toBeNull()
    expect(s.stepFor(undefined)).toBeNull()
  })
  it("a server ruling of 'held' is neutral whatever the sign, and 'gained'/'declined' pick the arm", () => {
    expect(s.stepFor(12, 'held')).toBe(s.mid)
    expect(s.stepFor(-12, 'held')).toBe(s.mid)
    expect(s.stepFor(2, 'gained')).toBe(s.pos[0])
    expect(s.stepFor(-2, 'declined')).toBe(s.neg[0])
    expect(s.stepFor(-30, 'declined')).toBe(s.neg[3])
  })
  it('prints its thresholds pole to pole and survives a missing gap', () => {
    expect(s.ticks).toEqual([-20, -15, -10, -5, 5, 10, 15, 20])
    expect(s.steps).toHaveLength(9)
    const act = divergingScale(0.5)
    expect(act.stepFor(0.4)).toBe(act.mid)
    expect(act.stepFor(1.1)).toBe(act.pos[1])
    expect(divergingScale(undefined).gap).toBe(1)
    expect(divergingScale(0).gap).toBe(1)
  })
})

describe('sequentialScale — zero-based, nice top, five equal steps', () => {
  it('rounds the top up to a nice number and places values by step', () => {
    expect(niceCeil(139)).toBe(150)
    expect(niceCeil(150)).toBe(150)
    expect(niceCeil(151)).toBe(200)
    expect(niceCeil(7)).toBe(8)
    expect(niceCeil(0)).toBe(0)
    const s = sequentialScale(139)
    expect(s.top).toBe(150)
    expect(s.ticks).toEqual([0, 30, 60, 90, 120, 150])
    expect(s.stepFor(0)).toBe(s.steps[0])
    expect(s.stepFor(29.9)).toBe(s.steps[0])
    expect(s.stepFor(30)).toBe(s.steps[1])
    expect(s.stepFor(139)).toBe(s.steps[4])
    expect(s.stepFor(150)).toBe(s.steps[4])
    expect(s.stepFor(null)).toBeNull()
  })
  it('never throws on an empty grid', () => {
    const s = sequentialScale(0)
    expect(s.top).toBe(0)
    expect(s.stepFor(3)).toBeNull()
  })
})

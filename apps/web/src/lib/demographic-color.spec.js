// ─────────────────────────────────────────────────────────────────────────────
// One colour per demographic value. Pure, so this tests the RULES directly.
//
// The interesting failures are all about distinguishability, and the first two
// attempts each failed in a way that looked fine in source:
//   • the 8-colour categorical palette COLLIDES on grade (15 keys, 8 colours) —
//     Grade 1 and Grade 9 shared a swatch in K–12 schools;
//   • an ordered ramp across all fifteen grades put a 9–12 high school's four
//     grades within 16° of each other, which rendered as four violets nobody
//     could tell apart. Measured in the browser, not read off the code.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import {
  demographicHsl,
  demographicColor,
  demographicPillStyle,
} from './demographicColor.js'
import { GRADE_KEYS, RACE_KEYS } from './demographicVocab.js'

/** Shortest distance between two hues on the wheel. */
const hueGap = (a, b) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

describe('grade colours are distinguishable for the grades a school actually has', () => {
  it('gives all fifteen canonical grades a distinct hue', () => {
    const hues = GRADE_KEYS.map((g) => demographicHsl('grade', g).h)
    expect(new Set(hues).size).toBe(GRADE_KEYS.length)
  })

  it('separates ADJACENT grades widely — the case that actually renders', () => {
    // Every school holds a CONTIGUOUS run of grades, so neighbouring keys are
    // exactly the pairs a person compares. The failed ordered ramp scored ~5°.
    for (let i = 1; i < GRADE_KEYS.length; i++) {
      const a = demographicHsl('grade', GRADE_KEYS[i - 1]).h
      const b = demographicHsl('grade', GRADE_KEYS[i]).h
      expect(hueGap(a, b), `${GRADE_KEYS[i - 1]} vs ${GRADE_KEYS[i]}`).toBeGreaterThan(60)
    }
  })

  it('separates a real 9–12 high school’s four grades from each other', () => {
    const hs = ['9', '10', '11', '12'].map((g) => demographicHsl('grade', g).h)
    for (let i = 0; i < hs.length; i++) {
      for (let j = i + 1; j < hs.length; j++) {
        expect(hueGap(hs[i], hs[j]), `${i} vs ${j}`).toBeGreaterThan(30)
      }
    }
  })

  it('gives every grade the same weight — only the hue moves', () => {
    const all = GRADE_KEYS.map((g) => demographicHsl('grade', g))
    expect(new Set(all.map((c) => c.s)).size).toBe(1)
    expect(new Set(all.map((c) => c.l)).size).toBe(1)
  })
})

describe('unordered dimensions use the shared categorical palette', () => {
  it('gives each race a distinct colour', () => {
    const hues = RACE_KEYS.map((r) => demographicHsl('race', r).h)
    expect(new Set(hues).size).toBe(RACE_KEYS.length)
  })

  it('is keyed to CANONICAL position, not to which values are present', () => {
    // A school enrolling its first student of some race must not silently
    // recolour every other row.
    const before = demographicColor('race', RACE_KEYS[3])
    const after = demographicColor('race', RACE_KEYS[3])
    expect(before).toBe(after)
    expect(demographicColor('race', RACE_KEYS[0])).not.toBe(before)
  })
})

describe('an unknown value gets no colour at all', () => {
  it('returns null rather than inventing a swatch', () => {
    expect(demographicHsl('grade', 'Grade 13')).toBeNull()
    expect(demographicHsl('nonsense', '9')).toBeNull()
    expect(demographicPillStyle('race', 'martian')).toBeNull()
    expect(demographicColor('grade', null)).toBeNull()
  })
})

describe('the pill stays readable', () => {
  it('pairs a very light fill with very dark text, for every value', () => {
    const dims = [
      ['grade', GRADE_KEYS],
      ['race', RACE_KEYS],
    ]
    for (const [dim, keys] of dims) {
      for (const k of keys) {
        const style = demographicPillStyle(dim, k)
        const bgL = Number(/(\d+)%\)$/.exec(style.backgroundColor)[1])
        const fgL = Number(/(\d+)%\)$/.exec(style.color)[1])
        // A ~63-point lightness gap; the failure this prevents is a mid-tone fill
        // with mid-tone text, which passes a glance and fails a reader.
        expect(bgL - fgL, `${dim}:${k}`).toBeGreaterThan(50)
      }
    }
  })

  it('builds fill, border and text from the value’s OWN hue', () => {
    const s = demographicPillStyle('grade', '9')
    const hues = [s.backgroundColor, s.borderColor, s.color].map(
      (v) => Number(/^hsl\((\d+)/.exec(v)[1]),
    )
    expect(new Set(hues).size).toBe(1)
  })
})

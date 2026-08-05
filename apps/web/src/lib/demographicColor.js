// ─────────────────────────────────────────────────────────────────────────────
// One colour per demographic VALUE, so a student's details read at a glance.
//
// Two rules, because the dimensions are not the same kind of thing:
//
//   GRADE gets its own generated hue per canonical position, because neither
//   obvious approach works. The 8-colour categorical palette COLLIDES — GRADE_KEYS
//   has fifteen entries, so Grade 1 and Grade 9 would share a swatch in exactly
//   the K–12 schools that have both. And an ordered ramp across the fifteen
//   grades FAILS IN PRACTICE: a 9–12 high school occupies only indices 11–14, so
//   its four grades landed within 16° of each other — measured on the real
//   register, four violets a person cannot tell apart, which is the opposite of
//   what a colour-coded pill is for.
//
//   So the hue advances by the GOLDEN ANGLE (137.5°) per grade. Any run of
//   consecutive grades — which is what every school actually has — comes out
//   maximally separated, while each grade still gets one fixed colour for good.
//
//   EVERYTHING ELSE IS UNORDERED, so it gets the validated CATEGORICAL_LIGHT
//   palette the roster charts already use, indexed by CANONICAL key position —
//   not by which values happen to be present. A school that enrols its first
//   student of some race must not silently recolour every other row.
//
// Colour NEVER carries judgement here. These are identity and grade-level
// categories: the palette is flat by design, with no good/bad axis, no red for
// one group and green for another, and no ordering implied among people.
// Semantic status (enrolled / withdrawn) keeps its own separate treatment.
// ─────────────────────────────────────────────────────────────────────────────
import { CATEGORICAL_LIGHT } from '../components/analytics/v2/chartPalette.js'
import {
  GRADE_KEYS,
  RACE_KEYS,
  GENDER_KEYS,
  ETHNICITY_KEYS,
  AGE_BAND_KEYS,
} from './demographicVocab.js'

/** Canonical key order per dimension — the index that decides the colour. */
const KEYS_BY_DIMENSION = {
  grade: GRADE_KEYS,
  race: RACE_KEYS,
  gender: GENDER_KEYS,
  ethnicity: ETHNICITY_KEYS,
  ageBand: AGE_BAND_KEYS,
}

/**
 * Grade → hue, by golden-angle stride from sky. Saturation and lightness are
 * held constant so no grade reads as louder or more important than another —
 * only the hue moves.
 */
const GRADE_HUE_START = 198
const GOLDEN_ANGLE = 137.5
function gradeRamp(index) {
  return { h: Math.round((GRADE_HUE_START + index * GOLDEN_ANGLE) % 360), s: 68, l: 45 }
}

function hsl({ h, s, l }) {
  return `hsl(${h} ${s}% ${l}%)`
}

/** #rrggbb → {h,s,l}. The categorical palette is hex; the pill needs tints. */
function hexToHsl(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  if (!m) return { h: 210, s: 20, l: 45 }
  const [r, g, b] = [m[1], m[2], m[3]].map((c) => parseInt(c, 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h = Math.round(h * 60)
  return { h: h < 0 ? h + 360 : h, s: Math.round(s * 100), l: Math.round(l * 100) }
}

/**
 * The colour for one value of one dimension, as {h,s,l}.
 * Returns null for an unknown dimension or a value outside its vocabulary — the
 * caller then renders a plain, uncoloured cell rather than inventing a swatch
 * for a value the product does not recognise.
 */
export function demographicHsl(dimension, value) {
  const keys = KEYS_BY_DIMENSION[dimension]
  if (!keys) return null
  const i = keys.indexOf(String(value))
  if (i < 0) return null
  if (dimension === 'grade') return gradeRamp(i)
  return hexToHsl(CATEGORICAL_LIGHT[i % CATEGORICAL_LIGHT.length])
}

/**
 * Inline styles for a soft pill: a light tint of the value's own hue, its text
 * darkened for contrast, and a border a shade stronger than the fill.
 *
 * Built from the SAME hue rather than a fixed neutral so the pill reads as one
 * object; the lightness figures are fixed so every pill in the column carries
 * identical weight and no value looks emphasised.
 */
export function demographicPillStyle(dimension, value) {
  const c = demographicHsl(dimension, value)
  if (!c) return null
  return {
    backgroundColor: hsl({ h: c.h, s: Math.min(c.s, 70), l: 95 }),
    borderColor: hsl({ h: c.h, s: Math.min(c.s, 70), l: 84 }),
    color: hsl({ h: c.h, s: Math.min(c.s + 6, 80), l: 32 }),
  }
}

/** The solid hue, for a dot or bar rather than a pill. */
export function demographicColor(dimension, value) {
  const c = demographicHsl(dimension, value)
  return c ? hsl(c) : null
}

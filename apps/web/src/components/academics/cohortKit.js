// ─────────────────────────────────────────────────────────────────────────────
// cohortKit — the small shared vocabulary of the longitudinal cohort view.
//
// Everything here is FORMATTING, SELECTION or GEOMETRY. No score arithmetic:
// every value, every net change and every direction arrives computed from the
// server's pure assessment layer, and a second implementation in the browser is
// exactly the thing that would eventually disagree with the print packet.
//
// The one judgement call in this file is `cohortStep`, and it is the single
// most load-bearing line in the whole view — see the comment on it.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { divergingScale } from '../analytics/charts/heatScales.js'

export const COH_HUE = '#0D9488'
export const COH_EASE = [0.2, 0.8, 0.2, 1]

/**
 * A signed number that refuses "-0".
 *
 * Same rule as AssessmentDashboard's own `signed` (:57-63): a value that rounds
 * to zero prints as "0", never "-0", because a minus sign reads as a deficit
 * that is not there. It is restated here rather than imported because that one
 * is module-private and reaching back for it would make the dashboard and this
 * view import each other in a cycle.
 */
export function signed(v, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—'
  const r = Number(Number(v).toFixed(digits))
  if (r === 0) return '0'
  return `${r > 0 ? '+' : ''}${r}`
}

/**
 * The net change AS PRINTED: the difference of the two endpoints at the
 * precision they are shown at.
 *
 * The server's netChange is the exact difference of the unrounded averages, so
 * a cohort drawn "56 → 62" can carry a netChange of 6.8 and print "+7" beside
 * two numbers that subtract to 6 (review-caught on the demo film). A reader
 * checks the chip against the endpoints, so the chip must be their difference.
 * This is formatting, not analysis: `direction` (and therefore tone) still
 * comes from the server's exact figure. Falls back to netChange when either
 * endpoint is missing.
 */
export function printedChange(netChange, startValue, endValue, digits = 0) {
  if (netChange === null || netChange === undefined) return netChange
  const s = Number(startValue)
  const e = Number(endValue)
  if (startValue === null || startValue === undefined || endValue === null || endValue === undefined) return netChange
  if (!Number.isFinite(s) || !Number.isFinite(e)) return netChange
  return Number((Number(e.toFixed(digits)) - Number(s.toFixed(digits))).toFixed(digits))
}

/** A score, at the number of decimals the family deserves. */
export function fmtScore(v, digits = 0) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—'
  return Number(v).toFixed(digits).replace(/\.0$/, '')
}

/**
 * The four leg states, in the two places a reader meets them.
 *
 * SUPPRESSED, NOT-REPORTED and MISSING are three different facts and are drawn
 * as three different things. A suppressed leg is a number that EXISTS and is
 * being withheld to protect fewer than five children; a missing leg is a year
 * nobody filed. Collapsing either into a zero would be a claim about a number
 * we do not have.
 */
export const LEG_TITLE = {
  suppressed: 'Fewer than 5 students — suppressed',
  'not-reported': 'This grade was not reported that year',
  missing: 'No result on file',
}

export const legTitle = (state) => LEG_TITLE[state] ?? 'No result on file'

/** `<5` for a withheld number, an em dash for one that was never filed. */
export const legToken = (state) => (state === 'suppressed' ? '<5' : '—')

/**
 * TONE FROM DIRECTION, NEVER FROM SIGN — the highest-probability regression in
 * this whole view, so it lives in one function that both the chip and the
 * matrix read.
 *
 * `direction` is decided on the SERVER against the family's material gap: a +2
 * on a percentile scale whose gap is 5 is 'held', and painting it blue would
 * be the view inventing a finding the analysis explicitly refused to make.
 *
 * The shared diverging scale (heatScales) steps by multiples of that same gap,
 * so the matrix's colour steps and the server's verdict agree by construction:
 * `held` lands on the neutral grey whatever the sign, and a gained/declined
 * ruling picks the arm while the magnitude only sets the intensity. The scale
 * is built ONCE per matrix from the family's gap (`cohortScale`), never from
 * the largest move on screen — a cell keeps its shade whatever else is shown.
 */
export function cohortScale(gap) {
  return divergingScale(gap)
}

/** The step a cell wears — null when there is no number to place. */
export function cohortStep(scale, direction, netChange) {
  if (direction === 'unknown') return null
  if (direction === 'held') return scale.mid
  if (netChange === null || netChange === undefined) return null
  return scale.stepFor(netChange, direction)
}

/**
 * Ticks that land on round numbers, computed ONCE for the whole view.
 *
 * Both the rail and every panel's gridlines read this same array, which is what
 * makes "the panels share a scale" checkable rather than merely intended: the
 * y of a given value is literally the same number in every panel.
 */
export function niceTicks(lo, hi, count = 4) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return []
  const raw = (hi - lo) / Math.max(1, count - 1)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
  const out = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)))
  return out.length >= 2 ? out : [lo, hi]
}

/**
 * The runs of CONSECUTIVE reported legs.
 *
 * A trajectory is drawn as one path per run, never as one path through the
 * gaps: joining across a suppressed year would draw a straight line the data
 * does not support, which is interpolation with none of the honesty of saying
 * so. The gaps get their own dashed connector instead.
 */
export function segmentsOf(legs = []) {
  const runs = []
  let current = null
  legs.forEach((leg, i) => {
    if (leg && leg.value !== null && leg.value !== undefined) {
      if (current) current.push(i)
      else {
        current = [i]
        runs.push(current)
      }
    } else current = null
  })
  return runs
}

/** "grade 5" — but kindergarten and pre-K are not "grade K". */
export function gradePhrase(grade) {
  const g = String(grade ?? '').trim().toUpperCase()
  if (g === 'K') return 'kindergarten'
  if (g === 'PK' || g === 'PK4' || g === 'PK3') return 'pre-K'
  return `grade ${grade}`
}

/**
 * Why an end-to-end change could not be taken, in the reader's own words.
 *
 * The server's `netChangeUnavailable` names the END that failed and the STATE
 * that failed it (`end-not-reported`), so the state — which is itself
 * hyphenated — is everything after the first hyphen, not the second token.
 */
export function unavailableSentence(reason, startGrade, endGrade) {
  if (!reason) return null
  const raw = String(reason)
  const cut = raw.indexOf('-')
  if (cut < 0) return null
  const end = raw.slice(0, cut)
  const state = raw.slice(cut + 1)
  const where = gradePhrase(end === 'start' ? startGrade : endGrade)
  if (state === 'suppressed')
    return `The ${where} result is withheld — fewer than five students — so there is no end-to-end change to take.`
  if (state === 'not-reported')
    return `${where[0].toUpperCase()}${where.slice(1)} was not reported that year, so there is no end-to-end change to take.`
  return `There is no ${where} result on file, so there is no end-to-end change to take.`
}

/** The element's rendered width, for the label-density decisions. */
export function useMeasuredWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

// ─────────────────────────────────────────────────────────────────────────────
// enrollmentAnalyticsKit — the small shared vocabulary of the Enrollment
// Analytics tab. FORMATTING, SELECTION and GEOMETRY only.
//
// NO ARITHMETIC ON COUNTS OR PERCENTAGES LIVES HERE. Every count, share, gap,
// net change and direction arrives already computed from the server's pure
// layer; a second implementation in the browser is exactly the thing that would
// eventually disagree with the board packet. Multiplying a 0-1 share by 100 to
// print it is formatting and goes through the canonical @finrep/analytics
// formatter, not a hand-rolled one. Scale and pixel math IS ours — that is
// geometry, not analysis.
//
// ── THE THREE CELL STATES, WHICH ARE NOT TWO ─────────────────────────────────
// The API's Suppressible envelope is `{ value, suppressed }`, and it encodes
// THREE facts that must never collapse into each other:
//
//   { value: 118,  suppressed: false }  a figure
//   { value: null, suppressed: true  }  MASKED — the number exists and is being
//                                       withheld because fewer than five
//                                       children would be identifiable
//   { value: null, suppressed: false }  ABSENT — nobody filed a reading
//
// `value === null` alone therefore does NOT mean suppressed, and neither null
// state is a zero. A masked grade drawn as a bar of height 0 would be a claim
// that the grade is empty, about children who are actually there.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { CalendarClock, Info } from 'lucide-react'
import { niceTicks } from '../academics/cohortKit.js'
import { formatMetricValue } from '../../lib/metricMeta.js'
import { moduleHue } from '../module/moduleAnatomy.js'
import { GRADE_LABELS } from './studentFilters.jsx'
import { SEQUENTIAL_STEPS } from '../analytics/charts/heatScales.js'

/** The module's locked brand hue — magnitude ink for every chart on this tab. */
export const ENROLL_HUE = moduleHue('enrollment')
export const EASE = [0.2, 0.8, 0.2, 1]

// ── Cell states ──────────────────────────────────────────────────────────────

export const CELL_VALUE = 'value'
export const CELL_MASKED = 'masked'
export const CELL_ABSENT = 'absent'

/** Which of the three facts a Suppressible carries. Undefined reads as absent. */
export function cellState(c) {
  if (!c) return CELL_ABSENT
  if (c.suppressed) return CELL_MASKED
  return c.value === null || c.value === undefined ? CELL_ABSENT : CELL_VALUE
}

/** True only for a real figure — the guard before any geometry uses `.value`. */
export const hasValue = (c) => cellState(c) === CELL_VALUE

/**
 * The token printed where a number cannot go.
 *
 * `<5` for a withheld figure and an em dash for one that was never filed —
 * different marks, because they are different facts. Never `0`.
 */
export function cellToken(c) {
  const s = cellState(c)
  if (s === CELL_MASKED) return '<5'
  if (s === CELL_ABSENT) return '—'
  return formatMetricValue(c.value, 'count')
}

/** Why the token is there, in the reader's own words (tooltip / title / a11y). */
export function cellTitle(c, { minCell = 5 } = {}) {
  const s = cellState(c)
  if (s === CELL_MASKED)
    return `Hidden — fewer than ${minCell} students, who would be identifiable. The figure is withheld, not zero.`
  if (s === CELL_ABSENT) return 'No reading on file for this grade and year.'
  return null
}

// ── Formatting (canonical layer only) ────────────────────────────────────────

/** A headcount. Thousands-separated by the same formatter the scorecard uses. */
export const fmtCount = (n) =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : formatMetricValue(Number(n), 'count')

/** A server-computed 0-1 share, printed as a percent by the canonical formatter. */
export const fmtShare = (v) =>
  v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : formatMetricValue(Number(v), 'share')

/**
 * A SIGNED headcount that refuses "−0".
 *
 * A minus sign reads as a deficit, so a value that is exactly zero prints "0".
 * This signs a number the SERVER computed; it does not compute one.
 */
export function signedCount(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  if (v === 0) return '0'
  return `${v > 0 ? '+' : '−'}${formatMetricValue(Math.abs(v), 'count')}`
}

/** A server-computed 0-1 gap fraction, signed, for a gap gutter. */
export function signedShare(v) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—'
  const n = Number(v)
  if (n === 0) return '0.0%'
  return `${n > 0 ? '+' : '−'}${formatMetricValue(Math.abs(n), 'share')}`
}

/** "Sep 15, 2026" from an ISO day — parsed as LOCAL so the day never slips. */
export function fmtDate(iso) {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "Sep 15" — the axis-tick form. */
export function fmtDateShort(iso) {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Grade 9" / "K" / "PK3" — the register's own grade vocabulary. */
export const gradeLabelOf = (g) => GRADE_LABELS[g] ?? String(g ?? '')

/** "2025–26" from the FY end year the server sends (2026 ⇒ 2025–26). */
export function schoolYearLabel(endYear) {
  const y = Number(endYear)
  return Number.isFinite(y) ? `${y - 1}–${String(y).slice(2)}` : String(endYear ?? '')
}

/** A provider id as a human word ('oneroster_csv' → 'OneRoster CSV'-ish). */
export function providerLabel(p) {
  if (!p) return null
  return String(p)
    .split('_')
    .map((w) => (w === 'csv' || w === 'sis' ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

// ── The "as of" chip — mandatory and structural on everything roster-derived ──

/**
 * WHEN THIS WAS TRUE, ON EVERY CARD THAT DEPENDS ON IT.
 *
 * The date is the server's real `observedOn`, never `new Date()`: a snapshot
 * filed in July is still describing July in December, and a card that stamped
 * itself with today's date would be asserting a count nobody took.
 *
 * STALENESS IS THE SERVER'S CALL, not a threshold re-guessed here — `asOf.stale`
 * is already decided against its own 45-day rule, so the chip cannot drift from
 * the notes and the briefing.
 */
export function AsOfChip({ asOf, className = '' }) {
  if (!asOf?.observedOn) return null
  const stale = !!asOf.stale
  return (
    <span
      title={
        stale
          ? `This reading is ${asOf.staleDays} days old and may not reflect today's register.`
          : `Counted on ${fmtDate(asOf.observedOn)}.`
      }
      className={`pill ${stale ? 'pill-status tone-watch' : ''} ${className}`}
    >
      {stale ? <i className="pill-mark" aria-hidden="true" /> : null}
      <CalendarClock size={11} strokeWidth={2.4} aria-hidden="true" />
      as of {fmtDate(asOf.observedOn)}
      {stale ? ` · ${asOf.staleDays}d old` : ''}
    </span>
  )
}

// ── The zero-based domain, in ONE definition ─────────────────────────────────

/**
 * A ZERO-BASED axis that is guaranteed to CONTAIN the data.
 *
 * `niceTicks` rounds to pleasant intervals but stops at the last tick that fits
 * UNDER the value it was given — so a series topping out at 29 comes back as
 * [0, 20], and anything above 20 would be drawn outside the plot. (Caught live:
 * a cohort rung of 29 students on an axis that ended at 20.) The academics view
 * never hit this because it pads its domain before ticking; a zero-based count
 * axis has no padding below to absorb it.
 *
 * So the tick STEP is taken from niceTicks, and the top is then rounded UP to a
 * whole step: the axis stays zero-based, the gridlines stay round, and no value
 * can sit above the ceiling.
 */
export function zeroBasedDomain(top, count = 4) {
  const hiRaw = Math.max(Number.isFinite(top) ? top : 0, 1)
  const base = niceTicks(0, hiRaw, count)
  const step = base.length >= 2 ? base[1] - base[0] : hiRaw
  if (!Number.isFinite(step) || step <= 0) return { lo: 0, hi: hiRaw, ticks: [0, hiRaw] }
  const hi = Math.ceil(hiRaw / step) * step
  const ticks = []
  for (let v = 0; v <= hi + 1e-9; v += step) ticks.push(Number(v.toFixed(6)))
  return { lo: 0, hi, ticks: ticks.length >= 2 ? ticks : [0, hi] }
}

// ── Label collision resolution (geometry, shared) ────────────────────────────

/**
 * ONE-DIMENSIONAL LABEL SEPARATION for callouts that share an edge.
 *
 * The recurring bug family this kills: two value labels anchored to the same
 * x-gutter (an endpoint callout and a "plan" label, say) land within a text
 * height of each other whenever the two values are close — which for a school
 * NEAR its plan is most of the time — and print through each other into an
 * unreadable pileup. Seen live on E1's right edge: "298", "plan 305" and the
 * plan value stacked into one smudge.
 *
 * Input: [{ key, y }] — each label's PREFERRED centre-y (usually its anchor's
 * own y). Output: Map key → resolved centre-y such that
 *   • labels keep their vertical ORDER (a label never jumps past its neighbour,
 *     so a leader line can never cross another),
 *   • consecutive labels sit at least `gap` apart,
 *   • everything stays inside [lo, hi] (the plot band).
 * A label whose resolved y differs from its preferred y should be tethered to
 * its anchor with a small leader line by the caller — the label moved, the
 * datum did not.
 *
 * Pure geometry: y-positions in, y-positions out. No value is touched.
 */
export function separateLabels(items, { gap = 14, lo = -Infinity, hi = Infinity } = {}) {
  const sorted = items
    .map((it, i) => ({ key: it.key, y: Number(it.y), i }))
    .filter((it) => Number.isFinite(it.y))
    .sort((a, b) => a.y - b.y || a.i - b.i)
  if (sorted.length === 0) return new Map()
  // Forward pass: push each label DOWN until it clears the one above it.
  for (let k = 1; k < sorted.length; k++) sorted[k].y = Math.max(sorted[k].y, sorted[k - 1].y + gap)
  // Clamp the bottom of the stack into the band, pushing UP as needed…
  sorted[sorted.length - 1].y = Math.min(sorted[sorted.length - 1].y, hi)
  for (let k = sorted.length - 2; k >= 0; k--) sorted[k].y = Math.min(sorted[k].y, sorted[k + 1].y - gap)
  // …and the top back down.
  sorted[0].y = Math.max(sorted[0].y, lo)
  for (let k = 1; k < sorted.length; k++) sorted[k].y = Math.max(sorted[k].y, sorted[k - 1].y + gap)
  // DEGENERATE BAND: when [lo, hi] cannot hold every label at full gap, the
  // forward pass above has pushed the bottom of the stack past hi — the one
  // escape the contract forbids. Compress instead: spread the stack evenly
  // inside the band (order kept, gaps shrunk equally), never past hi.
  if (Number.isFinite(hi) && sorted[sorted.length - 1].y > hi) {
    const top = Number.isFinite(lo) ? lo : Math.min(sorted[0].y, hi)
    const span = Math.max(hi - top, 0)
    const step = sorted.length > 1 ? span / (sorted.length - 1) : 0
    for (let k = 0; k < sorted.length; k++) sorted[k].y = top + step * k
  }
  return new Map(sorted.map((s) => [s.key, s.y]))
}

// ── The sequential ramp (E2's heatmap, and the ladder's weight) ──────────────

/**
 * ONE HUE, VARYING WEIGHT — the correct encoding for a magnitude.
 *
 * Headcount has no midpoint and no good/bad axis, so a diverging or categorical
 * scheme would invent a meaning the number does not carry. `t` is the value's
 * position in the SHARED domain (0 at the floor, 1 at the top of the grid's
 * nice-rounded scale), so cells are comparable across rows and columns — the
 * entire point of a heatmap and the thing their 75-bar grouped chart could not do.
 *
 * STEPPED, NOT CONTINUOUS. The old alpha ramp (sky at 7%→92%) flipped its ink
 * from navy to white at t≈0.55 — the one band where NEITHER ink cleared 3:1.
 * The fill now snaps to one of six validated steps (heatScales.SEQUENTIAL_STEPS)
 * and the ink is the step's own, chosen so the printed count clears AA on that
 * exact fill. Both functions read the same step, so they can never disagree.
 */
const stepAt = (t) => {
  const c = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0))
  const n = SEQUENTIAL_STEPS.length
  return SEQUENTIAL_STEPS[Math.min(n - 1, Math.floor(c * n))]
}
export const rampFill = (t) => stepAt(t).fill

/** Ink that stays legible as the ramp darkens under it — the step's own. */
export const rampInk = (t) => stepAt(t).ink

// ── The explainer strip ──────────────────────────────────────────────────────

/**
 * WhatThisMeasures, in the enrollment dialect.
 *
 * A sibling of the academics component, not an edit of it: that one is written
 * about test scores (percentiles, material gaps, national midpoints) and every
 * sentence in it would be false printed under a headcount chart.
 *
 * The `sentence` is composed by the CARD, because only the card knows what it
 * drew — and crucially the sentences differ for `source: 'roster'` (a live
 * register counted today) versus `'snapshot'` (a dated file somebody filed).
 * Those are different claims about the world and must not share a sentence.
 */
export function WhatThisMeasures({ children, scope = null, refs = null, note = null, reduce = false }) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="mb-3.5 flex items-start gap-2.5 rounded-xl px-3.5 py-2.5"
      style={{ background: `${ENROLL_HUE}0A`, boxShadow: `inset 0 0 0 1px ${ENROLL_HUE}26` }}
    >
      <span
        aria-hidden="true"
        className="mt-[1px] grid h-5 w-5 shrink-0 place-items-center rounded-md"
        style={{ background: `${ENROLL_HUE}1F`, color: ENROLL_HUE }}
      >
        <Info size={12} strokeWidth={2.4} />
      </span>
      <div className="min-w-0 space-y-1.5">
        <p className="text-[12.5px] leading-snug text-navy/80">{children}</p>
        {(scope || refs) && (
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
            {scope ? (
              <span className="text-micro font-semibold uppercase text-ink2">{scope}</span>
            ) : null}
            {refs}
          </div>
        )}
        {note ? <p className="text-[11px] leading-snug text-muted">{note}</p> : null}
      </div>
    </motion.div>
  )
}

/**
 * ChartCaption — the ONE short line a chart leads with.
 *
 * The full WhatThisMeasures methodology paragraph now lives behind the card's ⓘ
 * popover; this is the piece of it a reader must not have to open anything to
 * see: one plain sentence fragment, plus the scope stamp and any reference-line
 * key (which are DATA, not prose, and stay in view). Nothing was deleted to make
 * this line — the popover carries every sentence the old box carried.
 */
export function ChartCaption({ children, scope = null, refs = null }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3.5 gap-y-1">
      <p className="text-[12px] leading-snug text-muted">{children}</p>
      {scope ? (
        <span className="text-micro font-semibold uppercase text-ink2">{scope}</span>
      ) : null}
      {refs}
    </div>
  )
}

/** The word for where the numbers came from, used inside the sentences above. */
export const sourcePhrase = (asOf) =>
  asOf?.source === 'roster'
    ? 'counted live from your student register'
    : `read from the enrollment file filed for ${fmtDate(asOf?.observedOn) ?? 'that date'}`

/** A dashed reference-line key, drawn in the same ink as the line it names. */
export function RefChip({ color, name, value, gloss, dashed = true }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`inline-block w-4 ${dashed ? 'border-t-2 border-dashed' : 'border-t-[3px]'}`}
        style={{ borderColor: color }}
      />
      <span className="text-micro font-semibold uppercase" style={{ color }}>
        {name}
        {value != null ? ` ${value}` : ''}
      </span>
      {gloss ? <span className="text-[11px] text-muted">— {gloss}</span> : null}
    </span>
  )
}

/** The plan's ink — deliberately NOT the enrollment hue: plan is a different
 *  CLASS of fact from an observation, and it wears a different colour as well
 *  as a different line style. */
export const PLAN_INK = '#B45309'

/** An empty/CTA strip in the card body — a card that cannot draw says why. */
export function CardEmpty({ children, cta = null }) {
  return (
    <div className="border-y border-hair px-4 py-8 text-center">
      <p className="mx-auto max-w-md text-small leading-relaxed text-ink2">{children}</p>
      {cta ? <div className="mt-3">{cta}</div> : null}
    </div>
  )
}

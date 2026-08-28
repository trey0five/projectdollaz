// ─────────────────────────────────────────────────────────────────────────────
// E5 — DEMOGRAPHIC MIX, and E7 — SUPPORT NEEDS.
//
// ── E5 IS THE REVENUE-MIX CARD, IN STUDENTS ─────────────────────────────────
// This was a stack of three bar lists; it is now the SAME COMPOSITION the
// finance Overview uses for revenue mix (FancyDonut): a thick ring with the
// counted total in the hole, and under it a legend list carrying — in strict
// columns — a colour dot, the category, its exact COUNT and its share.
//
// The old objection to a pie was never the ring, it was reading VALUES off
// angles: a 3-D pie of eight skewed categories makes the reader decode a legend
// to learn anything. This composition answers that directly, and is why it was
// picked over a hand-rolled pie — the ring carries the SHAPE of the mix (one
// glance: is this school lopsided or mixed) while every figure is printed
// full-size in the list beneath it, on a common left edge, exactly as a bar list
// printed them. Nothing is read off an angle.
//
// ONE DIMENSION AT A TIME, behind a segmented switch, rather than three donuts
// stacked: race, gender and ethnicity are three separate part-to-whole
// questions, and the reason this whole tab was re-cut into views is that nobody
// scrolls. The switch costs one click and saves two card-heights.
//
// COUNTS ARE THE PRIMARY READ, SHARES THE SECOND. "3%" of a small school is
// three children; a percentage alone rounds real students out of existence. So
// the legend's value column is the count and the share sits in the gutter.
//
// COLOUR FOLLOWS THE CATEGORY, BY CANONICAL POSITION — the same demographicColor
// the register pills and the enrollment hero use, keyed by the category's fixed
// place in the vocabulary rather than by which categories happen to be present.
// A school enrolling its first student of some race must not silently recolour
// every other row. Colour carries no judgement here: these are identity
// categories, so the palette is flat with no good/bad axis.
//
// ── E7 STAYS A COUNT STRIP, AND MUST NEVER BECOME A DONUT ───────────────────
// E5 moved to a ring because race, gender and ethnicity are PART-TO-WHOLE: every
// student sits in exactly one category and the categories add to the school.
// Support flags are not. One child can carry an IEP and a 504 and be an English
// learner, and "Any support flag" deliberately overlaps all three — the numbers
// sum past the school and the ring would be drawing a whole that does not exist,
// with each wedge understating its own flag. So these stay four counts on four
// tiles. Register status is likewise a strip of chips, not a wedge.
//
// ── E7 IS ROSTER-MODE ONLY, AND MASKS HARD ──────────────────────────────────
// Support flags describe a handful of children by name-adjacent facts: one ELL
// student in a forty-pupil school is identifiable to anyone who knows the
// school. Those cells are suppressed by the server and rendered blank WITH THE
// REASON, never as a zero.
//
// "New this year" is WITHHELD rather than printed whenever start dates are
// incomplete. The OneRoster importer writes `enrolledOn: null`, so on those
// rosters a confident "0 new students" would be a fabrication presented as a
// fact — the server publishes the coverage instead and the card says so.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { Flag, FileCheck2, Languages, LifeBuoy } from 'lucide-react'
import FancyDonut from '../analytics/charts/FancyDonut.jsx'
import { CATEGORICAL_LIGHT } from '../analytics/v2/chartPalette.js'
import { demographicColor } from '../../lib/demographicColor.js'
import {
  ETHNICITY_LABELS,
  GENDER_LABELS,
  RACE_LABELS,
  STUDENT_STATUS_KEYS,
  STUDENT_STATUS_LABELS,
} from '../../lib/demographicVocab.js'
import {
  CELL_MASKED,
  CardEmpty,
  ENROLL_HUE,
  cellState,
  cellTitle,
  cellToken,
  fmtCount,
  fmtShare,
  hasValue,
} from './enrollmentAnalyticsKit.jsx'

const LABELS = { race: RACE_LABELS, gender: GENDER_LABELS, ethnicity: ETHNICITY_LABELS }

const DIMENSIONS = [
  ['race', 'Race'],
  ['gender', 'Gender'],
  ['ethnicity', 'Ethnicity'],
]

/**
 * One dimension's cells → FancyDonut parts (wedge + legend row, one per cell).
 *
 * ── HOW MASKING SURVIVES BECOMING A DONUT ───────────────────────────────────
 * DECISION: a masked category is OMITTED FROM THE ARC and still LISTED in the
 * legend, dimmed, printing `<5` with NO share. It is not folded into a single
 * "Withheld" wedge, and that is not a style preference — a folded wedge would
 * have to be SIZED, and the only honest size is the sum of the counts the server
 * just refused to send (`{ value: null, suppressed: true }`). Reconstructing that
 * total in the browser would hand back, as geometry, the very number the mask
 * exists to withhold; guessing it would draw a lie. So the ring covers exactly
 * the categories whose counts are published, and the legend — which is where
 * every figure on this card is actually read — carries the withheld ones by name,
 * so nobody concludes the category is empty or absent.
 *
 * The stand-in `value: 0` is a DRAWING instruction, not a count: FancyDonut skips
 * zero-value parts (frac <= 0 → no wedge) while still rendering their legend row.
 * The printed token stays '<5' (masked) or '—' (never filed), never '0'.
 *
 * `share: '—'` is passed EXPLICITLY for those rows because FancyDonut falls back
 * to its own geometric percentage when a share is absent — which for a stand-in
 * zero would print a confident "0%" beside a hidden child.
 *
 * Order is the server's (count descending, ties by key) and is not re-sorted
 * here: the masked cells' stand-in zero would move them.
 */
function toParts(dimension, cells) {
  const labels = LABELS[dimension] ?? {}
  return (cells ?? []).map((c, i) => {
    const shown = hasValue(c.count)
    return {
      label: labels[c.key] ?? c.key,
      color: demographicColor(dimension, c.key) ?? CATEGORICAL_LIGHT[i % CATEGORICAL_LIGHT.length],
      value: shown ? c.count.value : 0,
      formatted: cellToken(c.count),
      // A share beside a masked count is trivially invertible, so the server
      // drops it and so does this row.
      share: hasValue(c.share) ? fmtShare(c.share.value) : '—',
      deemph: !shown,
    }
  })
}

/** The dimension switch — one part-to-whole question at a time. */
function DimensionSwitch({ dims, active, onPick }) {
  if (dims.length < 2) return null
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Demographic dimension">
      {dims.map(([key, title]) => {
        const on = key === active
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(key)}
            className={`rounded-full px-3 py-1 text-[12px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-500/50 ${
              on ? 'text-white' : 'border border-rule/60 bg-white text-muted hover:text-navy'
            }`}
            style={on ? { background: ENROLL_HUE } : undefined}
          >
            {title}
          </button>
        )
      })}
    </div>
  )
}

export function EnrollmentDemographicsCard({ demographics }) {
  const dims = useMemo(
    () => DIMENSIONS.filter(([key]) => demographics?.[key]?.cells?.length),
    [demographics],
  )
  const [picked, setPicked] = useState(DIMENSIONS[0][0])

  if (!demographics) {
    return (
      <CardEmpty>
        No demographic breakdown is on file. A roster upload or a SIS sync that carries race, gender or ethnicity fills
        this in — and every cell under five students stays hidden.
      </CardEmpty>
    )
  }
  if (dims.length === 0) {
    return (
      <CardEmpty>
        Your enrollment reading carries no demographic detail — only a total and a breakdown by grade.
      </CardEmpty>
    )
  }

  // A dimension that disappears from the payload (a re-import that dropped
  // ethnicity, say) must not leave the card pointing at nothing.
  const activeKey = dims.some(([k]) => k === picked) ? picked : dims[0][0]
  const activeTitle = (dims.find(([k]) => k === activeKey) ?? dims[0])[1]
  const dim = demographics[activeKey]
  const parts = toParts(activeKey, dim.cells)
  const anyMasked = dim.cells.some((c) => cellState(c.count) === CELL_MASKED)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DimensionSwitch dims={dims} active={activeKey} onPick={setPicked} />
        {dim.diversityIndex != null ? (
          <span
            className="rounded-full px-2 py-0.5 text-[10.5px] font-bold tabular-nums"
            style={{ background: `${ENROLL_HUE}14`, color: '#0369A1' }}
            title="Blau/Simpson diversity index: the chance that two students picked at random report different races. 0 means everyone reports the same; 1 means maximally mixed."
          >
            diversity {dim.diversityIndex.toFixed(2)}
          </span>
        ) : null}
      </div>

      {/* Keyed on the dimension so the ring re-draws (and animates once) when the
          switch moves, rather than morphing wedges between two unrelated
          vocabularies. */}
      <FancyDonut
        key={activeKey}
        parts={parts}
        centerTotal={fmtCount(demographics.totalEnrolled)}
        centerSub={`students · ${activeTitle.toLowerCase()}`}
        formatter={(v) => fmtCount(v)}
      />

      <p className="text-[11px] leading-snug text-muted">
        Of {fmtCount(demographics.totalEnrolled)} students — the same total every share on this card is a share of.
        Categories with fewer than five students show{' '}
        <span className="font-mono font-bold text-amber-700">&lt;5</span> and drop their share, so the hidden count
        cannot be recovered by multiplying back.
        {anyMasked
          ? ' Those categories are listed but not drawn: sizing a wedge for them would put the withheld count back on the page as geometry.'
          : ''}
      </p>
    </div>
  )
}

const FLAGS = [
  ['iep', 'ISP / IEP', LifeBuoy],
  ['plan504', '504 plan', FileCheck2],
  ['ell', 'English learner', Languages],
  ['any', 'Any support flag', Flag],
]

export function EnrollmentSupportNeedsCard({ mix }) {
  if (!mix) {
    return (
      <CardEmpty>
        Support-needs and status counts are shown only for schools whose student register lives here. A file export&apos;s
        status counts describe the FILE — how many rows one export happened to mark withdrawn — not the school, so
        drawing them would be describing a spreadsheet as if it were your students.
      </CardEmpty>
    )
  }

  const statusRows = STUDENT_STATUS_KEYS.map((k) => [k, STUDENT_STATUS_LABELS[k], mix.status?.[k] ?? 0])
  const coverage = mix.datedCoverage
  const newHidden = cellState(mix.newThisYear) !== 'value'

  return (
    <div className="space-y-4">
      {/* Counts first — a flag strip, not a chart. Three per cent of a hundred
          students is three children, and a percentage would hide that. */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {FLAGS.map(([k, label, Icon]) => {
          const c = mix.flags?.[k]
          const masked = cellState(c) === 'masked'
          const lit = hasValue(c) && c.value > 0
          return (
            <div
              key={k}
              title={cellTitle(c) ?? undefined}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${
                masked ? 'border-amber-500/30 bg-amber-500/[0.06]' : lit ? 'bg-white' : 'border-rule/50 bg-cream/40'
              }`}
              style={lit && !masked ? { borderColor: `${ENROLL_HUE}55` } : undefined}
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                style={
                  masked
                    ? { background: 'rgba(180,83,9,0.12)', color: '#B45309' }
                    : lit
                      ? { background: `${ENROLL_HUE}18`, color: ENROLL_HUE }
                      : { background: 'rgba(0,0,0,0.04)', color: '#9aa4b2' }
                }
              >
                <Icon size={15} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{label}</p>
                <p
                  className={`font-serif text-[19px] font-bold tabular-nums ${
                    masked ? 'text-amber-700' : lit ? 'text-navy' : 'text-muted'
                  }`}
                >
                  {cellToken(c)}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Register status — counts, straight from the roster. */}
      <div>
        <h5 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">Register status</h5>
        <div className="flex flex-wrap gap-2">
          {statusRows.map(([k, label, n]) => (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rule/50 bg-white px-2.5 py-1 text-[12px]"
            >
              <span className="font-semibold text-muted">{label}</span>
              <span className="font-bold tabular-nums text-navy">{fmtCount(n)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* "New this year" — withheld with the reason rather than printed as a
          zero nobody counted. */}
      <div className="rounded-xl bg-navy/[0.03] px-3.5 py-2.5 ring-1 ring-navy/[0.06]">
        <p className="text-[12px] leading-snug text-navy/80">
          <span className="font-bold">New this year:</span>{' '}
          {newHidden ? (
            <span className="font-semibold text-amber-700">withheld</span>
          ) : (
            <span className="font-bold tabular-nums text-navy">{cellToken(mix.newThisYear)}</span>
          )}
        </p>
        {coverage ? (
          <p className="mt-1 text-[11px] leading-snug text-muted">
            {coverage.complete
              ? `Every one of the ${fmtCount(coverage.total)} enrolled students carries a start date, so this count is complete.`
              : `Start dates are recorded for ${fmtCount(coverage.withStartDate)} of ${fmtCount(
                  coverage.total,
                )} enrolled students. Rather than report a number that would be wrong, it is withheld — a roster imported from OneRoster carries no start dates at all, and would otherwise show a confident zero.`}
          </p>
        ) : null}
      </div>
    </div>
  )
}

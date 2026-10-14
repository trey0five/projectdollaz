// ─────────────────────────────────────────────────────────────────────────────
// EnrollmentHero — the head of the Enrollment overview.
//
// PREMIUM UI P4 (docs/Premium_UI_Plan.md §2.7 sketch 6): the dark stage is
// gone. The hero is now two things on the ground:
//
//   1. a StatStrip — the headcount (count-up), vs plan, and the absorbed KPI
//      row (Waitlist / New this year / Support flags / Withdrawn) as Stats with
//      vertical rules, no boxes;
//   2. a Section "Composition by grade" — a prose "read" column (source, as-of,
//      the vs-plan sentence or the honest no-plan door, and the grade legend
//      list) with the 240° ring right-aligned beside it. The ring is MONOCHROME
//      now: every segment is the module hue over an ink track, separated by 2px
//      surface gaps; identity is carried by the legend (label + count), hover
//      lifts a segment, click deep-links to the register filtered to that grade.
//
// The honesty rules are kept verbatim: no roster ⇒ an em-dash and "needs the
// student roster", never a zero we didn't count. The WHOLE-SCHOOL headline stays
// unmasked (a school total identifies nobody), but a per-grade count under
// MIN_CELL prints `<5` — suppression that one screen undoes is not suppression.
// The arc SPAN still uses the true count: the ring is composition, which is not
// a disclosure.
//
// vs plan: a status mark + word (healthStatus over the SAME bands the analytics
// cards use), or the honest "No plan set → set one" link. NEVER a fabricated
// fraction: the ring shows composition, which is true with or without a plan.
//
// Reduced motion: static ring at full length, values immediate.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { MIN_CELL, bandsFor, healthStatus } from '@finrep/analytics'
import { GRADE_KEYS } from '../../lib/demographicVocab.js'
import { moduleHue } from '../module/moduleAnatomy.js'
import { Section, StatStrip, Stat, Pill } from '../ui/surface/index.js'

const ENROLL_HUE = moduleHue('enrollment')

// Arc geometry — StrategyHorizon's proven dome, sampled as a polyline so
// pathLength and segment boundaries can never disagree (no SVG arc-flag
// ambiguity). 240° sweep, 120° gap at the bottom.
const VB_W = 520
const VB_H = 330
const CX = 260
const CY = 210
const R = 180
const START = 210
const SWEEP = 240
/** Degrees of surface gap between grade segments (the 2px-gap rule, in arc). */
const PAD_DEG = 1.6

function polar(f, r = R) {
  const a = ((START - SWEEP * f) * Math.PI) / 180
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)]
}

/** Sampled polyline between fractions f0..f1 of the dome. */
function segPath(f0, f1, samples = 48) {
  let d = ''
  for (let i = 0; i <= samples; i++) {
    const [x, y] = polar(f0 + ((f1 - f0) * i) / samples)
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `
  }
  return d.trim()
}

const GRADE_SHORT = Object.fromEntries(
  GRADE_KEYS.map((g) => [g, /^\d+$/.test(g) ? `Grade ${g}` : g]),
)

export function fmtDay(iso) {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const PROVIDER_LABELS = {
  roster: 'Live from your roster',
  blackbaud: 'Synced from Blackbaud',
  facts: 'Synced from FACTS',
  veracross: 'Synced from Veracross',
  oneroster_api: 'Synced from your SIS',
  oneroster_csv: 'From your roster file',
  manual: 'Entered by hand',
}

/** One absorbed-KPI Stat. `value` null ⇒ the honest em-dash + why. */
function KpiStat({ label, value, needsRoster }) {
  if (value == null) {
    return <Stat label={label} value="—" note={needsRoster ? 'needs the student roster' : null} />
  }
  if (typeof value === 'object' && value.suppressed) {
    // Server-suppressed small cell (privacy floor): the count never reached
    // the browser — render the same '<5' vocabulary the roster charts use.
    return <Stat label={label} value="<5" note="fewer than 5 — withheld" />
  }
  return <Stat label={label} value={value} />
}

export default function EnrollmentHero({
  total = null,
  byGrade = null,
  asOf = null,
  source = null,
  provider = null,
  vsPlan = null,
  kpis = null, // { waitlist, newThisYear, flagged } | null (no roster)
  withdrawn = null, // number | null
  onGradeClick = null,
}) {
  const reduce = useReducedMotion()
  const [hovered, setHovered] = useState(null)

  // The grade segments, in canonical order, zero-count grades dropped. Pad is
  // taken from each segment's own span so the arc total stays exact.
  const segments = useMemo(() => {
    const entries = GRADE_KEYS.map((g) => [g, Number(byGrade?.[g]) || 0]).filter(([, n]) => n > 0)
    const sum = entries.reduce((a, [, n]) => a + n, 0)
    if (sum === 0) return []
    const pad = PAD_DEG / SWEEP
    let acc = 0
    return entries.map(([g, n]) => {
      const span = n / sum
      const f0 = acc
      acc += span
      return {
        grade: g,
        count: n,
        // A grade under the floor keeps its true SPAN — the ring is composition
        // and must stay exact — but its printed COUNT is withheld, so this list
        // agrees with Analytics, the grade table and the export.
        masked: n > 0 && n < MIN_CELL,
        share: span,
        f0: f0 + (entries.length > 1 ? pad / 2 : 0),
        f1: acc - (entries.length > 1 ? pad / 2 : 0),
      }
    })
  }, [byGrade])

  const sourceLabel = PROVIDER_LABELS[source === 'roster' ? 'roster' : provider] ?? null
  const asOfLabel = fmtDay(asOf)

  // vs plan — the SAME bands the analytics cards judge this metric with.
  const plan = useMemo(() => {
    if (!vsPlan || vsPlan.planTotal == null) return null
    const status = healthStatus(vsPlan.gapPct, bandsFor('enrollment_vs_plan'), true)
    return { ...vsPlan, status }
  }, [vsPlan])

  const planWord = plan ? (plan.status === 'good' ? 'on plan' : plan.status === 'risk' ? 'behind plan' : 'watch') : null
  const planDelta = plan
    ? `${plan.gap >= 0 ? '+' : '−'}${Math.abs(plan.gap).toLocaleString('en-US')} vs plan ${plan.planTotal.toLocaleString('en-US')}`
    : null

  return (
    <div aria-label="Enrollment at a glance">
      {/* ── The stat strip: headcount + vs plan + the absorbed KPI row ── */}
      <StatStrip cols={6} className="stats-wrap grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Students enrolled"
          value={total != null ? total : '—'}
          status={total != null ? 'hue' : null}
          note={total != null ? (asOfLabel ? `as of ${asOfLabel}` : null) : 'no enrollment recorded yet'}
        />
        <Stat
          label="vs plan"
          value={plan ? `${plan.gap >= 0 ? '+' : '−'}${Math.abs(plan.gap).toLocaleString('en-US')}` : '—'}
          status={plan ? plan.status : null}
          delta={plan ? { text: planWord, tone: plan.status } : null}
          note={plan ? `plan ${plan.planTotal.toLocaleString('en-US')}` : 'no plan set'}
        />
        <KpiStat label="Waitlist" value={kpis?.waitlist ?? null} needsRoster={!kpis} />
        <KpiStat label="New this year" value={kpis?.newThisYear ?? null} needsRoster={!kpis} />
        <KpiStat label="Support flags" value={kpis?.flagged ?? null} needsRoster={!kpis} />
        <KpiStat label="Withdrawn" value={withdrawn} needsRoster={!kpis} />
      </StatStrip>

      {/* ── Composition by grade: the read, with the ring beside it ── */}
      <Section
        label="Composition by grade"
        aside={sourceLabel ? <Pill>{sourceLabel}</Pill> : null}
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:gap-10">
          {/* The read column */}
          <div className="min-w-0 lg:col-span-3">
            {total != null ? (
              <p className="sec-title">
                {total.toLocaleString('en-US')} students{asOfLabel ? ` as of ${asOfLabel}` : ''}
                {segments.length ? `, across ${segments.length} grade${segments.length === 1 ? '' : 's'}.` : '.'}
              </p>
            ) : (
              <p className="sec-title">No enrollment recorded yet.</p>
            )}

            {/* vs plan — status mark + word, or the honest no-plan door */}
            {plan ? (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-body text-ink">
                <span className={`mark tone-${plan.status}`} aria-hidden="true" />
                <span className="font-semibold tabular-nums">{planDelta}</span>
                <span className="text-ink2">· {planWord}</span>
              </p>
            ) : (
              <p className="mt-1 text-body text-ink2">
                No plan set —{' '}
                <Link to="/planning" className="font-semibold text-ink underline decoration-hair underline-offset-2 hover:decoration-ink">
                  set one in Planning
                </Link>{' '}
                and this becomes a live vs-plan read.
              </p>
            )}

            {total == null ? (
              <p className="mt-2 text-small text-ink2">Add a roster or a headcount from Add data and the ring fills in.</p>
            ) : null}

            {/* Grade legend — a ruled list; hover lifts the segment, click filters the register */}
            {segments.length > 0 ? (
              <ul className="mt-4 divide-y divide-hair border-y border-hair" aria-label="Students by grade">
                {segments.map((seg) => {
                  const dim = hovered != null && hovered !== seg.grade
                  const row = (
                    <>
                      <span
                        aria-hidden="true"
                        className="mark"
                        style={{ color: ENROLL_HUE, opacity: dim ? 0.3 : 1 }}
                      />
                      <span className={`min-w-0 flex-1 text-small font-semibold ${dim ? 'text-ink2' : 'text-ink'}`}>
                        {GRADE_SHORT[seg.grade]}
                      </span>
                      {/* FERPA: a masked grade prints NO share. Beside the unmasked
                          school total two lines above, a share would bound the
                          withheld count — the same rule EnrollmentGradeTable keeps. */}
                      <span className="w-14 text-right text-small text-ink2 tabular-nums" data-testid="grade-share">
                        {seg.masked ? '—' : `${Math.round(seg.share * 100)}%`}
                      </span>
                      <span
                        className="w-12 text-right text-small font-semibold text-ink tabular-nums"
                        title={seg.masked ? `Fewer than ${MIN_CELL} students — withheld so no child is identifiable` : undefined}
                      >
                        {seg.masked ? `<${MIN_CELL}` : seg.count.toLocaleString('en-US')}
                      </span>
                    </>
                  )
                  return (
                    <li key={seg.grade}>
                      {onGradeClick ? (
                        <button
                          type="button"
                          onMouseEnter={() => setHovered(seg.grade)}
                          onMouseLeave={() => setHovered(null)}
                          onFocus={() => setHovered(seg.grade)}
                          onBlur={() => setHovered(null)}
                          onClick={() => onGradeClick(seg.grade)}
                          title={`See ${GRADE_SHORT[seg.grade]} in the register`}
                          className="flex h-8 w-full items-center gap-3 rounded-sm text-left outline-none transition-colors hover:bg-ink/[.03] focus-visible:ring-2 focus-visible:ring-navy-soft/40"
                        >
                          {row}
                        </button>
                      ) : (
                        <div
                          className="flex h-8 w-full items-center gap-3"
                          onMouseEnter={() => setHovered(seg.grade)}
                          onMouseLeave={() => setHovered(null)}
                        >
                          {row}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>

          {/* The ring — monochrome: module hue over an ink track */}
          <div className="relative mx-auto w-full max-w-[400px] lg:col-span-2 lg:mx-0 lg:ml-auto">
            <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="block w-full" aria-hidden="true">
              {/* the track — the full composition, ink at 10% */}
              <path
                d={segPath(0, 1, 180)}
                fill="none"
                stroke="rgb(16 28 61 / 0.1)"
                strokeWidth="14"
                strokeLinecap="round"
              />
              {segments.map((seg, i) => {
                const dim = hovered != null && hovered !== seg.grade
                return (
                  <motion.path
                    key={seg.grade}
                    d={segPath(seg.f0, seg.f1)}
                    fill="none"
                    stroke={ENROLL_HUE}
                    strokeWidth="14"
                    strokeLinecap="butt"
                    initial={reduce ? false : { pathLength: 0 }}
                    // opacity rides framer's animate (an inline style would be
                    // overwritten by the motion value) so hover still dims.
                    animate={{ pathLength: 1, opacity: dim ? 0.28 : 1 }}
                    transition={{ type: 'spring', stiffness: 55, damping: 18, delay: 0.15 + i * 0.08 }}
                  />
                )
              })}
            </svg>

            {/* ── Dome: the headcount ── */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8 text-center">
              {total != null ? (
                <>
                  <span className="font-serif text-[52px] font-medium leading-none text-ink tabular-nums sm:text-[60px]">
                    {total.toLocaleString('en-US')}
                  </span>
                  <span className="mt-1 text-micro font-semibold uppercase text-ink2">students enrolled</span>
                </>
              ) : (
                <>
                  <span className="font-serif text-[44px] font-medium leading-none text-ink2">—</span>
                  <span className="mt-1 max-w-[200px] text-small leading-snug text-ink2">no roster yet</span>
                </>
              )}
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EnrollmentHero — the head of the Enrollment overview, on the Aurora system
// (owner-approved 2026-10-15).
//
// It renders three things, in reading order:
//
//   1. THE BAND (AuroraHero): school chip + period eyebrow, "Enrollment", ONE
//      plain verdict sentence built from the real headcount and plan, the page's
//      jobs as buttons, the grade-composition ring in the right column, and up
//      to four frosted-glass figures (enrolled · gap to plan · plan · the roster
//      figures, any extra as chips).
//   2. `attention` — whatever the page passes ("Needs a look" tiles) sits right
//      under the band, so the thing that needs a decision is never below a chart.
//   3. "Students by grade": the headcount by grade as VERTICAL columns (owner
//      rule) in a white card, a ruled grade legend whose rows deep-link to the
//      register filtered to that grade, and a stack of short summary tiles
//      (largest grade, smallest grade shown, grades hidden for privacy, the
//      vs-plan tile the page passes in).
//
// The ring is MONOCHROME: every segment is the module hue over a faint track,
// separated by 2px gaps; identity is carried by the legend (label + count).
// It shows COMPOSITION, which is true with or without a plan — never a
// fabricated fraction of the plan.
//
// The honesty rules are kept verbatim: no roster ⇒ an em-dash and "needs the
// student roster", never a zero we didn't count. The WHOLE-SCHOOL headline stays
// unmasked (a school total identifies nobody), but a per-grade count under
// MIN_CELL prints `<5` and draws NO column — suppression that one screen undoes
// is not suppression. The ring's arc SPAN still uses the true count: the ring is
// composition, which is not a disclosure.
//
// vs plan: the verdict pill comes from healthStatus over the SAME bands the
// analytics cards use, or the honest "No plan set → set one" link.
//
// Reduced motion: static ring at full length, values immediate.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Flag,
  GraduationCap,
  Lock,
  LogOut,
  Target,
  UserPlus,
  Users,
} from 'lucide-react'
import { MIN_CELL, bandsFor, healthStatus } from '@finrep/analytics'
import '../../styles/pending/aurora-enroll-acad.css'
import { GRADE_KEYS } from '../../lib/demographicVocab.js'
import { formatMetricValue } from '../../lib/metricMeta.js'
import { moduleHue } from '../module/moduleAnatomy.js'
import {
  AuroraHero,
  AuroraSection,
  AuroraCard,
  AuroraColumns,
  AuroraTile,
  AuroraTileGrid,
  AuroraEmpty,
  VerdictEm,
} from '../ui/aurora/index.js'

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
/** Degrees of gap between grade segments (the 2px-gap rule, in arc). */
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
/** The column label: "Gr 4" keeps seven-plus grades legible on a phone. */
const GRADE_COL = Object.fromEntries(GRADE_KEYS.map((g) => [g, /^\d+$/.test(g) ? `Gr ${g}` : g]))

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

/**
 * One roster figure for a glass card. `value` null ⇒ null (the card prints the
 * honest em-dash — it needs the student roster), a server-suppressed small cell
 * ⇒ the same '<5' vocabulary the roster charts use, and a COMPLEMENTARY one
 * (e.g. "Support flags" while one flag is under the floor — the figure is not
 * small, it is hidden so the small flag cannot be subtracted out) ⇒ "withheld".
 * Never a zero we didn't count, never '<5' over a figure that is not small.
 */
function rosterFigure(value) {
  if (value == null) return null
  if (typeof value === 'object' && value.suppressed) return value.reason === 'complementary' ? 'withheld' : `<${MIN_CELL}`
  return Number(value).toLocaleString('en-US')
}

const n0 = (n) => Number(n).toLocaleString('en-US')

/** The roster-only figures: what they are, and what they need. */
const ROSTER_FIGURES = [
  { key: 'waitlist', label: 'Waitlist', icon: CalendarClock },
  { key: 'newThisYear', label: 'New this year', icon: UserPlus },
  { key: 'flagged', label: 'Support flags', icon: Flag },
  { key: 'withdrawn', label: 'Withdrawn', icon: LogOut },
]

/** The composition ring for the band's right column (dark ground). */
function GradeRing({ segments, total, hovered, setHovered, onGradeClick, reduce }) {
  const hoveredSeg = hovered != null ? segments.find((s) => s.grade === hovered) ?? null : null
  return (
    <div className="enr-ring">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="block w-full" aria-hidden="true">
        {/* the track — the full composition, faint on the band */}
        <path d={segPath(0, 1, 180)} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="26" strokeLinecap="round" />
        {segments.map((seg, i) => {
          const dim = hovered != null && hovered !== seg.grade
          return (
            <motion.path
              key={seg.grade}
              d={segPath(seg.f0, seg.f1)}
              fill="none"
              stroke={ENROLL_HUE}
              strokeWidth="26"
              strokeLinecap="butt"
              className={onGradeClick ? 'cursor-pointer' : undefined}
              onMouseEnter={() => setHovered(seg.grade)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(seg.grade)}
              onBlur={() => setHovered(null)}
              onClick={onGradeClick ? () => onGradeClick(seg.grade) : undefined}
              initial={reduce ? false : { pathLength: 0 }}
              // opacity rides framer's animate (an inline style would be
              // overwritten by the motion value) so hover still dims.
              animate={{ pathLength: 1, opacity: dim ? 0.3 : 1 }}
              transition={{ type: 'spring', stiffness: 55, damping: 18, delay: 0.15 + i * 0.08 }}
            />
          )
        })}
      </svg>
      {/* ── Dome: the headcount — or, while a segment is hovered, THAT grade
          (count only; a masked grade says '<5', never its share). ── */}
      <div className="enr-ring-dome" aria-live="polite">
        {hoveredSeg ? (
          <>
            <span className="enr-ring-num">{hoveredSeg.masked ? `<${MIN_CELL}` : n0(hoveredSeg.count)}</span>
            <span className="enr-ring-cap">{GRADE_SHORT[hoveredSeg.grade] ?? hoveredSeg.grade}</span>
          </>
        ) : total != null ? (
          <>
            <span className="enr-ring-num">{n0(total)}</span>
            <span className="enr-ring-cap">students</span>
          </>
        ) : (
          <>
            <span className="enr-ring-num">—</span>
            <span className="enr-ring-cap">no roster yet</span>
          </>
        )}
      </div>
    </div>
  )
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
  // Aurora band slots (all optional — the bare component still renders).
  school = null,
  eyebrow = null,
  actions = null,
  tools = null,
  attention = null,
  planTile = null,
  emptyAction = null,
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

  // The SIGN in words — the judgement is the card's Good / Watch / At risk
  // pill, so the caption never adds a third verdict word for the same metric.
  const planWord = plan ? (plan.gap < 0 ? 'Short of plan' : plan.gap > 0 ? 'Over plan' : 'On plan') : null
  const gapPctText =
    plan && Number.isFinite(Number(plan.gapPct)) && plan.gapPct !== 0
      ? `${plan.gapPct > 0 ? '+' : '−'}${formatMetricValue(Math.abs(plan.gapPct), 'percent')}`
      : null

  // ── The verdict: one sentence from the real headcount and plan ──
  const verdict =
    total != null ? (
      <>
        <VerdictEm>{n0(total)} students</VerdictEm>
        {segments.length > 1 ? ` across ${segments.length} grades.` : '.'}{' '}
        {plan ? (
          plan.gap < 0 ? (
            <>
              That is <VerdictEm tone={plan.status}>{n0(Math.abs(plan.gap))} short</VerdictEm> of the plan of{' '}
              {n0(plan.planTotal)}.
            </>
          ) : plan.gap > 0 ? (
            <>
              That is <VerdictEm tone="good">{n0(plan.gap)} over</VerdictEm> the plan of {n0(plan.planTotal)}.
            </>
          ) : (
            <>Right on the plan of {n0(plan.planTotal)}.</>
          )
        ) : (
          <>
            No plan set —{' '}
            <Link to="/planning" className="enr-verdict-link">
              set one in Planning
            </Link>
            .
          </>
        )}
      </>
    ) : (
      <>No enrollment recorded yet. Add a roster or a headcount and this page fills in.</>
    )

  // ── The glass figures: headline first, roster figures after (extras → chips) ──
  const bandKpis = [
    {
      key: 'enrolled',
      icon: Users,
      label: 'Students enrolled',
      value: total != null ? n0(total) : null,
      caption: total != null ? (asOfLabel ? `Counted ${asOfLabel}` : 'Latest count') : 'No count yet',
    },
  ]
  if (plan) {
    bandKpis.push(
      {
        key: 'gap',
        icon: plan.gap < 0 ? ArrowDownRight : ArrowUpRight,
        label: 'Gap to plan',
        value: plan.gap === 0 ? '0' : `${plan.gap > 0 ? '+' : '−'}${n0(Math.abs(plan.gap))}`,
        unit: gapPctText,
        caption: planWord,
        verdict: plan.status,
      },
      {
        key: 'plan',
        icon: Target,
        label: 'Plan',
        value: n0(plan.planTotal),
        caption: 'From your plan',
      },
    )
  }
  if (kpis) {
    for (const f of ROSTER_FIGURES) {
      const raw = f.key === 'withdrawn' ? withdrawn : kpis[f.key]
      // A complementary figure says WHY it is withheld, in the caption where the
      // source line would sit (it is not small — a small flag sits behind it).
      const complementary = !!raw && typeof raw === 'object' && raw.suppressed && raw.reason === 'complementary'
      bandKpis.push({
        key: f.key,
        icon: f.icon,
        label: f.label,
        value: rosterFigure(raw),
        caption: complementary ? 'Withheld to protect a small group' : 'From the student list',
      })
    }
  }

  // ── Summary tiles beside the chart (FERPA: masked grades print no count) ──
  const shown = segments.filter((s) => !s.masked)
  const masked = segments.filter((s) => s.masked)
  const largest = shown.length ? shown.reduce((a, b) => (b.count > a.count ? b : a)) : null
  const smallest = shown.length > 1 ? shown.reduce((a, b) => (b.count < a.count ? b : a)) : null
  const pct = (s) => `${Math.round(s.share * 100)}%`

  const bars = segments.map((seg) => ({
    key: seg.grade,
    label: GRADE_COL[seg.grade],
    // A masked grade draws NO column: its height would print the withheld count.
    value: seg.masked ? null : seg.count,
    display: seg.masked ? null : n0(seg.count),
    full: seg.masked ? `Fewer than ${MIN_CELL} — hidden` : `${n0(seg.count)} students (${pct(seg)})`,
    color: ENROLL_HUE,
  }))

  return (
    <div aria-label="Enrollment at a glance">
      <AuroraHero
        moduleKey="enrollment"
        className="enr-band"
        school={school}
        eyebrow={eyebrow}
        title="Enrollment"
        verdict={verdict}
        actions={actions}
        tools={tools}
        monogram={false}
        aside={
          <GradeRing
            segments={segments}
            total={total}
            hovered={hovered}
            setHovered={setHovered}
            onGradeClick={onGradeClick}
            reduce={reduce}
          />
        }
        kpis={bandKpis}
      />

      {attention}

      {/* ── Students by grade ── */}
      <AuroraSection
        first={!attention}
        icon={GraduationCap}
        title="Students by grade"
        subtitle={total != null ? `Where the ${n0(total)} students are` : 'Where your students are'}
        count={sourceLabel}
      >
        {segments.length ? (
          <div className="enr-grades">
            <AuroraCard title="Headcount by grade" subtitle="Students in each grade" className="min-w-0">
              <AuroraColumns
                ariaLabel="Students in each grade"
                tick={(t) => (Number.isInteger(t) ? String(t) : t.toFixed(1))}
                bars={bars}
              />
              {/* Grade legend — a ruled list; click opens the register on that grade */}
              <ul className="enr-legend" aria-label="Students by grade">
                {segments.map((seg) => {
                  const dim = hovered != null && hovered !== seg.grade
                  const row = (
                    <>
                      <span className={`enr-legend-name${dim ? ' is-dim' : ''}`}>{GRADE_SHORT[seg.grade]}</span>
                      {/* FERPA: a masked grade prints NO share. Beside the unmasked
                          school total, a share would bound the withheld count — the
                          same rule EnrollmentGradeTable keeps. */}
                      <span className="enr-legend-share" data-testid="grade-share">
                        {seg.masked ? '—' : `${Math.round(seg.share * 100)}%`}
                      </span>
                      <span
                        className="enr-legend-count"
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
                          title={`See ${GRADE_SHORT[seg.grade]} in the records`}
                          className="enr-legend-row"
                        >
                          {row}
                        </button>
                      ) : (
                        <div
                          className="enr-legend-row"
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
            </AuroraCard>

            <AuroraTileGrid stack>
              {largest ? (
                <AuroraTile
                  row
                  art={false}
                  icon={ArrowUpRight}
                  title={`${GRADE_SHORT[largest.grade]} · ${n0(largest.count)}`}
                  desc={`Largest grade (${pct(largest)})`}
                />
              ) : null}
              {smallest ? (
                <AuroraTile
                  row
                  art={false}
                  icon={GraduationCap}
                  hue="var(--au-h3)"
                  title={`${GRADE_SHORT[smallest.grade]} · ${n0(smallest.count)}`}
                  desc={`Smallest grade shown (${pct(smallest)})`}
                />
              ) : null}
              {masked.length ? (
                <AuroraTile
                  row
                  art={false}
                  icon={Lock}
                  tone="neutral"
                  title={
                    masked.length === 1
                      ? `${GRADE_SHORT[masked[0].grade]} · fewer than ${MIN_CELL}`
                      : `${masked.length} grades · fewer than ${MIN_CELL} each`
                  }
                  desc="Hidden to protect privacy"
                />
              ) : null}
              {planTile}
            </AuroraTileGrid>
          </div>
        ) : (
          <AuroraEmpty
            icon={GraduationCap}
            text={total != null ? 'No grade counts on file yet.' : 'No enrollment recorded yet.'}
            sub="Add a roster or a headcount from Add data and this fills in."
            action={emptyAction}
          />
        )}

        {/* The roster-only figures, locked with their reason when there is no
            student list — an em-dash and why, never a zero we didn't count. */}
        {!kpis ? (
          <div className="enr-locked">
            <p className="enr-locked-head">
              <Lock size={14} aria-hidden="true" /> Unlocks once the student list is uploaded
            </p>
            <ul className="enr-locked-grid">
              {ROSTER_FIGURES.map((f) => (
                <li key={f.key} className="enr-locked-tile" aria-label={`${f.label}: needs the student roster`}>
                  <f.icon size={16} aria-hidden="true" />
                  <span className="min-w-0">
                    <b>{f.label}</b>
                    <span>Needs the student list</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </AuroraSection>
    </div>
  )
}

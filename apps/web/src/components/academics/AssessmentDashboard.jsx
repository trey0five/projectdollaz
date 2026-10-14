// ─────────────────────────────────────────────────────────────────────────────
// AssessmentDashboard — the academic command center.
//
// Every number here is computed SERVER-SIDE by the pure assessment layer and
// arrives in one payload, so this file only paints. That is deliberate: a chart
// that does its own arithmetic is a second implementation waiting to disagree
// with the print packet and the assistant.
//
// The reference lines are the point of the whole screen. A percentile of 68
// means nothing until the reader sees the national midpoint at 50 and the
// diocesan average beside it — so both lines are drawn ON the chart rather than
// printed underneath it, and the selected school is the one bar that is lit.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  ArrowUpDown,
  Award,
  BarChart3,
  BookOpen,
  ChevronRight,
  ClipboardList,
  Coins,
  Crosshair,
  Flag,
  Footprints,
  Gauge,
  Grid3x3,
  LineChart,
  Network,
  Scale,
  Sparkles,
  Table2,
  Target,
  TrendingDown,
  TrendingUp,
  Users2,
} from 'lucide-react'
import { useReducedMotion } from '../analytics/charts/useReducedMotion.js'
import ColumnChart from '../analytics/charts/ColumnChart.jsx'
import AcademicsHeatmap from './AcademicsHeatmap.jsx'
import { DIVERGING_INK } from '../analytics/charts/heatScales.js'
import { subjectLabelOf } from '@finrep/analytics'
import { ChartDefs, INK, fitScale, shortName, spreadLabels } from './chartKit.jsx'
import { WhatThisMeasures, axisUnitOf, unitLabelOf } from './MeasureNote.jsx'
import { Section } from '../module/SectionHeader.jsx'
import { StatStrip, Stat, Pill } from '../ui/surface/index.js'
import useDtOverflow from '../ui/surface/useDtOverflow.js'
import AssessmentFilters from './AssessmentFilters.jsx'
import CohortLongitudinal from './CohortLongitudinal.jsx'

const EASE = [0.2, 0.8, 0.2, 1]
const HUE = '#0D9488'

// One map, in the semantic layer, so the chart axis and the sentence beside it
// can never disagree about what a subject is called.
const label = subjectLabelOf

const fmt = (v, digits = 1) =>
  v === null || v === undefined ? '—' : Number(v).toFixed(digits).replace(/\.0$/, '')
const signed = (v, digits = 1) => {
  if (v === null || v === undefined) return '—'
  const r = Number(Number(v).toFixed(digits))
  // A rounded zero is zero — "-0" reads as a deficit that isn't there.
  if (r === 0) return '0'
  return `${r > 0 ? '+' : ''}${r}`
}

/**
 * FIVE QUESTIONS, FIVE DOORS. Not five slices of one question — the ordering is
 * the reading order a leadership team actually uses: where do we stand, what is
 * happening in the classrooms, are we moving, are these the same children, and
 * how does the network compare.
 */
// Exported so the page chrome can name the current view in the breadcrumb —
// one list, so the tab strip and the trail can never disagree about a label.
export const VIEWS = [
  { key: 'standing', label: 'Standing' },
  { key: 'classroom', label: 'Classroom' },
  { key: 'time', label: 'Over time' },
  { key: 'cohorts', label: 'Cohorts' },
  { key: 'network', label: 'Network' },
]

const STANDING_TONE = {
  strong: { text: 'text-emerald-700', bg: 'bg-emerald-500/12', ring: 'ring-emerald-500/30', dot: '#059669' },
  below: { text: 'text-rose-700', bg: 'bg-rose-500/12', ring: 'ring-rose-500/30', dot: '#e11d48' },
  average: { text: 'text-navy/70', bg: 'bg-navy/[0.06]', ring: 'ring-navy/15', dot: '#64748b' },
  unknown: { text: 'text-muted', bg: 'bg-navy/[0.04]', ring: 'ring-navy/10', dot: '#cbd5e1' },
}

/** A variance chip — the "-45 points vs network" the whole deck hangs on. A
 *  status Pill: the mark carries the standing, the text stays ink. */
function VarianceChip({ variance, standing, unit = '' }) {
  const tone = standing === 'strong' ? 'good' : standing === 'below' ? 'risk' : 'neutral'
  const Icon = standing === 'strong' ? TrendingUp : standing === 'below' ? TrendingDown : null
  return (
    <Pill variant="status" tone={tone}>
      {Icon ? <Icon size={11} aria-hidden="true" /> : null}
      {signed(variance)}
      {unit} vs peers
    </Pill>
  )
}

// ── KPI strip ────────────────────────────────────────────────────────────────

/**
 * A metric Stat (Premium UI P4): label / Garamond value / the context line /
 * the variance Pill — on the ground, in a StatStrip, no card, no bloom.
 */
function KpiCard({ title, value, sub, chip }) {
  return (
    <Stat label={title} value={value} note={sub} className={typeof value === 'string' && /[a-z]/i.test(value) ? 'stat-text' : ''}>
      {chip ? <div className="mt-2">{chip}</div> : null}
    </Stat>
  )
}

// ── Ranked schools ───────────────────────────────────────────────────────────

/**
 * The page's headline chart, so it earns the most treatment.
 *
 * The old version drew all three schools with the same slab of colour, which
 * meant the reader had to find themselves in their own dashboard before it could
 * say anything. Now the focus school is a gradient with an outer glow and its
 * value set large; peers recede to a quiet grey. The axis is FITTED to the
 * values present rather than pinned to the theoretical 1–99, because on the
 * theoretical scale a fifteen-point gap renders as a shrug.
 */
function RankedSchools({ schools, focusId, national, peerAvg, range, anonymous, unit }) {
  const rows = anonymous
    ? anonymous.map((p, i) => ({ id: `${p.label}-${i}`, label: p.label, value: p.value, emphasis: !!p.isFocus }))
    : schools.map((s) => ({
        id: s.schoolId,
        label: s.schoolName ?? 'School',
        value: s.value,
        emphasis: s.schoolId === focusId,
        forthcoming: !!s.forthcoming,
      }))
  const n = rows.length
  const ranked = rows.map((r, i) => ({ ...r, meta: [{ label: 'Rank', value: `${i + 1} of ${n}` }] }))

  const refs = [
    national !== null && national !== undefined ? { value: national, label: `National ${fmt(national, 0)}`, color: INK.national } : null,
    peerAvg !== null && peerAvg !== undefined ? { value: peerAvg, label: `Network ${fmt(peerAvg)}`, color: INK.network } : null,
  ].filter(Boolean)

  // THE AXIS, DISCLOSED. The chart zooms to the values present (fitScale's
  // rule), draws an axis-break glyph on the baseline whenever it does, and
  // prints the range in play under the plot — so a five-point spread filling
  // the height is never mistaken for a rout.
  return (
    <ColumnChart
      rows={ranked}
      color={HUE}
      fit={{ range, pad: 0.12, includeZero: false }}
      refs={refs}
      unit={unit}
      height={260}
      showValues="selective"
      ariaLabel="Every school, ranked by average score"
    />
  )
}

// ── Subjects, as a divergence from the network ───────────────────────────────

/**
 * A DIFFERENT CHART, not a prettier one.
 *
 * The old version drew each subject's raw score with a dashed marker for the
 * network average, leaving the reader to do the subtraction — while the number
 * they actually wanted, the gap, was printed separately in grey at the end of
 * the row. Here the bar IS the gap: it grows left when the school is behind and
 * right when it is ahead, from a centre line that is the network. One glance
 * gives the answer and the ranking of the answers.
 */
function SubjectDivergence({ subjects }) {
  const rows = (subjects ?? []).filter((s) => s.value !== null && s.variance !== null && s.variance !== undefined)
  if (rows.length === 0) {
    return <p className="text-[12.5px] text-muted">No subject breakdown for this selection.</p>
  }
  return (
    <div>
      <ColumnChart
        diverging
        rows={rows.map((r) => ({
          id: r.subject,
          label: label(r.subject),
          value: r.variance,
          // Within half a point of the network is level: neutral grey, so a
          // −0.4 never shows as a red column labelled "0".
          color: Math.abs(r.variance) < 0.5 ? DIVERGING_INK.mid : undefined,
          formatted: Math.abs(r.variance) < 0.5 ? '0' : signed(r.variance, 0),
          meta: [{ label: 'Score', value: fmt(r.value, 0) }],
        }))}
        // The same blue↔red pair the heat map beside this chart uses — one
        // page, one diverging encoding.
        color={DIVERGING_INK.pos}
        negativeColor={DIVERGING_INK.neg}
        tickFormatter={(v) => signed(v, 0)}
        showValues="all"
        height={200}
        ariaLabel="Gap from the network average, by subject"
      />
      {/* The zero line is the network average — the thing every column is
          measured from, so it is named, not left as an unlabelled axis. */}
      <p className="mt-2 text-[11px] text-muted">
        The baseline is each subject&apos;s own network average: a column above it is ahead, one below it is behind.
      </p>
    </div>
  )
}

// ── Cohort tracker ───────────────────────────────────────────────────────────

/**
 * THE LONGITUDINAL COHORT — the same children, one year apart.
 *
 * This is the view a diocese actually argues from, and it was the weakest thing
 * on the page: rich data (prior grade and year, current grade and year, tested
 * counts on both, the change, the direction) rendered as a flat list of bars.
 *
 * A SLOPEGRAPH is the right chart and almost nobody builds one. Two axes, one
 * line per school, and the SLOPE is the finding — you read who rose, who fell,
 * and who crossed whom, in a single glance, without a legend. A grouped bar
 * chart of the same numbers makes you compare heights across a gap; the slope
 * hands you the comparison directly.
 *
 * Three components, in the order the question is asked: where did the cohort
 * land, how did each school move, and who moved most.
 */
function CohortPanel({ cohort, national, range, reduce }) {
  if (!cohort || cohort.movements.length === 0) return null
  const { summary, movements: moves, grade } = cohort
  const focusId = cohort.focusSchoolId ?? null

  const pairs = moves.filter((m) => m.prior?.value !== null && m.current?.value !== null)
  const priorYear = moves[0]?.prior?.schoolYear
  const currentYear = moves[0]?.current?.schoolYear
  const priorGrade = moves[0]?.prior?.gradeLevel
  const worst = Math.max(...moves.map((m) => Math.abs(m.change ?? 0)), 3)

  // ── The slopegraph ──
  const W = 820
  // HEIGHT GROWS WITH THE ROSTER. At a fixed 320px the label spreader needs
  // 22px a school and has ~240px to give, so a diocese of fourteen pushed names
  // straight out of the frame and over the caption beneath it. The canvas now
  // buys the room it needs rather than overflowing what it has.
  const H = Math.max(320, pairs.length * 32 + 110)
  // Wide gutters on purpose: each end of a slope carries a school name, its
  // score in a chip, and (on the right) the move — none of which fit in the
  // 92px the first cut allowed, which is why every name arrived truncated.
  const PAD = { l: 206, r: 152, t: 44, b: 34 }
  const uid = 'cohort'
  const { lo, hi } = fitScale(
    [...pairs.flatMap((m) => [m.prior.value, m.current.value]), national],
    range,
    { pad: 0.22 },
  )
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b)
  const xL = PAD.l
  const xR = W - PAD.r

  // 27 for the same reason as the quadrant: the left gutter's block is a name
  // over a cohort count, which is taller than the 22 the spreader was given.
  const left = spreadLabels(pairs.map((m) => ({ id: m.schoolId, y: y(m.prior.value) })), 27)
  const right = spreadLabels(pairs.map((m) => ({ id: m.schoolId, y: y(m.current.value) })), 24)
  const labelY = (side, id) => (side === 'l' ? left : right).find((p) => p.id === id)?.y ?? 0

  // Rank by where the cohort ENDED, so the badge beside a name answers "and how
  // does that place us?" without the reader counting lines.
  const endRank = new Map(
    [...pairs].sort((a, b) => (b.current.value ?? 0) - (a.current.value ?? 0)).map((m, i) => [m.schoolId, i + 1]),
  )

  return (
    <div className="space-y-5">
      {/* ── Where the cohort landed ── */}
      <StatStrip cols={4} className="stats-wrap grid-cols-2 sm:grid-cols-4">
        <Stat label={`${priorGradeLabel(grade)} · ${priorYear ?? ''}`} value={fmt(summary.priorAverage.value)} />
        <Stat label={`Grade ${grade} · ${currentYear ?? ''}`} value={fmt(summary.currentAverage.value)} />
        <Stat
          label="Cohort change"
          value={signed(summary.change)}
          status={summary.change == null ? null : (summary.change ?? 0) >= 0 ? 'good' : 'risk'}
        />
        {/* NOT "gained / declined". These count only moves past the materiality
            floor, so a cohort that visibly rose 4 points is correctly counted
            as neither — which reads as a contradiction sitting next to a chart
            that plainly shows +4. The label says what it counts. */}
        <Stat
          label="Moved materially"
          value={`${summary.gained} ↑ ${summary.declined} ↓`}
          note={`${moves.length - summary.gained - summary.declined} within the noise`}
          className="stat-text"
        />
      </StatStrip>

      {/* ── The slopegraph ── */}
      {pairs.length > 0 ? (
        <div>
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Cohort trajectory by school">
            <ChartDefs id={uid} />

            {/* Two columns, softly banded. A slopegraph is read as "this column,
                then that one", and a bare hairline never said that. */}
            {[xL, xR].map((cx, i) => (
              <rect
                key={cx}
                x={cx - 26}
                y={PAD.t - 6}
                width="52"
                height={H - PAD.t - PAD.b + 12}
                rx="12"
                fill={i === 0 ? 'rgba(16,28,61,0.035)' : `${HUE}0E`}
              />
            ))}
            <line x1={xL} x2={xL} y1={PAD.t} y2={H - PAD.b} stroke="rgba(16,28,61,0.16)" strokeWidth="1.5" />
            <line x1={xR} x2={xR} y1={PAD.t} y2={H - PAD.b} stroke={`${HUE}55`} strokeWidth="1.5" />

            {national !== null && national !== undefined && national >= lo && national <= hi ? (
              <>
                <line x1={xL - 26} x2={xR + 26} y1={y(national)} y2={y(national)} stroke={INK.national} strokeWidth="1.2" strokeDasharray="5 4" opacity="0.55" />
                {/* Pinned to the edge. Floating this label mid-chart put it
                    straight through the slopes it was meant to reference. */}
                {/* Above the rule, inside the plot. To the LEFT it sat in the
                    same gutter as the school names and collided with whichever
                    one happened to land at the national line. */}
                <text x={xL + 8} y={y(national) - 5} fontSize="8.5" fontWeight="700" fill={INK.national} textAnchor="start">
                  NATIONAL {national}
                </text>
              </>
            ) : null}

            {/* Column headers as chips, so the two axes announce themselves. */}
            {[
              { cx: xL, text: `${priorGradeLabel(grade).toUpperCase()} · ${priorYear}`, dim: true },
              { cx: xR, text: `GRADE ${grade} · ${currentYear}`, dim: false },
            ].map((h) => (
              <g key={h.text}>
                <rect
                  x={h.cx - 62}
                  y={PAD.t - 36}
                  width="124"
                  height="22"
                  rx="11"
                  fill={h.dim ? 'rgba(16,28,61,0.06)' : HUE}
                />
                <text
                  x={h.cx}
                  y={PAD.t - 21}
                  fontSize="9"
                  fontWeight="700"
                  fill={h.dim ? '#475569' : '#fff'}
                  textAnchor="middle"
                  style={{ letterSpacing: '0.06em' }}
                >
                  {h.text}
                </text>
              </g>
            ))}

            {pairs.map((m, i) => {
              const isFocus = m.schoolId === focusId
              const up = (m.change ?? 0) >= 0
              // Peers fade as the network grows: fourteen lines at half opacity
              // is a thicket, and the one line the reader came for has to win.
              const dim = pairs.length > 8 ? 0.28 : 0.5
              const c = isFocus ? HUE : up ? `rgba(5,150,105,${dim})` : `rgba(225,29,72,${dim - 0.05})`
              const y1 = y(m.prior.value)
              const y2 = y(m.current.value)
              return (
                <motion.g
                  key={m.schoolId}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: reduce ? 0 : 0.15 + i * 0.1, duration: 0.5, ease: EASE }}
                >
                  <motion.line
                    x1={xL}
                    y1={y1}
                    x2={xR}
                    y2={y2}
                    stroke={isFocus ? `url(#${uid}-focus)` : c}
                    strokeWidth={isFocus ? 4 : 2}
                    strokeLinecap="round"
                    filter={isFocus ? `url(#${uid}-glow)` : undefined}
                    initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: reduce ? 0 : 0.2 + i * 0.1, duration: 0.7, ease: EASE }}
                  />
                  <circle cx={xL} cy={y1} r={isFocus ? 6 : 4.5} fill={isFocus ? HUE : '#fff'} stroke={isFocus ? '#fff' : c} strokeWidth="2" />
                  <circle cx={xR} cy={y2} r={isFocus ? 6 : 4.5} fill={isFocus ? HUE : '#fff'} stroke={isFocus ? '#fff' : c} strokeWidth="2" />

                  {/* ── Left gutter: rank badge, full name, starting score ──
                      The score now sits in a CHIP rather than trailing the name
                      as more text, so "which school" and "what did it score"
                      stop competing for the same glance. */}
                  <g transform={`translate(0, ${labelY('l', m.schoolId)})`}>
                    <circle cx={PAD.l - 196} cy="-4" r="9" fill={isFocus ? HUE : 'rgba(16,28,61,0.07)'} />
                    <text x={PAD.l - 196} y="-1" fontSize="9" fontWeight="700" textAnchor="middle" fill={isFocus ? '#fff' : '#64748b'}>
                      {endRank.get(m.schoolId)}
                    </text>
                    <text x={PAD.l - 182} y="-7" fontSize="10.5" textAnchor="start" fontWeight={isFocus ? '700' : '500'} fill={isFocus ? '#0f766e' : '#334155'}>
                      {shortName(m.schoolName, 17)}
                    </text>
                    <text x={PAD.l - 182} y="5" fontSize="8.5" textAnchor="start" fill="#94A3B8">
                      {m.prior.tested ? `${m.prior.tested} tested` : 'cohort size n/a'}
                    </text>
                    <rect x={xL - 50} y="-13" width="34" height="19" rx="9.5" fill="rgba(16,28,61,0.06)" />
                    <text x={xL - 33} y="0" fontSize="10.5" fontWeight="700" textAnchor="middle" fill="#475569" className="tabular-nums">
                      {fmt(m.prior.value, 0)}
                    </text>
                  </g>

                  {/* ── Right gutter: ending score, then the move ── */}
                  <g transform={`translate(0, ${labelY('r', m.schoolId)})`}>
                    <rect
                      x={xR + 16}
                      y="-13"
                      width="36"
                      height="19"
                      rx="9.5"
                      fill={isFocus ? HUE : 'rgba(16,28,61,0.06)'}
                    />
                    <text x={xR + 34} y="0" fontSize="10.5" fontWeight="700" textAnchor="middle" fill={isFocus ? '#fff' : '#475569'} className="tabular-nums">
                      {fmt(m.current.value, 0)}
                    </text>
                    <text
                      x={xR + 60}
                      y="0"
                      fontSize="11"
                      fontWeight="700"
                      textAnchor="start"
                      fill={up ? INK.ahead : INK.behind}
                      className="tabular-nums"
                    >
                      {up ? '▲' : '▼'} {signed(m.change, 0).replace(/^[+-]/, '')}
                    </text>
                  </g>
                </motion.g>
              )
            })}
          </svg>
          <p className="mt-1 text-center text-[11px] text-muted">
            One line per school. The SLOPE is the finding — these are the same children, {priorGradeLabel(grade)} last
            year and grade {grade} now.
          </p>
        </div>
      ) : null}

      {/* ── Who moved most ── */}
      <div>
        {/* A named strip with COLUMN LABELS. The bare caption left three
            unlabelled numeric columns to be guessed at — the reader could see
            "41→38" without being told it was the cohort's size. */}
        <div className="mb-2 flex items-end gap-3">
          <span className="w-[196px] shrink-0 text-right text-[8.5px] font-bold uppercase tracking-[0.16em]" style={{ color: HUE }}>
            Cohort growth, ranked
          </span>
          <span className="flex-1 text-center text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted">
            ← declined · gained →
          </span>
          <span className="w-10 text-right text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted">
            Move
          </span>
          <span className="w-16 text-right text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted">
            Tested
          </span>
        </div>
        <div className="space-y-1.5">
          {[...moves]
            .sort((a, b) => (b.change ?? 0) - (a.change ?? 0))
            .map((m, i) => {
              const change = m.change ?? 0
              const up = change >= 0
              const w = (Math.abs(change) / worst) * 50
              const isFocus = m.schoolId === focusId
              return (
                <div key={m.schoolId} className="flex items-center gap-3">
                  <span
                    className={`w-[160px] shrink-0 truncate text-right text-[11.5px] ${isFocus ? 'font-bold text-navy' : 'text-muted'}`}
                    title={m.schoolName}
                  >
                    {m.schoolName}
                  </span>
                  <div className="relative h-5 flex-1">
                    <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2" style={{ background: 'rgba(16,28,61,0.2)' }} />
                    <motion.div
                      initial={reduce ? { width: `${w}%` } : { width: 0 }}
                      animate={{ width: `${w}%` }}
                      transition={{ duration: 0.6, ease: EASE, delay: reduce ? 0 : 0.05 + i * 0.06 }}
                      className="absolute top-1/2 h-3.5 -translate-y-1/2 rounded"
                      style={{
                        [up ? 'left' : 'right']: '50%',
                        background: up ? `linear-gradient(90deg, #34D399, ${INK.ahead})` : `linear-gradient(270deg, #FB7185, ${INK.behind})`,
                        boxShadow: isFocus ? `0 0 14px -2px ${up ? INK.ahead : INK.behind}` : 'none',
                      }}
                    />
                  </div>
                  <span className="w-10 text-right text-[11.5px] font-bold tabular-nums" style={{ color: up ? INK.ahead : INK.behind }}>
                    {signed(change, 0)}
                  </span>
                  <span className="w-16 text-right text-[10px] text-muted">
                    {m.prior?.tested ?? '—'}→{m.current?.tested ?? '—'}
                  </span>
                </div>
              )
            })}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          The last column is how many children sat the test each year — a cohort that shrank or grew a lot is a
          different group of children, and the change should be read with that in mind.
        </p>
      </div>
    </div>
  )
}

// ── Multi-year trend ─────────────────────────────────────────────────────────

/**
 * The school's line against the network's, year by year. Two lines and nothing
 * else: a trend chart earns its space by answering "are we moving, and are we
 * moving differently from everyone around us" — anything more is decoration.
 */
function TrendChart({ points, national, range, reduce }) {
  const usable = points.filter((p) => p.school !== null || p.peer !== null)
  if (usable.length < 2) {
    return (
      <p className="text-[12.5px] text-muted">
        One year on file — load a second year and the trend appears here.
      </p>
    )
  }

  const W = 640
  const H = 250
  const PAD = { l: 38, r: 46, t: 22, b: 30 }
  const uid = 'trend'

  // Fitted, not theoretical — see chartKit.fitScale. On a 1–99 axis a real
  // two-point move renders as a flat line, which is the one thing this chart
  // must never do.
  const { lo, hi } = fitScale(
    [...usable.flatMap((p) => [p.school, p.peer]), national],
    range,
    { pad: 0.3 },
  )
  const span = hi - lo || 1
  const x = (i) => PAD.l + (i / Math.max(1, usable.length - 1)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b)
  const line = (key) =>
    usable
      .map((p, i) => (p[key] === null ? null : `${i === 0 || usable[i - 1][key] === null ? 'M' : 'L'}${x(i)},${y(p[key])}`))
      .filter(Boolean)
      .join(' ')

  // The area under the school's line, closed along the floor.
  const schoolPts = usable.map((p, i) => ({ i, v: p.school })).filter((p) => p.v !== null)
  const area =
    schoolPts.length > 1
      ? `${schoolPts.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i)},${y(p.v)}`).join(' ')} L${x(schoolPts[schoolPts.length - 1].i)},${H - PAD.b} L${x(schoolPts[0].i)},${H - PAD.b} Z`
      : ''
  const last = schoolPts[schoolPts.length - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Score by year, school against the network">
      <ChartDefs id={uid} />

      {/* Horizontal guides, faint — a line chart with no ground floats. */}
      {[0, 0.5, 1].map((t) => (
        <line
          key={t}
          x1={PAD.l}
          x2={W - PAD.r}
          y1={PAD.t + t * (H - PAD.t - PAD.b)}
          y2={PAD.t + t * (H - PAD.t - PAD.b)}
          stroke={INK.grid}
          strokeWidth="1"
        />
      ))}

      {national !== null && national !== undefined && national >= lo && national <= hi ? (
        <>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(national)}
            y2={y(national)}
            stroke={INK.national}
            strokeWidth="1.4"
            strokeDasharray="5 4"
            opacity="0.8"
          />
          <text x={W - PAD.r + 4} y={y(national) + 3} fontSize="9" fontWeight="700" fill={INK.national}>
            Nat {national}
          </text>
        </>
      ) : null}

      {/* The school's own band — the gradient is what gives the line weight. */}
      {area ? (
        <motion.path
          d={area}
          fill={`url(#${uid}-focus-v)`}
          initial={reduce ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.35 }}
        />
      ) : null}

      <motion.path
        d={line('peer')}
        fill="none"
        stroke={INK.network}
        strokeWidth="2"
        strokeDasharray="5 4"
        strokeLinecap="round"
        opacity="0.8"
        initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: EASE }}
      />

      <motion.path
        d={line('school')}
        fill="none"
        stroke={`url(#${uid}-focus)`}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${uid}-glow)`}
        initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: EASE, delay: 0.12 }}
      />

      {/* Every year gets a dot; the LAST one gets a halo, because "where we are
          now" is the value the reader came for. */}
      {schoolPts.map((p, k) => {
        const isLast = k === schoolPts.length - 1
        return (
          <motion.g
            key={p.i}
            initial={reduce ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: EASE, delay: reduce ? 0 : 0.5 + k * 0.12 }}
            style={{ transformOrigin: `${x(p.i)}px ${y(p.v)}px` }}
          >
            {isLast && !reduce ? (
              <motion.circle
                cx={x(p.i)}
                cy={y(p.v)}
                fill="none"
                stroke={INK.focusLight}
                strokeWidth="2"
                // `r` needs an INITIAL as well as a keyframe list: animating it
                // alone leaves the first rendered frame with r="undefined",
                // which SVG rejects outright and the console reports as an
                // attribute error on every mount.
                initial={{ r: 4.5, opacity: 0.55 }}
                animate={{ r: [4.5, 13], opacity: [0.55, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
              />
            ) : null}
            <circle cx={x(p.i)} cy={y(p.v)} r={isLast ? 6 : 4} fill={HUE} stroke="#fff" strokeWidth="2" />
            <text
              x={x(p.i)}
              y={y(p.v) - (isLast ? 14 : 11)}
              fontSize={isLast ? '13' : '10.5'}
              fontWeight="700"
              textAnchor="middle"
              fill="#0f766e"
            >
              {fmt(p.v, 0)}
            </text>
          </motion.g>
        )
      })}

      {usable.map((p, i) => (
        <text key={`x-${p.schoolYear}`} x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="#64748b">
          {p.schoolYear}
        </text>
      ))}

      <text x={PAD.l - 6} y={PAD.t + 6} fontSize="9" textAnchor="end" fill="#94a3b8">
        {Math.round(hi)}
      </text>
      <text x={PAD.l - 6} y={H - PAD.b} fontSize="9" textAnchor="end" fill="#94a3b8">
        {Math.round(lo)}
      </text>
      {last ? null : null}
    </svg>
  )
}

// ── Achievement distribution ─────────────────────────────────────────────────

const BAND_LABEL = {
  q1: 'Bottom quarter',
  q2: 'Lower middle',
  q3: 'Upper middle',
  q4: 'Top quarter',
}
const BAND_COLOR = { q1: '#e11d48', q2: '#f59e0b', q3: '#0ea5e9', q4: '#059669' }

/**
 * Where students actually sit, not just where the mean does. Two schools can
 * share an average while one has everybody near the middle and the other has a
 * quarter of its students in the bottom band — this is the chart that tells them
 * apart.
 */
function Distribution({ slices, reduce }) {
  // Width comes from the COUNTS we were given, not from a server-sent share.
  // Once any band is suppressed the server withholds every share — a visible
  // count beside its share is the cohort total, and the total gives up the
  // hidden bands by subtraction — so a share-driven bar would collapse to zero
  // width exactly when part of the distribution is hidden.
  const visible = slices.reduce((acc, s) => acc + (s.count ?? 0), 0)
  const total = visible
  const width = (s) => (visible > 0 ? ((s.count ?? 0) / visible) * 100 : 0)
  const anyHidden = slices.some((s) => s.suppressed || s.count === null)
  // A WHOLE cohort under the floor arrives as all-null counts, which is not the
  // same as a file that carried averages only — telling the reader to "upload
  // student-level results" when they already have is how someone uploads twice.
  if (total === 0 && anyHidden) {
    return (
      <p className="text-[12.5px] text-muted">
        Fewer than five students have a score here, so the spread is hidden — the shape of a handful of results
        identifies the children in it.
      </p>
    )
  }
  if (total === 0) {
    return (
      <p className="text-[12.5px] text-muted">
        This file carried averages only — upload student-level results to see the spread.
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <div className="flex h-8 overflow-hidden rounded-lg">
        {slices.map((s, i) => (
          <motion.div
            key={s.band}
            initial={reduce ? { width: `${width(s)}%` } : { width: 0 }}
            animate={{ width: `${width(s)}%` }}
            transition={{ duration: 0.7, ease: EASE, delay: reduce ? 0 : i * 0.08 }}
            style={{ background: BAND_COLOR[s.band] }}
            title={`${BAND_LABEL[s.band]}: ${s.count} students`}
          />
        ))}
      </div>
      {anyHidden ? (
        <p className="text-[11.5px] text-muted">
          Bands under five students are hidden, and the percentages with them — a share beside a count would give the
          hidden bands away.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {slices.map((s) => (
          <div key={s.band} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAND_COLOR[s.band] }} />
            <span className="text-[11.5px] text-muted">{BAND_LABEL[s.band]}</span>
            <span className="ml-auto text-[12px] font-bold tabular-nums text-navy">
              {/* Not always "<5": safeDistribution deliberately hides a SECOND,
                  arbitrarily large band so the first cannot be recovered by
                  subtraction, and printing "<5" beside a band of forty is a
                  false statement about the data. */}
              {s.suppressed || s.count === null
                ? 'hidden'
                : anyHidden
                  ? `${s.count}`
                  : `${s.count} · ${Math.round(width(s))}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── The board table ──────────────────────────────────────────────────────────

/**
 * The table a board packet prints: every school, both years, the move, and the
 * gap to each reference. Sortable because the question changes — "who is
 * highest" and "who moved most" are different meetings.
 */
function ComparisonTable({ rows, scoreType }) {
  // A PERCENTILE is a whole number; an ACT composite is not. materialGap for the
  // ACT is 0.5, so rounding to zero decimals erased every difference the module
  // considers worth reporting — two schools 0.4 apart printed the same number.
  const dp = scoreType === 'scale' ? 1 : 0
  const [sort, setSort] = useState('current')
  const sorted = useMemo(() => {
    const copy = [...rows]
    if (sort === 'name') return copy.sort((a, b) => (a.schoolName ?? '').localeCompare(b.schoolName ?? ''))
    if (sort === 'change') return copy.sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity))
    return copy.sort((a, b) => (b.current ?? -Infinity) - (a.current ?? -Infinity))
  }, [rows, sort])
  const wrapRef = useDtOverflow([sorted])

  return (
    <div>
      {/* A toggle group, not three unrelated buttons: without the role and the
          pressed state a screen reader announces "Score, Change, A to Z" and
          never says which one the table is currently sorted by. */}
      <div className="seg mb-2" role="group" aria-label="Sort schools by">
        {[
          ['current', 'Score'],
          ['change', 'Change'],
          ['name', 'A–Z'],
        ].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)} className="seg-btn">
            {l}
          </button>
        ))}
      </div>
      <div ref={wrapRef} className="dt-wrap">
      <table className="dt min-w-[560px]">
        <thead>
          <tr>
            <th scope="col">School</th>
            <th scope="col" className="dt-num">This year</th>
            <th scope="col" className="dt-num">Last year</th>
            <th scope="col" className="dt-num">Change</th>
            <th scope="col" className="dt-num">vs network</th>
            <th scope="col" className="dt-num">vs national</th>
            <th scope="col" className="dt-num">Tested</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.schoolId}>
              <td className="text-ink">
                {r.rank ? <span className="mr-1.5 text-ink2 tabular-nums">{r.rank}</span> : null}
                {r.schoolName}
              </td>
              <td className="dt-num font-semibold text-ink">
                {r.forthcoming ? <span className="italic text-ink2">forthcoming</span> : fmt(r.current, dp)}
              </td>
              <td className="dt-num text-ink2">{fmt(r.prior, dp)}</td>
              <td className="dt-num">
                <ChangeBadge value={r.change} />
              </td>
              <td className={`dt-num ${gapTone(r.vsNetwork)}`}>{signed(r.vsNetwork, dp)}</td>
              <td className={`dt-num ${gapTone(r.vsNational)}`}>
                {scoreType === 'scale' ? '—' : signed(r.vsNational, dp)}
              </td>
              <td className="dt-num text-ink2">
                {r.tested === null || r.tested === undefined ? '—' : r.tested < 5 ? '<5' : r.tested}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}

/** The ceiling a SUBJECT score is measured against, per family. */
function subjectMax(ctx) {
  if (ctx?.scoreType === 'percentile' || ctx?.scoreType === 'nce') return 99
  if (ctx?.family === 'sat') return 800 // a section, not the 1600 total
  if (ctx?.family === 'act') return 36
  return ctx?.scoreRange?.max ?? 100
}

// Ink text, always: the gap's sign is the figure's own; the Change column
// carries the semantic mark (Pill) so the table is never colour-alone.
const gapTone = (v) => (v === null || v === undefined || v === 0 ? 'text-ink2' : 'text-ink')

function ChangeBadge({ value }) {
  if (value === null || value === undefined) return <span className="text-ink2">—</span>
  const up = value > 0
  const flat = Math.abs(value) < 0.05
  return (
    <Pill variant="status" tone={flat ? 'neutral' : up ? 'good' : 'risk'}>
      {flat ? null : up ? <TrendingUp size={10} aria-hidden="true" /> : <TrendingDown size={10} aria-hidden="true" />}
      {signed(value, 0)}
    </Pill>
  )
}

/** The grade BELOW this one, named — arithmetic prints "grade NaN" for K/PK. */
function priorGradeLabel(grade) {
  const g = String(grade ?? '').trim().toUpperCase()
  if (g === '1') return 'kindergarten'
  if (g === 'K') return 'pre-K'
  const n = Number.parseInt(g, 10)
  return Number.isFinite(n) && n > 1 ? `grade ${n - 1}` : 'the grade below'
}

// ── Section shell ────────────────────────────────────────────────────────────

// ── The dashboard ────────────────────────────────────────────────────────────

export default function AssessmentDashboard({
  data,
  onQuery,
  loading,
  // The cohort view reads its own route, so its payload arrives beside the
  // dashboard's rather than inside it: four view-local controls would otherwise
  // refetch the whole ~200KB payload that seven other tabs share.
  cohorts = null,
  cohortsLoading = false,
  cohortsError = '',
  onCohortQuery,
}) {
  const reduce = useReducedMotion()
  const [anonymous, setAnonymous] = useState(false)

  const ctx = data?.context
  const kpis = data?.kpis
  const subjects = ctx?.subjects ?? []

  const peerAvg = kpis?.average?.peer ?? null
  const rankText = kpis?.rank?.rank ? `${kpis.rank.rank} of ${kpis.rank.of}` : '—'
  // What the numbers on this page ARE, in the family's own units — one lookup,
  // shared by the KPI subtitle, the ranked chart's column header and every
  // explainer below, so the page cannot call the same figure two things.
  const unit = axisUnitOf(ctx)

  const objectives = data?.objectives ?? { strengths: [], opportunities: [] }
  const hasObjectives = objectives.strengths.length > 0 || objectives.opportunities.length > 0

  const select = (patch) => onQuery?.(patch)

  // The view lives in the URL so the Overview's cards can open a NAMED view
  // ("show me the cohorts") rather than dropping every reader on Standing and
  // making them hunt. It also survives a reload and a shared link, which a
  // useState never did.
  const [params, setParams] = useSearchParams()
  const rawView = params.get('view')
  const view = VIEWS.some((v) => v.key === rawView) ? rawView : 'standing'
  const setView = (key) => {
    const next = new URLSearchParams(params)
    if (key === 'standing') next.delete('view')
    else next.set('view', key)
    setParams(next, { replace: true })
  }


  if (data?.empty) {
    return (
      <div className="border-y border-hair py-10 text-center">
        <Sparkles size={20} className="mx-auto mb-2 text-ink2" aria-hidden="true" />
        <p className="font-serif text-title font-medium text-ink">No assessment results yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-small text-ink2">
          Upload a scores file — a diocesan summary or a student-level export — and this school appears
          beside its peers, grade by grade and subject by subject.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Scope bar ── */}
      <AssessmentFilters
        ctx={ctx}
        view={view}
        onSelect={select}
        loading={loading}
        anonymous={Boolean(data?.hidePeerNames ?? anonymous)}
        onAnonymous={(on) => {
          setAnonymous(on)
          select({ hidePeerNames: on ? true : null })
        }}
      />

      {/* ── KPI strip ── */}
      <StatStrip cols={4} className="stats-wrap grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Average score"
          value={fmt(kpis?.average?.value)}
          sub={`Network ${fmt(peerAvg)} · ${unitLabelOf(ctx)}`}
          chip={<VarianceChip variance={kpis?.average?.variance} standing={kpis?.average?.standing} />}
        />
        <KpiCard
          title="Rank in network"
          value={rankText}
          sub={`${ctx?.peerCount ?? 0} peer school${ctx?.peerCount === 1 ? '' : 's'}`}
        />
        <KpiCard
          title="Year over year"
          value={signed(kpis?.yoy)}
          sub={data?.trendDirection ? `Trend: ${data.trendDirection}` : null}
        />
        <KpiCard
          title="Participation"
          value={kpis?.participation?.rate === null || kpis?.participation?.rate === undefined ? '—' : `${Math.round(kpis.participation.rate * 100)}%`}
          sub={
            kpis?.participation?.comparable
              ? 'In line with peers — comparison is fair'
              : kpis?.participation?.peerRate
                ? `Peers ${Math.round(kpis.participation.peerRate * 100)}% — read with care`
                : null
          }
        />
      </StatStrip>

      {/* ── Key insight — the one sentence, as prose on the ground ── */}
      {data?.keyInsight ? (
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.22 }}
          className="flex max-w-[72ch] gap-2.5 font-serif text-heading leading-relaxed text-ink"
        >
          <Sparkles size={15} className="mt-1 shrink-0 text-ink2" aria-hidden="true" />
          <span>{data.keyInsight}</span>
        </motion.p>
      ) : null}

      {/* ── The five reads ──────────────────────────────────────────────────
          One scroll held every chart on the page, which meant the cohort panel
          and the network table were three screens below the fold and nobody
          knew they existed. These are five DIFFERENT QUESTIONS, not five slices
          of one, so each gets its own door — and the KPI strip and the insight
          stay above them, because those answer "how are we doing" regardless of
          which question you came for. */}
      <div className="tabs-ink overflow-x-auto" role="tablist" aria-label="Analysis">
        {VIEWS.map((v) => {
          const on = view === v.key
          return (
            <button key={v.key} type="button" role="tab" aria-selected={on} onClick={() => setView(v.key)} className="tab-ink">
              {v.label}
              {on ? <motion.span layoutId="academics-view-underline" className="tab-ink-rule" aria-hidden="true" /> : null}
            </button>
          )
        })}
      </div>

      {/* ── Standing ── */}
      {view === 'standing' ? (
      <>
      <Section
        eyebrow="Where this school stands" icon={Gauge}
        title={`Every school · ${ctx?.grade === 'all' ? 'all grades' : `grade ${ctx?.grade}`}`}
        reduce={reduce}
        aside={
          <Pill variant="count">Rank {rankText}</Pill>
        }
      >
        <WhatThisMeasures
          chart="standing"
          ctx={ctx}
          example={kpis?.average?.value}
          peerAvg={peerAvg}
          refs={['national', 'network']}
          reduce={reduce}
        />
        <RankedSchools
          schools={data?.schools ?? []}
          anonymous={anonymous ? data?.peersAnonymous : null}
          focusId={data?.school?.id}
          national={ctx?.nationalReference}
          peerAvg={peerAvg}
          range={ctx?.scoreRange}
          unit={unit}
        />
      </Section>

      {/* ── Subjects + heatmap ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section eyebrow="By subject" title="Where the gap actually is" icon={BookOpen} reduce={reduce}>
          <WhatThisMeasures chart="subjects" ctx={ctx} reduce={reduce} />
          <SubjectDivergence subjects={data?.subjects} />
        </Section>

        <Section eyebrow="Grade by grade" title="Where instruction is landing" icon={Grid3x3} reduce={reduce} delay={0.05}>
          <AcademicsHeatmap cells={data?.heatmap ?? []} subjects={subjects} unit={unit} reduce={reduce} />
          <p className="mt-2 text-[11px] text-muted">
            Each cell compares that grade with the SAME grade at other schools — the only comparison that means
            anything. A grade with fewer than five scored students shows a hatched cell — hidden, not zero: the gate
            nulls its values before they reach this chart, so there is no number here to shade.
          </p>
        </Section>
      </div>

      {/* ── System insights ── */}
      {data?.insights?.top ? (
        <Section eyebrow="The network" title="Top, bottom and the spread between" icon={Network} reduce={reduce}>
          <StatStrip cols={3} className="stats-wrap !grid-cols-1 sm:!grid-cols-3">
            <Stat label="Highest" value={fmt(data.insights.top?.value)} status="good" note={data.insights.top?.schoolName ?? '—'} />
            <Stat label="Lowest" value={fmt(data.insights.bottom?.value)} status="risk" note={data.insights.bottom?.schoolName ?? '—'} />
            <Stat label="Spread" value={fmt(data.insights.spread)} note="top to bottom" />
          </StatStrip>
        </Section>
      ) : null}
      </>
      ) : null}

      {/* ── Classroom ── */}
      {view === 'classroom' ? (
      <>
        <Section eyebrow="The spread" title="Where students actually sit" icon={BarChart3} reduce={reduce}>
          <WhatThisMeasures chart="distribution" ctx={ctx} reduce={reduce} />
          <Distribution slices={data?.distribution ?? []} reduce={reduce} />
        </Section>

        <Section eyebrow="Subgroups" title="Who the average is hiding" icon={Users2} reduce={reduce} delay={0.05}>
          <WhatThisMeasures chart="subgroups" ctx={ctx} reduce={reduce} />
          <SubgroupBars groups={data?.subgroups} range={ctx?.scoreRange} reduce={reduce} />
        </Section>

        {hasObjectives ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Section eyebrow="Strengths" title="What this school does well" icon={Sparkles} reduce={reduce}>
              <ObjectiveList items={objectives.strengths} tone="strong" />
            </Section>
            <Section eyebrow="Opportunities" title="Where to put the next hour" icon={Target} reduce={reduce} delay={0.05}>
              <ObjectiveList items={objectives.opportunities} tone="below" />
            </Section>
          </div>
        ) : null}
      </>
      ) : null}

      {/* ── Over time ── */}
      {view === 'time' ? (
      <>
      <div className="grid gap-4">
        <Section eyebrow="Across the years" title="Are we moving?" icon={LineChart} reduce={reduce}>
          <WhatThisMeasures
            chart="trend"
            ctx={ctx}
            example={kpis?.average?.value}
            refs={['national']}
            reduce={reduce}
          />
          <TrendChart
            points={data?.trend ?? []}
            national={ctx?.nationalReference}
            range={ctx?.scoreRange}
            reduce={reduce}
          />
          <p className="mt-1 flex items-center gap-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-4" style={{ background: HUE }} /> This school
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-[#2563EB]" /> Network
            </span>
          </p>
        </Section>
      </div>

      {/* The quadrant is a MAP, not a panel: four named regions, a reference
          cross and a bubble per school. At half width the regions collapsed to
          about 180px each and every label landed on top of its own dot, so it
          takes a full row of its own. */}
      <div className="grid gap-4">
        <Section eyebrow="Behind and falling" title="Growth against achievement" icon={Crosshair} reduce={reduce} delay={0.05}>
          <WhatThisMeasures chart="quadrant" ctx={ctx} peerAvg={peerAvg} refs={['network']} reduce={reduce} />
          <GrowthQuadrant
            movements={(data?.movements ?? []).map((m) => ({ ...m, isFocus: m.schoolId === data?.school?.id }))}
            peerAvg={peerAvg}
            range={ctx?.scoreRange}
            reduce={reduce}
          />
        </Section>
      </div>

      {/* ── Movement ── */}
      {(data?.movements ?? []).length > 0 ? (
        <Section eyebrow="Trends & movement" title="What a board asks first" icon={Activity} reduce={reduce}>
          <MovementHighlights movements={data.movements} national={ctx?.nationalReference} />
        </Section>
      ) : null}

      {(data?.movements ?? []).length > 0 ? (
        <Section eyebrow="Year over year" title="Every school, ranked by movement" icon={ArrowUpDown} reduce={reduce}>
          <div className="space-y-1.5">
            {data.movements.map((m, i) => {
              const tone = m.direction === 'improved' ? '#059669' : m.direction === 'declined' ? '#e11d48' : '#94a3b8'
              return (
                <motion.div
                  key={m.schoolId}
                  initial={reduce ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: reduce ? 0 : i * 0.04, duration: 0.35 }}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-navy/[0.03]"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone }} />
                  <span className="flex-1 truncate text-[12.5px] text-navy">{m.schoolName}</span>
                  <span className="text-[11px] tabular-nums text-muted">
                    {fmt(m.prior, 0)} → {fmt(m.current, 0)}
                  </span>
                  <span className="w-10 text-right text-[12px] font-bold tabular-nums" style={{ color: tone }}>
                    {signed(m.change, 0)}
                  </span>
                  {m.belowNational ? (
                    <Flag size={12} className="text-rose-600" title="Below the national midpoint" />
                  ) : (
                    <span className="w-3" />
                  )}
                </motion.div>
              )
            })}
          </div>
        </Section>
      ) : null}

      </>
      ) : null}

      {/* ── Cohorts ────────────────────────────────────────────────────────
          The v2 view, on its OWN payload. `data.cohort` (the two-point,
          every-school-in-the-diocese slopegraph) and `CohortPanel` below are
          untouched and still served by /dashboard — retiring them is a separate
          change, made once this has been read against the old one. */}
      {view === 'cohorts' ? (
        <CohortLongitudinal
          payload={cohorts}
          loading={cohortsLoading}
          error={cohortsError}
          onQuery={onCohortQuery}
          reduce={reduce}
        />
      ) : null}

      {/* ── Network ── */}
      {view === 'network' ? (
      <>
        {(data?.table ?? []).length > 0 ? (
          <Section
            eyebrow="Board-ready" icon={ClipboardList}
            title="Every school, both years"
            reduce={reduce}
            aside={
              <span>{ctx?.grade === 'all' ? 'All grades' : `Grade ${ctx?.grade}`}</span>
            }
          >
            <WhatThisMeasures
              chart="network"
              ctx={ctx}
              example={kpis?.average?.value}
              peerAvg={peerAvg}
              refs={['national', 'network']}
              reduce={reduce}
            />
            <BoardReportBars
              rows={data.table}
              national={ctx?.nationalReference}
              peerAvg={peerAvg}
              range={ctx?.scoreRange}
              focusId={data?.school?.id}
              scoreType={ctx?.scoreType}
              reduce={reduce}
            />
          </Section>
        ) : null}

        {(data?.table ?? []).length > 0 ? (
          <Section
            eyebrow="The same numbers, as a table" icon={Table2}
            title="Sortable, for the packet"
            reduce={reduce}
            aside={
              <span>{ctx?.grade === 'all' ? 'All grades' : `Grade ${ctx?.grade}`}</span>
            }
          >
            <ComparisonTable rows={data.table} scoreType={ctx?.scoreType} />
          </Section>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Section eyebrow="Is the comparison fair?" title="Participation against score" icon={Scale} reduce={reduce}>
            <ParticipationFairness rows={data?.table ?? []} />
          </Section>

          <Section
            eyebrow="Outcomes and the ledger" icon={Coins}
            title="What this score cost"
            reduce={reduce}
            delay={0.05}
          >
            <CostChain rows={data?.crossDomain ?? []} scoreType={ctx?.scoreType} />
          </Section>
        </div>
      </>
      ) : null}
    </div>
  )
}


// ── Growth × achievement ─────────────────────────────────────────────────────
//
// The question a superintendent actually asks: which schools are BOTH behind and
// getting worse? A ranked bar answers "who is lowest" and a trend line answers
// "who is falling", and neither answers the intersection — which is the one that
// decides where the next visit goes. Achievement on x, one-year change on y,
// quadrant lines at the network average and at zero change.
function GrowthQuadrant({ movements, peerAvg, range, reduce }) {
  const pts = (movements ?? []).filter((m) => m.current !== null && m.change !== null)
  if (pts.length < 2) {
    return <p className="text-[12.5px] text-muted">Two years across at least two schools lights this up.</p>
  }

  const W = 640
  const H = 320
  // Generous right padding: a label sitting on the rightmost point used to run
  // off the edge and get clipped by the viewBox, which is how "South Plantation"
  // became "South Plantatio".
  const PAD = { l: 44, r: 96, t: 30, b: 42 }
  const uid = 'quad'

  const xs = pts.map((p) => p.current)
  const { lo: xLo, hi: xHi } = fitScale([...xs, peerAvg], range, { pad: 0.16 })
  const yMag = Math.max(3, ...pts.map((p) => Math.abs(p.change))) * 1.35
  const x = (v) => PAD.l + ((v - xLo) / (xHi - xLo || 1)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - (v + yMag) / (2 * yMag)) * (H - PAD.t - PAD.b)
  const midX = peerAvg === null || peerAvg === undefined ? null : x(peerAvg)
  const midY = y(0)

  // Bubble size from the cohort behind each point, on a sqrt scale so AREA
  // tracks the count — a linear radius would make a school of 200 look four
  // times the school of 50 rather than twice.
  const maxTested = Math.max(...pts.map((p) => p.tested ?? 0), 1)
  const radius = (n) => (n ? 7 + Math.sqrt(n / maxTested) * 9 : 7)

  // LABEL WHAT MATTERS, NOT EVERYTHING.
  //
  // A scatter has no rows to grow into: every extra school competes for the same
  // canvas. At fourteen, naming all of them turned the plot into a stack of
  // overlapping text with the dots buried underneath — the labels destroyed the
  // chart they were annotating.
  //
  // So above a threshold only the schools a reader came to find keep a label:
  // the school they are signed in to, whoever moved furthest either way, and
  // anyone sitting in the bottom-left — the corner this panel's own caption
  // says is the one that matters. Everyone else stays a bubble, still plotted,
  // still positioned, and still named on hover. Nothing is dropped from the
  // chart; only the ink is rationed.
  const LABEL_ALL_UPTO = 8
  const notable = new Set()
  if (pts.length > LABEL_ALL_UPTO) {
    const byMove = [...pts].sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    byMove.slice(0, 3).forEach((p) => notable.add(p.schoolId ?? p.schoolName))
    pts
      .filter((p) => p.isFocus || (peerAvg !== null && p.current < peerAvg && p.change < 0))
      .slice(0, 4)
      .forEach((p) => notable.add(p.schoolId ?? p.schoolName))
    pts.filter((p) => p.isFocus).forEach((p) => notable.add(p.schoolId ?? p.schoolName))
  }
  const labelled = (p) => pts.length <= LABEL_ALL_UPTO || notable.has(p.schoolId ?? p.schoolName)

  // Only the labelled points enter the spreader — nudging a point that carries
  // no text just moves its leader line away from its own dot.
  const placed = spreadLabels(
    pts.map((p, i) => ({ ...p, px: x(p.current), y: y(p.change) - 13, i, showLabel: labelled(p) })).filter((p) => p.showLabel),
    // 26, not 14: each label is TWO lines (the name, then the move and the
    // cohort). Spacing them by less than the height of the block they carry is
    // why they still collided after the spreader had run.
    26,
  ).map((p) => ({ ...p, y: Math.max(PAD.t + 8, Math.min(H - PAD.b - 4, p.y)) }))

  // The rest still plot, at their true position, named on hover.
  const quiet = pts
    .map((p, i) => ({ ...p, px: x(p.current), y: y(p.change) - 13, i }))
    .filter((p) => !labelled(p))

  const zones = midX
    ? [
        { x: PAD.l, y: PAD.t, w: midX - PAD.l, h: midY - PAD.t, label: 'Behind, but rising', tone: 'rgba(245,158,11,0.05)' },
        { x: midX, y: PAD.t, w: W - PAD.r - midX, h: midY - PAD.t, label: 'Ahead and rising', tone: 'rgba(5,150,105,0.06)' },
        { x: PAD.l, y: midY, w: midX - PAD.l, h: H - PAD.b - midY, label: 'Behind and falling', tone: 'rgba(225,29,72,0.07)' },
        { x: midX, y: midY, w: W - PAD.r - midX, h: H - PAD.b - midY, label: 'Ahead, but slipping', tone: 'rgba(245,158,11,0.05)' },
      ]
    : []

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Achievement against one-year change, by school">
        <ChartDefs id={uid} />

        {/* NAMED QUADRANTS. An unlabelled quadrant chart makes the reader work
            out what each corner means before it can tell them anything; naming
            them turns the chart into four sentences. */}
        {zones.map((z) =>
          z.w > 40 && z.h > 26 ? (
            <g key={z.label}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} fill={z.tone} rx="6" />
              <text
                x={z.x + 8}
                y={z.y + 14}
                fontSize="8.5"
                fontWeight="700"
                fill="#94A3B8"
                style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}
              >
                {z.label}
              </text>
            </g>
          ) : null,
        )}

        <line x1={PAD.l} x2={W - PAD.r} y1={midY} y2={midY} stroke="rgba(16,28,61,0.28)" strokeWidth="1.4" />
        {midX !== null ? (
          <>
            <line x1={midX} x2={midX} y1={PAD.t} y2={H - PAD.b} stroke={INK.network} strokeWidth="1.4" strokeDasharray="5 4" opacity="0.75" />
            <text x={midX} y={PAD.t - 10} fontSize="9" fontWeight="700" fill={INK.network} textAnchor="middle">
              Network {fmt(peerAvg, 0)}
            </text>
          </>
        ) : null}

        {/* The unlabelled: plotted at their true position, quieter, and named
            on hover. Rationing the LABELS is not the same as dropping schools —
            the shape of the network still comes from all of them. */}
        {quiet.map((p, i) => {
          const cy = y(p.change)
          const c = p.change >= 0 ? INK.ahead : INK.behind
          return (
            <motion.g
              key={`q-${p.schoolId ?? p.schoolName ?? i}`}
              initial={reduce ? false : { opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: reduce ? 0 : 0.15 + i * 0.05, duration: 0.45, ease: EASE }}
              style={{ transformOrigin: `${p.px}px ${cy}px` }}
            >
              <title>{`${p.schoolName}: ${fmt(p.current, 0)}, ${signed(p.change, 0)}${p.tested ? ` · ${p.tested} tested` : ''}`}</title>
              <circle cx={p.px} cy={cy} r={radius(p.tested)} fill={c} fillOpacity="0.4" stroke="#fff" strokeWidth="1.5" />
            </motion.g>
          )
        })}

        {placed.map((p, i) => {
          const up = p.change >= 0
          const c = up ? INK.ahead : INK.behind
          const cy = y(p.change)
          // SIZE CARRIES THE COHORT. A flat dot said only "a school is here";
          // scaling it by how many children sat the exam adds the dimension the
          // reader needs to weigh the point at all — a +9 built on eleven
          // students is not the same finding as a +9 built on two hundred.
          const r = radius(p.tested)
          const rightSide = p.px > W - PAD.r - 96
          const lx = p.px + (rightSide ? -(r + 10) : r + 10)
          return (
            <motion.g
              key={p.schoolId ?? p.schoolName ?? i}
              initial={reduce ? false : { opacity: 0, scale: 0.3 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: reduce ? 0 : 0.15 + i * 0.12, duration: 0.55, ease: EASE }}
              style={{ transformOrigin: `${p.px}px ${cy}px` }}
            >
              {/* A slow halo on the focus school — the eye finds it without
                  hunting, which is the whole job of a focus mark. */}
              {p.isFocus && !reduce ? (
                <motion.circle
                  cx={p.px}
                  cy={cy}
                  fill="none"
                  stroke={HUE}
                  strokeWidth="2"
                  initial={{ r, opacity: 0.5 }}
                  animate={{ r: [r, r + 14], opacity: [0.5, 0] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
                />
              ) : null}
              <circle cx={p.px} cy={cy} r={r + 3} fill={p.isFocus ? `${HUE}22` : `${c}18`} />
              <circle
                cx={p.px}
                cy={cy}
                r={r}
                fill={p.isFocus ? `url(#${uid}-focus)` : c}
                fillOpacity={p.isFocus ? 1 : 0.85}
                stroke="#fff"
                strokeWidth="2.5"
                filter={p.isFocus ? `url(#${uid}-glow)` : undefined}
              />

              {/* A leader line, so a nudged label still points at its own dot. */}
              <line x1={p.px + (rightSide ? -r : r)} y1={cy} x2={lx} y2={p.y} stroke={p.isFocus ? HUE : '#CBD5E1'} strokeWidth="1" opacity="0.6" />

              <g transform={`translate(${lx}, ${p.y})`}>
                {/* Haloed: a label that has to cross the network rule or a
                    quadrant boundary stays legible instead of being sliced by
                    it. Stroke first, fill over the top. */}
                <text
                  x={rightSide ? -6 : 6}
                  y={4}
                  fontSize="10.5"
                  fontWeight={p.isFocus ? '700' : '500'}
                  textAnchor={rightSide ? 'end' : 'start'}
                  fill={p.isFocus ? '#0f766e' : '#475569'}
                  stroke="#fff"
                  strokeWidth="3.5"
                  paintOrder="stroke"
                  strokeLinejoin="round"
                >
                  {shortName(p.schoolName, 22)}
                </text>
                <text
                  x={rightSide ? -6 : 6}
                  y={16}
                  fontSize="10"
                  fontWeight="700"
                  textAnchor={rightSide ? 'end' : 'start'}
                  fill={c}
                  stroke="#fff"
                  strokeWidth="3.5"
                  paintOrder="stroke"
                  strokeLinejoin="round"
                >
                  {signed(p.change, 0)}
                  <tspan fill="#94A3B8" fontWeight="400">
                    {p.tested ? ` · ${p.tested} tested` : ''}
                  </tspan>
                </text>
              </g>
            </motion.g>
          )
        })}

        <text x={PAD.l - 6} y={PAD.t + 4} fontSize="9" textAnchor="end" fill="#94a3b8">
          +{Math.round(yMag)}
        </text>
        <text x={PAD.l - 6} y={H - PAD.b} fontSize="9" textAnchor="end" fill="#94a3b8">
          −{Math.round(yMag)}
        </text>
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 8} fontSize="9.5" textAnchor="middle" fill="#64748b">
          Score this year →
        </text>
      </svg>
      <p className="mt-1 text-[11px] text-muted">
        Bottom-left is the corner that matters: below the network average <em>and</em> falling.
      </p>
    </div>
  )
}

// ── The board-report grouped bars ───────────────────────────────────────────

/**
 * THE SIGNATURE DIOCESAN VIEW — the one a board already recognises from the
 * printed reports: every school ranked left to right, both years side by side,
 * with the national and network lines drawn across.
 *
 * The ranked chart elsewhere on this page shows the CURRENT year only, and the
 * comparison table carries both years as numerals. Neither answers the question
 * a board asks out loud — "which schools moved, and by how much, relative to
 * everyone else" — because that is a question about the GAP between two bars,
 * and a gap has to be seen rather than subtracted.
 */
function BoardReportBars({ rows, national, peerAvg, range, focusId, scoreType, reduce }) {
  const data = (rows ?? []).filter((r) => r.current !== null && r.current !== undefined)
  if (data.length === 0) return <p className="text-[12.5px] text-muted">No results to rank for this selection.</p>

  // WIDTH GROWS WITH THE NETWORK. A fixed 680px canvas divided by school count
  // is fine for three and unreadable for fourteen: the band collapses, the bars
  // touch, and the rotated names below overlap into a grey smear. A diocese is
  // exactly the customer this chart is for, so it gets a MINIMUM band per school
  // and scrolls sideways past that instead of compressing — the reader can still
  // read any single school, which a squeezed chart cannot offer at any width.
  const MIN_BAND = 48
  const H = 300
  const PAD = { l: 34, r: 16, t: 26, b: 62 }
  const W = Math.max(680, PAD.l + PAD.r + data.length * MIN_BAND)
  const uid = 'board'
  const { lo, hi } = fitScale(
    [...data.flatMap((r) => [r.current, r.prior]), national, peerAvg],
    range,
    { pad: 0.16 },
  )
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b
  const band = plotW / data.length
  const barW = Math.min(26, (band - 10) / 2)
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * plotH
  const floor = PAD.t + plotH

  return (
    <div>
      <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block"
        style={{ width: '100%', minWidth: W > 680 ? `${W}px` : undefined }}
        role="img"
        aria-label="Every school, both years, ranked"
      >
        <ChartDefs id={uid} />

        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + t * plotH} y2={PAD.t + t * plotH} stroke={INK.grid} strokeWidth="1" />
        ))}

        {data.map((r, i) => {
          const cx = PAD.l + band * i + band / 2
          const isFocus = r.schoolId === focusId
          const gap = 4
          return (
            <g key={r.schoolId ?? r.schoolName ?? i}>
              {/* Prior year — quiet, behind. */}
              {r.prior !== null && r.prior !== undefined ? (
                <motion.rect
                  x={cx - barW - gap / 2}
                  width={barW}
                  rx="3"
                  fill="rgba(148,163,184,0.55)"
                  initial={reduce ? { y: y(r.prior), height: floor - y(r.prior) } : { y: floor, height: 0 }}
                  animate={{ y: y(r.prior), height: Math.max(0, floor - y(r.prior)) }}
                  transition={{ duration: 0.7, ease: EASE, delay: reduce ? 0 : 0.05 + i * 0.06 }}
                />
              ) : null}

              {/* This year — the one the eye should land on. */}
              <motion.rect
                x={cx + gap / 2}
                width={barW}
                rx="3"
                fill={isFocus ? `url(#${uid}-focus)` : 'rgba(31,61,114,0.5)'}
                filter={isFocus ? `url(#${uid}-glow)` : undefined}
                initial={reduce ? { y: y(r.current), height: floor - y(r.current) } : { y: floor, height: 0 }}
                animate={{ y: y(r.current), height: Math.max(0, floor - y(r.current)) }}
                transition={{ duration: 0.7, ease: EASE, delay: reduce ? 0 : 0.12 + i * 0.06 }}
              />

              <motion.text
                x={cx + gap / 2 + barW / 2}
                y={y(r.current) - 6}
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
                fill={isFocus ? '#0f766e' : '#334155'}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduce ? 0 : 0.5 + i * 0.06, duration: 0.4 }}
              >
                {fmt(r.current, scoreType === 'scale' ? 1 : 0)}
              </motion.text>

              <text
                x={cx}
                y={floor + 16}
                fontSize="9"
                textAnchor="middle"
                fill={isFocus ? '#0f766e' : '#64748b'}
                fontWeight={isFocus ? '700' : '400'}
                transform={data.length > 6 ? `rotate(-32 ${cx} ${floor + 16})` : undefined}
              >
                {shortName(r.schoolName, 14)}
              </text>
              {r.change !== null && r.change !== undefined ? (
                <text
                  x={cx}
                  y={floor + 30}
                  fontSize="9"
                  fontWeight="700"
                  textAnchor="middle"
                  fill={r.change >= 0 ? INK.ahead : INK.behind}
                  opacity={data.length > 6 ? 0 : 1}
                >
                  {signed(r.change, 0)}
                </text>
              ) : null}
            </g>
          )
        })}

        {[
          national !== null && national !== undefined ? { v: national, c: INK.national, t: `National ${fmt(national, 0)}` } : null,
          peerAvg !== null && peerAvg !== undefined ? { v: peerAvg, c: INK.network, t: `Network ${fmt(peerAvg, 0)}` } : null,
        ]
          .filter(Boolean)
          .filter((l) => l.v >= lo && l.v <= hi)
          .map((l) => (
            <g key={l.t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(l.v)} y2={y(l.v)} stroke={l.c} strokeWidth="1.6" strokeDasharray="6 4" opacity="0.9" />
              <rect x={PAD.l + 4} y={y(l.v) - 13} width={l.t.length * 5.4 + 10} height="14" rx="7" fill={l.c} opacity="0.12" />
              <text x={PAD.l + 9} y={y(l.v) - 3} fontSize="8.5" fontWeight="700" fill={l.c}>
                {l.t}
              </text>
            </g>
          ))}

        <text x={PAD.l - 6} y={PAD.t + 5} fontSize="9" textAnchor="end" fill="#94a3b8">{Math.round(hi)}</text>
        <text x={PAD.l - 6} y={floor} fontSize="9" textAnchor="end" fill="#94a3b8">{Math.round(lo)}</text>
      </svg>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: 'rgba(148,163,184,0.55)' }} /> Last year
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: HUE }} /> This year
        </span>
      </div>
    </div>
  )
}

// ── Trends & movement, curated ──────────────────────────────────────────────

/**
 * The list of every school's movement is data; THIS is the read.
 *
 * A board meeting does not open with twenty-nine rows — it opens with "who
 * improved most, who slipped, and who is below the national line", and those
 * three answers were buried in a list the reader had to scan and rank
 * themselves. Surfacing them costs nothing: the numbers are already here.
 */
function MovementHighlights({ movements, national }) {
  const rows = (movements ?? []).filter((m) => m.change !== null && m.change !== undefined)
  if (rows.length === 0) return null

  const byChange = [...rows].sort((a, b) => (b.change ?? 0) - (a.change ?? 0))
  const best = byChange[0]
  const worst = byChange[byChange.length - 1]
  const below = rows.filter((m) => national !== null && national !== undefined && (m.current ?? 0) < national)

  const cards = [
    best && best.change > 0
      ? { k: 'Most improved', name: best.schoolName, v: signed(best.change, 0), sub: `${fmt(best.prior, 0)} → ${fmt(best.current, 0)}`, tone: INK.ahead }
      : null,
    worst && worst.change < 0
      ? { k: 'Steepest decline', name: worst.schoolName, v: signed(worst.change, 0), sub: `${fmt(worst.prior, 0)} → ${fmt(worst.current, 0)}`, tone: INK.behind }
      : null,
    national !== null && national !== undefined
      ? {
          k: 'Below the national line',
          name: below.length === 0 ? 'None — every school is above it' : below.map((m) => shortName(m.schoolName, 18)).join(', '),
          v: `${below.length}`,
          sub: `of ${rows.length} schools`,
          tone: below.length === 0 ? INK.ahead : INK.national,
        }
      : null,
  ].filter(Boolean)

  return (
    <StatStrip cols={cards.length} className="stats-wrap !grid-cols-1 sm:!grid-cols-3">
      {cards.map((c) => (
        <Stat
          key={c.k}
          label={c.k}
          value={c.v}
          status={c.tone === INK.ahead ? 'good' : c.tone === INK.behind ? 'risk' : 'watch'}
          note={c.sub}
        >
          <p className="mt-1 text-small font-semibold leading-snug text-ink">{c.name}</p>
        </Stat>
      ))}
    </StatStrip>
  )
}

// ── Participation against score ──────────────────────────────────────────────
//
// The honesty check on every other chart on this page. A school testing half its
// class can post a flattering average for reasons that have nothing to do with
// teaching, so the two numbers belong on one pair of axes rather than in two
// cards that never meet.
/**
 * IS THE COMPARISON FAIR? — answered per school, not plotted.
 *
 * This was a scatter, and a scatter was the wrong instrument. Participation
 * clusters near 100% for almost every school, so the plot spent seventy percent
 * of its canvas on a tinted "read with care" band that was always EMPTY, with
 * three dots crushed against the right edge. The reader saw a big coloured box
 * containing nothing and had to work out that the emptiness was the good news.
 *
 * The question is per school and nearly binary, so the answer is a row per
 * school: how much of the eligible cohort actually sat the exam, against the
 * threshold where a comparison stops being about teaching, with the verdict
 * stated in words. It reads at a glance at three schools and still reads at
 * thirty.
 */
function ParticipationFairness({ rows }) {
  const data = (rows ?? []).filter(
    (r) => r.participationRate !== null && r.participationRate !== undefined && r.current !== null,
  )
  if (data.length === 0) {
    return (
      <p className="text-[12.5px] text-muted">
        No school on file reports how many students were eligible, so fairness cannot be judged yet — a summary file
        with an eligible or enrolled column fills this in.
      </p>
    )
  }

  const THRESHOLD = 0.7
  const sorted = [...data].sort((a, b) => (a.participationRate ?? 0) - (b.participationRate ?? 0))
  const shaky = sorted.filter((r) => (r.participationRate ?? 0) < THRESHOLD).length

  return (
    <div className="space-y-3">
      <div
        className="rounded-xl px-3.5 py-2.5 text-[12px]"
        style={{
          background: shaky === 0 ? 'rgba(5,150,105,0.08)' : 'rgba(245,158,11,0.1)',
          color: shaky === 0 ? '#047857' : '#B45309',
        }}
      >
        <b>{shaky === 0 ? 'Every comparison on this page is fair.' : `${shaky} school${shaky === 1 ? '' : 's'} to read with care.`}</b>{' '}
        {shaky === 0
          ? 'Every school tested enough of its eligible students that the scores describe teaching rather than who turned up.'
          : 'Below about seventy percent, a score says more about which students sat the exam than about the school.'}
      </div>

      <ColumnChart
        rows={sorted.map((r, i) => {
          const p = Math.min(100, Math.round((r.participationRate ?? 0) * 100))
          const ok = (r.participationRate ?? 0) >= THRESHOLD
          return {
            id: r.schoolId ?? r.schoolName ?? i,
            label: r.schoolName ?? 'School',
            value: p,
            // Amber is a STATUS, not a series: it ships with the verdict in
            // the tooltip and the count in the banner, never colour alone.
            color: ok ? HUE : '#F59E0B',
            formatted: `${p}%`,
            meta: [
              { label: 'Score', value: fmt(r.current, 0) },
              { label: 'Verdict', value: ok ? 'comparison fair' : 'read with care' },
            ],
          }
        })}
        domain={{ lo: 0, hi: 100 }}
        refs={[{ value: THRESHOLD * 100, label: '70% · read with care below', color: '#B45309' }]}
        tickFormatter={(v) => `${v}%`}
        showValues="selective"
        minBand={30}
        rotateChars={18}
        height={220}
        ariaLabel="Share of eligible students tested, by school"
      />
      <p className="text-[11px] text-muted">
        Each column is students tested ÷ students eligible; the dashed line is seventy percent. Hover or tab to a
        school for the score that participation produced.
      </p>
    </div>
  )
}

// ── What the score cost ──────────────────────────────────────────────────────

/**
 * THE CHAIN, NOT FOUR BOXES.
 *
 * These four numbers are the only thing on this page a standalone assessment
 * product cannot draw, because they need the ledger sitting beside the roster —
 * and they were rendered as four identical white cards that stated them without
 * ever connecting them. The relationship IS the insight: this many children,
 * taught at this ratio, for this much each, produced this score.
 *
 * So it is a flow on the ink ground the module banner already uses, with the
 * outcome as the terminal node. The dark panel is deliberate: it is the one
 * place on a page of white cards where KYRO says something no competitor can,
 * and it should not look like everything around it.
 */
function CostChain({ rows, scoreType }) {
  const focus = (rows ?? []).find((r) => r.isFocus)
  const peers = (rows ?? []).filter((r) => !r.isFocus && r.score !== null)
  if (!focus) {
    return <p className="text-small text-ink2">Load a year of results to see outcomes beside the money that produced them.</p>
  }

  const money = (v) => (v === null || v === undefined ? '—' : `$${Math.round(v).toLocaleString()}`)

  return (
    <div>
      {/* Three inputs, then the outcome they produced — one strip, read left to
          right; the arrow is in the label ("→ Produced"), not a dark stage. */}
      <StatStrip cols={4} className="stats-wrap grid-cols-2 sm:grid-cols-4">
        <Stat label="Enrolment" value={focus.enrollment ?? '—'} note="children on the roster" />
        <Stat label="Per teacher" value={fmt(focus.studentTeacherRatio)} note="students each" />
        <Stat label="Cost per pupil" value={money(focus.costPerPupil)} note="expenses ÷ enrolment" />
        <Stat
          label="→ Produced"
          value={fmt(focus.score, scoreType === 'scale' ? 1 : 0)}
          status="hue"
          note={scoreType === 'percentile' ? 'national percentile' : 'scale score'}
        />
      </StatStrip>

      <p className="sec-note">
        {peers.length > 0
          ? `${peers.length} peer school${peers.length === 1 ? '' : 's'} scored ${peers.map((p) => fmt(p.score, 0)).join(', ')}. Their staffing and spending stay with them — this reads only the ledger of the school you are signed in to.`
          : 'Outcomes beside the money and the class size that produced them — the read a standalone score dashboard cannot do, because it has no ledger.'}
      </p>
    </div>
  )
}

const SUBGROUP_LABELS = [
  { key: 'isp', label: 'Learning support', hint: 'ISP / IEP on the roster' },
  { key: 'plan504', label: '504 plan', hint: 'Formal accommodation' },
  { key: 'ell', label: 'English learners', hint: 'ELL flag on the roster' },
]

function SubgroupBars({ groups, range, reduce }) {
  const buckets = SUBGROUP_LABELS.map((d) => ({ ...d, bucket: groups?.[d.key] })).filter((d) => d.bucket)

  if (!groups || buckets.length === 0) {
    return (
      <p className="text-[12.5px] text-muted">
        Nothing to break out yet. These groups come from the support flags already on your roster, and only appear
        once at least five students in a group have a score.
      </p>
    )
  }

  const values = buckets.flatMap((d) => [d.bucket.withFlag?.value, d.bucket.without?.value])
  const { lo, hi } = fitScale(values, range, { pad: 0.3 })
  const pct = (v) => ((v - lo) / (hi - lo || 1)) * 100

  const shown = buckets.filter((d) => !d.bucket.withFlag?.suppressed)

  return (
    <div className="space-y-3">
      {/* A legend, because a dumbbell has two ends and the reader is owed a
          key before the first row rather than a caption after the last. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10.5px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: HUE }} />
          In the group
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-slate-400 bg-white" />
          Everyone else
        </span>
      </div>

      {buckets.map((d, i) => {
        const b = d.bucket
        const suppressed = b.withFlag?.suppressed || b.without?.suppressed
        const a = b.withFlag?.value
        const z = b.without?.value
        const gap = b.gap
        const behind = (gap ?? 0) < 0
        const tone = behind ? INK.behind : INK.ahead

        return (
          <motion.div
            key={d.key}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE, delay: reduce ? 0 : i * 0.08 }}
            className="rounded-xl px-3 py-2.5"
            style={{ background: 'rgba(16,28,61,0.025)', boxShadow: 'inset 0 0 0 1px rgba(16,28,61,0.06)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-[124px] shrink-0">
                <p className="text-[12px] font-semibold leading-tight text-navy">{d.label}</p>
                <p className="text-[8.5px] uppercase tracking-[0.1em] text-muted">{d.hint}</p>
              </div>

              {suppressed ? (
                <div className="flex flex-1 items-center gap-2">
                  <div className="h-[3px] flex-1 rounded-full bg-navy/[0.07]" />
                  <span className="text-[10px] text-muted">Fewer than 5 on one side — not shown</span>
                </div>
              ) : (
                <>
                  {/* ── The dumbbell ── */}
                  <div className="relative h-8 flex-1">
                    <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-navy/[0.08]" />
                    {/* The span between the two groups IS the finding. */}
                    <motion.span
                      aria-hidden="true"
                      className="absolute top-1/2 h-[5px] -translate-y-1/2 rounded-full"
                      style={{
                        left: `${Math.min(pct(a), pct(z))}%`,
                        background: `linear-gradient(90deg, ${tone}55, ${tone})`,
                        boxShadow: `0 0 12px -2px ${tone}`,
                      }}
                      initial={reduce ? { width: `${Math.abs(pct(a) - pct(z))}%` } : { width: 0 }}
                      animate={{ width: `${Math.abs(pct(a) - pct(z))}%` }}
                      transition={{ duration: 0.6, ease: EASE, delay: reduce ? 0 : 0.15 + i * 0.08 }}
                    />
                    {/* Everyone else: hollow, quiet. */}
                    <span
                      className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-400 bg-white"
                      style={{ left: `${pct(z)}%` }}
                      title={`Everyone else: ${fmt(z)} (${b.without.count} students)`}
                    />
                    {/* The group in question: filled, lit. */}
                    <motion.span
                      className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                      style={{ left: `${pct(a)}%`, background: HUE, boxShadow: `0 0 14px -2px ${HUE}` }}
                      initial={reduce ? false : { scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.4, ease: EASE, delay: reduce ? 0 : 0.3 + i * 0.08 }}
                      title={`In the group: ${fmt(a)} (${b.withFlag.count} students)`}
                    />
                  </div>

                  <div className="w-[86px] shrink-0 text-right">
                    <p className="font-serif text-[17px] font-semibold leading-none tabular-nums" style={{ color: tone }}>
                      {signed(gap)}
                    </p>
                    <p className="text-[8.5px] uppercase tracking-[0.1em] text-muted">
                      {b.withFlag.count} vs {b.without.count}
                    </p>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )
      })}

      <p className="text-[11px] text-muted">
        {shown.length > 0
          ? 'Each row compares students carrying that flag with everyone else who sat the same test. '
          : ''}
        A group of fewer than five students is never shown — and neither is the group it would leave behind, because
        the rest of the school minus one group is that group.
        {groups.totalMatched ? ` Based on ${groups.totalMatched} scored students matched to the roster.` : ''}
      </p>
    </div>
  )
}

function ObjectiveList({ items, tone }) {
  const t = STANDING_TONE[tone]
  if (items.length === 0) return <p className="text-[12.5px] text-muted">No objective-level data in this file.</p>
  return (
    <div className="space-y-1.5">
      {items.map((o) => (
        <div key={`${o.subject}-${o.objectiveLabel}-${o.grade}`} className="flex items-center gap-2.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full`} style={{ background: t.dot }} />
          <span className="flex-1 truncate text-[12.5px] text-navy" title={o.objectiveLabel}>
            {o.objectiveLabel}
          </span>
          <span className="text-[10px] text-muted">
            {label(o.subject)} · gr {o.grade}
          </span>
          <span className={`w-9 text-right text-[12px] font-bold tabular-nums ${t.text}`}>{fmt(o.opi, 0)}</span>
          <span className={`w-10 text-right text-[10px] ${t.text}`}>{signed(o.variance, 0)}</span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// E3 — ONE COHORT'S SIZE, RUNG BY RUNG, ON THE SCALE THE WHOLE GRID SHARES.
//
// ── IT IS CALLED "COHORT SIZE PROGRESSION". IT IS NOT CALLED RETENTION. ──────
// A class of 118 in grade 9 that stands at 112 in grade 10 has NOT kept 95% of
// those children. The RUNG holds 95% as many bodies. Some left, some arrived,
// and this data cannot tell them apart: `Student.grade` is overwritten in place
// on every re-import, so last year's grade for a named child is simply gone.
// Calling this retention would be a claim about individuals made from a chart
// that only ever counted crowds — so the word appears nowhere in this view, and
// the explainer says why out loud.
//
// ── THE SCALE ARRIVES AS A PROP AND IS NEVER RECOMPUTED HERE ─────────────────
// `scale` and `ticks` are computed ONCE by EnrollmentCohortSize over every
// cohort, and nothing in this file re-fits them. Small multiples fitted panel by
// panel look identical while describing different-sized classes, which is
// precisely the misread the format exists to prevent. The floor is ZERO — these
// are headcounts, and a truncated axis turns four students into a cliff.
//
// ── ONE PLOT, TWO SIZES ─────────────────────────────────────────────────────
// A panel opens full size (click, or Enter). The enlarged view is not a second
// chart: both render the same `CohortPlot` with a different viewBox and type
// scale, and the enlarged one is handed the SAME domain — a re-fit there would
// give the reader a steeper climb than the panel they clicked, about the same
// children.
//
// NOTHING INTERPOLATES. A masked or missing year keeps its slot, the path
// breaks, a dashed connector spans the gap so the eye is not left to invent one,
// and the honest marker goes on the GRADE AXIS — never a point in the plot, and
// never a zero.
//
// PREMIUM UI P4 (a2): the net-change chip is the ledger Pill (ink figure, a 2px
// mark: grew → good, shrank → risk, held/unknown → neutral); the small multiple
// is a hairline figure at the panel radius (no glow); the enlarged view is the
// one float dialog with its rungs in a DataTable.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Maximize2, TrendingDown, TrendingUp, X } from 'lucide-react'
import { segmentsOf, useMeasuredWidth } from '../academics/cohortKit.js'
import { useTooltip } from '../analytics/charts/Tooltip.jsx'
import DataTable from '../ui/surface/DataTable.jsx'
import Pill from '../ui/surface/Pill.jsx'
import '../../styles/pending/a2-carry.css'
import {
  EASE,
  ENROLL_HUE,
  cellState,
  cellTitle,
  cellToken,
  fmtCount,
  gradeLabelOf,
  schoolYearLabel,
  signedCount,
} from './enrollmentAnalyticsKit.jsx'

const SMALL = { VB: { w: 200, h: 152 }, PAD: { l: 10, r: 10, t: 32, b: 30 } }
const LARGE = { VB: { w: 680, h: 400 }, PAD: { l: 62, r: 30, t: 26, b: 62 } }

/** Gradient ids are namespaced by the COHORT, never by index: a re-sort would
 *  otherwise hand panel two's ink to panel one and nothing would look wrong. */
const defsId = (key) => `enrcoh-${String(key).replace(/[^a-zA-Z0-9_-]/g, '-')}`

/**
 * The legs, in the shape the drawing code wants.
 *
 * `value` is non-null ONLY for a real figure — a masked rung is null here on
 * purpose, so `segmentsOf` breaks the line across it exactly as it does across a
 * year nobody filed. The distinction survives in `state`, which the axis marker
 * and the table read to say which of the two happened.
 */
export function pointsOf(cohort) {
  return (cohort?.legs ?? []).map((l) => {
    const state = cellState(l.count)
    return {
      grade: l.grade,
      schoolYear: l.schoolYear,
      value: state === 'value' ? l.count.value : null,
      state,
      count: l.count,
    }
  })
}

// ── The net-change chip ──────────────────────────────────────────────────────

/**
 * DIRECTION, NOT SIGN — the highest-probability regression in this whole view.
 *
 * The tone and the icon key off `cohort.direction`, which the SERVER decided
 * against its own materiality floor (three students). `netChange > 0` is NOT the
 * test and must never become it: on that floor a +2 is 'held', and painting it
 * green would be the view inventing a finding the analysis explicitly declined
 * to make. A cohort whose end rung is missing or masked is 'unknown', and there
 * is no number to show at all.
 */
function NetChangeChip({ cohort, moveFloor, reduce, delay = 0, big = false }) {
  const { direction, netChange, startGrade, endGrade } = cohort
  const tone = direction === 'grew' ? 'good' : direction === 'shrank' ? 'risk' : 'neutral'
  const Icon = direction === 'grew' ? TrendingUp : direction === 'shrank' ? TrendingDown : null

  const title =
    direction === 'unknown'
      ? 'One end of this walk is missing or hidden, so there is no end-to-end change to take.'
      : direction === 'held'
        ? `A move of fewer than ${moveFloor} students counts as holding steady rather than as a direction.`
        : `${signedCount(netChange)} students between ${gradeLabelOf(startGrade)} and ${gradeLabelOf(endGrade)}.`

  return (
    <Pill
      variant="status"
      tone={tone}
      // A motion span, so the chip settles in once.
      as={motion.span}
      initial={reduce ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: EASE, delay }}
      title={title}
      className={`max-w-full overflow-hidden tabular-nums ${
        big ? '!h-6 !px-2.5 !text-[12.5px]' : ''
      } ${direction === 'unknown' ? 'text-ink2' : ''}`}
    >
      {Icon ? <Icon size={big ? 13 : 10} strokeWidth={2.4} className="shrink-0 text-ink2" aria-hidden /> : null}
      {direction === 'unknown' ? (
        // SHORT in the grid, full sentence when enlarged. The long form ran off
        // a 200px panel and printed across the one beside it; the `title` above
        // carries the whole explanation either way.
        <span className="min-w-0 truncate font-medium">{big ? '— not comparable end to end' : 'not comparable'}</span>
      ) : direction === 'held' ? (
        <>
          {signedCount(netChange)}
          <span className="truncate font-medium text-ink2"> · steady</span>
        </>
      ) : (
        <>
          {signedCount(netChange)}
          {big ? <span className="font-medium text-ink2"> students</span> : null}
        </>
      )}
    </Pill>
  )
}

// ── The plot ─────────────────────────────────────────────────────────────────

function CohortPlot({
  cohort,
  points,
  scale,
  ticks,
  index = 0,
  reduce = false,
  geom = SMALL,
  s = 1,
  labelFirstLast = false,
  axisNumbers = false,
  inChartHeader = true,
  minCell = 5,
}) {
  const tip = useTooltip()
  const n = points.length
  // PER MOUNTED INSTANCE, not per cohort. The small panel and the enlarged
  // overlay render this same component for the SAME cohort at the same time, so
  // a cohort-keyed id put two `enrcoh-2038-stroke` nodes in one document — and
  // `url(#id)` resolves document-wide to the FIRST match, which meant the
  // overlay's stroke and glow silently reached into the little panel's <svg>
  // for their paint servers. It happened to look right; it was a reference
  // crossing an <svg> boundary, and those break the moment either side moves.
  // useId (the Sparkline idiom) makes every mount self-contained by
  // construction. `defsId` still sanitises it into a valid id.
  const instanceId = useId()
  const uid = defsId(`${cohort.id ?? cohort.label}-${instanceId}`)

  const { VB, PAD } = geom
  const plotBottom = VB.h - PAD.b
  const x = (i) => (n <= 1 ? VB.w / 2 : PAD.l + (i * (VB.w - PAD.l - PAD.r)) / (n - 1))
  // The ONLY place a headcount becomes a pixel — and it reads `scale`, the
  // domain the whole grid shares, at BOTH sizes.
  const y = (v) => PAD.t + (1 - (v - scale.lo) / (scale.hi - scale.lo || 1)) * (plotBottom - PAD.t)
  const step = n > 1 ? (VB.w - PAD.l - PAD.r) / (n - 1) : VB.w

  const runs = segmentsOf(points)
  const delay = reduce ? 0 : 0.1 + index * 0.09

  return (
    <svg
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      preserveAspectRatio="xMidYMid meet"
      className="block w-full"
      role="img"
      aria-label={`${cohort.label}, ${gradeLabelOf(cohort.startGrade)} to ${gradeLabelOf(cohort.endGrade)}, headcount at each rung`}
    >
      <defs>
        {/* USER SPACE, NOT THE BOUNDING BOX. A cohort that held exactly steady
            draws a PERFECTLY FLAT path, whose bounding box has zero height —
            and SVG says an element referencing an objectBoundingBox gradient
            with a degenerate box is NOT RENDERED. The steadiest classes on the
            page therefore lost their line entirely and showed as loose dots,
            which reads as "no data" rather than "no change". Fixing the sweep to
            the plot's own x-range keeps the identical left-to-right hue and
            cannot degenerate. (Made routine by the fixed-length windows: a
            two-rung panel is flat far more often than a five-rung one.) */}
        <linearGradient
          id={`${uid}-stroke`}
          gradientUnits="userSpaceOnUse"
          x1={PAD.l}
          y1="0"
          x2={VB.w - PAD.r}
          y2="0"
        >
          <stop offset="0%" stopColor={ENROLL_HUE} stopOpacity="0.95" />
          <stop offset="100%" stopColor="#38BDF8" stopOpacity="1" />
        </linearGradient>
        {/* USER SPACE for the same reason as the gradient above, and this is the
            half that actually blanked the line: a filter region measured in
            bounding-box units is ZERO-HEIGHT over a perfectly flat path, and an
            element filtered through an empty region is not painted. The region
            is the whole plot, so a steady class glows like a moving one. */}
        <filter
          id={`${uid}-glow`}
          filterUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={VB.w}
          height={VB.h}
        >
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* THE SHARED GRID — same ticks, same y, in every panel on the page and in
          the enlarged view of any of them. The zero line is drawn solid: it is a
          floor, not one gridline of four. */}
      {ticks.map((t) => (
        <g key={t}>
          {/* Classed and value-stamped so "every panel shares one axis" is a
              comparison a test can make on the rendered geometry, rather than a
              property that merely happens to hold today. */}
          <line
            className="enr-coh-grid"
            data-tick={t}
            x1={PAD.l - 4}
            x2={VB.w - PAD.r + 4}
            y1={y(t)}
            y2={y(t)}
            stroke={t === 0 ? 'rgba(16,28,61,0.16)' : 'rgba(16,28,61,0.07)'}
            strokeWidth="1"
          />
          {axisNumbers ? (
            <text
              x={PAD.l - 10}
              y={y(t) + 3.5 * s}
              fontSize={9.5 * s}
              fontWeight="700"
              fill="#94A3B8"
              textAnchor="end"
              className="enr-coh-axis-tick tabular-nums"
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            >
              {t}
            </text>
          ) : null}
        </g>
      ))}

      {inChartHeader ? (
        <>
          <text x={PAD.l - 4} y="14" fontSize="10.5" fontWeight="700" fill="#334155">
            {cohort.label}
          </text>
          <text x={PAD.l - 4} y="25" fontSize="8.5" fill="#94A3B8">
            {gradeLabelOf(cohort.startGrade)} → {gradeLabelOf(cohort.endGrade)}
          </text>
        </>
      ) : null}

      {/* The gaps, first and underneath: a quiet dashed span, so the eye is not
          left to invent a line across a year we do not have. */}
      {runs.slice(0, -1).map((run, i) => {
        const from = run[run.length - 1]
        const to = runs[i + 1][0]
        return (
          <line
            key={`gap-${from}-${to}`}
            x1={x(from)}
            y1={y(points[from].value)}
            x2={x(to)}
            y2={y(points[to].value)}
            stroke="rgba(16,28,61,0.22)"
            strokeWidth={1.2 * s}
            strokeDasharray={`${3 * s} ${3 * s}`}
            strokeLinecap="round"
          />
        )
      })}

      {runs
        .filter((run) => run.length > 1)
        .map((run) => (
          <motion.path
            key={`seg-${run[0]}-${run[run.length - 1]}`}
            d={`M ${run.map((i) => `${x(i)},${y(points[i].value)}`).join(' L ')}`}
            fill="none"
            stroke={`url(#${uid}-stroke)`}
            strokeWidth={2.5 * s}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${uid}-glow)`}
            initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, ease: EASE, delay }}
          />
        ))}

      {points.map((p, i) => {
        if (p.value === null) return null
        const last = i === points.length - 1
        const prev = points[i - 1]?.value
        const next = points[i + 1]?.value
        // A local valley would put the label inside the V the line makes.
        const valley =
          (prev === null || prev === undefined || prev > p.value) &&
          (next === null || next === undefined || next > p.value) &&
          (prev !== null || next !== null)
        // The top strip belongs to the in-chart header and the net-change chip;
        // a point up there printed its label straight through one of them.
        const nearTop = y(p.value) < PAD.t + 14 * s
        const below = valley || nearTop
        const show = !labelFirstLast || i === 0 || last
        return (
          <motion.g
            key={`pt-${i}`}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: EASE, delay: delay + 0.45 }}
          >
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r={(last ? 4.6 : 3.4) * s}
              fill={last ? ENROLL_HUE : '#fff'}
              stroke={ENROLL_HUE}
              strokeWidth={1.8 * s}
            />
            {show ? (
              <text
                x={x(i) + (i === 0 ? 2 : last ? -2 : 0)}
                y={y(p.value) + (below ? 13 : -9) * s}
                fontSize={10 * s}
                fontWeight="700"
                fill="#0369A1"
                textAnchor={i === 0 ? 'start' : last ? 'end' : 'middle'}
                className="tabular-nums"
              >
                {p.value}
              </text>
            ) : null}
          </motion.g>
        )
      })}

      {/* ── The grade axis, where the honest markers live ── */}
      <line
        x1={PAD.l - 4}
        x2={VB.w - PAD.r + 4}
        y1={plotBottom}
        y2={plotBottom}
        stroke="rgba(16,28,61,0.14)"
        strokeWidth="1"
      />
      {points.map((p, i) => {
        const reported = p.value !== null
        const ends = i === 0 || i === n - 1
        const showYear = axisNumbers || ends
        const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
        return (
          <g key={`ax-${i}`}>
            {!reported ? (
              <>
                <title>{cellTitle(p.count, { minCell })}</title>
                {/* A slashed hairline: the slot exists, the number does not. */}
                <line
                  x1={x(i)}
                  y1={plotBottom - 5 * s}
                  x2={x(i)}
                  y2={plotBottom + 3 * s}
                  stroke="rgba(16,28,61,0.3)"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
              </>
            ) : null}
            <text
              x={x(i)}
              y={plotBottom + 11 * s}
              fontSize={8.5 * s}
              fontWeight="700"
              fill={reported ? '#475569' : '#94A3B8'}
              textAnchor={anchor}
            >
              {p.grade}
            </text>
            {!reported ? (
              <text
                x={x(i)}
                y={plotBottom + 20 * s}
                fontSize={8 * s}
                fill="#94A3B8"
                textAnchor={anchor}
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              >
                {cellToken(p.count)}
              </text>
            ) : showYear ? (
              <text x={x(i)} y={plotBottom + 20 * s} fontSize={7.5 * s} fill="#CBD5E1" textAnchor={anchor}>
                {schoolYearLabel(p.schoolYear)}
              </text>
            ) : null}
          </g>
        )
      })}

      {/* Hit areas — the one glass surface on the page is the tooltip. */}
      {points.map((p, i) => (
        <rect
          key={`hit-${i}`}
          x={x(i) - step / 2}
          y={PAD.t - 6}
          width={step}
          height={plotBottom - PAD.t + 12}
          fill="transparent"
          onMouseMove={(e) =>
            tip.show(
              {
                title: `${gradeLabelOf(p.grade)} · ${schoolYearLabel(p.schoolYear)}`,
                rows: [
                  {
                    color: ENROLL_HUE,
                    label: 'Students',
                    value: p.value === null ? cellTitle(p.count, { minCell }) : fmtCount(p.value),
                  },
                  { color: '#CBD5E1', label: 'Cohort', value: cohort.label },
                ],
              },
              e.clientX,
              e.clientY,
            )
          }
          onMouseLeave={() => tip.hide()}
        />
      ))}
    </svg>
  )
}

// ── The enlarged view ────────────────────────────────────────────────────────

function CohortExpanded({ cohort, points, scale, ticks, moveFloor, minCell, reduce, onClose, returnFocusTo }) {
  const dialogRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const returnTo = returnFocusTo?.current ?? null
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      returnTo?.focus?.()
    }
  }, [onClose, returnFocusTo])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
      <motion.div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0 : 0.2, ease: EASE }}
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-enr-coh-expanded="1"
        // The domain, stated on the element, so "the enlarged view did not
        // re-fit its axis" is a string comparison rather than a squint.
        data-enr-ticks={ticks.join(',')}
        data-enr-scale={`${scale.lo},${scale.hi}`}
        className="a2-dialog relative max-h-[85vh] w-full max-w-3xl overflow-y-auto outline-none"
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: reduce ? 0.12 : 0.28, ease: EASE }}
      >
        <div className="flex flex-wrap items-start gap-3 border-b border-hair px-5 py-4">
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="font-serif text-[22px] font-medium leading-7 text-ink">
              {cohort.label}
            </h3>
            <p className="mt-0.5 text-[12px] text-ink2">
              {gradeLabelOf(cohort.startGrade)} → {gradeLabelOf(cohort.endGrade)} · {schoolYearLabel(cohort.startYear)}{' '}
              to {schoolYearLabel(cohort.endYear)}
            </p>
          </div>
          <NetChangeChip cohort={cohort} moveFloor={moveFloor} reduce={reduce} big />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the enlarged cohort"
            className="a2-icon-btn"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 pt-3">
          <CohortPlot
            cohort={cohort}
            points={points}
            // STRAIGHT THROUGH, NOT RE-FITTED — see the file header.
            scale={scale}
            ticks={ticks}
            reduce={reduce}
            geom={LARGE}
            s={1.35}
            labelFirstLast={false}
            axisNumbers
            inChartHeader={false}
            minCell={minCell}
            index={0}
          />
        </div>

        <div className="px-5 pb-5 pt-2">
          <DataTable
            caption={`Every rung of ${cohort.label}, with the headcount recorded that school year`}
            rows={points}
            rowKey={(p, i) => `row-${p.schoolYear}-${p.grade}-${i}`}
            columns={[
              {
                key: 'grade',
                header: 'Grade',
                render: (p) => <span className="font-semibold text-ink">{gradeLabelOf(p.grade)}</span>,
              },
              {
                key: 'year',
                header: 'School year',
                className: 'tabular-nums text-ink2',
                render: (p) => schoolYearLabel(p.schoolYear),
              },
              {
                key: 'students',
                header: 'Students',
                num: true,
                // A withheld or missing number stays withheld or missing —
                // never a dash a reader could take for a zero.
                render: (p) => (
                  <span className={p.value !== null ? 'font-semibold text-ink' : 'text-ink2'}>
                    {cellToken(p.count)}
                  </span>
                ),
              },
              {
                key: 'note',
                header: 'Note',
                className: 'text-ink2',
                render: (p) => (p.value !== null ? '' : cellTitle(p.count, { minCell })),
              },
            ]}
          />
          <p className="sec-note">
            Drawn on the same headcount scale as the grid behind this — {scale.lo} to {scale.hi} students — so the shape
            here is the shape there. This follows the SIZE of a class as it moves up the grades; it does not follow the
            same children, because transfers in and out are invisible to it.
          </p>
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

// ── The panel ────────────────────────────────────────────────────────────────

export default function EnrollmentCohortPanel({
  cohort,
  scale,
  ticks,
  moveFloor = 3,
  minCell = 5,
  index = 0,
  reduce = false,
}) {
  const tip = useTooltip()
  const [ref] = useMeasuredWidth()
  const [expanded, setExpanded] = useState(false)
  const points = pointsOf(cohort)

  // A four-digit run of labels in a 184px panel is unreadable ink, so a small
  // panel labels only the ends. Not a constraint of the data — the enlarged view
  // labels everything.
  const labelFirstLast = points.length > 3

  const open = useCallback(() => {
    tip.hide()
    setExpanded(true)
  }, [tip])

  return (
    <>
      <motion.figure
        ref={ref}
        initial={reduce ? false : { opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-30px' }}
        transition={{ duration: 0.4, ease: EASE, delay: reduce ? 0 : 0.05 + index * 0.06 }}
        // ACTIVATABLE. The whole panel is the target — a small multiple has no
        // room for a button big enough to hit, and a reader who wants a closer
        // look points at the chart, not at a corner of it.
        role="button"
        tabIndex={0}
        aria-label={`Enlarge ${cohort.label}, ${gradeLabelOf(cohort.startGrade)} to ${gradeLabelOf(cohort.endGrade)}`}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault()
            open()
          }
        }}
        // The domain, stamped on every panel, so "all panels share one scale" is
        // a checkable assertion and not merely an intention.
        data-enr-cohort={cohort.id}
        data-enr-ticks={ticks.join(',')}
        data-enr-scale={`${scale.lo},${scale.hi}`}
        // The LADDER LENGTH, stamped for the same reason the domain is: every
        // panel in the grid must carry the same number of rungs, and a rung with
        // no reading keeps its slot — so this counts SLOTS, not drawn dots, and
        // a panel that quietly shortened itself would show up here.
        data-enr-legs={points.length}
        className="enr-coh-panel group relative isolate min-w-0 cursor-zoom-in overflow-hidden rounded-[var(--r-panel)] border border-hair bg-white transition-colors duration-200 hover:border-hair/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/50 focus-visible:ring-offset-2"
      >
        <figcaption className="sr-only">
          {cohort.label}, {gradeLabelOf(cohort.startGrade)} to {gradeLabelOf(cohort.endGrade)}
        </figcaption>

        <div className="absolute right-2 top-2 z-10 max-w-[70%]">
          <NetChangeChip
            cohort={cohort}
            moveFloor={moveFloor}
            reduce={reduce}
            delay={reduce ? 0 : 0.1 + index * 0.09 + 0.6}
          />
        </div>

        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1.5 right-1.5 z-10 inline-flex items-center gap-1 rounded-[var(--r-ctl)] border border-hair bg-white px-1.5 py-1 text-[10px] font-bold text-ink2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <Maximize2 size={11} strokeWidth={2.6} />
        </span>

        <CohortPlot
          cohort={cohort}
          points={points}
          scale={scale}
          ticks={ticks}
          index={index}
          reduce={reduce}
          geom={SMALL}
          s={1}
          labelFirstLast={labelFirstLast}
          minCell={minCell}
        />
      </motion.figure>

      {expanded ? (
        <CohortExpanded
          cohort={cohort}
          points={points}
          scale={scale}
          ticks={ticks}
          moveFloor={moveFloor}
          minCell={minCell}
          reduce={reduce}
          onClose={() => setExpanded(false)}
          returnFocusTo={ref}
        />
      ) : null}
    </>
  )
}

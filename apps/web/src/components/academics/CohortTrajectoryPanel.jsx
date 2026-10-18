// ─────────────────────────────────────────────────────────────────────────────
// CohortTrajectoryPanel — one small multiple: one cohort, followed grade by
// grade, on the SCALE THE WHOLE GRID SHARES.
//
// WHY THIS IS NOT `analytics/charts/LineChart.jsx`. That component forces
// `min = Math.min(0, …)` (LineChart.jsx:45-48), which puts a national
// percentile on an axis running 0–99 and an SAT total on one running 0–1600 —
// four-fifths empty in both cases. It also fits its own domain per instance,
// which is the one thing a grid of small multiples must never do, and it has no
// way to BREAK a line, which is the one thing a suppressed year requires. So
// the trajectory is drawn here, on chartKit's shared vocabulary, in about a
// hundred lines.
//
// THE SCALE ARRIVES AS A PROP AND IS NEVER RECOMPUTED. `scale` and `ticks` are
// computed once by CohortLongitudinal over every cohort (and every peer, when
// peers are on). Nothing in this file calls fitScale. Four independently-fitted
// panels look identical while describing different levels, which is precisely
// the misread the small-multiple format exists to prevent.
//
// NOTHING HERE INTERPOLATES. A suppressed or missing year keeps its slot, the
// path breaks, a dashed connector spans the gap so the eye is not left to
// invent one, and the honest marker goes on the GRADE AXIS — never a point in
// the plot, and never a zero.
//
// ── ONE PLOT, TWO SIZES ──────────────────────────────────────────────────────
// A panel can be opened FULL SIZE (click it, or Enter on it). The enlarged view
// is not a second chart: both sizes render the same `CohortPlot`, handed a
// different viewBox and a type scale. Copying the drawing code for the big one
// is the standing failure mode of this codebase — the copy fixes a leg state or
// a label rule in one place and the two views start telling different stories
// about the same children.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Maximize2, TrendingDown, TrendingUp, X } from 'lucide-react'
import { ChartDefs, INK } from './chartKit.jsx'
import { Pill } from '../ui/surface/index.js'
import { useTooltip } from '../analytics/charts/Tooltip.jsx'
import {
  COH_EASE,
  COH_HUE,
  fmtScore,
  legTitle,
  legToken,
  printedChange,
  segmentsOf,
  signed,
  unavailableSentence,
  useMeasuredWidth,
} from './cohortKit.js'

/** The small multiple, and the enlarged one. Only the BOX changes — never the
 *  domain, which arrives as a prop in both. */
const SMALL = { VB: { w: 200, h: 148 }, PAD: { l: 10, r: 10, t: 30, b: 26 } }
const LARGE = { VB: { w: 680, h: 400 }, PAD: { l: 58, r: 30, t: 26, b: 58 } }

/** Every gradient id is namespaced by the COHORT, never by the index: a re-sort
 *  would otherwise hand panel 2's ink to panel 1 and nothing would look wrong. */
const defsId = (key) => `coh-${String(key).replace(/[^a-zA-Z0-9_-]/g, '-')}`

const gradeName = (g) => (g === 'K' ? 'Kindergarten' : `Grade ${g}`)

// ── The net-change chip ──────────────────────────────────────────────────────

/**
 * DIRECTION, NOT SIGN.
 *
 * The tone and the icon key off `cohort.direction`, which the server decided
 * against the family's material gap. `netChange > 0` is NOT the test and must
 * never become it: on a five-point gap a +2 is 'held', and this chip says so.
 */
function NetChangeChip({ focus, unit, gap, delay, reduce, big = false }) {
  const { direction, netChangeUnavailable, startGrade, endGrade } = focus
  // Printed from the printed endpoints, so "56 → 62" never sits beside "+7".
  const legs = focus.legs ?? []
  const netChange = printedChange(focus.netChange, legs[0]?.value, legs[legs.length - 1]?.value, unit.decimals)
  const tone =
    direction === 'gained' ? 'good' : direction === 'declined' ? 'risk' : direction === 'held' ? 'neutral' : 'neutral'
  const Icon = direction === 'gained' ? TrendingUp : direction === 'declined' ? TrendingDown : null

  const title =
    direction === 'unknown'
      ? (unavailableSentence(netChangeUnavailable, startGrade, endGrade) ?? 'Not comparable end to end.')
      : direction === 'held'
        ? `Smaller than ${gap} ${unit.points} — this counts as neither up nor down.`
        : `${signed(netChange, unit.decimals)} ${unit.points}, ${startGrade} to ${endGrade}.`

  return (
    <motion.span
      initial={reduce ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: COH_EASE, delay }}
      title={title}
      className="inline-flex max-w-full"
    >
      <Pill variant="status" tone={tone} className={big ? '!h-6 !text-[12px]' : ''}>
        {Icon ? <Icon size={big ? 12 : 10} strokeWidth={2.6} aria-hidden="true" /> : null}
        {direction === 'unknown' ? (
          <span className="truncate font-medium">— not comparable end to end</span>
        ) : direction === 'held' ? (
          <>
            {signed(netChange, unit.decimals)}
            <span className="truncate font-medium text-ink2"> · within the noise</span>
          </>
        ) : (
          signed(netChange, unit.decimals)
        )}
      </Pill>
    </motion.span>
  )
}

// ── The trajectory ───────────────────────────────────────────────────────────

/** One school's line, broken wherever the record is. Focus lines are lit; peer
 *  lines are quiet grey and carry no markers, labels or glow.
 *
 *  `s` is the TYPE SCALE, not a data scale: it grows the strokes, markers and
 *  label offsets with the viewBox so the enlarged plot is not the small one's
 *  ink stretched thin. `topGuard` is the y below which a label may sit above
 *  its point — it moves with the padding, since the small panel's top strip
 *  belongs to the in-chart header and the enlarged one's does not. */
function Trajectory({
  legs,
  x,
  y,
  uid,
  isFocus,
  index,
  reduce,
  unit,
  showLabels,
  labelFirstLast,
  topGuard,
  s = 1,
}) {
  const runs = segmentsOf(legs)
  const dValue = (idx) => `${x(idx)},${y(legs[idx].value)}`
  const delay = reduce ? 0 : 0.1 + index * 0.09

  return (
    <g>
      {/* The gaps, first and underneath: a quiet dashed span so the eye is not
          left to invent a line across a year we do not have. */}
      {isFocus
        ? runs.slice(0, -1).map((run, i) => {
            const from = run[run.length - 1]
            const to = runs[i + 1][0]
            return (
              <line
                key={`gap-${from}-${to}`}
                x1={x(from)}
                y1={y(legs[from].value)}
                x2={x(to)}
                y2={y(legs[to].value)}
                stroke="rgba(16,28,61,0.22)"
                strokeWidth={1.2 * s}
                strokeDasharray={`${3 * s} ${3 * s}`}
                strokeLinecap="round"
              />
            )
          })
        : null}

      {runs
        .filter((run) => run.length > 1)
        .map((run) => (
          <motion.path
            key={`seg-${run[0]}-${run[run.length - 1]}`}
            d={`M ${run.map(dValue).join(' L ')}`}
            fill="none"
            stroke={isFocus ? `url(#${uid}-focus)` : INK.peer}
            strokeWidth={(isFocus ? 2.5 : 1.25) * s}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={isFocus ? 1 : 0.45}
            filter={isFocus ? `url(#${uid}-glow)` : undefined}
            initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, ease: COH_EASE, delay }}
          />
        ))}

      {isFocus
        ? legs.map((leg, i) => {
            if (leg.value === null || leg.value === undefined) return null
            const last = i === legs.length - 1
            // A local valley would put the label inside the V the line makes,
            // so it drops below instead.
            const prev = legs[i - 1]?.value
            const next = legs[i + 1]?.value
            const valley =
              (prev === null || prev === undefined || prev > leg.value) &&
              (next === null || next === undefined || next > leg.value) &&
              (prev !== null || next !== null)
            // The top strip of the panel belongs to the header on the left and
            // the net-change chip on the right. A point that lands up there put
            // its label straight through one of them — "+25" printed over "56"
            // — so a high point labels downwards regardless of its shape.
            const nearTop = y(leg.value) < topGuard
            const below = valley || nearTop
            const show = showLabels && (!labelFirstLast || i === 0 || last)
            return (
              <motion.g
                key={`pt-${i}`}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, ease: COH_EASE, delay: delay + 0.45 }}
              >
                <circle
                  cx={x(i)}
                  cy={y(leg.value)}
                  r={(last ? 4.6 : 3.4) * s}
                  fill={last ? COH_HUE : '#fff'}
                  stroke={COH_HUE}
                  strokeWidth={1.8 * s}
                />
                {show ? (
                  <text
                    x={x(i) + (i === 0 ? 2 : last ? -2 : 0)}
                    y={y(leg.value) + (below ? 13 : -9) * s}
                    fontSize={10 * s}
                    fontWeight="700"
                    fill="#0f766e"
                    textAnchor={i === 0 ? 'start' : last ? 'end' : 'middle'}
                    className="tabular-nums"
                  >
                    {fmtScore(leg.value, unit.decimals)}
                  </text>
                ) : null}
              </motion.g>
            )
          })
        : null}
    </g>
  )
}

// ── The plot ─────────────────────────────────────────────────────────────────

/**
 * THE ONE DRAWING, AT WHATEVER SIZE IT IS ASKED FOR.
 *
 * `scale` and `ticks` are props and are never touched here — see the file
 * header. `geom` changes the box; `s` changes the type; `axisNumbers` prints
 * the tick values inside the plot, which the grid does NOT want (its rail
 * states the scale once for the whole page) and the enlarged view does (it has
 * no rail beside it).
 */
function CohortPlot({
  panel,
  scale,
  ticks,
  unit,
  national,
  peersOn,
  asBand: bandMode,
  peerCount,
  schoolName,
  index = 0,
  reduce = false,
  geom = SMALL,
  s = 1,
  labelFirstLast = false,
  axisNumbers = false,
  inChartHeader = true,
}) {
  const tip = useTooltip()
  const { focus, peers = [], summary } = panel
  const legs = focus?.legs ?? []
  const n = legs.length
  const uid = defsId(panel.key ?? panel.cohortId)

  const { VB, PAD } = geom
  const plotBottom = VB.h - PAD.b
  const x = (i) => (n <= 1 ? VB.w / 2 : PAD.l + (i * (VB.w - PAD.l - PAD.r)) / (n - 1))
  // The ONLY place a value becomes a pixel, and it reads `scale` — the domain
  // the whole page shares — in both sizes.
  const y = (v) => PAD.t + (1 - (v - scale.lo) / (scale.hi - scale.lo || 1)) * (plotBottom - PAD.t)
  const step = n > 1 ? (VB.w - PAD.l - PAD.r) / (n - 1) : VB.w

  // Peers, drawn BEFORE the focus line so z-order does the emphasis rather than
  // a legend. Above six lines the thicket wins and a range band replaces them.
  const asBand = peersOn && bandMode
  const band = asBand
    ? legs.map((_, i) => {
        const vals = peers.map((p) => p.legs[i]?.value).filter((v) => v !== null && v !== undefined)
        return vals.length > 0 ? { lo: Math.min(...vals), hi: Math.max(...vals) } : null
      })
    : null
  const bandRuns = band ? segmentsOf(band.map((b) => (b ? { value: b.hi } : { value: null }))) : []
  const networkLegs = asBand && summary ? summary.legs.map((l) => ({ value: l.value })) : null

  return (
    <svg
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      preserveAspectRatio="xMidYMid meet"
      className="block w-full"
      role="img"
      aria-label={`${panel.label} at ${schoolName ?? 'this school'}, ${panel.startYear} to ${panel.endYear}`}
    >
      <ChartDefs id={uid} />

      {/* THE SHARED GRID. Same ticks, same y, in every panel on the page — and
          in the enlarged view of any of them. */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l - 4} x2={VB.w - PAD.r + 4} y1={y(t)} y2={y(t)} stroke={INK.grid} strokeWidth="1" />
          {axisNumbers ? (
            <text
              x={PAD.l - 10}
              y={y(t) + 3.5 * s}
              fontSize={9.5 * s}
              fontWeight="700"
              fill="#94A3B8"
              textAnchor="end"
              // Named so "the enlarged view did not re-fit its axis" is a
              // comparison a test can make against the grid's own rail.
              className="coh-axis-tick tabular-nums"
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            >
              {Number(t.toFixed(unit.decimals))}
            </text>
          ) : null}
        </g>
      ))}

      {national !== null && national !== undefined && national >= scale.lo && national <= scale.hi ? (
        <>
          <line
            x1={PAD.l - 4}
            x2={VB.w - PAD.r + 4}
            y1={y(national)}
            y2={y(national)}
            stroke={INK.national}
            strokeWidth="1"
            strokeDasharray="4 3"
            opacity="0.5"
          />
          {axisNumbers ? (
            <text
              x={VB.w - PAD.r + 4}
              y={y(national) - 4}
              fontSize={8.5 * s}
              fontWeight="700"
              fill={INK.national}
              textAnchor="end"
              opacity="0.75"
            >
              National
            </text>
          ) : null}
        </>
      ) : null}

      {inChartHeader ? (
        <>
          <text x={PAD.l - 4} y="14" fontSize="10.5" fontWeight="700" fill="#334155">
            {panel.label}
          </text>
          <text x={PAD.l - 4} y="25" fontSize="8.5" fill="#94A3B8">
            {panel.startYear}–{panel.endYear}
          </text>
        </>
      ) : null}

      {/* ── Peers ── */}
      {peersOn && asBand ? (
        <g>
          {bandRuns
            .filter((run) => run.length > 1)
            .map((run) => (
              <path
                key={`band-${run[0]}`}
                d={`M ${run.map((i) => `${x(i)},${y(band[i].hi)}`).join(' L ')} L ${[...run]
                  .reverse()
                  .map((i) => `${x(i)},${y(band[i].lo)}`)
                  .join(' L ')} Z`}
                fill="rgba(148,163,184,0.16)"
                stroke="none"
              />
            ))}
          {networkLegs
            ? segmentsOf(networkLegs)
                .filter((run) => run.length > 1)
                .map((run) => (
                  <path
                    key={`net-${run[0]}`}
                    d={`M ${run.map((i) => `${x(i)},${y(networkLegs[i].value)}`).join(' L ')}`}
                    fill="none"
                    stroke={INK.network}
                    strokeWidth={1.3 * s}
                    strokeDasharray="4 3"
                    opacity="0.75"
                  />
                ))
            : null}
        </g>
      ) : null}

      {peersOn && !asBand
        ? peers.map((peer, i) => (
            <Trajectory
              // The server pre-anonymises: `label` survives the walk, schoolId
              // is nulled for every peer, so the key is the label — plus the
              // index, because two schools may share a name and React would
              // then reconcile one line onto the other's path.
              key={`peer-${peer.label}-${i}`}
              legs={peer.legs}
              x={x}
              y={y}
              uid={uid}
              isFocus={false}
              index={index}
              reduce={reduce}
              unit={unit}
              showLabels={false}
              labelFirstLast={false}
              topGuard={PAD.t + 14 * s}
              s={s}
            />
          ))
        : null}

      <Trajectory
        legs={legs}
        x={x}
        y={y}
        uid={uid}
        isFocus
        index={index}
        reduce={reduce}
        unit={unit}
        showLabels
        labelFirstLast={labelFirstLast}
        topGuard={PAD.t + 14 * s}
        s={s}
      />

      {/* ── The grade axis, where the honest markers live ── */}
      <line
        x1={PAD.l - 4}
        x2={VB.w - PAD.r + 4}
        y1={plotBottom}
        y2={plotBottom}
        stroke="rgba(16,28,61,0.14)"
        strokeWidth="1"
      />
      {legs.map((leg, i) => {
        const reported = leg.value !== null && leg.value !== undefined
        const ends = i === 0 || i === n - 1
        // The enlarged plot has room for every year, and hiding the middle ones
        // there would be a small-panel compromise carried where it does not
        // apply.
        const showYear = axisNumbers || ends
        return (
          <g key={`ax-${i}`}>
            {!reported ? (
              <>
                <title>{legTitle(leg.state)}</title>
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
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            >
              {leg.gradeLevel}
            </text>
            {!reported ? (
              <text
                x={x(i)}
                y={plotBottom + 20 * s}
                fontSize={8 * s}
                fill="#94A3B8"
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              >
                {legToken(leg.state)}
              </text>
            ) : showYear ? (
              <text
                x={x(i)}
                y={plotBottom + 20 * s}
                fontSize={7.5 * s}
                fill="#CBD5E1"
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              >
                {leg.schoolYear}
              </text>
            ) : null}
          </g>
        )
      })}

      {/* ── Hit areas, for the one glass surface on the page ── */}
      {legs.map((leg, i) => (
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
                title: `${gradeName(leg.gradeLevel)} · ${leg.schoolYear}`,
                rows: [
                  {
                    color: COH_HUE,
                    label: schoolName ?? 'This school',
                    value:
                      leg.value === null || leg.value === undefined
                        ? legTitle(leg.state)
                        : `${fmtScore(leg.value, unit.decimals)} ${unit.label}`,
                  },
                  ...(leg.tested ? [{ color: '#CBD5E1', label: 'Students tested', value: String(leg.tested) }] : []),
                  ...(peersOn && peerCount
                    ? [{ color: INK.peer, label: 'Other schools', value: `${peerCount} on this chart` }]
                    : []),
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

/** The "not the cohort change" note, in both sizes — a panel that grows it in
 *  the grid and loses it when enlarged would drop the one caveat that says the
 *  headline number is not the end-to-end one. */
function ObservedNote({ focus, panel, unit, className }) {
  if (!(focus?.netChange === null && focus?.observedChange)) return null
  return (
    <p className={className}>
      Observed <span className="font-bold tabular-nums text-navy/70">{signed(focus.observedChange.value, unit.decimals)}</span>{' '}
      across the {focus.observedChange.spanGrades} grades actually reported ({focus.observedChange.fromGrade} →{' '}
      {focus.observedChange.toGrade}) — not the {panel.label.toLowerCase()} change.
    </p>
  )
}

// ── The enlarged view ────────────────────────────────────────────────────────

/**
 * THE SAME COHORT, BIGGER — AND ON THE SAME AXIS.
 *
 * `scale` and `ticks` are passed straight through from the grid and are NOT
 * re-fitted to this one cohort. That is the whole point: a re-fit would give
 * the enlarged panel a taller-looking climb than the panel the reader clicked,
 * and the two would be describing the same children in different terms. The
 * grid's shared-scale rule does not stop applying because one panel got focus.
 *
 * Everything drawn here comes out of the panel object the grid already has —
 * there is no second fetch, so the enlarged view cannot disagree with the small
 * one about what is on file.
 */
function CohortExpanded({ panel, unit, gap, schoolName, reduce, onClose, returnFocusTo, plotProps, ticks, scale }) {
  const dialogRef = useRef(null)
  const titleId = useId()
  const { focus } = panel
  const legs = focus?.legs ?? []

  useEffect(() => {
    const returnTo = returnFocusTo?.current ?? null
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    // The page behind must not scroll under the overlay — restored exactly to
    // whatever it was, since another overlay may already own it.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      // Back to the panel that opened this, not to the top of the document —
      // a keyboard reader who pressed Enter on cohort four must not be dropped
      // back at the start of the grid.
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
        transition={{ duration: reduce ? 0 : 0.2, ease: COH_EASE }}
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-coh-expanded="1"
        // The domain, stated on the element, so a check that the enlarged view
        // did not re-fit its axis is a string comparison rather than a squint.
        data-coh-ticks={ticks.join(',')}
        data-coh-scale={`${scale.lo},${scale.hi}`}
        className="panel relative max-h-[85vh] w-full max-w-3xl overflow-y-auto !shadow-float outline-none"
        // Reduced motion gets the fade and nothing else — no scale, no travel.
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: reduce ? 0.12 : 0.28, ease: COH_EASE }}
      >
        <div className="flex flex-wrap items-start gap-3 border-b border-navy/10 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="text-[17px] font-bold leading-tight text-navy">
              {panel.label}
            </h3>
            <p className="mt-0.5 text-[12px] text-muted">
              {panel.startYear}–{panel.endYear} · {schoolName ?? 'this school'}
            </p>
          </div>
          {focus ? <NetChangeChip focus={focus} unit={unit} gap={gap} reduce={reduce} delay={0} big /> : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the enlarged cohort"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-navy/[0.06] hover:text-navy"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 pt-3">
          <CohortPlot
            {...plotProps}
            panel={panel}
            unit={unit}
            scale={scale}
            ticks={ticks}
            schoolName={schoolName}
            reduce={reduce}
            geom={LARGE}
            s={1.35}
            // Room for every number here — the grid drops interior labels
            // because 184px cannot hold four four-digit totals, which is a
            // constraint of the small panel and not of the data.
            labelFirstLast={false}
            axisNumbers
            inChartHeader={false}
            index={0}
          />
        </div>

        <ObservedNote focus={focus} panel={panel} unit={unit} className="px-5 pb-1 text-[12px] leading-snug text-muted" />

        <div className="px-5 pb-5 pt-2">
          <table className="w-full border-collapse text-left text-[12.5px]">
            <caption className="sr-only">
              Every grade in {panel.label}, with the score and the number of students tested
            </caption>
            <thead>
              <tr className="text-micro font-semibold uppercase text-ink2">
                <th scope="col" className="border-b border-navy/10 py-1.5 pr-3 font-bold">Grade</th>
                <th scope="col" className="border-b border-navy/10 py-1.5 pr-3 font-bold">School year</th>
                <th scope="col" className="border-b border-navy/10 py-1.5 pr-3 text-right font-bold">{unit.label}</th>
                <th scope="col" className="border-b border-navy/10 py-1.5 pr-3 text-right font-bold">Tested</th>
                <th scope="col" className="border-b border-navy/10 py-1.5 font-bold">Note</th>
              </tr>
            </thead>
            <tbody>
              {legs.map((leg, i) => {
                const reported = leg.value !== null && leg.value !== undefined
                return (
                  <tr key={`row-${leg.schoolYear}-${leg.gradeLevel}-${i}`} className="align-top">
                    <td className="border-b border-navy/[0.06] py-1.5 pr-3 font-semibold text-navy">
                      {gradeName(leg.gradeLevel)}
                    </td>
                    <td className="border-b border-navy/[0.06] py-1.5 pr-3 tabular-nums text-muted">{leg.schoolYear}</td>
                    {/* A withheld or missing number stays withheld or missing —
                        never a dash the reader could read as a zero, and never
                        an interpolation. */}
                    <td
                      className={`border-b border-navy/[0.06] py-1.5 pr-3 text-right tabular-nums ${
                        reported ? 'font-bold text-navy' : 'text-muted'
                      }`}
                    >
                      {reported ? fmtScore(leg.value, unit.decimals) : legToken(leg.state)}
                    </td>
                    <td className="border-b border-navy/[0.06] py-1.5 pr-3 text-right tabular-nums text-muted">
                      {leg.tested ?? '—'}
                    </td>
                    <td className="border-b border-navy/[0.06] py-1.5 text-muted">
                      {reported ? '' : legTitle(leg.state)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
            Drawn on the same {unit.label} scale as the grid behind this — {Number(scale.lo.toFixed(unit.decimals))} to{' '}
            {Number(scale.hi.toFixed(unit.decimals))} — so the shape here is the shape there.
            {plotProps?.peersOn && plotProps?.peerCount
              ? ` The other ${plotProps.peerCount} school${plotProps.peerCount === 1 ? '' : 's'} are drawn behind, on that same axis.`
              : ''}
          </p>
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

// ── The panel ────────────────────────────────────────────────────────────────

export default function CohortTrajectoryPanel({
  panel,
  scale,
  ticks,
  unit,
  gap,
  national,
  peersOn,
  // DECIDED ONCE, ABOVE, FOR THE WHOLE GRID. Not `peers.length > 6` here: a
  // peer missing one cohort's grades would then draw lines in this panel and a
  // band in the one beside it, with a single caption describing one of them.
  asBand: bandMode = false,
  peerCount,
  schoolName,
  index = 0,
  wide = false,
  reduce = false,
}) {
  const tip = useTooltip()
  const [ref, measured] = useMeasuredWidth()
  const [expanded, setExpanded] = useState(false)
  const { focus } = panel
  const legs = focus?.legs ?? []

  const step = legs.length > 1 ? (SMALL.VB.w - SMALL.PAD.l - SMALL.PAD.r) / (legs.length - 1) : SMALL.VB.w

  // LABEL DENSITY, TWICE OVER. A four-digit SAT total repeated four times in a
  // 184px panel is unreadable ink, so a narrow panel labels only the ends; and
  // if the labels would collide at any width, the interior ones drop out and
  // survive in the tooltip rather than overprinting each other. Neither applies
  // to the enlarged view, which has the room.
  const widest = Math.max(...legs.map((l) => fmtScore(l.value, unit.decimals).length), 1)
  const narrow = measured > 0 && measured < 200 && !wide
  const crowded = widest * 5.6 + 4 > step
  const labelFirstLast = narrow || crowded

  // The props both sizes share, in one object, so the enlarged view cannot be
  // handed a different national line or a different peer mode than the panel
  // it was opened from.
  const plotProps = { national, peersOn, asBand: bandMode, peerCount, gap }

  const open = useCallback(() => {
    tip.hide()
    setExpanded(true)
  }, [tip])

  return (
    <>
      <motion.figure
        ref={ref}
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: COH_EASE, delay: reduce ? 0 : 0.05 + index * 0.05 }}
        // ACTIVATABLE. The whole panel is the target — a small multiple has no
        // spare room for a button that is big enough to hit, and the reader who
        // wants a closer look points at the chart, not at a corner of it. The
        // glyph is the discoverability, not the hit area.
        role="button"
        tabIndex={0}
        aria-label={`Enlarge ${panel.label}, ${panel.startYear} to ${panel.endYear}${
          schoolName ? ` at ${schoolName}` : ''
        }`}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            // Space scrolls the page by default, which would move the grid out
            // from under the overlay the same keystroke just opened.
            e.preventDefault()
            open()
          }
        }}
        className="coh-panel group relative isolate min-w-0 cursor-zoom-in overflow-hidden rounded-lg border border-hair bg-white transition-colors duration-200 hover:border-hair/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
      >
        <figcaption className="sr-only">
          {panel.label}, {panel.startYear} to {panel.endYear} at {schoolName ?? 'this school'}
        </figcaption>

        <div className="absolute right-2 top-2 z-10 max-w-[70%]">
          <NetChangeChip
            focus={focus}
            unit={unit}
            gap={gap}
            reduce={reduce}
            delay={reduce ? 0 : 0.1 + index * 0.09 + 0.6}
          />
        </div>

        {/* The affordance, not a second tab stop: the figure itself is the
            button, and a focusable child inside a role="button" is a control
            inside a control. */}
        <span
          aria-hidden="true"
          className="coh-noprint pointer-events-none absolute bottom-1.5 right-1.5 z-10 inline-flex items-center gap-1 rounded-sm border border-hair bg-white px-1.5 py-1 text-[10px] font-bold text-teal-700 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <Maximize2 size={11} strokeWidth={2.6} />
        </span>

        <CohortPlot
          panel={panel}
          scale={scale}
          ticks={ticks}
          unit={unit}
          schoolName={schoolName}
          index={index}
          reduce={reduce}
          geom={SMALL}
          s={1}
          labelFirstLast={labelFirstLast}
          {...plotProps}
        />

        <ObservedNote focus={focus} panel={panel} unit={unit} className="px-3 pb-2.5 text-[10px] leading-snug text-muted" />
      </motion.figure>

      {expanded ? (
        <CohortExpanded
          panel={panel}
          unit={unit}
          gap={gap}
          schoolName={schoolName}
          reduce={reduce}
          onClose={() => setExpanded(false)}
          returnFocusTo={ref}
          plotProps={plotProps}
          // STRAIGHT THROUGH, NOT RE-FITTED. See CohortExpanded's own note.
          scale={scale}
          ticks={ticks}
        />
      ) : null}
    </>
  )
}

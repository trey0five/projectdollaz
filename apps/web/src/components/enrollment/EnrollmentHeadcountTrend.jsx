// ─────────────────────────────────────────────────────────────────────────────
// E1 — HEADCOUNT OVER TIME.
//
// THE AXIS STARTS AT ZERO, AND SAYS SO. The diocesan deck's own "Enrollment
// over Time" begins its y-axis at 2,400, which turns a 3% wobble into a mountain
// range — the single most effective way to mislead with a true series. A
// headcount has a real zero and no chart of one may truncate it, so the floor
// here is 0 and the caption states it. Every peak on this chart is a peak.
//
// X IS DATE-SCALED, NOT INDEX-SPACED. Two readings a year apart and two an hour
// apart must not draw the same line. The server has already deduped to the
// LATEST reading per calendar day and sorted ascending, so this file places the
// points it is given and dedupes nothing.
//
// WHY NOT analytics/charts/LineChart.jsx: that component spaces X by array index
// (`i / (labels.length - 1)`, LineChart.jsx:55) and has no dashed reference line.
// Both are exactly what this chart needs, so the ~90 lines of geometry live here
// rather than bending a shared component out of shape for one caller.
//
// OBSERVED vs PLANNED IS A VISUAL CLASS DISTINCTION: the reading is a solid
// stroke over a gradient wash, the plan is a DASHED rule in its own ink. Two
// solid lines would read as two equally-observed facts, and only one of them
// was ever counted.
//
// Honest states, in order of how often they happen: no reading → a door, not an
// empty chart; exactly ONE reading → a labelled dot and a sentence, never a line
// through a single point.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useTooltip } from '../analytics/charts/Tooltip.jsx'
import {
  CardEmpty,
  EASE,
  ENROLL_HUE,
  fmtCount,
  fmtDate,
  providerLabel,
  separateLabels,
  zeroBasedDomain,
} from './enrollmentAnalyticsKit.jsx'
import { axisEndLabels } from '../../lib/dates.js'

// A plan is a reference line, not a status: ink-2 (EnrollmentTrend's AXIS_INK),
// never the kit's PLAN_INK amber, which is the semantic WATCH colour.
const PLAN_STROKE = '#44506E'

const VB = { w: 680, h: 210 }
const PAD = { l: 54, r: 62, t: 16, b: 34 }

export default function EnrollmentHeadcountTrend({ points = [], planTotal = null, reduce = false }) {
  const tip = useTooltip()
  const [hover, setHover] = useState(null)

  const series = useMemo(
    () =>
      (points ?? [])
        .map((p) => ({ ...p, t: Date.parse(`${String(p.observedOn).slice(0, 10)}T00:00:00Z`) }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.total)),
    [points],
  )

  if (series.length === 0) {
    return (
      <CardEmpty>
        No enrollment reading has been filed yet, so there is no line to draw. Connect a SIS, upload a roster, or enter
        a headcount and this chart starts with that first reading.
      </CardEmpty>
    )
  }

  const latest = series[series.length - 1]

  if (series.length === 1) {
    // ONE reading is a fact, not a trend. Drawing a line through a single point
    // — or a flat rule across the card — would assert a stability nobody
    // observed.
    return (
      // Premium UI P4 (a2): the one figure on the ground between hairlines, in
      // display type with a 2px module-hue rule — no tinted box, no hue-filled disc.
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-hair px-1 py-5">
        <span className="shrink-0 border-b-2 pb-1 font-serif text-[30px] font-medium leading-9 tabular-nums text-ink" style={{ borderColor: ENROLL_HUE }}>
          {fmtCount(latest.total)}
        </span>
        <p className="min-w-0 flex-1 text-small leading-relaxed text-ink2">
          One reading so far — <span className="font-semibold text-ink">{fmtCount(latest.total)} students</span> on{' '}
          <span className="font-semibold text-ink">{fmtDate(latest.observedOn)}</span>. The trend starts with your next
          reading.
        </p>
      </div>
    )
  }

  // ── Scales. THE FLOOR IS ZERO, ALWAYS — never fitted to the data. ──
  const totals = series.map((p) => p.total)
  // The ceiling must clear the PLAN as well as the readings — a plan line drawn
  // off the top of the card is a reference the reader cannot see.
  const headroom = Math.max(...totals, planTotal ?? 0) * 1.08
  const { hi: yHi, ticks } = zeroBasedDomain(headroom)

  const t0 = series[0].t
  const t1 = latest.t
  const axisEnds = axisEndLabels(series[0].observedOn, latest.observedOn)
  const plotBottom = VB.h - PAD.b
  const X = (t) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (VB.w - PAD.l - PAD.r)
  const Y = (v) => PAD.t + (1 - v / yHi) * (plotBottom - PAD.t)

  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.t).toFixed(1)} ${Y(p.total).toFixed(1)}`).join(' ')
  const area = `${line} L${X(t1).toFixed(1)} ${plotBottom} L${X(t0).toFixed(1)} ${plotBottom} Z`

  // The extremes, named — but ONLY when they are INTERIOR points. The first and
  // last readings are already labelled on the axis and at the endpoint, so a
  // "high" flag on the last point printed straight through the endpoint value
  // and the plan label beside it. A callout that collides with the number it is
  // describing is worse than no callout.
  const interior = series.slice(1, -1)
  const hi = interior.length ? interior.reduce((a, b) => (b.total > a.total ? b : a)) : null
  const lo = interior.length ? interior.reduce((a, b) => (b.total < a.total ? b : a)) : null
  const extremes = [
    hi && hi.total > Math.max(series[0].total, latest.total) ? { p: hi, label: 'high', dy: -11 } : null,
    lo && lo.total < Math.min(series[0].total, latest.total) ? { p: lo, label: 'low', dy: 16 } : null,
  ].filter(Boolean)

  // ── THE RIGHT EDGE, COLLISION-AWARE ─────────────────────────────────────────
  // The endpoint callout and the plan label share the right gutter, and whenever
  // the school sits NEAR its plan — the most common state there is — their
  // y-positions coincide and the two printed through each other (seen live:
  // "298" and "plan 305" in one smudge). The labels are separated by the kit's
  // shared 1-D pass; a label that had to move is tethered back to its anchor
  // with a small leader line, so the DATUM never moves, only its name.
  const planVisible = planTotal != null && planTotal <= yHi
  const planText = planVisible ? `plan ${fmtCount(planTotal)}` : null
  // A wide plan figure would run off the viewBox's right edge (the gutter is
  // PAD.r wide); rather than clip it, it moves INSIDE the plot to the line's
  // left end. ~5.6px per glyph at fontSize 10.
  const planFitsRight = planVisible && planText.length * 5.6 <= PAD.r - 7
  const rightLabelY = separateLabels(
    [
      { key: 'end', y: Y(latest.total) },
      ...(planVisible && planFitsRight ? [{ key: 'plan', y: Y(planTotal) }] : []),
    ],
    { gap: 15, lo: PAD.t + 5, hi: plotBottom - 4 },
  )
  const yEndLabel = rightLabelY.get('end') ?? Y(latest.total)
  const yPlanLabel = rightLabelY.get('plan') ?? (planVisible ? Y(planTotal) : null)
  const movedFrom = (fromY, toY) => Math.abs(fromY - toY) > 2

  const showTip = (p, ev) =>
    tip.show(
      {
        title: fmtDate(p.observedOn),
        rows: [
          { color: ENROLL_HUE, label: 'Students', value: fmtCount(p.total) },
          ...(p.provider ? [{ color: '#CBD5E1', label: 'Source', value: providerLabel(p.provider) }] : []),
          ...(planTotal != null ? [{ color: PLAN_STROKE, label: 'Plan', value: fmtCount(planTotal) }] : []),
        ],
      },
      ev.clientX,
      ev.clientY,
    )

  return (
    <div>
      <svg
        viewBox={`0 0 ${VB.w} ${VB.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="block w-full"
        role="img"
        aria-label={`Headcount from ${fmtDate(series[0].observedOn)} to ${fmtDate(latest.observedOn)}, ${fmtCount(
          latest.total,
        )} students at the latest reading. The vertical axis starts at zero.`}
      >
        <defs>
          <linearGradient id="enr-trend-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ENROLL_HUE} stopOpacity="0.3" />
            <stop offset="100%" stopColor={ENROLL_HUE} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines + the zero-based tick values. The 0 tick is drawn solid so
            the floor is visibly a floor rather than one dashed rule of four. */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.l}
              x2={VB.w - PAD.r}
              y1={Y(t)}
              y2={Y(t)}
              stroke={t === 0 ? 'rgba(16,28,61,0.18)' : '#E2E8F0'}
              strokeWidth="1"
              strokeDasharray={t === 0 ? undefined : '4 4'}
            />
            <text
              x={PAD.l - 8}
              y={Y(t) + 3.5}
              textAnchor="end"
              fontSize="10"
              fontWeight={t === 0 ? '700' : '600'}
              fill="#64748B"
              className="tabular-nums"
            >
              {fmtCount(t)}
            </text>
          </g>
        ))}

        {/* THE PLAN — dashed, in its own ink, and labelled in words. It is a
            different class of fact from the line below it. The label sits in the
            right gutter at its COLLISION-RESOLVED y (tethered by a leader when
            it had to move off the line), or at the line's left end inside the
            plot when the figure is too wide for the gutter. */}
        {planVisible ? (
          <g>
            <line
              x1={PAD.l}
              x2={VB.w - PAD.r}
              y1={Y(planTotal)}
              y2={Y(planTotal)}
              stroke={PLAN_STROKE}
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
            {planFitsRight ? (
              <>
                {movedFrom(Y(planTotal), yPlanLabel) ? (
                  <line
                    x1={VB.w - PAD.r}
                    y1={Y(planTotal)}
                    x2={VB.w - PAD.r + 4}
                    y2={yPlanLabel}
                    stroke={PLAN_STROKE}
                    strokeWidth="1"
                    opacity="0.55"
                  />
                ) : null}
                <text
                  x={VB.w - PAD.r + 5}
                  y={yPlanLabel + 3.5}
                  fontSize="10"
                  fontWeight="700"
                  fill={PLAN_STROKE}
                  className="tabular-nums"
                >
                  {planText}
                </text>
              </>
            ) : (
              <text
                x={PAD.l + 4}
                y={Y(planTotal) - 5}
                fontSize="10"
                fontWeight="700"
                fill={PLAN_STROKE}
                className="tabular-nums"
              >
                {planText}
              </text>
            )}
          </g>
        ) : null}

        <motion.path
          d={area}
          fill="url(#enr-trend-wash)"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : 0.5, duration: 0.5, ease: EASE }}
        />
        <motion.path
          d={line}
          fill="none"
          stroke={ENROLL_HUE}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduce ? 0 : 0.9, ease: EASE }}
        />

        {/* Crosshair on the hovered reading. */}
        {hover ? (
          <line
            x1={X(hover.t)}
            x2={X(hover.t)}
            y1={PAD.t}
            y2={plotBottom}
            stroke="rgba(16,28,61,0.18)"
            strokeWidth="1"
          />
        ) : null}

        {series.map((p, i) => {
          const last = i === series.length - 1
          return (
            <motion.circle
              key={p.observedOn}
              cx={X(p.t)}
              cy={Y(p.total)}
              r={last ? 5 : 3.6}
              fill={last ? ENROLL_HUE : '#fff'}
              stroke={ENROLL_HUE}
              strokeWidth="2"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: reduce ? 0 : 0.55 + i * 0.04 }}
            />
          )
        })}

        {/* The latest value, printed — never gated behind a hover. Its y is the
            collision-resolved slot; when that differs from the endpoint's own y
            (the plan label wanted the same spot), a leader ties it to its dot. */}
        {movedFrom(Y(latest.total), yEndLabel) ? (
          <line
            x1={X(t1) + 6}
            y1={Y(latest.total)}
            x2={X(t1) + 10}
            y2={yEndLabel}
            stroke="#94A3B8"
            strokeWidth="1"
            opacity="0.7"
          />
        ) : null}
        <text
          x={X(t1) + 8}
          y={yEndLabel + 4}
          fontSize="12"
          fontWeight="700"
          fill="#0F2A4A"
          className="tabular-nums"
        >
          {fmtCount(latest.total)}
        </text>

        {/* High/low callouts — interior turning points only (see above). */}
        {extremes.map(({ p, label, dy }) => (
          <text
            key={label}
            x={X(p.t)}
            y={Y(p.total) + dy}
            fontSize="8.5"
            fontWeight="700"
            fill="#94A3B8"
            textAnchor="middle"
            className="uppercase"
            style={{ letterSpacing: '0.08em' }}
          >
            {label} {fmtCount(p.total)}
          </text>
        ))}

        {/* Date axis — the ends always, so the span is readable at a glance; the
            years print whenever the span crosses one (lib/dates axisEndLabels). */}
        <text x={X(t0)} y={VB.h - 10} textAnchor="start" fontSize="10" fill="#64748B">
          {axisEnds[0]}
        </text>
        <text x={X(t1)} y={VB.h - 10} textAnchor="end" fontSize="10" fill="#64748B">
          {axisEnds[1]}
        </text>

        {/* Hit areas — hover reveals the detail, the values above carry the read. */}
        {series.map((p, i) => {
          const prev = series[i - 1]
          const next = series[i + 1]
          const left = prev ? (X(p.t) + X(prev.t)) / 2 : PAD.l
          const right = next ? (X(p.t) + X(next.t)) / 2 : VB.w - PAD.r
          return (
            <rect
              key={`hit-${p.observedOn}`}
              x={left}
              y={PAD.t - 6}
              width={Math.max(1, right - left)}
              height={plotBottom - PAD.t + 12}
              fill="transparent"
              onMouseMove={(ev) => {
                setHover(p)
                showTip(p, ev)
              }}
              onMouseLeave={() => {
                setHover(null)
                tip.hide()
              }}
            />
          )
        })}
      </svg>
    </div>
  )
}

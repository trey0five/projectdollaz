// ─────────────────────────────────────────────────────────────────────────────
// The projected cash line, with the reserve threshold drawn ON it.
//
// A cash balance chart without the floor it must not cross is decoration. The
// whole question a business manager is asking — "when does this dip below what we
// need to hold?" — is answered by where the line sits relative to that threshold,
// so the threshold is a first-class element of the chart rather than a number
// printed beside it.
//
// THE LOW POINT IS MARKED AND LABELLED. It is the single date the reader came for,
// and making them find it by eye on a 52-bucket line is the difference between a
// chart that informs and one that has to be studied.
//
// The domain does NOT assume zero at the bottom: a school already overdrawn is
// exactly the school that needs this screen, and clamping at zero would draw its
// deficit as the floor.
// ─────────────────────────────────────────────────────────────────────────────
import { useId, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useMeasuredWidth } from '../analytics/charts/useMeasuredWidth.js'
import { useReducedMotion } from '../analytics/charts/useReducedMotion.js'

const H = 240
const PAD_L = 8
const PAD_R = 8
const PAD_T = 26
const PAD_B = 48

const LINE = '#1D4ED8'
const RESERVE = '#EF4444'
const LOW = '#EA580C'

export default function CashRail({
  buckets = [],
  reserveThreshold = null,
  lowestDate = null,
  /**
   * The TRUE low — the intra-bucket, event-level minimum the engine reports.
   * Live-caught: the marker used to print the low bucket's CLOSING balance,
   * which disagreed with the hero's figure by whatever the recovery inside
   * that bucket was. One number, printed twice, must be the same number.
   */
  lowestBalance = null,
  /**
   * Projection IDENTITY (asOfDate + horizon + totals) — NOT the container width.
   * When it changes, the line re-runs its draw-in so cause (an edit) is visibly
   * followed by effect (the chart redrawing). Width changes must NOT re-key, or
   * every window resize would replay the animation.
   */
  redrawKey = '',
  format,
}) {
  const reduce = useReducedMotion()
  const [hostRef, width] = useMeasuredWidth(720)
  // Instance-unique ids (Sparkline idiom) — global ids would cross-wire when two
  // rails render, and the legend swatch must not reach into another svg's defs.
  const uid = useId().replace(/:/g, '')
  const fillId = `cashfill-${uid}`
  const hatchId = `cashhatch-${uid}`

  const fmt = typeof format === 'function' ? format : (n) => `$${Math.round(n).toLocaleString()}`

  const { lo, hi, pts } = useMemo(() => {
    const vals = buckets.map((b) => b.closingBalance).filter((v) => Number.isFinite(v))
    if (vals.length === 0) return { lo: 0, hi: 1, pts: [] }
    // The threshold belongs to the domain: a line that never reaches its own
    // floor must still show the floor, or the reader cannot see the margin.
    const all = reserveThreshold != null ? [...vals, reserveThreshold] : vals
    // Zero belongs too whenever the school is anywhere near it — the distance to
    // empty is the thing being read.
    if (Math.min(...all) > 0 && Math.min(...all) < Math.max(...all) * 0.35) all.push(0)
    const rawLo = Math.min(...all)
    const rawHi = Math.max(...all)
    const span = rawHi - rawLo
    const pad = span > 0 ? span * 0.12 : Math.abs(rawHi) * 0.2 || 1
    return { lo: rawLo - pad, hi: rawHi + pad, pts: vals }
  }, [buckets, reserveThreshold])

  const innerW = Math.max(80, width - PAD_L - PAD_R)
  const innerH = H - PAD_T - PAD_B
  const x = (i) => PAD_L + (pts.length <= 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW)
  const y = (v) => PAD_T + innerH - ((v - lo) / (hi - lo || 1)) * innerH

  if (pts.length === 0) return null

  const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')
  const area = `${path} L${x(pts.length - 1)},${PAD_T + innerH} L${x(0)},${PAD_T + innerH} Z`
  const lowIdx = buckets.findIndex(
    (b) => lowestDate && b.start <= lowestDate && b.end >= lowestDate,
  )

  // ── Per-bucket provenance: is this stretch of the line a CALENDAR or an
  //    ESTIMATE? Dominance of |committed|+|scheduled| (dates known) vs
  //    |modelled|+|assumption| (derived/entered) inside each bucket. A strip
  //    under the axis — never a dashed line, which would break the continuous
  //    quantity the line itself is. ──
  const hasProvenance = buckets.some((b) => b.byConfidence)
  const provenance = hasProvenance
    ? buckets.map((b) => {
        const c = b.byConfidence ?? {}
        const known = Math.abs(c.committed ?? 0) + Math.abs(c.scheduled ?? 0)
        const est = Math.abs(c.modelled ?? 0) + Math.abs(c.assumption ?? 0)
        if (known === 0 && est === 0) return 'quiet'
        return known >= est ? 'known' : 'estimated'
      })
    : []
  const stripY = PAD_T + innerH + 8
  const cellW = buckets.length > 0 ? innerW / buckets.length : 0

  return (
    <div ref={hostRef} className="w-full">
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label="Projected cash balance over the forecast horizon"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={LINE} stopOpacity="0.18" />
            <stop offset="100%" stopColor={LINE} stopOpacity="0.02" />
          </linearGradient>
          {/* Estimated stretches wear a light diagonal hatch — visibly "sketched"
              beside the solid cells of the known-date stretches. */}
          <pattern
            id={hatchId}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="5" height="5" fill={LINE} fillOpacity="0.10" />
            <line x1="0" y1="0" x2="0" y2="5" stroke={LINE} strokeOpacity="0.35" strokeWidth="1.5" />
          </pattern>
        </defs>

        {/* Zero, when it is inside the domain. An overdrawn school needs to see
            which side of it the line is on. */}
        {lo < 0 && hi > 0 ? (
          <line x1={PAD_L} x2={PAD_L + innerW} y1={y(0)} y2={y(0)} stroke="#94A3B8" strokeWidth={1} />
        ) : null}

        {/* Keyed by PROJECTION IDENTITY: every rebuild re-runs the draw-in, so an
            edit is answered by the line visibly redrawing (reduced-motion draws
            it complete). The key deliberately excludes width — see prop note. */}
        <g key={`draw-${redrawKey}`} data-redraw={redrawKey}>
          <path d={area} fill={`url(#${fillId})`} />
          <motion.path
            d={path}
            fill="none"
            stroke={LINE}
            strokeWidth={2.5}
            strokeLinejoin="round"
            initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 0.8, 0.2, 1] }}
          />
        </g>

        {/* THE FLOOR. Drawn on the chart, not printed beside it. */}
        {reserveThreshold != null ? (
          <>
            <line
              x1={PAD_L}
              x2={PAD_L + innerW}
              y1={y(reserveThreshold)}
              y2={y(reserveThreshold)}
              stroke={RESERVE}
              strokeWidth={1.5}
              strokeDasharray="5 3"
            />
            <text
              x={PAD_L + 2}
              y={y(reserveThreshold) - 5}
              fontSize="10.5"
              fontWeight="700"
              fill={RESERVE}
            >
              Minimum reserve {fmt(reserveThreshold)}
            </text>
          </>
        ) : null}

        {/* The date the reader came for, marked rather than left to be found. */}
        {lowIdx >= 0 ? (
          <>
            <line
              x1={x(lowIdx)}
              x2={x(lowIdx)}
              y1={PAD_T}
              y2={PAD_T + innerH}
              stroke={LOW}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.7}
            />
            {/* ONE pulse when the low point (re)appears — a glance-catcher, not a
                siren. Keyed with the redraw so a rebuild pulses once more; it
                NEVER loops. Reduced-motion gets a static halo ring instead. */}
            {reduce ? (
              <circle
                cx={x(lowIdx)}
                cy={y(pts[lowIdx])}
                r={10}
                fill="none"
                stroke={LOW}
                strokeOpacity={0.35}
                strokeWidth={2}
              />
            ) : (
              <motion.circle
                key={`pulse-${redrawKey}`}
                cx={x(lowIdx)}
                cy={y(pts[lowIdx])}
                fill="none"
                stroke={LOW}
                strokeWidth={2}
                initial={{ r: 5, opacity: 0.75 }}
                animate={{ r: 18, opacity: 0 }}
                transition={{ duration: 1.1, delay: 0.65, ease: 'easeOut' }}
              />
            )}
            <circle cx={x(lowIdx)} cy={y(pts[lowIdx])} r={5} fill={LOW} stroke="#fff" strokeWidth={2} />
            <text
              x={Math.min(x(lowIdx) + 8, width - 90)}
              y={Math.max(y(pts[lowIdx]) - 10, PAD_T + 10)}
              fontSize="11.5"
              fontWeight="700"
              fill={LOW}
            >
              Low {fmt(lowestBalance ?? pts[lowIdx])}
            </text>
          </>
        ) : null}

        {/* Provenance strip — which stretches of this line are a CALENDAR (solid:
            committed/scheduled dominate) and which are an ESTIMATE (hatched:
            modelled/assumption dominate). Cells with no movement stay faint. */}
        {hasProvenance ? (
          <g aria-label="Which parts of the forecast have known dates">
            {provenance.map((kind, i) => (
              <rect
                key={buckets[i]?.key ?? i}
                x={PAD_L + i * cellW}
                y={stripY}
                width={Math.max(0, cellW - 1)}
                height={10}
                rx={2}
                fill={
                  kind === 'known'
                    ? LINE
                    : kind === 'estimated'
                      ? `url(#${hatchId})`
                      : '#E2E8F0'
                }
                fillOpacity={kind === 'known' ? 0.55 : 1}
              >
                <title>
                  {`${buckets[i]?.key} · ${
                    kind === 'known'
                      ? 'mostly known dates'
                      : kind === 'estimated'
                        ? 'mostly estimated'
                        : 'no movement'
                  }`}
                </title>
              </rect>
            ))}
          </g>
        ) : null}

        {/* First and last bucket only — a 52-label axis is unreadable and the
            headline figures above already carry the exact dates. */}
        <text x={PAD_L} y={H - 8} fontSize="11" fill="#64748B">
          {buckets[0]?.start}
        </text>
        <text x={PAD_L + innerW} y={H - 8} fontSize="11" fill="#64748B" textAnchor="end">
          {buckets[buckets.length - 1]?.end}
        </text>
      </svg>

      {hasProvenance ? (
        <div className="mt-1 flex items-center gap-4 text-[11.5px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-3 rounded-sm"
              style={{ background: LINE, opacity: 0.55 }}
            />
            Known dates
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="8" aria-hidden="true">
              {/* Own tiny defs copy — a separate <svg> must not reference the
                  chart svg's defs (undefined in strict renderers). */}
              <defs>
                <pattern
                  id={`${hatchId}-legend`}
                  width="5"
                  height="5"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect width="5" height="5" fill={LINE} fillOpacity="0.10" />
                  <line x1="0" y1="0" x2="0" y2="5" stroke={LINE} strokeOpacity="0.35" strokeWidth="1.5" />
                </pattern>
              </defs>
              <rect width="12" height="8" rx="2" fill={`url(#${hatchId}-legend)`} />
            </svg>
            Estimated
          </span>
        </div>
      ) : null}
    </div>
  )
}

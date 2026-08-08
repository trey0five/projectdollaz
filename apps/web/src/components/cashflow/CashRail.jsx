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
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useMeasuredWidth } from '../analytics/charts/useMeasuredWidth.js'
import { useReducedMotion } from '../analytics/charts/useReducedMotion.js'

const H = 220
const PAD_L = 8
const PAD_R = 8
const PAD_T = 26
const PAD_B = 28

const LINE = '#1D4ED8'
const RESERVE = '#EF4444'
const LOW = '#EA580C'

export default function CashRail({ buckets = [], reserveThreshold = null, lowestDate = null, format }) {
  const reduce = useReducedMotion()
  const [hostRef, width] = useMeasuredWidth(720)

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
          <linearGradient id="cashfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={LINE} stopOpacity="0.18" />
            <stop offset="100%" stopColor={LINE} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Zero, when it is inside the domain. An overdrawn school needs to see
            which side of it the line is on. */}
        {lo < 0 && hi > 0 ? (
          <line x1={PAD_L} x2={PAD_L + innerW} y1={y(0)} y2={y(0)} stroke="#94A3B8" strokeWidth={1} />
        ) : null}

        <path d={area} fill="url(#cashfill)" />
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
            <circle cx={x(lowIdx)} cy={y(pts[lowIdx])} r={5} fill={LOW} stroke="#fff" strokeWidth={2} />
            <text
              x={Math.min(x(lowIdx) + 8, width - 90)}
              y={Math.max(y(pts[lowIdx]) - 10, PAD_T + 10)}
              fontSize="11.5"
              fontWeight="700"
              fill={LOW}
            >
              Low {fmt(pts[lowIdx])}
            </text>
          </>
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
    </div>
  )
}

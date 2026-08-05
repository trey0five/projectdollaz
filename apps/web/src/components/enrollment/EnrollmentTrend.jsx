// ─────────────────────────────────────────────────────────────────────────────
// EnrollmentTrend — headcount over time, drawn honestly.
//
// The old block was a flat sky rule pinned to the card floor, and every part of
// that had a cause worth fixing rather than styling over:
//   • The snapshot list holds SEVERAL rows per day (a file import writes one,
//     the roster sync writes another) with identical values — so the series was
//     2–3 coincident points. Deduped here to the LATEST reading per day.
//   • X was index-spaced: two snapshots a year apart and two an hour apart drew
//     identical charts. X is DATE-scaled now.
//   • A flat series hit Sparkline's span=0 branch and rendered on the bottom
//     edge. Fixed in Sparkline itself (centred) for every caller; this chart
//     draws its own axis anyway because it has real dates to place.
//
// Honest states: one distinct day → no fake line, a sentence ("the trend starts
// with your next change"); the plan renders as a reference line only when a
// plan EXISTS. Dots carry native tooltips (date · count) — nothing hover-gated
// beyond detail.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import { moduleHue } from '../module/moduleAnatomy.js'

const ENROLL_HUE = moduleHue('enrollment')
const H = 120
const PAD = { top: 12, right: 14, bottom: 20, left: 40 }
const W = 640 // viewBox width; the svg stretches

function fmtShort(iso) {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function EnrollmentTrend({ snapshots = [], planTotal = null }) {
  const reduce = useReducedMotion()

  // Latest reading per DAY, oldest→newest. The raw list is newest-first and
  // multi-row-per-day; keeping the first row seen per day keeps the latest.
  const series = useMemo(() => {
    const byDay = new Map()
    for (const s of snapshots) {
      const day = String(s.observedOn).slice(0, 10)
      if (!byDay.has(day) && Number.isFinite(s.totalEnrolled)) byDay.set(day, s.totalEnrolled)
    }
    return [...byDay.entries()]
      .map(([day, total]) => ({ day, total, t: Date.parse(`${day}T00:00:00Z`) }))
      .filter((p) => Number.isFinite(p.t))
      .sort((a, b) => a.t - b.t)
  }, [snapshots])

  if (series.length === 0) return null

  const latest = series[series.length - 1]

  if (series.length === 1) {
    // ONE distinct day is not a trend, and drawing a dot pretending otherwise
    // is how the flat line happened. Say what it is.
    return (
      <div className="card-soft p-4 sm:p-5">
        <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
          <TrendingUp size={13} style={{ color: ENROLL_HUE }} /> Headcount over time
        </h4>
        <p className="mt-2 text-[13.5px] text-muted">
          One snapshot so far — <span className="font-semibold text-navy">{latest.total.toLocaleString('en-US')}</span> on{' '}
          {fmtShort(latest.day)}. The trend starts with your next change.
        </p>
      </div>
    )
  }

  // ── scales ──
  const t0 = series[0].t
  const t1 = latest.t
  const vals = series.map((p) => p.total)
  const lo = Math.min(...vals, ...(planTotal != null ? [planTotal] : []))
  const hi = Math.max(...vals, ...(planTotal != null ? [planTotal] : []))
  // A flat series centres (never the floor); a real range gets 8% headroom.
  const span = hi - lo
  const yLo = span === 0 ? lo - Math.max(1, lo * 0.05) : lo - span * 0.08
  const yHi = span === 0 ? hi + Math.max(1, hi * 0.05) : hi + span * 0.08
  const X = (t) => PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.left - PAD.right)
  const Y = (v) => PAD.top + (1 - (v - yLo) / (yHi - yLo)) * (H - PAD.top - PAD.bottom)

  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.t).toFixed(1)} ${Y(p.total).toFixed(1)}`).join(' ')
  const area = `${line} L${X(t1).toFixed(1)} ${H - PAD.bottom} L${X(t0).toFixed(1)} ${H - PAD.bottom} Z`

  return (
    <div className="card-soft p-4 sm:p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
          <TrendingUp size={13} style={{ color: ENROLL_HUE }} /> Headcount over time
        </h4>
        <span className="text-[12px] text-muted">
          Latest <span className="font-bold text-navy tabular-nums">{latest.total.toLocaleString('en-US')}</span> ·{' '}
          {fmtShort(latest.day)}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Headcount from ${fmtShort(series[0].day)} to ${fmtShort(latest.day)}`}>
        <defs>
          <linearGradient id="enroll-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ENROLL_HUE} stopOpacity="0.26" />
            <stop offset="100%" stopColor={ENROLL_HUE} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* y guides: min / max labels, quiet */}
        <text x={PAD.left - 6} y={Y(hi) + 4} textAnchor="end" className="fill-[#8b94a5]" fontSize="10">
          {hi.toLocaleString('en-US')}
        </text>
        <text x={PAD.left - 6} y={Y(lo) + 4} textAnchor="end" className="fill-[#8b94a5]" fontSize="10">
          {lo.toLocaleString('en-US')}
        </text>
        {/* plan reference — only when a plan exists; labelled, never implied */}
        {planTotal != null ? (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={Y(planTotal)} y2={Y(planTotal)} stroke="#b89650" strokeWidth="1.5" strokeDasharray="5 4" />
            <text x={W - PAD.right} y={Y(planTotal) - 4} textAnchor="end" fontSize="10" className="fill-[#8a7433]" fontWeight="700">
              plan {planTotal.toLocaleString('en-US')}
            </text>
          </g>
        ) : null}
        <motion.path
          d={area}
          fill="url(#enroll-trend-fill)"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        />
        <motion.path
          d={line}
          fill="none"
          stroke={ENROLL_HUE}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
        {series.map((p) => (
          <circle key={p.day} cx={X(p.t)} cy={Y(p.total)} r="3.5" fill="#fff" stroke={ENROLL_HUE} strokeWidth="2">
            <title>{`${fmtShort(p.day)} · ${p.total.toLocaleString('en-US')} students`}</title>
          </circle>
        ))}
        {/* x labels: first + last date */}
        <text x={X(t0)} y={H - 6} textAnchor="start" fontSize="10" className="fill-[#8b94a5]">
          {fmtShort(series[0].day)}
        </text>
        <text x={X(t1)} y={H - 6} textAnchor="end" fontSize="10" className="fill-[#8b94a5]">
          {fmtShort(latest.day)}
        </text>
      </svg>
      <p className="mt-1.5 text-[11.5px] text-muted">
        One reading per day, from your enrollment snapshots — the roster writes one each day it changes.
      </p>
    </div>
  )
}

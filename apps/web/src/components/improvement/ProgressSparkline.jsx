// ─────────────────────────────────────────────────────────────────────────────
// ProgressSparkline — the RECORDED progress series for one initiative, drawn from
// `trend[]` (the improvement_progress_events table), never from anything derived.
//
// A line between two points asserts that both points were observed. So: fewer
// than two readings with a `pct` draws NO line and says so. The series is not
// interpolated, not smoothed and not extended to today — the last vertex is the
// last reading, and the drawer's projection sentence (or its refusal) is the only
// place a future date is ever mentioned.
//
// THE X AXIS IS TIME, NOT ORDER. Spacing readings evenly by index would draw a
// reading taken the next day and one taken four months later as the same
// horizontal distance, which flattens a stalled series into a steady climb —
// exactly the slope a viewer reads a sparkline for. So x is proportional to
// `observed_on`, and index spacing is used ONLY as a fallback when the dates are
// unusable or all identical (where a time axis has no width to divide).
// ─────────────────────────────────────────────────────────────────────────────
import { shortDate } from './improvementMeta.js'

const W = 260
const H = 56
const PAD = 4

/** ms since epoch for a 'yyyy-mm-dd' (or ISO) reading date; null when unusable. */
const dayMs = (iso) => {
  if (!iso) return null
  const t = Date.parse(`${String(iso).slice(0, 10)}T00:00:00.000Z`)
  return Number.isNaN(t) ? null : t
}

export default function ProgressSparkline({ trend = [], hue = '#14B8A6' }) {
  const points = (trend ?? []).filter((p) => p && p.pct != null && !Number.isNaN(Number(p.pct)))

  if (points.length < 2) {
    return (
      <p className="text-[12.5px] text-muted" data-testid="sparkline-empty">
        {points.length === 0
          ? 'No progress readings recorded yet.'
          : 'One reading recorded — a line needs two.'}
      </p>
    )
  }

  const times = points.map((p) => dayMs(p.date))
  const usableTime = times.every((t) => t != null) && times[times.length - 1] - times[0] > 0
  const span = usableTime ? times[times.length - 1] - times[0] : 0
  const xs = points.map((_, i) =>
    usableTime
      ? PAD + ((times[i] - times[0]) * (W - PAD * 2)) / span
      : PAD + (i * (W - PAD * 2)) / (points.length - 1),
  )
  const ys = points.map((p) => {
    const v = Math.min(Math.max(Number(p.pct), 0), 1)
    return H - PAD - v * (H - PAD * 2)
  })
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  const first = points[0]
  const last = points[points.length - 1]

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${points.length} recorded readings, from ${Math.round(Number(first.pct) * 100)}% to ${Math.round(Number(last.pct) * 100)}%`}
      >
        <path d={d} fill="none" stroke={hue} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {xs.map((x, i) => (
          <circle key={`${points[i].date}-${i}`} cx={x} cy={ys[i]} r={2.5} fill={hue} />
        ))}
      </svg>
      <p className="mt-1 text-[11.5px] text-muted">
        {points.length} readings · {shortDate(first.date) ?? first.date} → {shortDate(last.date) ?? last.date}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Tiny inline-SVG sparkline for the value-history section — gold stroke on a
// navy-tinted ground, matching the "flashy but on-theme" house style. No new
// charting dep. The line draws itself in with framer-motion `pathLength`;
// under useReducedMotion it renders fully drawn (no animation). Screen-only —
// the caller wraps the history section in `no-print`.
//
// `values` is the raw oldest→newest series (ValueHistoryResult.sparkline). Fewer
// than two finite points → nothing to draw (returns null).
// ─────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'

export default function Sparkline({ values, width = 236, height = 44 }) {
  const reduce = useReducedMotion()
  const pts = (values ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (pts.length < 2) return null

  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const range = max - min || 1
  const pad = 5
  const stepX = (width - pad * 2) / (pts.length - 1)
  const coords = pts.map((v, i) => {
    const x = pad + i * stepX
    const y = pad + (height - pad * 2) * (1 - (v - min) / range)
    return [x, y]
  })
  const d = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const [lastX, lastY] = coords[coords.length - 1]

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label="Value trend across snapshots"
      className="block max-w-full overflow-visible rounded-lg bg-navy/[0.06]"
    >
      <motion.path
        d={d}
        fill="none"
        stroke="#b89650"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
        animate={reduce ? false : { pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      />
      <circle cx={lastX} cy={lastY} r={3} fill="#b89650" />
    </svg>
  )
}

import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { fmtDollar } from '../../../lib/format.js'
import { programLabel } from '../../../lib/complianceMeta.js'

// On-theme arc colors (navy/gold family + a muted slate for UNKNOWN). No new
// brand colors — these are the same hues used across the analytics donuts.
// Fixed-order categorical hues (the chart palette's A / B / D; never gold, never
// purple), the unknown bucket in recessive slate. Colour follows the program.
const ARC_COLORS = {
  FTC: '#2563EB',
  FES_EO: '#D97706',
  FES_UA: '#059669',
  UNKNOWN: '#94A3B8',
}

function polar(cx, cy, r, frac) {
  const a = 2 * Math.PI * frac - Math.PI / 2
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

function arcPath(cx, cy, r, start, end) {
  const [x0, y0] = polar(cx, cy, r, start)
  const [x1, y1] = polar(cx, cy, r, end)
  const large = end - start > 0.5 ? 1 : 0
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`
}

/** A per-program donut over the positive disbursed totals. */
export default function ByProgramDonut({ byProgram }) {
  const reduce = useReducedMotion()
  const positive = useMemo(
    () => byProgram.filter((b) => b.total > 0),
    [byProgram],
  )
  const sum = positive.reduce((a, b) => a + b.total, 0)

  if (sum <= 0) {
    return (
      <div className="flex items-center justify-center border-y border-hair py-6 text-center text-small italic text-ink2">
        No positive disbursement totals to chart yet.
      </div>
    )
  }

  const cx = 60
  const cy = 60
  const r = 44
  const fracs = positive.map((b) => b.total / sum)
  const segments = positive.map((b, i) => {
    const start = fracs.slice(0, i).reduce((a, f) => a + f, 0)
    return { ...b, start, end: start + fracs[i], frac: fracs[i] }
  })

  return (
    <div className="flex items-center gap-5">
      <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0" role="img" aria-label={`Disbursements by program: ${segments.map((s) => `${s.program === 'UNKNOWN' ? 'Unknown' : programLabel(s.program)} ${Math.round(s.frac * 100)}%`).join(', ')}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(16 28 61 / 0.06)" strokeWidth="12" />
        {segments.map((s, i) => (
          <motion.path
            key={s.program}
            d={arcPath(cx, cy, r, s.start, s.end - 0.002)}
            fill="none"
            stroke={ARC_COLORS[s.program] ?? ARC_COLORS.UNKNOWN}
            strokeWidth="12"
            strokeLinecap="butt"
            initial={reduce ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: i * 0.08, ease: 'easeOut' }}
          />
        ))}
        <text x={cx} y={cy + 2} textAnchor="middle" className="fill-ink font-serif" fontSize="18" fontWeight="500">
          {positive.length}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-ink2" fontSize="8">
          {positive.length === 1 ? 'program' : 'programs'}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 text-[13px]">
        {segments.map((s) => (
          <li key={s.program} className="fig">
            <span className="fig-label">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ background: ARC_COLORS[s.program] ?? ARC_COLORS.UNKNOWN }}
            />
            <span className="font-semibold text-ink">
              {s.program === 'UNKNOWN' ? 'Unknown' : programLabel(s.program)}
            </span>
            </span>
            <span className="fig-value">
              {fmtDollar(s.total)} · {Math.round(s.frac * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

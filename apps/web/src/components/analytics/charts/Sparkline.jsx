import { useId } from 'react'
import { useMeasuredWidth } from './useMeasuredWidth.js'

// ─────────────────────────────────────────────────────────────────────────────
// Sparkline — static micro-trend for a stat tile / table row (ports the mockup's
// spark()). A 2px round-cap polyline + a white-ringed endpoint dot marking the
// latest value. No animation (nothing to reduce). Color is passed IN.
//
// Deviation from the mockup: the mockup drew the LINE in grey (#C4CCDF) with only
// the endpoint in color, because it sat behind an already-colored leaderboard row.
// As a standalone reusable primitive the single series' identity IS its color, so
// the line is drawn in `color` (matching the ENG-IA stub it supersedes). Endpoint
// dot keeps the white ring.
//
// Additive visual params (defaults preserve the original rendering exactly):
//   fill    — gradient-fade area wash under the line (peak .28 → 0) in `color`
//   stretch — fill the container width (measured px, so strokes/dots stay crisp)
// ─────────────────────────────────────────────────────────────────────────────
export default function Sparkline({ vals = [], color = '#2563EB', w = 110, h = 30, fill = false, stretch = false }) {
  const uid = useId().replace(/:/g, '')
  const [ref, measured] = useMeasuredWidth(w)
  const W = stretch ? Math.max(40, measured) : w

  const nums = (vals ?? []).filter((v) => Number.isFinite(v))
  if (nums.length < 2) {
    return (
      <div ref={ref} style={{ width: stretch ? '100%' : w }}>
        <svg width={W} height={h} aria-hidden="true" />
      </div>
    )
  }

  const max = Math.max(...nums)
  const min = Math.min(...nums)
  const span = max - min || 1
  const X = (i) => 2 + (W - 4) * (i / (nums.length - 1))
  const Y = (v) => 2 + (h - 6) * (1 - (v - min) / span)
  const d = nums.map((v, i) => (i ? 'L' : 'M') + X(i) + ' ' + Y(v)).join(' ')
  const lx = X(nums.length - 1)
  const ly = Y(nums[nums.length - 1])
  const areaD = `${d} L ${lx} ${h - 1} L ${X(0)} ${h - 1} Z`

  return (
    <div ref={ref} style={{ width: stretch ? '100%' : w }}>
      <svg viewBox={`0 0 ${W} ${h}`} width={W} height={h} role="img" aria-label="trend sparkline" style={{ display: 'block' }}>
        {fill && (
          <defs>
            <linearGradient id={`${uid}-a`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
        )}
        {fill && <path d={areaD} fill={`url(#${uid}-a)`} stroke="none" />}
        <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lx} cy={ly} r="3.5" fill={color} stroke="#fff" strokeWidth="2" />
      </svg>
    </div>
  )
}

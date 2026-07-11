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
// ─────────────────────────────────────────────────────────────────────────────
export default function Sparkline({ vals = [], color = '#2563EB', w = 110, h = 30 }) {
  const nums = (vals ?? []).filter((v) => Number.isFinite(v))
  if (nums.length < 2) return <svg width={w} height={h} aria-hidden="true" />

  const max = Math.max(...nums)
  const min = Math.min(...nums)
  const span = max - min || 1
  const X = (i) => 2 + (w - 4) * (i / (nums.length - 1))
  const Y = (v) => 2 + (h - 6) * (1 - (v - min) / span)
  const d = nums.map((v, i) => (i ? 'L' : 'M') + X(i) + ' ' + Y(v)).join(' ')
  const lx = X(nums.length - 1)
  const ly = Y(nums[nums.length - 1])

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label="trend sparkline">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="3.5" fill={color} stroke="#fff" strokeWidth="2" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PercentileStrip — a horizontal DISTRIBUTION strip for one metric across a peer
// group (the School-Comparison "where do we stand" mark). Form (dataviz):
//   • RICH sample (n≥5): a box-plot — p25–p75 box, a median line, min–max
//     whiskers, every peer as a recessive dot, and the FOCUS school as a coral dot
//     with a white surface ring. Direct labels: the focus value + the median only.
//   • SMALL / HEAD-TO-HEAD sample: quartiles are unstable, so it COLLAPSES to a
//     ranked-dot list — each school a labeled dot along the shared min–max axis,
//     focus in coral. No box, no percentile.
//
// Theme tokens ONLY: box/median = --c-navy-soft (action blue), focus = --c-coral,
// chrome = CHROME (recessive grid/axis ink). Responsive: a measured width inside an
// overflow-x-auto container; relative units; no hardcoded series hex. Text always
// wears ink tokens, never the mark color (dataviz non-negotiable).
// ─────────────────────────────────────────────────────────────────────────────
import { CHROME } from './palette.js'
import { useMeasuredWidth } from './useMeasuredWidth.js'

const BLUE = 'rgb(var(--c-navy-soft))'
const BLUE_SOFT = 'rgb(var(--c-navy-soft) / 0.14)'
const BLUE_EDGE = 'rgb(var(--c-navy-soft) / 0.38)'
const CORAL = 'rgb(var(--c-coral))'

// Pad a [min,max] domain by 6% each side so end marks never touch the frame.
function domainOf(lo, hi) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1]
  if (lo === hi) return [lo - 1, hi + 1]
  const pad = (hi - lo) * 0.06
  return [lo - pad, hi + pad]
}

export default function PercentileStrip({ stat, points = [], format = (v) => `${v}` }) {
  const [containerRef, W] = useMeasuredWidth(360)
  if (!stat) return null

  const sample = stat.sample || 'none'
  const isBox = sample === 'rich'
  const h = isBox ? 76 : Math.max(64, 20 + points.length * 22)
  const P = { l: 10, r: 10, t: isBox ? 14 : 10, b: isBox ? 26 : 10 }
  const iw = Math.max(1, W - P.l - P.r)

  // Domain: from the box stats when rich, else from the raw points.
  const rawVals = points.map((p) => p.value).filter((v) => Number.isFinite(v))
  const lo = isBox ? stat.min : rawVals.length ? Math.min(...rawVals) : 0
  const hi = isBox ? stat.max : rawVals.length ? Math.max(...rawVals) : 1
  const [d0, d1] = domainOf(lo, hi)
  const X = (v) => P.l + (iw * (v - d0)) / (d1 - d0 || 1)

  const fmt = (v) => (Number.isFinite(v) ? format(v) : '—')

  return (
    <div className="w-full overflow-x-auto" ref={containerRef}>
      <svg
        viewBox={`0 0 ${W} ${h}`}
        width="100%"
        height={h}
        role="img"
        aria-label={
          isBox
            ? `Distribution: median ${stat.medianFormatted ?? fmt(stat.median)}, this school ${stat.focusFormatted ?? fmt(stat.focusValue)}`
            : `Ranked comparison, ${points.length} schools`
        }
      >
        {isBox ? (
          <BoxPlot stat={stat} points={points} X={X} h={h} P={P} iw={iw} fmt={fmt} />
        ) : (
          <RankedDots stat={stat} points={points} X={X} P={P} fmt={fmt} />
        )}
      </svg>
    </div>
  )
}

function BoxPlot({ stat, points, X, h, P, iw, fmt }) {
  const midY = P.t + (h - P.t - P.b) / 2
  const boxH = 18
  const x25 = X(stat.p25)
  const x75 = X(stat.p75)
  const xMed = X(stat.median)
  const xMin = X(stat.min)
  const xMax = X(stat.max)
  const xFocus = Number.isFinite(stat.focusValue) ? X(stat.focusValue) : null
  return (
    <g>
      {/* baseline track */}
      <line x1={P.l} x2={P.l + iw} y1={midY} y2={midY} stroke={CHROME.grid} strokeWidth="1" />
      {/* min–max whiskers */}
      <line x1={xMin} x2={x25} y1={midY} y2={midY} stroke={CHROME.axis} strokeWidth="1.5" />
      <line x1={x75} x2={xMax} y1={midY} y2={midY} stroke={CHROME.axis} strokeWidth="1.5" />
      <line x1={xMin} x2={xMin} y1={midY - 6} y2={midY + 6} stroke={CHROME.axis} strokeWidth="1.5" />
      <line x1={xMax} x2={xMax} y1={midY - 6} y2={midY + 6} stroke={CHROME.axis} strokeWidth="1.5" />
      {/* p25–p75 box */}
      <rect
        x={Math.min(x25, x75)}
        y={midY - boxH / 2}
        width={Math.max(2, Math.abs(x75 - x25))}
        height={boxH}
        rx="4"
        fill={BLUE_SOFT}
        stroke={BLUE_EDGE}
        strokeWidth="1"
      />
      {/* median line */}
      <line x1={xMed} x2={xMed} y1={midY - boxH / 2} y2={midY + boxH / 2} stroke={BLUE} strokeWidth="2" strokeLinecap="round" />
      {/* recessive peer dots */}
      {points
        .filter((p) => !p.isFocus && Number.isFinite(p.value))
        .map((p) => (
          <circle key={p.id} cx={X(p.value)} cy={midY} r="3.5" fill={CHROME.dim} stroke="#fff" strokeWidth="1.5" />
        ))}
      {/* focus dot (coral, ringed) */}
      {xFocus != null && <circle cx={xFocus} cy={midY} r="6" fill={CORAL} stroke="#fff" strokeWidth="2" />}
      {/* direct labels: median (below) + focus (above) */}
      <text x={xMed} y={P.t + h - P.b + 16} fill={CHROME.axis} fontSize="10.5" fontWeight="600" textAnchor="middle" style={{ fontVariantNumeric: 'tabular-nums' }}>
        median {stat.medianFormatted ?? fmt(stat.median)}
      </text>
      {xFocus != null && (
        <text x={xFocus} y={midY - 12} fill={CHROME.ink} fontSize="11" fontWeight="700" textAnchor="middle" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {stat.focusFormatted ?? fmt(stat.focusValue)}
        </text>
      )}
    </g>
  )
}

function RankedDots({ stat, points, X, P, fmt }) {
  // Ranked by "goodness" for the metric's direction (best first).
  const dir = stat.goodDirection === 'lower' ? 1 : -1
  const ordered = points
    .filter((p) => Number.isFinite(p.value))
    .slice()
    .sort((a, b) => dir * (a.value - b.value))
  return (
    <g>
      {ordered.map((p, i) => {
        const y = P.t + 12 + i * 22
        const x = X(p.value)
        return (
          <g key={p.id}>
            <line x1={P.l} x2={P.l + (X(p.value) - P.l)} y1={y} y2={y} stroke={CHROME.grid} strokeWidth="1" />
            <circle cx={x} cy={y} r={p.isFocus ? 6 : 4} fill={p.isFocus ? CORAL : CHROME.dim} stroke="#fff" strokeWidth={p.isFocus ? 2 : 1.5} />
            <text x={P.l} y={y - 8} fill={p.isFocus ? CHROME.ink : CHROME.axis} fontSize="10.5" fontWeight={p.isFocus ? 700 : 600}>
              {p.name}
            </text>
            <text x={X(p.value) + 10} y={y + 3.5} fill={CHROME.inkSoft} fontSize="10.5" fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {p.formatted ?? fmt(p.value)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

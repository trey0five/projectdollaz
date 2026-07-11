import { CHROME } from './palette.js'
import { ensureChartStyles } from './styles.js'
import { useReducedMotion } from './useReducedMotion.js'
import { useTooltip } from './Tooltip.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// Radar — ports the mockup's radar(), generalized to take axes + series as props.
// Ported motion: staggered scale-up + fade per polygon, fill-opacity .13, vertex
// dots, hairline rings (0.33/0.66/1) + spokes, and a per-polygon tooltip listing
// each axis value. `spotlightId` dims non-matched polygons to .16 (data-sid).
// vals are PRE-NORMALIZED 0-100 by IA. Colors come IN via series[].color.
//
// props: axes:string[], series=[{id,color,vals:number[]}], spotlightId?
// ─────────────────────────────────────────────────────────────────────────────
export default function Radar({ axes = [], series = [], spotlightId = null }) {
  ensureChartStyles()
  const reduce = useReducedMotion()
  const tip = useTooltip()

  const finite = (v) => (Number.isFinite(v) ? v : 0)
  const size = 240
  const cx = size / 2
  const cy = size / 2 + 6
  const R = 82
  const n = axes.length || 1
  const ang = (i) => Math.PI / 2 + (i * 2 * Math.PI) / n
  const pt = (i, f) => [cx + R * f * Math.cos(ang(i)), cy - R * f * Math.sin(ang(i))]

  const rings = [0.33, 0.66, 1]

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img">
      {/* hairline rings */}
      {rings.map((f, ri) => {
        const d = axes.map((_, i) => (i ? 'L' : 'M') + pt(i, f).join(' ')).join(' ') + ' Z'
        return <path key={ri} d={d} fill="none" stroke={CHROME.grid} strokeWidth="1" />
      })}
      {/* spokes + axis labels */}
      {axes.map((a, i) => {
        const p = pt(i, 1)
        const lp = pt(i, 1.22)
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke={CHROME.grid} strokeWidth="1" />
            <text x={lp[0]} y={lp[1] + 3} textAnchor="middle" fill={CHROME.axis} fontSize="10.5">
              {a}
            </text>
          </g>
        )
      })}
      {/* polygons */}
      {series.map((s, k) => {
        const dim = spotlightId != null && s.id !== spotlightId
        const d = s.vals.map((v, i) => (i ? 'L' : 'M') + pt(i, finite(v) / 100).join(' ')).join(' ') + ' Z'
        return (
          <g
            key={s.id ?? k}
            data-sid={s.id ?? k}
            className={reduce ? undefined : 'fr-radar-in'}
            style={{
              opacity: dim ? 0.16 : 1,
              transition: 'opacity .2s',
              ...(reduce ? {} : { animationDelay: `${k * 0.15}s` }),
            }}
          >
            <path
              d={d}
              fill={s.color}
              fillOpacity="0.13"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              onMouseMove={(ev) =>
                tip.show(
                  { title: s.label ?? s.id, rows: axes.map((a, i) => ({ color: s.color, label: a, value: s.vals[i] })) },
                  ev.clientX,
                  ev.clientY,
                )
              }
              onMouseLeave={() => tip.hide()}
            />
            {s.vals.map((v, i) => {
              const p = pt(i, finite(v) / 100)
              return <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill={s.color} stroke="#fff" strokeWidth="2" />
            })}
          </g>
        )
      })}
    </svg>
  )
}

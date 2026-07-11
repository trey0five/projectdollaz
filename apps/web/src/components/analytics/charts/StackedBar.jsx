import { CHROME } from './palette.js'
import { ensureChartStyles } from './styles.js'
import { useReducedMotion } from './useReducedMotion.js'
import { useMeasuredWidth } from './useMeasuredWidth.js'
import { useTooltip } from './Tooltip.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// StackedBar — ports the mockup's stacked(). One or more 100%-stacked rows with a
// staggered growRect scaleX-in, 4px rounded outer ends, a 2px surface gap between
// segments, optional inside labels (when a segment is wide enough), and a per-
// segment tooltip. Multi-row mode adds a row label + dot. Colors come IN.
//
// props: rows=[{label?,dot?,parts:number[]}], colors, names, formatter?,
//        height?, labelInside?
// ─────────────────────────────────────────────────────────────────────────────
export default function StackedBar({
  rows = [],
  colors = [],
  names = [],
  formatter = (p) => p + '%',
  height = 26,
  labelInside = true,
}) {
  ensureChartStyles()
  const reduce = useReducedMotion()
  const tip = useTooltip()
  const [containerRef, W] = useMeasuredWidth(520)

  const finite = (v) => (Number.isFinite(v) ? v : 0)
  const multi = rows.length > 1
  const P = { l: multi ? 96 : 0, r: 0 }
  const rh = height
  const rgap = 14
  const H = rows.length * (rh + rgap) - rgap + 4

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img">
        {rows.map((r, ri) => {
          const y = ri * (rh + rgap)
          const total = r.parts.reduce((a, b) => a + finite(b), 0) || 1
          let x = P.l
          const cells = r.parts.map((p, pi) => {
            const w = (W - P.l - P.r) * (finite(p) / total) - 2
            const cell = { p, pi, x, w: Math.max(1, w) }
            x += Math.max(0, w) + 2
            return cell
          })
          return (
            <g key={r.label ?? ri}>
              {multi && (
                <>
                  <text x={P.l - 10} y={y + rh / 2 + 4} textAnchor="end" fill={CHROME.ink} fontSize="12" fontWeight="700">
                    {r.label}
                  </text>
                  <circle cx={P.l - 84} cy={y + rh / 2} r="5" fill={r.dot} />
                </>
              )}
              {cells.map(({ p, pi, x: cx, w }) => {
                if (p <= 0) return null
                const rounded = pi === 0 || pi === r.parts.length - 1
                return (
                  <g key={pi}>
                    <rect
                      x={cx}
                      y={y}
                      width={w}
                      height={rh}
                      rx={rounded ? 4 : 0}
                      ry={rounded ? 4 : 0}
                      fill={colors[pi]}
                      className={reduce ? undefined : 'fr-growx'}
                      style={reduce ? undefined : { animationDelay: `${(ri * 3 + pi * 0.9) * 0.06}s` }}
                      onMouseMove={(ev) =>
                        tip.show(
                          { title: r.label || 'Mix', rows: [{ color: colors[pi], label: names[pi], value: formatter(p) }] },
                          ev.clientX,
                          ev.clientY,
                        )
                      }
                      onMouseLeave={() => tip.hide()}
                    />
                    {labelInside && w > 46 && (
                      <text
                        x={cx + w / 2}
                        y={y + rh / 2 + 4}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize="11"
                        fontWeight="700"
                        className={reduce ? undefined : 'fr-fadein'}
                        style={reduce ? undefined : { animationDelay: `${0.55 + pi * 0.06}s` }}
                      >
                        {formatter(p)}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

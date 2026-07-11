import { CHROME } from './palette.js'
import { ensureChartStyles } from './styles.js'
import { useReducedMotion } from './useReducedMotion.js'
import { useMeasuredWidth } from './useMeasuredWidth.js'
import { useTooltip } from './Tooltip.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// GroupedBars — ports the mockup's groupedBars(). Horizontal grouped bars with a
// staggered growRect scaleX-in, 4px rounded ends, 2px gaps between the paired bars,
// a row label + colored dot, the first bar's value labeled, and a per-bar tooltip.
// Colors come IN via `colors` (one per series index within a row).
//
// props: rows=[{label,dot,vals:number[]}], colors:string[], names:string[], formatter?
// ─────────────────────────────────────────────────────────────────────────────
export default function GroupedBars({ rows = [], colors = [], names = [], formatter = (v) => v }) {
  ensureChartStyles()
  const reduce = useReducedMotion()
  const tip = useTooltip()
  const [containerRef, W] = useMeasuredWidth(520)

  const bh = 13
  const gap = 2
  const rgap = 16
  const finite = (v) => (Number.isFinite(v) ? v : 0)
  const P = { l: 96, r: 56, t: 4 }
  const h = P.t + rows.length * (bh * 2 + gap + rgap)
  const max = (rows.length ? Math.max(...rows.flatMap((r) => r.vals.map(finite))) : 1) * 1.05 || 1

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" height={h} role="img">
        {rows.map((r, ri) => {
          const y0 = P.t + ri * (bh * 2 + gap + rgap)
          return (
            <g key={r.label ?? ri}>
              <text x={P.l - 10} y={y0 + bh + 3} textAnchor="end" fill={CHROME.ink} fontSize="12" fontWeight="700">
                {r.label}
              </text>
              <circle cx={P.l - 84} cy={y0 + bh - 1} r="5" fill={r.dot} />
              {r.vals.map((v, vi) => {
                const w = Math.max(2, (W - P.l - P.r) * (finite(v) / max))
                const y = y0 + vi * (bh + gap)
                return (
                  <g key={vi}>
                    <rect
                      x={P.l}
                      y={y}
                      width={w}
                      height={bh}
                      fill={colors[vi]}
                      rx="4"
                      ry="4"
                      className={reduce ? undefined : 'fr-growx'}
                      style={reduce ? undefined : { animationDelay: `${(ri * 2 + vi) * 0.06}s` }}
                      onMouseMove={(ev) =>
                        tip.show(
                          { title: r.label, rows: [{ color: colors[vi], label: names[vi], value: formatter(v) }] },
                          ev.clientX,
                          ev.clientY,
                        )
                      }
                      onMouseLeave={() => tip.hide()}
                    />
                    {vi === 0 && (
                      <text
                        x={P.l + w + 7}
                        y={y + bh - 3}
                        fill={CHROME.inkSoft}
                        fontSize="11"
                        style={{ fontVariantNumeric: 'tabular-nums', ...(reduce ? {} : { animationDelay: `${0.5 + ri * 0.08}s` }) }}
                        className={reduce ? undefined : 'fr-fadein'}
                      >
                        {formatter(v)}
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

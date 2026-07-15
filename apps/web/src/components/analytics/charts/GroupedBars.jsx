import { CHROME } from './palette.js'
import { ensureChartStyles } from './styles.js'
import { useReducedMotion } from './useReducedMotion.js'
import { useTooltip } from './Tooltip.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// GroupedBars — horizontal grouped bars, rebuilt as an HTML grid (the old SVG
// anchored labels textAnchor=end at the viewBox edge, which CLIPPED long school
// names to "…eHigh School"). Each row: a real label column (ellipsis + measured
// title attr only when the name genuinely overflows) with the school's identity
// dot, then the paired 12px bars (2px gap, 4px rounded data-end, square at the
// baseline, scaleX grow-in with stagger; static under reduced-motion), then BOTH
// values right-aligned in a fixed gutter — never clipped. Measure hues come IN
// via `colors` (one per series index); school identity = row label + dot. Every
// bar is a hover/focus tooltip target with an aria-label; the caller renders the
// Legend (2 series) above.
//
// props: rows=[{label,dot,vals:number[]}], colors:string[], names:string[], formatter?
// ─────────────────────────────────────────────────────────────────────────────

// Title attr only when the name genuinely overflows its cell (measured, not guessed).
const fitTitle = (label) => (el) => {
  if (!el) return
  if (el.scrollWidth > el.clientWidth + 1) el.title = label
  else el.removeAttribute('title')
}

export default function GroupedBars({ rows = [], colors = [], names = [], formatter = (v) => v }) {
  ensureChartStyles()
  const reduce = useReducedMotion()
  const tip = useTooltip()
  const finite = (v) => (Number.isFinite(v) ? v : 0)
  const max = Math.max(1e-9, ...rows.flatMap((r) => r.vals.map(finite)))

  const tipContent = (r, vi) => ({
    title: r.label,
    rows: [{ color: colors[vi], label: names[vi], value: formatter(r.vals[vi]) }],
  })

  return (
    <div role="list">
      {rows.map((r, ri) => (
        <div key={r.label ?? ri} role="listitem" className="fr-grouped-row">
          <span className="fr-grouped-name" style={{ color: CHROME.ink }}>
            <i aria-hidden="true" style={{ background: r.dot }} />
            <em ref={fitTitle(r.label)}>{r.label}</em>
          </span>
          <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            {r.vals.map((v, vi) => (
              <span
                key={vi}
                className={`fr-grouped-bar${reduce ? '' : ' fr-growx'}`}
                tabIndex={0}
                role="img"
                aria-label={`${r.label}: ${names[vi]} ${formatter(v)}`}
                style={{
                  background: colors[vi],
                  width: `${Math.max(1, (100 * finite(v)) / max)}%`,
                  ...(reduce ? {} : { animationDelay: `${(ri * r.vals.length + vi) * 0.06}s` }),
                }}
                onMouseMove={(ev) => tip.show(tipContent(r, vi), ev.clientX, ev.clientY)}
                onMouseLeave={() => tip.hide()}
                onFocus={(ev) => {
                  const rc = ev.currentTarget.getBoundingClientRect()
                  tip.show(tipContent(r, vi), rc.left + rc.width / 2, rc.bottom)
                }}
                onBlur={() => tip.hide()}
              />
            ))}
          </span>
          <span style={{ display: 'grid', gap: 2 }}>
            {r.vals.map((v, vi) => (
              <span key={vi} className="fr-grouped-val" style={{ color: CHROME.inkSoft }}>
                {formatter(v)}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

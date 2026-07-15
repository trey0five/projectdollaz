import { CHROME } from './palette.js'
import { ensureChartStyles } from './styles.js'
import { useReducedMotion } from './useReducedMotion.js'
import { useTooltip } from './Tooltip.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// BarList — a horizontal SINGLE-MEASURE bar list (the dataviz "magnitude" form):
// one row per entity, name + thin bar + right-aligned value gutter, sorted desc.
// Colors are passed IN per row (they follow the ENTITY — never rank; a re-sort
// never repaints a survivor). Marks: 12px bar, 4px rounded data-end, square at
// the baseline, scaleX grow-in (60ms stagger; static under reduced-motion).
// Every row is a full-row hover/focus tooltip target and carries an aria-label,
// so no value is gated behind hover (the direct value gutter + the scorecard
// table twin keep everything reachable).
//
// props: rows=[{id,label,color,value,formatted,share?}], formatter?, sortDesc=true
// ─────────────────────────────────────────────────────────────────────────────

// Title attr only when the name genuinely overflows its cell (measured, not guessed).
const fitTitle = (label) => (el) => {
  if (!el) return
  if (el.scrollWidth > el.clientWidth + 1) el.title = label
  else el.removeAttribute('title')
}

export default function BarList({ rows = [], formatter = (v) => v, sortDesc = true }) {
  ensureChartStyles()
  const reduce = useReducedMotion()
  const tip = useTooltip()
  const finite = (v) => (Number.isFinite(v) ? v : 0)
  const list = sortDesc ? [...rows].sort((a, b) => finite(b.value) - finite(a.value)) : rows
  const max = Math.max(1e-9, ...list.map((r) => finite(r.value)))

  const tipContent = (r) => ({
    title: r.label,
    rows: [
      { color: r.color, label: 'Value', value: r.formatted ?? formatter(r.value) },
      ...(r.share ? [{ color: CHROME.dim, label: 'Share', value: r.share }] : []),
    ],
  })

  return (
    <div role="list">
      {list.map((r, i) => {
        const label = `${r.label}: ${r.formatted ?? formatter(r.value)}${r.share ? `, ${r.share} share` : ''}`
        return (
          <div
            key={r.id ?? r.label}
            role="listitem"
            tabIndex={0}
            aria-label={label}
            className="fr-barlist-row"
            onMouseMove={(ev) => tip.show(tipContent(r), ev.clientX, ev.clientY)}
            onMouseLeave={() => tip.hide()}
            onFocus={(ev) => {
              const rc = ev.currentTarget.getBoundingClientRect()
              tip.show(tipContent(r), rc.left + rc.width / 2, rc.bottom)
            }}
            onBlur={() => tip.hide()}
          >
            <span className="fr-barlist-name" style={{ color: CHROME.ink }}>
              <i aria-hidden="true" style={{ background: r.color }} />
              <em ref={fitTitle(r.label)}>{r.label}</em>
            </span>
            <span style={{ display: 'block', minWidth: 0 }}>
              <span
                className={`fr-barlist-bar${reduce ? '' : ' fr-growx'}`}
                style={{
                  background: r.color,
                  width: `${Math.max(1, (100 * finite(r.value)) / max)}%`,
                  ...(reduce ? {} : { animationDelay: `${i * 0.06}s` }),
                }}
              />
            </span>
            <span className="fr-barlist-val" style={{ color: CHROME.inkSoft }}>
              {r.formatted ?? formatter(r.value)}
              {r.share && <span style={{ color: CHROME.dimText, fontWeight: 600, marginLeft: 6 }}>{r.share}</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

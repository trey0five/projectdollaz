import { useState } from 'react'
import { CHROME } from './palette.js'
import { ensureChartStyles } from './styles.js'
import { useReducedMotion } from './useReducedMotion.js'
import { useTooltip } from './Tooltip.jsx'
import Legend from './Legend.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// DimensionRows — small-multiple bar rows per dimension: the dataviz-preferred
// replacement for a comparison radar. One card, one section per health dimension;
// inside each section one thin 10px bar per school on a SHARED 0–100 band (a
// hairline full-width track), 2px gaps, 4px rounded data-ends. School order is
// roster order and constant across dimensions; colors follow the entity. The
// direct label at every bar tip is the FORMATTED RAW VALUE — the mandatory CVD
// relief channel. Legend (with spotlight) sits at the card top; every bar is a
// tooltip + keyboard focus target with an aria-label. Reduced-motion: bars render
// static (no grow-in).
//
// props: dims=[{key,short,cells:[{id,name,color,raw,formatted,score}]}]  (score 0–100)
// ─────────────────────────────────────────────────────────────────────────────
export default function DimensionRows({ dims = [] }) {
  ensureChartStyles()
  const reduce = useReducedMotion()
  const tip = useTooltip()
  const [spotlight, setSpotlight] = useState(null)
  const roster = dims[0]?.cells ?? []

  const tipContent = (dim, c) => ({
    title: c.name,
    rows: [
      { color: c.color, label: dim.short, value: c.formatted ?? '—' },
      ...(c.score != null ? [{ color: CHROME.dim, label: 'Health score', value: `${Math.round(c.score)} / 100` }] : []),
    ],
  })

  return (
    <div>
      <Legend items={roster.map((c) => ({ id: c.id, label: c.name, color: c.color }))} onSpotlight={setSpotlight} />
      {dims.map((dim, di) => (
        <section key={dim.key} style={{ marginTop: di === 0 ? 4 : 14 }} aria-label={dim.short}>
          <h5
            style={{
              margin: '0 0 6px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: CHROME.axis,
            }}
          >
            {dim.short}
          </h5>
          <div style={{ display: 'grid', gap: 2 }}>
            {dim.cells.map((c, ci) => {
              const pct = c.score == null ? null : Math.max(2, Math.min(100, c.score))
              const inside = pct != null && pct > 80
              return (
                <div
                  key={c.id ?? ci}
                  className="fr-dimrow-track"
                  tabIndex={0}
                  aria-label={`${c.name}: ${c.formatted ?? 'no data'} ${dim.short}`}
                  style={{ opacity: spotlight != null && spotlight !== c.id ? 0.25 : 1 }}
                  onMouseMove={(ev) => tip.show(tipContent(dim, c), ev.clientX, ev.clientY)}
                  onMouseLeave={() => tip.hide()}
                  onFocus={(ev) => {
                    const rc = ev.currentTarget.getBoundingClientRect()
                    tip.show(tipContent(dim, c), rc.left + rc.width / 3, rc.bottom)
                  }}
                  onBlur={() => tip.hide()}
                >
                  {pct != null ? (
                    <>
                      <span
                        className={`fr-dimrow-bar${reduce ? '' : ' fr-growx'}`}
                        style={{
                          background: c.color,
                          width: `${pct}%`,
                          ...(reduce ? {} : { animationDelay: `${(di * dim.cells.length + ci) * 0.04}s` }),
                        }}
                      />
                      <span
                        className="fr-dimrow-val"
                        style={
                          inside
                            ? {
                                // Near-full bar: the label tucks inside the tip on a small
                                // surface pill so it clears contrast on ANY fill hue.
                                right: `calc(${100 - pct}% + 4px)`,
                                top: 2,
                                lineHeight: '12px',
                                padding: '0 4px',
                                borderRadius: 4,
                                background: 'rgba(255,255,255,0.9)',
                                color: CHROME.inkSoft,
                              }
                            : { left: `calc(${pct}% + 6px)`, color: CHROME.inkSoft }
                        }
                      >
                        {c.formatted ?? ''}
                      </span>
                    </>
                  ) : (
                    <span className="fr-dimrow-val" style={{ left: 6, color: CHROME.dimText }}>
                      —
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

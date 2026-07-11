import { CHROME } from './palette.js'
import { ensureChartStyles } from './styles.js'

// ─────────────────────────────────────────────────────────────────────────────
// Legend — identity key for any multi-series chart. Rendered whenever ≥2 series
// (dataviz non-negotiable; returns null for a single series — the title names it).
// Hovering / focusing an item calls onSpotlight(id); leaving calls onSpotlight(null)
// so the paired chart can dim non-matched series (spotlightId). Text wears INK,
// never the series color — the swatch alone carries the hue (ported from the
// mockup's `.legend span[data-sid]` spotlight affordance).
// ─────────────────────────────────────────────────────────────────────────────
export default function Legend({ items = [], onSpotlight }) {
  ensureChartStyles()
  if (!items || items.length < 2) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', marginBottom: 8 }}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className="fr-legend-btn"
          onMouseEnter={() => onSpotlight?.(it.id)}
          onMouseLeave={() => onSpotlight?.(null)}
          onFocus={() => onSpotlight?.(it.id)}
          onBlur={() => onSpotlight?.(null)}
          onClick={() => onSpotlight?.(it.id)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12.5,
            fontWeight: 600,
            color: CHROME.ink,
          }}
        >
          <i style={{ width: 10, height: 10, borderRadius: '50%', background: it.color, flexShrink: 0 }} />
          {it.label}
        </button>
      ))}
    </div>
  )
}

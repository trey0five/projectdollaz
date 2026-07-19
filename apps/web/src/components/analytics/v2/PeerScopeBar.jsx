// ─────────────────────────────────────────────────────────────────────────────
// PeerScopeBar — the peers-scope control row. Unlike the compare multi-select, it
// picks ONE focus school to benchmark + toggles the peer-matching DIMENSIONS
// (Size · County · District · Type · Grade). The active dimensions drive the
// backend relaxation ladder; turning more on narrows the group, turning them off
// broadens it. Focus-chip colour follows the roster index (schoolColor) so it
// matches the charts' per-school hue. Mirrors AnalyticsScopeBar's chip idiom.
// ─────────────────────────────────────────────────────────────────────────────
import { Ruler, MapPin, Landmark, Layers, GraduationCap } from 'lucide-react'
import { schoolColor } from './chartPalette.js'
import { PEER_DIMS } from './useAnalyticsNav.js'

const ACTION_HUE = '#2563EB'

const DIM_META = {
  size: { Icon: Ruler, label: 'Size' },
  county: { Icon: MapPin, label: 'County' },
  district: { Icon: Landmark, label: 'District' },
  type: { Icon: Layers, label: 'Type' },
  grade: { Icon: GraduationCap, label: 'Grade' },
}

export default function PeerScopeBar({ roster, focus, onFocus, dims = [], onDims }) {
  const rosterIndex = (id) => roster.findIndex((r) => r.id === id)

  const toggleDim = (key) => {
    const on = dims.includes(key)
    const next = on ? dims.filter((d) => d !== key) : [...dims, key]
    // Keep at least one dimension so the group never collapses to "all schools"
    // by accident — an empty selection is meaningless for peer matching.
    onDims(next.length ? next : dims)
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-2.5 sm:px-4">
      {/* Focus-school picker (single-select) */}
      {roster.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Benchmark</span>
          <div className="av2-chiprow">
            {roster.map((r) => {
              const idx = rosterIndex(r.id)
              const color = schoolColor(idx < 0 ? 0 : idx)
              const on = focus === r.id
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onFocus(r.id)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                    on
                      ? 'border-navy/30 bg-white text-navy shadow-card'
                      : 'border-rule/60 text-muted hover:border-navy/30 hover:text-navy'
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? color : '#C4CCDF' }} />
                  {r.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Dimension toggles (multi) — how peers are matched */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Match on</span>
        <div className="av2-chiprow">
          {PEER_DIMS.map((key) => {
            const { Icon, label } = DIM_META[key]
            const on = dims.includes(key)
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleDim(key)}
                style={on ? { background: ACTION_HUE, borderColor: ACTION_HUE } : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                  on ? 'text-white' : 'border-rule/60 text-muted hover:border-navy/30 hover:text-navy'
                }`}
              >
                <Icon size={14} aria-hidden />
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

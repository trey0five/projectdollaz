// ─────────────────────────────────────────────────────────────────────────────
// PeerScopeBar — the peers-scope control row. Unlike the compare multi-select, it
// picks ONE focus school to benchmark + toggles the peer-matching DIMENSIONS
// (Size · County · District · Type · Grade). The active dimensions drive the
// backend relaxation ladder; turning more on narrows the group, turning them off
// broadens it. Premium UI P3: a second `Toolbar` row — a `select` for the focus
// school (swatch follows the roster index, matching the charts) and a segmented
// multi-toggle for the dimensions. No chips.
// ─────────────────────────────────────────────────────────────────────────────
import { Ruler, MapPin, Landmark, Layers, GraduationCap } from 'lucide-react'
import { schoolColor } from './chartPalette.js'
import { PEER_DIMS } from './useAnalyticsNav.js'
import { Toolbar } from '../../ui/surface/index.js'

const DIM_META = {
  size: { Icon: Ruler, label: 'Size' },
  county: { Icon: MapPin, label: 'County' },
  district: { Icon: Landmark, label: 'District' },
  type: { Icon: Layers, label: 'Type' },
  grade: { Icon: GraduationCap, label: 'Grade' },
}

export default function PeerScopeBar({ roster, focus, onFocus, dims = [], onDims }) {
  const rosterIndex = (id) => roster.findIndex((r) => r.id === id)
  const idx = rosterIndex(focus)

  const toggleDim = (key) => {
    const on = dims.includes(key)
    const next = on ? dims.filter((d) => d !== key) : [...dims, key]
    // Keep at least one dimension so the group never collapses to "all schools"
    // by accident — an empty selection is meaningless for peer matching.
    onDims(next.length ? next : dims)
  }

  return (
    <Toolbar aria-label="Peer matching">
      {roster.length > 0 && (
        <label className="flex items-center gap-2">
          <span className="toolbar-label">Benchmark</span>
          <span className="swatch" style={{ background: schoolColor(idx < 0 ? 0 : idx) }} aria-hidden="true" />
          <select className="sel" value={focus ?? ''} onChange={(e) => onFocus(e.target.value)} aria-label="School to benchmark">
            {roster.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <span className="toolbar-label ml-2">Match on</span>
      <div className="seg" role="group" aria-label="Match on">
        {PEER_DIMS.map((key) => {
          const { Icon, label } = DIM_META[key]
          const on = dims.includes(key)
          return (
            <button key={key} type="button" aria-pressed={on} onClick={() => toggleDim(key)} className="seg-btn">
              <Icon size={13} aria-hidden="true" />
              {label}
            </button>
          )
        })}
      </div>
    </Toolbar>
  )
}

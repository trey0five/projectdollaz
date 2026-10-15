// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsScopeBar — the persistent SCOPE axis (whose numbers): My school ·
// Compare · All schools · Peers, plus the school picker and the school-year
// picker. Premium UI P3 (plan sketch 4): a `Toolbar` on the ground — a
// segmented control for the scope (role=tablist, roving tabindex, arrow keys),
// a `select` for the school in School scope, a "Compare" POPOVER with
// checkboxes in Compare scope (the 17-chip wall is gone), the FY `select` on
// the right. The entity swatch beside a school name follows the roster INDEX
// (schoolColor) so it matches the charts' per-school hue and never shifts on
// re-sort. A single-school org hides Compare + All schools (handled by the
// parent passing only ['school']). The URL model (useAnalyticsNav) is untouched.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { School, ArrowLeftRight, LayoutGrid, Users, ChevronDown } from 'lucide-react'
import { schoolColor } from './chartPalette.js'
import PeerScopeBar from './PeerScopeBar.jsx'
import { Toolbar } from '../../ui/surface/index.js'

const SCOPE_META = {
  school: { Icon: School, label: 'My school' },
  compare: { Icon: ArrowLeftRight, label: 'Compare' },
  org: { Icon: LayoutGrid, label: 'All schools' },
  peers: { Icon: Users, label: 'Peers' },
}

/** The Compare picker: a button that opens a group of checkboxes (min 1 school).
    Escape / outside click closes it and hands focus back to the trigger. */
function ComparePicker({ roster, selectedSchools, onToggleSchool, rosterIndex }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const btnRef = useRef(null)
  const close = (refocus) => {
    setOpen(false)
    if (refocus) btnRef.current?.focus()
  }
  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const n = selectedSchools.length
  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        type="button"
        className="btn btn-secondary btn-sm"
        aria-expanded={open}
        aria-controls="av2-compare-pop"
        onClick={() => (open ? close(true) : setOpen(true))}
      >
        Compare · {n} {n === 1 ? 'school' : 'schools'}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open ? (
        <div id="av2-compare-pop" className="pop" role="group" aria-label="Schools to compare">
          {roster.map((r) => {
            const idx = rosterIndex(r.id)
            const on = selectedSchools.includes(r.id)
            return (
              <label key={r.id} className="pop-row">
                <input type="checkbox" checked={on} onChange={() => onToggleSchool(r.id)} />
                <span className="swatch" style={{ background: schoolColor(idx < 0 ? 0 : idx) }} aria-hidden="true" />
                <span className="min-w-0 truncate">{r.name}</span>
              </label>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export default function AnalyticsScopeBar({
  scopes,
  scope,
  onScope,
  roster,
  school,
  onSchool,
  selectedSchools,
  onToggleSchool,
  fyOptions,
  fiscalYearStart,
  onFy,
  focus,
  onFocus,
  dims,
  onDims,
  // Aurora: the school year moves to the band's period switch, so the host
  // can drop it from this toolbar.
  hideFy = false,
}) {
  const rosterIndex = (id) => roster.findIndex((r) => r.id === id)
  const tabRefs = useRef([])

  // Roving-tabindex arrow-key nav across the scope tabs (mirrors AnalyticsSubTabs).
  const onScopeKeyDown = (e, i) => {
    let next = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % scopes.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + scopes.length) % scopes.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = scopes.length - 1
    if (next == null) return
    e.preventDefault()
    onScope(scopes[next])
    tabRefs.current[next]?.focus()
  }

  const activeIdx = rosterIndex(school)

  return (
    <div className="mb-2">
      <Toolbar
        aria-label="Whose numbers"
        aside={
          !hideFy && fyOptions.length > 0 ? (
            <label className="flex items-center gap-2">
              <span className="toolbar-label hidden sm:inline">School year</span>
              <select className="sel" value={fiscalYearStart ?? ''} onChange={(e) => onFy(e.target.value || null)} aria-label="School year">
                {fyOptions.map((o) => (
                  <option key={o.label} value={o.start}>
                    FY{o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null
        }
      >
        <div role="tablist" aria-label="Scope" className="seg">
          {scopes.map((key, i) => {
            const active = key === scope
            const { Icon, label } = SCOPE_META[key]
            return (
              <button
                key={key}
                ref={(el) => (tabRefs.current[i] = el)}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="av2-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => onScope(key)}
                onKeyDown={(e) => onScopeKeyDown(e, i)}
                className="seg-btn"
              >
                <Icon size={13} aria-hidden="true" />
                <span>{label}</span>
              </button>
            )
          })}
        </div>

        {/* School scope: ONE select. Compare: the popover picker. Org + peers: none. */}
        {scope === 'school' && roster.length > 0 ? (
          <label className="flex items-center gap-2">
            <span className="swatch" style={{ background: schoolColor(activeIdx < 0 ? 0 : activeIdx) }} aria-hidden="true" />
            <select className="sel" value={school ?? ''} onChange={(e) => onSchool(e.target.value)} aria-label="School">
              {roster.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {scope === 'compare' && roster.length > 0 ? (
          <ComparePicker roster={roster} selectedSchools={selectedSchools} onToggleSchool={onToggleSchool} rosterIndex={rosterIndex} />
        ) : null}
      </Toolbar>

      {/* Peers scope: the focus-school picker + dimension toggles. */}
      {scope === 'peers' && (
        <PeerScopeBar roster={roster} focus={focus} onFocus={onFocus} dims={dims} onDims={onDims} />
      )}
    </div>
  )
}

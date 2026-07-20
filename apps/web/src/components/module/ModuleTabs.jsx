// ─────────────────────────────────────────────────────────────────────────────
// ModuleTabs — the ui.v2 module-page chrome. PURE chrome: it knows nothing about
// a module's data; each module page supplies the panel nodes (overview / addData /
// records / reports).
//
// NAV MODEL: the module's sections (Overview · Add data · Records · Reports) are
// now rows in the LEFT SIDEBAR (AppShell renders a module section while you're on
// the module's route) — the old in-page tab bar and its module-label row are
// retired. This component keeps only the "Back to dashboard" pill + the active
// panel, still driven by the same `?tab=` URL model so sidebar links, deep links,
// back button and reload all resolve identically.
//
// URL MODEL: the active section is the `?tab=` query param (overview | add |
// records | reports; absent/unknown → overview). Overview clears the param so a
// tile's bare route and Overview share one canonical URL.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { moduleAccentVars, moduleTabs } from './moduleAnatomy.js'
import { BACK_PILL, BackPillBody } from '../ui/BackLink.jsx'

/**
 * The active-tab hook: reads/writes `?tab=`, validated against the module's present
 * tabs (unknown → overview). Overview clears the param (so a tile's bare route and
 * the Overview tab share one canonical URL); every write pushes history (back button).
 */
export function useModuleTab(tabs) {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const active = tabs.includes(raw) ? raw : 'overview'
  const setTab = useCallback(
    (key) => {
      const next = new URLSearchParams(params)
      if (key === 'overview') next.delete('tab')
      else next.set('tab', key)
      // `add` deep-link option (?add=…) belongs to the Add-data tab; leaving another
      // tab clears it so it can't leak onto an unrelated panel.
      if (key !== 'add') next.delete('add')
      setParams(next)
    },
    [params, setParams],
  )
  return [active, setTab]
}

/**
 * ModuleAccent — wraps a module page's WHOLE v2 arm (ModuleTabs + its sibling
 * modals) in the module's accent-var override. `display: contents` creates no box
 * (zero layout impact) while the custom properties still inherit, so even modals
 * mounted as fragment-siblings of ModuleTabs pick up the module hue.
 */
export function ModuleAccent({ moduleKey, children }) {
  return <div style={{ display: 'contents', ...moduleAccentVars(moduleKey) }}>{children}</div>
}

export default function ModuleTabs({ moduleKey, overview, addData, records, reports }) {
  const tabs = moduleTabs(moduleKey)
  const [active] = useModuleTab(tabs)

  const panels = { overview, add: addData, records, reports }
  const panel = panels[active] ?? overview

  return (
    // The accent-var override re-themes EVERY v2 accent inside this page (CTAs,
    // underlines, KPI dots, focus rings, the record modal) to the module hue —
    // one scoped style, no per-component prop drilling.
    <div className="min-h-screen bg-section" style={moduleAccentVars(moduleKey)}>
      {/* Back to the tile dashboard. The module's section nav (Overview · Add
          data · Records · Reports) lives in the LEFT SIDEBAR now. */}
      <div className="mx-auto max-w-page px-4 pt-4 sm:px-10">
        <Link to="/app" className={BACK_PILL}>
          <BackPillBody label="Back to dashboard" />
        </Link>
      </div>

      {/* ── Active panel (each panel brings its own max-width container) ───────── */}
      <div>{panel}</div>
    </div>
  )
}

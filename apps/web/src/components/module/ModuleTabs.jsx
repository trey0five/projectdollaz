// ─────────────────────────────────────────────────────────────────────────────
// ModuleTabs — the ui.v2 module-page chrome. PURE chrome: it knows nothing about
// a module's data; each module page supplies the panel nodes (overview / addData /
// records / analytics / reports).
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
import { useSearchParams } from 'react-router-dom'
import { moduleAccentVars, moduleLabel, moduleTabLabel, moduleTabs } from './moduleAnatomy.js'
import ModuleBreadcrumb from './ModuleBreadcrumb.jsx'

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
    (key, view) => {
      const next = new URLSearchParams(params)
      if (key === 'overview') next.delete('tab')
      else next.set('tab', key)
      // `add` deep-link option (?add=…) belongs to the Add-data tab; leaving another
      // tab clears it so it can't leak onto an unrelated panel.
      if (key !== 'add') next.delete('add')
      // `view` is the analysis sub-view (Standing, Cohorts…). It travels WITH the
      // tab change so an overview card can open a named view in one navigation
      // rather than landing on the default and re-routing. Always rewritten, so
      // a stale view from a previous visit cannot survive into a new tab.
      next.delete('view')
      if (view && view !== 'standing') next.set('view', view)
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

export default function ModuleTabs({ moduleKey, overview, addData, records, analytics, reports, trail = [] }) {
  const tabs = moduleTabs(moduleKey)
  const [active, setTab] = useModuleTab(tabs)

  const panels = { overview, add: addData, records, analytics, reports }
  const panel = panels[active] ?? overview

  // ONE control, not two. A "Back to overview" pill beside "Back to dashboard"
  // made the reader compare two identically-shaped affordances to work out
  // which moved them one step and which left the module — and neither said
  // where they currently were. The trail says it: Dashboard › Academics ›
  // Analytics › Cohorts, with every ancestor a direct jump and the arrow bound
  // to the immediate parent.
  //
  // `trail` lets a module append its own sub-position (the analysis view, say),
  // which no generic chrome could know about.
  const crumbs = [
    { label: 'Dashboard', to: '/app' },
    { label: moduleLabel(moduleKey), onClick: active === 'overview' ? undefined : () => setTab('overview') },
    // Given a handler even when it is the CURRENT page: once a module appends a
    // sub-view, this crumb stops being last and becomes both a jump target and
    // the back arrow's destination. Without one, the arrow rendered as a live
    // control that did nothing. The last crumb is drawn inert regardless, so
    // the handler is simply unused while this is where you are.
    active !== 'overview' ? { label: moduleTabLabel(moduleKey, active), onClick: () => setTab(active) } : null,
    ...trail.map((t) => (typeof t === 'string' ? { label: t } : t)),
  ].filter(Boolean)

  return (
    // The accent-var override re-themes EVERY v2 accent inside this page (CTAs,
    // underlines, KPI dots, focus rings, the record modal) to the module hue —
    // one scoped style, no per-component prop drilling.
    //
    // PREMIUM UI P2: no `bg-section` wrapper — the page sits on the shell's
    // ground; the trail is the header's eyebrow grammar (ModuleBreadcrumb).
    <div className="min-h-screen" style={moduleAccentVars(moduleKey)}>
      {/* Back to the tile dashboard. The module's section nav (Overview · Add
          data · Records · Reports) lives in the LEFT SIDEBAR now. */}
      <div className="mx-auto max-w-page px-4 pt-4 sm:px-10">
        <ModuleBreadcrumb crumbs={crumbs} />
      </div>

      {/* ── Active panel (each panel brings its own max-width container) ───────── */}
      <div>{panel}</div>
    </div>
  )
}

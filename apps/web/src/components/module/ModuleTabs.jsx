// ─────────────────────────────────────────────────────────────────────────────
// ModuleTabs — the ui.v2 four-tab anatomy chrome (Overview · Add data · Records ·
// Reports). PURE chrome: it knows nothing about a module's data. It renders a slim
// module-hued tab bar + the active panel; each module page supplies the panel
// nodes (overview / addData / records / reports). Which tabs appear comes from
// moduleAnatomy — a module without a `records` panel simply doesn't declare it.
//
// URL MODEL: the active tab is the `?tab=` query param (overview | add | records |
// reports; absent/unknown → overview). Zero new routes — a bare module route
// (from a home tile) resolves to Overview; deep-links + the back button + reload
// all work because the tab lives in the URL. A sub-register selection inside the
// Records panel stays component state (NOT the URL) so Penny's page keys stay
// stable. Flag-off never mounts this (each page's v1 arm never reads `?tab`).
//
// A11y: role=tablist/tab/tabpanel, roving tabindex + arrow-key nav, aria-selected,
// :focus-visible ring. Reduced-motion drops the sliding underline (static bar).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, LayoutDashboard, Upload, Table2, FileBarChart2 } from 'lucide-react'
import { moduleAccentVars, moduleAnatomy, moduleHue, moduleLabel, moduleTabs, TAB_LABEL } from './moduleAnatomy.js'

// The verb-icon for each tab (recognizable at a glance; folded in from the retired
// ModuleFlowGuide so the tab bar ITSELF now draws the flow).
const TAB_ICON = { overview: LayoutDashboard, add: Upload, records: Table2, reports: FileBarChart2 }

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
  const anatomy = moduleAnatomy(moduleKey)
  const tabs = moduleTabs(moduleKey)
  const [active, setTab] = useModuleTab(tabs)
  const reduce = useReducedMotion()
  const hue = moduleHue(moduleKey)
  const label = moduleLabel(moduleKey)
  const Icon = anatomy?.Icon
  const tabRefs = useRef([])

  const panels = { overview, add: addData, records, reports }
  const panel = panels[active] ?? overview

  // Roving arrow-key navigation across the tab bar.
  const onKeyDown = (e, i) => {
    let next = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    if (next == null) return
    e.preventDefault()
    setTab(tabs[next])
    tabRefs.current[next]?.focus()
  }

  return (
    // The accent-var override re-themes EVERY v2 accent inside this page (CTAs,
    // underlines, KPI dots, focus rings, the record modal) to the module hue —
    // one scoped style, no per-component prop drilling.
    <div className="min-h-screen bg-section" style={moduleAccentVars(moduleKey)}>
      {/* Back to the tile dashboard — the sidebar is retired under v2, so this is
          the explicit way home from every module page. */}
      <div className="mx-auto max-w-page px-4 pt-4 sm:px-10">
        <Link
          to="/app"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted transition-colors hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
        >
          <ArrowLeft size={14} /> Back to dashboard
        </Link>
      </div>

      {/* ── Section tab bar: plain navigation between the module's sections
          (Overview · Add data · Records · Reports). These are destinations you
          move between freely — NOT a 1-2-3 wizard — so no step numbers or arrows.
          The genuine wizard (Choose → Add → Done) lives INSIDE the Add-data panel.
          The active tab fills with the module hue via a gliding pill (layoutId). ── */}
      <div className="border-b border-rule/60 bg-cream/60">
        <div className="mx-auto flex max-w-page items-center gap-3 px-4 py-2.5 sm:gap-4 sm:px-10">
          <div className="flex shrink-0 items-center gap-2">
            {Icon ? (
              <span
                className="flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-sm"
                style={{ backgroundColor: hue }}
              >
                <Icon size={17} />
              </span>
            ) : null}
            <span className="hidden text-[14px] font-bold text-navy md:inline">{label}</span>
            <span aria-hidden className="mx-1 hidden h-6 w-px bg-rule sm:block" />
          </div>

          <div
            role="tablist"
            aria-label={`${label} sections`}
            className="flex flex-1 items-center gap-1.5 overflow-x-auto py-0.5 sm:gap-2"
          >
            {tabs.map((key, i) => {
              const isActive = key === active
              const TabIcon = TAB_ICON[key] ?? LayoutDashboard
              return (
                <motion.button
                  key={key}
                  ref={(el) => (tabRefs.current[i] = el)}
                  role="tab"
                  id={`moduletab-${moduleKey}-${key}`}
                  aria-selected={isActive}
                  aria-controls={`modulepanel-${moduleKey}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setTab(key)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  whileHover={reduce || isActive ? undefined : { y: -2 }}
                  whileTap={reduce ? undefined : { scale: 0.97 }}
                  className={`relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[13.5px] font-bold outline-none transition-colors focus-visible:ring-2 sm:px-3.5 ${
                    isActive ? 'text-white' : 'text-navy'
                  }`}
                  style={{ '--tw-ring-color': hue }}
                >
                  {/* Gliding active pill (static under reduced motion). */}
                  {isActive &&
                    (reduce ? (
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-full"
                        style={{ background: hue, boxShadow: `0 6px 18px -6px ${hue}cc` }}
                      />
                    ) : (
                      <motion.span
                        aria-hidden
                        layoutId={`moduletab-pill-${moduleKey}`}
                        className="absolute inset-0 rounded-full"
                        style={{ background: hue, boxShadow: `0 6px 18px -6px ${hue}cc` }}
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    ))}
                  <span
                    className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg shadow-sm"
                    style={
                      isActive
                        ? { background: 'rgba(255,255,255,0.22)', color: '#fff' }
                        : { background: hue, color: '#fff' }
                    }
                  >
                    <TabIcon size={15} />
                  </span>
                  <span className="relative">{TAB_LABEL[key]}</span>
                </motion.button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Active panel (each panel brings its own max-width container) ───────── */}
      <div role="tabpanel" id={`modulepanel-${moduleKey}`} aria-labelledby={`moduletab-${moduleKey}-${active}`}>
        {panel}
      </div>
    </div>
  )
}

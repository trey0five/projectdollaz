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
import { ArrowLeft } from 'lucide-react'
import { moduleAnatomy, moduleHue, moduleLabel, moduleTabs, TAB_LABEL } from './moduleAnatomy.js'
import ModuleFlowGuide from './ModuleFlowGuide.jsx'

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
    <div className="min-h-screen bg-section">
      {/* Back to the tile dashboard — the sidebar is retired under v2, so this is
          the explicit way home from every module page. */}
      <div className="mx-auto max-w-[1180px] px-4 pt-4 sm:px-10">
        <Link
          to="/app"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted transition-colors hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
        >
          <ArrowLeft size={14} /> Back to dashboard
        </Link>
      </div>

      {/* ── Module tab bar (hue-accented, sticky under the top strip) ─────────── */}
      <div className="border-b border-rule/60 bg-cream/60">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 sm:gap-5 sm:px-10">
          <div className="flex shrink-0 items-center gap-2 py-3">
            {Icon ? (
              <span
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-sm"
                style={{ backgroundColor: hue }}
              >
                <Icon size={16} />
              </span>
            ) : null}
            <span className="hidden text-[13px] font-semibold text-navy sm:inline">{label}</span>
          </div>
          <div
            role="tablist"
            aria-label={`${label} sections`}
            className="-mb-px flex flex-1 gap-1 overflow-x-auto"
          >
            {tabs.map((key, i) => {
              const isActive = key === active
              return (
                <button
                  key={key}
                  ref={(el) => (tabRefs.current[i] = el)}
                  role="tab"
                  id={`moduletab-${moduleKey}-${key}`}
                  aria-selected={isActive}
                  aria-controls={`modulepanel-${moduleKey}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setTab(key)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className={`relative whitespace-nowrap rounded-t-md px-3 py-3 text-[14px] font-semibold outline-none transition-colors focus-visible:ring-2 ${
                    isActive ? 'text-navy' : 'text-muted hover:text-navy'
                  }`}
                  style={{ '--tw-ring-color': hue }}
                >
                  {TAB_LABEL[key]}
                  {isActive ? (
                    reduce ? (
                      <span
                        className="absolute inset-x-2 -bottom-px h-[3px] rounded-full"
                        style={{ backgroundColor: hue }}
                      />
                    ) : (
                      <motion.span
                        layoutId={`moduletab-underline-${moduleKey}`}
                        className="absolute inset-x-2 -bottom-px h-[3px] rounded-full"
                        style={{ backgroundColor: hue }}
                      />
                    )
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* On Overview, a wordless visual FLOW guide (Add data → Records → Reports)
          that both teaches and operates — click a step to jump to that tab. */}
      {active === 'overview' && <ModuleFlowGuide moduleKey={moduleKey} tabs={tabs} onStep={setTab} />}

      {/* ── Active panel (each panel brings its own max-width container) ───────── */}
      <div role="tabpanel" id={`modulepanel-${moduleKey}`} aria-labelledby={`moduletab-${moduleKey}-${active}`}>
        {panel}
      </div>
    </div>
  )
}

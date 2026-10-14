// ─────────────────────────────────────────────────────────────────────────────
// ModuleRegister — the ui.v2 RECORDS panel. A thin, presentational full-width
// wrapper around a module's ALREADY-EXISTING register: the same sub-tab bar +
// `+ New` button + active register table that DomainCommandCenter shows as a
// "glance", here given the whole width with no KPI row / attention rail. It reuses
// the parent's existing `tabs` / `activeTab` / `onTabChange` / `onNew` /
// `registerTable` verbatim — NO markup rewrite of any table, NO new API. The
// register sub-tab selection stays the parent's component state (not the URL).
//
// DomainCommandCenter is NOT modified; this simply re-presents the register the
// parent already computed. Hue accents the active sub-tab's 2px rule.
// PREMIUM UI P4: no `.card-soft` wrapper — the register sits on the ground
// (the table primitive carries its own discipline); `+ New` is a flat Button.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Plus } from 'lucide-react'
import ModuleOverviewLink from './ModuleOverviewLink.jsx'
import { Button } from '../ui/surface/index.js'

export default function ModuleRegister({
  moduleKey,
  hue = '#2563EB',
  tabs = [],
  activeTab,
  onTabChange,
  onNew,
  registerTable,
}) {
  const reduce = useReducedMotion()
  const multi = tabs.length > 1

  return (
    <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      {/* Escape hatch home — the sidebar has an Overview row, but a register
          reached from the on-page Records button needs its own way back. */}
      <ModuleOverviewLink module={moduleKey} className="mb-3" />
      <div className="flex min-w-0 flex-col">
        {(multi || onNew) && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-hair">
            <div className="flex gap-1">
              {multi
                ? tabs.map((t) => {
                    const active = t.key === activeTab
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => onTabChange?.(t.key)}
                        className={`relative px-3 py-2 text-small font-semibold outline-none transition-colors focus-visible:ring-2 ${
                          active ? 'text-ink' : 'text-ink2 hover:text-ink'
                        }`}
                        style={{ '--tw-ring-color': hue }}
                      >
                        {t.label}
                        {active ? (
                          reduce ? (
                            <span
                              className="absolute inset-x-2 -bottom-[1px] h-[2px]"
                              style={{ backgroundColor: hue }}
                            />
                          ) : (
                            <motion.span
                              layoutId={`moduleregister-underline-${moduleKey}`}
                              className="absolute inset-x-2 -bottom-[1px] h-[2px]"
                              style={{ backgroundColor: hue }}
                            />
                          )
                        ) : null}
                      </button>
                    )
                  })
                : null}
            </div>
            {onNew ? (
              <Button variant="primary" size="sm" onClick={onNew} icon={<Plus size={14} />} className="mb-2">
                New
              </Button>
            ) : null}
          </div>
        )}
        {registerTable}
      </div>
    </div>
  )
}

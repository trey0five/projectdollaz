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
// parent already computed. Hue accents the active sub-tab underline + the New pill.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Plus } from 'lucide-react'

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
      <div className="card-soft flex min-w-0 flex-col p-4 sm:p-5">
        {(multi || onNew) && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1">
              {multi
                ? tabs.map((t) => {
                    const active = t.key === activeTab
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => onTabChange?.(t.key)}
                        className={`relative px-3 py-2 text-[14px] font-semibold outline-none transition-colors focus-visible:ring-2 ${
                          active ? 'text-navy' : 'text-muted hover:text-navy'
                        }`}
                        style={{ '--tw-ring-color': hue }}
                      >
                        {t.label}
                        {active ? (
                          reduce ? (
                            <span
                              className="absolute inset-x-2 -bottom-[1px] h-[3px] rounded-full"
                              style={{ backgroundColor: hue }}
                            />
                          ) : (
                            <motion.span
                              layoutId={`moduleregister-underline-${moduleKey}`}
                              className="absolute inset-x-2 -bottom-[1px] h-[3px] rounded-full"
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
              <button
                type="button"
                onClick={onNew}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-105"
                style={{ backgroundColor: hue }}
              >
                <Plus size={15} /> New
              </button>
            ) : null}
          </div>
        )}
        {registerTable}
      </div>
    </div>
  )
}

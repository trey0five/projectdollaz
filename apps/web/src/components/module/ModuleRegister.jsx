// ─────────────────────────────────────────────────────────────────────────────
// ModuleRegister — the ui.v2 RECORDS panel. A thin, presentational full-width
// wrapper around a module's ALREADY-EXISTING register: the same sub-tab bar +
// `+ New` button + active register table that DomainCommandCenter shows as a
// "glance", here given the whole width with no band / attention rail. It reuses
// the parent's existing `tabs` / `activeTab` / `onTabChange` / `onNew` /
// `registerTable` verbatim — NO markup rewrite of any table, NO new API. The
// register sub-tab selection stays the parent's component state (not the URL).
//
// AURORA: an `AuroraSection` heading strip ("<Module> records", folder
// medallion, a count of the sub-registers, `+ New` on the right) over hue pill
// tabs and the table in a white card. `hue` (the module's locked hue) themes
// the strip, the tabs and the button.
// ─────────────────────────────────────────────────────────────────────────────
import { FolderOpen, Plus } from 'lucide-react'
import ModuleOverviewLink from './ModuleOverviewLink.jsx'
import { RegisterNewContext } from './RegisterEmpty.jsx'
import { auroraVarsFromHue, moduleLabel } from './moduleAnatomy.js'
import { AuroraSection, AuroraLightButton } from '../ui/aurora/index.js'

export default function ModuleRegister({
  moduleKey,
  hue = '#2563EB',
  tabs = [],
  activeTab,
  onTabChange,
  onNew,
  registerTable,
}) {
  const multi = tabs.length > 1
  const label = moduleLabel(moduleKey)
  const activeLabel = tabs.find((t) => t.key === activeTab)?.label ?? tabs[0]?.label ?? null

  return (
    <div className="au-scope mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8" style={auroraVarsFromHue(hue)}>
      {/* Escape hatch home — the sidebar has an Overview row, but a register
          reached from the on-page Records button needs its own way back. */}
      <ModuleOverviewLink module={moduleKey} className="mb-1" />
      <AuroraSection
        first
        icon={FolderOpen}
        title={typeof label === 'string' ? `${label} records` : 'Records'}
        subtitle={multi ? 'Pick a list, then open any row.' : activeLabel}
        count={multi ? `${tabs.length} lists` : null}
        aside={
          onNew ? (
            <AuroraLightButton size="sm" onClick={onNew} icon={<Plus size={15} aria-hidden="true" />}>
              New
            </AuroraLightButton>
          ) : null
        }
      >
        {multi ? (
          <div role="tablist" aria-label={`${label} records`} className="au-tabs">
            {tabs.map((t) => {
              const active = t.key === activeTab
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onTabChange?.(t.key)}
                  className="au-tab"
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        ) : null}
        <div className="au-card au-card-flat au-register min-w-0">
          {/* An empty table's RegisterEmpty button IS this register's + New. */}
          <RegisterNewContext.Provider value={onNew ?? null}>{registerTable}</RegisterNewContext.Provider>
        </div>
      </AuroraSection>
    </div>
  )
}

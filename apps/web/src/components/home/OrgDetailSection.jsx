// ─────────────────────────────────────────────────────────────────────────────
// OrgDetailSection — the consolidated ORGANIZATION VIEW, inline on the org page.
//
// This content has now lived three lives: inlined under the tile grid, then
// hidden behind the briefing band's "Organization view" popup, and now inline
// again UNDER the schools register — visible on arrival, no click required. The
// popup round taught the lesson: a consolidated view behind a button is a view
// most people never see, and the org page's whole job is this consolidation.
//
// PREMIUM UI P2: no wrapper card. The section is a `Section` label rule with
// the fiscal-year select as its aside, a segmented `Toolbar` for the views
// (Organization KPIs · Modules · Needs attention — the Schools table moved up
// to the register above, so it is no longer repeated here), and the active
// view directly on the ground.
//
// Presentational: OrgTiles owns all the data hooks and passes everything down.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Gauge, AlertTriangle, Blocks } from 'lucide-react'
import { Section, Toolbar } from '../ui/surface/index.js'
import OrgKpiStrip from '../budget/OrgKpiStrip.jsx'
import OrgBriefing from '../budget/OrgBriefing.jsx'
import OrgModulesMatrix from './OrgModulesMatrix.jsx'

const TABS = [
  { key: 'kpis', label: 'Organization KPIs', Icon: Gauge },
  { key: 'modules', label: 'Modules', Icon: Blocks },
  { key: 'attention', label: 'Needs attention', Icon: AlertTriangle },
]

export default function OrgDetailSection({
  orgName,
  orgSchoolCount,
  fy,
  periods = [],
  selectedPeriodId,
  onSelectPeriod,
  metrics,
  metricsLoading,
  metricsError,
  briefing,
  briefingLoading,
  briefingError,
  lens,
  callerRole,
  availableLenses,
  onLensChange,
}) {
  const [tab, setTab] = useState('kpis')
  const attentionTotal = briefing?.summary?.total ?? 0

  return (
    <Section
      label={`${orgName || 'Organization'} · consolidated`}
      aria-label="Organization view"
      aside={
        <>
          <span>
            Rolled up across {orgSchoolCount} schools{fy ? ` · ${fy}` : ''}
          </span>
          {periods.length > 0 && (
            <label className="inline-flex items-center gap-2 text-micro font-semibold uppercase text-ink2">
              Fiscal year
              <select
                value={selectedPeriodId ?? ''}
                onChange={(e) => onSelectPeriod?.(e.target.value)}
                className="h-8 rounded-sm border border-hair/30 bg-white px-2 text-small font-medium normal-case tracking-normal text-ink outline-none focus-visible:ring-2 focus-visible:ring-navy-soft/40"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label || p.periodEndDate || p.id}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      }
    >
      {/* ── View switch: a segmented control on the ground ─────────────────── */}
      <Toolbar role="tablist" aria-label="Organization view sections" className="mb-5">
        {TABS.map(({ key, label, Icon }) => {
          const active = key === tab
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={`relative inline-flex h-9 items-center gap-2 rounded-md px-3 text-small font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-navy-soft/40 ${
                active ? 'bg-white text-ink shadow-panel ring-1 ring-hair' : 'text-ink2 hover:text-ink'
              }`}
            >
              <Icon size={14} aria-hidden="true" className={active ? 'text-navy-soft' : undefined} />
              <span>{label}</span>
              {key === 'attention' && attentionTotal > 0 ? (
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-sm bg-risk/10 px-1.5 text-micro font-bold tabular-nums text-risk">
                  {attentionTotal}
                </span>
              ) : null}
              {active ? <span aria-hidden="true" className="absolute inset-x-2 -bottom-[5px] h-[2px] bg-navy-soft" /> : null}
            </button>
          )
        })}
      </Toolbar>

      {/* ── Active section ────────────────────────────────────────────────────── */}
      <div>
        {tab === 'kpis' && <OrgKpiStrip metrics={metrics} loading={metricsLoading} error={metricsError} />}
        {tab === 'modules' && <OrgModulesMatrix schools={briefing?.schools || []} />}
        {tab === 'attention' && (
          <OrgBriefing
            briefing={briefing}
            loading={briefingLoading}
            error={briefingError}
            lens={lens}
            callerRole={callerRole}
            availableLenses={availableLenses}
            onLensChange={onLensChange}
          />
        )}
      </div>
    </Section>
  )
}

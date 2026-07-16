// ─────────────────────────────────────────────────────────────────────────────
// OrgDetailModal — the consolidated ORGANIZATION VIEW as a popup. The org home
// used to inline this whole dashboard (header + KPI strip + schools table +
// triage) under the tile grid; it now opens from the briefing band's
// "Organization view" action and is TABBED so each section reads on its own:
//   Organization KPIs · Schools · Needs attention
// Presentational: OrgTiles owns all the data hooks and passes everything down.
// Tabs are module-scope (no in-render component defs); a11y tablist + arrow keys
// kept simple (roving via click; the three tabs are also plain buttons).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Layers, Gauge, School, AlertTriangle, Blocks } from 'lucide-react'
import BriefingModal from './BriefingModal.jsx'
import OrgKpiStrip from '../budget/OrgKpiStrip.jsx'
import OrgSchoolsTable from '../budget/OrgSchoolsTable.jsx'
import OrgBriefing from '../budget/OrgBriefing.jsx'
import OrgModulesMatrix from './OrgModulesMatrix.jsx'

const TABS = [
  { key: 'kpis', label: 'Organization KPIs', Icon: Gauge },
  { key: 'schools', label: 'Schools', Icon: School },
  { key: 'modules', label: 'Modules', Icon: Blocks },
  { key: 'attention', label: 'Needs attention', Icon: AlertTriangle },
]

export default function OrgDetailModal({
  open,
  onClose,
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
  const reduce = useReducedMotion()
  const [tab, setTab] = useState('kpis')
  const attentionTotal = briefing?.summary?.total ?? 0

  return (
    <BriefingModal open={open} onClose={onClose} wide ariaLabel="Organization view">
      {/* ── Header: org identity + fiscal-year picker ─────────────────────────── */}
      <div className="flex flex-col gap-3 pr-10 sm:flex-row sm:items-center sm:gap-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow">
          <Layers size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-gold">
            Organization · consolidated
          </p>
          <h2 className="truncate py-0.5 font-serif text-xl font-semibold leading-[1.35] text-navy sm:text-2xl">
            {orgName || 'Organization'}
          </h2>
          <p className="text-[13px] text-muted">
            Rolled up across {orgSchoolCount} schools{fy ? ` · ${fy}` : ''}.
          </p>
        </div>
        {periods.length > 0 && (
          <label className="flex shrink-0 flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            Fiscal year
            <select
              value={selectedPeriodId ?? ''}
              onChange={(e) => onSelectPeriod?.(e.target.value)}
              className="min-h-[40px] rounded-lg border-2 border-hair bg-white px-3 text-[14px] font-medium normal-case tracking-normal text-navy outline-none ring-gold/40 focus-visible:ring-2"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label || p.periodEndDate || p.id}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* ── Section tabs ──────────────────────────────────────────────────────── */}
      <div role="tablist" aria-label="Organization view sections" className="mt-5 flex flex-wrap gap-2">
        {TABS.map(({ key, label, Icon }) => {
          const active = key === tab
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={`relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/60 ${
                active ? 'text-white' : 'text-navy hover:bg-navy/5'
              }`}
            >
              {active &&
                (reduce ? (
                  <span aria-hidden className="absolute inset-0 rounded-full bg-gold-gradient shadow-glow" />
                ) : (
                  <motion.span
                    aria-hidden
                    layoutId="orgdetail-tab-pill"
                    className="absolute inset-0 rounded-full bg-gold-gradient shadow-glow"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ))}
              <Icon size={15} className="relative" aria-hidden />
              <span className="relative">{label}</span>
              {key === 'attention' && attentionTotal > 0 ? (
                <span
                  className={`relative inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11.5px] font-extrabold tabular-nums ${
                    active ? 'bg-white/25 text-white' : 'bg-danger/10 text-danger'
                  }`}
                >
                  {attentionTotal}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* ── Active section ────────────────────────────────────────────────────── */}
      <div className="mt-5">
        {tab === 'kpis' && (
          <OrgKpiStrip metrics={metrics} loading={metricsLoading} error={metricsError} />
        )}
        {tab === 'schools' && <OrgSchoolsTable schools={briefing?.schools || []} />}
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
    </BriefingModal>
  )
}

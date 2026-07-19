// ─────────────────────────────────────────────────────────────────────────────
// OrgHome — the Home surface at ORGANIZATION scope. HomeDashboard renders this
// (instead of the per-school landing) whenever the scope switcher is on "Organization".
//
// It's a thin composition of already-shipped, proven org components: the org
// attention briefing (the multi-school "3 things today") over the org KPI strip
// (each value = the metric's own formula on the Σ of every reporting school). No
// new endpoints — the same org hooks the Budget workspace uses. The fiscal year is
// derived from the period the caller has selected on Home, so School↔Org stay on
// one FY as they flip.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Layers } from 'lucide-react'
import { useOrgBriefing, useOrgMetrics } from '../../hooks/useAnalytics.js'
import OrgBriefing from '../budget/OrgBriefing.jsx'
import OrgKpiStrip from '../budget/OrgKpiStrip.jsx'
import OrgSchoolsTable from '../budget/OrgSchoolsTable.jsx'
import PennyMorningBrief from './PennyMorningBrief.jsx'

function fyLabel(fiscalYearStart) {
  if (!fiscalYearStart) return null
  const start = Number((fiscalYearStart.split('-')[0]) || NaN)
  return Number.isFinite(start) ? `FY ${start + 1}` : null
}

export default function OrgHome({
  orgId,
  orgName,
  orgSchoolCount,
  fiscalYearStart,
  periods = [],
  selectedPeriodId,
  onSelectPeriod,
}) {
  // Org briefing is JwtAuth-only (no 402); its own owner-only "preview as" lens.
  const [previewLens, setPreviewLens] = useState(null)
  const reduce = useReducedMotion()

  const {
    briefing,
    lens,
    callerRole,
    availableLenses,
    loading: briefingLoading,
    error: briefingError,
  } = useOrgBriefing(orgId, fiscalYearStart, previewLens)

  const {
    metrics,
    loading: metricsLoading,
    error: metricsError,
  } = useOrgMetrics(orgId, fiscalYearStart)

  const fy = fyLabel(fiscalYearStart)

  return (
    <div className="mx-auto max-w-page space-y-5 px-4 py-6 sm:space-y-8 sm:px-10 sm:py-8">
      {/* Org hero band */}
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="card-soft flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:gap-5 sm:px-7 sm:py-6"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow">
          <Layers size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-gold">
            Organization · consolidated
          </p>
          <h1 className="truncate py-0.5 font-serif text-2xl font-semibold leading-[1.35] text-navy sm:text-[28px]">
            {orgName || 'Organization'}
          </h1>
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
      </motion.div>

      {/* Consolidated KPI strip (formula-on-Σ, not an average) — the org vitals,
          surfaced ABOVE the triage board. */}
      <OrgKpiStrip metrics={metrics} loading={metricsLoading} error={metricsError} />

      {/* Per-school summary table — also above the triage, so the board is the
          last, action-focused block. Only once the briefing has loaded. */}
      {briefing && <OrgSchoolsTable schools={briefing.schools || []} />}

      {/* Penny narrates the org briefing — the spoken/written cross-school morning
          brief, above the org triage board. */}
      <PennyMorningBrief
        scope="org"
        orgId={orgId}
        fiscalYearStart={fiscalYearStart}
        lens={lens}
      />

      {/* The multi-school attention briefing — the org "3 things today". Its
          headline stays attached to the triage board it introduces. */}
      <OrgBriefing
        briefing={briefing}
        loading={briefingLoading}
        error={briefingError}
        lens={lens}
        callerRole={callerRole}
        availableLenses={availableLenses}
        onLensChange={setPreviewLens}
      />
    </div>
  )
}

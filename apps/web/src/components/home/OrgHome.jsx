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
//
// PREMIUM UI P2: the hero card is the `PageHeader` grammar (eyebrow / Garamond
// title / meta / the FY select on the hairline) inside a `Page`.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { useOrgBriefing, useOrgMetrics } from '../../hooks/useAnalytics.js'
import { Page, PageHeader } from '../ui/surface/index.js'
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

  const {
    briefing,
    lens,
    callerRole,
    availableLenses,
    loading: briefingLoading,
    error: briefingError,
  } = useOrgBriefing(orgId, fiscalYearStart, previewLens)

  const { metrics, loading: metricsLoading, error: metricsError } = useOrgMetrics(orgId, fiscalYearStart)

  const fy = fyLabel(fiscalYearStart)

  return (
    <Page className="space-y-6 py-2 sm:space-y-8">
      <PageHeader
        eyebrow="Organization · consolidated"
        title={orgName || 'Organization'}
        meta={`Rolled up across ${orgSchoolCount} schools${fy ? ` · ${fy}` : ''}.`}
        actions={
          periods.length > 0 ? (
            <label className="inline-flex items-center gap-2 text-micro font-semibold uppercase text-ink2">
              Fiscal year
              <select
                value={selectedPeriodId ?? ''}
                onChange={(e) => onSelectPeriod?.(e.target.value)}
                className="h-9 rounded-md border border-hair/30 bg-white px-2 text-small font-medium normal-case tracking-normal text-ink outline-none focus-visible:ring-2 focus-visible:ring-navy-soft/40"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label || p.periodEndDate || p.id}
                  </option>
                ))}
              </select>
            </label>
          ) : null
        }
      />

      {/* Consolidated KPI strip (formula-on-Σ, not an average) — the org vitals,
          surfaced ABOVE the triage board. */}
      <OrgKpiStrip metrics={metrics} loading={metricsLoading} error={metricsError} />

      {/* Per-school summary table — also above the triage, so the board is the
          last, action-focused block. Only once the briefing has loaded. */}
      {briefing && <OrgSchoolsTable schools={briefing.schools || []} />}

      {/* Penny narrates the org briefing — the spoken/written cross-school morning
          brief, above the org triage board. */}
      <PennyMorningBrief scope="org" orgId={orgId} fiscalYearStart={fiscalYearStart} lens={lens} />

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
    </Page>
  )
}

// Budget workspace (v2) — a clean, TABBED page. The "Budget" tab is now a
// READ-ONLY view: a friendly summary of this period's budget (when one exists)
// plus a clear call-to-action to set up / edit the budget in the Data hub
// (/data), which is now the single place to INPUT data. The guided wizard, the
// advanced monthly spread, import, and clear/replace all live in the Data hub's
// Budget card (components/budget/BudgetSetup.jsx).
//
// LAYOUT: the school switcher (reused from SchoolContext) + the period selector
// (reused PeriodSelector, persists to localStorage 'finrep_active_period') are
// PINNED in the page header ABOVE the tab bar, so context survives tab switches.
//
// TABS: Budget · Budget vs. Actual · Organizational Roll-up. The Budget tab is
// view-only (setup lives in the Data hub); BvA + Roll-up are analysis/views. The
// FY-End Forecast moved out: input is on /data, the read-only result is on /reports.
//
// React-Compiler safety: tab panels are produced by render-HELPER functions
// returning JSX with a key on the root — NOT nested component definitions. The
// only setState-in-effect is the established microtask-deferred sync-on-key
// (selected period) and the org-id fetch.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Wallet, Scale, Building2, Landmark, ListChecks } from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import PeriodSelector from '../components/analytics/PeriodSelector.jsx'
import BudgetTabs from '../components/budget/BudgetTabs.jsx'
import OrgRollup from '../components/budget/OrgRollup.jsx'
import OrgStatements from '../components/budget/OrgStatements.jsx'
import OrgKpiStrip from '../components/budget/OrgKpiStrip.jsx'
import OrgBriefing from '../components/budget/OrgBriefing.jsx'
import PennyMorningBrief from '../components/home/PennyMorningBrief.jsx'
import BudgetVsActual from '../components/analytics/BudgetVsActual.jsx'
import BudgetSummary from '../components/budget/BudgetSummary.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import {
  useAnalytics,
  useBudget,
  useBudgetRollup,
  useStatementsRollup,
  useOrgMetrics,
  useOrgBriefing,
} from '../hooks/useAnalytics.js'
import { orgsApi } from '../lib/api.js'

const TABS = [
  { id: 'budget', label: 'Budget', Icon: Wallet },
  { id: 'bva', label: 'Budget vs. Actual', Icon: Scale },
  { id: 'rollup', label: 'Organizational Roll-up', Icon: Building2 },
  { id: 'orgStatements', label: 'Consolidated Statements', Icon: Landmark },
  { id: 'orgBriefing', label: 'Organization Briefing', Icon: ListChecks },
]

// Organizations budget on a Jul–Jun fiscal year. Derive the 'YYYY-MM' fiscal-year
// start from a period's end date (PURE): months Jan–Jun belong to the FY that
// started the PRIOR July; Jul–Dec to the FY that started THIS July.
function deriveFiscalYearStart(periodEndDate) {
  if (!periodEndDate) return null
  const [y, m] = periodEndDate.split('-').map(Number)
  if (!y || !m) return null
  const startYear = m <= 6 ? y - 1 : y
  return `${startYear}-07`
}

export default function BudgetPage() {
  const navigate = useNavigate()
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  const { periods, hydrating } = usePersistence()

  // Selected period — seeded from the persisted list, kept in sync on change via
  // a microtask-deferred update (no synchronous setState in effect).
  const [selectedPeriodId, setSelectedPeriodId] = useState(
    () => localStorage.getItem('finrep_active_period') || null,
  )
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      const list = periods || []
      if (list.length === 0) {
        setSelectedPeriodId((cur) => (cur === null ? cur : null))
      } else {
        setSelectedPeriodId((cur) =>
          list.some((p) => p.id === cur) ? cur : list[0].id,
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [periods])

  const [activeTab, setActiveTab] = useState('budget')

  // Saved budget for the active school+period (the read-only summary, Forecast
  // seed, and BvA all derive from this). Setup/editing now lives in /data.
  const { budget, loading: budgetLoading, reload: reloadBudget } = useBudget(
    schoolId,
    selectedPeriodId,
  )
  const spread = budget?.lines?.spread ?? null

  // Period actuals so the Budget-vs-Actual tab shows real variances (the
  // existing component reads `metrics`). Empty until a snapshot exists — the
  // component degrades to a pure budget builder, which is the expected behavior.
  const { metrics, reload: reloadMetrics } = useAnalytics(schoolId, selectedPeriodId)

  // Penny autonomous-write refresh: a budget/forecast change broadcasts a
  // 'penny:data-changed' signal — re-pull the saved budget + metrics so the page
  // reflects what Penny just did. Pure side-effect listener with cleanup.
  useEffect(() => {
    const onDataChanged = (e) => {
      const key = e?.detail?.key
      if (key === 'budget' || key === 'forecast') {
        reloadBudget()
        reloadMetrics()
      }
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [reloadBudget, reloadMetrics])

  // Caller's org id — resolved once for the organization roll-up (single fetch).
  const [orgId, setOrgId] = useState(null)
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(async () => {
      try {
        const res = await orgsApi.me()
        if (!cancelled) setOrgId(res.data?.id ?? null)
      } catch {
        if (!cancelled) setOrgId(null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedPeriod = useMemo(
    () => (periods || []).find((p) => p.id === selectedPeriodId) || null,
    [periods, selectedPeriodId],
  )
  // Prefer the imported spread's own fiscal-year start; fall back to the period.
  const fiscalYearStart =
    spread?.fiscalYearStart?.slice(0, 7) ||
    deriveFiscalYearStart(selectedPeriod?.periodEndDate)

  // Only fetch the roll-up while the roll-up tab is active (cheap + avoids an
  // org query on every page visit). Passing a null orgId no-ops the hook.
  const rollupOrgId = activeTab === 'rollup' ? orgId : null
  const { rollup, loading: rollupLoading, error: rollupError } = useBudgetRollup(
    rollupOrgId,
    fiscalYearStart,
  )

  // Consolidated statements roll-up — only fetched while its tab is active, same FY
  // as the budget roll-up so the two org-level views stay on one fiscal year.
  const stmtOrgId = activeTab === 'orgStatements' ? orgId : null
  const {
    rollup: stmtRollup,
    loading: stmtLoading,
    error: stmtError,
  } = useStatementsRollup(stmtOrgId, fiscalYearStart)

  // Org-scope KPI strip (canonical semantic layer v1) — shares the Consolidated
  // Statements tab + its FY so the org KPIs and the consolidated totals below them
  // are computed for the same fiscal year. org metric = formula(Σ components).
  const {
    metrics: orgMetrics,
    loading: orgMetricsLoading,
    error: orgMetricsError,
  } = useOrgMetrics(stmtOrgId, fiscalYearStart)

  // Organization briefing — only fetched while its tab is active (the heaviest org
  // endpoint: it fans BriefingService.getBriefing out across every reporting
  // school), same FY as the other org views so all org tabs stay on one FY.
  const briefingOrgId = activeTab === 'orgBriefing' ? orgId : null
  // Scope × Lens: ephemeral "Preview as" selection for the org briefing (owner-
  // only switcher). null = the caller's widest in-org role (server default). The
  // server re-clamps to the live ceiling, so a stale wider lens can never leak.
  const [orgPreviewLens, setOrgPreviewLens] = useState(null)
  const {
    briefing: orgBriefing,
    lens: orgBriefingLens,
    availableLenses: orgBriefingAvailableLenses,
    loading: orgBriefingLoading,
    error: orgBriefingError,
  } = useOrgBriefing(briefingOrgId, fiscalYearStart, orgPreviewLens)

  // Does a budget exist for this period? (drives the summary-vs-empty state).
  // A budget "exists" if it has a spread or rev/exp lines.
  const hasBudget = !!(
    budget?.lines &&
    (budget.lines.spread || budget.lines.revenue || budget.lines.expense)
  )

  // ── Render helpers (NOT components) ─────────────────────────────────────────

  // The Budget tab is now READ-ONLY: a friendly summary of this period's budget
  // (when one exists) plus a clear pointer to the Data hub, which is the single
  // place to set up or edit a budget (guided wizard / advanced spread / import).
  const renderBudget = () => {
    if (!selectedPeriodId) {
      return (
        <div key="budget" className="card-soft border-dashed px-6 py-14 text-center">
          <p className="font-serif text-lg italic text-muted">Select a period to view its budget.</p>
        </div>
      )
    }
    if (budgetLoading) {
      return (
        <div key="budget" className="card-soft animate-pulse px-6 py-14 text-center">
          <p className="font-serif text-base italic text-muted">Loading your budget…</p>
        </div>
      )
    }
    if (hasBudget) {
      return (
        <div key="budget" className="space-y-4">
          {/* Setup now lives in the Data hub — gold callout that routes there. */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/30 bg-gold/5 px-5 py-4">
            <div className="min-w-0">
              <p className="font-serif text-[15px] font-semibold text-navy">
                Set up or edit your budget in the Data hub
              </p>
              <p className="mt-0.5 text-[12px] text-muted">
                The guided wizard, the advanced monthly spread, and imports now live in one place.
              </p>
            </div>
            <Link
              to="/data"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-gold-gradient px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-navy shadow-glow outline-none ring-gold/50 transition-transform hover:-translate-y-0.5 focus-visible:ring-2"
            >
              Go to Data hub →
            </Link>
          </div>
          <BudgetSummary
            budget={budget}
            canEdit={canEdit}
            onEdit={() => navigate('/data')}
            onViewAdvanced={() => navigate('/data')}
          />
        </div>
      )
    }
    return (
      <div key="budget" className="card-soft border-dashed px-6 py-14 text-center">
        <p className="font-serif text-lg italic text-muted">No budget yet for this period.</p>
        <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted">
          Budget setup now lives in the Data hub — set up a budget the guided way, the advanced way, or by importing a spreadsheet.
        </p>
        <Link
          to="/data"
          className="mt-5 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-gold-gradient px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-navy shadow-glow outline-none ring-gold/50 transition-transform hover:-translate-y-0.5 focus-visible:ring-2"
        >
          Set up your budget in the Data hub →
        </Link>
      </div>
    )
  }

  const renderBva = () => {
    if (!selectedPeriodId) {
      return (
        <div key="bva" className="card-soft border-dashed px-6 py-14 text-center">
          <p className="font-serif text-lg italic text-muted">Select a period to compare budget vs. actual.</p>
        </div>
      )
    }
    return (
      <div key="bva">
        <BudgetVsActual
          schoolId={schoolId}
          periodId={selectedPeriodId}
          canEdit={canEdit}
          metrics={metrics}
        />
      </div>
    )
  }

  const renderRollup = () => (
    <div key="rollup">
      <OrgRollup rollup={rollup} loading={rollupLoading} error={rollupError} />
    </div>
  )

  const renderOrgStatements = () => (
    <div key="orgStatements">
      <OrgKpiStrip metrics={orgMetrics} loading={orgMetricsLoading} error={orgMetricsError} />
      <OrgStatements rollup={stmtRollup} loading={stmtLoading} error={stmtError} />
    </div>
  )

  const renderOrgBriefing = () => (
    <div key="orgBriefing" className="space-y-5">
      {/* Penny narrates the org briefing — the spoken/written cross-school morning
          brief, above the org triage board. */}
      <PennyMorningBrief
        scope="org"
        orgId={orgId}
        fiscalYearStart={fiscalYearStart}
        lens={orgBriefingLens}
      />
      <OrgBriefing
        briefing={orgBriefing}
        loading={orgBriefingLoading}
        error={orgBriefingError}
        lens={orgBriefingLens}
        availableLenses={orgBriefingAvailableLenses}
        onLensChange={setOrgPreviewLens}
      />
    </div>
  )

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'bva':
        return renderBva()
      case 'rollup':
        return renderRollup()
      case 'orgStatements':
        return renderOrgStatements()
      case 'orgBriefing':
        return renderOrgBriefing()
      case 'budget':
      default:
        return renderBudget()
    }
  }

  return (
    <div className="min-h-screen">
      <BillingBanner />
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-10">
        <BackLink className="mb-4" />
        {/* Page header: title + pinned school switcher & period selector. */}
        <div className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-gradient text-white shadow-glow">
                <Wallet size={22} />
              </span>
              <div>
                <h1 className="font-serif text-xl font-semibold text-navy sm:text-2xl">
                  Budget Workspace
                </h1>
                <p className="text-[13px] text-muted">
                  Set up a budget the guided way or the advanced way, compare it to actuals, and consolidate across your organization.
                </p>
              </div>
            </div>
            {/* School context — read-only here; switch via the masthead switcher
                (avoids a confusing second switcher controlling the same value). */}
            {activeSchool?.name && (
              <div className="hidden text-right sm:block">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                  School
                </div>
                <div className="text-[14px] font-semibold text-navy">{activeSchool.name}</div>
              </div>
            )}
          </div>

          {periods && periods.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                Period
              </div>
              <PeriodSelector
                periods={periods}
                activeId={selectedPeriodId}
                onSelect={setSelectedPeriodId}
                light
              />
            </div>
          )}
        </div>

        {/* Tab bar (id anchors Penny's budget-workspace glide). */}
        <div id="budgetpage-driver-tab" className="mb-6">
          <BudgetTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
        </div>

        {/* Active panel */}
        <div
          id={`budget-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`budget-tab-${activeTab}`}
          tabIndex={0}
          className="outline-none"
        >
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {hydrating &&
            activeTab !== 'rollup' &&
            activeTab !== 'orgStatements' &&
            activeTab !== 'orgBriefing' ? (
              <div className="card-soft animate-pulse px-6 py-14 text-center">
                <p className="font-serif text-base italic text-muted">Loading your periods…</p>
              </div>
            ) : (
              renderActivePanel()
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

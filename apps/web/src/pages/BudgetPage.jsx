// Budget workspace (v1) — a clean, TABBED page that imports monthly budget
// spreadsheets and shows them as a monthly spread, with multi-school support and
// a diocese-wide roll-up.
//
// LAYOUT: the school switcher (reused from SchoolContext) + the period selector
// (reused PeriodSelector, persists to localStorage 'finrep_active_period') are
// PINNED in the page header ABOVE the tab bar, so context survives tab switches.
//
// TABS: Monthly Spread · Import · Budget vs. Actual · Diocese Roll-up.
//
// React-Compiler safety: tab panels are produced by render-HELPER functions
// (renderSpread/renderImport/renderBva/renderRollup) returning JSX with a key on
// the root — NOT nested component definitions. All derivation happens at render;
// the only setState-in-effect is the established microtask-deferred sync-on-key
// for the selected period (mirrors AnalyticsDashboard) and the org-id fetch.
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Wallet, Table2, UploadCloud, Scale, Building2 } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import BillingBanner from '../components/BillingBanner.jsx'
import PeriodSelector from '../components/analytics/PeriodSelector.jsx'
import BudgetTabs from '../components/budget/BudgetTabs.jsx'
import MonthlySpreadGrid from '../components/budget/MonthlySpreadGrid.jsx'
import BudgetImport from '../components/budget/BudgetImport.jsx'
import DioceseRollup from '../components/budget/DioceseRollup.jsx'
import BudgetVsActual from '../components/analytics/BudgetVsActual.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import { useAnalytics, useBudget, useBudgetRollup } from '../hooks/useAnalytics.js'
import { orgsApi } from '../lib/api.js'

const TABS = [
  { id: 'spread', label: 'Monthly Spread', Icon: Table2 },
  { id: 'import', label: 'Import', Icon: UploadCloud },
  { id: 'bva', label: 'Budget vs. Actual', Icon: Scale },
  { id: 'rollup', label: 'Diocese Roll-up', Icon: Building2 },
]

// FL dioceses budget on a Jul–Jun fiscal year. Derive the 'YYYY-MM' fiscal-year
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

  const [activeTab, setActiveTab] = useState('spread')

  // Saved budget for the active school+period (spread + BvA both read this).
  const { budget, loading: budgetLoading, reload: reloadBudget } = useBudget(
    schoolId,
    selectedPeriodId,
  )
  const spread = budget?.lines?.spread ?? null

  // Period actuals so the Budget-vs-Actual tab shows real variances (the
  // existing component reads `metrics`). Empty until a snapshot exists — the
  // component degrades to a pure budget builder, which is the expected behavior.
  const { metrics } = useAnalytics(schoolId, selectedPeriodId)

  // Caller's org id — resolved once for the diocese roll-up (single fetch).
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

  // After a successful import, re-pull the saved budget (the import PUT hits a
  // different endpoint than useBudget reads) and jump to the Monthly Spread tab.
  const onImported = () => {
    reloadBudget()
    setActiveTab('spread')
  }

  // ── Render helpers (NOT components) ─────────────────────────────────────────
  const renderSpread = () => {
    if (!selectedPeriodId) {
      return (
        <div key="spread" className="card-soft border-dashed px-6 py-14 text-center">
          <p className="font-serif text-lg italic text-muted">Select a period to view its budget.</p>
        </div>
      )
    }
    if (budgetLoading) {
      return (
        <div key="spread" className="card-soft animate-pulse px-6 py-14 text-center">
          <p className="font-serif text-base italic text-muted">Loading the monthly spread…</p>
        </div>
      )
    }
    if (!spread) {
      return (
        <div key="spread" className="card-soft border-dashed px-6 py-14 text-center">
          <p className="font-serif text-lg italic text-muted">No budget spread imported yet.</p>
          <p className="mt-1 text-[13px] text-muted">
            Use the Import tab to upload this period&rsquo;s monthly budget spreadsheet.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className="btn-primary mt-6"
          >
            Go to Import
          </button>
        </div>
      )
    }
    return (
      <div key="spread">
        <MonthlySpreadGrid spread={spread} />
      </div>
    )
  }

  const renderImport = () => (
    <div key="import">
      <BudgetImport
        schoolId={schoolId}
        periodId={selectedPeriodId}
        canEdit={canEdit}
        onImported={onImported}
      />
    </div>
  )

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
      <DioceseRollup rollup={rollup} loading={rollupLoading} error={rollupError} />
    </div>
  )

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'import':
        return renderImport()
      case 'bva':
        return renderBva()
      case 'rollup':
        return renderRollup()
      case 'spread':
      default:
        return renderSpread()
    }
  }

  return (
    <div className="min-h-screen">
      <TopBar />
      <BillingBanner />
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-10">
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
                  Import monthly budget spreads, review the spread, and consolidate across the diocese.
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

        {/* Tab bar */}
        <div className="mb-6">
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
            {hydrating && activeTab !== 'import' && activeTab !== 'rollup' ? (
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

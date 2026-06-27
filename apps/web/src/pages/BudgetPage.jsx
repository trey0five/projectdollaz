// Budget workspace (v2) — a clean, TABBED page with a beginner-friendly Budget
// area that toggles between a GUIDED experience (a step-by-step wizard / a
// friendly summary) and an ADVANCED experience (the granular monthly spread).
//
// LAYOUT: the school switcher (reused from SchoolContext) + the period selector
// (reused PeriodSelector, persists to localStorage 'finrep_active_period') are
// PINNED in the page header ABOVE the tab bar, so context survives tab switches.
//
// TABS: Budget · Budget vs. Actual · Organizational Roll-up. The old standalone
// "Monthly Spread", "Driver Model", and "Import" tabs are gone — they fold into
// the single Budget tab's Guided/Advanced toggle (Guided = wizard/summary which
// embeds the driver + import flows; Advanced = the monthly spread grid). BvA +
// Roll-up are UNCHANGED.
//
// TOGGLE STATE MACHINE (React-Compiler safe — no setState in render/effect):
//   mode:       'guided' | 'advanced'          — the segmented control
//   guidedView: 'auto' | 'wizard'              — 'auto' DERIVES the effective view
//                                                 (summary when a budget exists,
//                                                 wizard otherwise). It only flips
//                                                 to 'wizard' from the Edit handler.
//   effectiveGuided is a PURE render derivation, never stored — so we never need a
//   setState-in-effect to "open the summary when a budget appears."
// onApplied (driver save OR import confirm, fired by the wizard) re-pulls the
// budget and resets guidedView to 'auto' so the user lands on the fresh summary.
//
// React-Compiler safety: tab panels + the Budget surface are produced by
// render-HELPER functions returning JSX with a key on the root — NOT nested
// component definitions. `mode`/`guidedView` are read at render and set only from
// event handlers. The only setState-in-effect is the established microtask-
// deferred sync-on-key (selected period, surface reset) and the org-id fetch.
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Wallet, Scale, Building2, Sparkles, Table2, TrendingUp } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import BillingBanner from '../components/BillingBanner.jsx'
import PeriodSelector from '../components/analytics/PeriodSelector.jsx'
import BudgetTabs from '../components/budget/BudgetTabs.jsx'
import MonthlySpreadGrid from '../components/budget/MonthlySpreadGrid.jsx'
import DioceseRollup from '../components/budget/DioceseRollup.jsx'
import BudgetVsActual from '../components/analytics/BudgetVsActual.jsx'
import BudgetWizard from '../components/budget/wizard/BudgetWizard.jsx'
import BudgetSummary from '../components/budget/BudgetSummary.jsx'
import ForecastWorkspace from '../components/budget/ForecastWorkspace.jsx'
import { describeBudgetSource } from '../components/budget/budgetSource.js'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import {
  useAnalytics,
  useBudget,
  useBudgetContext,
  useBudgetRollup,
} from '../hooks/useAnalytics.js'
import { orgsApi, analyticsApi } from '../lib/api.js'

const TABS = [
  { id: 'budget', label: 'Budget', Icon: Wallet },
  { id: 'forecast', label: 'Forecast', Icon: TrendingUp },
  { id: 'bva', label: 'Budget vs. Actual', Icon: Scale },
  { id: 'rollup', label: 'Organizational Roll-up', Icon: Building2 },
]

// Guided ⇄ Advanced segmented control options (module-scope so the React Compiler
// treats them as stable; the control itself is rendered via a render-helper).
const MODE_OPTIONS = [
  { id: 'guided', label: 'Guided', Icon: Sparkles },
  { id: 'advanced', label: 'Advanced', Icon: Table2 },
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

  const [activeTab, setActiveTab] = useState('budget')

  // ── Budget surface state machine ────────────────────────────────────────────
  // `mode` is the Guided/Advanced segmented control. `guidedView` is 'auto'
  // (derive summary-vs-wizard from whether a budget exists) or 'wizard' (forced
  // open for an Edit). Both are read at render and set only from event handlers.
  const [mode, setMode] = useState('guided')
  const [guidedView, setGuidedView] = useState('auto')

  // Reset the Budget surface to its default when the school/period changes
  // (microtask-deferred to satisfy the no-setState-in-effect rule, like the
  // period sync). This also handles switching school/period mid-wizard: the
  // wizard unmounts and the surface re-derives for the new key. The wizard is
  // additionally keyed by school:period below to force a clean remount so no
  // in-flight answers carry across periods.
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setMode('guided')
      setGuidedView('auto')
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, selectedPeriodId])

  // Saved budget for the active school+period (the wizard, summary, spread, and
  // BvA all derive from this).
  const { budget, loading: budgetLoading, reload: reloadBudget } = useBudget(
    schoolId,
    selectedPeriodId,
  )
  const spread = budget?.lines?.spread ?? null

  // Prior actuals + enrollment/aid drivers — seeds the wizard's driver questions
  // (prefill) and feeds its live mini-preview. Never blocks the page; a failure
  // just leaves the form at neutral defaults.
  const { context: budgetContext } = useBudgetContext(schoolId, selectedPeriodId)

  // Period actuals so the Budget-vs-Actual tab shows real variances (the
  // existing component reads `metrics`). Empty until a snapshot exists — the
  // component degrades to a pure budget builder, which is the expected behavior.
  const { metrics } = useAnalytics(schoolId, selectedPeriodId)

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

  // The source of the currently-saved budget — passed to the wizard (overwrite
  // notice) and the spread grid (header badge). Memoized on the budget.
  const priorSource = useMemo(() => describeBudgetSource(budget), [budget])

  // Does a budget exist for this period? (drives the auto guided view + the
  // advanced empty note). A budget "exists" if it has a spread or rev/exp lines.
  const hasBudget = !!(
    budget?.lines &&
    (budget.lines.spread || budget.lines.revenue || budget.lines.expense)
  )

  // After a successful apply (driver save OR import confirm, fired by the
  // wizard), re-pull the saved budget and return to the auto guided view — which
  // now derives to the friendly summary, since hasBudget is true.
  const onBudgetApplied = () => {
    reloadBudget()
    setGuidedView('auto')
    setMode('guided')
  }

  // ── Render helpers (NOT components) ─────────────────────────────────────────

  // The Guided/Advanced segmented control (pinned at the top of the Budget tab).
  const renderModeToggle = () => (
    <div
      role="tablist"
      aria-label="Budget view mode"
      className="inline-flex items-center gap-1 rounded-2xl border border-gold/25 bg-navy-gradient p-1 shadow-navy-glow"
    >
      {MODE_OPTIONS.map((opt) => {
        const isActive = opt.id === mode
        const Icon = opt.Icon
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setMode(opt.id)}
            className={`relative flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] outline-none ring-gold/50 transition-colors focus-visible:ring-2 ${
              isActive ? 'text-navy' : 'text-white/70 hover:text-white'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="budget-mode-pill"
                className="absolute inset-0 rounded-xl bg-gold-gradient shadow-glow"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon size={14} />
              {opt.label}
            </span>
          </button>
        )
      })}
    </div>
  )

  // Replace from Advanced → open the Guided wizard (Step 0 lets the user upload a
  // different file or answer questions). Clear → wipe this period's budget (lines +
  // totals) and drop back to Guided, which then shows the fresh wizard.
  const onReplaceBudget = () => {
    setMode('guided')
    setGuidedView('wizard')
  }
  const onClearBudget = async () => {
    if (!schoolId || !selectedPeriodId) return
    try {
      await analyticsApi.saveBudget(schoolId, selectedPeriodId, {
        lines: null,
        totalRevenue: null,
        totalExpenses: null,
      })
      await reloadBudget()
      setMode('guided')
      setGuidedView('auto')
    } catch {
      /* best-effort; the grid stays as-is on failure */
    }
  }

  // Advanced view body — the granular monthly spread (with a source badge), or a
  // short empty note pointing back to Guided when there's nothing to show.
  const renderAdvanced = () => {
    if (budgetLoading) {
      return (
        <div className="card-soft animate-pulse px-6 py-14 text-center">
          <p className="font-serif text-base italic text-muted">Loading the monthly spread…</p>
        </div>
      )
    }
    if (!spread) {
      return (
        <div className="card-soft border-dashed px-6 py-12 text-center">
          <p className="font-serif text-lg italic text-muted">
            No spreadsheet view for this budget yet.
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted">
            Switch to <span className="font-semibold text-navy">Guided</span> to set one up — once a
            budget exists, the full accounts-by-month spread appears here.
          </p>
          <button
            type="button"
            onClick={() => setMode('guided')}
            className="btn-ghost mt-4 inline-flex items-center gap-2"
          >
            <Sparkles size={15} /> Go to Guided
          </button>
        </div>
      )
    }
    return (
      <MonthlySpreadGrid
        spread={spread}
        source={priorSource}
        onReimport={canEdit ? onReplaceBudget : undefined}
        onClear={canEdit ? onClearBudget : undefined}
      />
    )
  }

  // Guided view body — the friendly summary when a budget exists (unless an Edit
  // forced the wizard open), else the step-by-step wizard.
  const renderGuided = () => {
    if (budgetLoading) {
      return (
        <div className="card-soft animate-pulse px-6 py-14 text-center">
          <p className="font-serif text-base italic text-muted">Loading your budget…</p>
        </div>
      )
    }
    const effectiveGuided =
      guidedView === 'auto' ? (hasBudget ? 'summary' : 'wizard') : 'wizard'

    if (effectiveGuided === 'summary') {
      return (
        <BudgetSummary
          budget={budget}
          canEdit={canEdit}
          onEdit={() => setGuidedView('wizard')}
          onViewAdvanced={() => setMode('advanced')}
        />
      )
    }
    return (
      <BudgetWizard
        key={`${schoolId}:${selectedPeriodId}`}
        schoolId={schoolId}
        periodId={selectedPeriodId}
        canEdit={canEdit}
        budgetContext={budgetContext}
        savedAssumptions={budget?.lines?.driverModel?.assumptions ?? null}
        budget={budget}
        priorSource={priorSource}
        onApplied={onBudgetApplied}
      />
    )
  }

  const renderBudget = () => {
    if (!selectedPeriodId) {
      return (
        <div key="budget" className="card-soft border-dashed px-6 py-14 text-center">
          <p className="font-serif text-lg italic text-muted">Select a period to set up its budget.</p>
        </div>
      )
    }
    return (
      <div key="budget" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {renderModeToggle()}
          <p className="max-w-md text-[12px] text-muted">
            {mode === 'guided'
              ? 'A friendly, step-by-step setup — answer a few questions or upload what you have.'
              : 'The full accounts-by-month spread for accountants and power users.'}
          </p>
        </div>
        {mode === 'advanced' ? renderAdvanced() : renderGuided()}
      </div>
    )
  }

  const renderForecast = () => {
    if (!selectedPeriodId) {
      return (
        <div key="forecast" className="card-soft border-dashed px-6 py-14 text-center">
          <p className="font-serif text-lg italic text-muted">
            Select a period to project its fiscal-year-end forecast.
          </p>
        </div>
      )
    }
    return (
      <div key="forecast">
        <ForecastWorkspace
          key={`${schoolId}:${selectedPeriodId}`}
          schoolId={schoolId}
          periodId={selectedPeriodId}
          canEdit={canEdit}
          budget={budget}
          budgetContext={budgetContext}
        />
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
      <DioceseRollup rollup={rollup} loading={rollupLoading} error={rollupError} />
    </div>
  )

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'forecast':
        return renderForecast()
      case 'bva':
        return renderBva()
      case 'rollup':
        return renderRollup()
      case 'budget':
      default:
        return renderBudget()
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
            {hydrating && activeTab !== 'rollup' ? (
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

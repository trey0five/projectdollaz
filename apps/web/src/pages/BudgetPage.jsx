// Budget workspace — a clean, TABBED page. The "Budget" tab mounts the REAL
// setup surface (components/budget/BudgetSetup.jsx — the same component the
// Finance Add-data wizard embeds: one setup surface, two doors, zero forks).
// BudgetSetup derives summary-vs-wizard itself, owns guided/advanced/import/
// clear/replace, and respects canEdit — so you set up or edit the budget right
// where you are, never on another page.
//
// LAYOUT: the school switcher (reused from SchoolContext) + the period selector
// (reused PeriodSelector, persists to localStorage 'finrep_active_period') are
// PINNED in the page header ABOVE the tab bar, so context survives tab switches.
//
// TABS: Budget · Budget vs. Actual · Organizational Roll-up · Consolidated
// Statements. BvA + the org tabs are analysis/views. The FY-End Forecast lives
// in Planning & Forecasting; the read-only result is on /reports.
//
// React-Compiler safety: tab panels are produced by render-HELPER functions
// returning JSX with a key on the root — NOT nested component definitions. The
// only setState-in-effect is the established microtask-deferred sync-on-key
// (selected period) and the org-id fetch.
import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Wallet, Scale, Building2, Landmark, ArrowDownLeft, ArrowUpRight, Target, CalendarRange } from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import '../styles/pending/b2-finance.css'
import {
  AuroraButton,
  AuroraEmpty,
  AuroraLightButton,
  AuroraSection,
  HowThisWorks,
  VerdictEm,
} from '../components/ui/aurora/index.js'
import {
  FinanceSubPage,
  FinanceSubBand,
  FinanceMore,
  FinancePeriodSwitch,
  yearName,
} from '../components/statements/financeSub.jsx'
import { budgetTotals } from '../components/budget/budgetTotals.js'
import { money, moneyShort, periodClosed } from '../components/finance/financeAurora.js'
import { formatShortDate } from '../lib/format.js'
import BudgetTabs from '../components/budget/BudgetTabs.jsx'
import OrgRollup from '../components/budget/OrgRollup.jsx'
import OrgStatements from '../components/budget/OrgStatements.jsx'
import OrgKpiStrip from '../components/budget/OrgKpiStrip.jsx'
import BudgetVsActual from '../components/analytics/BudgetVsActual.jsx'
import BudgetSetup from '../components/budget/BudgetSetup.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import {
  useAnalytics,
  useBudget,
  useBudgetRollup,
  useStatementsRollup,
  useOrgMetrics,
} from '../hooks/useAnalytics.js'
import { orgsApi } from '../lib/api.js'

const TABS = [
  { id: 'budget', label: 'Budget', Icon: Wallet },
  { id: 'bva', label: 'Budget vs. Actual', Icon: Scale },
  { id: 'rollup', label: 'Organizational Roll-up', Icon: Building2 },
  { id: 'orgStatements', label: 'Consolidated Statements', Icon: Landmark },
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
  const reduce = useReducedMotion()
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  const { periods, hydrating, activePeriod } = usePersistence()

  // Selected period — seeded from the persisted list, kept in sync on change via
  // a microtask-deferred update (no synchronous setState in effect). With no
  // valid remembered choice it opens on the SAME year Statements opens on (the
  // hydrated period — the newest one that holds numbers), then the newest year
  // with statements, never an empty future year just because it sorts first.
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
        const fallback =
          (activePeriod && list.some((p) => p.id === activePeriod.id) ? activePeriod.id : null) ??
          list.find((p) => p.hasSnapshot)?.id ??
          list[0].id
        setSelectedPeriodId((cur) => (list.some((p) => p.id === cur) ? cur : fallback))
      }
    })
    return () => {
      cancelled = true
    }
  }, [periods, activePeriod])

  const [activeTab, setActiveTab] = useState('budget')

  // Saved budget for the active school+period (the Budget tab's loading gate and
  // BvA both derive from this; BudgetSetup owns its own copy via useBudget too).
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
  const periodName = selectedPeriod ? yearName(selectedPeriod.label) : null
  // A budget "exists" if it has a spread or rev/exp lines (BudgetSetup's rule).
  const hasBudget = !!(budget?.lines && (budget.lines.spread || budget.lines.revenue || budget.lines.expense))

  // Budget vs. actual totals — the SAME derivation BudgetVsActual's table uses.
  const totals = useMemo(() => budgetTotals(budget, metrics), [budget, metrics])
  const netVar = totals.netAct != null && !totals.noBudget ? totals.netAct - totals.netBud : null
  // Half-entered budget (one side still $0): the net comparison would only
  // measure the missing side — say so, never "Behind plan".
  const oneSided =
    totals.budExpTotal === 0 ? 'No spending in this budget yet' : totals.budRevTotal === 0 ? 'No income in this budget yet' : null

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

  // ── Render helpers (NOT components) ─────────────────────────────────────────

  // The Budget tab IS the setup surface: BudgetSetup derives summary-vs-wizard
  // itself (guidedView 'auto'), owns guided/advanced/import/clear/replace, and
  // respects canEdit — set up or edit the budget right here, no link-out.
  const renderBudget = () => {
    if (!selectedPeriodId) {
      return (
        <AuroraEmpty
          key="budget"
          icon={CalendarRange}
          text="No saved years yet."
          sub="A budget attaches to a year. Add your first trial balance on the Finance page."
          action={
            <AuroraLightButton variant="ghost" to="/finance">
              Go to Finance
            </AuroraLightButton>
          }
        />
      )
    }
    if (budgetLoading) {
      return <AuroraEmpty key="budget" icon={Wallet} text="Loading your budget…" aria-busy="true" />
    }
    return (
      <div key="budget">
        <AuroraSection first icon={Wallet} title="Your budget" subtitle="Set it up, or change it" count={periodName} />
        <BudgetSetup
          schoolId={schoolId}
          periodId={selectedPeriodId}
          canEdit={canEdit}
          onSaved={() => {
            reloadBudget()
            reloadMetrics()
          }}
        />
      </div>
    )
  }

  const renderBva = () => {
    if (!selectedPeriodId) {
      return <AuroraEmpty key="bva" icon={Scale} text="Pick a year to compare budget vs. actual." />
    }
    return (
      <div key="bva">
        <BudgetVsActual
          schoolId={schoolId}
          periodId={selectedPeriodId}
          canEdit={canEdit}
          metrics={metrics}
          onSetUp={() => setActiveTab('budget')}
        />
      </div>
    )
  }

  const renderRollup = () => (
    <div key="rollup">
      <AuroraSection first icon={Building2} title="Organization roll-up" subtitle="Every school’s budget, added up" />
      <OrgRollup rollup={rollup} loading={rollupLoading} error={rollupError} />
    </div>
  )

  const renderOrgStatements = () => (
    <div key="orgStatements">
      <AuroraSection first icon={Landmark} title="Consolidated statements" subtitle="Every school’s statements, combined" />
      <OrgKpiStrip metrics={orgMetrics} loading={orgMetricsLoading} error={orgMetricsError} />
      <OrgStatements rollup={stmtRollup} loading={stmtLoading} error={stmtError} />
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
      case 'budget':
      default:
        return renderBudget()
    }
  }

  // ── The band: eyebrow (the year), ONE sentence, the plan figures ──────────
  const closed = periodClosed(selectedPeriod?.periodEndDate)
  const eyebrow = selectedPeriod?.periodEndDate
    ? `${closed ? 'Year ended' : 'Year ends'} ${formatShortDate(selectedPeriod.periodEndDate)}`
    : null

  let verdict = null
  if (!hydrating && !(periods || []).length) {
    verdict = <>Add a year&rsquo;s numbers first. A budget attaches to a year.</>
  } else if (selectedPeriodId && !budgetLoading) {
    if (!totals.hasLines) {
      verdict = hasBudget ? (
        <>
          The <VerdictEm>{periodName}</VerdictEm> budget is set. Budget vs. actual opens once that year has statements.
        </>
      ) : (
        <>
          <VerdictEm>{periodName}</VerdictEm> has no budget yet.
        </>
      )
    } else if (totals.noBudget) {
      verdict = (
        <>
          <VerdictEm>{periodName}</VerdictEm> has no budget yet.{canEdit ? ' Set one up in a few minutes.' : ''}
        </>
      )
    } else if (netVar != null && oneSided) {
      verdict = (
        <>
          The <VerdictEm>{periodName}</VerdictEm> budget is half set up. {oneSided}.
        </>
      )
    } else if (netVar != null) {
      verdict = (
        <>
          {periodName} {closed ? 'finished' : 'is running'}{' '}
          <VerdictEm tone={netVar >= 0 ? null : 'risk'}>
            {money(Math.abs(netVar))} {netVar >= 0 ? 'ahead of' : 'behind'}
          </VerdictEm>{' '}
          its budget.
        </>
      )
    } else {
      verdict = <>The {periodName} budget is set. Actuals appear once that year&rsquo;s numbers are in.</>
    }
  }

  const kpis =
    selectedPeriodId && !budgetLoading && totals.hasLines && !totals.noBudget
      ? [
          { key: 'bin', icon: ArrowDownLeft, label: 'Budgeted income', value: moneyShort(totals.budRevTotal), caption: `Planned for ${periodName}` },
          { key: 'bout', icon: ArrowUpRight, label: 'Budgeted spending', value: moneyShort(totals.budExpTotal), caption: `Planned for ${periodName}` },
          {
            key: 'bnet',
            icon: Scale,
            label: 'Planned left over',
            value: `${totals.netBud >= 0 ? '+' : ''}${moneyShort(totals.netBud)}`,
            caption: 'Income minus spending',
          },
          netVar != null
            ? {
                key: 'var',
                icon: Target,
                label: 'Against budget',
                value: `${netVar >= 0 ? '+' : ''}${moneyShort(netVar)}`,
                caption: oneSided ?? 'What was left over vs. plan',
                // A SIGN, not a band: ahead or behind the school's own plan —
                // and no sign at all while one side of the budget is empty.
                verdict: oneSided ? null : netVar >= 0 ? 'good' : 'risk',
                verdictLabel: oneSided ? null : netVar >= 0 ? 'Ahead of plan' : 'Behind plan',
              }
            : { key: 'var', icon: Target, label: 'Against budget', value: null, caption: 'Actuals not in yet' },
        ]
      : null

  // The band's ONE main job, from what the year needs next.
  const focusSetup = () => {
    setActiveTab('budget')
    if (typeof window === 'undefined') return
    // After the Budget view mounts: bring the guided setup into view and put
    // focus on its first control.
    window.setTimeout(() => {
      const el = document.getElementById('budget-setup-panel')
      if (!el) return
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
      el.querySelector('button:not([disabled]), input:not([disabled]), select:not([disabled])')?.focus({ preventScroll: true })
    }, 260)
  }
  const noYears = !hydrating && !(periods || []).length
  let primary = null
  if (noYears) {
    primary = (
      <AuroraButton variant="primary" to="/finance" icon={<CalendarRange size={19} aria-hidden="true" />}>
        Add a year&rsquo;s numbers
      </AuroraButton>
    )
  } else if (selectedPeriodId && !budgetLoading && !hasBudget && canEdit) {
    primary = (
      <AuroraButton variant="primary" onClick={focusSetup} icon={<Wallet size={19} aria-hidden="true" />}>
        Set up the budget
      </AuroraButton>
    )
  } else if (totals.hasLines && !totals.noBudget && activeTab !== 'bva') {
    primary = (
      <AuroraButton variant="primary" onClick={() => setActiveTab('bva')} icon={<Scale size={19} aria-hidden="true" />}>
        Compare to actual
      </AuroraButton>
    )
  } else if (selectedPeriodId && activeTab !== 'budget') {
    primary = (
      <AuroraButton variant="primary" onClick={() => setActiveTab('budget')} icon={<Wallet size={19} aria-hidden="true" />}>
        Open the budget
      </AuroraButton>
    )
  }

  return (
    <div className="min-h-screen">
      <BillingBanner />
      <FinanceSubPage crumb="Budget">
        <FinanceSubBand
          eyebrow={eyebrow}
          title="Budget"
          verdict={verdict}
          actions={primary}
          aside={<FinancePeriodSwitch periods={periods} activeId={selectedPeriodId} onSelect={setSelectedPeriodId} />}
          kpis={kpis}
        />

        {/* The page's four views as one switch under the band (the id anchors
            Penny's budget-workspace glide). */}
        <div id="budgetpage-driver-tab" className="fsub-nav">
          <BudgetTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
        </div>

        {/* Active panel */}
        <div
          id={`budget-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`budget-tab-${activeTab}`}
          tabIndex={0}
          className="mt-2 rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40"
        >
          <motion.div
            key={activeTab}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {hydrating &&
            activeTab !== 'rollup' &&
            activeTab !== 'orgStatements' ? (
              <AuroraEmpty icon={CalendarRange} text="Loading your saved years…" aria-busy="true" />
            ) : (
              renderActivePanel()
            )}
          </motion.div>
        </div>

        <FinanceMore current="budget" />

        <HowThisWorks>
          <p>Set up a budget the guided way (a few questions) or the advanced way (line by line, or upload a spreadsheet).</p>
          <p>Budget vs. Actual compares it with this year&rsquo;s statements. Budget figures are your school&rsquo;s own plan — not a standard.</p>
          <p>Organizational Roll-up and Consolidated Statements add every school in your organization together.</p>
        </HowThisWorks>
      </FinanceSubPage>
    </div>
  )
}

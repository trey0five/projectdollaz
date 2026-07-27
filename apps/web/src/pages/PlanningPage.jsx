// ─────────────────────────────────────────────────────────────────────────────
// Planning & Forecasting route (Phase 6) — the planning module's DOMAIN COMMAND
// CENTER at /planning, on EXISTING endpoints only (zero new API): the planning
// metrics (forecast_vs_budget_net · forecast_operating_margin · plan_readiness)
// as .kpi-3d KPI cards plus display-only Forecast/Budget net $ stats from the
// budget/forecast GET envelopes; a plan summary + display-only multi-year
// outlook (hard-badged "Projection — not saved data"); the FY-END FORECAST
// WORKSPACE mounted front-and-center (the SAME component the Data hub embeds —
// second mount, zero fork); and the planning.enrollment_plan RecordFlow as the
// Add tab (THE missing writer for plannedEnrollmentByGrade, powering
// enrollment_vs_plan for non-driver schools).
//
// School-scoped. Gated CLIENT-SIDE by the 'planning' module (StrategyPage
// pattern); the budget/forecast endpoints themselves shipped under finance and
// stay ungated — this page is presentation, not a new gate.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LineChart, Wallet, TrendingUp, ClipboardCheck, Sprout, ArrowRight } from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter from '../components/domain/DomainCommandCenter.jsx'
import ModuleTabs, { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import AddDataTab from '../components/wizard/AddDataTab.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import ForecastWorkspace from '../components/budget/ForecastWorkspace.jsx'
import { GRADE_ROW } from '../components/budget/driverModel.js'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import { useBilling } from '../context/BillingContext.jsx'
import { useUiV2 } from '../context/UiFlagContext.jsx'
import { useAnalytics, useBudget, useBudgetContext, useForecast, useOperational } from '../hooks/useAnalytics.js'
import { formatMetric } from '../components/analytics/v2/helpers.js'

const money = (n) => {
  if (n == null || !Number.isFinite(n)) return '—'
  const s = `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`
  return n < 0 ? `(${s})` : s
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Sum a sparse per-grade map (planned/driver enrollment grids).
const gridTotal = (grid) =>
  GRADE_ROW.reduce((a, g) => a + (Number.isFinite(Number(grid?.[g])) ? Number(grid[g]) : 0), 0)
const gridCount = (grid) => GRADE_ROW.filter((g) => grid?.[g] != null && grid[g] !== '').length

// ── Light-theme gate panel (StrategyPage pattern) ────────────────────────────
function GatePanel({ notLicensed }) {
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-6 sm:px-10 sm:py-8">
      <BackLink />
      <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
          <LineChart size={26} />
        </span>
        {notLicensed ? (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">
              Planning &amp; Forecasting isn&apos;t on your plan yet
            </h2>
            <p className="max-w-md text-[15px] text-muted">
              Add the Planning &amp; Forecasting module to put the FY-end forecast workspace front and
              center — forecast-vs-budget variance, a grade-by-grade enrollment plan, and plan
              readiness in your morning briefing.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">Your subscription is paused</h2>
            <p className="max-w-md text-[15px] text-muted">Resume your plan to see your forecast.</p>
          </>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════ PAGE ═══════════════════════════════════════════
function PlanningWorkspace() {
  const navigate = useNavigate()
  const uiV2 = useUiV2()
  const { activeSchool } = useSchools()
  const { periods, activePeriod } = usePersistence()
  const { entitled, hasModule } = useBilling()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  // Period derivation — the AddDataTab/DataHub idiom incl. the school-swap race guard.
  const defaultPeriodId =
    ((periods || []).some((p) => p.id === activePeriod?.id) ? activePeriod?.id : null) ??
    (periods || []).find((p) => p.hasSnapshot)?.id ??
    (periods || [])[0]?.id ??
    null
  const [derivedPeriodId, setDerivedPeriodId] = useState(null)
  const [lastSchoolId, setLastSchoolId] = useState(schoolId)
  if (schoolId !== lastSchoolId) {
    setLastSchoolId(schoolId)
    setDerivedPeriodId(null)
  }
  const periodValid = derivedPeriodId != null && (periods || []).some((p) => p.id === derivedPeriodId)
  if (defaultPeriodId && !periodValid) setDerivedPeriodId(defaultPeriodId)
  const periodId = derivedPeriodId
  const periodLabel = (periods || []).find((p) => p.id === periodId)?.label || 'this period'

  // Existing reads only — the exact envelopes the Data hub already wires.
  const { metrics, loading: metricsLoading, reload: reloadMetrics } = useAnalytics(schoolId, periodId)
  const { budget } = useBudget(schoolId, periodId)
  const { context: budgetContext } = useBudgetContext(schoolId, periodId)
  const { forecast, hasBudget, loading: forecastLoading, refetch: refetchForecast } = useForecast(schoolId, periodId)
  const { operational } = useOperational(schoolId, periodId)

  // The embedded workspace saves through ITS OWN useForecast copy — relight this
  // page's copies (KPI row, plan readiness, attention rail, outlook) on save, or
  // a first-ever forecast would sit behind stale '—' KPIs until a full reload.
  const onForecastSaved = useCallback(() => {
    reloadMetrics()
    refetchForecast()
  }, [reloadMetrics, refetchForecast])

  const m = useMemo(() => {
    const map = {}
    for (const x of metrics) map[x.key] = x
    return map
  }, [metrics])
  const fvb = m.forecast_vs_budget_net
  const fom = m.forecast_operating_margin
  const readiness = m.plan_readiness
  const readyCount = Number.isFinite(readiness?.value) ? Math.round(readiness.value * 3) : null

  // Display stats straight off the GET envelopes (display, not metrics).
  const fKpis = forecast?.projected?.kpis ?? null
  const forecastNet =
    num(fKpis?.totalRevenue) != null && num(fKpis?.totalExpense) != null
      ? num(fKpis.totalRevenue) - num(fKpis.totalExpense)
      : null
  const budgetNet =
    num(budget?.totalRevenue) != null && num(budget?.totalExpenses) != null
      ? num(budget.totalRevenue) - num(budget.totalExpenses)
      : null

  // Plan sources — driver grid first (the active plan), then the free field.
  const driverGrid = budget?.lines?.driverModel?.assumptions?.enrollmentByGrade ?? null
  const driverPlanTotal = driverGrid ? gridTotal(driverGrid) : 0
  const hasDriverPlan = driverGrid != null && driverPlanTotal > 0
  const freeGrid = operational?.plannedEnrollmentByGrade ?? null
  const freePlanTotal = freeGrid ? gridTotal(freeGrid) : 0
  const hasFreePlan = freeGrid != null && freePlanTotal > 0
  const hasPlan = hasDriverPlan || hasFreePlan

  // ── KPI row ────────────────────────────────────────────────────────────────
  const kpis = useMemo(
    () => [
      {
        label: 'Forecast vs. budget',
        value: fvb?.value != null ? formatMetric(fvb) : '—',
        status: fvb?.status ?? 'neutral',
        sub: {
          icon: TrendingUp,
          text: fvb?.value != null ? 'of budgeted revenue vs. the budgeted net' : 'needs a budget + forecast',
          tone: fvb?.status === 'risk' ? 'bad' : fvb?.status === 'good' ? 'good' : 'neutral',
        },
      },
      {
        label: 'Forecast margin',
        value: fom?.value != null ? formatMetric(fom) : '—',
        status: fom?.status ?? 'neutral',
        sub: {
          icon: TrendingUp,
          text: 'projected FY-end, not actuals',
          tone: fom?.status === 'risk' ? 'bad' : fom?.status === 'good' ? 'good' : 'neutral',
        },
      },
      {
        label: 'Plan readiness',
        value: readyCount != null ? `${readyCount} of 3` : '—',
        status: readiness?.status ?? 'neutral',
        sub: {
          icon: ClipboardCheck,
          text: 'budget · forecast · enrollment plan',
          tone: readiness?.status === 'risk' ? 'bad' : readiness?.status === 'good' ? 'good' : 'neutral',
        },
      },
      {
        label: 'Forecast net',
        value: money(forecastNet),
        status: 'neutral',
        sub: { icon: LineChart, text: 'from the saved forecast', tone: 'neutral' },
      },
      {
        label: 'Budget net',
        value: money(budgetNet),
        status: 'neutral',
        sub: { icon: Wallet, text: 'from the active budget', tone: 'neutral' },
      },
    ],
    [fvb, fom, readiness, readyCount, forecastNet, budgetNet],
  )

  // ── Needs attention (completeness — variance severity is the band's job) ───
  const attentionItems = useMemo(() => {
    const items = []
    if (!hasBudget && !forecastLoading) {
      items.push({
        id: 'no-budget',
        tone: 'watch',
        title: `No budget saved for ${periodLabel}`,
        why: 'The forecast needs a base budget to vary against.',
        actions: [{ label: 'Set up budget', primary: true, onClick: () => navigate('/budget') }],
      })
    }
    if (hasBudget && !forecast && !forecastLoading) {
      items.push({
        id: 'no-forecast',
        tone: 'watch',
        title: 'No FY-end forecast saved yet',
        why: 'Revise your assumptions below and save to project where the year lands.',
        actions: [
          {
            label: 'Open the workspace',
            primary: true,
            onClick: () =>
              document.getElementById('forecast-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
          },
        ],
      })
    }
    if (!hasPlan && operational) {
      items.push({
        id: 'plan-missing',
        tone: 'neutral',
        title: 'No enrollment plan for this period',
        why: 'A grade-by-grade plan powers the actual-vs-plan metric — no driver budget required.',
        actions: canEdit
          ? [{ label: 'Add the plan', primary: false, onClick: () => navigate('/planning?tab=add') }]
          : [],
      })
    }
    return items
  }, [hasBudget, forecast, forecastLoading, hasPlan, operational, periodLabel, canEdit, navigate])

  // ── Multi-year outlook (display-only; from the saved forecast's assumptions) ─
  const outlook = useMemo(() => {
    const rev = num(fKpis?.totalRevenue)
    const exp = num(fKpis?.totalExpense)
    if (rev == null || exp == null) return null
    const infl = num(forecast?.assumptions?.inflationPct)
    const g = infl != null ? infl / 100 : 0
    return [1, 2, 3].map((n) => {
      const f = Math.pow(1 + g, n)
      return { n, revenue: rev * f, expense: exp * f, net: rev * f - exp * f }
    })
  }, [fKpis, forecast])

  // ── Register slot: plan summary + outlook + the driver-path link card ──────
  const registerTable = (
    <div className="flex flex-col gap-4">
      {/* Enrollment-plan summary */}
      <div className="rounded-xl border border-rule/50 bg-cream/40 p-4">
        <div className="mb-1 flex items-center gap-2">
          <Sprout size={15} className="text-muted" />
          <h3 className="font-serif text-[15px] font-semibold text-navy">Enrollment plan</h3>
        </div>
        {hasDriverPlan ? (
          <p className="text-[13.5px] leading-relaxed text-muted">
            Your driver budget&rsquo;s enrollment grid is the <b className="text-navy">active plan</b> —{' '}
            <b className="text-navy">{driverPlanTotal.toLocaleString()}</b> students planned.
            {hasFreePlan
              ? ` The grade grid here (${freePlanTotal.toLocaleString()} students) is the fallback.`
              : ' The grade grid on the Add tab is the fallback.'}
          </p>
        ) : hasFreePlan ? (
          <p className="text-[13.5px] leading-relaxed text-muted">
            <b className="text-navy">{freePlanTotal.toLocaleString()}</b> students planned across{' '}
            {gridCount(freeGrid)} grades — powering actual-vs-plan.
          </p>
        ) : (
          <p className="text-[13.5px] leading-relaxed text-muted">
            No plan yet — set a grade-by-grade target and the actual-vs-plan metric lights up.
          </p>
        )}
        {canEdit && (
          <Link
            to="?tab=add"
            className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-navy-soft hover:text-navy"
          >
            {hasFreePlan ? 'Edit the grade grid' : 'Set the plan'} <ArrowRight size={13} />
          </Link>
        )}
      </div>

      {/* Multi-year outlook — projection, never presented as saved data */}
      <div className="rounded-xl border border-rule/50 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-[15px] font-semibold text-navy">Multi-year outlook</h3>
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-amber-700">
            Projection — not saved data
          </span>
        </div>
        {outlook ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                  <th className="py-1.5 pr-3">Year</th>
                  <th className="py-1.5 pr-3 text-right">Revenue</th>
                  <th className="py-1.5 pr-3 text-right">Expense</th>
                  <th className="py-1.5 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {outlook.map((r) => (
                  <tr key={r.n} className="border-t border-rule/50">
                    <td className="py-1.5 pr-3 text-ink">FY +{r.n}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-ink">{money(r.revenue)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-ink">{money(r.expense)}</td>
                    <td className={`py-1.5 text-right font-semibold tabular-nums ${r.net < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {money(r.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12px] italic text-muted">
              The saved forecast rolled forward at its own inflation assumption — a directional
              sketch, not a plan.
            </p>
          </div>
        ) : (
          <p className="text-[13.5px] italic text-muted">
            Save an FY-end forecast below and the outlook sketches the next three years.
          </p>
        )}
      </div>

      {/* Driver-path link-through */}
      <Link
        to="/budget"
        className="group flex items-center justify-between gap-3 rounded-xl border border-rule/50 p-4 transition-colors hover:border-gold/60"
      >
        <div>
          <h3 className="font-serif text-[15px] font-semibold text-navy">Build the budget with drivers</h3>
          <p className="text-[13px] text-muted">
            Enrollment × tuition × staffing assumptions — the Budget wizard&rsquo;s driver path.
          </p>
        </div>
        <ArrowRight size={16} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  )

  // ── Gate / loading ─────────────────────────────────────────────────────────
  if (!hasModule('planning')) return <GatePanel notLicensed={entitled} />
  if (metricsLoading && !metrics.length && forecastLoading) {
    return (
      <div className="mx-auto max-w-page px-4 py-10 sm:px-10">
        <div className="h-64 animate-pulse rounded-3xl bg-section" />
      </div>
    )
  }

  const commandCenter = (
    <>
      <DomainCommandCenter
        showAddData={canEdit}
        eyebrow="Domain · Planning & Forecasting · where the year is heading"
        title="Planning & Forecasting"
        Icon={LineChart}
        attentionCount={attentionItems.length}
        kpis={kpis}
        tabs={[]}
        registerTitle="Plan summary & outlook"
        registerTable={registerTable}
        attentionItems={attentionItems}
      />
      {/* The FY-end forecast workspace — the SAME component the Data hub embeds
          (second mount, zero fork; key-remounted per school:period). */}
      <section id="forecast-workspace" className="mx-auto max-w-page px-4 pb-10 sm:px-10">
        <div className="mb-3">
          <h2 className="font-serif text-xl font-semibold text-navy">FY-end forecast workspace</h2>
          <p className="text-[13.5px] text-muted">
            Revise your assumptions and incoming students, then save — the server recomputes and the
            variance lands in your KPIs and briefing.
          </p>
        </div>
        {periodId ? (
          <ForecastWorkspace
            key={`planning-forecast-${schoolId}:${periodId}`}
            schoolId={schoolId}
            periodId={periodId}
            canEdit={canEdit}
            budget={budget}
            budgetContext={budgetContext}
            onSaved={onForecastSaved}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-10 text-center text-[14px] italic text-muted">
            Add a period first — the forecast projects a specific fiscal year.
          </p>
        )}
      </section>
    </>
  )

  if (uiV2) {
    return (
      <ModuleAccent moduleKey="planning">
        <ModuleTabs
          moduleKey="planning"
          overview={commandCenter}
          addData={<AddDataTab module="planning" schoolId={schoolId} periodId={periodId} canEdit={canEdit} />}
        />
      </ModuleAccent>
    )
  }
  return commandCenter
}

export default function PlanningPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <PlanningWorkspace />
    </div>
  )
}

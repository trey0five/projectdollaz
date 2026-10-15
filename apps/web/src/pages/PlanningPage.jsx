// ─────────────────────────────────────────────────────────────────────────────
// Planning & Forecasting route (Phase 6) — the planning module's DOMAIN COMMAND
// CENTER at /planning, on EXISTING endpoints only (zero new API): the planning
// metrics (forecast_vs_budget_net · forecast_operating_margin · plan_readiness)
// as Stats in the command center's StatStrip plus display-only Forecast/Budget net $ stats from the
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
//
// AURORA (2026-10-15): the planning band (one plain sentence on where the
// forecast lands against the budget, Add data + Forecast + Budget, glass
// cards), Needs attention as one row of tiles right under it (wideRegister),
// the FY-end forecast workspace as the page's register section
// (id="forecast-workspace" — the KYRO guide anchor), the multi-year outlook
// only once a forecast is saved, a "Go further" tile row, then How this works.
// The budget figure in the band is summed from the same per-category lines as
// the workspace's Budget column, so the two can never disagree.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart,
  Wallet,
  TrendingUp,
  ClipboardCheck,
  Sprout,
  Scale,
  Percent,
  CreditCard,
  Calculator,
  Compass,
  Telescope,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter, { DomainStatePanel } from '../components/domain/DomainCommandCenter.jsx'
import ModuleTabs, { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import AddDataTab from '../components/wizard/AddDataTab.jsx'
import {
  AuroraButton,
  AuroraEmpty,
  AuroraSection,
  AuroraTile,
  AuroraTileGrid,
  HowThisWorks,
  VerdictEm,
  compactDollar,
  fyLabel,
} from '../components/ui/aurora/index.js'
import ForecastWorkspace from '../components/budget/ForecastWorkspace.jsx'
import { GRADE_ROW } from '../components/budget/driverModel.js'
import { REVENUE_LINE_KEYS, EXPENSE_LINE_KEYS } from '@finrep/analytics'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import { useBilling } from '../context/BillingContext.jsx'
import { useUiV2 } from '../context/UiFlagContext.jsx'
import { useAnalytics, useBudget, useBudgetContext, useForecast, useOperational } from '../hooks/useAnalytics.js'
import { formatMetric } from '../components/analytics/v2/helpers.js'
import { DataTable, Pill } from '../components/ui/surface/index.js'
import '../styles/pending/b1-domain.css'

const money = (n) => {
  if (n == null || !Number.isFinite(n)) return '—'
  const s = `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`
  return n < 0 ? `(${s})` : s
}

/** "$430,000" — whole dollars, no sign (the sentence says ahead / short). */
const dollars = (n) => `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Sum a sparse per-grade map (planned/driver enrollment grids).
const gridTotal = (grid) =>
  GRADE_ROW.reduce((a, g) => a + (Number.isFinite(Number(grid?.[g])) ? Number(grid[g]) : 0), 0)
// Sum a budget-lines map over the canonical line keys — the SAME sum the
// forecast workspace's Budget column uses, so the band can never disagree with it.
const sumLines = (map, keys) => keys.reduce((a, k) => a + (Number(map?.[k]) || 0), 0)
const gridCount = (grid) => GRADE_ROW.filter((g) => grid?.[g] != null && grid[g] !== '').length

// ── Gate: the Aurora band + one line + one button ───────────────────────────
function GatePanel({ notLicensed }) {
  const { activeSchool } = useSchools()
  const isOwner = activeSchool?.role === 'owner'
  return (
    <DomainStatePanel
      showBack
      moduleKey="planning"
      title="Planning & Forecasting"
      Icon={LineChart}
      icon={LineChart}
      verdict={notLicensed ? 'Planning & Forecasting isn\u2019t on your plan yet.' : 'Your subscription is paused.'}
      primaryAction={
        <AuroraButton
          variant="primary"
          to={isOwner ? '/settings/billing' : '/settings'}
          icon={<CreditCard size={19} aria-hidden="true" />}
        >
          {notLicensed ? 'See plans' : 'Resume your plan'}
        </AuroraButton>
      }
      text={
        notLicensed
          ? 'Add Planning & Forecasting to see where the year lands against your budget.'
          : 'Resume your plan to see your forecast.'
      }
    />
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
  // The budget's "left over" is read from the SAME per-category lines the
  // workspace's Budget column sums. When the saved totals and those lines
  // disagree (or the lines are not split by category yet), the page shows no
  // headline budget figure rather than two different ones on one screen.
  const lineRev = sumLines(budget?.lines?.revenue, REVENUE_LINE_KEYS)
  const lineExp = sumLines(budget?.lines?.expense, EXPENSE_LINE_KEYS)
  const linesSplit = lineRev !== 0 && lineExp !== 0
  const headerNet =
    num(budget?.totalRevenue) != null && num(budget?.totalExpenses) != null
      ? num(budget.totalRevenue) - num(budget.totalExpenses)
      : null
  const lineNet = linesSplit ? lineRev - lineExp : null
  const budgetNet =
    lineNet != null && (headerNet == null || Math.abs(lineNet - headerNet) < 1) ? lineNet : null
  const budgetUnsplit = budgetNet == null && (headerNet != null || lineRev !== 0 || lineExp !== 0)

  // Plan sources — driver grid first (the active plan), then the free field.
  const driverGrid = budget?.lines?.driverModel?.assumptions?.enrollmentByGrade ?? null
  const driverPlanTotal = driverGrid ? gridTotal(driverGrid) : 0
  const hasDriverPlan = driverGrid != null && driverPlanTotal > 0
  const freeGrid = operational?.plannedEnrollmentByGrade ?? null
  const freePlanTotal = freeGrid ? gridTotal(freeGrid) : 0
  const hasFreePlan = freeGrid != null && freePlanTotal > 0
  const hasPlan = hasDriverPlan || hasFreePlan

  // ── KPI row ────────────────────────────────────────────────────────────────
  // The first four are the band's glass cards; the margin rides as a chip.
  const kpis = useMemo(() => {
    const k = [
      {
        label: 'Forecast vs. budget',
        icon: Scale,
        value: fvb?.value != null ? formatMetric(fvb) : '—',
        status: fvb?.status ?? 'neutral',
        sub: {
          icon: TrendingUp,
          text: fvb?.value != null ? 'gap, as a share of budgeted income' : 'needs a budget and a forecast',
          tone: fvb?.status === 'risk' ? 'bad' : fvb?.status === 'good' ? 'good' : 'neutral',
        },
      },
      {
        label: 'Forecast margin',
        icon: Percent,
        value: fom?.value != null ? formatMetric(fom) : '—',
        status: fom?.status ?? 'neutral',
        sub: {
          icon: TrendingUp,
          text: 'where the year should end',
          tone: fom?.status === 'risk' ? 'bad' : fom?.status === 'good' ? 'good' : 'neutral',
        },
      },
      {
        label: 'Plan readiness',
        icon: ClipboardCheck,
        value: readyCount != null ? String(readyCount) : '—',
        unit: readyCount != null ? 'of 3' : null,
        status: readiness?.status ?? 'neutral',
        sub: {
          icon: ClipboardCheck,
          text: 'budget, forecast, enrollment plan',
          tone: readiness?.status === 'risk' ? 'bad' : readiness?.status === 'good' ? 'good' : 'neutral',
        },
      },
      {
        label: 'Forecast left over',
        icon: LineChart,
        value: forecastNet != null && Number.isFinite(forecastNet) ? compactDollar(forecastNet) : '—',
        status: 'neutral',
        sub: { icon: LineChart, text: 'from the saved forecast', tone: 'neutral' },
      },
      {
        label: 'Budget left over',
        icon: Wallet,
        value: budgetNet != null && Number.isFinite(budgetNet) ? compactDollar(budgetNet) : '—',
        status: 'neutral',
        sub: {
          icon: Wallet,
          text: budgetUnsplit ? 'lines not split by category yet' : 'from the active budget',
          tone: 'neutral',
        },
      },
    ]
    return [k[0], k[2], k[3], k[4], k[1]]
  }, [fvb, fom, readiness, readyCount, forecastNet, budgetNet, budgetUnsplit])

  // ── Needs attention (completeness — variance severity is the band's job) ───
  const attentionItems = useMemo(() => {
    const items = []
    if (!hasBudget && !forecastLoading) {
      items.push({
        id: 'no-budget',
        tone: 'watch',
        title: `No budget saved for ${periodLabel}`,
        why: 'The forecast needs a budget to compare against.',
        actions: [{ label: 'Set up budget', primary: true, onClick: () => navigate('/budget') }],
      })
    }
    if (hasBudget && !forecast && !forecastLoading) {
      items.push({
        id: 'no-forecast',
        tone: 'watch',
        title: 'No FY-end forecast saved yet',
        why: 'Adjust the numbers below and save to see where the year lands.',
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
        why: 'Add students by grade to track against plan.',
        actions: canEdit
          ? [{ label: 'Add the plan', primary: false, onClick: () => navigate('/planning?tab=add') }]
          : [],
      })
    }
    return items
  }, [hasBudget, forecast, forecastLoading, hasPlan, operational, periodLabel, canEdit, navigate])

  // ── The band's one sentence (real figures only) ───────────────────────────
  // The forecast against the budget is the page's question. Ahead / short is a
  // sign, not an invented target; the metric's own band (fvb.status) colours
  // it when there is one.
  const fy = periodId ? fyLabel(periodLabel) : 'The year'
  const verdict = useMemo(() => {
    const ends = (n) => (
      <VerdictEm>{n < 0 ? `${dollars(n)} short` : `${dollars(n)} left over`}</VerdictEm>
    )
    if (forecastNet != null && budgetNet != null) {
      const gap = forecastNet - budgetNet
      if (Math.round(gap) === 0) {
        return (
          <>
            The forecast has {fy} ending with {ends(forecastNet)},{' '}
            <VerdictEm tone={['good', 'watch', 'risk'].includes(fvb?.status) ? fvb.status : null}>
              in line with the budget
            </VerdictEm>
            .
          </>
        )
      }
      const tone =
        fvb?.status === 'risk' || fvb?.status === 'watch' || fvb?.status === 'good'
          ? fvb.status
          : gap < 0
            ? 'watch'
            : null
      return (
        <>
          The forecast has {fy} ending with {ends(forecastNet)},{' '}
          <VerdictEm tone={tone}>
            {dollars(gap)} {gap < 0 ? 'behind' : 'ahead of'} the budget
          </VerdictEm>
          .
        </>
      )
    }
    if (forecastNet != null) {
      return (
        <>
          The forecast has {fy} ending with {ends(forecastNet)}.
          {budgetUnsplit ? <> Budget lines aren&rsquo;t split by category yet.</> : null}
        </>
      )
    }
    if (budgetUnsplit) {
      return (
        <>
          Budget lines aren&rsquo;t split by category yet.{' '}
          {forecast ? null : <VerdictEm tone="watch">No forecast saved yet.</VerdictEm>}
        </>
      )
    }
    if (budgetNet != null) {
      return (
        <>
          The budget plans {fy} to end with {ends(budgetNet)}.{' '}
          <VerdictEm tone="watch">No forecast saved yet.</VerdictEm>
        </>
      )
    }
    return <>Save a budget, then a forecast, and this page shows where {fy === 'The year' ? 'the year' : fy} lands.</>
  }, [forecastNet, budgetNet, budgetUnsplit, forecast, fvb, fy])

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

  // ── The multi-year outlook (a projection, never saved data). Rendered only
  // when a saved forecast exists, BELOW the workspace — an empty outlook must
  // never push the place the user actually works further down the page. ──
  const outlookBody = outlook ? (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink2">Next three years, if costs and income grow as forecast</p>
        <Pill variant="status" tone="watch">
          Projection, not saved data
        </Pill>
      </div>
      <DataTable
        caption="Multi-year outlook (projection)"
        rowKey="n"
        rows={outlook}
        columns={[
          { key: 'n', header: 'Year', render: (r) => `FY +${r.n}` },
          { key: 'revenue', header: 'Income', num: true, render: (r) => money(r.revenue) },
          { key: 'expense', header: 'Spending', num: true, render: (r) => money(r.expense) },
          {
            key: 'net',
            header: 'Left over',
            num: true,
            render: (r) => (
              <span className="inline-flex items-center justify-end gap-1.5 font-semibold">
                <i className={`mark ${r.net < 0 ? 'tone-risk' : 'tone-good'}`} aria-hidden="true" />
                {money(r.net)}
              </span>
            ),
          },
        ]}
      />
    </div>
  ) : null

  const scrollToForecast = () =>
    document.getElementById('forecast-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // The enrollment plan, said in one line (driver grid first — the active plan).
  const planTile = hasDriverPlan
    ? { title: `${driverPlanTotal.toLocaleString()} students planned`, desc: 'From your driver budget.' }
    : hasFreePlan
      ? {
          title: `${freePlanTotal.toLocaleString()} students planned`,
          desc: `Across ${gridCount(freeGrid)} grades.`,
        }
      : { title: 'Enrollment plan', desc: 'No plan yet. Set one by grade.' }

  // ── Gate / loading ─────────────────────────────────────────────────────────
  if (!hasModule('planning')) return <GatePanel notLicensed={entitled} />
  if (metricsLoading && !metrics.length && forecastLoading) {
    return (
      <DomainStatePanel
        moduleKey="planning"
        title="Planning & Forecasting"
        Icon={LineChart}
        icon={LineChart}
        busy
        verdict="Loading your forecast…"
        text="Reading your budget and forecast."
      />
    )
  }

  // The FY-end forecast workspace — the SAME component the Data hub embeds
  // (second mount, zero fork; key-remounted per school:period). It is the
  // page's register: it sits right under Needs attention. The id is the KYRO
  // guide anchor and the "Open the workspace" scroll target (scroll-mt keeps
  // the section's heading strip in view). No side inset: the register card
  // already pads, and every pixel goes to the variance table.
  const workspace = (
    <div id="forecast-workspace" className="min-w-0 scroll-mt-32 py-2 sm:py-3">
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
        <AuroraEmpty icon={LineChart} text="Add a year first." sub="The forecast projects one fiscal year." />
      )}
    </div>
  )

  const commandCenter = (
    <>
      <DomainCommandCenter
        showAddData={canEdit}
        moduleKey="planning"
        eyebrow={periodId ? fyLabel(periodLabel) : null}
        title="Planning & Forecasting"
        Icon={LineChart}
        verdict={verdict}
        attentionCount={attentionItems.length}
        kpis={kpis}
        tabs={[]}
        wideRegister
        registerTitle="Year-end forecast"
        registerSubtitle="Adjust, then save. The gap shows above."
        registerIcon={LineChart}
        registerTable={workspace}
        attentionItems={attentionItems}
        actions={
          <>
            <AuroraButton onClick={scrollToForecast} icon={<LineChart size={19} aria-hidden="true" />}>
              Forecast
            </AuroraButton>
            <AuroraButton to="/budget" icon={<Wallet size={19} aria-hidden="true" />}>
              Budget
            </AuroraButton>
          </>
        }
      />
      <div className="au-scope mx-auto max-w-page px-4 pb-10 sm:px-10">
        {outlookBody ? (
          <AuroraSection icon={Telescope} title="Outlook" subtitle="A three-year sketch from your forecast">
            <div className="au-card au-card-flat min-w-0 p-4 sm:p-6">{outlookBody}</div>
          </AuroraSection>
        ) : null}

        <AuroraSection icon={Compass} title="Go further" subtitle="The plans behind the forecast">
          <AuroraTileGrid cols={3}>
            <AuroraTile
              icon={Sprout}
              title={planTile.title}
              desc={planTile.desc}
              to={hasDriverPlan ? '/budget' : canEdit ? '?tab=add' : undefined}
            />
            <AuroraTile
              icon={Calculator}
              title="Budget"
              desc={
                budgetNet != null
                  ? `Plans ${dollars(budgetNet)} ${budgetNet < 0 ? 'short' : 'left over'}. Build it with drivers.`
                  : 'Build it with drivers: students, tuition, staff.'
              }
              to="/budget"
            />
            <AuroraTile icon={TrendingUp} title="Cash forecast" desc="When cash may run low, and why." to="/cash-flow" />
          </AuroraTileGrid>
        </AuroraSection>

        <HowThisWorks>
          <p>
            The forecast starts from your budget for {periodLabel}. Change the numbers, save, and the gap to the budget
            shows in the band and in your morning briefing.
          </p>
          <p>
            The outlook rolls the saved forecast forward at its own inflation rate. It is a sketch, not a plan, and is
            never saved as data.
          </p>
          <p>Plan readiness counts three things: a budget, a saved forecast and an enrollment plan.</p>
        </HowThisWorks>
      </div>
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

// ─────────────────────────────────────────────────────────────────────────────
// FinancePage (/finance) — the Finance MODULE HOME. A composition/aggregation page
// over the SAME read hooks the individual finance sub-pages use: it summarizes the
// headline of each of the five finance sub-modules (Statements, Analytics, Budget,
// Reports, Readiness), deep-links into each, and surfaces the AI narrative (the
// Penny insight) of "what is going on" via the shared HomeHero InsightBand.
//
// FRONT-END ONLY — no new endpoints, no fabricated figures. Every number comes
// from an existing hook; a missing datum degrades to a dash or a link-through,
// never a made-up value. School-scoped v1 (org finance lives on Home + Budget org
// tabs). Structure/gates/skeleton/microtask-deferred-default mirror HomeDashboard
// and AnalyticsDashboard exactly.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  CircleDollarSign,
  FileStack,
  BarChart3,
  Wallet,
  FileBarChart2,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Scale,
} from 'lucide-react'
import { useSchools } from '../context/SchoolContext.jsx'
import { useBilling } from '../context/BillingContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import { useUiV2 } from '../context/UiFlagContext.jsx'
import ModuleTabs from '../components/module/ModuleTabs.jsx'
import { moduleHue } from '../components/module/moduleAnatomy.js'
import AddDataTab from '../components/wizard/AddDataTab.jsx'
import { useAnalytics, useInsights, useBudget } from '../hooks/useAnalytics.js'
import { useCompliance } from '../hooks/useCompliance.js'
import { metricFormat, formatMetricValue } from '../lib/metricMeta.js'
import { fmtDollar } from '../lib/format.js'
import StatusDot from '../components/analytics/StatusDot.jsx'
import DeltaChip from '../components/analytics/DeltaChip.jsx'
import EntitlementPausedPanel from '../components/analytics/EntitlementPausedPanel.jsx'
import { HeadlineSkeleton, MetricCardSkeleton } from '../components/analytics/skeletons.jsx'
import HomeHero from '../components/home/HomeHero.jsx'
import BoardPacketExportButton from '../components/reports/BoardPacketExportButton.jsx'

const VITAL_KEYS = ['operating_margin', 'days_cash_on_hand', 'months_operating_reserve']

// A budgeted line amount, read straight from the saved budget JSON (null if unset).
// Mirrors BudgetVsActual.budOf so the variance summary here matches that tab.
function budOf(lines, kind, key) {
  const v = lines?.[kind]?.[key]
  return Number.isFinite(Number(v)) ? Number(v) : null
}

// ── Page header (mirrors AnalyticsDashboard's PageHeader) ─────────────────────
function FinanceHeader() {
  // Under v2 the ModuleTabs shell already renders the "Back to dashboard" link,
  // so this header omits its own to avoid a duplicate; v1 (standalone page, no
  // ModuleTabs) keeps it.
  const uiV2 = useUiV2()
  return (
    <div className="mb-6">
      {!uiV2 && (
        <Link
          to="/app"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted transition-colors hover:text-navy"
        >
          <ArrowLeft size={14} /> Back to dashboard
        </Link>
      )}
      <div className={`${uiV2 ? '' : 'mt-3 '}flex items-center gap-3`}>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-gradient text-navy shadow-glow">
          <CircleDollarSign size={22} />
        </span>
        <div>
          <h1 className="font-serif text-2xl font-semibold text-navy sm:text-[28px]">Finance</h1>
          <p className="text-[15px] text-muted">Your finance command center</p>
        </div>
      </div>
    </div>
  )
}

// ── A reusable section card, styled like the HOME module tiles: the whole card
// is clickable (a stretched link) and the finance-hue color-flood sweeps in on
// hover (module-tile / module-tile--panel in home-tiles.css). Inner links or
// buttons in the body stay independently clickable above the stretched hit.
// Module-scope helper (React-compiler discipline). ──────────────────────────────
function SectionCard(props) {
  const { to, title, viewLabel, children } = props
  const SectionIcon = props.Icon
  return (
    <div
      className="module-tile module-tile--panel"
      style={{ '--tile-hue': moduleHue('finance') }}
    >
      <Link to={to} className="tile-panel-hit" aria-label={`Open ${title}`} />
      <div className="tile-body">
        <div className="flex items-center gap-2.5">
          <span className="tile-art">
            <SectionIcon size={18} />
          </span>
          <h3 className="tile-title font-serif text-lg font-semibold text-navy">{title}</h3>
          <span className="tile-arrow ml-auto">
            <ArrowRight size={16} />
          </span>
        </div>
        <div className="flex-1">{children}</div>
        <span className="inline-flex items-center gap-1 text-[13px] font-bold uppercase tracking-[0.08em] text-gold">
          {viewLabel} <ArrowRight size={13} />
        </span>
      </div>
    </div>
  )
}

// ── ui.v2 Records panel: a link board into the finance sub-registers (Statements,
// Cash & Collections, Budget). Pure navigation — reuses SectionCard, no new API. ──
function FinanceRecords() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-10 sm:py-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SectionCard to="/statements" Icon={FileStack} title="Statements" viewLabel="Open statements">
          <p className="text-[14.5px] text-muted">
            Your financial statements and every saved period.
          </p>
        </SectionCard>
        <SectionCard to="/cash" Icon={CircleDollarSign} title="Cash & Collections" viewLabel="Open cash">
          <p className="text-[14.5px] text-muted">
            Cash position, runway, and collections aging.
          </p>
        </SectionCard>
        <SectionCard to="/budget" Icon={Wallet} title="Budget" viewLabel="Open budget">
          <p className="text-[14.5px] text-muted">Budget vs. actual and the annual spread.</p>
        </SectionCard>
      </div>
    </div>
  )
}

// ── ui.v2 Reports panel: the Reports workspace + board-packet export + the print
// documents. Finance is the only module with real report surfaces (locked D2). ──
function FinanceReports({ periodId }) {
  return (
    <div className="mx-auto max-w-[1100px] space-y-4 px-4 py-6 sm:px-10 sm:py-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SectionCard to="/reports" Icon={FileBarChart2} title="Reports workspace" viewLabel="Open Reports">
          <p className="mb-3 text-[14.5px] text-muted">
            Export a board-ready finance-committee packet for the selected period, or open the
            Reports workspace.
          </p>
          {periodId && <BoardPacketExportButton periodId={periodId} />}
        </SectionCard>
        <div className="card-soft flex flex-col p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold">
              <FileStack size={18} />
            </span>
            <h3 className="font-serif text-lg font-semibold text-navy">Print documents</h3>
          </div>
          <p className="mt-3 flex-1 text-[14.5px] text-muted">
            Open a print-ready board document in a new tab.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/board-packet/print"
              className="inline-flex items-center gap-1 rounded-lg border border-gold/50 bg-gold/10 px-3 py-1.5 text-[13px] font-semibold text-navy transition hover:bg-gold/20"
            >
              Board packet <ArrowRight size={13} />
            </Link>
            <Link
              to="/reports/board/print"
              className="inline-flex items-center gap-1 rounded-lg border border-gold/50 bg-gold/10 px-3 py-1.5 text-[13px] font-semibold text-navy transition hover:bg-gold/20"
            >
              Board report <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// A single labeled figure row (Statements card). value is a pre-formatted string
// or '—' — NEVER a fabricated number (nulls are dashed upstream).
function FigureRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule/40 py-1.5 last:border-0">
      <span className="text-[14.5px] text-muted">{label}</span>
      <span className="tabular-nums text-[15px] font-semibold text-navy">{value}</span>
    </div>
  )
}

// A single Tier-1 vital row (Analytics card): status dot + label + value + delta.
function VitalRow({ metric }) {
  const available = metric?.available
  const fmt = metric ? metricFormat(metric.key, metric.unit) : 'ratio'
  return (
    <div className="flex items-center gap-2.5 border-b border-rule/40 py-2 last:border-0">
      <StatusDot status={available ? metric.status : 'neutral'} />
      <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink">
        {metric?.label ?? 'Metric'}
      </span>
      <span className="tabular-nums text-[15px] font-semibold text-navy">
        {available ? formatMetricValue(metric.value, fmt) : '—'}
      </span>
      {available && metric.periodOverPeriodDelta != null && (
        <DeltaChip
          delta={metric.periodOverPeriodDelta}
          format={fmt}
          goodDirection={metric.goodDirection}
        />
      )}
    </div>
  )
}

export default function FinancePage() {
  const reduce = useReducedMotion()
  const uiV2 = useUiV2()
  const { activeSchool } = useSchools()
  // v1 is ALWAYS school-scoped — org finance already lives on the consolidated Home
  // and the Budget org roll-up tabs, so we never null the schoolId for org mode.
  const schoolId = activeSchool?.id ?? null
  const { billing, loading: billingLoading, entitled, isOwner } = useBilling()
  const { periods, hydrating } = usePersistence()

  const savedPeriods = useMemo(() => (periods || []).filter((p) => p.hasSnapshot), [periods])

  // Newest saved period default — the microtask-deferred pattern (verbatim from
  // HomeDashboard) so this is not a synchronous setState-in-effect (INVARIANT 6).
  const [selectedPeriodId, setSelectedPeriodId] = useState(null)
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (savedPeriods.length === 0) {
        setSelectedPeriodId((cur) => (cur === null ? cur : null))
      } else {
        setSelectedPeriodId((cur) =>
          savedPeriods.some((p) => p.id === cur) ? cur : savedPeriods[0].id,
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [savedPeriods])

  const { data, metrics, loading: metricsLoading, notEntitled } = useAnalytics(
    schoolId,
    selectedPeriodId,
  )
  const { text: insightText, source: insightSource } = useInsights(schoolId, selectedPeriodId)
  const { summary: complianceSummary } = useCompliance(schoolId, selectedPeriodId)
  const { budget } = useBudget(schoolId, selectedPeriodId)

  const metricsByKey = useMemo(() => {
    const m = {}
    for (const r of metrics) m[r.key] = r
    return m
  }, [metrics])

  // Hero status line: prefer the AI insight, else a compliance-derived line (same
  // composition HomeDashboard uses). null → HomeHero simply hides the InsightBand.
  const statusLine = useMemo(() => {
    if (insightText) return insightText
    if (complianceSummary) {
      const material = complianceSummary.counts?.material ?? 0
      const reportable = complianceSummary.counts?.reportable ?? 0
      if (material > 0)
        return `${material} material finding${material === 1 ? '' : 's'} to address before review.`
      if (reportable > 0)
        return `${reportable} reportable item${reportable === 1 ? '' : 's'} to review.`
      return 'On track for review — no exceptions found.'
    }
    return null
  }, [insightText, complianceSummary])

  // ── Statements key figures (REAL DATA ONLY) ──────────────────────────────────
  // Sourced from the SAME FE metrics BudgetVsActual uses for actuals: revenue_mix
  // .value = total revenue, expense_mix.value = total expense; change in net assets
  // = rev − exp. Gated on `.available` — any unavailable value renders '—', never a
  // fabricated number. Cash / full net-asset balances are NOT cleanly on the FE
  // metrics, so they are deliberately omitted (days_cash_on_hand vital covers cash
  // health); the card is a link-through into /statements for the full statements.
  const revM = metricsByKey.revenue_mix
  const expM = metricsByKey.expense_mix
  const totalRevenue = revM?.available ? revM.value : null
  const totalExpense = expM?.available ? expM.value : null
  const changeInNetAssets =
    totalRevenue != null && totalExpense != null ? totalRevenue - totalExpense : null

  // ── Budget vs actual net variance (REAL DATA ONLY) ───────────────────────────
  // Reproduces BudgetVsActual's derivation: budgeted totals summed over the mix
  // components, actuals from the mix values, net variance = netAct − netBud. Falls
  // to a link-through when there is no budget or the mix/actuals are unavailable —
  // NEVER a variance computed against a zero budget.
  const budgetSummary = useMemo(() => {
    const lines = budget?.lines || {}
    const revLines = revM?.components ?? []
    const expLines = expM?.components ?? []
    const hasLines = revLines.length > 0 || expLines.length > 0
    const budRevTotal = revLines.reduce((a, c) => a + (budOf(lines, 'revenue', c.key) ?? 0), 0)
    const budExpTotal = expLines.reduce((a, c) => a + (budOf(lines, 'expense', c.key) ?? 0), 0)
    const noBudget = budRevTotal === 0 && budExpTotal === 0
    const actualsAvailable = totalRevenue != null && totalExpense != null
    if (!hasLines || noBudget || !actualsAvailable) return { available: false }
    const netBud = budRevTotal - budExpTotal
    const netAct = totalRevenue - totalExpense
    return { available: true, netBud, netAct, netVar: netAct - netBud }
  }, [budget, revM, expM, totalRevenue, totalExpense])

  // ── Readiness counts ─────────────────────────────────────────────────────────
  const material = complianceSummary?.counts?.material ?? 0
  const reportable = complianceSummary?.counts?.reportable ?? 0
  const readinessTone = material > 0 ? 'risk' : reportable > 0 ? 'watch' : 'good'

  // ── The overview panel = gate | loading | empty | full aggregation. Under v2 the
  // whole thing is wrapped in ModuleTabs (so the Add-data tab stays reachable even
  // when finance is empty — the /data redirect lands on /finance?tab=add); flag-off
  // returns the SAME node directly, byte-identical to the original early-returns. ──
  const initialLoading = billingLoading || hydrating
  const vitalsLoading = metricsLoading && !data

  let overview
  if (!billingLoading && (!entitled || notEntitled)) {
    // ── Entitlement gate (mirror AnalyticsDashboard) — FIRST ─────────────────────
    overview = (
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-10 sm:py-8">
        <FinanceHeader />
        <EntitlementPausedPanel />
      </div>
    )
  } else if (initialLoading) {
    // ── Loading skeleton ─────────────────────────────────────────────────────────
    overview = (
      <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 sm:space-y-8 sm:px-10 sm:py-8">
        <HeadlineSkeleton />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  } else if (savedPeriods.length === 0) {
    // ── Empty / onboarding (never blank/500) ─────────────────────────────────────
    overview = (
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-10 sm:py-8">
        <FinanceHeader />
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="card-soft flex flex-col items-center gap-5 px-6 py-14 text-center"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow">
            <CircleDollarSign size={34} />
          </span>
          <div>
            <h2 className="font-serif text-2xl font-semibold text-navy">Light up Finance</h2>
            <p className="mx-auto mt-2 max-w-md text-[16px] leading-relaxed text-muted">
              Add your trial balance in the Data hub — we&apos;ll turn it into your financial
              statements and light up every finance surface here: statements, analytics, budget,
              reports and review readiness.
            </p>
          </div>
          <Link to="/data" className="btn-primary inline-flex items-center gap-2">
            Go to the Data hub <ArrowRight size={16} />
          </Link>
        </motion.div>
      </div>
    )
  } else {
    overview = (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 sm:space-y-8 sm:px-10 sm:py-8">
      <FinanceHeader />

      <HomeHero
        schoolName={activeSchool?.name}
        periods={savedPeriods}
        selectedPeriodId={selectedPeriodId}
        onSelectPeriod={setSelectedPeriodId}
        statusLine={statusLine}
        insightKind={insightText ? insightSource : null}
        billing={billing}
        isOwner={isOwner}
      />

      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        {/* (1) STATEMENTS */}
        <SectionCard to="/statements" Icon={FileStack} title="Statements" viewLabel="View statements">
          <FigureRow
            label="Total revenue"
            value={totalRevenue != null ? formatMetricValue(totalRevenue, 'currency') : '—'}
          />
          <FigureRow
            label="Total expense"
            value={totalExpense != null ? formatMetricValue(totalExpense, 'currency') : '—'}
          />
          <FigureRow
            label="Change in net assets"
            value={
              changeInNetAssets != null ? formatMetricValue(changeInNetAssets, 'currency') : '—'
            }
          />
        </SectionCard>

        {/* (2) ANALYTICS — Tier-1 vitals */}
        <SectionCard
          to="/analytics"
          Icon={BarChart3}
          title="Analytics"
          viewLabel="View analytics"
        >
          {vitalsLoading ? (
            <div className="space-y-2 py-1">
              {VITAL_KEYS.map((k) => (
                <div key={k} className="shimmer-bar h-6 w-full rounded" />
              ))}
            </div>
          ) : (
            VITAL_KEYS.map((k) => <VitalRow key={k} metric={metricsByKey[k]} />)
          )}
        </SectionCard>

        {/* (3) BUDGET — net variance or link-through */}
        <SectionCard to="/budget" Icon={Wallet} title="Budget" viewLabel="View budget">
          {budgetSummary.available ? (
            <div className="flex flex-col gap-2 py-1">
              <span className="text-[14.5px] text-muted">Net vs. budget</span>
              <div className="flex items-center gap-2">
                <Scale size={16} className="text-gold" />
                <span
                  className="tabular-nums text-[19px] font-semibold"
                  style={{ color: budgetSummary.netVar >= 0 ? '#1b7a4b' : '#c0392b' }}
                >
                  {budgetSummary.netVar >= 0 ? '+' : '−'}
                  {fmtDollar(Math.abs(budgetSummary.netVar))}
                </span>
                <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">
                  {budgetSummary.netVar >= 0 ? 'favorable' : 'unfavorable'}
                </span>
              </div>
              <span className="text-[13px] text-muted">
                Actual net {fmtDollar(budgetSummary.netAct)} vs. budget{' '}
                {fmtDollar(budgetSummary.netBud)}
              </span>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-gold/40 bg-gold/[0.04] px-3 py-4 text-[14.5px] text-navy">
              No budget vs. actual yet for this period. Set up your budget in the Data hub to track
              variance.
            </p>
          )}
        </SectionCard>

        {/* (4) REPORTS — board packet export + link */}
        <SectionCard to="/reports" Icon={FileBarChart2} title="Reports" viewLabel="Open Reports">
          <p className="mb-3 text-[14.5px] text-muted">
            Export a board-ready finance-committee packet for the selected period, or open the
            Reports workspace.
          </p>
          {selectedPeriodId && <BoardPacketExportButton periodId={selectedPeriodId} />}
        </SectionCard>

        {/* (5) READINESS — material / reportable counts */}
        <SectionCard
          to="/readiness"
          Icon={ShieldCheck}
          title="Readiness"
          viewLabel="View readiness"
        >
          <div className="flex items-center gap-3 py-1">
            <StatusDot status={readinessTone} size={12} />
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <span className="text-[14.5px] text-ink">
                <span className="tabular-nums text-[18px] font-semibold text-navy">{material}</span>{' '}
                material
              </span>
              <span className="text-[14.5px] text-ink">
                <span className="tabular-nums text-[18px] font-semibold text-navy">
                  {reportable}
                </span>{' '}
                reportable
              </span>
            </div>
          </div>
          <p className="mt-2 text-[13px] text-muted">
            {material > 0
              ? 'Material findings to address before review.'
              : reportable > 0
                ? 'Reportable items to review.'
                : 'On track — no exceptions found.'}
          </p>
        </SectionCard>
      </motion.div>
    </div>
    )
  }

  if (uiV2) {
    return (
      <ModuleTabs
        moduleKey="finance"
        overview={overview}
        addData={
          <AddDataTab
            module="finance"
            schoolId={schoolId}
            periodId={selectedPeriodId}
            canEdit={activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'}
          />
        }
        records={<FinanceRecords />}
        reports={<FinanceReports periodId={selectedPeriodId} />}
      />
    )
  }

  return overview
}

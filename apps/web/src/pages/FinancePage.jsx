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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import {
  CircleDollarSign,
  FileStack,
  BarChart3,
  TrendingUp,
  Wallet,
  FileBarChart2,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  ChevronUp,
  Activity,
} from 'lucide-react'
import { BACK_PILL, BackPillBody } from '../components/ui/BackLink.jsx'
import { AddDataCta, RecordsCta } from '../components/module/ModuleCtas.jsx'
import ModuleOverviewLink from '../components/module/ModuleOverviewLink.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useBilling } from '../context/BillingContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import { useUiV2 } from '../context/UiFlagContext.jsx'
import ModuleTabs from '../components/module/ModuleTabs.jsx'
import AddDataTab from '../components/wizard/AddDataTab.jsx'
import TrialBalanceModalBody from '../components/datahub/TrialBalanceModalBody.jsx'
import LightUpReveal from '../components/finance/LightUpReveal.jsx'
import UploadsSummary from '../components/finance/UploadsSummary.jsx'
import { useAnalytics, useInsights, useBudget } from '../hooks/useAnalytics.js'
import { useCompliance } from '../hooks/useCompliance.js'
import { metricFormat, formatMetricValue, deltaTone, formatDelta, isBandedStatus } from '../lib/metricMeta.js'
import { addDataHref } from '../lib/dataDestinations.js'
import { fmtDollar } from '../lib/format.js'
import AnimatedMetricValue from '../components/analytics/AnimatedMetricValue.jsx'
import { MARK, DELTA_TONE } from '../components/analytics/v2/statusStyle.js'
import EntitlementPausedPanel from '../components/analytics/EntitlementPausedPanel.jsx'
import { HeadlineSkeleton, MetricCardSkeleton } from '../components/analytics/skeletons.jsx'
import { toSignals } from '../components/home/HomeHero.jsx'
import PeriodSelector from '../components/analytics/PeriodSelector.jsx'
import { PageHeader, Pill, Button, Section, Tile, Panel } from '../components/ui/surface/index.js'
import { formatShortDate } from '../lib/format.js'
import BoardPacketExportButton from '../components/reports/BoardPacketExportButton.jsx'

const VITAL_KEYS = ['operating_margin', 'days_cash_on_hand', 'months_operating_reserve']

// ── First-run "what lights up" preview tiles ─────────────────────────────────
// HONESTY RULE: future-tense labels of what WILL appear once the first trial
// balance lands — never numbers, dashes-pretending-to-be-values, or fake
// sparklines. Module scope so the React Compiler treats the list as stable.
const FIRST_RUN_LIGHTS = [
  { Icon: FileStack, title: 'Statements', blurb: 'Your four statements, generated' },
  { Icon: BarChart3, title: 'Analytics', blurb: 'Tier-1 vitals with status' },
  { Icon: Wallet, title: 'Budget', blurb: 'Budget vs. actual' },
  { Icon: FileBarChart2, title: 'Reports', blurb: 'A board-ready packet' },
  { Icon: ShieldCheck, title: 'Readiness', blurb: 'Review readiness' },
]

// A budgeted line amount, read straight from the saved budget JSON (null if unset).
// Mirrors BudgetVsActual.budOf so the variance summary here matches that tab.
function budOf(lines, kind, key) {
  const v = lines?.[kind]?.[key]
  return Number.isFinite(Number(v)) ? Number(v) : null
}

// ── Page header (Premium UI P2, plan sketch 1): eyebrow FINANCE · SCHOOL · FY,
// the title in Garamond, a meta line that carries what the second dark hero
// used to say (the period, the signal count), the period selector + actions on
// the hairline, a 2px finance-blue rule. The "Command center — Welcome back"
// stage that repeated the title below it is gone. ─────────────────────────────
function FinanceHeader({
  onWhatLitUp = null,
  schoolName = null,
  periods = null,
  selectedPeriodId = null,
  onSelectPeriod = null,
  statusLine = null,
  insightKind = null,
  billing = null,
}) {
  // Under v2 the ModuleTabs shell already renders the breadcrumb, so this header
  // omits its own back link; v1 (standalone page, no ModuleTabs) keeps it.
  const uiV2 = useUiV2()
  const period = (periods ?? []).find((p) => p.id === selectedPeriodId) ?? null
  const signals = statusLine && insightKind ? toSignals(statusLine) : []
  const eyebrow = ['Finance', schoolName, period?.label].filter(Boolean).join(' · ')
  const trial =
    billing?.status === 'trialing'
      ? typeof billing.daysLeft === 'number'
        ? `${billing.daysLeft} day${billing.daysLeft === 1 ? '' : 's'} left in trial`
        : 'Free trial'
      : null
  const meta = [
    period ? `Period end ${formatShortDate(period.periodEndDate)}` : null,
    signals.length ? `${signals.length} signal${signals.length === 1 ? '' : 's'}` : null,
    trial,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="mb-2">
      {!uiV2 && (
        <Link to="/app" className={`${BACK_PILL} mb-2`}>
          <BackPillBody label="Back to dashboard" />
        </Link>
      )}
      <PageHeader
        eyebrow={eyebrow}
        title="Finance"
        meta={meta || 'Statements, cash and budget vs. actuals — board-ready.'}
        hue="37 99 235"
        actions={
          <>
            {periods && periods.length > 0 && onSelectPeriod ? (
              <PeriodSelector periods={periods} activeId={selectedPeriodId} onSelect={onSelectPeriod} light />
            ) : null}
            {/* THE REPLAY, ON THE OVERVIEW TOO. The celebration used to be
                reachable only from the first-run screen — the one place a user
                leaves and cannot get back to. Rendered only when there is
                something to show. */}
            {onWhatLitUp && (
              <Button variant="quiet" onClick={onWhatLitUp} icon={<Sparkles size={14} />}>
                What lit up
              </Button>
            )}
            {/* On-page Add-data + Records entries (mirror the sidebar tabs) — v2 only. */}
            {uiV2 && <RecordsCta module="finance" />}
            {uiV2 && <AddDataCta />}
          </>
        }
      />
      {/* The read: the AI / smart insight as a ruled signal list under the
          header — ink on the ground, a 2px semantic mark per line. */}
      {statusLine ? (
        <div className="mt-4 flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-ink2" aria-hidden="true">
            {insightKind ? <Sparkles size={14} /> : <Activity size={14} />}
          </span>
          {signals.length ? (
            <ul className="flex flex-col gap-1.5" aria-label={insightKind === 'llm' ? 'AI insight' : 'Smart insight'}>
              {signals.map((sg, i) => (
                <li key={i} className="flex items-start gap-2.5 text-body text-ink">
                  <Pill variant="status" tone={SIGNAL_TONE[sg.category] ?? 'neutral'} className="mt-0.5 shrink-0">
                    {SIGNAL_LABEL[sg.category] ?? 'Note'}
                  </Pill>
                  <span>{sg.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-ink">{statusLine}</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

const SIGNAL_TONE = { risk: 'risk', watch: 'watch', strength: 'good', neutral: 'neutral' }
const SIGNAL_LABEL = { risk: 'Risk', watch: 'Watch', strength: 'Strength', neutral: 'Note' }

// ── A finance COLUMN (Premium UI P3, plan sketch 1): a `Section` label row, a
// list of ruled figure lines, and ONE quiet ink link under it — no box, no
// stretched hit, no uppercase gold. Six of these sit in `.sec-cols` on the
// ground. Module-scope helper (React-compiler discipline). ───────────────────
function FinanceColumn(props) {
  const { to, title, viewLabel, children } = props
  const ColIcon = props.Icon
  return (
    <Section
      label={
        <span className="inline-flex items-center gap-1.5">
          {ColIcon ? <ColIcon size={13} aria-hidden="true" /> : null}
          {title}
        </span>
      }
      className="min-w-0"
    >
      {children}
      <Link to={to} className="sec-more" aria-label={`${viewLabel} — ${title}`}>
        {viewLabel} <ArrowRight size={13} aria-hidden="true" />
      </Link>
    </Section>
  )
}

// ── ui.v2 Records panel: a link board into the finance sub-registers (Statements,
// Cash & Collections, Budget). Pure navigation — `Tile` is the one card family
// that stays for doors (plan §2.4), no new API. ───────────────────────────────
function FinanceRecords() {
  return (
    <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      <ModuleOverviewLink module="finance" className="mb-3" />
      <p className="mb-4 text-body text-ink2">
        Your finance workspaces — statements, cash, forecast and budget, each one click away.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Tile to="/statements" hue="37 99 235" icon={<FileStack size={22} />} title="Statements" body="Your financial statements and every saved period." />
        <Tile to="/cash" hue="37 99 235" icon={<CircleDollarSign size={22} />} title="Cash & Collections" body="Cash position, runway, and collections aging." />
        {/* The FORWARD view, deliberately its own tile rather than folded into
            Cash & Collections. That page answers "what is outstanding today";
            this one answers "when do we run low" — different questions, and
            burying the second inside the first is how it stops being found. */}
        <Tile to="/cash-flow" hue="37 99 235" icon={<TrendingUp size={22} />} title="Cash Forecast" body="When cash is projected to run low, by how much, and what is driving it." />
        <Tile to="/budget" hue="37 99 235" icon={<Wallet size={22} />} title="Budget" body="Budget vs. actual and the annual spread." />
      </div>
    </div>
  )
}

// ── ui.v2 Reports panel: the Reports workspace + board-packet export + the print
// documents. Finance is the only module with real report surfaces (locked D2). ──
function FinanceReports({ periodId }) {
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-6 sm:px-10 sm:py-8">
      <ModuleOverviewLink module="finance" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Tile to="/reports" hue="37 99 235" icon={<FileBarChart2 size={22} />} title="Reports workspace" body="Export a board-ready finance-committee packet for the selected period, or open the Reports workspace.">
          {periodId && (
            <div className="tile-lift relative z-[2]">
              <BoardPacketExportButton periodId={periodId} />
            </div>
          )}
        </Tile>
        <Tile hue="37 99 235" icon={<FileStack size={22} />} title="Print documents" body="Open a print-ready board document in a new tab." arrow={false}>
          <div className="mt-1 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" to="/board-packet/print">
              Board packet <ArrowRight size={13} />
            </Button>
            <Button variant="secondary" size="sm" to="/reports/board/print">
              Board report <ArrowRight size={13} />
            </Button>
          </div>
        </Tile>
      </div>
    </div>
  )
}

// ── Figure lines for the columns ─────────────────────────────────────────────
// Values at rest are always the real figures (never a fabricated number; nulls
// stay dashed); a numeric figure counts up ONCE on mount (AnimatedMetricValue).

// A single labeled figure line (Statements column): label + tabular value.
function FigureRow({ label, amount, format = 'currency' }) {
  return (
    <div className="fig">
      <span className="fig-label">{label}</span>
      <span className="fig-value">
        {amount == null ? '—' : <AnimatedMetricValue value={format === 'currency' ? Math.round(amount) : amount} format={format} />}
      </span>
    </div>
  )
}

// A single Tier-1 vital line (Analytics column): status mark + label + value + Δ.
function VitalRow({ metric }) {
  const available = metric?.available
  const fmt = metric ? metricFormat(metric.key, metric.unit) : 'ratio'
  const mark = available && isBandedStatus(metric.status) ? MARK[metric.status] : 'neutral'
  const deltaText = available && metric.periodOverPeriodDelta != null ? formatDelta(metric.periodOverPeriodDelta, fmt) : null
  return (
    <div className="fig">
      <span className="fig-label min-w-0">
        <i className={`mark tone-${mark}`} aria-hidden="true" />
        <span className="min-w-0 break-words">{metric?.label ?? 'Metric'}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-2">
        {deltaText ? (
          <Pill variant="status" tone={DELTA_TONE[deltaTone(metric.periodOverPeriodDelta, metric.goodDirection)] ?? 'neutral'}>
            {deltaText}
          </Pill>
        ) : null}
        <span className="fig-value">
          {available ? <AnimatedMetricValue value={metric.value} format={fmt} /> : '—'}
        </span>
      </span>
    </div>
  )
}

export default function FinancePage() {
  const reduce = useReducedMotion()
  const uiV2 = useUiV2()
  const navigate = useNavigate()
  const { activeSchool } = useSchools()
  // v1 is ALWAYS school-scoped — org finance already lives on the consolidated Home
  // and the Budget org roll-up tabs, so we never null the schoolId for org mode.
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const { billing, loading: billingLoading, entitled, hasModule } = useBilling()
  const { periods, hydrating, hydratedFiles, activePeriod, hydrationToken } = usePersistence()

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

  // ── First-run LATCH ─────────────────────────────────────────────────────────
  // The zero-period branch mounts the real 3-slot trial-balance intake, whose own
  // copy invites "last year" and "audited" AFTER the first file lands. Deriving
  // the branch live off savedPeriods made it DELETE ITSELF ~2s into the task: the
  // first snapshot flips savedPeriods > 0, the branch unmounts, and slots 2 and 3
  // vanish while the user is still reading the instructions that offered them.
  // So first-run is latched once it renders, and the user leaves it DELIBERATELY
  // via an explicit reveal CTA that only appears once there is something to
  // reveal. Keyed by school id: a swap to a school that already has data must
  // never inherit the previous school's latch.
  const [firstRunSchoolId, setFirstRunSchoolId] = useState(null)
  const overviewLoading = billingLoading || hydrating
  useEffect(() => {
    if (overviewLoading) return
    if (savedPeriods.length === 0) setFirstRunSchoolId(schoolId)
    else setFirstRunSchoolId((cur) => (cur === schoolId ? cur : null))
  }, [overviewLoading, savedPeriods.length, schoolId])
  const firstRunLatched = firstRunSchoolId != null && firstRunSchoolId === schoolId

  // ── Confirm → reveal ────────────────────────────────────────────────────────
  // Both are latched BY SCHOOL for the same reason first run is: a swap to another
  // school must not inherit the previous school's "already confirmed", and must
  // never leave a celebration for School A open over School B's data.
  const [confirmedSchoolId, setConfirmedSchoolId] = useState(null)
  const [revealSchoolId, setRevealSchoolId] = useState(null)
  const intakeConfirmed = confirmedSchoolId != null && confirmedSchoolId === schoolId
  const revealOpen = revealSchoolId != null && revealSchoolId === schoolId

  // ── Condense latch ──────────────────────────────────────────────────────────
  // The finished job folds itself away. Set at the ONE moment the user has told
  // us they are done — answering "yes, show me what lit up" on the confirm band —
  // and never on save alone, because the band lives inside the embed and folding
  // the embed would take the question away before it was answered.
  //
  // School-keyed like every other latch on this page: a swap must not inherit the
  // previous school's "already put away".
  const [condensedSchoolId, setCondensedSchoolId] = useState(null)
  const condensed = condensedSchoolId != null && condensedSchoolId === schoolId
  // Which tab the intake opens on when a door in the summary is used. Also the
  // remount key: TrialBalanceModalBody seeds its `mode` from initialTab ONCE, so
  // asking for a different tab has to be a different component instance.
  const [intakeTab, setIntakeTab] = useState(null)
  const expandIntake = useCallback((tab) => {
    setCondensedSchoolId(null)
    setIntakeTab(tab ?? 'single')
  }, [])

  const {
    data,
    metrics,
    loading: metricsLoading,
    notEntitled,
    reload: reloadMetrics,
  } = useAnalytics(schoolId, selectedPeriodId)

  // Categorising an account rebuilds the statements server-side, so the figures
  // this page is reasoning about — including whether it can honestly say the
  // books are readable at all — are stale the moment it happens. Same listener
  // AnalyticsDashboard uses for Penny's autonomous writes.
  useEffect(() => {
    const onDataChanged = (e) => {
      if (e?.detail?.key === 'metrics') reloadMetrics()
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [reloadMetrics])
  const { text: insightText, source: insightSource } = useInsights(schoolId, selectedPeriodId)
  const { summary: complianceSummary } = useCompliance(schoolId, selectedPeriodId)
  const { budget } = useBudget(schoolId, selectedPeriodId)

  const metricsByKey = useMemo(() => {
    const m = {}
    for (const r of metrics) m[r.key] = r
    return m
  }, [metrics])

  // ── Reveal inputs. Every one is READ from data already on this page — the
  // celebration invents nothing. `hasBudget` insists on at least one budgeted
  // line, not merely a budget row, so an empty budget shell doesn't make the
  // reveal promise variance it cannot show. ──────────────────────────────────
  const revealAccounts = useMemo(() => {
    const cy = (hydratedFiles || []).find((f) => f.role === 'cy')
    return cy?.rows?.length ?? 0
  }, [hydratedFiles])

  const revealPriorLabel = useMemo(() => {
    if (!activePeriod) return null
    // savedPeriods is newest-first, so the first strictly-earlier one is the prior.
    const earlier = savedPeriods.find((p) => p.periodEndDate < activePeriod.periodEndDate)
    return earlier?.label ?? null
  }, [savedPeriods, activePeriod])

  const revealVitals = useMemo(
    () =>
      metrics.map((m) => ({
        key: m.key,
        label: m.label,
        status: m.status,
        available: m.available,
        display: m.available
          ? formatMetricValue(m.value, metricFormat(m.key, m.unit))
          : '—',
      })),
    [metrics],
  )

  // The vitals + budget on this page are keyed to `selectedPeriodId` (the newest
  // SAVED period), while the reveal names `activePeriod` (the period the intake
  // wrote to). They are normally the same row, but a user who saves an EARLIER
  // year makes them diverge — and then the celebration would headline FY 2025
  // while counting FY 2026's vitals. Only claim these when the two agree.
  const revealPeriodMatches =
    activePeriod?.id != null && activePeriod.id === selectedPeriodId

  // WHICH PERIOD THE CELEBRATION IS ABOUT. During first run these are the same
  // row. On the overview they need not be: that screen hands the user a period
  // picker, while activePeriod is whichever period the intake last wrote to. A
  // replay that headlined FY 2025 while the cards behind it showed FY 2026
  // would be the page contradicting itself, so the reveal follows the period
  // the user is actually looking at.
  const revealPeriod =
    savedPeriods.find((p) => p.id === selectedPeriodId) ?? activePeriod

  const revealHasBudget = useMemo(() => {
    const lines = budget?.lines
    if (!lines) return false
    return Object.values(lines).some(
      (kind) =>
        kind &&
        typeof kind === 'object' &&
        Object.values(kind).some((v) => Number.isFinite(Number(v)) && Number(v) !== 0),
    )
  }, [budget])

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
  // ── DID THE STATEMENTS ACTUALLY PRODUCE ANYTHING? ────────────────────────────
  // A trial balance can save perfectly, balance perfectly, and still yield an
  // entirely empty set of statements — that is exactly what happened to every
  // school whose accounts we could not name. The product went on to say
  // "Balanced", "your statements are ready" and "your books are live" over the
  // top of thirty-three zeros. This is the one honest signal, read from the
  // computed metrics rather than from the fact that a file arrived.
  const revM = metricsByKey.revenue_mix
  const expM = metricsByKey.expense_mix
  const totalRevenue = revM?.available ? revM.value : null
  const totalExpense = expM?.available ? expM.value : null
  const changeInNetAssets =
    totalRevenue != null && totalExpense != null ? totalRevenue - totalExpense : null

  const statementsHaveNumbers = (totalRevenue ?? 0) !== 0 || (totalExpense ?? 0) !== 0

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
      <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
        <FinanceHeader />
        <EntitlementPausedPanel />
      </div>
    )
  } else if (initialLoading) {
    // ── Loading skeleton ─────────────────────────────────────────────────────────
    overview = (
      <div className="mx-auto max-w-page space-y-5 px-4 py-6 sm:space-y-8 sm:px-10 sm:py-8">
        <HeadlineSkeleton />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  } else if (savedPeriods.length === 0 || firstRunLatched) {
    // ── First run: the empty state IS the setup ──────────────────────────────────
    // The REAL trial-balance embed (the same TrialBalanceModalBody the Add-data
    // wizard mounts) lives right here, so a brand-new school drops a file on the
    // first screen it sees — no link-out, no chooser. The embed autosaves through
    // PersistenceContext (savePeriods → refreshAfterSave → setPeriods).
    //
    // The branch is held by `firstRunLatched`, NOT by savedPeriods alone: the
    // embed's 3-slot intake keeps offering "last year" and "audited" after the
    // first file, and yanking it away the instant a snapshot lands destroys an
    // in-flight task. The reward is still immediate and visible — the reveal CTA
    // below appears the moment there is a real overview to go to — but the user
    // decides when to leave.
    const ready = savedPeriods.length > 0
    const readyFileCount = (hydratedFiles || []).filter((f) => f?.role).length
    overview = (
      <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
        <FinanceHeader />
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="space-y-5"
        >
          {/* THE HERO IS THE NEXT STEP, not a status announcement.
              "Finance is lit up" told the user something they had just watched
              happen and then left them to work out what to do about it. Before
              any files land it PITCHES; after they land it POINTS — one card,
              one primary action, and the celebration they can replay beside it. */}
          {ready ? (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 22 }}
              className="panel panel-body flex flex-wrap items-center justify-between gap-4"
            >
              <div className="flex min-w-0 flex-1 basis-[18rem] items-start gap-3.5">
                <span className="mt-0.5 inline-flex shrink-0 text-navy-soft" aria-hidden="true">
                  <Sparkles size={20} />
                </span>
                <div className="min-w-0">
                  <h2 className="font-serif text-title text-ink">
                    {statementsHaveNumbers
                      ? 'Your statements are ready'
                      : 'One step left — tell us what these accounts are'}
                  </h2>
                  {/* A COUNT OF WHAT IS ACTUALLY STORED, not a claim about what
                      it unlocks — the reveal makes that claim, with evidence. */}
                  <p className="mt-1 min-w-0 break-words text-small leading-snug text-ink2">
                    {readyFileCount > 0
                      ? `${readyFileCount} file${readyFileCount === 1 ? '' : 's'} in`
                      : 'Saved'}
                    {activePeriod?.label ? ` \u00b7 ${activePeriod.label}` : ''}.{' '}
                    {statementsHaveNumbers
                      ? 'Open your overview whenever you like.'
                      : 'Your books are saved, but we can’t read them yet — categorise the accounts below and your statements fill in.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  hidden={!statementsHaveNumbers}
                  onClick={() => setRevealSchoolId(schoolId)}
                  className="btn btn-secondary shrink-0"
                >
                  <Sparkles size={14} /> What lit up
                </button>
                <button
                  type="button"
                  onClick={() => setFirstRunSchoolId(null)}
                  className="btn btn-primary shrink-0"
                >
                  See my Finance overview
                  <ArrowRight size={14} />
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
              <span className="inline-flex text-navy-soft" aria-hidden="true">
                <CircleDollarSign size={34} strokeWidth={1.5} />
              </span>
              <div>
                <h2 className="font-serif text-display text-ink">Light up Finance</h2>
                <p className="mx-auto mt-2 max-w-xl text-body text-ink2">
                  Drop in your trial balance — statements, analytics, budget and board reports
                  all light up from this one upload.
                </p>
              </div>
            </div>
          )}

          {/* THE RECEIPT. Once the user has confirmed what was stored, the intake
              apparatus folds into this strip and the three doors back in live on
              it. Rendered whenever there is a saved period, so the summary of
              what they have is never the thing that disappears. */}
          {ready ? (
            <UploadsSummary
              period={activePeriod}
              files={hydratedFiles}
              canEdit={canEdit}
              onExpand={expandIntake}
            />
          ) : null}

          {canEdit && !condensed ? (
            /* The uploader, right there — the EXISTING embed, chrome only. It owns
               its own intake/progress/applied UI, so the card around it never
               navigates or changes state mid-upload. No padding on the card: the
               embed carries its own internal chrome (same as the wizard's wrap).

               CONDENSED hides it, and `condensed` can only ever be true once the
               user has CONFIRMED a save — so the empty state can never lose its
               uploader, which is the whole point of the guard on this branch. The
               doors on UploadsSummary bring it straight back. */
            <Panel padded={false} className="overflow-hidden">
              {/* Heading ONLY. The embed renders its own bordered tab band
                  (This year / Add years / QuickBooks) with its own hint line
                  directly underneath, so a second rule + a second subtitle
                  restating the same three options stacked two near-identical
                  headers ~90px apart. One rule, from the embed. */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3 sm:px-6">
                <h3 className="text-heading font-semibold text-ink">
                  Add your trial balance
                </h3>
                {/* The way back OUT of the apparatus, offered only once there is
                    something to fold onto. */}
                {ready ? (
                  <button
                    type="button"
                    onClick={() => setCondensedSchoolId(schoolId)}
                    className="btn btn-quiet btn-sm"
                  >
                    <ChevronUp size={14} /> Done for now
                  </button>
                ) : null}
              </div>
              <TrialBalanceModalBody
                key={intakeTab ?? 'single'}
                initialTab={intakeTab}
                school={activeSchool}
                hydratedFiles={hydratedFiles}
                activePeriod={activePeriod}
                hydrationToken={hydrationToken}
                canEdit={canEdit}
                // Flag-aware, ALWAYS present. Passing undefined under v1 hid
                // BulkYearsUploader's only route out of the "this is a monthly
                // workbook" banner — a v1 user got the diagnosis and no door.
                // addDataHref returns the bare '/data' (the real hub) under v1
                // and the direct deep link under v2.
                onOpenMonthly={() => navigate(addDataHref(uiV2, { add: 'monthly' }))}
                // The confirm gate lives INSIDE the embed so both doors into the
                // trial-balance intake — this first-run screen and the Add-data
                // wizard — get the identical checkpoint from one implementation.
                // "Yes, show me what lit up" is the user saying the job is DONE.
                // The celebration opens over the page and the apparatus folds
                // behind it, so closing the reveal lands on the receipt and the
                // way forward instead of the uploader they just finished with.
                // "Not quite — let me fix a file" answers WITHOUT folding.
                onConfirmed={() => {
                  setRevealSchoolId(schoolId)
                  setCondensedSchoolId(schoolId)
                }}
                onAnswered={() => setConfirmedSchoolId(schoolId)}
                // See statementsHaveNumbers: the checkpoint must not offer a
                // celebration when there is nothing to celebrate yet.
                dataReady={statementsHaveNumbers}
              />
            </Panel>
          ) : canEdit ? null : (
            /* Viewer/board lens: no upload chrome a viewer can't use. */
            <div className="px-6 py-10 text-center">
              <p className="mx-auto max-w-md text-body text-ink2">
                A school owner or accountant adds the first trial balance — everything here
                lights up the moment they do.
              </p>
            </div>
          )}

          {/* What lights up — future-tense labels only; no numbers we don't have.
              GONE once data lands: five promises about what WILL happen, printed
              under a screen where it already has, is the page arguing with
              itself. The past-tense version is the reveal, with real counts. */}
          {ready ? null : (
          <Section label="What lights up">
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 xl:grid-cols-5">
              {FIRST_RUN_LIGHTS.map((tile, index) => (
                <motion.div
                  key={tile.title}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className="flex min-w-0 flex-col gap-1.5 border-t border-hair py-3"
                >
                  <span className="inline-flex items-center gap-2 text-body font-semibold text-ink">
                    <tile.Icon size={15} className="text-navy-soft" aria-hidden="true" />
                    {tile.title}
                  </span>
                  <span className="min-w-0 break-words text-small leading-snug text-ink2">
                    {tile.blurb}
                  </span>
                </motion.div>
              ))}
            </div>
          </Section>
          )}
        </motion.div>
      </div>
    )
  } else {
    overview = (
    <div className="mx-auto max-w-page space-y-5 px-4 py-6 sm:space-y-8 sm:px-10 sm:py-8">
      <FinanceHeader
        onWhatLitUp={statementsHaveNumbers ? () => setRevealSchoolId(schoolId) : null}
        schoolName={activeSchool?.name}
        periods={savedPeriods}
        selectedPeriodId={selectedPeriodId}
        onSelectPeriod={setSelectedPeriodId}
        statusLine={statusLine}
        insightKind={insightText ? insightSource : null}
        billing={billing}
      />

      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="sec-cols"
      >
        {/* (1) STATEMENTS — ruled figure lines, counting up once. */}
        <FinanceColumn to="/statements" Icon={FileStack} title="Statements" viewLabel="View statements">
          <FigureRow label="Total revenue" amount={totalRevenue} />
          <FigureRow label="Total expense" amount={totalExpense} />
          <FigureRow label="Change in net assets" amount={changeInNetAssets} />
        </FinanceColumn>

        {/* (2) ANALYTICS — Tier-1 vitals */}
        <FinanceColumn to="/analytics" Icon={BarChart3} title="Analytics" viewLabel="View analytics">
          {vitalsLoading ? (
            <div className="space-y-2 py-1">
              {VITAL_KEYS.map((k) => (
                <div key={k} className="shimmer-bar h-6 w-full rounded" />
              ))}
            </div>
          ) : (
            VITAL_KEYS.map((k) => <VitalRow key={k} metric={metricsByKey[k]} />)
          )}
        </FinanceColumn>

        {/* (3) BUDGET VS ACTUAL — net variance or link-through */}
        <FinanceColumn to="/budget" Icon={Wallet} title="Budget vs actual" viewLabel="View budget">
          {budgetSummary.available ? (
            <>
              <div className="fig">
                <span className="fig-label">Net vs. budget</span>
                <span className="inline-flex items-center gap-2">
                  <Pill variant="status" tone={budgetSummary.netVar >= 0 ? 'good' : 'risk'}>
                    {budgetSummary.netVar >= 0 ? 'favorable' : 'unfavorable'}
                  </Pill>
                  <span className="fig-value">
                    {budgetSummary.netVar >= 0 ? '+' : '−'}
                    {fmtDollar(Math.abs(budgetSummary.netVar))}
                  </span>
                </span>
              </div>
              <FigureRow label="Actual net" amount={budgetSummary.netAct} />
              <FigureRow label="Budgeted net" amount={budgetSummary.netBud} />
            </>
          ) : (
            <p className="py-2 text-small text-ink2">
              No budget vs. actual yet for this period. Open Budget to set one up — guided,
              advanced, or import.
            </p>
          )}
        </FinanceColumn>

        {/* (4) CASH FORECAST — the FORWARD view.
            Its own column rather than a line inside Cash & Collections: that page
            answers "what is outstanding today", this one answers "when do we run
            low". Different questions, and folding the second into the first is
            how it stops being found. Description-only, like Reports — the figures
            need a projection run, and a column that invented one to look livelier
            would be the exact thing this feature refuses to do. */}
        <FinanceColumn to="/cash-flow" Icon={TrendingUp} title="Cash Forecast" viewLabel="Open forecast">
          <p className="py-2 text-small text-ink2">
            When cash is projected to run low, by how much, and how many days&apos; notice you
            have. Built from your payroll calendar, budget phasing and enrollment.
          </p>
        </FinanceColumn>

        {/* (5) REPORTS — board packet export + link */}
        <FinanceColumn to="/reports" Icon={FileBarChart2} title="Reports" viewLabel="Open Reports">
          <p className="py-2 text-small text-ink2">
            Export a board-ready finance-committee packet for the selected period, or open the
            Reports workspace.
          </p>
          {selectedPeriodId && (
            <div className="pt-1">
              <BoardPacketExportButton periodId={selectedPeriodId} />
            </div>
          )}
        </FinanceColumn>

        {/* (6) READINESS — material / reportable counts */}
        <FinanceColumn to="/readiness" Icon={ShieldCheck} title="Readiness" viewLabel="View readiness">
          <div className="fig">
            <span className="fig-label">Material findings</span>
            <span className="inline-flex items-center gap-2">
              <i className={`mark tone-${readinessTone}`} aria-hidden="true" />
              <span className="fig-value">{material}</span>
            </span>
          </div>
          <div className="fig">
            <span className="fig-label">Reportable items</span>
            <span className="fig-value">{reportable}</span>
          </div>
          <p className="pt-2 text-small text-ink2">
            {material > 0
              ? 'Material findings to address before review.'
              : reportable > 0
                ? 'Reportable items to review.'
                : 'On track — no exceptions found.'}
          </p>
        </FinanceColumn>
      </motion.div>
    </div>
    )
  }

  // The celebration is mounted OUTSIDE the branch that opens it: it portals to
  // document.body, and keeping it here means a user who clicks a destination and
  // comes back, or who reopens it from "What lit up", gets the same one instance
  // in both the v1 and v2 shells.
  const reveal = (
    <LightUpReveal
      open={revealOpen}
      onClose={() => setRevealSchoolId(null)}
      schoolName={activeSchool?.name ?? null}
      period={revealPeriod}
      priorPeriodLabel={revealPriorLabel}
      hasBudget={revealPeriodMatches && revealHasBudget}
      accreditationLicensed={hasModule('accreditation')}
      // The reveal's own "keep adding files" must land somewhere with files.
      // "Keep adding files" has to land somewhere with files. On the first-run
      // screen that means unfolding the intake in place; from the overview that
      // screen is gone, so the equivalent is the Add-data tab.
      onKeepAdding={() => {
        if (savedPeriods.length === 0 || firstRunLatched) expandIntake('single')
        else navigate(addDataHref(uiV2, { add: 'tb' }))
      }}
      vitals={revealPeriodMatches ? revealVitals : []}
      // The account count comes from the files hydrated for activePeriod, so it
      // is only true of the period the reveal names when those agree.
      accounts={revealPeriodMatches ? revealAccounts : 0}
    />
  )

  if (uiV2) {
    return (
      <>
      {reveal}
      <ModuleTabs
        moduleKey="finance"
        overview={overview}
        addData={
          <AddDataTab
            module="finance"
            schoolId={schoolId}
            periodId={selectedPeriodId}
            canEdit={canEdit}
            onLitUp={() => setRevealSchoolId(schoolId)}
            dataReady={statementsHaveNumbers}
          />
        }
        records={<FinanceRecords />}
        reports={<FinanceReports periodId={selectedPeriodId} />}
      />
      </>
    )
  }

  return (
    <>
      {reveal}
      {overview}
    </>
  )
}

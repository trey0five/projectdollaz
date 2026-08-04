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
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import {
  CircleDollarSign,
  FileStack,
  BarChart3,
  Wallet,
  FileBarChart2,
  ShieldCheck,
  ArrowRight,
  Scale,
} from 'lucide-react'
import { BACK_PILL, BackPillBody } from '../components/ui/BackLink.jsx'
import { AddDataCta, RecordsCta } from '../components/module/ModuleCtas.jsx'
import ModuleOverviewLink from '../components/module/ModuleOverviewLink.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useBilling } from '../context/BillingContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import { useUiV2 } from '../context/UiFlagContext.jsx'
import ModuleTabs from '../components/module/ModuleTabs.jsx'
import { moduleHue } from '../components/module/moduleAnatomy.js'
import AddDataTab from '../components/wizard/AddDataTab.jsx'
import TrialBalanceModalBody from '../components/datahub/TrialBalanceModalBody.jsx'
import { useAnalytics, useInsights, useBudget } from '../hooks/useAnalytics.js'
import { useCompliance } from '../hooks/useCompliance.js'
import { metricFormat, formatMetricValue } from '../lib/metricMeta.js'
import { addDataHref } from '../lib/dataDestinations.js'
import { fmtDollar } from '../lib/format.js'
import StatusDot from '../components/analytics/StatusDot.jsx'
import DeltaChip from '../components/analytics/DeltaChip.jsx'
import EntitlementPausedPanel from '../components/analytics/EntitlementPausedPanel.jsx'
import { HeadlineSkeleton, MetricCardSkeleton } from '../components/analytics/skeletons.jsx'
import HomeHero from '../components/home/HomeHero.jsx'
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

// ── Page header (mirrors AnalyticsDashboard's PageHeader) ─────────────────────
function FinanceHeader() {
  // Under v2 the ModuleTabs shell already renders the "Back to dashboard" link,
  // so this header omits its own to avoid a duplicate; v1 (standalone page, no
  // ModuleTabs) keeps it.
  const uiV2 = useUiV2()
  return (
    <div className="mb-6">
      {!uiV2 && (
        <Link to="/app" className={BACK_PILL}>
          <BackPillBody label="Back to dashboard" />
        </Link>
      )}
      <div className={`${uiV2 ? '' : 'mt-3 '}flex flex-wrap items-center gap-3`}>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-gradient text-navy shadow-glow">
          <CircleDollarSign size={22} />
        </span>
        <div>
          <h1 className="font-serif text-2xl font-semibold text-navy sm:text-[28px]">Finance</h1>
          <p className="text-[15px] text-muted">Your finance command center</p>
        </div>
        {/* On-page Add-data + Records entries (mirror the sidebar tabs) — v2 only. */}
        {uiV2 && (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <RecordsCta module="finance" />
            <AddDataCta />
          </span>
        )}
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
  // Broadcast the flood state so stat rows count up in sync with the CSS refill.
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="module-tile module-tile--panel"
      style={{ '--tile-hue': moduleHue('finance') }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
        <div className="flex-1">
          <TileHoverCtx.Provider value={hovered}>{children}</TileHoverCtx.Provider>
        </div>
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
    <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      <ModuleOverviewLink module="finance" className="mb-3" />
      <p className="mb-4 text-[14.5px] text-muted">
        Your finance workspaces — statements, cash and budget, each one click away.
      </p>
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
    <div className="mx-auto max-w-page space-y-4 px-4 py-6 sm:px-10 sm:py-8">
      <ModuleOverviewLink module="finance" />
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

// ── Live-on-hover stat machinery for the section cards ────────────────────────
// TileHoverCtx broadcasts "the flood is up" from SectionCard to its stat rows so
// the numbers COUNT UP from zero in sync with the CSS bar refill — the card feels
// like it recomputes live under the cursor. Values at rest are always the real
// figures (never a fabricated number; nulls stay dashed).
const TileHoverCtx = createContext(false)

// Rolls the displayed number 0 → amount each time the tile flood comes up.
function CountUpValue({ amount, format, className = '' }) {
  const hovered = useContext(TileHoverCtx)
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(amount)
  const runRef = useRef(null)

  useEffect(() => setDisplay(amount), [amount])
  useEffect(() => {
    if (!hovered || amount == null || reduce) return undefined
    runRef.current?.stop()
    runRef.current = animate(0, amount, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    })
    return () => runRef.current?.stop()
  }, [hovered, amount, reduce])

  if (amount == null) return <span className={className}>—</span>
  const v = format === 'currency' ? Math.round(display ?? amount) : (display ?? amount)
  return <span className={className}>{formatMetricValue(v, format)}</span>
}

// A single labeled figure row (Statements card): label + counting value + a
// hue magnitude bar (pct of the card's largest figure) that refills on hover.
function FigureRow({ label, amount, format = 'currency', pct = null }) {
  return (
    <div className="border-b border-rule/40 py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14.5px] text-muted">{label}</span>
        <CountUpValue
          amount={amount}
          format={format}
          className="tabular-nums text-[15px] font-semibold text-navy"
        />
      </div>
      {pct != null && amount != null ? (
        <div className="stat-track mt-1.5" aria-hidden>
          <div
            className={`stat-fill${amount < 0 ? ' stat-fill--negative' : ''}`}
            style={{ width: `${Math.max(4, Math.round(pct * 100))}%` }}
          />
        </div>
      ) : null}
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
      <span className="min-w-0 flex-1 break-words text-[14.5px] text-ink">
        {metric?.label ?? 'Metric'}
      </span>
      <CountUpValue
        amount={available ? metric.value : null}
        format={fmt}
        className="tabular-nums text-[15px] font-semibold text-navy"
      />
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
  const navigate = useNavigate()
  const { activeSchool } = useSchools()
  // v1 is ALWAYS school-scoped — org finance already lives on the consolidated Home
  // and the Budget org roll-up tabs, so we never null the schoolId for org mode.
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const { billing, loading: billingLoading, entitled, isOwner } = useBilling()
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
    overview = (
      <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
        <FinanceHeader />
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="space-y-5"
        >
          {/* Hero band — .card-flashy now takes its ring/glow from --c-module, so
              under v2 this wears the finance blue instead of framing a blue badge
              in a gold ring (index.css; v1 and print resolve to gold unchanged). */}
          <div className="card-flashy flex flex-col items-center gap-4 px-6 py-10 text-center">
            <motion.span
              className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow"
              animate={reduce ? undefined : { y: [0, -10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <CircleDollarSign size={34} />
            </motion.span>
            <div>
              <h2 className="font-serif text-2xl font-semibold text-navy">
                {ready ? 'Finance is lit up' : 'Light up Finance'}
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-[16px] leading-relaxed text-muted">
                {ready
                  ? 'Your first snapshot is saved. Add last year and your audited numbers below to unlock comparatives — or go straight to your overview.'
                  : 'Drop in your trial balance — statements, analytics, budget and board reports all light up from this one upload.'}
              </p>
            </div>
          </div>

          {/* THE REVEAL — appears only once a snapshot actually exists, and is the
              ONLY thing that ends first run. Honest: it is not shown before there
              is an overview to show, and it never interrupts the upload in
              progress above it. */}
          {ready ? (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 22 }}
              className="card-soft flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6"
            >
              <div className="min-w-0">
                <p className="font-serif text-[17px] font-semibold text-navy">
                  Your statements are ready
                </p>
                <p className="mt-0.5 min-w-0 break-words text-[13.5px] leading-snug text-muted">
                  Keep adding files here, or open the Finance overview whenever you like.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFirstRunSchoolId(null)}
                className="btn-cta inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.1em] outline-none transition-transform focus-visible:ring-2 focus-visible:ring-gold/50"
              >
                See my Finance overview
                <ArrowRight size={14} />
              </button>
            </motion.div>
          ) : null}

          {canEdit ? (
            /* The uploader, right there — the EXISTING embed, chrome only. It owns
               its own intake/progress/applied UI, so the card around it never
               navigates or changes state mid-upload. No padding on the card: the
               embed carries its own internal chrome (same as the wizard's wrap). */
            <div className="card-soft overflow-hidden">
              {/* Heading ONLY. The embed renders its own bordered tab band
                  (This year / Add years / QuickBooks) with its own hint line
                  directly underneath, so a second rule + a second subtitle
                  restating the same three options stacked two near-identical
                  headers ~90px apart. One rule, from the embed. */}
              <div className="px-5 pt-5 pb-3 sm:px-6">
                <h3 className="font-serif text-[17px] font-semibold text-navy">
                  Add your trial balance
                </h3>
              </div>
              <TrialBalanceModalBody
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
              />
            </div>
          ) : (
            /* Viewer/board lens: no upload chrome a viewer can't use. */
            <div className="card-soft px-6 py-10 text-center">
              <p className="mx-auto max-w-md text-[15px] leading-relaxed text-muted">
                A school owner or accountant adds the first trial balance — everything here
                lights up the moment they do.
              </p>
            </div>
          )}

          {/* What lights up — future-tense labels only; no numbers we don't have. */}
          <div>
            <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-muted">
              What lights up
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {FIRST_RUN_LIGHTS.map((tile, index) => (
                <motion.div
                  key={tile.title}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: index * 0.05,
                    type: 'spring',
                    stiffness: 260,
                    damping: 24,
                  }}
                  className="kpi-3d flex min-w-0 flex-col gap-2 p-4 sm:p-5"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 text-gold">
                    <tile.Icon size={18} />
                  </span>
                  <span className="text-[14.5px] font-semibold text-navy">{tile.title}</span>
                  <span className="min-w-0 break-words text-[13px] leading-snug text-muted">
                    {tile.blurb}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    )
  } else {
    overview = (
    <div className="mx-auto max-w-page space-y-5 px-4 py-6 sm:space-y-8 sm:px-10 sm:py-8">
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
        {/* (1) STATEMENTS — live rows: counting values + hue magnitude bars. */}
        <SectionCard to="/statements" Icon={FileStack} title="Statements" viewLabel="View statements">
          {(() => {
            const maxAbs = Math.max(
              Math.abs(totalRevenue ?? 0),
              Math.abs(totalExpense ?? 0),
              Math.abs(changeInNetAssets ?? 0),
              1,
            )
            const pctOf = (v) => (v == null ? null : Math.abs(v) / maxAbs)
            return (
              <>
                <FigureRow label="Total revenue" amount={totalRevenue} pct={pctOf(totalRevenue)} />
                <FigureRow label="Total expense" amount={totalExpense} pct={pctOf(totalExpense)} />
                <FigureRow
                  label="Change in net assets"
                  amount={changeInNetAssets}
                  pct={pctOf(changeInNetAssets)}
                />
              </>
            )
          })()}
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
              No budget vs. actual yet for this period. Open Budget to set one up — guided,
              advanced, or import.
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
            canEdit={canEdit}
          />
        }
        records={<FinanceRecords />}
        reports={<FinanceReports periodId={selectedPeriodId} />}
      />
    )
  }

  return overview
}

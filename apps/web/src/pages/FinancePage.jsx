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
  Percent,
  Landmark,
  PieChart,
  Target,
  AlertTriangle,
  Compass,
  Printer,
  Table2,
  CheckCircle2,
  ArrowLeft,
  ListChecks,
  CloudUpload,
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
import { metricFormat, formatMetricValue } from '../lib/metricMeta.js'
import { addDataHref } from '../lib/dataDestinations.js'
import { reviewVerdict, reviewButtonLabel, REVIEW_HREF } from '../lib/reviewQueue.js'
import { requestOpenReview } from '../lib/reviewRequest.js'
import { useReviewCount } from '../hooks/useReviewCount.js'
import EntitlementPausedPanel from '../components/analytics/EntitlementPausedPanel.jsx'
import { HeadlineSkeleton, MetricCardSkeleton } from '../components/analytics/skeletons.jsx'
import { toSignals } from '../components/home/HomeHero.jsx'
import { Section, Panel } from '../components/ui/surface/index.js'
import { formatShortDate } from '../lib/format.js'
import BoardPacketExportButton from '../components/reports/BoardPacketExportButton.jsx'
import {
  AuroraHero,
  AuroraButton,
  AuroraPeriodSwitch,
  fyLabel,
  AuroraSection,
  AuroraTile,
  AuroraTileGrid,
  AuroraCard,
  AuroraCols,
  AuroraColumns,
  AuroraEmpty,
  AuroraLightButton,
  HowThisWorks,
  VerdictEm,
  verdictCountLabel,
} from '../components/ui/aurora/index.js'
import {
  financeVerdict,
  kpiCaption,
  comparisonBasis,
  kpiFigure,
  metricVerdict,
  money,
  moneyShort,
  warningTiles,
  warningsMode,
  balanceSheetGap,
  NO_LAST_YEAR,
} from '../components/finance/financeAurora.js'

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

// ── The Finance BAND (Aurora, owner-approved 2026-10-15) ─────────────────────
// School chip + "Year ended …" eyebrow, the serif title, ONE plain verdict
// sentence built from this period's real figures, the period switcher on the
// right, the page's three jobs as buttons (Add data · Board packet ·
// Workspaces) and up to four frosted-glass figures with their own Good /
// Watch / At risk pills. The replay of the first-upload celebration lives
// under the switcher as a small "What changed" control. Every argument is
// optional: the entitlement-gate and first-run screens render the bare band.
function FinanceHeader({
  onWhatLitUp = null,
  schoolName = null,
  periods = null,
  selectedPeriodId = null,
  onSelectPeriod = null,
  verdict = null,
  kpis = null,
  boardPacket = false,
  // A4: accounts the saved statements could not place. > 0 makes the band's
  // PRIMARY (white) button "Review N accounts", deep-linking straight to the
  // open review panel on the Add-data trial balance step.
  reviewCount = 0,
}) {
  // Under v2 the ModuleTabs shell already renders the breadcrumb, so this header
  // omits its own back link; v1 (standalone page, no ModuleTabs) keeps it.
  const uiV2 = useUiV2()
  const period = (periods ?? []).find((p) => p.id === selectedPeriodId) ?? null
  // The period ONLY — billing (days left in trial) is the app-wide banner's job,
  // not the module verdict's.
  const eyebrow = period ? `Year ended ${formatShortDate(period.periodEndDate)}` : null
  // One period is nothing to switch to (AuroraPeriodSwitch renders nothing).
  const showSwitch = periods && periods.length > 1 && onSelectPeriod
  return (
    <div className="mb-2">
      {!uiV2 && (
        <Link to="/app" className={`${BACK_PILL} mb-3`}>
          <BackPillBody label="Back to dashboard" />
        </Link>
      )}
      <AuroraHero
        moduleKey="finance"
        school={schoolName}
        eyebrow={eyebrow || null}
        title="Finance"
        verdict={verdict}
        actions={
          reviewCount > 0 ? (
            <>
              {/* THE ONE JOB RIGHT NOW: the white button goes straight to the
                  open review panel. requestOpenReview makes the ask sticky so
                  the panel opens once the stored files have mounted. */}
              <AuroraButton
                variant="primary"
                to={uiV2 ? REVIEW_HREF : addDataHref(uiV2, { add: 'tb' })}
                onClick={() => requestOpenReview()}
                icon={<ListChecks size={18} aria-hidden="true" />}
                data-testid="band-review-button"
                data-kyro-avoid=""
              >
                {reviewButtonLabel(reviewCount)}
              </AuroraButton>
              {uiV2 && (
                <AuroraButton to="?tab=add" icon={<CloudUpload size={18} aria-hidden="true" />}>
                  Add data
                </AuroraButton>
              )}
              {boardPacket ? <BoardPacketExportButton periodId={selectedPeriodId} /> : null}
              {uiV2 && <RecordsCta module="finance" />}
            </>
          ) : uiV2 || boardPacket ? (
            <>
              {/* On-page Add-data + Workspaces entries (mirror the sidebar tabs) — v2 only. */}
              {uiV2 && <AddDataCta />}
              {boardPacket ? <BoardPacketExportButton periodId={selectedPeriodId} /> : null}
              {uiV2 && <RecordsCta module="finance" />}
            </>
          ) : null
        }
        aside={
          showSwitch || onWhatLitUp ? (
            <>
              {showSwitch ? (
                <AuroraPeriodSwitch periods={periods} activeId={selectedPeriodId} onSelect={onSelectPeriod} />
              ) : null}
              {/* THE REPLAY, ON THE OVERVIEW TOO. The celebration used to be
                  reachable only from the first-run screen — the one place a user
                  leaves and cannot get back to. Rendered only when there is
                  something to show. */}
              {onWhatLitUp && (
                <button type="button" onClick={onWhatLitUp} className="au-switch-btn inline-flex items-center gap-1.5">
                  <Sparkles size={14} aria-hidden="true" /> What changed
                </button>
              )}
            </>
          ) : null
        }
        kpis={kpis}
      />
    </div>
  )
}

// ── ui.v2 Records panel ("Workspaces"): doors into the finance sub-registers
// (Statements, Cash & Collections, Cash Forecast, Budget). Pure navigation —
// Aurora tiles, no new API. ─────────────────────────────────────────────────
function FinanceRecords() {
  return (
    <div className="au-scope mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      <ModuleOverviewLink module="finance" className="mb-1" />
      <AuroraSection first icon={Table2} title="Workspaces" subtitle="Statements, cash, forecast and budget.">
        <AuroraTileGrid cols={4}>
          <AuroraTile to="/statements" icon={FileStack} title="Statements" desc="Your statements and every saved year." />
          <AuroraTile to="/cash" icon={CircleDollarSign} title="Cash & Collections" desc="Cash on hand and who still owes you." />
          {/* The FORWARD view, deliberately its own tile rather than folded into
              Cash & Collections. That page answers "what is outstanding today";
              this one answers "when do we run low" — different questions, and
              burying the second inside the first is how it stops being found. */}
          <AuroraTile to="/cash-flow" icon={TrendingUp} title="Cash Forecast" desc="When cash may run low, and why." />
          <AuroraTile to="/budget" icon={Wallet} title="Budget" desc="Plan vs. actual, line by line." />
        </AuroraTileGrid>
      </AuroraSection>
    </div>
  )
}

// ── ui.v2 Add-data step (also where /data lands under ui.v2) ────────────────
// The Aurora band every Finance screen opens with — school chip, "Add data",
// the module name, one plain line and a way back to the overview — over the
// shared Add-data wizard. The wizard keeps its step line and stepper; its own
// eyebrow + title are folded into the band (aurora.css .au-addstep) so the
// page has ONE heading, not two.
function FinanceAddData({ schoolName, children }) {
  return (
    <div className="au-scope au-addstep">
      <div className="mx-auto max-w-page px-4 pt-6 sm:px-10 sm:pt-8">
        <AuroraHero
          moduleKey="finance"
          school={schoolName}
          eyebrow="Add data"
          title="Finance"
          verdict="Get your finance numbers in: drop your files and we’ll figure out what each one is."
          actions={
            <AuroraButton to="/finance" icon={<ArrowLeft size={18} aria-hidden="true" />}>
              Back to Finance
            </AuroraButton>
          }
        />
      </div>
      {children}
    </div>
  )
}

// ── ui.v2 Reports panel: the Reports workspace + board-packet export + the print
// documents. Finance is the only module with real report surfaces (locked D2). ──
function FinanceReports({ periodId }) {
  return (
    <div className="au-scope mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      <ModuleOverviewLink module="finance" className="mb-1" />
      <AuroraSection first icon={FileBarChart2} title="Reports" subtitle="Packets and print-ready documents.">
        <AuroraTileGrid cols={2}>
          <AuroraTile
            to="/reports"
            icon={FileBarChart2}
            title="Reports workspace"
            desc="Every finance report in one place."
            foot={periodId ? <BoardPacketExportButton periodId={periodId} /> : null}
          />
          <AuroraTile
            icon={Printer}
            title="Print documents"
            desc="Open a print-ready board document."
            foot={
              // Both print routes read the year from ?period= (as ReportsPage
              // links them) — bare, they have no year to load and hang.
              periodId ? (
                <div className="flex flex-wrap gap-2">
                  <AuroraLightButton
                    variant="ghost"
                    size="sm"
                    to={`/board-packet/print?period=${encodeURIComponent(periodId)}`}
                  >
                    Board packet <ArrowRight size={13} aria-hidden="true" />
                  </AuroraLightButton>
                  <AuroraLightButton
                    variant="ghost"
                    size="sm"
                    to={`/reports/board/print?period=${encodeURIComponent(periodId)}`}
                  >
                    Board report <ArrowRight size={13} aria-hidden="true" />
                  </AuroraLightButton>
                </div>
              ) : (
                <span className="text-small text-ink2">Save a year&rsquo;s numbers first.</span>
              )
            }
          />
        </AuroraTileGrid>
      </AuroraSection>
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
  const { loading: billingLoading, entitled, hasModule } = useBilling()
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
  // Asks again whenever the figures' snapshot changes (a re-save of the same
  // year, or Approve rebuilding the statements) — never a stale read.
  const { text: insightText, source: insightSource } = useInsights(
    schoolId,
    selectedPeriodId,
    data?.freshness?.dataAsOf ?? null,
  )
  const { summary: complianceSummary } = useCompliance(schoolId, selectedPeriodId)
  const { budget } = useBudget(schoolId, selectedPeriodId)
  // A4: how many accounts the SAVED statements for this year couldn't place —
  // read from the server's own snapshot, so it is right even after a reload.
  const reviewCount = useReviewCount(schoolId, selectedPeriodId) ?? 0

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
        return `${material} serious finding${material === 1 ? '' : 's'} to fix before review.`
      if (reportable > 0)
        return `${reportable} item${reportable === 1 ? '' : 's'} to report.`
      return 'Ready for review — no problems found.'
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
        <FinanceHeader schoolName={activeSchool?.name} />
        <div className="mt-8">
          <EntitlementPausedPanel />
        </div>
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
        <FinanceHeader
          schoolName={activeSchool?.name}
          // THE CLAIM FOLLOWS THE NUMBERS (finance-honesty). A saved year whose
          // accounts we cannot read yet is NOT "in": the card below asks the
          // user to sort the accounts, so the band must not invite them to an
          // overview built from zeros.
          verdict={
            savedPeriods.length > 0
              ? statementsHaveNumbers
                ? 'Your first year is in. Open your overview whenever you like.'
                : 'Your books are saved, but we can’t read them yet. Sort the accounts below and this page fills in.'
              : 'Add this year’s numbers and everything here fills in.'
          }
        />
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mt-8 space-y-5"
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
                      : 'Your books are saved, but we can’t read them yet — sort the accounts below and your statements fill in.'}
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
                  <Sparkles size={14} /> What changed
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
                  Drop in your trial balance (or your QuickBooks Profit &amp; Loss and Balance
                  Sheet) — statements, analytics, budget and board reports all light up from
                  this one upload.
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
    // ── THE AURORA OVERVIEW ──────────────────────────────────────────────────
    // Band (verdict + four glass figures) → Warnings (KYRO's read, as tiles) →
    // This year's numbers (two charts) → Go further (one tile per workspace).
    // Every figure is read from the hooks above; a missing one is a dash, and a
    // verdict pill only ever comes from a metric's own band.
    const selPeriod = savedPeriods.find((p) => p.id === selectedPeriodId) ?? null
    const periodLabel = selPeriod?.label ? fyLabel(selPeriod.label) : null
    const periodEnd = selPeriod?.periodEndDate ? formatShortDate(selPeriod.periodEndDate) : null
    // Which year the cards' change is against (the API diffs with the nearest
    // EARLIER saved year): null → "No last-year numbers yet"; an older year is
    // named, never called "last year".
    const basis = selPeriod ? comparisonBasis(savedPeriods, selPeriod, fyLabel) : undefined

    // The four glass figures: margin, cash, reserve + the budget gap (or, with
    // no budget, tuition's share of income — both carry real bands/signs).
    const glass = (key, label, Icon) => {
      const m = metricsByKey[key]
      // No Balance Sheet for this year: the card says so and takes the person
      // to the trial-balance step (where "Add its Balance Sheet" is primary).
      const gap = vitalsLoading ? null : balanceSheetGap(m)
      if (gap) {
        return {
          key,
          icon: Icon,
          label,
          value: gap.value,
          textValue: true,
          caption: gap.caption,
          verdict: 'watch',
          verdictLabel: gap.action,
          to: gap.action === 'Review' && canEdit ? REVIEW_HREF : addDataHref(uiV2, { add: 'tb' }),
          'data-testid': `kpi-gap-${key}`,
        }
      }
      const fmt = m ? metricFormat(m.key, m.unit) : 'ratio'
      const { value, unit } = kpiFigure(m, fmt)
      return {
        key,
        icon: Icon,
        label,
        value: vitalsLoading ? '…' : value,
        unit,
        caption: m?.available ? kpiCaption(m, fmt, periodEnd, basis) : 'Not in this year’s numbers',
        verdict: metricVerdict(m),
      }
    }
    const tuitionM = metricsByKey.tuition_dependency
    const kpis = [
      glass('operating_margin', 'Operating margin', Percent),
      glass('days_cash_on_hand', 'Days of cash', Wallet),
      glass('months_operating_reserve', 'Reserve', Landmark),
      budgetSummary.available
        ? {
            key: 'budget',
            icon: Target,
            label: 'Against budget',
            value: `${budgetSummary.netVar >= 0 ? '+' : ''}${moneyShort(budgetSummary.netVar)}`,
            caption: 'Against your own budget',
            // A SIGN, not a band: budget has no standard range, so the pill
            // says ahead/behind (the colour still carries the sign).
            verdict: budgetSummary.netVar >= 0 ? 'good' : 'risk',
            verdictLabel: budgetSummary.netVar >= 0 ? 'Ahead of plan' : 'Behind plan',
          }
        : tuitionM?.available
          ? glass('tuition_dependency', 'Tuition share of income', PieChart)
          : { key: 'budget', icon: Target, label: 'Against budget', value: null, caption: 'No budget for this year yet' },
    ]
    // "No last-year numbers yet" ONCE (on the first card that would say it);
    // the rest say the date their figure is for.
    {
      let said = false
      for (let i = 0; i < kpis.length; i += 1) {
        if (kpis[i].caption !== NO_LAST_YEAR) continue
        if (said) kpis[i] = { ...kpis[i], caption: periodEnd ? `On ${periodEnd}` : null }
        said = true
      }
    }

    // ONE sentence for the band.
    const v = financeVerdict({
      periodLabel,
      periodEndDate: selPeriod?.periodEndDate,
      change: statementsHaveNumbers ? changeInNetAssets : null,
      metrics: [...VITAL_KEYS, 'tuition_dependency'].map((k) => metricsByKey[k]).filter(Boolean),
    })
    // Warnings are only "nothing flagged" when real numbers were read — AND
    // KYRO's read of them is about those numbers. A read written before the
    // accounts were sorted ("Not enough data to summarize…", live-caught still
    // cached after a review rebuilt the statements) checked nothing either.
    // A4: accounts waiting for a person come FIRST, in plain words — the band's
    // white button below goes straight to them.
    const verdict = reviewCount > 0 ? (
      <>{reviewVerdict(reviewCount, statementsHaveNumbers)}</>
    ) : !statementsHaveNumbers ? (
      <>We can’t read these accounts yet. Sort them in Add data and this page fills in.</>
    ) : v.lead || v.tail ? (
      <>
        {v.lead ? (
          <>
            {v.lead} <VerdictEm tone={v.emTone}>{v.em}</VerdictEm>.{' '}
          </>
        ) : null}
        {v.tail ? <VerdictEm tone={v.tailTone}>{v.tail}</VerdictEm> : null}
      </>
    ) : null

    // Warnings: KYRO's insight lines (or the readiness line) as tiles. Only
    // lines tagged Risk / Watch / Strength become tiles (warningTiles →
    // realSignals); a chatty reply with none is the empty state, never tiles.
    const warnings = insightText
      ? warningTiles(toSignals(statusLine))
      : statusLine
        ? [{ id: 'readiness', title: statusLine.replace(/\.$/, ''), desc: null, verdict: readinessTone, icon: ShieldCheck, to: '/readiness' }]
        : []
    const worst = warnings.find((w) => w.verdict === 'risk') ? 'risk' : warnings.find((w) => w.verdict === 'watch') ? 'watch' : 'good'
    // Nothing read → fully neutral. Numbers read but accounts still waiting →
    // the REAL risks still show (one unsorted sundry account must not hide a
    // cash problem) with a line that they may change; only the green "Nothing
    // flagged" is held back, because an all-clear over unsorted accounts
    // isn't one. (warningsMode, financeAurora.js.)
    const wMode = warningsMode({
      hasNumbers: statementsHaveNumbers,
      insightText,
      reviewCount,
      tileCount: warnings.length,
    })
    const warningsProvisional = wMode === 'provisional'
    // The year's numbers aren't complete (unreadable, accounts waiting, or no
    // Balance Sheet): nothing is "checked" yet, so Readiness can't say "Good".
    const dataIncomplete =
      !statementsHaveNumbers ||
      reviewCount > 0 ||
      Object.values(metricsByKey).some((m) => balanceSheetGap(m) != null)
    const warningsPending = wMode === 'unread' || wMode === 'waiting'

    // Chart colours: the module hue + its companion; "left over" wears its sign.
    const leftColor = changeInNetAssets != null && changeInNetAssets < 0 ? '#e11d48' : '#059669'
    const vitalsAvailable = VITAL_KEYS.filter((k) => metricsByKey[k]?.available).length

    overview = (
    <div className="au-scope mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      <FinanceHeader
        // "What changed" needs numbers AND a year before them to change
        // from; the board packet needs numbers.
        onWhatLitUp={statementsHaveNumbers && basis !== null ? () => setRevealSchoolId(schoolId) : null}
        schoolName={activeSchool?.name}
        periods={savedPeriods}
        selectedPeriodId={selectedPeriodId}
        onSelectPeriod={setSelectedPeriodId}
        verdict={verdict}
        kpis={kpis}
        boardPacket={statementsHaveNumbers}
        reviewCount={canEdit ? reviewCount : 0}
      />

      {/* ── Warnings — what KYRO spotted this year ─────────────────────────── */}
      {/* NO FALSE ALL-CLEAR. When nothing could be read, KYRO has checked
          nothing, so the section is neutral and says when warnings will show.
          When the numbers ARE read but accounts still wait, the real risks
          show with a line that they may change — never a green "Nothing
          flagged" while accounts are unsorted. */}
      <AuroraSection
        first
        icon={AlertTriangle}
        tone={warningsPending ? null : warnings.length ? worst : 'good'}
        title="Warnings"
        subtitle={periodLabel ? `What KYRO spotted in ${periodLabel}` : 'What KYRO spotted this year'}
        count={
          !warningsPending && warnings.length
            ? verdictCountLabel(warnings.map((w) => w.verdict)) || `${warnings.length} notes`
            : null
        }
      >
        {warningsPending ? (
          <AuroraEmpty
            icon={ListChecks}
            text={
              reviewCount > 0
                ? 'Warnings show up once your accounts are sorted.'
                : 'Warnings show up once KYRO can read your numbers.'
            }
            data-testid="warnings-pending"
            action={
              canEdit && reviewCount > 0 ? (
                <AuroraLightButton
                  hue="#d97706"
                  to={uiV2 ? REVIEW_HREF : addDataHref(uiV2, { add: 'tb' })}
                  onClick={() => requestOpenReview()}
                  icon={<ListChecks size={15} aria-hidden="true" />}
                >
                  {reviewButtonLabel(reviewCount)}
                </AuroraLightButton>
              ) : canEdit ? (
                <AuroraLightButton
                  variant="ghost"
                  to={addDataHref(uiV2, { add: 'tb' })}
                  icon={<CloudUpload size={15} aria-hidden="true" />}
                >
                  Add data
                </AuroraLightButton>
              ) : null
            }
          />
        ) : warnings.length ? (
          <>
          {warningsProvisional && (
            <p
              className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] font-medium text-ink2"
              data-testid="warnings-provisional"
            >
              <span className="inline-flex items-center gap-1.5">
                <ListChecks size={15} aria-hidden="true" className="text-[#9a4508]" />
                {`These may change once ${reviewCount} account${reviewCount === 1 ? ' is' : 's are'} sorted.`}
              </span>
              {canEdit && (
                <Link
                  to={uiV2 ? REVIEW_HREF : addDataHref(uiV2, { add: 'tb' })}
                  onClick={() => requestOpenReview()}
                  className="font-semibold text-[#9a4508] underline decoration-[#9a4508]/40 underline-offset-2 hover:decoration-[#9a4508]"
                >
                  {reviewButtonLabel(reviewCount)}
                </Link>
              )}
            </p>
          )}
          <AuroraTileGrid cols={Math.min(4, Math.max(2, warnings.length))} className="au-tiles-warn">
            {warnings.map((w) => (
              <AuroraTile
                key={w.id}
                icon={w.icon}
                tone={w.verdict ?? 'neutral'}
                title={w.title}
                desc={w.desc}
                verdict={w.verdict}
                to={w.to ?? '/analytics'}
              />
            ))}
          </AuroraTileGrid>
          </>
        ) : (
          <AuroraEmpty
            icon={CheckCircle2}
            hue="#059669"
            text={periodLabel ? `Nothing flagged for ${periodLabel}.` : 'Nothing flagged yet.'}
            action={
              <AuroraLightButton variant="ghost" to="/analytics" icon={<BarChart3 size={15} aria-hidden="true" />}>
                Open analytics
              </AuroraLightButton>
            }
          />
        )}
      </AuroraSection>

      {/* ── This year's numbers — money in vs out, and against the budget ──── */}
      <AuroraSection
        icon={BarChart3}
        title="This year’s numbers"
        subtitle="Money in, money out, and the budget"
        count={periodLabel}
      >
        <AuroraCols>
          <AuroraCard
            title="Money in vs. money out"
            subtitle="Total income and total spending"
            verdict={changeInNetAssets == null ? null : changeInNetAssets >= 0 ? 'good' : 'risk'}
            verdictLabel={changeInNetAssets == null ? null : changeInNetAssets >= 0 ? 'Ahead' : 'Behind'}
            big={
              changeInNetAssets == null || !statementsHaveNumbers
                ? null
                : changeInNetAssets >= 0
                  ? `+${money(changeInNetAssets)} left over`
                  : `${money(Math.abs(changeInNetAssets))} short`
            }
            bigTone={changeInNetAssets == null ? null : changeInNetAssets >= 0 ? 'good' : 'risk'}
            footer={
              <AuroraLightButton to="/statements" icon={<FileStack size={15} aria-hidden="true" />}>
                View statements
              </AuroraLightButton>
            }
          >
            {statementsHaveNumbers ? (
              <AuroraColumns
                ariaLabel={`Money in, money out and left over for ${periodLabel ?? 'this year'}`}
                bars={[
                  { key: 'in', label: 'Money in', value: totalRevenue, display: moneyShort(totalRevenue), full: money(totalRevenue) },
                  { key: 'out', label: 'Money out', value: totalExpense, display: moneyShort(totalExpense), full: money(totalExpense), color: 'var(--au-h2, #7c3aed)' },
                  {
                    key: 'left',
                    label: 'Left over',
                    value: changeInNetAssets,
                    display: changeInNetAssets == null ? null : `${changeInNetAssets >= 0 ? '+' : ''}${moneyShort(changeInNetAssets)}`,
                    full: money(changeInNetAssets),
                    color: leftColor,
                  },
                ]}
              />
            ) : (
              <p className="mt-3 text-small text-ink2">No totals yet — the accounts still need sorting.</p>
            )}
          </AuroraCard>

          <AuroraCard
            tone={budgetSummary.available ? (budgetSummary.netVar >= 0 ? 'good' : 'risk') : null}
            title="Budget vs. what happened"
            subtitle="What was left over: planned and actual"
            verdict={budgetSummary.available ? (budgetSummary.netVar >= 0 ? 'good' : 'risk') : null}
            verdictLabel={budgetSummary.available ? (budgetSummary.netVar >= 0 ? 'Ahead' : 'Behind') : null}
            big={
              budgetSummary.available
                ? budgetSummary.netVar >= 0
                  ? `${money(budgetSummary.netVar)} better than budget`
                  : `${money(Math.abs(budgetSummary.netVar))} short of budget`
                : null
            }
            bigTone={budgetSummary.available ? (budgetSummary.netVar >= 0 ? 'good' : 'risk') : null}
            footer={
              budgetSummary.available ? (
                <AuroraLightButton to="/budget" hue={budgetSummary.netVar >= 0 ? '#059669' : '#e11d48'} icon={<Target size={15} aria-hidden="true" />}>
                  View budget
                </AuroraLightButton>
              ) : null
            }
          >
            {budgetSummary.available ? (
              <AuroraColumns
                ariaLabel="Left over: planned versus actual"
                bars={[
                  { key: 'plan', label: 'Planned', value: budgetSummary.netBud, display: moneyShort(budgetSummary.netBud), full: money(budgetSummary.netBud), dashed: true },
                  {
                    key: 'actual',
                    label: 'Actual',
                    value: budgetSummary.netAct,
                    display: moneyShort(budgetSummary.netAct),
                    full: money(budgetSummary.netAct),
                    color: budgetSummary.netVar >= 0 ? '#059669' : '#e11d48',
                  },
                ]}
              />
            ) : (
              <AuroraEmpty
                className="mt-4"
                icon={Wallet}
                text={periodLabel ? `No budget for ${periodLabel} yet.` : 'No budget yet.'}
                action={
                  <AuroraLightButton variant="ghost" to={addDataHref(uiV2, { add: 'budget' })} icon={<Wallet size={15} aria-hidden="true" />}>
                    Set up a budget
                  </AuroraLightButton>
                }
              />
            )}
          </AuroraCard>
        </AuroraCols>
      </AuroraSection>

      {/* ── Go further — one tile per finance workspace ───────────────────── */}
      <AuroraSection icon={Compass} title="Go further" subtitle="Open a tool">
        <AuroraTileGrid cols={3}>
          {/* (1) STATEMENTS */}
          <AuroraTile
            to="/statements"
            icon={FileStack}
            title="Statements"
            desc="Income, costs and what’s left, the way the board sees them."
            verdictLabel={periodLabel}
          />
          {/* (2) ANALYTICS — the year-by-year vitals */}
          <AuroraTile
            to="/analytics"
            icon={BarChart3}
            hue="var(--au-h2)"
            title="Analytics"
            desc="Margin, cash and reserve, year by year."
            verdictLabel={vitalsAvailable ? `${vitalsAvailable} measure${vitalsAvailable === 1 ? '' : 's'}` : null}
          />
          {/* (3) CASH FORECAST — the FORWARD view.
              Its own tile rather than a line inside Cash & Collections: that page
              answers "what is outstanding today", this one answers "when do we run
              low". Different questions, and folding the second into the first is
              how it stops being found. Words only, no invented projection. */}
          <AuroraTile
            to="/cash-flow"
            icon={TrendingUp}
            hue="var(--au-h3)"
            title="Cash Forecast"
            desc="When cash may run low, and how much notice you get."
          />
          {/* (4) BUDGET */}
          <AuroraTile to="/budget" icon={Wallet} title="Budget" desc="Plan vs. actual, line by line." />
          {/* (5) REPORTS — the workspace + the board packet export */}
          <AuroraTile
            to="/reports"
            icon={FileBarChart2}
            hue="var(--au-h2)"
            title="Reports"
            desc="A board-ready packet for this year, and every report."
            foot={selectedPeriodId ? <BoardPacketExportButton periodId={selectedPeriodId} /> : null}
          />
          {/* (6) READINESS — serious findings / items to report */}
          <AuroraTile
            to="/readiness"
            icon={ShieldCheck}
            tone={complianceSummary && !(dataIncomplete && readinessTone === 'good') ? readinessTone : null}
            title="Readiness"
            desc={
              !complianceSummary
                ? 'Check the books are ready for review.'
                : dataIncomplete && material === 0 && reportable === 0
                  ? 'Not checked yet — finish this year’s numbers first.'
                  : material > 0
                  ? `${material} serious finding${material === 1 ? '' : 's'} and ${reportable} item${reportable === 1 ? '' : 's'} to report.`
                  : reportable > 0
                    ? `${reportable} item${reportable === 1 ? '' : 's'} to report.`
                    : 'No problems found.'
            }
            verdict={complianceSummary && !(dataIncomplete && readinessTone === 'good') ? readinessTone : null}
            data-testid="readiness-tile"
            verdictLabel={
              !complianceSummary ? null : material > 0 ? `${material} to fix` : reportable > 0 ? `${reportable} to review` : null
            }
          />
        </AuroraTileGrid>
      </AuroraSection>

      <HowThisWorks>
        <p>
          Every figure comes from the numbers saved for {periodLabel ?? 'the selected year'}. “Left over” is money
          in minus money out.
        </p>
        <p>
          Good, Watch and At risk use KYRO’s standard range for each measure. A figure with no range shows no
          label. Budget figures compare against your own budget, so they say ahead or behind instead.
        </p>
        <p>
          Warnings are KYRO’s reading of the same numbers
          {insightText && insightSource === 'llm' ? ', written by AI — check them before sharing' : ''}.
        </p>
      </HowThisWorks>
    </div>
    )
  }

  // The celebration is mounted OUTSIDE the branch that opens it: it portals to
  // document.body, and keeping it here means a user who clicks a destination and
  // comes back, or who reopens it from "What changed", gets the same one instance
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
          <FinanceAddData schoolName={activeSchool?.name ?? null}>
            <AddDataTab
              module="finance"
              schoolId={schoolId}
              periodId={selectedPeriodId}
              canEdit={canEdit}
              onLitUp={() => setRevealSchoolId(schoolId)}
              dataReady={statementsHaveNumbers}
              // "Done — show my numbers": the overview opens on the year just
              // saved, with freshly read figures (the band, warnings, charts).
              onFinished={(periodId) => {
                if (periodId) setSelectedPeriodId(periodId)
                // A school's FIRST year added here must not land on the
                // first-run screen (its latch holds it on purpose for the
                // in-place intake) — the person asked for their numbers.
                setFirstRunSchoolId(null)
                reloadMetrics()
              }}
            />
          </FinanceAddData>
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

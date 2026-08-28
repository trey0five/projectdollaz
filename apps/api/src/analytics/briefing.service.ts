import { Injectable, NotFoundException } from '@nestjs/common'
import {
  type MetricResult,
  bandsFor,
  formatMetricValueLong,
  healthStatus,
  projectCashRunway,
  resolveDisplayUnit,
  gateAggregates,
  materialGap,
  suppressSmallCell,
} from '@finrep/analytics'
import { SCORE_TYPE_FOR_FAMILY, TEST_FAMILY, type MembershipRole, type TestTypeKey } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AnalyticsService } from './analytics.service.js'
import { ComplianceService } from '../compliance/compliance.service.js'
import { ChecklistService } from '../compliance/checklist.service.js'
import { ReconciliationService } from '../compliance/reconciliation.service.js'
import { CorrectiveActionService } from '../compliance/corrective-action.service.js'
import { BillingService } from '../billing/billing.service.js'
import { PoliciesService } from '../governance/policies.service.js'
import { MeetingsService } from '../governance/meetings.service.js'
import { TasksService } from '../workflow/tasks.service.js'
import { AccreditationService } from '../accreditation/accreditation.service.js'
import { AccreditationCycleService } from '../accreditation/accreditation-cycle.service.js'
import { FacilitiesService } from '../facilities/facilities.service.js'
import { AdvancementService } from '../advancement/advancement.service.js'
import { StrategyService } from '../strategy/strategy.service.js'
import { PlanningSignalsService } from './planning-signals.js'
import { EnrollmentPlanService } from './enrollment-plan.js'
import {
  ACCREDITATION_REVIEW_SOON_DAYS,
  ADVANCEMENT_CLOSING_SOON_DAYS,
  AGENDA_DUE_SOON_DAYS,
  BADLY_OVERDUE_DAYS,
  DUE_SOON_DAYS,
  MINUTES_APPROVAL_SLA_DAYS,
} from '@finrep/compliance'
import {
  applyLens,
  availableLensesFor,
  clampLens,
  type AttentionVoice,
  type Lens,
} from './briefing-lens.js'
import { buildAgingAttentionItems } from './briefing-aging.js'
import { buildReconciliationItems } from './briefing-reconciliation.js'
import { CashFlowService, type ProjectionResponse } from '../cashflow/cashflow.service.js'
// The SAME human label QBO events put on a category ("debt_service" → "Debt
// service"), so the briefing never speaks a snake_case key aloud. Already in the
// module graph via CashFlowService → QboEventsService; no new edge.
import { categoryTitle } from '../cashflow/qbo-events.service.js'
// THE FY BUCKETING RULE (Jul–Jun), imported rather than copied: a second copy of
// this function would put a September reading in one fiscal year on the way in
// and a different one on the way out. Pure function; no DI/module edge.
import { fyEndForObservedOn } from '../enrollment/enrollment.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 (slice 1) — the prioritised attention briefing. A READ-ONLY synthesis
// layer that injects and REUSES the already-existing per-period services. It
// computes NOTHING new: it reads MetricResult.status (health band), the AUP
// compliance counts, the scholarship reconciliation status, the open CAP items,
// and the readiness-checklist rollup, then projects each off-band/gap signal into
// a normalized, RANKED, EXPLAINABLE AttentionItem[] (every item carries a plain-
// language `why`). Tenant isolation + entitlement come free from the injected
// services + the AnalyticsController guard chain. Graceful on missing data: a
// period with no snapshot returns a single "get started" item with a 200, never
// a 500.
// ─────────────────────────────────────────────────────────────────────────────

export type AttentionSeverity = 'critical' | 'warn' | 'info'
export type AttentionSource =
  | 'metric'
  | 'compliance'
  | 'data'
  | 'governance'
  | 'workflow'
  | 'accreditation'
  | 'facilities'
  | 'advancement'
  // Phase 5 Strategic Planning — the plan-health briefing signal (STEP 2.13).
  | 'strategy'
  // Phase 2 Enrollment Intelligence — the cross-domain enrollment→tuition→cash item.
  | 'enrollment'
  // AR/AP aging — the Cash & Collections briefing STEP (reads the persisted snapshot
  // directly via Prisma; value-safe aggregate $ + counts only).
  | 'cash'
  // Phase 6 HR & Staffing — the staffing data-completeness signal (STEP 2.14).
  | 'hr'
  // Phase 6 Planning & Forecasting — the planning-artifact completeness signals
  // (STEP 2.15). Variance SEVERITY stays STEP 1's job (the banded metrics).
  | 'planning'
  // AIC Phase E — the accreditation CONSEQUENCE of a fact another step may already
  // state operationally; never the operational restatement (STEP 2.16). The
  // suppression table below is what enforces that distinction, and it is a Set in
  // code rather than a convention in a comment.
  | 'earlywarning'
  // Academics — the classroom domain (STEP 2.17). Aggregates only: this source
  // reads the school-aggregate table, which carries no identity column.
  | 'academics'

/**
 * A task at least this many days past due escalates the workflow overdue item from
 * warn → critical. Deliberately TIGHTER than the governance BADLY_OVERDUE_DAYS=90
 * (tasks are day-scale operational work, so two weeks past due is already
 * critical). Lives here (not in the pure helper) so the pure layer stays minimal
 * and the briefing owns the severity decision.
 */
const WORKFLOW_BADLY_OVERDUE_DAYS = 14

/**
 * The cash-forecast omission keys that describe an OUTFLOW ONLY — the complete
 * list, and it is deliberately tiny.
 *
 * STEP 2.18 refuses to narrate a projected shortfall whenever any RECEIPT-side
 * input is missing, because a forecast holding every outflow and none of a
 * school's tuition draws a catastrophic trough that is an artefact of absent
 * data. Classifying by exclusion — everything not named here counts as a revenue
 * omission — is what makes that safe over time: an omission key added later by
 * somebody who never read this file suppresses the item rather than silently
 * re-enabling a warning the data cannot support.
 *
 * `no_commitments` is the one genuine exception: it says payroll, debt service
 * and insurance are absent, which makes a trough SHALLOWER than reality, never
 * deeper — the direction that cannot produce a false alarm.
 */
const CASH_OUTFLOW_ONLY_OMISSIONS = new Set<string>(['no_commitments'])

/** How long one school's briefing forecast read is reused (see readCashForecast). */
const BRIEFING_FORECAST_TTL_MS = 10 * 60 * 1000

// ── AIC Phase E — STEP 2.16's cap and its suppression table ──────────────────
//
// THE ONE IDEA: the warning engine contributes THE ACCREDITATION CONSEQUENCE,
// never the operational restatement. Eleven of the (Phase-E) twenty-two firing rules
// describe a fact some earlier step ALREADY states operationally — an overdue
// policy is `governance:policies-overdue` at STEP 2.5, a thin reserve is a banded
// metric at STEP 1, a rising AR is `cash:ar-overdue` at STEP 2.11. Letting the
// engine restate them would double every one of those lines and teach a reader
// that the briefing repeats itself.
//
// So each firing rule is CONSCIOUSLY on one side of this table. A spec asserts
// SUPPRESSED ∪ BRIEFABLE covers every firing ruleId in TWIN_RULE_IDS — a new rule
// that is on neither FAILS THE BUILD rather than silently appearing. AIC Phase F
// took the firing set from twenty-two to twenty-five and all three new rules were
// classified BRIEFABLE, each with its reason recorded beside the entry.
//
// The lists are plain string arrays and NOT derived from `@finrep/compliance` at
// runtime, deliberately: this file is on the hot path of every briefing request
// for every school, and a briefing must not acquire a hard dependency on the twin
// engine loading. The spec does the cross-check against the real ids.

/**
 * THE HARD CAP, and it is enforced by a `.slice()` in code — not by a lens, not
 * by a UI, not by a comment. A school with forty open findings gets two items,
 * under every lens, because the briefing is a prioritised page and the
 * Accreditation centre is where forty findings belong.
 */
const EARLY_WARNING_MAX_ITEMS = 2

/** Suppressed: an earlier step already states this fact operationally. */
const EARLY_WARNING_SUPPRESSED: ReadonlySet<string> = new Set([
  'GOV-POLICY-OVERDUE', // STEP 2.5  governance:policies-overdue
  'GOV-MINUTES-LAG', // STEP 2.5  governance:minutes-approval-pending
  'FIN-RESERVE-THIN', // STEP 1    metric:months_operating_reserve (banded)
  'FIN-BUDGET-DETERIORATING', // STEP 1    metric:operating_margin (banded)
  'FIN-AR-AGING-WORSENING', // STEP 2.11 cash:ar-overdue
  'STRAT-PLAN-EXPIRING', // STEP 2.13c strategy:plan-review-due
  'ENR-DECLINE', // STEP 2.10 enrollment:below-plan
  'EVI-MISSING-REQUIRED', // STEP 2.7  accreditation:coverage-gap
  'FAC-BACKLOG', // STEP 2.8  facilities:maintenance-backlog
  'HR-RATIO-DRIFT', // STEP 1    metric:student_teacher_ratio (banded)
  'SCHOOL-NOT-REPORTING', // STEP 1    data:no-snapshot (and `info`, already excluded)
])

/**
 * Briefable: nothing else in the briefing says this, and the accreditation
 * consequence is the whole point of saying it.
 *
 * Note what is NOT here and why. `EVI-MISSING-REQUIRED` is suppressed because 2.7
 * already counts standards with no evidence; `EVI-STALE` is briefable because 2.7
 * is EXISTENCE-only and has never once mentioned currency. `ACC-ASSURANCE-GAP` is
 * briefable because 2.7 counts gaps generically and NEVER distinguishes a binary
 * assurance gate — with a copy constraint a spec enforces: its `why` must name the
 * assurance and its standard code and must not restate a coverage count.
 */
const EARLY_WARNING_BRIEFABLE_RULE_IDS: readonly string[] = [
  'GOV-MINUTES-NEVER-RECORDED',
  'GOV-CADENCE-GAP',
  'GOV-TERM-EXPIRY',
  'GOV-COMMITTEE-NO-CHAIR',
  'FIN-AUDIT-STALE',
  'STRAT-PLAN-EXPIRED',
  'ENR-FEEDER-EROSION',
  'ACC-UNSCORED',
  'ACC-UNSUPPORTED-SCORE',
  'ACC-ASSURANCE-GAP',
  'EVI-STALE',
  // ── AIC Phase F — three rules, three CONSCIOUS briefable decisions ──────────
  //
  // No step in the briefing states anything about staff evaluations. STEP 1's HR
  // metrics are the student-teacher ratio and staff FTEs — a different fact
  // entirely. Nothing is restated, and the item is COUNTS ONLY: the finding this
  // renders carries four count/day keys and names no employee, which is what makes
  // an adult-staff-PII register briefable at all.
  'HR-EVAL-OVERDUE',
  // STEP 2.8 (`facilities:maintenance-backlog`) states a backlog SIZE. This states
  // a NAMED REGULATORY INSPECTION past its own target date, and its accreditation
  // consequence — a binary assurance gate under COG-A3 — is stated nowhere else.
  // COPY CONSTRAINT, spec-enforced exactly like ACC-ASSURANCE-GAP's: its `why` must
  // name the inspection kind and the standard code, and must NOT restate the
  // backlog count. (FAC-BACKLOG itself stays SUPPRESSED, above.)
  'FAC-INSPECTION-DUE',
  // Nothing in the briefing has ever mentioned a prior visit. "The 2021 team cited
  // you here, and it is still open" is the single most credible sentence this
  // product can say, and the briefing is where it belongs.
  'ACC-PRIOR-FINDING-OPEN',
  // ── AIC Phase K — two rules, two CONSCIOUS briefable decisions ──────────────
  //
  // A lapsed safe-environment clearance is the single most consequential
  // documentary gap a diocesan school can carry into a review, and the briefing
  // states nothing like it today. It is briefable ONLY because the finding is
  // counts-only: four count/day keys, no name, no personId, not even the kind of
  // clearance. A per-person version of this sentence would be unbriefable at any
  // severity — the briefing is read aloud by Penny and pasted into board packets.
  'SAFE-ENV-GAP',
  // STEP 1's HR metrics are the student-teacher ratio and staff FTEs; neither says
  // anything about whether the faculty is being developed, so nothing is restated.
  // Counts only, and never a currency figure — the rule reads participation and
  // the register holds no spend to leak.
  'HR-PD-LOW',
]

export {
  EARLY_WARNING_MAX_ITEMS,
  EARLY_WARNING_SUPPRESSED,
  EARLY_WARNING_BRIEFABLE_RULE_IDS,
}

/** The ledger columns STEP 2.16 reads. Nothing else is selected. */
interface EarlyWarningRow {
  ruleId: string
  findingKey: string
  severity: string
  standardTags: string[]
  horizonKind: string
  horizonDate: Date | null
  evidencePayload: unknown
}

/**
 * One early-warning item.
 *
 * `title`, `rationale` and `consequence` are read VERBATIM from the stored
 * `evidencePayload` — server-composed by the pure engine and numerically
 * validated at composition. NOTHING is re-worded here, and no number is composed
 * here, so value-safety holds by construction rather than by review.
 */
function buildEarlyWarningItem(f: EarlyWarningRow): AttentionItem | null {
  const payload = (f.evidencePayload ?? {}) as Record<string, unknown>
  const title = typeof payload.title === 'string' ? payload.title : null
  const rationale = typeof payload.rationale === 'string' ? payload.rationale : null
  const consequence = typeof payload.consequence === 'string' ? payload.consequence : ''
  const code = f.standardTags[0]
  // G3 AT THE BRIEFING TOO: no standard code, no item. A finding that cannot name
  // the standard it would be cited under has nothing to tell a head of school.
  if (!code || !title || !rationale) return null
  return {
    id: `earlywarning:${f.ruleId.toLowerCase()}`,
    severity: f.severity === 'critical' ? 'critical' : 'warn',
    source: 'earlywarning',
    title: `${code} — ${title}`,
    why: `${rationale} ${consequence}`.trim(),
    metricKey: null,
    value: null,
    // `?center=`, NOT `?tab=`: under ui.v2 /accreditation is wrapped in ModuleTabs,
    // which owns `?tab=` for its own panels (overview | add | records). The page
    // reads `center` for its five inner tabs and `rule` to lead the rail with the
    // finding this line is about, then strips them.
    //
    // `finding` CARRIES THE SCOPE, and it is not redundant with `rule`. Three of
    // the eleven briefable rules are per-scope (ACC-ASSURANCE-GAP and
    // ACC-UNSUPPORTED-SCORE per standard, EVI-STALE per artifact), and the cap
    // above emits ONE item per ruleId — so a school with six unmet assurances gets
    // one line naming COG-A1. On a ruleId-only link the page marked all six
    // findings "From your briefing", which says the brief mentioned five standards
    // it never mentioned. The rule still leads the rail (that is what `rule` is
    // for); only the finding this line actually named is chipped.
    link: `/accreditation?center=signals&rule=${f.ruleId}&finding=${encodeURIComponent(
      f.findingKey,
    )}`,
    // A stated register date is a FACT, so it becomes a due date. A projected
    // horizon is not a date and never becomes one.
    dueDate: f.horizonKind === 'by_date' && f.horizonDate ? isoDay(f.horizonDate) : null,
  }
}

/** UTC calendar day of a @db.Date column. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** One ranked, explainable thing that needs the user's attention this period. */
export interface AttentionItem {
  /** Stable, dedupe-able id, e.g. 'metric:operating_margin' | 'compliance:material'. */
  id: string
  severity: AttentionSeverity
  source: AttentionSource
  /** Short headline. */
  title: string
  /** Plain-language reason this is flagged (value + breached band / counts / variance). */
  why: string
  /** Set only when source==='metric' (a MetricKey); else null. */
  metricKey: string | null
  /** The metric's value when source==='metric'; else null. */
  value: number | null
  /** Deep-link client route the frontend passes straight to react-router. */
  link: string
  /** ISO yyyy-mm-dd when known (earliest open CAP targetDate); else null. */
  dueDate: string | null
  /**
   * ADDITIVE (Scope × Lens). Per-item reframing hint the frontend uses to pick
   * CTA wording / tone ('decision' | 'action' | 'governance'). Populated by
   * applyLens; absent on any legacy path is fine — never carries a value.
   */
  voice?: AttentionVoice
}

export interface BriefingSummary {
  total: number
  critical: number
  warn: number
  info: number
}

export interface BriefingResponse {
  periodId: string
  label: string
  generatedAt: string
  summary: BriefingSummary
  /** Pre-ranked + lens-shaped server-side: critical>warn>info, then the lens
   *  source emphasis/registry order, stable. Counts in `summary` are over THIS
   *  (lens-filtered) list, so they always match what the caller sees. */
  items: AttentionItem[]
  // ── ADDITIVE (Scope × Lens) — existing consumers that ignore these keep working ──
  /** The EFFECTIVE lens actually applied (post-clamp) — what shaped this payload. */
  lens: Lens
  /** The caller's own role / ceiling, so the FE knows whether to show the preview
   *  switcher and which lenses are selectable. */
  callerRole: Lens
  /** The lenses this caller may preview (own role + every narrower lens). */
  availableLenses: Lens[]
}

/** Money for the reconciliation variance line. */
function fmtMoney(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}$${Math.abs(Math.round(value)).toLocaleString('en-US')}`
}

/**
 * Band-aware plain-language reason a metric is flagged, generated from the
 * MetricResult's value + bands + goodDirection. Explains WHY it's on the list.
 */
function metricWhy(r: MetricResult): string {
  // resolveDisplayUnit maps a mix metric (unit 'share' but a $ total) to currency —
  // defensive/consistent with every other surface (mix metrics are unbanded today,
  // so this path is latent, but it can never mis-format if that ever changes).
  const u = resolveDisplayUnit(r.key, r.unit)
  const v = formatMetricValueLong(r.value, u)
  const isRisk = r.status === 'risk'
  if (!r.bands) {
    return `${r.label} is ${v}, in the ${isRisk ? 'risk' : 'watch'} range for this metric.`
  }
  const good = formatMetricValueLong(r.bands.good, u)
  const risk = formatMetricValueLong(r.bands.risk, u)
  if (r.bands.goodDirection === 'higher') {
    return isRisk
      ? `${r.label} is ${v} — below the ${risk} risk floor (healthy schools target ${good} or better).`
      : `${r.label} is ${v}, under the ${good} healthy target (risk below ${risk}).`
  }
  return isRisk
    ? `${r.label} is ${v} — above the ${risk} risk ceiling (target ${good} or lower).`
    : `${r.label} is ${v}, over the ${good} healthy target (risk above ${risk}).`
}

@Injectable()
export class BriefingService {
  constructor(
    private readonly periods: PeriodsService,
    private readonly analytics: AnalyticsService,
    private readonly compliance: ComplianceService,
    private readonly checklist: ChecklistService,
    private readonly reconciliation: ReconciliationService,
    private readonly corrective: CorrectiveActionService,
    // Phase 3 Governance v1 — the module gate + the policy register read.
    private readonly billing: BillingService,
    private readonly policies: PoliciesService,
    // Phase 3 Governance depth — the meeting register read (rides the governance gate).
    private readonly meetings: MeetingsService,
    // Phase 3 Workflow v1 — open-task read for the (CORE, ungated) workflow STEP.
    private readonly tasks: TasksService,
    // Phase 4 Accreditation v1 — the module gate + the standards register read.
    private readonly accreditation: AccreditationService,
    // Phase 4 Facilities v1 — the module gate + the maintenance register read.
    private readonly facilities: FacilitiesService,
    // Phase 4 Advancement v1 — the module gate + the campaign register read.
    private readonly advancement: AdvancementService,
    // Phase 5 Strategic Planning — the module gate + the ACTIVE-plan computed read for
    // STEP 2.13. Injected positional-last-BEFORE prisma so existing positional-arg
    // briefing specs (which passed prisma last) get strategy=undefined; every strategy
    // call is `this.strategy?.…`-guarded so an absent StrategyService simply yields no
    // strategy item (fail-soft) rather than throwing. getActivePlanComputed itself
    // NEVER throws (fail-soft to { hasPlan:false }), so STEP 2.13 can never 500.
    private readonly strategy: StrategyService,
    // AR/AP aging — the briefing reads the persisted snapshot DIRECTLY via Prisma
    // (the module rule: NO QboAgingService injection, NO IntegrationsModule import).
    // Added LAST so existing positional-arg briefing specs (which stop at strategy)
    // still construct; readAgingRow() guards `if (!this.prisma)` so an absent Prisma
    // simply yields no cash item (fail-soft) rather than throwing.
    private readonly prisma: PrismaService,
    // Phase 6 — STEP 2.15's planning-artifact reads: the budget/forecast signals +
    // the enrollment-plan resolve (REUSED, not re-implemented). Appended AFTER
    // prisma (positional-last) + `?.`-guarded so every existing positional-arg
    // briefing spec still constructs; absent deps simply yield no planning items
    // (fail-soft) rather than throwing. (STEP 2.14 needs NO new dep — it reads the
    // hr-gated teaching_staff_share result off the ALREADY-computed metrics
    // response, so a licensed school with missing FTEs is detected value-safely.)
    private readonly planningSignals?: PlanningSignalsService,
    private readonly enrollmentPlanSvc?: EnrollmentPlanService,
    // Penny coverage Phase 1 — STEP 2.18's forward cash projection. Appended
    // positional-LAST and `?.`-guarded, so every existing positional-arg briefing
    // spec still constructs and an absent service simply yields no cash-forecast
    // item (fail-soft) rather than throwing.
    //
    // Injected rather than read through Prisma, unlike STEP 2.11/2.12: those read
    // a PERSISTED SNAPSHOT, while a projection is a computation over commitments,
    // budget phasing and assumptions. Re-implementing it here would be a second
    // copy of the forecast, and the whole point is that the briefing states the
    // same low point the cash-flow page draws. ACYCLIC: CashFlowModule imports
    // only Auth, Prisma and Billing, none of which reaches analytics.
    private readonly cashForecast?: CashFlowService,
    // WS3 F1 — STEP 2.20's cycle-milestone read. Appended positional-LAST and
    // `?.`-guarded like its neighbours, so every existing positional-arg
    // briefing spec still constructs and an absent service simply yields no
    // cycle item. Injected (the exported AccreditationCycleService) rather than
    // recomputed: the briefing must state the SAME milestone states the journey
    // tab renders, or the two disagree on the school's own road.
    private readonly accreditationCycle?: AccreditationCycleService,
  ) {}

  /** F7 — the briefing-only forecast cache (see readCashForecast). Instance-level,
   *  so unit specs constructing fresh services never share state. */
  private readonly briefingForecastCache = new Map<
    string,
    { at: number; value: ProjectionResponse | null }
  >()

  /**
   * THE FORWARD CASH PROJECTION for STEP 2.18, or null.
   *
   * Fail-soft in every direction — an absent service (older positional-arg mocks),
   * an unlicensed school, no stated opening balance, or a thrown read all yield
   * null, so this step can never 500 the briefing.
   *
   * ★ `persist: false`. project() FREEZES a CashProjectionRun by default, and that
   * archive is the record of what a school was TOLD and WHEN — the basis of
   * forecast-vs-actual back-testing. A briefing is generated on every page load;
   * letting it write there would bury every real decision under thousands of
   * page views, and the archive cannot be repaired retroactively.
   */
  private async readCashForecast(schoolId: string): Promise<ProjectionResponse | null> {
    // ── A SHORT TTL CACHE, FOR THE BRIEFING READ ONLY ────────────────────────
    //
    // project() reaches QBO LIVE (invoices/bills via qboEvents), and a briefing
    // is generated on every Home render — OrgHome multiplies that by the school
    // count. Ten minutes of staleness on a *projection* is invisible (its inputs
    // move on human timescales: a keyed opening balance, commitments, a budget
    // spread), while N live Intuit reads per page load is rate-limit and latency
    // budget spent on re-deriving the same answer.
    //
    // TRADE-OFF, stated: a school that fixes its forecast inputs may wait up to
    // ten minutes for the briefing item to notice. The assistant tool path
    // (get_cash_forecast) stays LIVE and uncached — a person asking Penny a
    // direct question gets the current projection, not this cache.
    const hit = this.briefingForecastCache.get(schoolId)
    if (hit && Date.now() - hit.at < BRIEFING_FORECAST_TTL_MS) return hit.value
    const value = await this.readCashForecastUncached(schoolId)
    // Bounded: evict expired entries once the map grows past a sane tenancy size.
    if (this.briefingForecastCache.size > 512) {
      for (const [k, v] of this.briefingForecastCache) {
        if (Date.now() - v.at >= BRIEFING_FORECAST_TTL_MS) this.briefingForecastCache.delete(k)
      }
    }
    this.briefingForecastCache.set(schoolId, { at: Date.now(), value })
    return value
  }

  private async readCashForecastUncached(schoolId: string): Promise<ProjectionResponse | null> {
    if (!this.cashForecast) return null
    try {
      // The controller's own gate, mirrored: @RequiresModule('finance','planning')
      // with OR semantics. Fail CLOSED — a billing hiccup hides the item.
      const [finance, planning] = await Promise.all([
        this.billing.isEntitledForModule(schoolId, 'finance').catch(() => false),
        this.billing.isEntitledForModule(schoolId, 'planning').catch(() => false),
      ])
      if (!finance && !planning) return null
      const today = new Date().toISOString().slice(0, 10)
      const opening = await this.cashForecast.getOpening(schoolId, today)
      // No stated opening balance means no forecast has ever been built. The
      // trial-balance cash total is NOT available operating cash and substituting
      // it would overstate every week that followed, so the honest output is no
      // item at all rather than a shortfall measured from an invented start.
      if (opening.openingCash === null || !opening.asOfDate) return null
      return await this.cashForecast.project(schoolId, null, {
        openingCash: opening.openingCash,
        asOfDate: opening.asOfDate,
        openingSource: opening.source ?? 'keyed',
        horizon: '13w',
        persist: false,
      })
    } catch {
      return null
    }
  }

  /**
   * The latest filed enrollment reading, by grade — STEP 2.10's grade clause and
   * STEP 2.19's reconciliation pair. Read DIRECTLY via the global PrismaService
   * inside the STEP-2 fan-out, the module rule STEP 2.11/2.12/2.17 already
   * follow: EnrollmentModule imports AnalyticsModule, so injecting its services
   * here would be a genuine cycle. Fail-soft to null.
   */
  private async readEnrollmentReading(schoolId: string, periodEndDate: unknown) {
    if (!this.prisma?.enrollmentSnapshot) return null
    // ── F3: BOUNDED TO THE BRIEFING PERIOD'S FISCAL YEAR ─────────────────────
    // The reading is compared against PERIOD-scoped promoted data (STEP 2.10's
    // grade clause, STEP 2.19's reconciliation pair). Unbounded, a briefing
    // opened on a historical period would compare last year's promote against
    // TODAY'S register and fire a permanently false "two headcounts on file".
    // The FY window comes from the SAME Jul–Jun bucketing rule the intake
    // pipeline files snapshots with (fyEndForObservedOn) — no second copy.
    // No snapshot inside the period's FY → no reading → both steps stay silent.
    const endIso =
      typeof periodEndDate === 'string'
        ? periodEndDate.slice(0, 10)
        : periodEndDate instanceof Date
          ? periodEndDate.toISOString().slice(0, 10)
          : null
    if (!endIso || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) return null
    const fyEnd = fyEndForObservedOn(endIso)
    const fyStart = `${Number(fyEnd.slice(0, 4)) - 1}-07-01`
    return this.prisma.enrollmentSnapshot
      .findFirst({
        where: { schoolId, observedOn: { gte: new Date(fyStart), lte: new Date(fyEnd) } },
        orderBy: { observedOn: 'desc' },
        select: { observedOn: true, totalEnrolled: true, byGrade: true },
      })
      .catch(() => null)
  }

  /**
   * The promoted headcount for THIS period (period_operational_data) — STEP
   * 2.19's other half. Read in the STEP-2 fan-out (n5: it used to be a duplicate
   * sequential await inside the step). Fail-soft to null in both directions.
   */
  private async readPromotedEnrollment(schoolId: string, fiscalPeriodId: string) {
    if (!this.prisma?.periodOperationalData) return null
    return this.prisma.periodOperationalData
      .findUnique({
        where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId } },
        select: { enrollment: true },
      })
      .catch(() => null)
  }

  /**
   * The latest persisted aging snapshot for the school (by capturedAt). Fail-soft in
   * BOTH directions: an absent PrismaService (older positional-arg unit mocks) → null,
   * and a query error → null. NEVER throws, so STEP 2.11 can never 500 the briefing.
   */
  /**
   * The school's assessment aggregates — AGGREGATES ONLY. This table carries no
   * identity column, which is why the briefing may read it directly: there is
   * nothing here that could name a child even by mistake.
   */
  private async readAcademicRows(schoolId: string) {
    if (!this.prisma?.assessmentSchoolAggregate) return null
    return this.prisma.assessmentSchoolAggregate
      .findMany({
        where: { schoolId, gradeLevel: 'all' },
        select: { schoolYear: true, testType: true, derivation: true, avgComposite: true, testedCount: true },
        orderBy: { schoolYear: 'desc' },
        take: 24,
      })
      .catch(() => null)
  }

  private async readAgingRow(schoolId: string) {
    if (!this.prisma?.arApAgingSnapshot) return null
    return this.prisma.arApAgingSnapshot
      .findFirst({ where: { schoolId }, orderBy: { capturedAt: 'desc' } })
      .catch(() => null)
  }

  /**
   * The latest persisted cash-flow + reconciliation snapshot for the school (by
   * capturedAt). Fail-soft in BOTH directions (absent PrismaService / query error →
   * null), so STEP 2.12 can never 500 the briefing. Read DIRECTLY via Prisma — NO
   * QboCashFlowService injection, NO IntegrationsModule import (the module rule).
   */
  private async readCashFlowRow(schoolId: string) {
    if (!this.prisma?.cashFlowSnapshot) return null
    return this.prisma.cashFlowSnapshot
      .findFirst({ where: { schoolId }, orderBy: { capturedAt: 'desc' } })
      .catch(() => null)
  }

  /**
   * AIC Phase E — the open, un-muted, BRIEFABLE early warnings for one school.
   *
   * Every constraint is in the QUERY, not in a filter afterwards, so the read is
   * bounded before it reaches this process:
   *   • `clearedAt: null`                  the rule is still firing
   *   • status not resolved/dismissed      a human has not closed it
   *   • severity critical|warn             `info` is a statement about our own
   *                                        visibility, never an inbox item
   *   • ruleId in the BRIEFABLE list       the suppression table, enforced in SQL
   *   • mutedUntil null or in the past     a live mute is a human saying "not now"
   *
   * `severity: 'asc'` sorts 'critical' before 'warn' ALPHABETICALLY — verified, and
   * pinned by a spec so a future severity value cannot silently reorder it.
   * `take: 20` bounds the read; the cap in STEP 2.16 bounds the output.
   *
   * Fail-soft in BOTH directions (absent PrismaService in older positional-arg unit
   * mocks / a query error) -> null, so STEP 2.16 can never 500 the briefing.
   */
  private async readEarlyWarnings(
    schoolId: string,
    generatedAt: string,
  ): Promise<EarlyWarningRow[] | null> {
    if (!this.prisma?.accreditationFinding) return null
    const rows = await this.prisma.accreditationFinding
      .findMany({
        where: {
          schoolId,
          clearedAt: null,
          status: { notIn: ['resolved', 'dismissed'] },
          severity: { in: ['critical', 'warn'] },
          ruleId: { in: [...EARLY_WARNING_BRIEFABLE_RULE_IDS] },
          OR: [{ mutedUntil: null }, { mutedUntil: { lte: new Date(generatedAt) } }],
        },
        orderBy: [{ severity: 'asc' }, { lastSeenAt: 'desc' }, { findingKey: 'asc' }],
        take: 20,
        select: {
          ruleId: true,
          findingKey: true,
          severity: true,
          standardTags: true,
          horizonKind: true,
          horizonDate: true,
          evidencePayload: true,
        },
      })
      .catch(() => null)
    if (rows === null) return null
    // EXPLICIT severity rank, because the DB orderBy above was LUCK, not design:
    // `severity` is a plain String column, so `asc` is lexical, and it put
    // 'critical' before 'warn' only because c < w in the alphabet. The two-item
    // hard cap downstream (EARLY_WARNING_MAX_ITEMS) makes this ordering
    // load-bearing — introduce a severity named 'high' or 'urgent' and the cap
    // would silently start dropping criticals. Ranked here, in code that says so.
    const SEVERITY_ORDER: Record<string, number> = { critical: 0, warn: 1 }
    return [...(rows as EarlyWarningRow[])].sort(
      (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
    )
  }

  /**
   * Build the prioritised briefing for one period. Reuses the existing services
   * (no recompute) and returns a RANKED AttentionItem[] + a summary. Tenant-safe:
   * getOwnedPeriod runs FIRST, so a wrong-tenant/unknown period throws a real 404
   * BEFORE the no-snapshot branch — a cross-tenant request is NEVER masked as a
   * friendly "get started" 200. A period that exists but has no snapshot returns a
   * single info item with a 200 (graceful, never a 500).
   */
  async getBriefing(
    schoolId: string,
    periodId: string,
    callerRole: MembershipRole = 'owner',
    lensOverride?: Lens,
    // Threaded from @CurrentUser in the controller (NEVER client-supplied). Placed
    // LAST-optional so the org fan-out (3-arg) + assistant (3-arg) + existing specs
    // still compile; when absent, the caller-scoped my-approvals item is not produced.
    callerUserId?: string | null,
  ): Promise<BriefingResponse> {
    // Tenant isolation up front: a true 404 (unknown/foreign period) propagates.
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const generatedAt = new Date().toISOString()

    // SECURITY: a lens may only NARROW/REFRAME, never widen past the caller's
    // ceiling. Default lens = caller's own role. Clamp is silent (a preview no-op).
    const effectiveLens = clampLens(callerRole, lensOverride)
    const lensMeta = {
      lens: effectiveLens,
      callerRole,
      availableLenses: availableLensesFor(callerRole),
    }

    // ── STEP 0: no-snapshot graceful path ────────────────────────────────────
    // computeMetricsResponse throws NotFound when the period has no snapshot.
    // Since the period is already proven owned above, that NotFound can ONLY mean
    // "no snapshot" — swallow it into a get-started data item (200).
    let metricsResponse
    try {
      metricsResponse = await this.analytics.computeMetricsResponse(schoolId, period.id)
    } catch (e) {
      if (e instanceof NotFoundException) {
        const item: AttentionItem = {
          // 'info', not 'warn': a fresh period with no data yet is a get-started
          // nudge, not an alarm — flagging it yellow would be a false alarm.
          id: 'data:no-snapshot',
          severity: 'info',
          source: 'data',
          title: "Generate this period's statements",
          why: `No financial statements have been saved for ${period.label} yet — upload a trial balance and generate the four statements to light up your metrics and readiness checks.`,
          metricKey: null,
          value: null,
          link: '/data',
          dueDate: null,
        }
        // Route the single get-started item through the lens too (it survives every
        // lens, gets the voice tag, and the viewer reframe), so the shape is uniform.
        const lensed = applyLens([item], effectiveLens)
        return {
          periodId: period.id,
          label: period.label,
          generatedAt,
          summary: summarise(lensed),
          items: lensed,
          ...lensMeta,
        }
      }
      throw e
    }

    const items: AttentionItem[] = []

    // ── STEP 1: off-band metric signals (source 'metric') ────────────────────
    for (const r of metricsResponse.metrics) {
      if (!r.available) continue
      if (r.status !== 'risk' && r.status !== 'watch') continue
      const severity: AttentionSeverity = r.status === 'risk' ? 'critical' : 'warn'
      items.push({
        id: `metric:${r.key}`,
        severity,
        source: 'metric',
        title:
          r.status === 'risk' ? `${r.label} is in the risk band` : `${r.label} is on watch`,
        why: metricWhy(r),
        metricKey: r.key,
        value: r.value,
        link: `/analytics?metric=${r.key}`,
        dueDate: null,
      })
    }

    // ── STEP 2: compliance / readiness signals (source 'compliance') ─────────
    // Fan out the independent reads in parallel; each fail-softs to null so one
    // failing service never 500s the whole briefing (latency = slowest, not sum).
    // The governance module gate is independent of the period reads, so it rides
    // the SAME parallel fan-out (latency = slowest, not sum) rather than adding a
    // sequential hop before STEP 2.5. Fail CLOSED (throw → not licensed) so a
    // billing hiccup hides governance items rather than leaking them.
    // The workflow open-task read (STEP 2.6) rides the SAME fan-out — it is CORE
    // (not module-gated) and fail-soft to null, so a tasks hiccup never 500s the
    // briefing and latency stays slowest-not-sum.
    const [
      compliance,
      recon,
      checklist,
      cap,
      governanceLicensed,
      openTasks,
      accreditationLicensed,
      facilitiesLicensed,
      advancementLicensed,
      strategyLicensed,
      enrollmentLicensed,
      hrLicensed,
      planningLicensed,
      agingRow,
      cashFlowRow,
      earlyWarnings,
      academicsLicensed,
      academicRows,
      cashForecast,
      enrollmentReading,
      promotedEnrollment,
    ] = await Promise.all([
      this.compliance.evaluateForPeriod(schoolId, period.id).catch(() => null),
      this.reconciliation.reconcileForPeriod(schoolId, period.id).catch(() => null),
      this.checklist.getChecklist(schoolId, period.id).catch(() => null),
      this.corrective.getPlan(schoolId, period.id).catch(() => null),
      this.billing.isEntitledForModule(schoolId, 'governance').catch(() => false),
      this.tasks.listOpenForBriefing(schoolId).catch(() => null),
      // Phase 4 Accreditation gate — rides the SAME parallel fan-out. Fail CLOSED
      // (throw → not licensed) so a billing hiccup HIDES accreditation items.
      this.billing.isEntitledForModule(schoolId, 'accreditation').catch(() => false),
      // Phase 4 Facilities gate — same fan-out, fail CLOSED (hides facilities items).
      this.billing.isEntitledForModule(schoolId, 'facilities').catch(() => false),
      // Phase 4 Advancement gate — same fan-out, fail CLOSED (hides advancement items).
      this.billing.isEntitledForModule(schoolId, 'advancement').catch(() => false),
      // Phase 5 Strategic Planning gate — same fan-out, fail CLOSED (hides the
      // strategy plan-health item for a school without the 'strategy' module).
      this.billing.isEntitledForModule(schoolId, 'strategy').catch(() => false),
      // Phase 2 Enrollment gate — same fan-out, fail CLOSED (hides the cross-domain
      // enrollment item for a finance-only school).
      this.billing.isEntitledForModule(schoolId, 'enrollment').catch(() => false),
      // Phase 6 HR gate — same fan-out, fail CLOSED (hides the staffing
      // data-completeness item for a school without the 'hr' module).
      this.billing.isEntitledForModule(schoolId, 'hr').catch(() => false),
      // Phase 6 Planning gate — same fan-out, fail CLOSED (hides the planning-
      // artifact completeness items for a school without the 'planning' module).
      this.billing.isEntitledForModule(schoolId, 'planning').catch(() => false),
      // AR/AP aging — reads the persisted snapshot DIRECTLY via Prisma (NOT via
      // QboAgingService), inside this SAME parallel fan-out so latency stays slowest-
      // not-sum. CORE (no entitlement gate); fail-soft to null (readAgingRow catches).
      this.readAgingRow(schoolId),
      // Cash-flow + reconciliation — reads the persisted snapshot DIRECTLY via Prisma
      // (same module rule as aging), inside this SAME fan-out. CORE; fail-soft to null.
      this.readCashFlowRow(schoolId),
      // AIC Phase E — the open early-warning findings for STEP 2.16, read DIRECTLY
      // via Prisma inside this SAME fan-out (latency stays slowest-not-sum).
      //
      // THE MODULE RULE, for the third time in this file: TwinModule imports
      // AnalyticsModule, and BriefingService lives in AnalyticsModule — so
      // injecting EarlyWarningService would create analytics -> twin -> analytics,
      // a genuine cycle. STEP 2.11 and STEP 2.12 set the precedent (they read
      // ArApAgingSnapshot and CashFlowSnapshot the same way, for the same reason).
      // PrismaService is global: no new import, no new module edge, no forwardRef.
      //
      // Fail-soft to null: a missing table (deploy order) or a query error yields
      // NO items and a 200, never a partial briefing and never a 500.
      this.readEarlyWarnings(schoolId, generatedAt),
      // Academics gate — same fan-out, fail CLOSED (hides the academic items for
      // a school without the 'academics' module). Appended LAST so every prior
      // position in this destructuring stays exactly where it was.
      this.billing.isEntitledForModule(schoolId, 'academics').catch(() => false),
      // The academic aggregates for STEP 2.17, read DIRECTLY via the global
      // PrismaService inside this SAME fan-out — the module rule again (importing
      // AcademicsModule for one read would be a new module edge). AGGREGATES
      // ONLY: this table has no identity column, so no briefing line can name a
      // student even by accident. Fail-soft to null.
      this.readAcademicRows(schoolId),
      // Penny coverage Phase 1 — STEP 2.18's forward projection and STEP
      // 2.10/2.19's enrollment reading, both inside this SAME fan-out so latency
      // stays slowest-not-sum. Each is gated and fail-soft inside its own reader.
      // Appended LAST so every prior position in this destructuring is unmoved.
      this.readCashForecast(schoolId),
      // F3: the reading is bounded to THIS period's fiscal year — an unbounded
      // read compared a historical period against today's register.
      this.readEnrollmentReading(schoolId, (period as { periodEndDate?: unknown }).periodEndDate),
      // n5: STEP 2.19's promoted headcount, moved out of the step's own
      // sequential await and into this SAME fan-out (latency slowest-not-sum).
      this.readPromotedEnrollment(schoolId, period.id),
    ])

    // 2a — open 2A findings (material -> critical, reportable -> warn).
    if (compliance) {
      const { material, reportable } = compliance.summary.counts
      if (material > 0) {
        items.push({
          id: 'compliance:material',
          severity: 'critical',
          source: 'compliance',
          title: `${material} material finding${material === 1 ? '' : 's'} to resolve`,
          why: `A review will require a Corrective Action Plan for ${material === 1 ? 'this material exception' : 'these material exceptions'}. Open the readiness findings to address ${material === 1 ? 'it' : 'them'}.`,
          metricKey: null,
          value: null,
          link: '/readiness',
          dueDate: null,
        })
      }
      if (reportable > 0) {
        items.push({
          id: 'compliance:reportable',
          severity: 'warn',
          source: 'compliance',
          title: `${reportable} reportable item${reportable === 1 ? '' : 's'} to review`,
          why: `${reportable} item${reportable === 1 ? ' was' : 's were'} flagged as reportable in your AUP readiness — review ${reportable === 1 ? 'it' : 'them'} before your audit.`,
          metricKey: null,
          value: null,
          link: '/readiness',
          dueDate: null,
        })
      }
    }

    // 2b — scholarship reconciliation off (variance only; needs_data is a non-
    // actionable absence, matched is clean — neither produces an item).
    if (recon && recon.result.status === 'variance') {
      const variance = recon.result.variance
      const why =
        variance !== null
          ? `Recorded scholarship revenue and disbursements differ by ${fmtMoney(variance)}${recon.result.variancePct !== null ? ` (${recon.result.variancePct.toFixed(1)}% of disbursed)` : ''}. Reconcile before the AUP review.`
          : 'Recorded scholarship revenue and disbursements differ beyond tolerance. Reconcile before the AUP review.'
      items.push({
        id: 'compliance:reconciliation',
        severity: 'warn',
        source: 'compliance',
        title: 'Scholarship funds do not reconcile',
        why,
        metricKey: null,
        value: null,
        link: '/readiness',
        dueDate: null,
      })
    }

    // 2c — open CAP items (un-started only; in_progress/complete/resolved excluded
    // to keep the list actionable). Carries the earliest open target date.
    if (cap && cap.summary.openCount > 0) {
      const open = cap.summary.openCount
      const earliest =
        cap.entries
          .filter((e) => e.status === 'open' && !e.isResolved && e.targetDate)
          .map((e) => e.targetDate as string)
          .sort()[0] ?? null
      items.push({
        id: 'compliance:cap-open',
        severity: 'warn',
        source: 'compliance',
        title: `${open} corrective action${open === 1 ? '' : 's'} still open`,
        why: `${open} corrective-action item${open === 1 ? ' has' : 's have'} not been started. Assign an owner and target date in the Corrective Action Plan.`,
        metricKey: null,
        value: null,
        link: '/readiness',
        dueDate: earliest,
      })
    }

    // 2d — readiness checklist not complete (info nudge).
    if (checklist && checklist.rollup.total > 0 && checklist.rollup.pctComplete < 100) {
      const { pending, total, pctComplete } = checklist.rollup
      items.push({
        id: 'compliance:checklist',
        severity: 'info',
        source: 'compliance',
        title: `Year-end checklist ${pctComplete}% complete`,
        why: `${pending} of ${total} checklist item${pending === 1 ? '' : 's'} still need attention before your packet is review-ready.`,
        metricKey: null,
        value: null,
        link: '/readiness',
        dueDate: null,
      })
    }

    // ── STEP 2.5: governance policy-review signals (source 'governance') ──────
    // The FIRST non-metric, non-compliance briefing source — proving the mechanism
    // generalises to STATE/DEADLINE-driven items (a policy review cycle), not just
    // banded metrics or period compliance. School-scoped (NOT period-bound).
    //
    // GATED by the per-module entitlement: a finance-only school gets ZERO
    // governance items here (this is the cross-module briefing moment) while STILL
    // getting every metric/compliance/data item above — the gate ONLY skips this
    // push, it never touches STEP 0/1/2. Fail-soft in BOTH directions:
    //   • isEntitledForModule throws → treat as NOT licensed (fail CLOSED, so a
    //     billing hiccup hides governance items rather than leaking them), and
    //   • policies.list throws → skip (fail-soft to null), exactly like STEP 2.
    // Neither ever 500s the briefing. (governanceLicensed was resolved in the
    // STEP 2 parallel fan-out above.)
    if (governanceLicensed) {
      const policyList = await this.policies
        .list(schoolId)
        .then((r) => r.policies)
        .catch(() => null)
      if (policyList) {
        // 'unknown' (missing dates / non-active lifecycle) is an honest non-signal
        // and emits NOTHING — no false alarm (mirrors recon 'needs_data').
        const overdue = policyList.filter((p) => p.reviewStatus === 'overdue')
        const dueSoon = policyList.filter((p) => p.reviewStatus === 'due-soon')

        // ONE AGGREGATE item per band (not one-per-policy) so the briefing stays
        // digestible and the id set is finite/stable → deterministic ranking.
        if (overdue.length > 0) {
          // At least a full quarter past due on ANY overdue policy → critical.
          const badly = overdue.some((p) => (p.daysUntilDue ?? 0) <= -BADLY_OVERDUE_DAYS)
          const earliest =
            overdue
              .map((p) => p.nextReviewDate)
              .filter((d): d is string => d !== null)
              .sort()[0] ?? null
          const n = overdue.length
          items.push({
            id: 'governance:policies-overdue',
            severity: badly ? 'critical' : 'warn',
            source: 'governance',
            title: `${n} polic${n === 1 ? 'y is' : 'ies are'} overdue for review`,
            why: `${n} board polic${n === 1 ? 'y has' : 'ies have'} passed ${n === 1 ? 'its' : 'their'} scheduled review date${badly ? ' — at least one is more than a quarter overdue' : ''}. Review and record ${n === 1 ? 'it' : 'them'} in the policy register to keep governance current.`,
            metricKey: null,
            value: null,
            link: '/governance',
            dueDate: earliest,
          })
        }
        if (dueSoon.length > 0) {
          const earliest =
            dueSoon
              .map((p) => p.nextReviewDate)
              .filter((d): d is string => d !== null)
              .sort()[0] ?? null
          const n = dueSoon.length
          items.push({
            id: 'governance:policies-due-soon',
            severity: 'info',
            source: 'governance',
            title: `${n} polic${n === 1 ? 'y is' : 'ies are'} due for review soon`,
            why: `${n} polic${n === 1 ? 'y is' : 'ies are'} within ${DUE_SOON_DAYS} days of ${n === 1 ? 'its' : 'their'} scheduled review. Plan the review before ${n === 1 ? 'it lapses' : 'they lapse'}.`,
            metricKey: null,
            value: null,
            link: '/governance',
            dueDate: earliest,
          })
        }
      }

      // ── Governance depth — board-meeting register items (rides the SAME
      // governanceLicensed gate). Value-safe: AGGREGATE counts + dates only, no
      // attendee/decision PII (board-kept by keepForViewer). Fail-soft (.catch →
      // null) so a meetings hiccup never 500s the briefing. Up to TWO aggregate
      // items, mirroring the accreditation two-sub-item pattern.
      const meetingReg = await this.meetings.listMeetings(schoolId).catch(() => null)
      if (meetingReg) {
        const {
          minutesPendingCount,
          minutesOverdueCount,
          agendaMissingSoonCount,
          earliestMinutesPendingHeldAt,
          nextMeetingAt,
        } = meetingReg.summary

        // (1) minutes awaiting approval — warn, escalated to critical when any set
        // is past the approval SLA (overdue).
        if (minutesPendingCount > 0) {
          const n = minutesPendingCount
          items.push({
            id: 'governance:minutes-approval-pending',
            severity: minutesOverdueCount > 0 ? 'critical' : 'warn',
            source: 'governance',
            title: `${n} set${n === 1 ? '' : 's'} of minutes await${n === 1 ? 's' : ''} approval`,
            why: `${n} meeting${n === 1 ? "'s" : "s'"} minutes ${n === 1 ? 'is' : 'are'} pending approval${minutesOverdueCount > 0 ? ` — ${minutesOverdueCount} past the ${MINUTES_APPROVAL_SLA_DAYS}-day approval window` : ''}. Approve and record ${n === 1 ? 'it' : 'them'} in the meeting register to keep the governance record complete.`,
            metricKey: null,
            value: null,
            link: '/governance',
            dueDate: earliestMinutesPendingHeldAt,
          })
        }

        // (2) upcoming meeting needs an agenda — warn (info-ish nudge).
        if (agendaMissingSoonCount > 0) {
          const n = agendaMissingSoonCount
          items.push({
            id: 'governance:meeting-agenda-due',
            severity: 'warn',
            source: 'governance',
            title: `${n} upcoming meeting${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} an agenda`,
            why: `${n} scheduled meeting${n === 1 ? ' is' : 's are'} within ${AGENDA_DUE_SOON_DAYS} days and ${n === 1 ? 'has' : 'have'} no agenda yet. Draft and post the agenda in the meeting register before the meeting.`,
            metricKey: null,
            value: null,
            link: '/governance',
            dueDate: nextMeetingAt,
          })
        }
      }
    }

    // ── STEP 2.6: workflow open-task signals (source 'workflow') ─────────────
    // The OTHER half of Phase 3 (pairs with the governance STEP): open tasks that
    // are overdue/due-soon make the briefing ACTIONABLE and close the loop — a task
    // spawned from an attention item feeds BACK here. School-scoped (NOT period-
    // bound), same as governance.
    //
    // CORE, NOT module-gated: there is no 'workflow' ModuleKey, so unlike the
    // governance STEP this is NEVER wrapped in an isEntitledForModule gate — every
    // ENTITLED school gets these items. FAIL-SOFT: openTasks was resolved with
    // .catch(()=>null) in the STEP 2 fan-out above, and we guard `if (openTasks)`,
    // so a tasks failure can never 500 the briefing or perturb STEP 0/1/2/2.5.
    // 'on-track'/'none' tasks emit NOTHING (honest non-signal, mirrors governance
    // 'unknown' / recon 'needs_data').
    if (openTasks) {
      const overdue = openTasks.filter((t) => t.urgency === 'overdue')
      const dueSoon = openTasks.filter((t) => t.urgency === 'due-soon')

      // ONE AGGREGATE item per band (not one-per-task) so the briefing stays
      // digestible and the id set is finite/stable → deterministic ranking.
      if (overdue.length > 0) {
        // At least two weeks past due on ANY open task → critical (tighter than the
        // governance 90-day escalation — tasks are shorter-lived).
        const badly = overdue.some((t) => (t.daysUntilDue ?? 0) <= -WORKFLOW_BADLY_OVERDUE_DAYS)
        const earliest =
          overdue
            .map((t) => t.dueDate)
            .filter((d): d is string => d !== null)
            .sort()[0] ?? null
        const n = overdue.length
        items.push({
          id: 'workflow:tasks-overdue',
          severity: badly ? 'critical' : 'warn',
          source: 'workflow',
          title: `${n} task${n === 1 ? ' is' : 's are'} overdue`,
          why: `${n} open task${n === 1 ? ' has' : 's have'} passed ${n === 1 ? 'its' : 'their'} due date${badly ? ' — at least one is more than two weeks overdue' : ''}. Open the task list to reassign or complete ${n === 1 ? 'it' : 'them'}.`,
          metricKey: null,
          value: null,
          link: '/tasks',
          dueDate: earliest,
        })
      }
      if (dueSoon.length > 0) {
        const earliest =
          dueSoon
            .map((t) => t.dueDate)
            .filter((d): d is string => d !== null)
            .sort()[0] ?? null
        const n = dueSoon.length
        items.push({
          id: 'workflow:tasks-due-soon',
          severity: 'info',
          source: 'workflow',
          title: `${n} task${n === 1 ? ' is' : 's are'} due soon`,
          why: `${n} open task${n === 1 ? ' is' : 's are'} coming due this week. Plan the work before ${n === 1 ? 'it slips' : 'they slip'}.`,
          metricKey: null,
          value: null,
          link: '/tasks',
          dueDate: earliest,
        })
      }

      // ── STEP 2.6b: awaiting sign-off (workflow approval, Phase 3 v1) ──────────
      // A 'pending' approval can only live on an open/in_progress task (submit
      // doesn't change status; approve → 'done' drops out; reject → 'in_progress'
      // stays visible), so counting approvalStatus==='pending' over the SAME
      // openTasks read is correct and needs no extra query. SCHOOL-scoped COUNT (a
      // v1 limitation — NOT user-scoped "awaiting YOUR sign-off", which is deferred,
      // and the reason this DROPS for the viewer/board lens like the other workflow
      // items). Severity: 'info' by default, escalated to 'warn' if any pending task
      // is itself overdue (a sign-off blocking an overdue task is more pressing);
      // never 'critical' — a stalled approval is a nudge, not an alarm. Same fail-
      // soft `if (openTasks)` guard → never 500s.
      const pending = openTasks.filter((t) => t.approvalStatus === 'pending')
      if (pending.length > 0) {
        const n = pending.length
        const anyOverdue = pending.some((t) => t.urgency === 'overdue')
        const earliest =
          pending
            .map((t) => t.dueDate)
            .filter((d): d is string => d !== null)
            .sort()[0] ?? null
        items.push({
          id: 'workflow:approvals-pending',
          severity: anyOverdue ? 'warn' : 'info',
          source: 'workflow',
          title: `${n} task${n === 1 ? '' : 's'} awaiting sign-off`,
          why: `${n} task${n === 1 ? ' is' : 's are'} waiting on an approver's decision. Open the task list to review and sign off (or reassign the approver).`,
          metricKey: null,
          value: null,
          link: '/tasks',
          dueDate: earliest,
        })
      }

      // ── STEP 2.6c: awaiting MY sign-off (caller-scoped; board-viewer surface) ──
      // DISTINCT from the school-scoped aggregate workflow:approvals-pending above.
      // STRICT caller-scoping (BLOCKER): filter approverUserId===callerUserId, and
      // the whole block is guarded by `if (callerUserId)` — no userId → NO item, so
      // another user's queue can NEVER leak. This is the ONE workflow item KEPT for
      // the viewer/board lens (see VIEWER_WORKFLOW); the aggregate stays DROPPED.
      // Severity floor is warn (my own action item, more pressing than the school
      // aggregate), escalating to critical when any of MY pending tasks is overdue.
      if (callerUserId) {
        const myPending = openTasks.filter(
          (t) => t.approvalStatus === 'pending' && t.approverUserId === callerUserId,
        )
        if (myPending.length > 0) {
          const n = myPending.length
          const anyOverdue = myPending.some((t) => t.urgency === 'overdue')
          const earliest =
            myPending
              .map((t) => t.dueDate)
              .filter((d): d is string => d !== null)
              .sort()[0] ?? null
          items.push({
            id: 'workflow:my-approvals-pending',
            severity: anyOverdue ? 'critical' : 'warn',
            source: 'workflow',
            title: `${n} task${n === 1 ? '' : 's'} awaiting your sign-off`,
            why: `${n} task${n === 1 ? ' is' : 's are'} waiting on YOUR decision as the designated approver. Open the task list to review and sign off.`,
            metricKey: null,
            value: null,
            link: '/tasks',
            dueDate: earliest,
          })
        }
      }
    }

    // ── STEP 2.7: accreditation coverage signals (source 'accreditation') ─────
    // The FIRST Phase-4 briefing source — proving the mechanism generalises to the
    // second licensable module. School-scoped (NOT period-bound), like governance.
    //
    // GATED by the per-module entitlement: a finance-only school gets ZERO
    // accreditation items here while STILL getting every metric/compliance/data/
    // governance/workflow item above — the gate ONLY skips this push. Fail-soft in
    // BOTH directions like governance:
    //   • isEntitledForModule throws → treat as NOT licensed (fail CLOSED), and
    //   • listStandards throws → skip (fail-soft to null).
    // Neither ever 500s the briefing. (accreditationLicensed was resolved in the
    // STEP 2 parallel fan-out above.)
    if (accreditationLicensed) {
      const reg = await this.accreditation.listStandards(schoolId).catch(() => null)
      if (reg) {
        const { total, gaps } = reg.summary
        // A review is "approaching" when any standard is overdue/due-soon.
        const approaching = reg.standards.filter(
          (s) => s.reviewStatus === 'overdue' || s.reviewStatus === 'due-soon',
        )
        const reviewApproaching = approaching.length > 0

        // (a) coverage-gap — the headline "N of M standards still need evidence".
        // total===0 → gaps 0 → NO item (honest non-signal, like recon needs_data).
        if (gaps > 0) {
          // Escalate to critical ONLY when gaps remain AND a review is approaching
          // (a gap with the review far out is a warn, not an alarm — no crying wolf).
          const earliest =
            approaching
              .map((s) => s.reviewDate)
              .filter((d): d is string => d !== null)
              .sort()[0] ?? null
          items.push({
            id: 'accreditation:coverage-gap',
            severity: reviewApproaching ? 'critical' : 'warn',
            source: 'accreditation',
            title: `${gaps} of ${total} standard${total === 1 ? '' : 's'} still need evidence`,
            why: `${gaps} accreditation standard${gaps === 1 ? ' has' : 's have'} no evidence attached${reviewApproaching ? ' and a review is approaching' : ''}. Attach documents, links, or notes in the accreditation register before your review.`,
            metricKey: null,
            value: null,
            link: '/accreditation',
            dueDate: earliest,
          })
        }

        // (b) review-approaching — an info nudge ONLY when coverage is otherwise
        // complete (gaps===0). When gaps>0 the review pressure is already folded
        // into the coverage-gap item's severity, so we don't double-count.
        if (gaps === 0 && reviewApproaching) {
          const anyOverdue = approaching.some((s) => s.reviewStatus === 'overdue')
          const earliest =
            approaching
              .map((s) => s.reviewDate)
              .filter((d): d is string => d !== null)
              .sort()[0] ?? null
          const n = approaching.length
          items.push({
            id: 'accreditation:review-approaching',
            severity: anyOverdue ? 'warn' : 'info',
            source: 'accreditation',
            title: `${n} standard${n === 1 ? ' is' : 's are'} due for review`,
            why: `${n} accreditation standard${n === 1 ? ' is' : 's are'} at or past ${ACCREDITATION_REVIEW_SOON_DAYS} days to its scheduled review, and evidence is complete. Confirm the evidence is current before the visit.`,
            metricKey: null,
            value: null,
            link: '/accreditation',
            dueDate: earliest,
          })
        }
      }
    }

    // ── STEP 2.20: accreditation CYCLE milestones (source 'accreditation') ────
    // WS3 F1 — the six-year journey's overdue/at-risk milestones ONLY (on-track
    // roads are not attention items). Rides the SAME accreditation gate as STEP
    // 2.7 (fail CLOSED); the cycle read is fail-soft to null so an unconfigured
    // cycle, a pre-migration image, or an absent service yields NO items and
    // never a 500. VALUE-SAFE: every figure and every state word is copied from
    // the cycle payload's own server-authored sentences — nothing is recomputed
    // here. No ISO date ever enters `why` (house rule) — the milestone's own
    // dueDate field carries the date.
    if (accreditationLicensed && this.accreditationCycle) {
      const cycle = await this.accreditationCycle.getCycle(schoolId).catch(() => null)
      if (cycle && cycle.configured === true) {
        for (const m of cycle.milestones) {
          if (m.state !== 'overdue' && m.state !== 'at_risk') continue
          items.push({
            id: `accreditation:cycle-${m.key}`,
            severity: m.state === 'overdue' ? 'critical' : 'warn',
            source: 'accreditation',
            title:
              m.state === 'overdue'
                ? `${m.label} is overdue in your accreditation cycle`
                : `${m.label} is at risk in your accreditation cycle`,
            why: (() => {
              const lead = m.measure?.text ?? m.reason ?? 'This milestone needs attention'
              return `${lead}${lead.endsWith('.') ? '' : '.'} Open the journey to see the road to your review.`
            })(),
            metricKey: null,
            value: null,
            link: '/accreditation?center=journey',
            dueDate: m.dueDate ?? m.window?.end ?? null,
          })
        }
      }
    }

    // ── STEP 2.21: superseded-framework notice (source 'accreditation') ───────
    // WS2 — ONE quiet info line for a school still holding a superseded
    // framework whose successor is seeded: "the rev. 2025 standards are
    // available". Informational, never nagging (info severity, no dueDate).
    // Read DIRECTLY via Prisma inside the same gate (the module rule); BOTH
    // reads fail-soft, so a pre-migration image emits nothing.
    if (accreditationLicensed) {
      const supersededItems = await Promise.resolve()
        .then(async () => {
          const held = await this.prisma.accreditationStandard.groupBy({
            by: ['frameworkId'],
            where: { schoolId, frameworkId: { not: null } },
          })
          const heldIds = held
            .map((h) => h.frameworkId)
            .filter((id): id is string => id !== null)
          if (heldIds.length === 0) return []
          const frameworks = await this.prisma.accreditationFramework.findMany({
            where: { id: { in: heldIds }, supersededByCode: { not: null } },
            select: { id: true, code: true, name: true, accreditor: true, supersededByCode: true },
          })
          if (frameworks.length === 0) return []
          const successors = await this.prisma.accreditationFramework.findMany({
            where: {
              code: { in: frameworks.map((f) => f.supersededByCode as string) },
              active: true,
            },
            select: { code: true, name: true },
          })
          const successorByCode = new Map(successors.map((f) => [f.code, f]))
          return frameworks.flatMap((fw) => {
            const successor = fw.supersededByCode
              ? successorByCode.get(fw.supersededByCode)
              : undefined
            if (!successor) return [] // dangling successor reads as not superseded
            return [
              {
                id: `accreditation:framework-superseded:${fw.code}`,
                severity: 'info' as const,
                source: 'accreditation' as const,
                title: `A newer edition of your ${fw.accreditor} standards is available`,
                why: `Your register uses ${fw.name}; ${successor.name} is available. Upgrading carries your scores and evidence across in one confirmed step — schools that stay put lose nothing.`,
                metricKey: null,
                value: null,
                link: '/accreditation?center=standards',
                dueDate: null,
              },
            ]
          })
        })
        .catch(() => [])
      for (const item of supersededItems) items.push(item)
    }

    // ── STEP 2.8: facilities deferred-maintenance signals (source 'facilities') ─
    // The THIRD licensable module's briefing source — the deferred-maintenance
    // backlog surfaced as a board/capital signal. School-scoped (NOT period-bound),
    // like governance/accreditation.
    //
    // GATED by the per-module entitlement: a finance-only school gets ZERO
    // facilities items here while STILL getting every other item above — the gate
    // ONLY skips this push. Fail-soft in BOTH directions like accreditation:
    //   • isEntitledForModule throws → treat as NOT licensed (fail CLOSED), and
    //   • listMaintenance throws → skip (fail-soft to null).
    // Neither ever 500s the briefing. (facilitiesLicensed was resolved in the STEP
    // 2 parallel fan-out above.)
    if (facilitiesLicensed) {
      const reg = await this.facilities.listMaintenance(schoolId).catch(() => null)
      if (reg) {
        const { highPriorityOpenCount, criticalOpen, overdueOpen, backlogCost, openCount } =
          reg.summary
        // ONE aggregate item in v1 (keyed on highPriorityOpenCount>0) — a low/medium-
        // only backlog is visible on /facilities but not surfaced here (avoids noise).
        // total===0 → highPriorityOpenCount 0 → NO item (honest non-signal).
        if (highPriorityOpenCount > 0) {
          // Escalate to critical when any critical-PRIORITY item is open OR any open
          // item is past its target date (overdue); else warn.
          const critical = criticalOpen > 0 || overdueOpen > 0
          // Earliest target date among OPEN items → the dueDate hint.
          const earliest =
            reg.items
              .filter((i) => i.status !== 'resolved' && i.targetDate)
              .map((i) => i.targetDate as string)
              .sort()[0] ?? null
          items.push({
            id: 'facilities:maintenance-backlog',
            severity: critical ? 'critical' : 'warn',
            source: 'facilities',
            title: `${highPriorityOpenCount} high-priority maintenance item${highPriorityOpenCount === 1 ? '' : 's'} open`,
            why: `${highPriorityOpenCount} open high-priority facilities item${highPriorityOpenCount === 1 ? '' : 's'} (of ${openCount} open)${backlogCost > 0 ? `, ~${fmtMoney(backlogCost)} deferred-maintenance backlog` : ''}${overdueOpen > 0 ? `; ${overdueOpen} past ${overdueOpen === 1 ? 'its' : 'their'} target date` : ''}. Review the deferred-maintenance register for capital planning.`,
            metricKey: null,
            value: null,
            link: '/facilities',
            dueDate: earliest,
          })
        }
      }
    }

    // ── STEP 2.9: advancement giving-progress signals (source 'advancement') ──
    // The FOURTH licensable module's briefing source — fundraising campaign progress
    // surfaced as a board/development signal, completing all 8 domains. School-scoped
    // (NOT period-bound), like governance/accreditation/facilities.
    //
    // GATED by the per-module entitlement: a finance-only school gets ZERO
    // advancement items here while STILL getting every other item above — the gate
    // ONLY skips this push. Fail-soft in BOTH directions like facilities:
    //   • isEntitledForModule throws → treat as NOT licensed (fail CLOSED), and
    //   • listCampaigns throws → skip (fail-soft to null).
    // Neither ever 500s the briefing. Value-safe: AGGREGATE only, no per-donor PII.
    // (advancementLicensed was resolved in the STEP 2 parallel fan-out above.)
    if (advancementLicensed) {
      const reg = await this.advancement.listCampaigns(schoolId).catch(() => null)
      if (reg) {
        const { behindGoalActiveCount, closingSoonActiveCount, overdueActiveCount, activeCount, overallPctOfGoal } =
          reg.summary
        if (behindGoalActiveCount > 0 || closingSoonActiveCount > 0 || overdueActiveCount > 0) {
          // CRITICAL when any active campaign is past its close date, OR (closing soon
          // AND behind goal — under-funded with the clock running out); else warn.
          const critical =
            overdueActiveCount > 0 || (closingSoonActiveCount > 0 && behindGoalActiveCount > 0)
          // Earliest close date among ACTIVE campaigns → the dueDate hint.
          const earliest =
            reg.campaigns
              .filter((c) => c.status === 'active' && c.closeDate)
              .map((c) => c.closeDate as string)
              .sort()[0] ?? null
          const pctTxt =
            overallPctOfGoal !== null ? `${Math.round(overallPctOfGoal * 100)}% of goal` : 'in progress'
          items.push({
            id: 'advancement:giving-progress',
            severity: critical ? 'critical' : 'warn',
            source: 'advancement',
            title:
              behindGoalActiveCount > 0
                ? `${behindGoalActiveCount} active campaign${behindGoalActiveCount === 1 ? '' : 's'} behind goal`
                : overdueActiveCount > 0
                  ? `${overdueActiveCount} campaign${overdueActiveCount === 1 ? '' : 's'} past close date`
                  : `${closingSoonActiveCount} campaign${closingSoonActiveCount === 1 ? '' : 's'} closing soon`,
            why: `Fundraising is ${pctTxt} across ${activeCount} active campaign${activeCount === 1 ? '' : 's'}${behindGoalActiveCount > 0 ? `; ${behindGoalActiveCount} behind goal` : ''}${overdueActiveCount > 0 ? `; ${overdueActiveCount} past ${overdueActiveCount === 1 ? 'its' : 'their'} close date` : closingSoonActiveCount > 0 ? `; ${closingSoonActiveCount} closing within ${ADVANCEMENT_CLOSING_SOON_DAYS} days` : ''}. Review the advancement register for development planning.`,
            metricKey: null,
            value: null,
            link: '/advancement',
            dueDate: earliest,
          })
        }
      }
    }

    // ── STEP 2.13: strategic-plan health signals (source 'strategy') ──────────
    // The 7th licensable module's briefing source — the ACTIVE strategic plan's health
    // surfaced as up to THREE board/leadership signals. School-scoped (NOT period-
    // bound), like governance/accreditation/facilities/advancement.
    //
    // GATED by the per-module entitlement (strategyLicensed, resolved in the STEP-2
    // fan-out). Fail-soft in BOTH directions like advancement:
    //   • isEntitledForModule throws → treated as NOT licensed (fail CLOSED), and
    //   • getActivePlanComputed can't throw (fail-soft to { hasPlan:false }); the
    //     `this.strategy?.…` guard + .catch keep an absent service / hiccup silent.
    // Neither ever 500s the briefing. VALUE-SAFE: the worst goal's figures are quoted
    // VERBATIM from the computed payload (already formatMetricValue strings), and the
    // overall progress % is always numeric, so the narration numeric-guard passes.
    if (strategyLicensed) {
      const sp = await Promise.resolve()
        .then(() => this.strategy?.getActivePlanComputed?.(schoolId) ?? null)
        .catch(() => null)
      if (sp?.hasPlan) {
        const s = sp.summary
        const pctTxt = `${Math.round((s.overallProgressPct ?? 0) * 100)}%`

        // 2.13a — goals off pace. CRITICAL when any goal is BEHIND; WARN when only
        // at-risk. The worst behind goal's figures are quoted verbatim (value-safe).
        if (s.behindPaceGoalCount > 0 || s.atRiskGoalCount > 0) {
          const critical = s.behindPaceGoalCount > 0
          const count = critical ? s.behindPaceGoalCount : s.atRiskGoalCount
          const label = critical ? 'behind pace' : 'at risk'
          const worst = s.behindPaceGoals[0] ?? null
          let why = `Overall plan progress is ${pctTxt}; ${count} goal${count === 1 ? ' is' : 's are'} ${label}.`
          if (worst) {
            const cur = worst.formattedCurrent ?? 'no reading yet'
            const tgt = worst.formattedTarget ?? 'its target'
            why += ` "${worst.title}" is at ${cur} against a target of ${tgt}${worst.targetDate ? ` by ${worst.targetDate}` : ''}.`
          }
          why += ' Review the strategic plan.'
          items.push({
            id: 'strategy:goals-behind-pace',
            severity: critical ? 'critical' : 'warn',
            source: 'strategy',
            title: `${count} strategic goal${count === 1 ? '' : 's'} ${label}`,
            why,
            metricKey: worst?.metricKey ?? null,
            value: null,
            link: '/strategy',
            dueDate: worst?.targetDate ?? null,
          })
        }

        // 2.13b — stalled initiatives (WARN). The worst (longest-stale) is named.
        if (s.staleInitiativeCount > 0) {
          const worst = s.staleInitiatives[0] ?? null
          const n = s.staleInitiativeCount
          let why = `${n} strategic initiative${n === 1 ? ' has' : 's have'} stalled with no recent update.`
          if (worst) {
            why += ` "${worst.title}" has not been updated in ${worst.staleDays} days${worst.ownerName ? ` (owner ${worst.ownerName})` : ''}.`
          }
          why += ' Review the plan’s execution.'
          items.push({
            id: 'strategy:initiative-stale',
            severity: 'warn',
            source: 'strategy',
            title: `${n} strategic initiative${n === 1 ? '' : 's'} stalled`,
            why,
            metricKey: null,
            value: null,
            link: '/strategy',
            dueDate: null,
          })
        }

        // 2.13c — plan review due this month (INFO nudge).
        if (s.reviewDueThisMonth && s.nextReviewDate) {
          items.push({
            id: 'strategy:plan-review-due',
            severity: 'info',
            source: 'strategy',
            title: 'Strategic plan review due this month',
            why: `Your strategic plan is scheduled for review on ${s.nextReviewDate}. Revisit goals and pace with the board — overall progress is ${pctTxt}.`,
            metricKey: null,
            value: null,
            link: '/strategy',
            dueDate: s.nextReviewDate,
          })
        }
      }
    }

    // ── STEP 2.14: staffing data-completeness (source 'hr') ──────────────────
    // Phase 6 — HR & Staffing's briefing signal: DATA-COMPLETENESS ONLY. When the
    // period's operational row is missing teachingFte OR totalStaffFte, nudge the
    // user to the /hr Add tab. Ratio/share RISK is STEP 1's job (the banded hr
    // metrics) — no duplicates here.
    //
    // GATED by the per-module entitlement (hrLicensed, resolved in the STEP-2
    // fan-out, fail CLOSED). ZERO new reads: the missing-FTE fact is read off the
    // ALREADY-computed (and hr-gated) teaching_staff_share metric result, whose
    // inputsMissing names exactly the absent field(s) — value-safe by
    // construction, and an absent metric (billing hiccup at the metrics gate)
    // simply yields no item. Can never 500.
    if (hrLicensed) {
      const share = metricsResponse.metrics.find((m) => m.key === 'teaching_staff_share')
      // "Not entered" must mean NULL, not merely "the metric can't compute":
      // totalStaffFte entered as 0 (a legitimate value) also lands in the share
      // metric's inputsMissing via its >0 divide guard, but its inputs[] carries
      // the raw value — 0 there is ENTERED, so no false "not entered" item (and
      // no disagreement with /hr's own null-checking attention rail). An absent
      // inputs[] (older shape) degrades to the inputsMissing read.
      const fteMissing =
        share &&
        !share.available &&
        ['teachingFte', 'totalStaffFte'].some((k) => {
          if (!share.inputsMissing.includes(k)) return false
          const input = share.inputs?.find((i) => i.key === k)
          return !input || input.value === null
        })
      if (fteMissing) {
        items.push({
          id: 'hr:fte-missing',
          severity: 'warn',
          source: 'hr',
          title: `Staffing FTEs not entered for ${period.label}`,
          why: `Teaching and total staff FTEs have not been fully entered for ${period.label} — your staffing ratio, composition and trends can't compute without them. Add them in HR & Staffing.`,
          metricKey: null,
          value: null,
          link: '/hr?tab=add',
          dueDate: null,
        })
      }
    }

    // ── STEP 2.15: planning-artifact completeness (source 'planning') ─────────
    // Phase 6 — Planning & Forecasting's briefing signals: COMPLETENESS ONLY (no
    // budget saved / no FY-end forecast saved / no enrollment plan). Variance
    // SEVERITY is STEP 1's job (the banded planning metrics) — no duplicates.
    //
    // GATED by the per-module entitlement (planningLicensed, resolved in the
    // STEP-2 fan-out, fail CLOSED). Strategy STEP-2.13 template: licensed-gate
    // outside, `.catch(() => null)` reads inside, `this.x?.`-guarded deps — can
    // never 500. ONE fail-soft PlanningSignals read (hasBudget/hasForecast are
    // DEFINITIVE row facts; a null result means the READ failed → skip, never a
    // false "missing" alarm) + the REUSED enrollment-plan resolve.
    if (planningLicensed) {
      const signals = await Promise.resolve()
        .then(() => this.planningSignals?.resolve?.(schoolId, period.id) ?? null)
        .catch(() => null)
      if (signals) {
        if (!signals.hasBudget) {
          items.push({
            id: 'planning:no-budget',
            severity: 'warn',
            source: 'planning',
            title: `No budget saved for ${period.label}`,
            why: `No budget has been saved for ${period.label} — without one there is nothing to forecast against, and budget-vs-actual stays dark. Set one up in Planning & Forecasting.`,
            metricKey: null,
            value: null,
            link: '/planning',
            dueDate: null,
          })
        }
        if (!signals.hasForecast) {
          items.push({
            id: 'planning:no-forecast',
            severity: 'warn',
            source: 'planning',
            title: `No FY-end forecast saved for ${period.label}`,
            why: `No FY-end forecast has been saved for ${period.label} — the projected margin and forecast-vs-budget variance can't compute. Save one in Planning & Forecasting.`,
            metricKey: null,
            value: null,
            link: '/planning',
            dueDate: null,
          })
        }
        // Enrollment-plan presence — the SAME resolve the enrollment_vs_plan
        // metric reads (driver grid first, then plannedEnrollmentByGrade), via
        // the error-distinguishing resolveDetailed: `failed` (a DB read errored
        // while no plan surfaced) means absence is UNKNOWN → emit NOTHING, the
        // same never-a-false-alarm rule the PlanningSignals reads above follow.
        // A null result (older mock / resolve throw) is equally indistinct → skip.
        if (this.enrollmentPlanSvc) {
          const planRes = await Promise.resolve()
            .then(() => this.enrollmentPlanSvc?.resolveDetailed?.(schoolId, period.id) ?? null)
            .catch(() => null)
          if (planRes && planRes.plan === null && !planRes.failed) {
            items.push({
              id: 'planning:plan-missing',
              severity: 'warn',
              source: 'planning',
              title: `No enrollment plan for ${period.label}`,
              why: `No planned enrollment has been entered for ${period.label} (neither a driver-budget grid nor a grade-by-grade plan) — actual-vs-plan tracking can't run. Enter one in Planning & Forecasting.`,
              metricKey: null,
              value: null,
              link: '/planning?tab=add',
              dueDate: null,
            })
          }
        }
      }
    }

    // ── STEP 2.10: enrollment below plan — the CROSS-DOMAIN item ─────────────
    // The Phase-2 centerpiece: enrollment → tuition → cash in ONE briefing item.
    // When actual enrollment falls materially below plan, we quantify the tuition
    // shortfall (gap × net tuition per student) and, when the driver budget + cash
    // are available, the CASH consequence (days-cash breach via projectCashRunway,
    // else an annualized days-cash estimate). GATED by the 'enrollment' module.
    //
    // GRACEFUL DEGRADATION LADDER (NEVER throws — every await fail-softs to null):
    //   (1) full chain  — gap + tuition impact + a cash breach month;
    //   (2) no-cash     — gap + tuition impact (no driver/cash data → no cash clause);
    //   (3) no-netrate  — gap only (no plan netRate AND no net-tuition metric);
    //   (4) no-plan     — skipped entirely (no plan → nothing to compare against).
    // We only flag REAL shortfalls (gapPct < -2%); at/above plan emits nothing.
    if (enrollmentLicensed) {
      // ONE mockable call on the already-injected AnalyticsService (no new briefing
      // dependency). The `?.` + Promise.resolve wrapper makes a missing method (older
      // mocks) resolve to null rather than throw synchronously.
      const signal = await Promise.resolve()
        .then(() => this.analytics.enrollmentSignalInputs?.(schoolId, period.id) ?? null)
        .catch(() => null)
      const actual = signal?.actual ?? null
      const plan = signal?.plan ?? null

      if (actual !== null && plan && plan.planTotal > 0) {
        const gap = actual - plan.planTotal // negative when below plan
        const gapPct = gap / plan.planTotal
        // CANONICALIZED: the gate + severity read the enrollment_vs_plan registry BANDS
        // via healthStatus/bandsFor (good ≥ -2% / risk < -5%) instead of local -0.02/-0.05
        // literals, so re-tuning the band propagates here automatically. The gap comes from
        // enrollmentPlan.resolve() — the SAME source the metric's compute reads — so the
        // published value equals the dashboard's enrollment_vs_plan by construction.
        const evpStatus = healthStatus(gapPct, bandsFor('enrollment_vs_plan'), true)
        if (evpStatus !== 'good') {
          const shortfall = Math.abs(gap)

          // Net tuition per PLANNED student: prefer the driver-budget netRate, else
          // the net_tuition_per_student metric value, else null (no tuition clause).
          const ntps = metricsResponse.metrics.find((m) => m.key === 'net_tuition_per_student')
          const netPerStudent =
            plan.netRate ?? (ntps && ntps.available ? ntps.value : null) ?? null
          const tuitionImpact = netPerStudent !== null ? gap * netPerStudent : null // negative $

          // Cash consequence (degrade-safe). Prefer a projectCashRunway breach month;
          // else an annualized days-cash estimate from the days_cash_on_hand metric.
          // The days-cash "good" threshold comes from the registry band, not a literal.
          const dcohGood = bandsFor('days_cash_on_hand')?.good ?? 60
          let cashClause: string | null = null
          if (tuitionImpact !== null) {
            const dch = metricsResponse.metrics.find((m) => m.key === 'days_cash_on_hand')
            const cashFromMetric = dch?.inputs?.find((i) => i.key === 'cash')?.value ?? null
            const expFromMetric = dch?.inputs?.find((i) => i.key === 'totalExp')?.value ?? null
            const openingCash = signal?.cash?.openingCash ?? cashFromMetric
            const annualExpense = signal?.cash?.annualExpense ?? expFromMetric

            const runway = projectCashRunway({
              openingCash,
              monthlyNetCashflow: signal?.cash?.monthlyNetCashflow ?? null,
              annualExpense,
              shockAnnual: tuitionImpact,
              threshold: dcohGood,
            })
            if (runway?.firstMonthBelowThreshold) {
              cashClause = `days cash on hand would fall below ${dcohGood} by ${runway.firstMonthBelowThreshold.monthLabel}`
            } else if (
              dch &&
              dch.available &&
              dch.value !== null &&
              openingCash !== null &&
              annualExpense !== null &&
              annualExpense > 0
            ) {
              const projected = (openingCash + tuitionImpact) / (annualExpense / 365)
              cashClause = `days cash on hand would fall from ${Math.round(dch.value)} to ~${Math.round(projected)}`
            }
          }

          // Severity from the registry band: 'risk' (>5% below plan) is critical, else warn.
          const severity: AttentionSeverity = evpStatus === 'risk' ? 'critical' : 'warn'

          let why =
            `Enrollment is ${shortfall} student${shortfall === 1 ? '' : 's'} below the plan of ` +
            `${plan.planTotal} (${formatMetricValueLong(gapPct, 'percent')})`
          // tuitionImpact is negative (revenue not collected); "less tuition"
          // already states the direction, so show the magnitude, not "-$…".
          if (tuitionImpact !== null)
            why += ` — about ${fmtMoney(Math.abs(tuitionImpact))} less tuition this year`
          if (cashClause) why += `; ${cashClause}`
          why += '.'

          // ── Penny coverage Phase 1 — WHICH GRADES CARRY THE MISS ────────────
          //
          // An EXTENSION of this item's `why`, never a second item: this one
          // already suppresses the plain metric item below, and adding a third
          // enrollment line would make the same fact appear twice under a lens
          // that emphasises enrollment.
          //
          // ONLY UNSUPPRESSED ROWS ARE NAMEABLE. A grade with a handful of
          // children is withheld everywhere else in the product, and naming it
          // here — in the one surface that gets emailed and read aloud — would
          // undo that everywhere at once. suppressSmallCell is the same helper the
          // enrollment page's own cells go through, so the floor cannot drift.
          //
          // Magnitudes with DIRECTION IN WORDS, never a signed figure: canon is
          // sign-aware, so "-7" in this string would allow only '-7' and the
          // model saying "7 fewer" would be rejected and the whole segment would
          // silently drop to the template.
          // ── F4: THE TWO STORES MUST AGREE BEFORE THEY SHARE A SENTENCE ─────
          //
          // The headline above is computed from PROMOTED period data (`actual` =
          // period_operational_data.enrollment via enrollmentSignalInputs); the
          // per-grade reading comes from the register SNAPSHOT. When the two
          // totals diverge — the exact condition STEP 2.19 exists to flag — a
          // clause that splits the promoted total across the register's grades
          // would be incoherent in the one paragraph that gets read aloud. So
          // the clause is appended ONLY when the (already period-FY-bounded,
          // see readEnrollmentReading) reading's total equals the promoted
          // total; when they diverge the headline stands alone and STEP 2.19
          // carries the discrepancy.
          const readingAgreesWithPromoted =
            enrollmentReading != null && enrollmentReading.totalEnrolled === actual
          const gradeGaps = readingAgreesWithPromoted
            ? namedGradeGaps(enrollmentReading?.byGrade, plan.planByGrade)
            : []
          if (gradeGaps.length > 0) {
            const phrase = gradeGaps
              .map((g) => `${gradeDisplayName(g.grade)} (${g.short} fewer than planned)`)
              .join(' and ')
            why += ` The largest gaps are in ${phrase}.`
          }

          items.push({
            id: 'enrollment:below-plan',
            severity,
            source: 'enrollment',
            title: `Enrollment ${shortfall} below plan`,
            why,
            metricKey: 'enrollment_vs_plan',
            value: gapPct,
            link: '/enrollment',
            dueDate: null,
          })

          // SUPPRESS the plain metric item — this richer item replaces it. (The
          // enrollment_change_yoy metric item, if any, is KEPT — a distinct signal.)
          const dupIdx = items.findIndex((i) => i.id === 'metric:enrollment_vs_plan')
          if (dupIdx !== -1) items.splice(dupIdx, 1)
        }
      }
    }

    // ── STEP 2.18: the FORWARD cash projection (source 'cash') ───────────────
    //
    // "When do we run low on cash?" — the one finance question a head of school
    // asks unprompted, and the one the briefing had no line for. STEP 2.11 and
    // 2.12 read backwards (what is owed, what reconciles); this reads forward.
    //
    // NO NEW AttentionSource. 'cash' already exists and a fourth cash-shaped
    // source would fragment lens ranking for no gain.
    //
    // ★★ THE REVENUE-OMISSION GATE IS THE MOST IMPORTANT LINE IN THIS STEP. ★★
    //
    // cashflow.service.ts records the live incident in its own header: a school
    // with commitments recorded and NO budget on file produced a projection
    // containing every outflow and none of its tuition — "a catastrophic-looking
    // trough that was an artefact of absent data, with nothing on screen to say
    // so". Narrating that trough as a shortfall would be the worst thing this
    // product could say to a school: a confident, dated, dollar-precise warning
    // about a crisis that does not exist, at the top of its morning briefing.
    //
    // So when ANY receipt-side omission is present the shortfall item is not
    // emitted at all. A DIFFERENT, info-severity item goes out instead, whose
    // `why` is the omission's OWN message verbatim — the fix, not the fiction.
    //
    // The classification errs toward suppression: only `no_commitments` is known
    // to be outflow-only, and every other omission key — including one added
    // later that nobody classified — counts as a revenue omission. A new omission
    // must not silently re-enable the shortfall narration.
    if (cashForecast && cashForecast.blockedReason === null) {
      const revenueOmission =
        cashForecast.omissions.find((o) => !CASH_OUTFLOW_ONLY_OMISSIONS.has(o.key)) ?? null
      const proj = cashForecast.projection

      // f9(a): BOTH branches now hang off the same would-have-fired condition.
      // The incomplete item is an EXPLANATION of a suppressed alarm; with no
      // breach to suppress there is nothing to explain, and an evergreen "your
      // forecast is missing data" line on every briefing of every school with a
      // partial forecast is exactly the noise a briefing exists to remove.
      if (proj && proj.firstShortfallDate) {
        // A firstShortfallDate exists ONLY when the school itself set a reserve
        // threshold and the projection breaches it. No threshold means no
        // shortfall is reported at all, rather than one measured against a floor
        // KYRO invented — the assumptions DTO keeps null reachable for exactly
        // this reason.
        //
        // SEVERITY COMES FROM A REGISTRY BAND, never from the sign of a number.
        // Months of cash at the low point is the honest severity axis (a school
        // that dips $2,000 under a $500,000 threshold is not in crisis), and
        // reading it through healthStatus/bandsFor means re-tuning the band
        // propagates here automatically.
        const reserveStatus = healthStatus(
          proj.monthsCashAtLowPoint,
          bandsFor('months_operating_reserve'),
          proj.monthsCashAtLowPoint !== null,
        )
        const daysGood = bandsFor('days_cash_on_hand')?.good ?? 60
        let severity: AttentionSeverity | null = null
        if (reserveStatus === 'risk') severity = 'critical'
        else if (reserveStatus === 'watch') severity = 'warn'
        else if (reserveStatus === 'good') severity = null
        else {
          // No annual operating expense on file, so no months-of-cash figure and
          // no band to read. Fall back to how much NOTICE the school has, against
          // the days-cash 'good' threshold from the same registry.
          severity =
            proj.daysOfNotice !== null && proj.daysOfNotice < daysGood ? 'warn' : null
        }

        if (severity && revenueOmission) {
          // ── f9: A BREACH THE DATA CANNOT SUPPORT ─────────────────────────────
          //
          // The shortfall item would have fired, but a RECEIPT-side input is
          // missing, so the trough is deeper than reality (see the STEP header:
          // narrating it would be a confident alarm about a crisis that may not
          // exist). The replacement item explains the suppression.
          //
          // NOT the omission's verbatim message: those are operator-voiced
          // imperatives ("Import or enter a budget…") written for the cash-flow
          // page, and a briefing is emailed, printed into board packs and read
          // aloud under the governance voice — whose guard rejects sentences
          // opening with Import/Update/Fix/…. The paraphrase is neutral,
          // board-safe and carries NO digits (an incomplete forecast has no
          // figure worth allow-listing). The omission KEY still decides the
          // wording, and the KEY-based gate above is untouched.
          const isBudgetSpread = revenueOmission.key === 'no_budget_spread'
          items.push({
            id: 'cash:forecast-incomplete',
            severity: 'info',
            source: 'cash',
            // f9(c): `no_budget_spread` means the monthly budget phasing is
            // absent — day-to-day SPEND and receipts alike — so its title must
            // not claim a missing source of income specifically.
            title: isBudgetSpread
              ? 'The cash forecast is missing the operating budget'
              : 'The cash forecast is missing a source of income',
            why: isBudgetSpread
              ? 'Only recorded commitments are in the forecast — day-to-day operating spend and receipts are not — so the projected low point may not reflect the full picture.'
              : revenueOmission.key.startsWith('tuition_')
                ? 'The forecast is missing tuition revenue, so the projected low point overstates the risk.'
                : 'The forecast is missing an expected source of receipts, so the projected low point overstates the risk.',
            metricKey: null,
            value: null,
            link: '/cash-flow',
            // No date on this one: nothing is due, something is absent.
            dueDate: null,
          })
        } else if (severity) {
          // ── THE THREE VALUE-GUARD THREADING RULES ────────────────────────────
          //
          // Every speakable number must appear in THIS ITEM'S OWN title/why, or
          // guardSegment rejects the model's sentence and silently falls back to
          // the template. That is why the composition below is fussy:
          //
          //  1. fmtMoney and NOTHING ELSE. canon('$18,400') is '18400$' while
          //     canon('$18.4k') is '18.4$k' — two renderers on one item means
          //     every LLM segment about it dies.
          //  2. NO RAW ISO DATE IN `why`. FIGURE_RE captures the leading '-', so
          //     '2026-03-14' tokenises as {2026, -3, -14} while the model saying
          //     "March 14, 2026" emits {14, 2026} — rejected. The date goes in
          //     `dueDate`, which renderDueDateHuman handles and the template
          //     speaks as "Due Mar 14, 2026."
          //  3. MAGNITUDES, WITH DIRECTION IN WORDS. canon is sign-aware, so a
          //     `why` containing '-$18,400' allows only '-18400$' and the model
          //     saying "18,400 below" is rejected. Same fix the enrollment step
          //     above already carries.
          const lowest = proj.lowestBalance
          const lowWords =
            lowest < 0
              ? `overdrawn by ${fmtMoney(Math.abs(lowest))}`
              : `down to ${fmtMoney(lowest)}`
          const shortBy =
            proj.shortfallAmount === null
              ? null
              : fmtMoney(Math.abs(proj.shortfallAmount))

          let why = `Projected cash goes ${lowWords} at its low point`
          if (shortBy) why += `, which is ${shortBy} below the reserve floor this school set`
          if (proj.daysOfNotice !== null) {
            why += ` — about ${proj.daysOfNotice} day${proj.daysOfNotice === 1 ? '' : 's'} from the balance it was projected from`
          }
          why += '.'
          if (proj.monthsCashAtLowPoint !== null) {
            const months = Math.round(proj.monthsCashAtLowPoint * 10) / 10
            why += ` That is about ${months} month${months === 1 ? '' : 's'} of operating cash at that point.`
          }
          // WHAT DUG THE HOLE — the top outflow categories between now and the low
          // point, computed by the engine and copied, never re-derived here. n3:
          // the category goes through the SAME categoryTitle QBO events use, so
          // the narration says "Debt service", never the key `debt_service`.
          const top = proj.driversToLowPoint?.slice(0, 2) ?? []
          if (top.length > 0) {
            why += ` The largest outflows before then are ${top
              .map((d) => `${categoryTitle(d.category)} (${fmtMoney(Math.abs(d.amount))})`)
              .join(' and ')}.`
          }
          // The other half of an honest trough: what the school is waiting for.
          // Silence here is itself the finding, so it is stated as silence.
          if (!proj.nextReceiptAfterLow) {
            why += ' No further receipt is expected inside this window.'
          }
          // A LIMITED-DATA school must never read like a high-data one. The tier
          // reason is appended in the service's own words, and the severity is
          // CAPPED at warn: a critical, dollar-precise alarm resting on a keyed
          // opening balance and a calendar is more certainty than the inputs earn.
          if (cashForecast.dataTier === 'limited') {
            severity = severity === 'critical' ? 'warn' : severity
            why += ` ${cashForecast.dataTierReason}`
          }

          items.push({
            id: 'cash:projected-shortfall',
            severity,
            source: 'cash',
            title: 'Projected cash falls below your reserve floor',
            why,
            // NOT a registry metric — this is a projection, not a banded KPI, and
            // giving it a metricKey would make it link to an analytics tile that
            // shows something else.
            metricKey: null,
            value: null,
            link: '/cash-flow',
            // Rule 2: the date lives HERE, never in `why`.
            dueDate: proj.firstShortfallDate,
          })
        }
      }
    }

    // ── STEP 2.19: the enrollment headcount RECONCILIATION (source 'enrollment') ─
    //
    // The promoted headcount (period_operational_data — what the briefing, the
    // scorecard and the org roll-up all quote) against the most recent enrollment
    // reading on file. Normally identical; they drift when the register moves
    // after the last promote, and a live call against real data found exactly that
    // — 435 promoted against 436 on the register.
    //
    // INFO severity, and the `why` carries BOTH figures. That is the whole design:
    // both numbers are in the item's own allowed-token set, so the model may
    // PHRASE the disagreement but cannot pick a winner — there is no third number
    // it could reach for, and neither of the two is presented as the answer.
    // The reading is period-FY-bounded (F3, readEnrollmentReading), so this
    // comparison is promoted-vs-register WITHIN one fiscal year — a historical
    // period's briefing no longer compares last year's promote against today's
    // register. The promoted row was read in the fan-out (n5).
    if (enrollmentLicensed && enrollmentReading) {
      const promotedCount = promotedEnrollment?.enrollment ?? null
      const reading = enrollmentReading.totalEnrolled
      if (promotedCount !== null && promotedCount !== reading) {
        items.push({
          id: 'enrollment:reconciliation-divergence',
          severity: 'info',
          source: 'enrollment',
          title: 'Two different headcounts are on file',
          why:
            `The headcount promoted to ${period.label} is ${promotedCount}, but the most recent enrollment reading counts ${reading}. ` +
            'The register has moved since the last promote, so the tiles, the board pack and the enrollment page are quoting different numbers — re-sync so they quote one.',
          metricKey: null,
          value: null,
          link: '/enrollment?tab=analytics',
          dueDate: null,
        })
      }
    }

    // ── STEP 2.11: cash & collections — AR/AP aging (source 'cash') ──────────
    // Reads the persisted ArApAgingSnapshot (resolved as `agingRow` in the STEP-2
    // fan-out above, DIRECTLY via Prisma — the module rule: NO QboAgingService,
    // NO IntegrationsModule import). CORE (Finance base license, NO entitlement wrap).
    // buildAgingAttentionItems is edge-triggered + value-safe (aggregate $ + counts,
    // no party names) and returns [] when there is no snapshot (not connected / never
    // captured) — an honest non-signal. Fail-soft: a null row simply emits nothing.
    for (const it of buildAgingAttentionItems(agingRow, generatedAt)) items.push(it)

    // ── STEP 2.12: cash-flow reconciliation "trust check" (source 'cash') ─────
    // Reads the persisted CashFlowSnapshot (resolved as `cashFlowRow` in the STEP-2
    // fan-out above, DIRECTLY via Prisma — the module rule: NO QboCashFlowService, NO
    // IntegrationsModule import). CORE (Finance base license, NO entitlement wrap).
    // buildReconciliationItems is edge-triggered + value-safe (aggregate $ deltas only,
    // no accounts) and fires ONLY when the books materially fail to reconcile to
    // QuickBooks (reconStatus 'differs' AND a STRONG check material) — an honest signal;
    // a tie / immaterial gap / no-snapshot emits nothing. Fail-soft: null row → nothing.
    for (const it of buildReconciliationItems(cashFlowRow, generatedAt)) items.push(it)

    // ── STEP 2.16: accreditation EARLY WARNINGS (source 'earlywarning') ───────
    //
    // What a visiting team would likely find, derived from live operating data by
    // deterministic rules, expressed as THE ACCREDITATION CONSEQUENCE — never as
    // an operational restatement of a fact an earlier step already made. The
    // suppression table above is what makes that sentence true in code.
    //
    // GATED FAIL-CLOSED on `accreditationLicensed` (resolved in the STEP-2 fan-out
    // with its own `.catch(() => false)`): a finance-only school gets ZERO
    // early-warning items and loses nothing else. FAIL-SOFT on the read: a null
    // `earlyWarnings` is no items, never a 500.
    //
    // THE CAP IS APPLIED HERE, BEFORE ANY LENS RUNS, so forty open findings
    // produce exactly two items under every lens.
    //
    // ONE ITEM PER RULE, and the cap is applied to the COMPOSED items rather than
    // to the raw rows. Both halves of that sentence fix a real defect:
    //
    //   · `AttentionItem.id` is derived from `ruleId` alone, but the ledger is
    //     keyed `ruleId:scopeKey` and three briefable rules are per-scope
    //     (ACC-UNSUPPORTED-SCORE and ACC-ASSURANCE-GAP per standard, EVI-STALE per
    //     evidence tag). Two standards with unmet assurance gates — the common
    //     case, not an edge — emitted TWO items with an identical id: duplicate
    //     React keys on the home briefing, a non-total `id.localeCompare` tiebreak
    //     in applyLens, and a colliding `${schoolId}:${item.id}` in the org
    //     roll-up. Deduping on the id keeps the eleven `COMPLIANCE_ORDER` entries
    //     matching EXACTLY, which prefix-matching or a scoped id would not.
    //   · Slicing the ROWS first meant one malformed `evidencePayload` in the top
    //     two silently suppressed a valid warning — the row consumed a slot and
    //     then composed to null. Mixed engine versions in the ledger (1.0.0 rows
    //     alongside 1.1.0) make that a live possibility, not a hypothetical.
    if (accreditationLicensed && earlyWarnings) {
      const composed: AttentionItem[] = []
      const seenIds = new Set<string>()
      for (const f of earlyWarnings) {
        if (EARLY_WARNING_SUPPRESSED.has(f.ruleId)) continue
        if ((f.standardTags?.length ?? 0) === 0) continue
        const item = buildEarlyWarningItem(f)
        if (!item || seenIds.has(item.id)) continue
        seenIds.add(item.id)
        composed.push(item)
      }
      // THE HARD CAP, in code, over the items a reader would actually see.
      for (const it of composed.slice(0, EARLY_WARNING_MAX_ITEMS)) items.push(it)
    }

    // ── STEP 2.17: ACADEMICS (source 'academics') ────────────────────────────
    // Module-gated FAIL-CLOSED like every other domain gate; the data read is
    // fail-soft. AGGREGATES ONLY — this step reads the school-aggregate table,
    // which has no identity column, so no briefing line can name a student.
    //
    // Two signals only, both of which a head of school would act on:
    //   • the module is licensed but nothing has ever been loaded, and
    //   • the headline score fell materially from the prior year.
    // A score simply being low is NOT a briefing item: a school below the
    // national midpoint every year does not need to be told so every morning.
    if (academicsLicensed && Array.isArray(academicRows)) {
      if (academicRows.length === 0) {
        items.push({
          id: 'academics:no-assessment-data',
          severity: 'info',
          source: 'academics',
          title: 'No assessment results loaded',
          why: 'Academics is switched on but no test results have been uploaded, so this school cannot be compared with its peers.',
          metricKey: null,
          value: null,
          link: '/academics?tab=add',
          dueDate: null,
        })
      } else {
        // Collapse derived-over-ingested AND drop sub-floor cohorts. The briefing
        // NARRATES its numbers ("results fell 4.8 points, from 72.1 to 67.3"), so
        // a suppressed average restated in prose is the same disclosure as
        // publishing it in a chart — with the school named in the title.
        // THROUGH gateAggregates, like every other reader. Re-implementing the
        // collapse and the floor here meant the invariant was enforced by a
        // comment asking the next person to remember — which is exactly the
        // shape of the bypass the previous round found.
        const publishable = gateAggregates(
          academicRows.map((r) => ({
            schoolId,
            schoolYear: r.schoolYear,
            testType: r.testType,
            // readAcademicRows selects only the school-wide rows, so the gate's
            // per-cohort key is constant here.
            gradeLevel: 'all',
            derivation: r.derivation,
            avgComposite: r.avgComposite === null ? null : Number(r.avgComposite),
            sectionAverages: null,
            testedCount: r.testedCount,
            eligibleCount: null,
          })),
          (t) => TEST_FAMILY[t as TestTypeKey] ?? 'nrt',
          (f) => SCORE_TYPE_FOR_FAMILY[f],
        ).filter((r) => r.avgComposite !== null)
        const byTest = new Map<string, typeof publishable>()
        for (const r of publishable) {
          const list = byTest.get(r.testType) ?? []
          list.push(r)
          byTest.set(r.testType, list)
        }
        for (const [testType, rows] of byTest) {
          const sorted = [...rows].sort((a2, b2) => b2.schoolYear - a2.schoolYear)
          const latest = sorted[0]
          const prior = sorted.find((r) => r.schoolYear === latest.schoolYear - 1)
          if (!latest || !prior) continue
          const now = latest.avgComposite === null ? null : Number(latest.avgComposite)
          const was = prior.avgComposite === null ? null : Number(prior.avgComposite)
          if (now === null || was === null) continue
          const drop = was - now
          // THE SAME MATERIALITY FLOOR THE DASHBOARDS USE — which is per family,
          // not a flat five. On the ACT's 1-36 scale a five-point fall is a
          // collapse no school ever posts, so ACT declines were never briefed at
          // all; on the SAT's 400-1600 scale five points is rounding, so SAT noise
          // was briefed every morning. materialGap is the module's one answer to
          // "is this move big enough to say out loud".
          const family = TEST_FAMILY[testType as TestTypeKey] ?? 'nrt'
          if (drop < materialGap(family, SCORE_TYPE_FOR_FAMILY[family])) continue
          items.push({
            id: `academics:composite-declined:${testType}`,
            severity: 'warn',
            source: 'academics',
            title: `${testType.toUpperCase()} results fell ${drop.toFixed(1)} points`,
            why: `The school average moved from ${was.toFixed(1)} to ${now.toFixed(1)} between ${prior.schoolYear} and ${latest.schoolYear}. Worth reviewing which grades and subjects drove it.`,
            metricKey: null,
            value: now,
            link: '/academics?tab=analytics',
            dueDate: null,
          })
        }
      }
    }

    // ── STEP 3: lens-shape (rank + filter + reframe) + summarise ─────────────
    // applyLens is the SINGLE source of ranking truth (shared with the org fan-
    // out). It re-ranks per the lens emphasis, drops curated-out items (viewer),
    // and attaches voice — but NEVER touches a value. Counts are computed over
    // the FILTERED list so summary.total matches what this caller actually sees.
    const shaped = applyLens(items, effectiveLens)
    const summary = summarise(shaped)

    return {
      periodId: period.id,
      label: period.label,
      generatedAt,
      summary,
      items: shaped,
      ...lensMeta,
    }
  }
}

/** Lens-relative severity counts over the already-shaped item list. */
function summarise(items: AttentionItem[]): BriefingSummary {
  return {
    total: items.length,
    critical: items.filter((i) => i.severity === 'critical').length,
    warn: items.filter((i) => i.severity === 'warn').length,
    info: items.filter((i) => i.severity === 'info').length,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2.10's grade clause — WHICH grades carry an enrollment miss.
//
// Pure, so it is unit-testable without a briefing, and deliberately narrow: it
// answers "name the two worst grades" and nothing else.
//
// THE SUPPRESSION IS THE POINT. A grade under the cell floor is withheld on
// every enrollment surface in the product; the briefing is the one surface that
// gets emailed, printed into a board pack and read aloud by an assistant, so a
// grade named here is a grade named everywhere. `suppressSmallCell` is the same
// helper those surfaces use — a local size check would be a second floor, and
// the day one moves the two disagree about which children are identifiable.
// ─────────────────────────────────────────────────────────────────────────────

/** How many grades the clause may name. Two is a finding; five is a table. */
const NAMED_GRADE_GAP_LIMIT = 2

/**
 * n2 — a grade key the way a person says it: "Grade 3", "Kindergarten", never a
 * bare "3" or "K" that reads as a count beside the real counts in the sentence.
 * Value-guard safe: the digits still land in the item's own token set and the
 * added words ("Grade", "Kindergarten") are words, not figures.
 */
export function gradeDisplayName(grade: string): string {
  const g = String(grade).trim()
  if (/^\d+$/.test(g)) return `Grade ${g}`
  const up = g.toUpperCase()
  if (up === 'K' || up === 'KG') return 'Kindergarten'
  if (up === 'PK' || up === 'PREK' || up === 'PRE-K') return 'Pre-K'
  return g
}

/**
 * The largest UNSUPPRESSED per-grade shortfalls, biggest first.
 *
 * `short` is a POSITIVE magnitude — the caller states the direction in words,
 * because the narration guard is sign-aware and a signed figure in a `why`
 * forbids the model from saying "fewer" about it.
 */
export function namedGradeGaps(
  actualByGrade: unknown,
  planByGrade: Record<string, number> | null | undefined,
): { grade: string; short: number }[] {
  if (!planByGrade || !actualByGrade || typeof actualByGrade !== 'object') return []
  const actual = actualByGrade as Record<string, unknown>
  const out: { grade: string; short: number }[] = []
  for (const [grade, planned] of Object.entries(planByGrade)) {
    const a = actual[grade]
    if (typeof a !== 'number' || !Number.isFinite(a)) continue
    if (typeof planned !== 'number' || !Number.isFinite(planned)) continue
    const short = planned - a
    // Only genuine shortfalls. A grade AT or OVER plan is not a gap, and naming
    // it as one under a heading about being below plan would be false.
    if (short <= 0) continue
    // A count is both the value and the cohort behind it, so the count suppresses
    // itself — exactly as the enrollment page's own cells do.
    if (suppressSmallCell(a, a).suppressed) continue
    out.push({ grade, short })
  }
  return out
    .sort((x, y) => y.short - x.short || x.grade.localeCompare(y.grade))
    .slice(0, NAMED_GRADE_GAP_LIMIT)
}

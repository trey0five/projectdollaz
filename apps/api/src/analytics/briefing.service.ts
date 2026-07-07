import { Injectable, NotFoundException } from '@nestjs/common'
import {
  type MetricResult,
  formatMetricValueLong,
  projectCashRunway,
  resolveDisplayUnit,
} from '@finrep/analytics'
import type { MembershipRole } from '@finrep/db'
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
import { FacilitiesService } from '../facilities/facilities.service.js'
import { AdvancementService } from '../advancement/advancement.service.js'
import { StrategyService } from '../strategy/strategy.service.js'
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

/**
 * A task at least this many days past due escalates the workflow overdue item from
 * warn → critical. Deliberately TIGHTER than the governance BADLY_OVERDUE_DAYS=90
 * (tasks are day-scale operational work, so two weeks past due is already
 * critical). Lives here (not in the pure helper) so the pure layer stays minimal
 * and the briefing owns the severity decision.
 */
const WORKFLOW_BADLY_OVERDUE_DAYS = 14

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
  ) {}

  /**
   * The latest persisted aging snapshot for the school (by capturedAt). Fail-soft in
   * BOTH directions: an absent PrismaService (older positional-arg unit mocks) → null,
   * and a query error → null. NEVER throws, so STEP 2.11 can never 500 the briefing.
   */
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
      agingRow,
      cashFlowRow,
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
      // AR/AP aging — reads the persisted snapshot DIRECTLY via Prisma (NOT via
      // QboAgingService), inside this SAME parallel fan-out so latency stays slowest-
      // not-sum. CORE (no entitlement gate); fail-soft to null (readAgingRow catches).
      this.readAgingRow(schoolId),
      // Cash-flow + reconciliation — reads the persisted snapshot DIRECTLY via Prisma
      // (same module rule as aging), inside this SAME fan-out. CORE; fail-soft to null.
      this.readCashFlowRow(schoolId),
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
        // Only real shortfalls (>2% below plan). At/above plan or within 2% → no item
        // (and no metric:enrollment_vs_plan item exists to suppress — it's 'good').
        if (gapPct < -0.02) {
          const shortfall = Math.abs(gap)

          // Net tuition per PLANNED student: prefer the driver-budget netRate, else
          // the net_tuition_per_student metric value, else null (no tuition clause).
          const ntps = metricsResponse.metrics.find((m) => m.key === 'net_tuition_per_student')
          const netPerStudent =
            plan.netRate ?? (ntps && ntps.available ? ntps.value : null) ?? null
          const tuitionImpact = netPerStudent !== null ? gap * netPerStudent : null // negative $

          // Cash consequence (degrade-safe). Prefer a projectCashRunway breach month;
          // else an annualized days-cash estimate from the days_cash_on_hand metric.
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
              threshold: 60,
            })
            if (runway?.firstMonthBelowThreshold) {
              cashClause = `days cash on hand would fall below 60 by ${runway.firstMonthBelowThreshold.monthLabel}`
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

          // Severity from the gap band: > 5% below plan is critical, else warn.
          const severity: AttentionSeverity = gapPct <= -0.05 ? 'critical' : 'warn'

          let why =
            `Enrollment is ${shortfall} student${shortfall === 1 ? '' : 's'} below the plan of ` +
            `${plan.planTotal} (${(gapPct * 100).toFixed(1)}%)`
          // tuitionImpact is negative (revenue not collected); "less tuition"
          // already states the direction, so show the magnitude, not "-$…".
          if (tuitionImpact !== null)
            why += ` — about ${fmtMoney(Math.abs(tuitionImpact))} less tuition this year`
          if (cashClause) why += `; ${cashClause}`
          why += '.'

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

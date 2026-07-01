import { Injectable, NotFoundException } from '@nestjs/common'
import { type MetricResult, type MetricUnit } from '@finrep/analytics'
import type { MembershipRole } from '@finrep/db'
import { PeriodsService } from '../periods/periods.service.js'
import { AnalyticsService } from './analytics.service.js'
import { ComplianceService } from '../compliance/compliance.service.js'
import { ChecklistService } from '../compliance/checklist.service.js'
import { ReconciliationService } from '../compliance/reconciliation.service.js'
import { CorrectiveActionService } from '../compliance/corrective-action.service.js'
import { BillingService } from '../billing/billing.service.js'
import { PoliciesService } from '../governance/policies.service.js'
import { TasksService } from '../workflow/tasks.service.js'
import { AccreditationService } from '../accreditation/accreditation.service.js'
import { FacilitiesService } from '../facilities/facilities.service.js'
import { AdvancementService } from '../advancement/advancement.service.js'
import {
  ACCREDITATION_REVIEW_SOON_DAYS,
  ADVANCEMENT_CLOSING_SOON_DAYS,
  BADLY_OVERDUE_DAYS,
  DUE_SOON_DAYS,
} from '@finrep/compliance'
import {
  applyLens,
  availableLensesFor,
  clampLens,
  type AttentionVoice,
  type Lens,
} from './briefing-lens.js'

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

/**
 * Format a metric value for human `why` text using its unit semantics, so e.g.
 * operating_margin reads "-2.0%" (not "-0.02") and days_cash_on_hand reads
 * "45 days". Mirrors the web unit formatting. Null-safe.
 */
function fmtMetric(value: number | null, unit: MetricUnit): string {
  if (value === null || !Number.isFinite(value)) return 'unavailable'
  switch (unit) {
    case 'percent':
    case 'share':
      return `${(value * 100).toFixed(1)}%`
    case 'days':
      return `${Math.round(value)} day${Math.round(value) === 1 ? '' : 's'}`
    case 'months':
      return `${value.toFixed(1)} months`
    case 'currency':
      return `$${Math.round(value).toLocaleString('en-US')}`
    case 'ratio':
    default:
      return value.toFixed(2)
  }
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
  const v = fmtMetric(r.value, r.unit)
  const isRisk = r.status === 'risk'
  if (!r.bands) {
    return `${r.label} is ${v}, in the ${isRisk ? 'risk' : 'watch'} range for this metric.`
  }
  const good = fmtMetric(r.bands.good, r.unit)
  const risk = fmtMetric(r.bands.risk, r.unit)
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
    // Phase 3 Workflow v1 — open-task read for the (CORE, ungated) workflow STEP.
    private readonly tasks: TasksService,
    // Phase 4 Accreditation v1 — the module gate + the standards register read.
    private readonly accreditation: AccreditationService,
    // Phase 4 Facilities v1 — the module gate + the maintenance register read.
    private readonly facilities: FacilitiesService,
    // Phase 4 Advancement v1 — the module gate + the campaign register read.
    private readonly advancement: AdvancementService,
  ) {}

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

import { Injectable, NotFoundException } from '@nestjs/common'
import { type MetricResult, type MetricUnit } from '@finrep/analytics'
import type { MembershipRole } from '@finrep/db'
import { PeriodsService } from '../periods/periods.service.js'
import { AnalyticsService } from './analytics.service.js'
import { ComplianceService } from '../compliance/compliance.service.js'
import { ChecklistService } from '../compliance/checklist.service.js'
import { ReconciliationService } from '../compliance/reconciliation.service.js'
import { CorrectiveActionService } from '../compliance/corrective-action.service.js'
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
export type AttentionSource = 'metric' | 'compliance' | 'data'

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
    const [compliance, recon, checklist, cap] = await Promise.all([
      this.compliance.evaluateForPeriod(schoolId, period.id).catch(() => null),
      this.reconciliation.reconcileForPeriod(schoolId, period.id).catch(() => null),
      this.checklist.getChecklist(schoolId, period.id).catch(() => null),
      this.corrective.getPlan(schoolId, period.id).catch(() => null),
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

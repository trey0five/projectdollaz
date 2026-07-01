import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { User } from '@finrep/db'
import type { ReportBundle } from '@finrep/engine'
import {
  computeOrgMetrics,
  fromBundle,
  type OrgMetricResult,
  type SchoolPeriodInputs,
} from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { OperationalService } from './operational.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Canonical semantic layer v1 — the ORG-SCOPE metrics endpoint service.
//
// Org metric value = the metric's OWN formula (def.compute) applied to the
// FIELD-BY-FIELD SUM of its schools' extensive components — the pure
// @finrep/analytics computeOrgMetrics does that math. This service is the thin
// API shell: it RESOLVES the in-org, caller-visible schools + each school's
// latest snapshot for the FY (the SAME membership/Jul–Jun logic the shipped
// StatementsRollupService + OrgBriefingService use), adapts each snapshot to
// PeriodFinancials, loads each school's operational row, and hands the list to the
// pure engine. It adds NO math — the metric values come entirely from the package
// (so org + per-school can never disagree).
//
// Org isolation mirrors StatementsRollupService EXACTLY (additive — the shipped
// service is untouched): the rollup only ever spans schools the caller has an
// active membership on AND that belong to :orgId. The org-resolution block is
// COPIED (not extracted) to avoid touching the live, shipped rollup/briefing
// services; the fyStartOf Jul–Jun convention is byte-identical so org metrics and
// the statements rollup always agree on which snapshot is "the FY".
// ─────────────────────────────────────────────────────────────────────────────

/** A school that contributed to the org sums, for the response's disclosure list. */
export interface OrgMetricContributor {
  schoolId: string
  name: string
  /** YYYY-MM-DD of the chosen snapshot's period end. */
  periodEndDate: string | null
  /** Whether that snapshot carried a balance sheet (drives SFP-metric coverage). */
  hasSFP: boolean
  /** Whether the school had an operational row (drives Tier-2 coverage). */
  hasOperational: boolean
}

export interface OrgMetricsResponse {
  orgId: string
  fiscalYearStart: string | null
  /** Set in the SERVICE (the impure clock lives here, never in the pure package). */
  generatedAt: string
  /** Org-level MetricResult[] in canonical order — the SAME type the dashboard renders. */
  metrics: OrgMetricResult[]
  /** Schools whose financials were folded into the org sums. */
  contributingSchools: OrgMetricContributor[]
  /** In-org schools with no snapshot for the FY (NOT zero-filled into the sums). */
  notReported: { schoolId: string; name: string }[]
  /** Schools that reported (== contributingSchools.length). */
  reportedCount: number
  /** Total in-org schools the caller can see. */
  schoolCount: number
}

@Injectable()
export class OrgMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operational: OperationalService,
  ) {}

  /**
   * The latest snapshot of the NEAREST prior fiscal period that has one, for a
   * school. REPLICATED (not extracted) from AnalyticsService.nearestPriorBundle —
   * the org-resolution block is deliberately copied across the shipped
   * rollup/briefing/metrics services (documented above) to avoid touching the live
   * services; staying with copy-not-extract keeps this slice additive. Walks back
   * from `before` by periodEndDate, skipping any prior period that never produced a
   * snapshot, so org PoP deltas survive gaps. schoolId-scoped (from the caller's
   * in-org set) → no cross-tenant leak. Null when no prior period has a snapshot.
   */
  private async nearestPriorBundle(
    schoolId: string,
    before: Date,
  ): Promise<{ bundle: ReportBundle; periodId: string } | null> {
    const priorWithSnap = await this.prisma.fiscalPeriod.findFirst({
      where: {
        schoolId,
        periodEndDate: { lt: before },
        statementSnapshots: { some: {} },
      },
      orderBy: { periodEndDate: 'desc' },
    })
    if (!priorWithSnap) return null
    const snap = await this.prisma.statementSnapshot.findFirst({
      where: { schoolId, fiscalPeriodId: priorWithSnap.id },
      orderBy: { createdAt: 'desc' },
    })
    return snap
      ? { bundle: snap.payload as unknown as ReportBundle, periodId: priorWithSnap.id }
      : null
  }

  async getMetrics(
    user: User,
    orgId: string,
    fiscalYearStart: string | null,
  ): Promise<OrgMetricsResponse> {
    const generatedAt = new Date().toISOString()

    // ── ORG RESOLUTION + PER-SCHOOL PERIOD PICK ──────────────────────────────
    // Mirrors StatementsRollupService.getRollup steps 1-4 EXACTLY.
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, status: 'active' },
      include: { school: true },
    })
    if (memberships.length === 0) {
      throw new NotFoundException('You do not belong to an organization yet.')
    }

    const inOrg = memberships.filter((m) => m.school.organizationId === orgId)
    if (inOrg.length === 0) {
      throw new ForbiddenException('You do not have access to this organization.')
    }

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } })
    if (!org) throw new NotFoundException('Organization not found.')

    const schoolMap = new Map<string, { id: string; name: string }>()
    for (const m of inOrg) schoolMap.set(m.school.id, { id: m.school.id, name: m.school.name })
    const schools = [...schoolMap.values()]

    const snapshots = await this.prisma.statementSnapshot.findMany({
      where: { schoolId: { in: schools.map((s) => s.id) } },
      include: { fiscalPeriod: true },
      orderBy: { createdAt: 'desc' },
    })

    // Same Jul–Jun fyStartOf as StatementsRollupService/OrgBriefingService so the
    // query param and a snapshot's FY agree byte-for-byte across the org views.
    const fyStartOf = (s: (typeof snapshots)[number]): string | null => {
      const end = s.fiscalPeriod?.periodEndDate
      if (!end) return null
      const y = end.getUTCFullYear()
      const m = end.getUTCMonth() + 1
      const startYear = m <= 6 ? y - 1 : y
      return `${startYear}-07`
    }

    const notReported: { schoolId: string; name: string }[] = []
    // Reported schools, each carrying the chosen snapshot + its period id.
    const reported: {
      schoolId: string
      name: string
      periodId: string
      periodEndDate: string | null
      /** The chosen period's end as a Date, for the nearest-prior query. */
      periodEnd: Date | null
      bundle: ReportBundle
    }[] = []

    for (const s of schools) {
      const chosen = snapshots.find(
        (snap) =>
          snap.schoolId === s.id && (!fiscalYearStart || fyStartOf(snap) === fiscalYearStart),
      )
      if (!chosen) {
        notReported.push({ schoolId: s.id, name: s.name })
        continue
      }
      reported.push({
        schoolId: s.id,
        name: s.name,
        periodId: chosen.fiscalPeriodId,
        periodEndDate: chosen.fiscalPeriod?.periodEndDate?.toISOString().slice(0, 10) ?? null,
        periodEnd: chosen.fiscalPeriod?.periodEndDate ?? null,
        bundle: chosen.payload as unknown as ReportBundle,
      })
    }

    // ── ADAPT + LOAD OPERATIONAL + NEAREST-PRIOR (in parallel) → pure inputs ──
    // operationalFor does no tenant check (the period id came from a snapshot we
    // already resolved within the caller's in-org school set, so it is safe); the
    // same holds for the prior period id, which comes from nearestPriorBundle's
    // schoolId-scoped query. The nearest-prior snapshot + prior operational let the
    // pure engine light up org PoP deltas + org enrollment YoY (additive — the
    // deltas ride MetricResult.periodOverPeriodDelta, response shape unchanged).
    const inputs: SchoolPeriodInputs[] = await Promise.all(
      reported.map(async (r) => {
        const financials = fromBundle(r.bundle)
        const operational = await this.operational.operationalFor(r.schoolId, r.periodId)
        const prior = r.periodEnd ? await this.nearestPriorBundle(r.schoolId, r.periodEnd) : null
        const priorFinancials = prior ? fromBundle(prior.bundle) : null
        const priorOperational = prior
          ? await this.operational.operationalFor(r.schoolId, prior.periodId)
          : null
        return { schoolId: r.schoolId, financials, operational, priorFinancials, priorOperational }
      }),
    )

    // ── PURE ORG COMPUTE (all the math lives in @finrep/analytics) ───────────
    const metrics = computeOrgMetrics(inputs)

    const contributingSchools: OrgMetricContributor[] = reported.map((r, i) => ({
      schoolId: r.schoolId,
      name: r.name,
      periodEndDate: r.periodEndDate,
      hasSFP: inputs[i].financials.hasSFP,
      hasOperational: inputs[i].operational != null,
    }))

    return {
      orgId,
      fiscalYearStart: fiscalYearStart ?? null,
      generatedAt,
      metrics,
      contributingSchools,
      notReported,
      reportedCount: reported.length,
      schoolCount: schools.length,
    }
  }
}

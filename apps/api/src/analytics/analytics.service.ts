import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@finrep/db'
import type { ReportBundle } from '@finrep/engine'
import {
  computeMetricsForPeriod,
  computeTrend,
  isMetricKey,
  type MetricKey,
  type MetricResult,
  type MetricTrend,
  type PeriodOperational,
  type TrendSeriesEntry,
} from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { OperationalService } from './operational.service.js'

/** Prisma Decimal -> plain number (null-safe), for the pure analytics layer. */
function dec(v: Prisma.Decimal | null): number | null {
  return v === null ? null : Number(v)
}

/** Freshness/live cues for a period's metrics (Phase 4D). */
export interface MetricsFreshness {
  /** ISO timestamp the latest snapshot was generated ("data as of"). */
  dataAsOf: string
  /** YYYY-MM-DD fiscal period end. */
  periodEndDate: string
}

/** The metrics endpoint response (Phase 4A numbers + Phase 4D freshness). */
export interface MetricsResponse {
  periodId: string
  label: string
  periodEndDate: string
  metrics: MetricResult[]
  freshness: MetricsFreshness
}

/** One historical period's category actuals + operational drivers. */
export interface BudgetHistoryPoint {
  periodId: string
  label: string
  periodEndDate: string
  revenue: Record<string, number>
  expense: Record<string, number>
  enrollment: number | null
  enrollmentFte: number | null
  studentsOnAid: number | null
  financialAidTotal: number | null
}

/**
 * Everything the budget builder needs to compute lines from real history instead
 * of a blank column: the immediately-prior period's category actuals (the default
 * baseline), the full multi-year series (for trend/CAGR + build-from-history), and
 * enrollment/aid drivers with derived per-student figures (driver-based tuition).
 */
export interface BudgetContext {
  periodEndDate: string
  prior: {
    periodId: string
    label: string
    periodEndDate: string
    revenue: Record<string, number>
    expense: Record<string, number>
  } | null
  history: BudgetHistoryPoint[]
  drivers: {
    current: BudgetDrivers
    prior: BudgetDrivers
    /** Prior-year tuition actual (revenue.tuition) — copy/grow baseline. */
    priorTuitionActual: number | null
    /** Net tuition per student from the most recent period that has enrollment. */
    priorNetTuitionPerStudent: number | null
    /** Avg award from the most recent period that has aid + students-on-aid. */
    priorAvgAward: number | null
    /** Enrollment + label of the period the per-student driver was derived from. */
    baselineEnrollment: number | null
    baselineLabel: string | null
  }
}

interface BudgetDrivers {
  enrollment: number | null
  enrollmentFte: number | null
  studentsOnAid: number | null
  financialAidTotal: number | null
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly operational: OperationalService,
  ) {}

  /**
   * Latest snapshot for a period: the ReportBundle payload plus its createdAt
   * (the "data as of" timestamp — Phase 4D freshness). Single query, no extra
   * round trip. Null when the period has no snapshot.
   */
  private async latestSnapshot(
    schoolId: string,
    fiscalPeriodId: string,
  ): Promise<{ bundle: ReportBundle; createdAt: Date } | null> {
    const snap = await this.prisma.statementSnapshot.findFirst({
      where: { schoolId, fiscalPeriodId },
      orderBy: { createdAt: 'desc' },
    })
    if (!snap) return null
    return { bundle: snap.payload as unknown as ReportBundle, createdAt: snap.createdAt }
  }

  /** Latest snapshot's payload (ReportBundle) for a period, or null. */
  private async latestBundle(
    schoolId: string,
    fiscalPeriodId: string,
  ): Promise<ReportBundle | null> {
    const snap = await this.latestSnapshot(schoolId, fiscalPeriodId)
    return snap ? snap.bundle : null
  }

  /**
   * The latest snapshot of the NEAREST prior fiscal period that has one.
   * Walks back from `before` by periodEndDate, skipping any prior period that
   * never produced a snapshot, so PoP deltas survive gaps in snapshot history.
   * Returns null when no prior period has a snapshot.
   */
  private async nearestPriorBundle(
    schoolId: string,
    before: Date,
  ): Promise<{ bundle: ReportBundle; periodId: string } | null> {
    // One pass: prior periods (newest-first) that DO have a snapshot. `some`
    // keeps this to a single round trip rather than per-period lookups.
    const priorWithSnap = await this.prisma.fiscalPeriod.findFirst({
      where: {
        schoolId,
        periodEndDate: { lt: before },
        statementSnapshots: { some: {} },
      },
      orderBy: { periodEndDate: 'desc' },
    })
    if (!priorWithSnap) return null
    const bundle = await this.latestBundle(schoolId, priorWithSnap.id)
    return bundle ? { bundle, periodId: priorWithSnap.id } : null
  }

  /**
   * Tier-1 metrics for one period, computed from its persisted snapshot plus the
   * immediately-prior fiscal period's snapshot (for period-over-period deltas).
   * Tenant-isolated via getOwnedPeriod (404 if the period isn't this school's).
   * 404 when the period has no snapshot yet (nothing to compute).
   */
  async metricsForPeriod(schoolId: string, periodId: string): Promise<MetricsResponse> {
    return this.computeMetricsResponse(schoolId, periodId)
  }

  /**
   * Shared compute path: resolves the period (tenant-isolated), its latest
   * snapshot (+ createdAt for freshness), the nearest-prior snapshot/operational
   * for PoP deltas, and returns the full MetricResult[] + period meta + freshness.
   * Reused by both the metrics endpoint and the InsightService so they never drift.
   */
  async computeMetricsResponse(schoolId: string, periodId: string): Promise<MetricsResponse> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)

    const snapshot = await this.latestSnapshot(schoolId, period.id)
    if (!snapshot) {
      throw new NotFoundException('No statement snapshot for this period yet.')
    }
    const current = snapshot.bundle

    // Nearest PRIOR fiscal period (by periodEndDate desc, tenant-scoped) that
    // actually HAS a snapshot — used purely for PoP deltas. We walk back past any
    // periods that have no snapshot so the delta survives gaps in snapshot
    // history (the immediately-prior period may never have been generated).
    // Absent => delta null (never fabricated).
    const priorResolved = await this.nearestPriorBundle(schoolId, period.periodEndDate)
    const prior = priorResolved?.bundle ?? null

    // Tier-2 operational inputs: the period's own row + the nearest-prior period's
    // row (for Tier-2 PoP deltas). Absent => Tier-2 metrics available:false with
    // inputsMissing (the endpoint stays 200; the snapshot still drives Tier-1).
    const currentOperational = await this.operational.operationalFor(schoolId, period.id)
    const priorOperational = priorResolved
      ? await this.operational.operationalFor(schoolId, priorResolved.periodId)
      : null

    const metrics = computeMetricsForPeriod({
      current,
      prior,
      currentOperational,
      priorOperational,
    })

    const periodEndDate = period.periodEndDate.toISOString().slice(0, 10)

    return {
      periodId: period.id,
      label: period.label,
      periodEndDate,
      metrics,
      // Phase 4D freshness: the "data as of" timestamp comes from the existing
      // snapshot row (no new DB table/query); periodEndDate is the period end.
      freshness: {
        dataAsOf: snapshot.createdAt.toISOString(),
        periodEndDate,
      },
    }
  }

  /**
   * Public reuse seam for the Board Report (single source of truth for budget-vs-
   * actual). Resolves the period's latest snapshot ONCE and returns the raw
   * bundle, its createdAt (data-as-of), the full MetricResult set (for KPIs), and
   * the category actuals (revenue/expense mix). NEVER throws on a missing snapshot
   * — returns nulls so the assemble endpoint stays 200 with availability flags.
   * Tenant isolation is the CALLER's responsibility (getOwnedPeriod).
   */
  async getBoardReportData(
    schoolId: string,
    fiscalPeriodId: string,
  ): Promise<{
    bundle: ReportBundle | null
    dataAsOf: string | null
    metrics: MetricResult[]
    categoryActuals: { revenue: Record<string, number>; expense: Record<string, number> }
  }> {
    const snapshot = await this.latestSnapshot(schoolId, fiscalPeriodId)
    if (!snapshot) {
      return {
        bundle: null,
        dataAsOf: null,
        metrics: [],
        categoryActuals: { revenue: {}, expense: {} },
      }
    }
    const currentOperational = await this.operational.operationalFor(schoolId, fiscalPeriodId)
    const metrics = computeMetricsForPeriod({
      current: snapshot.bundle,
      prior: null,
      currentOperational,
      priorOperational: null,
    })
    return {
      bundle: snapshot.bundle,
      dataAsOf: snapshot.createdAt.toISOString(),
      metrics,
      categoryActuals: this.categoryActuals(snapshot.bundle),
    }
  }

  /** Category actuals ({key: amount}) from a bundle, via the revenue/expense mix
   * components. prior/operational are irrelevant to the mix values, so pass null. */
  private categoryActuals(bundle: ReportBundle): {
    revenue: Record<string, number>
    expense: Record<string, number>
  } {
    const metrics = computeMetricsForPeriod({
      current: bundle,
      prior: null,
      currentOperational: null,
      priorOperational: null,
    })
    const mix = (key: string): Record<string, number> => {
      const m = metrics.find((x) => x.key === key)
      const out: Record<string, number> = {}
      for (const c of m?.components ?? []) out[c.key] = c.value
      return out
    }
    return { revenue: mix('revenue_mix'), expense: mix('expense_mix') }
  }

  /**
   * Context for the budget builder: prior-year category actuals, the multi-year
   * history series, and enrollment/aid drivers (+ derived per-student figures).
   * Read-only; tenant-isolated via getOwnedPeriod. Empty-but-shaped when the
   * school has no prior snapshots yet (builder falls back to manual entry).
   */
  async budgetContext(schoolId: string, periodId: string): Promise<BudgetContext> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const activeEnd = period.periodEndDate.toISOString().slice(0, 10)

    const periods = await this.prisma.fiscalPeriod.findMany({
      where: { schoolId },
      orderBy: { periodEndDate: 'asc' },
    })
    const ids = periods.map((p) => p.id)

    const snapshots = await this.prisma.statementSnapshot.findMany({
      where: { schoolId, fiscalPeriodId: { in: ids } },
      orderBy: { createdAt: 'desc' },
    })
    const latestByPeriod = new Map<string, ReportBundle>()
    for (const s of snapshots) {
      if (!latestByPeriod.has(s.fiscalPeriodId)) {
        latestByPeriod.set(s.fiscalPeriodId, s.payload as unknown as ReportBundle)
      }
    }

    const opRows = await this.prisma.periodOperationalData.findMany({
      where: { schoolId, fiscalPeriodId: { in: ids } },
    })
    const opByPeriod = new Map<string, BudgetDrivers>()
    for (const r of opRows) {
      opByPeriod.set(r.fiscalPeriodId, {
        enrollment: r.enrollment,
        enrollmentFte: dec(r.enrollmentFte),
        studentsOnAid: r.studentsOnAid,
        financialAidTotal: dec(r.financialAidTotal),
      })
    }
    const noDrivers: BudgetDrivers = {
      enrollment: null,
      enrollmentFte: null,
      studentsOnAid: null,
      financialAidTotal: null,
    }

    const history: BudgetHistoryPoint[] = periods
      .filter((p) => latestByPeriod.has(p.id))
      .map((p) => {
        const { revenue, expense } = this.categoryActuals(latestByPeriod.get(p.id) as ReportBundle)
        const op = opByPeriod.get(p.id) ?? noDrivers
        return {
          periodId: p.id,
          label: p.label,
          periodEndDate: p.periodEndDate.toISOString().slice(0, 10),
          revenue,
          expense,
          enrollment: op.enrollment,
          enrollmentFte: op.enrollmentFte,
          studentsOnAid: op.studentsOnAid,
          financialAidTotal: op.financialAidTotal,
        }
      })

    // Immediately-prior period that has a snapshot (history is ascending).
    const priorPoint = [...history].reverse().find((h) => h.periodEndDate < activeEnd) ?? null
    const priorDrivers = priorPoint ? (opByPeriod.get(priorPoint.periodId) ?? noDrivers) : noDrivers
    const currentDrivers = opByPeriod.get(period.id) ?? noDrivers

    const priorTuitionActual = priorPoint?.revenue.tuition ?? null
    // Driver baselines come from the most recent period that actually has the
    // inputs — enrollment is often only captured on the latest period, so strict
    // prior-year would leave the per-student driver empty.
    const tuitionBasis = [...history]
      .reverse()
      .find((h) => h.enrollment && Number.isFinite(h.revenue.tuition))
    const priorNetTuitionPerStudent = tuitionBasis
      ? (tuitionBasis.revenue.tuition as number) / (tuitionBasis.enrollment as number)
      : null
    const aidBasis = [...history]
      .reverse()
      .find((h) => h.studentsOnAid && Number.isFinite(h.financialAidTotal))
    const priorAvgAward = aidBasis
      ? (aidBasis.financialAidTotal as number) / (aidBasis.studentsOnAid as number)
      : null

    return {
      periodEndDate: activeEnd,
      prior: priorPoint
        ? {
            periodId: priorPoint.periodId,
            label: priorPoint.label,
            periodEndDate: priorPoint.periodEndDate,
            revenue: priorPoint.revenue,
            expense: priorPoint.expense,
          }
        : null,
      history,
      drivers: {
        current: currentDrivers,
        prior: priorDrivers,
        priorTuitionActual,
        priorNetTuitionPerStudent,
        priorAvgAward,
        baselineEnrollment: tuitionBasis?.enrollment ?? null,
        baselineLabel: tuitionBasis?.label ?? null,
      },
    }
  }

  /**
   * A single metric's trend across every period of the school that has a
   * snapshot. Picks the LATEST snapshot per period (newest-per-fiscalPeriodId)
   * to avoid duplicate points from regenerations. 400 on an unknown metric key.
   */
  async trends(schoolId: string, metric: string): Promise<MetricTrend> {
    if (!isMetricKey(metric)) {
      throw new BadRequestException(`Unknown metric '${metric}'.`)
    }
    const metricKey = metric as MetricKey

    const periods = await this.prisma.fiscalPeriod.findMany({
      where: { schoolId },
      orderBy: { periodEndDate: 'asc' },
    })
    if (periods.length === 0) {
      return computeTrend(metricKey, [])
    }

    const snapshots = await this.prisma.statementSnapshot.findMany({
      where: { schoolId, fiscalPeriodId: { in: periods.map((p) => p.id) } },
      orderBy: { createdAt: 'desc' },
    })

    // newest-per-period (snapshots already newest-first).
    const latestByPeriod = new Map<string, ReportBundle>()
    for (const s of snapshots) {
      if (!latestByPeriod.has(s.fiscalPeriodId)) {
        latestByPeriod.set(s.fiscalPeriodId, s.payload as unknown as ReportBundle)
      }
    }

    // Operational rows for every period in one round trip, so Tier-2 trend
    // points (cost per pupil, aid metrics, discount rate, % on aid) populate the
    // sparklines + trend chart instead of being perpetually unavailable. A period
    // without a row simply yields an unavailable point (never a fabricated zero).
    const opRows = await this.prisma.periodOperationalData.findMany({
      where: { schoolId, fiscalPeriodId: { in: periods.map((p) => p.id) } },
    })
    const opByPeriod = new Map<string, PeriodOperational>()
    for (const r of opRows) {
      opByPeriod.set(r.fiscalPeriodId, {
        enrollment: r.enrollment,
        enrollmentFte: dec(r.enrollmentFte),
        studentsOnAid: r.studentsOnAid,
        financialAidTotal: dec(r.financialAidTotal),
      })
    }

    const series: TrendSeriesEntry[] = periods
      .filter((p) => latestByPeriod.has(p.id))
      .map((p) => ({
        periodId: p.id,
        label: p.label,
        periodEndDate: p.periodEndDate.toISOString().slice(0, 10),
        bundle: latestByPeriod.get(p.id) as ReportBundle,
        operational: opByPeriod.get(p.id) ?? null,
      }))

    return computeTrend(metricKey, series)
  }
}

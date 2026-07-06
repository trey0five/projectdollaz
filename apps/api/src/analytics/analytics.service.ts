import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@finrep/db'
import type { ReportBundle } from '@finrep/engine'
import {
  computeMetricsForPeriod,
  computeTrend,
  evenMonths,
  fromBundle,
  isMetricKey,
  type MetricKey,
  type MetricResult,
  type MetricTrend,
  type PeriodOperational,
  type TrendPoint,
  type TrendSeriesEntry,
} from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { BillingService } from '../billing/billing.service.js'
import { OperationalService } from './operational.service.js'
import { EnrollmentPlanService, type ResolvedEnrollmentPlan } from './enrollment-plan.js'
import { categoryActualsFromBundle } from './category-actuals.js'
import { entitledModulesForSchool, filterMetricsByEntitlement } from './metric-gating.js'
import { fyElapsed } from '../monthly/fy-elapsed.js'

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

/** Phase 2 — the resolved inputs for the briefing's cross-domain enrollment step. */
export interface EnrollmentSignalInputs {
  /** Actual enrollment headcount for the period (operational row), or null. */
  actual: number | null
  /** The resolved enrollment plan, or null when no plan is set anywhere. */
  plan: ResolvedEnrollmentPlan | null
  /** Cash-runway projection inputs (any field null when unavailable). */
  cash: {
    openingCash: number | null
    monthlyNetCashflow: number[] | null
    annualExpense: number | null
  }
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
    // MODULE-SCOPED METRIC GATING — resolves per-school entitlement to filter the
    // enrollment/hr metrics (finance-family metrics are never gated). Injected here
    // so BOTH the /metrics endpoint and the briefing (which consumes
    // computeMetricsResponse) share ONE gate point.
    private readonly billing: BillingService,
    // Phase 2 Enrollment Intelligence — resolves the enrollment PLAN (driver budget
    // grid OR plannedEnrollmentByGrade) so it can be threaded into the pure compute
    // layer for enrollment_vs_plan (keeps the metric pure). PrismaService-only, so no
    // DI cycle with BudgetService.
    private readonly enrollmentPlan: EnrollmentPlanService,
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

    // Phase 2 — thread the resolved enrollment PLAN total onto the CURRENT
    // operational struct so the pure enrollment_vs_plan metric can compute (the
    // package never reads the DB). Fail-soft: a plan-resolve hiccup leaves plan
    // null → the metric is available:false (inputsMissing:['enrollmentPlan']), it
    // never 500s the metrics/briefing surface.
    if (currentOperational) {
      // Optional-chain the dep so a lean unit-test construction (that omits the
      // EnrollmentPlanService) resolves to no plan rather than throwing.
      const plan = await Promise.resolve()
        .then(() => this.enrollmentPlan?.resolve(schoolId, period.id) ?? null)
        .catch(() => null)
      currentOperational.enrollmentPlan = plan?.planTotal ?? null
    }

    const allMetrics = computeMetricsForPeriod({
      current,
      prior,
      currentOperational,
      priorOperational,
    })

    // MODULE-SCOPED METRIC GATING (surface 1 of 3). Keep only metrics whose owning
    // module the school is entitled to. finance-family metrics are always kept
    // (finance is seeded true, never behind a fragile billing call); ONLY the
    // enrollment/hr metrics are conditionally hidden, fail-CLOSED. The briefing
    // inherits this gate by consuming this same response (surface 2).
    const entitled = await entitledModulesForSchool(schoolId, this.billing)
    const metrics = filterMetricsByEntitlement(allMetrics, entitled)

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
   * Phase 2 — the inputs the briefing's cross-domain enrollment→tuition→cash STEP
   * needs, resolved in ONE fail-soft fan-out so BriefingService only calls a single
   * (mockable) method on the already-injected AnalyticsService (no new briefing
   * dependency). NEVER throws — every leg fail-softs to a null so the briefing keeps
   * its graceful-degradation guarantee:
   *   • actual  — the period's actual enrollment headcount (operational row);
   *   • plan    — the resolved enrollment plan {planTotal, planByGrade, netRate};
   *   • cash    — the cash-runway inputs: opening SFP cash, the driver budget's even
   *               monthly net cashflow, and the annual expense (driver total, else
   *               the SOA total) — any of which may be null when unavailable.
   * Tenant isolation via getOwnedPeriod (a foreign/unknown period throws BEFORE any
   * read — the briefing already resolved the owned period, so this is belt-and-braces).
   */
  async enrollmentSignalInputs(
    schoolId: string,
    periodId: string,
  ): Promise<EnrollmentSignalInputs> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const [op, plan, budget, snapshot] = await Promise.all([
      this.operational.operationalFor(schoolId, period.id).catch(() => null),
      this.enrollmentPlan.resolve(schoolId, period.id).catch(() => null),
      this.prisma.periodBudget
        .findUnique({ where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } } })
        .catch(() => null),
      this.latestSnapshot(schoolId, period.id).catch(() => null),
    ])

    const actual = op?.enrollment ?? null

    // Opening cash + the SOA-total fallback expense come from the latest snapshot.
    let openingCash: number | null = null
    let soaExpense: number | null = null
    if (snapshot) {
      const fin = fromBundle(snapshot.bundle)
      openingCash = fin.hasSFP ? fin.cash : null
      soaExpense = fin.totalExp > 0 ? fin.totalExp : null
    }

    // The driver budget (when applied) gives the annual expense + an even monthly
    // net-cashflow spread (evenMonths(netIncome), matching the stored budget spread).
    const lines = (budget?.lines as Record<string, unknown> | null) ?? null
    const kpis = (lines?.driverModel as Record<string, unknown> | undefined)?.kpis as
      | Record<string, unknown>
      | undefined
    const driverExpense =
      kpis && typeof kpis.totalExpense === 'number' ? kpis.totalExpense : null
    const driverNet = kpis && typeof kpis.netIncome === 'number' ? kpis.netIncome : null
    const monthlyNetCashflow = driverNet !== null ? evenMonths(driverNet) : null
    const annualExpense = driverExpense ?? soaExpense

    return {
      actual,
      plan,
      cash: { openingCash, monthlyNetCashflow, annualExpense },
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
    /**
     * Phase 5 — prior-year category actuals derived read-only from the SAME
     * snapshot bundle's PY trial-balance side (soaResults.py). null when the
     * bundle has no PY snapshot. Keys are byte-identical to categoryActuals.
     */
    categoryActualsPY:
      | { revenue: Record<string, number>; expense: Record<string, number> }
      | null
  }> {
    const snapshot = await this.latestSnapshot(schoolId, fiscalPeriodId)
    if (!snapshot) {
      return {
        bundle: null,
        dataAsOf: null,
        metrics: [],
        categoryActuals: { revenue: {}, expense: {} },
        categoryActualsPY: null,
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
      categoryActualsPY: this.categoryActualsPY(snapshot.bundle),
    }
  }

  /**
   * Phase 5 — prior-year category actuals from the SAME bundle's PY side, with
   * NO statement recompute. Returns null when the bundle has no PY snapshot.
   * Synthesizes a shallow PY-as-CY bundle (soaResults.cy := soaResults.py) and
   * reuses categoryActuals verbatim: fromBundle reads only soaResults.cy, so the
   * PY mix keys are byte-identical to the CY keys — no parallel pick table, no
   * risk of row misalignment on the OperationsLine.key union.
   */
  private categoryActualsPY(bundle: ReportBundle): {
    revenue: Record<string, number>
    expense: Record<string, number>
  } | null {
    if (!bundle.soaResults?.hasPY || !bundle.soaResults.py) return null
    const pyBundle: ReportBundle = {
      ...bundle,
      soaResults: { ...bundle.soaResults, cy: bundle.soaResults.py },
    }
    return this.categoryActuals(pyBundle)
  }

  /** Category actuals ({key: amount}) from a bundle, via the revenue/expense mix
   * components. prior/operational are irrelevant to the mix values, so pass null.
   * Delegates to the shared pure helper (also used by the monthly-actuals
   * service) — output is byte-identical to the prior inline implementation. */
  private categoryActuals(bundle: ReportBundle): {
    revenue: Record<string, number>
    expense: Record<string, number>
  } {
    return categoryActualsFromBundle(bundle)
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
        // Staff FTEs so Tier-2 HR trend points (student_teacher_ratio) populate.
        teachingFte: dec(r.teachingFte),
        totalStaffFte: dec(r.totalStaffFte),
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

    const annual = computeTrend(metricKey, series)

    // Annual path is authoritative whenever ≥2 fiscal periods have a snapshot —
    // NEVER perturbed by the fallback below (byte-identical to the prior behavior).
    if (series.length >= 2) return annual

    // <2 annual points => the sparkline would show the "builds as you save more
    // periods" placeholder. Fall back to MONTHLY snapshots within a single FY so the
    // chart can still draw. Only replaces the annual result when it yields ≥2 real
    // (non-null) monthly points; otherwise the annual placeholder stands unchanged.
    const monthly = await this.monthlyTrendFallback(schoolId, metricKey, annual)
    return monthly ?? annual
  }

  /**
   * MONTHLY-derived trend fallback: one point per monthly snapshot within a SINGLE
   * fiscal year, using the same partial-year-correct compute path as
   * monthly-actuals.service.ts (computeMetricsForPeriod with the fyElapsed basis, so
   * days_cash_on_hand / months_operating_reserve annualize off the elapsed period).
   *
   * Month selection: pick the ONE fiscal period with the MOST monthly snapshots
   * (tie-break: the latest period by periodEndDate). Confining the series to a
   * single FY keeps the month labels ('Jan 26' …) unambiguous and the elapsed basis
   * monotonic. Returns null (=> caller keeps the annual placeholder) unless the
   * chosen FY yields ≥2 non-null points, which is what the sparkline needs to draw.
   */
  private async monthlyTrendFallback(
    schoolId: string,
    metricKey: MetricKey,
    annual: MetricTrend,
  ): Promise<MetricTrend | null> {
    const snaps = await this.prisma.monthlySnapshot.findMany({
      where: { schoolId },
      orderBy: { monthKey: 'asc' },
      select: { fiscalPeriodId: true, monthKey: true, payload: true },
    })
    if (snaps.length < 2) return null

    // Group months by fiscal period, then choose the period with the most months.
    const byPeriod = new Map<
      string,
      { monthKey: string; payload: ReportBundle }[]
    >()
    for (const s of snaps) {
      const arr = byPeriod.get(s.fiscalPeriodId) ?? []
      arr.push({ monthKey: s.monthKey, payload: s.payload as unknown as ReportBundle })
      byPeriod.set(s.fiscalPeriodId, arr)
    }

    let chosenPeriodId: string | null = null
    let chosenMonths: { monthKey: string; payload: ReportBundle }[] = []
    for (const [periodId, months] of byPeriod) {
      // Prefer more months; tie-break on the latest (largest) monthKey in the group.
      if (
        months.length > chosenMonths.length ||
        (months.length === chosenMonths.length &&
          months[months.length - 1].monthKey >
            (chosenMonths[chosenMonths.length - 1]?.monthKey ?? ''))
      ) {
        chosenPeriodId = periodId
        chosenMonths = months
      }
    }
    if (!chosenPeriodId || chosenMonths.length < 2) return null

    // Ascending by monthKey (already sorted by the query, but be explicit).
    const ordered = [...chosenMonths].sort((a, b) =>
      a.monthKey < b.monthKey ? -1 : a.monthKey > b.monthKey ? 1 : 0,
    )

    const points: TrendPoint[] = ordered.map(({ monthKey, payload }) => {
      // Same partial-year-correct compute path as monthly-actuals.service.ts: the
      // elapsed basis annualizes the two partial-year metrics honestly at month-end.
      const { elapsedDays, elapsedMonths } = fyElapsed(monthKey)
      const metrics = computeMetricsForPeriod({ current: payload, elapsedDays, elapsedMonths })
      const m = metrics.find((r) => r.key === metricKey)
      return {
        periodId: chosenPeriodId as string,
        label: monthLabel(monthKey),
        periodEndDate: monthEndDate(monthKey),
        value: m && m.available ? m.value : null,
        available: !!m && m.available,
      }
    })

    // Only replace the annual placeholder when the sparkline can actually draw.
    const drawable = points.filter((p) => p.value !== null).length
    if (drawable < 2) return null

    return {
      metric: annual.metric,
      label: annual.label,
      unit: annual.unit,
      goodDirection: annual.goodDirection,
      points,
      granularity: 'monthly',
    }
  }
}

/** 'YYYY-MM' -> short month + 2-digit year, e.g. '2026-01' -> 'Jan 26'. */
function monthLabel(monthKey: string): string {
  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  const yyyy = monthKey.slice(0, 4)
  const mm = Number(monthKey.slice(5, 7))
  return `${MONTHS[mm - 1]} ${yyyy.slice(2)}`
}

/** 'YYYY-MM' -> the month-END ISO date, e.g. '2026-01' -> '2026-01-31'. */
function monthEndDate(monthKey: string): string {
  const yyyy = Number(monthKey.slice(0, 4))
  const mm = Number(monthKey.slice(5, 7)) // 1-based
  // Day 0 of the NEXT month (mm as a 0-based index) === last day of THIS month.
  return new Date(Date.UTC(yyyy, mm, 0)).toISOString().slice(0, 10)
}

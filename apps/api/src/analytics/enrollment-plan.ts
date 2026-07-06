import { Injectable } from '@nestjs/common'
import { GRADE_KEYS } from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'

/**
 * Phase 2 Enrollment Intelligence — the resolved enrollment PLAN for one period.
 * `planTotal` is the denominator of enrollment_vs_plan; `netRate` (net tuition per
 * planned student, from the driver budget) is the multiplier the cross-domain
 * briefing item uses to turn an enrollment gap into a tuition-dollar impact.
 */
export interface ResolvedEnrollmentPlan {
  planTotal: number
  planByGrade: Record<string, number>
  netRate: number | null
}

/** Sum a JSON grade→count map over the known GRADE_KEYS, keeping only finite
 *  positive counts. Returns null when nothing usable remains (so a blank/empty
 *  plan is "no plan", never a fabricated 0-total). */
function sumByGrade(v: unknown): { total: number; map: Record<string, number> } | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const src = v as Record<string, unknown>
  const map: Record<string, number> = {}
  let total = 0
  for (const g of GRADE_KEYS) {
    const n = src[g]
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
      map[g] = n
      total += n
    }
  }
  return total > 0 ? { total, map } : null
}

/**
 * Resolves the enrollment plan for a period from EITHER the applied driver budget
 * OR the free plannedEnrollmentByGrade operational input. PrismaService-only (reads
 * the two tiny per-period rows directly), so it carries NO dependency on
 * BudgetService/AnalyticsService and cannot form a DI cycle. Tenant isolation is the
 * CALLER's responsibility (both callers resolve the owned period first) — schoolId +
 * fiscalPeriodId are both in the WHERE, so a cross-tenant id yields no row.
 *
 * Priority (contract):
 *   (1) driver budget assumptions.enrollmentByGrade total (netRate = driver
 *       netTuitionPerStudent from the stored kpis);
 *   (2) PeriodOperationalData.plannedEnrollmentByGrade total (netRate = null);
 *   (3) null.
 */
@Injectable()
export class EnrollmentPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(schoolId: string, fiscalPeriodId: string): Promise<ResolvedEnrollmentPlan | null> {
    // (1) driver budget — the applied enrollment grid is the authoritative plan.
    const budget = await this.prisma.periodBudget
      .findUnique({ where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId } } })
      .catch(() => null)
    const lines = (budget?.lines as Record<string, unknown> | null) ?? null
    const driverModel = lines?.driverModel as Record<string, unknown> | undefined
    const assumptions = driverModel?.assumptions as Record<string, unknown> | undefined
    const driverGrade = sumByGrade(assumptions?.enrollmentByGrade)
    if (driverGrade) {
      const kpis = driverModel?.kpis as Record<string, unknown> | undefined
      const netRate =
        typeof kpis?.netTuitionPerStudent === 'number' ? kpis.netTuitionPerStudent : null
      return { planTotal: driverGrade.total, planByGrade: driverGrade.map, netRate }
    }

    // (2) free plannedEnrollmentByGrade on the operational row (no driver budget).
    const op = await this.prisma.periodOperationalData
      .findUnique({ where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId } } })
      .catch(() => null)
    // Cast: plannedEnrollmentByGrade is an additive Phase-2 column; read defensively
    // so this compiles even before the prisma client is regenerated for it.
    const planned = sumByGrade(
      (op as { plannedEnrollmentByGrade?: unknown } | null)?.plannedEnrollmentByGrade,
    )
    if (planned) {
      return { planTotal: planned.total, planByGrade: planned.map, netRate: null }
    }

    // (3) no plan anywhere.
    return null
  }
}

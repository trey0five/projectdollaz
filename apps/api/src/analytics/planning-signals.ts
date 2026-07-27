import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

/**
 * Phase 6 Planning — the resolved BUDGET + FY-end FORECAST dollar signals for one
 * period, threaded (enrollmentPlan precedent) onto the pure compute layer's
 * PeriodOperational so forecast_vs_budget_net / forecast_operating_margin /
 * plan_readiness can compute without the package ever reading the DB.
 *
 * `budgetTotal*` come from the PeriodBudget row columns (every budget path —
 * manual, spread import, driver apply — writes them); `forecastTotal*` from the
 * stored `lines.forecast.projected.kpis`. hasBudget/hasForecast are the
 * plan-readiness artifact flags (and the briefing's completeness signals):
 * DEFINITIVE reads — a missing row/figure is a real "not saved", while a query
 * error resolves the WHOLE result to null (fail-soft) so callers can distinguish
 * "known absent" from "could not read" and never emit a false completeness item.
 */
export interface ResolvedPlanningSignals {
  /** PeriodBudget.totalRevenue ($), or null when not saved. */
  budgetTotalRevenue: number | null
  /** PeriodBudget.totalExpenses ($; singular name in the threading contract). */
  budgetTotalExpense: number | null
  /** lines.forecast.projected.kpis.totalRevenue ($), or null when no forecast. */
  forecastTotalRevenue: number | null
  /** lines.forecast.projected.kpis.totalExpense ($), or null when no forecast. */
  forecastTotalExpense: number | null
  /** A budget is saved (either total present on the row). */
  hasBudget: boolean
  /** A FY-end forecast is saved (lines.forecast exists). */
  hasForecast: boolean
}

/** A stored numeric (Prisma Decimal | number | unknown JSON) → finite number | null. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Prisma-only sibling of EnrollmentPlanService: ONE periodBudget.findUnique per
 * (schoolId, periodId), no BudgetService dependency (so no DI cycle), `.catch(()
 * => null)` fail-soft. Tenant isolation is the CALLER's responsibility (both
 * callers resolve the owned period first) — schoolId + fiscalPeriodId are both
 * in the WHERE, so a cross-tenant id yields no row (an honest "nothing saved").
 */
@Injectable()
export class PlanningSignalsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    schoolId: string,
    fiscalPeriodId: string,
  ): Promise<ResolvedPlanningSignals | null> {
    // Distinguish "no row" (definitive: nothing saved) from a query ERROR (null =
    // could not read; callers skip rather than fabricate a completeness signal).
    let failed = false
    const budget = await this.prisma.periodBudget
      .findUnique({ where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId } } })
      .catch(() => {
        failed = true
        return null
      })
    if (failed) return null

    const budgetTotalRevenue = num(budget?.totalRevenue ?? null)
    const budgetTotalExpense = num(budget?.totalExpenses ?? null)

    // The saved forecast envelope (budget.service upsertForecast's lines.forecast).
    const lines = (budget?.lines as Record<string, unknown> | null) ?? null
    const forecast = (lines?.forecast as Record<string, unknown> | undefined) ?? null
    const projected = (forecast?.projected as Record<string, unknown> | undefined) ?? null
    const kpis = (projected?.kpis as Record<string, unknown> | undefined) ?? null
    const forecastTotalRevenue = num(kpis?.totalRevenue)
    const forecastTotalExpense = num(kpis?.totalExpense)

    return {
      budgetTotalRevenue,
      budgetTotalExpense,
      forecastTotalRevenue,
      forecastTotalExpense,
      hasBudget: budgetTotalRevenue !== null || budgetTotalExpense !== null,
      hasForecast: forecast !== null,
    }
  }
}

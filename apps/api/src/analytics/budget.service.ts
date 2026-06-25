import { Injectable } from '@nestjs/common'
import { Prisma } from '@finrep/db'
import type { PeriodBudget } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { UpsertBudgetDto } from './dto/upsert-budget.dto.js'
import type { ImportBudgetSpreadDto } from './dto/import-budget-spread.dto.js'
import { rollupSpread, type SpreadRollup } from './budget.spread.js'
import type { BudgetSpread } from '@finrep/ingestion'
import {
  computeDriverBudget,
  toDriverPriorContext,
  type DriverBudgetResult,
} from '@finrep/analytics'
import { AnalyticsService } from './analytics.service.js'
import { buildDriverSpread, deriveFiscalYearStart } from './budget.driver.js'
import type { SaveDriverBudgetDto } from './dto/save-driver-budget.dto.js'

export interface BudgetPublic {
  totalRevenue: number | null
  totalExpenses: number | null
  notes: string | null
  lines: Record<string, unknown> | null
}

export interface BudgetSpreadImportResult extends BudgetPublic {
  reconciliation: SpreadRollup['reconciliation']
  accountCount: number
  unmappedAccts: number[]
}

export interface DriverBudgetResultPublic extends BudgetPublic {
  kpis: DriverBudgetResult['kpis']
}

function dec(v: Prisma.Decimal | null | undefined): number | null {
  return v == null ? null : Number(v)
}

/**
 * Phase 3 budget intake (budget-vs-actual). Actuals come from the statement
 * snapshot via the metrics endpoint, so only the budget is persisted here. Same
 * tenant-isolation + merge-pick semantics as OperationalService.
 */
@Injectable()
export class BudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
  ) {}

  private toPublic(row: PeriodBudget | null): BudgetPublic {
    return {
      totalRevenue: dec(row?.totalRevenue),
      totalExpenses: dec(row?.totalExpenses),
      notes: row?.notes ?? null,
      lines: (row?.lines as Record<string, unknown> | null) ?? null,
    }
  }

  async get(schoolId: string, periodId: string): Promise<BudgetPublic> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const row = await this.prisma.periodBudget.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })
    return this.toPublic(row)
  }

  async upsert(
    schoolId: string,
    periodId: string,
    dto: UpsertBudgetDto,
    userId: string,
  ): Promise<BudgetPublic> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const existing = await this.prisma.periodBudget.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })

    const pick = <T>(dtoVal: T | undefined, current: T): T =>
      dtoVal === undefined ? current : dtoVal

    // Merge incoming `lines` over the existing row, carrying forward sibling fields
    // the caller omitted (spread, driverModel) so a category-level save — e.g.
    // Budget-vs-Actual or the manual builder, which only send revenue/expense/
    // methods — never wipes an imported spread or an applied driver model living
    // on the same period budget. undefined = don't touch; null = clear.
    const existingLines = (existing?.lines as Record<string, unknown> | null) ?? {}
    const nextLines = ((): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined => {
      if (dto.lines === undefined) return undefined
      if (dto.lines === null) return Prisma.JsonNull
      return {
        ...(existingLines.spread !== undefined ? { spread: existingLines.spread } : {}),
        ...(existingLines.driverModel !== undefined ? { driverModel: existingLines.driverModel } : {}),
        ...(dto.lines as Record<string, unknown>),
      } as Prisma.InputJsonValue
    })()

    const data = {
      totalRevenue: pick(dto.totalRevenue, existing ? dec(existing.totalRevenue) : null),
      totalExpenses: pick(dto.totalExpenses, existing ? dec(existing.totalExpenses) : null),
      notes: pick(dto.notes, existing?.notes ?? null),
      updatedByUserId: userId,
      ...(nextLines !== undefined ? { lines: nextLines } : {}),
    }

    const row = await this.prisma.periodBudget.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
      create: { schoolId, fiscalPeriodId: period.id, ...data },
      update: data,
    })

    await this.audit.write({
      schoolId,
      userId,
      action: 'budget.updated',
      targetType: 'period_budgets',
      metadata: { fiscalPeriodId: period.id },
    })

    return this.toPublic(row)
  }

  /**
   * Import a parsed budget spread. Re-maps + re-rolls SERVER-side (never trusts
   * a client rollup), OVERWRITES lines.revenue/lines.expense (keeping
   * Budget-vs-Actual working) and stores the raw annotated spread under
   * lines.spread, while PRESERVING the existing lines.methods/notes so the
   * per-line method builder is untouched. totalRevenue/totalExpenses use the
   * sheet's authoritative grand totals (else the computed rollup sum).
   */
  async upsertSpread(
    schoolId: string,
    periodId: string,
    dto: ImportBudgetSpreadDto,
    userId: string,
  ): Promise<BudgetSpreadImportResult> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const existing = await this.prisma.periodBudget.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })

    const spread = dto.spread as unknown as BudgetSpread
    const rolled = rollupSpread(spread)

    // Preserve the manual per-line method builder state AND any applied driver
    // model (so importing a spread doesn't drop the round-trippable assumptions).
    const prevLines = (existing?.lines as Record<string, unknown> | null) ?? {}
    const methods = prevLines.methods
    const driverModel = prevLines.driverModel

    const lines: Record<string, unknown> = {
      ...(methods !== undefined ? { methods } : {}),
      ...(driverModel !== undefined ? { driverModel } : {}),
      revenue: rolled.revenue,
      expense: rolled.expense,
      spread: {
        format: spread.format,
        fileName: dto.fileName ?? null,
        importedAt: new Date().toISOString(),
        fiscalYearStart: spread.fiscalYearStart ?? null,
        monthKeys: spread.monthKeys,
        monthLabels: (spread as { monthLabels?: string[] }).monthLabels ?? [],
        accounts: rolled.accounts,
        unmappedAccts: rolled.unmappedAccts,
        reconciliation: rolled.reconciliation,
      },
    }

    const data = {
      totalRevenue: rolled.totalRevenue,
      totalExpenses: rolled.totalExpenses,
      notes: existing?.notes ?? null,
      updatedByUserId: userId,
      lines: lines as Prisma.InputJsonValue,
    }

    const row = await this.prisma.periodBudget.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
      create: { schoolId, fiscalPeriodId: period.id, ...data },
      update: data,
    })

    await this.audit.write({
      schoolId,
      userId,
      action: 'budget.spread.imported',
      targetType: 'period_budgets',
      metadata: {
        fiscalPeriodId: period.id,
        fileName: dto.fileName ?? null,
        format: spread.format,
        accountCount: rolled.accounts.length,
        unmappedCount: rolled.unmappedAccts.length,
        revenueDelta: rolled.reconciliation.revenueDelta,
        expenseDelta: rolled.reconciliation.expenseDelta,
      },
    })

    return {
      ...this.toPublic(row),
      reconciliation: rolled.reconciliation,
      accountCount: rolled.accounts.length,
      unmappedAccts: rolled.unmappedAccts,
    }
  }

  /**
   * Apply a Phase-2 DRIVER MODEL. Recomputes the category budget AUTHORITATIVELY
   * server-side via the pure computeDriverBudget (never trusts a client preview),
   * folding prior-year actuals (budgetContext) into the auto-grown non-driver
   * lines. OVERWRITES lines.revenue/lines.expense (so Budget-vs-Actual + Diocese
   * Roll-up read the driver numbers) and writes lines.spread (format:'driver',
   * 12 even months) so the Monthly Spread grid populates — while PRESERVING the
   * manual lines.methods builder state. Stores lines.driverModel (the assumptions
   * + computedAt + kpis) for round-tripping the form.
   */
  async upsertDriver(
    schoolId: string,
    periodId: string,
    dto: SaveDriverBudgetDto,
    userId: string,
  ): Promise<DriverBudgetResultPublic> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)

    // Authoritative prior-actuals context (tenant-isolated; same path the builder uses).
    const ctx = await this.analytics.budgetContext(schoolId, periodId)
    const result = computeDriverBudget(
      dto.assumptions as unknown as Parameters<typeof computeDriverBudget>[0],
      toDriverPriorContext(ctx),
      { includeMonths: true },
    )

    const existing = await this.prisma.periodBudget.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })
    const prevLines = (existing?.lines as Record<string, unknown> | null) ?? {}
    const methods = prevLines.methods

    const fiscalYearStart = deriveFiscalYearStart(ctx.periodEndDate)
    const spread = buildDriverSpread(result, fiscalYearStart)

    const lines: Record<string, unknown> = {
      ...(methods !== undefined ? { methods } : {}),
      revenue: result.revenue,
      expense: result.expense,
      spread,
      driverModel: {
        assumptions: dto.assumptions,
        computedAt: new Date().toISOString(),
        kpis: result.kpis,
      },
    }

    const data = {
      totalRevenue: result.kpis.totalRevenue,
      totalExpenses: result.kpis.totalExpense,
      notes: existing?.notes ?? null,
      updatedByUserId: userId,
      lines: lines as Prisma.InputJsonValue,
    }

    const row = await this.prisma.periodBudget.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
      create: { schoolId, fiscalPeriodId: period.id, ...data },
      update: data,
    })

    await this.audit.write({
      schoolId,
      userId,
      action: 'budget.driver.applied',
      targetType: 'period_budgets',
      metadata: {
        fiscalPeriodId: period.id,
        enrollmentTotal: result.kpis.enrollmentTotal,
        totalRevenue: result.kpis.totalRevenue,
        totalExpense: result.kpis.totalExpense,
      },
    })

    return { ...this.toPublic(row), kpis: result.kpis }
  }
}

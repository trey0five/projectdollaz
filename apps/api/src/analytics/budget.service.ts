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

    // Only touch `lines` when provided; null clears it (Json column → JsonNull).
    const data = {
      totalRevenue: pick(dto.totalRevenue, existing ? dec(existing.totalRevenue) : null),
      totalExpenses: pick(dto.totalExpenses, existing ? dec(existing.totalExpenses) : null),
      notes: pick(dto.notes, existing?.notes ?? null),
      updatedByUserId: userId,
      ...(dto.lines !== undefined
        ? { lines: dto.lines === null ? Prisma.JsonNull : (dto.lines as Prisma.InputJsonValue) }
        : {}),
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

    // Preserve the manual per-line method builder state if present.
    const prevLines = (existing?.lines as Record<string, unknown> | null) ?? {}
    const methods = prevLines.methods

    const lines: Record<string, unknown> = {
      ...(methods !== undefined ? { methods } : {}),
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
}

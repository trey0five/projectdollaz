import { Injectable } from '@nestjs/common'
import { Prisma } from '@finrep/db'
import type { PeriodBudget } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { UpsertBudgetDto } from './dto/upsert-budget.dto.js'

export interface BudgetPublic {
  totalRevenue: number | null
  totalExpenses: number | null
  notes: string | null
  lines: Record<string, unknown> | null
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
}

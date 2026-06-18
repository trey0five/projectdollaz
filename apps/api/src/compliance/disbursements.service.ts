import { Injectable } from '@nestjs/common'
import type { Prisma, ScholarshipDisbursement } from '@finrep/db'
import type { Disbursement, ScholarshipProgram } from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { DisbursementRowDto } from './dto/replace-disbursements.dto.js'

const VALID_PROGRAMS: ScholarshipProgram[] = ['FTC', 'FES_EO', 'FES_UA']

/** JSON-safe public shape (Decimal -> number, Date -> yyyy-mm-dd). */
export interface DisbursementPublic {
  id: string
  studentRef: string | null
  program: ScholarshipProgram | null
  payDate: string | null
  amount: number
  term: string | null
  batchRef: string | null
  source: string
}

function dec(v: Prisma.Decimal): number {
  return Number(v)
}

/** A @db.Date round-trips through Date; surface it as yyyy-mm-dd. */
function dateStr(v: Date | null): string | null {
  return v ? v.toISOString().slice(0, 10) : null
}

@Injectable()
export class DisbursementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly audit: AuditService,
  ) {}

  private toPublic(row: ScholarshipDisbursement): DisbursementPublic {
    return {
      id: row.id,
      studentRef: row.studentRef,
      program: VALID_PROGRAMS.includes(row.program as ScholarshipProgram)
        ? (row.program as ScholarshipProgram)
        : null,
      payDate: dateStr(row.payDate),
      amount: dec(row.amount),
      term: row.term,
      batchRef: row.batchRef,
      source: row.source,
    }
  }

  /** The reconciliation engine's pure input shape (Decimal -> number, Date -> ISO). */
  toReconcileRow(row: ScholarshipDisbursement): Disbursement {
    return {
      studentRef: row.studentRef,
      program: VALID_PROGRAMS.includes(row.program as ScholarshipProgram)
        ? (row.program as ScholarshipProgram)
        : null,
      payDate: dateStr(row.payDate),
      amount: dec(row.amount),
      term: row.term,
      batchRef: row.batchRef,
    }
  }

  /** Tenant-checked list of a period's disbursements (newest createdAt last for stability). */
  async list(schoolId: string, periodId: string): Promise<DisbursementPublic[]> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const rows = await this.prisma.scholarshipDisbursement.findMany({
      where: { schoolId, fiscalPeriodId: period.id },
      orderBy: [{ payDate: 'asc' }, { createdAt: 'asc' }],
    })
    return rows.map((r) => this.toPublic(r))
  }

  /** Tenant-checked raw rows for the reconciliation service (no public mapping). */
  async rawRows(schoolId: string, fiscalPeriodId: string): Promise<ScholarshipDisbursement[]> {
    return this.prisma.scholarshipDisbursement.findMany({
      where: { schoolId, fiscalPeriodId },
      orderBy: [{ payDate: 'asc' }, { createdAt: 'asc' }],
    })
  }

  /**
   * REPLACE the period's whole set (clear-and-reimport semantics) in one
   * transaction. `source` defaults to 'upload'; a single manual row can also be
   * posted this way. Audited as 'disbursements.replaced' with the count.
   */
  async replace(
    schoolId: string,
    periodId: string,
    rows: DisbursementRowDto[],
    userId: string,
    source: 'upload' | 'manual' = 'upload',
  ): Promise<DisbursementPublic[]> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)

    const data: Prisma.ScholarshipDisbursementCreateManyInput[] = rows.map((r) => ({
      schoolId,
      fiscalPeriodId: period.id,
      studentRef: r.studentRef ?? null,
      program: r.program ?? null,
      payDate: r.payDate ? new Date(`${r.payDate}T00:00:00.000Z`) : null,
      amount: r.amount,
      term: r.term ?? null,
      batchRef: r.batchRef ?? null,
      source,
    }))

    await this.prisma.$transaction([
      this.prisma.scholarshipDisbursement.deleteMany({
        where: { schoolId, fiscalPeriodId: period.id },
      }),
      ...(data.length > 0
        ? [this.prisma.scholarshipDisbursement.createMany({ data })]
        : []),
    ])

    await this.audit.write({
      schoolId,
      userId,
      action: 'disbursements.replaced',
      targetType: 'scholarship_disbursements',
      targetId: period.id,
      metadata: { fiscalPeriodId: period.id, count: data.length, source },
    })

    return this.list(schoolId, period.id)
  }

  /** Clear the whole set. Audited as 'disbursements.cleared'. */
  async clear(schoolId: string, periodId: string, userId: string): Promise<{ deleted: number }> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const res = await this.prisma.scholarshipDisbursement.deleteMany({
      where: { schoolId, fiscalPeriodId: period.id },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'disbursements.cleared',
      targetType: 'scholarship_disbursements',
      targetId: period.id,
      metadata: { fiscalPeriodId: period.id, deleted: res.count },
    })
    return { deleted: res.count }
  }
}

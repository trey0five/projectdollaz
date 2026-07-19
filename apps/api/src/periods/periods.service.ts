import { Injectable, NotFoundException } from '@nestjs/common'
import type { FiscalPeriod } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'

export interface PeriodPublic {
  id: string
  schoolId: string
  label: string
  periodEndDate: string
  periodType: string
  createdAt: string
}

export interface PeriodWithCoverage extends PeriodPublic {
  /** Active import role coverage for this period (latest import per role). */
  roles: { cy: boolean; py: boolean; audit: boolean }
  hasSnapshot: boolean
  latestSnapshotId: string | null
}

@Injectable()
export class PeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  private toPublic(p: FiscalPeriod): PeriodPublic {
    return {
      id: p.id,
      schoolId: p.schoolId,
      label: p.label,
      // @db.Date — surfaced as a YYYY-MM-DD string for the client.
      periodEndDate: p.periodEndDate.toISOString().slice(0, 10),
      periodType: p.periodType,
      createdAt: p.createdAt.toISOString(),
    }
  }

  private deriveLabel(periodEndDate: Date, periodType: string): string {
    const year = periodEndDate.getUTCFullYear()
    return periodType === 'fy' || periodType === 'annual'
      ? `FY ${year}`
      : `${periodType.toUpperCase()} ${year}`
  }

  /**
   * Create-or-get a period for a school by its natural key
   * (schoolId + periodEndDate + periodType). Idempotent. Runs the find+create in
   * a transaction; on the rare concurrent-insert race it re-reads (no DB-level
   * unique exists on the natural key, so we tolerate it at the app layer).
   */
  async createOrGet(
    schoolId: string,
    input: { periodEndDate: string; periodType: string; label?: string },
  ): Promise<{ period: FiscalPeriod; created: boolean }> {
    const periodEndDate = new Date(input.periodEndDate)
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.fiscalPeriod.findFirst({
        where: { schoolId, periodEndDate, periodType: input.periodType },
      })
      if (existing) return { period: existing, created: false }
      const created = await tx.fiscalPeriod.create({
        data: {
          schoolId,
          periodEndDate,
          periodType: input.periodType,
          label: input.label?.trim() || this.deriveLabel(periodEndDate, input.periodType),
        },
      })
      return { period: created, created: true }
    })
    return result
  }

  /**
   * Resolve the period to IMPORT INTO for a given end-date — REUSING the school's
   * existing fiscal-year period regardless of its (historically inconsistent)
   * periodType ('fy' / 'fye' / 'fiscal_year' / …). A school has ONE fiscal year per
   * end-date, so keying create-or-get on periodType (as createOrGet does) spawns a
   * DUPLICATE period the user can't see when a caller passes a different type string
   * than the one already on file. Prefers the period that already carries statement
   * snapshots (the canonical one the user works in), else the oldest. Only creates a
   * new period when NONE exists at that end-date (using fallbackType).
   */
  async resolveForImport(
    schoolId: string,
    periodEndDate: string,
    fallbackType = 'fy',
    label?: string,
  ): Promise<{ period: FiscalPeriod; created: boolean }> {
    const chosen = await this.resolveExistingForImport(schoolId, periodEndDate)
    if (chosen) return { period: chosen, created: false }
    return this.createOrGet(schoolId, { periodEndDate, periodType: fallbackType, label })
  }

  /**
   * The period `resolveForImport` WOULD reuse for this end date — but read-only (never
   * creates). Same end-date lookup + snapshot-bearing tie-break, so a supersede PREVIEW
   * hint can target exactly the period a later apply() will. Null when none exists yet.
   */
  async resolveExistingForImport(schoolId: string, periodEndDate: string): Promise<FiscalPeriod | null> {
    const end = new Date(periodEndDate)
    const existing = await this.prisma.fiscalPeriod.findMany({
      where: { schoolId, periodEndDate: end },
      orderBy: { createdAt: 'asc' },
    })
    if (existing.length === 0) return null
    const withSnap = await this.prisma.statementSnapshot.findFirst({
      where: { fiscalPeriodId: { in: existing.map((p) => p.id) } },
      select: { fiscalPeriodId: true },
    })
    return (withSnap && existing.find((p) => p.id === withSnap.fiscalPeriodId)) || existing[0]!
  }

  async createOrGetPublic(
    schoolId: string,
    input: { periodEndDate: string; periodType: string; label?: string },
  ): Promise<PeriodPublic> {
    const { period } = await this.createOrGet(schoolId, input)
    return this.toPublic(period)
  }

  /** Tenant-checked fetch of a single period (404 if it isn't this school's). */
  async getOwnedPeriod(schoolId: string, periodId: string): Promise<FiscalPeriod> {
    const period = await this.prisma.fiscalPeriod.findUnique({ where: { id: periodId } })
    if (!period || period.schoolId !== schoolId) {
      throw new NotFoundException('Fiscal period not found.')
    }
    return period
  }

  /** List periods newest-first, annotated with import-role + snapshot coverage. */
  async listPeriods(schoolId: string): Promise<PeriodWithCoverage[]> {
    const periods = await this.prisma.fiscalPeriod.findMany({
      where: { schoolId },
      orderBy: [{ periodEndDate: 'desc' }, { createdAt: 'desc' }],
    })
    if (periods.length === 0) return []

    const ids = periods.map((p) => p.id)
    const [imports, snapshots] = await Promise.all([
      this.prisma.import.findMany({
        where: { fiscalPeriodId: { in: ids } },
        select: { fiscalPeriodId: true, role: true },
      }),
      this.prisma.statementSnapshot.findMany({
        where: { fiscalPeriodId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, fiscalPeriodId: true },
      }),
    ])

    const rolesByPeriod = new Map<string, { cy: boolean; py: boolean; audit: boolean }>()
    for (const id of ids) rolesByPeriod.set(id, { cy: false, py: false, audit: false })
    for (const imp of imports) {
      const r = rolesByPeriod.get(imp.fiscalPeriodId)
      if (r) r[imp.role] = true
    }
    const latestSnapByPeriod = new Map<string, string>()
    for (const s of snapshots) {
      if (!latestSnapByPeriod.has(s.fiscalPeriodId)) {
        latestSnapByPeriod.set(s.fiscalPeriodId, s.id)
      }
    }

    return periods.map((p) => ({
      ...this.toPublic(p),
      roles: rolesByPeriod.get(p.id) ?? { cy: false, py: false, audit: false },
      hasSnapshot: latestSnapByPeriod.has(p.id),
      latestSnapshotId: latestSnapByPeriod.get(p.id) ?? null,
    }))
  }
}

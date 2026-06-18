import { Injectable, NotFoundException } from '@nestjs/common'
import type { Import, ImportRole, Prisma, User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import type { CreateImportDto } from './dto/create-import.dto.js'

export interface ImportPublic {
  id: string
  schoolId: string
  fiscalPeriodId: string
  role: ImportRole
  sourceName: string
  rows: unknown
  metadata: unknown
  rowCount: number
  uploadedBy: string | null
  createdAt: string
}

export interface ImportSummary {
  id: string
  role: ImportRole
  sourceName: string
  rowCount: number
  uploadedBy: string | null
  createdAt: string
  /** True for the latest import of its role within the period (the active one). */
  active: boolean
}

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly periods: PeriodsService,
  ) {}

  private toPublic(imp: Import): ImportPublic {
    return {
      id: imp.id,
      schoolId: imp.schoolId,
      fiscalPeriodId: imp.fiscalPeriodId,
      role: imp.role,
      sourceName: imp.sourceName,
      rows: imp.rows,
      metadata: imp.metadata ?? null,
      rowCount: imp.rowCount,
      uploadedBy: imp.uploadedBy,
      createdAt: imp.createdAt.toISOString(),
    }
  }

  /** Store an immutable import; create-or-get the period; audit; return it. */
  async create(actor: User, schoolId: string, dto: CreateImportDto): Promise<ImportPublic> {
    const { period } = await this.periods.createOrGet(schoolId, {
      periodEndDate: dto.periodEndDate,
      periodType: dto.periodType,
      label: dto.label,
    })

    const imp = await this.prisma.import.create({
      data: {
        schoolId,
        fiscalPeriodId: period.id,
        role: dto.role,
        sourceName: dto.sourceName,
        rows: dto.rows as unknown as Prisma.InputJsonValue,
        metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        rowCount: dto.rows.length,
        uploadedBy: actor.id,
      },
    })

    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'import.saved',
      targetType: 'import',
      targetId: imp.id,
      metadata: {
        role: imp.role,
        periodId: period.id,
        rowCount: imp.rowCount,
        sourceName: imp.sourceName,
      },
    })

    return this.toPublic(imp)
  }

  /** List imports for a period (newest-first), with an `active` flag per role. */
  async listForPeriod(schoolId: string, periodId: string): Promise<ImportSummary[]> {
    await this.periods.getOwnedPeriod(schoolId, periodId)
    const imports = await this.prisma.import.findMany({
      where: { schoolId, fiscalPeriodId: periodId },
      orderBy: { createdAt: 'desc' },
    })
    const seen = new Set<ImportRole>()
    return imports.map((imp) => {
      const active = !seen.has(imp.role)
      if (active) seen.add(imp.role)
      return {
        id: imp.id,
        role: imp.role,
        sourceName: imp.sourceName,
        rowCount: imp.rowCount,
        uploadedBy: imp.uploadedBy,
        createdAt: imp.createdAt.toISOString(),
        active,
      }
    })
  }

  /** Fetch a single import (full rows), tenant-checked against schoolId. */
  async getOne(schoolId: string, importId: string): Promise<ImportPublic> {
    const imp = await this.prisma.import.findUnique({ where: { id: importId } })
    if (!imp || imp.schoolId !== schoolId) {
      throw new NotFoundException('Import not found.')
    }
    return this.toPublic(imp)
  }
}

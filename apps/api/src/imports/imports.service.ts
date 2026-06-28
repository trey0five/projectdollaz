import { Injectable, NotFoundException } from '@nestjs/common'
import type { Import, ImportRole, Prisma, User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { StatementsService } from '../statements/statements.service.js'
import type { CreateImportDto } from './dto/create-import.dto.js'

export interface DeleteImportResult {
  /** The clicked import id (the active version of the removed role slot). */
  deleted: string
  /** The role slot that was removed ('cy' | 'py' | 'audit'). */
  role: ImportRole
  /** How many stored imports were removed (the whole re-upload stack for the role). */
  removed: number
  /** The period the deleted import belonged to. */
  periodId: string
  /**
   * What happened to the period's statements after the delete:
   *  - 'regenerated': a CY import still exists → snapshot rebuilt without the removed file.
   *  - 'cleared': no CY remains → the period's snapshots were dropped (no statements).
   *  - 'unchanged': regeneration was attempted but failed; the prior snapshot is kept.
   */
  snapshot: 'regenerated' | 'cleared' | 'unchanged'
}

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
    private readonly statements: StatementsService,
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

  /**
   * Delete a trial balance the user wants to remove, then reconcile the period's
   * statements so the system reflects the deletion everywhere (statements,
   * analytics, budget actuals — all read the snapshot).
   *
   * Imports are append-only: re-uploading the same (period, role) STACKS a new
   * version on top, the newest being active. A single user-facing card therefore
   * represents the whole stack, so "delete the trial balance" removes the ENTIRE
   * (period, role) slot — every superseded version — not just the clicked one.
   * Deleting only the active version would let the previous upload resurface and
   * the trial balance would appear to "come back".
   *
   * Then:
   *  - If a CY import still exists for the period (e.g. a PY/Audited slot was the
   *    one removed) → re-run the canonical generate (rebuilds WITHOUT the removed
   *    comparative).
   *  - If no CY remains → drop the period's snapshots (the period reverts to "no
   *    statements yet"; the period row is left intact so a re-upload create-or-gets
   *    the same period).
   * owner/accountant only (enforced at the controller). Tenant + ownership checked.
   */
  async remove(actor: User, schoolId: string, importId: string): Promise<DeleteImportResult> {
    const imp = await this.prisma.import.findUnique({ where: { id: importId } })
    if (!imp || imp.schoolId !== schoolId) {
      throw new NotFoundException('Import not found.')
    }
    const periodId = imp.fiscalPeriodId
    const role = imp.role
    // Ownership/tenant check on the owning period (throws if not this school's).
    await this.periods.getOwnedPeriod(schoolId, periodId)

    // Remove the ENTIRE role slot for this period (the active version + every
    // superseded re-upload) so nothing resurfaces.
    const { count: removed } = await this.prisma.import.deleteMany({
      where: { schoolId, fiscalPeriodId: periodId, role },
    })

    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'import.deleted',
      targetType: 'import',
      targetId: importId,
      metadata: {
        role,
        periodId,
        removed,
        rowCount: imp.rowCount,
        sourceName: imp.sourceName,
      },
    })

    // Reconcile the period snapshot against the remaining imports.
    const cyRemaining = await this.prisma.import.count({
      where: { schoolId, fiscalPeriodId: periodId, role: 'cy' as ImportRole },
    })

    if (cyRemaining > 0) {
      try {
        await this.statements.generate(actor, schoolId, periodId, {})
        return { deleted: importId, role, removed, periodId, snapshot: 'regenerated' }
      } catch {
        // A regeneration failure must not fail the delete — the imports are already
        // gone; leave the prior snapshot in place rather than half-deleting.
        return { deleted: importId, role, removed, periodId, snapshot: 'unchanged' }
      }
    }

    await this.prisma.statementSnapshot.deleteMany({
      where: { schoolId, fiscalPeriodId: periodId },
    })
    return { deleted: importId, role, removed, periodId, snapshot: 'cleared' }
  }
}

import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import type { Import, ImportRole, Prisma, User } from '@finrep/db'
import { buildIntakeMemory, type IntakeMemory } from '@finrep/ingestion'
import { PrismaService } from '../prisma/prisma.service.js'
import { clearPeriodInsights } from '../analytics/insight-cache.js'
import { AuditService } from '../common/audit/audit.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { MappingService } from '../mapping/mapping.service.js'
import { statementAutoMapping } from './statement-auto-map.js'
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

/** Where an import's rows came from (drives the drill-down "Source" badge). */
export type ImportSourceType = 'quickbooks' | 'upload' | 'unknown'

export interface ImportSummary {
  id: string
  role: ImportRole
  sourceName: string
  /** Provenance of the rows: a QBO sync, an uploaded file, or unknown (legacy). */
  sourceType: ImportSourceType
  rowCount: number
  uploadedBy: string | null
  createdAt: string
  /** True for the latest import of its role within the period (the active one). */
  active: boolean
}

/**
 * How many of a school's newest imports feed its intake memory. Memory is
 * DERIVED from Import.metadata (no table, no migration): the column layouts a
 * person picked (metadata.layout) and the numbers KYRO gave unnumbered P&L
 * accounts (metadata.statement.synthesized). 400 covers years of monthly
 * re-uploads; buildIntakeMemory caps the output (20 layouts, 2000 pins).
 */
export const INTAKE_MEMORY_SCAN = 400

/** Read an import's stored metadata.source into the public sourceType enum. */
function readSourceType(metadata: unknown): ImportSourceType {
  const source =
    metadata && typeof metadata === 'object'
      ? (metadata as { source?: unknown }).source
      : undefined
  if (source === 'quickbooks') return 'quickbooks'
  if (source === 'upload') return 'upload'
  return 'unknown'
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly periods: PeriodsService,
    private readonly statements: StatementsService,
    // A1 — statement accounts sort themselves. Appended LAST and @Optional so
    // positional-arg unit specs (which stop at statements) still construct; with
    // no MappingService the auto-sort is simply skipped.
    @Optional() private readonly mapping?: MappingService,
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

  /** Store an immutable import; REUSE-or-create the period by end-date; audit; return it. */
  async create(actor: User, schoolId: string, dto: CreateImportDto): Promise<ImportPublic> {
    // Reuse the school's existing fiscal-year period for this end-date (whatever its
    // periodType string) rather than keying create-or-get on periodType — otherwise a
    // caller passing a different type ('fiscal_year' vs the on-file 'fy') mints a
    // DUPLICATE period the user can't see.
    const { period } = await this.periods.resolveForImport(
      schoolId,
      dto.periodEndDate,
      dto.periodType,
      dto.label,
    )

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

    await this.autoSortStatementAccounts(schoolId, dto.rows, dto.metadata)

    return this.toPublic(imp)
  }

  /**
   * A1 — a QuickBooks statement export knows each account's report section, so
   * the accounts this school's mapping doesn't know yet are merged with their
   * SURE section-backed category before anything generates statements (the
   * intake, and a KYRO-chat import that has no review step). Unclear accounts
   * stay for the review step; a plain trial balance (no section facts) is never
   * touched; an account the mapping already knows is never re-pointed.
   * Best-effort: a failure here never fails the import — the accounts simply
   * stay "to review" as before.
   */
  private async autoSortStatementAccounts(
    schoolId: string,
    rows: CreateImportDto['rows'],
    metadata: unknown,
  ): Promise<void> {
    if (!this.mapping) return
    try {
      if (!metadata || typeof metadata !== 'object') return
      const st = (metadata as { statement?: { sections?: unknown } }).statement
      if (!st || typeof st !== 'object' || !st.sections) return
      const { chart } = await this.mapping.ensureActive(schoolId)
      const patch = statementAutoMapping(
        rows,
        metadata,
        chart.mapping.entries as unknown as Record<string, unknown>,
      )
      if (Object.keys(patch).length === 0) return
      // Fill-only: the patch was computed from a READ of the mapping; a manual
      // pick landing between that read and this write must not be overwritten.
      await this.mapping.mergeEntries(schoolId, patch, { onlyNew: true })
    } catch (err) {
      this.logger.warn(
        `statement auto-sort skipped: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
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
        sourceType: readSourceType(imp.metadata),
        rowCount: imp.rowCount,
        uploadedBy: imp.uploadedBy,
        createdAt: imp.createdAt.toISOString(),
        active,
      }
    })
  }

  /**
   * The school's intake memory (#32 remembered column layouts + #41 S-B(b)
   * pinned synthetic account numbers), derived from its stored imports' metadata,
   * newest first. Selects ONLY metadata (never rows). buildIntakeMemory is pure
   * and defensive — metadata is client-written JSON — and skips QuickBooks-sync
   * imports. Tenant scope = the RolesGuard on :schoolId plus the where clause.
   */
  async intakeMemory(schoolId: string): Promise<IntakeMemory> {
    const rows = await this.prisma.import.findMany({
      where: { schoolId },
      select: { metadata: true },
      orderBy: { createdAt: 'desc' },
      take: INTAKE_MEMORY_SCAN,
    })
    return buildIntakeMemory(rows.map((r) => r.metadata))
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
    const owned = await this.periods.getOwnedPeriod(schoolId, periodId)

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
    // No statements left → no insight about them either (and later periods'
    // deltas no longer have this year to compare against).
    await clearPeriodInsights(this.prisma, schoolId, periodId, owned?.periodEndDate ?? null)
    return { deleted: importId, role, removed, periodId, snapshot: 'cleared' }
  }
}

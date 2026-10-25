import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import type { DataRemoval, FiscalPeriod, ImportRole, Prisma, User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { StatementsService } from '../statements/statements.service.js'
import { clearPeriodInsights } from '../analytics/insight-cache.js'
import type { SnapshotTrigger } from '../statements/snapshot-trigger.js'
import {
  RESTORE_DAYS,
  budgetHasForecast,
  budgetHoldsWork,
  budgetKind,
  expiresFrom,
  halfOf,
  isBudgetPresent,
  personName,
  readSourceType,
  shortLabelFor,
  toPerson,
  ymd,
  type Person,
  type RemovalKind,
} from './finance-files.constants.js'
import {
  budgetConflict,
  monthsConflict,
  periodFields,
  tbConflict,
  toRemovedEntry,
  type ChangeEffects,
  type PeriodRef,
  type PreviewFile,
  type RemovalPreview,
  type RemovalResult,
  type RemovalSummary,
  type RestoreResult,
  type Role,
} from './finance-files.types.js'
import {
  changedPeriods,
  comparativeSources,
  sourceFor,
  toResolverPeriods,
  withoutSlot,
  type ChangedComparison,
  type ImportLite,
} from './removal-impact.js'
import { CHANGED_MESSAGE, lockPeriod, moveToBin, restoreFromBin } from './removal-bin.js'
import type { CreateRemovalDto, RemovalTargetDto, RestoreRemovalDto } from './dto/removal.dto.js'

const TX_OPTIONS = { timeout: 60_000 }

const MSG = {
  noImport: 'Say which trial balance to remove.',
  noMonths: 'Say which months to remove.',
  noBudget: "Say which year's budget to remove.",
  importGone: "That trial balance isn't on file anymore.",
  nothing: "There's nothing on file to remove for that year.",
  removalGone: 'This was already put back or is no longer kept.',
  expired: `That was removed more than ${RESTORE_DAYS} days ago, so it can't be brought back.`,
  restoreFailed: "We couldn't bring this back. Nothing was changed.",
} as const

type PeriodRow = Pick<FiscalPeriod, 'id' | 'label' | 'periodEndDate' | 'periodType'>

interface StackRow {
  id: string
  sourceName: string
  createdAt: Date
  metadata: unknown
}

interface MonthRow {
  id: string
  monthKey: string
  sourceName: string
  updatedAt: Date
}

interface LiteState {
  periods: PeriodRow[]
  imports: ImportLite[]
}

function importGone(): NotFoundException {
  return new NotFoundException({ code: 'IMPORT_NOT_FOUND', message: MSG.importGone })
}
function nothingToRemove(): NotFoundException {
  return new NotFoundException({ code: 'NOTHING_TO_REMOVE', message: MSG.nothing })
}
function removalGone(): NotFoundException {
  return new NotFoundException({ code: 'REMOVAL_NOT_FOUND', message: MSG.removalGone })
}

function previewFiles(stack: StackRow[]): PreviewFile[] {
  return stack.map((f, i) => ({
    importId: f.id,
    sourceName: f.sourceName,
    uploadedAt: f.createdAt.toISOString(),
    half: halfOf(f.metadata),
    source: readSourceType(f.metadata),
    active: i === 0,
  }))
}

function actorPerson(actor: User): Person | null {
  const name = personName(actor)
  return actor?.id && name ? { id: actor.id, name } : null
}

/**
 * Remove finance data restorably, and put it back. Every removal moves the rows
 * into the data_removals bin (same ids, same createdAt) under a per-period
 * advisory lock, then reconciles statements: the period itself, and every LATER
 * year whose prior-year / audited comparison came from what was removed.
 *
 * The comparative impact is computed with the real resolver, so the popup's
 * "FY26 loses its prior-year comparison" is exactly what generate() then does.
 */
@Injectable()
export class FinanceRemovalsService {
  private readonly logger = new Logger(FinanceRemovalsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly periods: PeriodsService,
    private readonly statements: StatementsService,
  ) {}

  // ── Shared reads ───────────────────────────────────────────────────────────

  private validateTarget(target: RemovalTargetDto): void {
    if (target.kind === 'trial_balance' && !target.importId) {
      throw new BadRequestException({ code: 'BAD_TARGET', message: MSG.noImport })
    }
    if (target.kind === 'monthly' && (!target.periodId || !target.monthKeys?.length)) {
      throw new BadRequestException({ code: 'BAD_TARGET', message: MSG.noMonths })
    }
    if (target.kind === 'budget' && !target.periodId) {
      throw new BadRequestException({ code: 'BAD_TARGET', message: MSG.noBudget })
    }
  }

  /** Every period + every import's (id, period, role, createdAt) — never rows. */
  private async loadLite(schoolId: string): Promise<LiteState> {
    const [periods, imports] = await Promise.all([
      this.prisma.fiscalPeriod.findMany({
        where: { schoolId },
        select: { id: true, label: true, periodEndDate: true, periodType: true },
      }),
      this.prisma.import.findMany({
        where: { schoolId },
        select: { id: true, fiscalPeriodId: true, role: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ])
    return { periods, imports }
  }

  private sources(lite: LiteState, imports: ImportLite[] = lite.imports) {
    return comparativeSources(toResolverPeriods(lite.periods, imports))
  }

  private ref(lite: LiteState, periodId: string | null): PeriodRef | null {
    if (!periodId) return null
    const p = lite.periods.find((x) => x.id === periodId)
    return p ? { periodId, shortLabel: shortLabelFor(p) } : null
  }

  private endOf(lite: LiteState, periodId: string): number {
    return lite.periods.find((x) => x.id === periodId)?.periodEndDate.getTime() ?? 0
  }

  /** Changed comparisons, periodEndDate ASC (one entry per changed comparison). */
  private sortChanged(lite: LiteState, changed: ChangedComparison[]): ChangedComparison[] {
    return [...changed].sort((a, b) => this.endOf(lite, a.periodId) - this.endOf(lite, b.periodId))
  }

  private async loadTarget(schoolId: string, importId: string) {
    const target = await this.prisma.import.findUnique({
      where: { id: importId },
      select: { id: true, schoolId: true, fiscalPeriodId: true, role: true },
    })
    if (!target || target.schoolId !== schoolId) throw importGone()
    return target
  }

  private readStack(
    client: Prisma.TransactionClient | PrismaService,
    schoolId: string,
    periodId: string,
    role: ImportRole | string,
  ): Promise<StackRow[]> {
    return client.import.findMany({
      where: { schoolId, fiscalPeriodId: periodId, role: role as ImportRole },
      orderBy: { createdAt: 'desc' },
      select: { id: true, sourceName: true, createdAt: true, metadata: true },
    })
  }

  private async readPresentBudget(client: Prisma.TransactionClient | PrismaService, schoolId: string, periodId: string) {
    const row = await client.periodBudget.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: periodId } },
    })
    return { row, present: isBudgetPresent(row) }
  }

  private summaryFor(
    period: PeriodRow,
    extra: Partial<Pick<RemovalSummary, 'files' | 'snapshotCount' | 'months' | 'budget'>>,
  ): RemovalSummary {
    return {
      ...periodFields(period, shortLabelFor(period)),
      files: extra.files ?? [],
      snapshotCount: extra.snapshotCount ?? 0,
      months: extra.months ?? [],
      budget: extra.budget ?? null,
    }
  }

  // ── Preview ────────────────────────────────────────────────────────────────

  /** What a removal would take and what it affects. Changes nothing. */
  async preview(schoolId: string, target: RemovalTargetDto): Promise<RemovalPreview> {
    this.validateTarget(target)
    const noEffects: RemovalPreview['effects'] = {
      statements: 'none',
      boardReport: false,
      budgetVsActual: false,
      quickbooks: false,
      self: null,
      laterYears: [],
    }

    if (target.kind === 'trial_balance') {
      const imp = await this.loadTarget(schoolId, target.importId!)
      const period = await this.periods.getOwnedPeriod(schoolId, imp.fiscalPeriodId)
      const periodId = period.id
      const role = imp.role as Role
      const [lite, stack] = await Promise.all([
        this.loadLite(schoolId),
        this.readStack(this.prisma, schoolId, periodId, role),
      ])
      if (stack.length === 0) throw nothingToRemove()

      const remaining = withoutSlot(lite.imports, periodId, role)
      const before = this.sources(lite)
      const afterPeriods = toResolverPeriods(lite.periods, remaining)
      const after = comparativeSources(afterPeriods)
      const laterYears = this.sortChanged(lite, changedPeriods(before, after, periodId)).map((c) => ({
        periodId: c.periodId,
        shortLabel: this.ref(lite, c.periodId)?.shortLabel ?? '',
        comparison: c.comparison,
        after: this.ref(lite, c.afterFromPeriodId),
      }))

      const files = previewFiles(stack)
      const periodHasCy = lite.imports.some((i) => i.fiscalPeriodId === periodId && i.role === 'cy')
      let statements: RemovalPreview['effects']['statements'] = 'none'
      let boardReport = false
      let budgetVsActual = false
      if (role === 'cy') {
        const [snapshotCount, report, budget] = await Promise.all([
          this.prisma.statementSnapshot.count({ where: { schoolId, fiscalPeriodId: periodId } }),
          this.prisma.boardReport.findFirst({ where: { schoolId, fiscalPeriodId: periodId }, select: { id: true } }),
          this.readPresentBudget(this.prisma, schoolId, periodId),
        ])
        statements = snapshotCount > 0 ? 'emptied' : 'none'
        boardReport = !!report
        budgetVsActual = budget.present
      } else if (periodHasCy) {
        statements = 'rebuilt'
      }
      let self: RemovalPreview['effects']['self'] = null
      if (role === 'py' || role === 'audit') {
        const src = sourceFor(afterPeriods, periodId)
        self =
          role === 'py'
            ? { comparison: 'prior-year', after: this.ref(lite, src.pyFromPeriodId) }
            : { comparison: 'audited', after: this.ref(lite, src.auditFromPeriodId) }
      }

      return {
        kind: 'trial_balance',
        periodId,
        periodLabel: period.label,
        shortLabel: shortLabelFor(period),
        periodEndDate: ymd(period.periodEndDate),
        role,
        activeImportId: stack[0]!.id,
        files,
        monthKeys: [],
        monthsOnFile: 0,
        budget: null,
        effects: {
          statements,
          boardReport,
          budgetVsActual,
          quickbooks: files.some((f) => f.source === 'quickbooks'),
          self,
          laterYears,
        },
        restoreDays: RESTORE_DAYS,
      }
    }

    const period = await this.periods.getOwnedPeriod(schoolId, target.periodId!)
    const base: Omit<RemovalPreview, 'kind' | 'monthKeys' | 'monthsOnFile' | 'budget'> = {
      periodId: period.id,
      periodLabel: period.label,
      shortLabel: shortLabelFor(period),
      periodEndDate: ymd(period.periodEndDate),
      role: null,
      activeImportId: null,
      files: [],
      effects: noEffects,
      restoreDays: RESTORE_DAYS,
    }

    if (target.kind === 'monthly') {
      const all = await this.prisma.monthlySnapshot.findMany({
        where: { schoolId, fiscalPeriodId: period.id },
        select: { monthKey: true },
      })
      const wanted = new Set(target.monthKeys)
      const found = all.map((m) => m.monthKey).filter((k) => wanted.has(k)).sort()
      if (found.length === 0) throw nothingToRemove()
      return { ...base, kind: 'monthly', monthKeys: found, monthsOnFile: all.length, budget: null }
    }

    const { row, present } = await this.readPresentBudget(this.prisma, schoolId, period.id)
    if (!row || !present) throw nothingToRemove()
    return {
      ...base,
      kind: 'budget',
      monthKeys: [],
      monthsOnFile: 0,
      budget: { kind: budgetKind(row.lines), hasForecast: budgetHasForecast(row.lines) },
    }
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  async remove(actor: User, schoolId: string, dto: CreateRemovalDto): Promise<RemovalResult> {
    this.validateTarget(dto)
    if (dto.kind === 'trial_balance') {
      return this.removeTrialBalance(actor, schoolId, dto.importId!, dto.expectedImportId)
    }
    if (dto.kind === 'monthly') return this.removeMonths(actor, schoolId, dto.periodId!, dto.monthKeys!)
    return this.removeBudget(actor, schoolId, dto.periodId!)
  }

  /**
   * Remove a whole (period, role) trial balance stack — the active version and
   * every earlier upload, so nothing resurfaces — plus, for the current year,
   * the period's statement snapshots (restored with it, so value history comes
   * back too). Then rebuild the period and every later year whose comparison
   * pointed at it.
   */
  async removeTrialBalance(
    actor: User,
    schoolId: string,
    importId: string,
    expectedImportId?: string,
  ): Promise<RemovalResult> {
    const target = await this.loadTarget(schoolId, importId)
    const period = await this.periods.getOwnedPeriod(schoolId, target.fiscalPeriodId)
    const periodId = period.id
    const role = target.role as Role
    const lite = await this.loadLite(schoolId)
    const before = this.sources(lite)

    const { header, stack, snapIds } = await this.prisma.$transaction(async (tx) => {
      await lockPeriod(tx, schoolId, periodId)
      const stack = await this.readStack(tx, schoolId, periodId, role)
      if (stack.length === 0) throw nothingToRemove()
      if (expectedImportId && stack[0]!.id !== expectedImportId) {
        throw new ConflictException({
          code: 'CHANGED',
          message: CHANGED_MESSAGE,
          current: {
            importId: stack[0]!.id,
            sourceName: stack[0]!.sourceName,
            uploadedAt: stack[0]!.createdAt.toISOString(),
          },
        })
      }
      const snapIds =
        role === 'cy'
          ? (
              await tx.statementSnapshot.findMany({
                where: { schoolId, fiscalPeriodId: periodId },
                select: { id: true },
              })
            ).map((s) => s.id)
          : []
      const header = await tx.dataRemoval.create({
        data: {
          schoolId,
          fiscalPeriodId: periodId,
          kind: 'trial_balance',
          role: role as ImportRole,
          monthKeys: [],
          summary: this.summaryFor(period, { files: previewFiles(stack), snapshotCount: snapIds.length }) as unknown as Prisma.InputJsonValue,
          removedBy: actor.id,
          expiresAt: expiresFrom(),
        },
      })
      await moveToBin(tx, header.id, 'import', stack.map((s) => s.id))
      if (snapIds.length) await moveToBin(tx, header.id, 'statement_snapshot', snapIds)
      return { header, stack, snapIds }
    }, TX_OPTIONS)

    const effects = await this.reconcileAfterTb(actor, schoolId, period, lite, before, 'data_removed', true)

    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'finance_data.removed',
      targetType: 'data_removal',
      targetId: header.id,
      metadata: {
        kind: 'trial_balance',
        periodId,
        role,
        importIds: stack.map((s) => s.id),
        snapshotCount: snapIds.length,
      },
    })

    return { removal: toRemovedEntry(header, actorPerson(actor)), effects }
  }

  /**
   * After a TB stack left or came back: rebuild the period (or clear it when no
   * current year remains), then every later year whose resolved comparison
   * changed. Regeneration is best effort — it never fails the request.
   */
  private async reconcileAfterTb(
    actor: User,
    schoolId: string,
    period: PeriodRow,
    lite: LiteState,
    before: ReturnType<FinanceRemovalsService['sources']>,
    trigger: SnapshotTrigger,
    clearWhenNoCy: boolean,
  ): Promise<ChangeEffects> {
    const periodId = period.id
    const effects: ChangeEffects = { statements: 'none', rebuilt: [], failed: [] }
    const cyRemaining = await this.prisma.import.count({
      where: { schoolId, fiscalPeriodId: periodId, role: 'cy' as ImportRole },
    })
    if (cyRemaining > 0) {
      try {
        await this.statements.generate(actor, schoolId, periodId, {}, { trigger })
        effects.statements = 'rebuilt'
      } catch (err) {
        this.logger.warn(`regenerate ${periodId} after ${trigger} failed: ${String(err)}`)
        effects.statements = 'unchanged'
      }
    } else if (clearWhenNoCy) {
      await clearPeriodInsights(this.prisma, schoolId, periodId, period.periodEndDate)
      effects.statements = 'cleared'
    }

    const afterLite = await this.loadLite(schoolId)
    const after = this.sources(afterLite)
    const changed = changedPeriods(before, after, periodId)
    const seen = new Set<string>()
    for (const c of this.sortChanged(afterLite, changed)) {
      if (seen.has(c.periodId)) continue
      seen.add(c.periodId)
      const ref = this.ref(afterLite, c.periodId) ?? this.ref(lite, c.periodId) ?? { periodId: c.periodId, shortLabel: '' }
      try {
        await this.statements.generate(actor, schoolId, c.periodId, {}, { trigger })
        effects.rebuilt.push(ref)
      } catch (err) {
        this.logger.warn(`regenerate later year ${c.periodId} after ${trigger} failed: ${String(err)}`)
        effects.failed.push(ref)
      }
    }
    return effects
  }

  /** Remove some months of monthly numbers (read live — nothing to rebuild). */
  async removeMonths(actor: User, schoolId: string, periodId: string, monthKeys: string[]): Promise<RemovalResult> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const header = await this.prisma.$transaction(async (tx) => {
      await lockPeriod(tx, schoolId, periodId)
      const found: MonthRow[] = await tx.monthlySnapshot.findMany({
        where: { schoolId, fiscalPeriodId: periodId, monthKey: { in: monthKeys } },
        select: { id: true, monthKey: true, sourceName: true, updatedAt: true },
      })
      if (found.length === 0) throw nothingToRemove()
      const sorted = [...found].sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      const header = await tx.dataRemoval.create({
        data: {
          schoolId,
          fiscalPeriodId: periodId,
          kind: 'monthly',
          monthKeys: sorted.map((m) => m.monthKey),
          summary: this.summaryFor(period, {
            months: sorted.map((m) => ({
              monthKey: m.monthKey,
              sourceName: m.sourceName,
              uploadedAt: m.updatedAt.toISOString(),
            })),
          }) as unknown as Prisma.InputJsonValue,
          removedBy: actor.id,
          expiresAt: expiresFrom(),
        },
      })
      await moveToBin(tx, header.id, 'monthly_snapshot', sorted.map((m) => m.id))
      return header
    }, TX_OPTIONS)

    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'finance_data.removed',
      targetType: 'data_removal',
      targetId: header.id,
      metadata: { kind: 'monthly', periodId, monthKeys: header.monthKeys },
    })
    return {
      removal: toRemovedEntry(header, actorPerson(actor)),
      effects: { statements: 'none', rebuilt: [], failed: [] },
    }
  }

  /**
   * Remove a year's budget. The WHOLE row moves (notes, methods, driver model,
   * forecast) so a restore is exact; a missing row already reads as an empty
   * budget (BudgetService.toPublic(null)).
   */
  async removeBudget(actor: User, schoolId: string, periodId: string): Promise<RemovalResult> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const header = await this.prisma.$transaction(async (tx) => {
      await lockPeriod(tx, schoolId, periodId)
      const { row, present } = await this.readPresentBudget(tx, schoolId, periodId)
      if (!row || !present) throw nothingToRemove()
      const header = await tx.dataRemoval.create({
        data: {
          schoolId,
          fiscalPeriodId: periodId,
          kind: 'budget',
          monthKeys: [],
          summary: this.summaryFor(period, {
            budget: {
              kind: budgetKind(row.lines),
              hasForecast: budgetHasForecast(row.lines),
              updatedAt: row.updatedAt.toISOString(),
            },
          }) as unknown as Prisma.InputJsonValue,
          removedBy: actor.id,
          expiresAt: expiresFrom(),
        },
      })
      await moveToBin(tx, header.id, 'period_budget', [row.id])
      return header
    }, TX_OPTIONS)

    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'finance_data.removed',
      targetType: 'data_removal',
      targetId: header.id,
      metadata: { kind: 'budget', periodId },
    })
    return {
      removal: toRemovedEntry(header, actorPerson(actor)),
      effects: { statements: 'none', rebuilt: [], failed: [] },
    }
  }

  // ── Restore ────────────────────────────────────────────────────────────────

  /**
   * Put a removal back exactly (same ids, same createdAt). If the slot has been
   * filled since, 409 SLOT_FILLED — unless replaceCurrent, which first moves
   * the current data into its own Recently-removed entry (a swap) in the same
   * transaction.
   */
  async restore(
    actor: User,
    schoolId: string,
    removalId: string,
    dto: RestoreRemovalDto = {},
  ): Promise<RestoreResult> {
    const found = await this.prisma.dataRemoval.findFirst({ where: { id: removalId, schoolId } })
    if (!found) throw removalGone()
    if (found.expiresAt.getTime() <= Date.now()) {
      throw new GoneException({ code: 'REMOVAL_EXPIRED', message: MSG.expired })
    }
    const periodId = found.fiscalPeriodId
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const kind = found.kind as RemovalKind
    const lite = kind === 'trial_balance' ? await this.loadLite(schoolId) : null
    const before = lite ? this.sources(lite) : null

    const { header, replaced } = await this.prisma.$transaction(async (tx) => {
      await lockPeriod(tx, schoolId, periodId)
      const header = await tx.dataRemoval.findFirst({ where: { id: removalId, schoolId } })
      if (!header) throw removalGone()
      const shortLabel = shortLabelFor(period)
      const slotFilled = (current: { sourceName: string | null; uploadedAt: string | null; monthKeys: string[] }) =>
        new ConflictException({ code: 'SLOT_FILLED', message: `${shortLabel} has newer data now.`, current })

      let replaced: DataRemoval | null = null
      const swapHeader = (summary: RemovalSummary, extra: { role?: ImportRole; monthKeys?: string[] }) =>
        tx.dataRemoval.create({
          data: {
            schoolId,
            fiscalPeriodId: periodId,
            kind: header.kind,
            role: extra.role ?? null,
            monthKeys: extra.monthKeys ?? [],
            reason: 'swapped_on_restore',
            summary: summary as unknown as Prisma.InputJsonValue,
            removedBy: actor.id,
            expiresAt: expiresFrom(),
          },
        })

      if (kind === 'trial_balance') {
        const role = header.role as ImportRole
        const stack = await this.readStack(tx, schoolId, periodId, role)
        const conflict = tbConflict(stack)
        if (conflict && !dto.replaceCurrent) throw slotFilled(conflict)
        if (conflict) {
          const snapIds =
            role === 'cy'
              ? (
                  await tx.statementSnapshot.findMany({
                    where: { schoolId, fiscalPeriodId: periodId },
                    select: { id: true },
                  })
                ).map((s) => s.id)
              : []
          replaced = await swapHeader(
            this.summaryFor(period, { files: previewFiles(stack), snapshotCount: snapIds.length }),
            { role },
          )
          await moveToBin(tx, replaced.id, 'import', stack.map((s) => s.id))
          if (snapIds.length) await moveToBin(tx, replaced.id, 'statement_snapshot', snapIds)
        }
        await this.restoreRows(tx, header.id, ['import', 'statement_snapshot'])
      } else if (kind === 'monthly') {
        const existing: MonthRow[] = await tx.monthlySnapshot.findMany({
          where: { schoolId, fiscalPeriodId: periodId, monthKey: { in: header.monthKeys } },
          select: { id: true, monthKey: true, sourceName: true, updatedAt: true },
        })
        const conflict = monthsConflict(header.monthKeys, existing)
        if (conflict && !dto.replaceCurrent) throw slotFilled(conflict)
        if (conflict) {
          const sorted = [...existing].sort((a, b) => a.monthKey.localeCompare(b.monthKey))
          replaced = await swapHeader(
            this.summaryFor(period, {
              months: sorted.map((m) => ({
                monthKey: m.monthKey,
                sourceName: m.sourceName,
                uploadedAt: m.updatedAt.toISOString(),
              })),
            }),
            { monthKeys: sorted.map((m) => m.monthKey) },
          )
          await moveToBin(tx, replaced.id, 'monthly_snapshot', sorted.map((m) => m.id))
        }
        await this.restoreRows(tx, header.id, ['monthly_snapshot'])
      } else {
        const { row } = await this.readPresentBudget(tx, schoolId, periodId)
        // A row with budget numbers OR the person's own later work (a forecast
        // saved on its own, guided-setup methods, notes) fills the slot: it is
        // swapped into Recently removed, never dropped.
        const holdsWork = budgetHoldsWork(row)
        const conflict = budgetConflict(row && holdsWork ? row : null)
        if (conflict && !dto.replaceCurrent) throw slotFilled(conflict)
        if (row && holdsWork) {
          replaced = await swapHeader(
            this.summaryFor(period, {
              budget: {
                kind: budgetKind(row.lines),
                hasForecast: budgetHasForecast(row.lines),
                updatedAt: row.updatedAt.toISOString(),
              },
            }),
            {},
          )
          await moveToBin(tx, replaced.id, 'period_budget', [row.id])
        } else if (row) {
          // A truly empty row (the web's "clear" PUTs nulls: no numbers, no
          // forecast, no methods, no notes) holds nothing of the person's — it
          // would only block the (school, period) unique key, so it is dropped
          // before the removed budget is put back in its place.
          await tx.periodBudget.delete({ where: { id: row.id } })
        }
        await this.restoreRows(tx, header.id, ['period_budget'])
      }

      // AFTER the inserts: deleting the header cascades its bin items.
      await tx.dataRemoval.delete({ where: { id: header.id } })
      return { header, replaced: replaced as DataRemoval | null }
    }, TX_OPTIONS)

    let effects: ChangeEffects = { statements: 'none', rebuilt: [], failed: [] }
    if (kind === 'trial_balance' && lite && before) {
      effects = await this.reconcileAfterTb(actor, schoolId, period, lite, before, 'data_restored', false)
    }

    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'finance_data.restored',
      targetType: 'data_removal',
      targetId: header.id,
      metadata: {
        kind,
        periodId,
        role: header.role ?? null,
        monthKeys: header.monthKeys ?? [],
        replacedRemovalId: replaced?.id ?? null,
      },
    })

    const removedBy = await this.personFor(header.removedBy)
    return {
      restored: toRemovedEntry(header, removedBy),
      replaced: replaced ? toRemovedEntry(replaced, actorPerson(actor)) : null,
      effects,
    }
  }

  /**
   * Move a removal's rows back. Any SQL failure (a row that no longer fits the
   * table, a key now taken) becomes RESTORE_FAILED; throwing inside the
   * transaction rolls it back, so the bin rows stay intact for another try.
   */
  private async restoreRows(
    tx: Prisma.TransactionClient,
    removalId: string,
    models: ('import' | 'statement_snapshot' | 'monthly_snapshot' | 'period_budget')[],
  ): Promise<void> {
    let primary = 0
    try {
      for (const [i, model] of models.entries()) {
        const n = await restoreFromBin(tx, removalId, model)
        if (i === 0) primary = n
      }
    } catch (err) {
      if (err instanceof HttpException) throw err
      this.logger.warn(`restore ${removalId} failed: ${String(err)}`)
      throw new ConflictException({ code: 'RESTORE_FAILED', message: MSG.restoreFailed })
    }
    // Nothing of the main kind came back: the bin is empty — don't drop the header.
    if (primary === 0) {
      throw new ConflictException({ code: 'RESTORE_FAILED', message: MSG.restoreFailed })
    }
  }

  private async personFor(userId: string | null): Promise<Person | null> {
    if (!userId) return null
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true },
    })
    return u ? toPerson(u.id, new Map([[u.id, u]])) : null
  }
}

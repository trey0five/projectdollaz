import { Injectable } from '@nestjs/common'
import type { MembershipRole } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import {
  RESTORE_DAYS,
  budgetHasForecast,
  budgetHoldsWork,
  budgetKind,
  halfFromPartial,
  isBudgetPresent,
  shortLabelFor,
  sourceFromRaw,
  toPerson,
  ymd,
  type UserLite,
} from './finance-files.constants.js'
import {
  budgetConflict,
  monthsConflict,
  tbConflict,
  toRemovedEntry,
  type OnFileResponse,
  type OnFileYear,
  type RemovalConflict,
  type Role,
  type TbItem,
} from './finance-files.types.js'

/** One import as the inventory reads it — never the rows. */
interface RawImportRow {
  id: string
  fiscalPeriodId: string
  role: string
  sourceName: string
  rowCount: number
  uploadedBy: string | null
  createdAt: Date
  source: string | null
  partial: string | null
}

const ROLE_ORDER: Role[] = ['cy', 'py', 'audit']
const MAX_RECENTLY_REMOVED = 50

/**
 * "Already on file": every fiscal year that holds finance data, with what is
 * there — trial balance stacks per role, monthly numbers, the budget — plus the
 * editor-only "Recently removed" list. Read-only; never loads import rows,
 * monthly source rows or snapshot payloads.
 */
@Injectable()
export class FinanceInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async inventory(schoolId: string, callerRole: MembershipRole | undefined): Promise<OnFileResponse> {
    const canEdit = callerRole === 'owner' || callerRole === 'accountant'
    const now = new Date()

    const [periods, imports, snapshotCounts, months, budgets, boardReports, removals] = await Promise.all([
      this.prisma.fiscalPeriod.findMany({ where: { schoolId } }),
      this.prisma.$queryRaw<RawImportRow[]>`
        SELECT id, fiscal_period_id AS "fiscalPeriodId", role::text AS role,
               source_name AS "sourceName", row_count AS "rowCount", uploaded_by AS "uploadedBy",
               created_at AS "createdAt", metadata->>'source' AS source,
               metadata->'statement'->>'partial' AS partial
        FROM imports WHERE school_id = ${schoolId}::uuid ORDER BY created_at DESC`,
      this.prisma.statementSnapshot.groupBy({
        by: ['fiscalPeriodId'],
        where: { schoolId },
        _count: { _all: true },
      }),
      this.prisma.monthlySnapshot.findMany({
        where: { schoolId },
        select: { fiscalPeriodId: true, monthKey: true, sourceName: true, updatedAt: true },
        orderBy: { monthKey: 'asc' },
      }),
      this.prisma.periodBudget.findMany({
        where: { schoolId },
        select: {
          fiscalPeriodId: true,
          totalRevenue: true,
          notes: true,
          totalExpenses: true,
          lines: true,
          updatedAt: true,
          updatedByUserId: true,
        },
      }),
      this.prisma.boardReport.findMany({ where: { schoolId }, select: { fiscalPeriodId: true } }),
      canEdit
        ? this.prisma.dataRemoval.findMany({
            where: { schoolId, expiresAt: { gt: now } },
            orderBy: { removedAt: 'desc' },
            take: MAX_RECENTLY_REMOVED,
          })
        : Promise.resolve([]),
    ])

    // ── Index everything by period.
    const importsByPeriod = new Map<string, RawImportRow[]>()
    for (const imp of [...imports].sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime())) {
      const list = importsByPeriod.get(imp.fiscalPeriodId) ?? []
      list.push(imp)
      importsByPeriod.set(imp.fiscalPeriodId, list)
    }
    const snapshotsByPeriod = new Map<string, number>()
    for (const g of snapshotCounts) snapshotsByPeriod.set(g.fiscalPeriodId, g._count?._all ?? 0)
    const monthsByPeriod = new Map<string, typeof months>()
    for (const m of [...months].sort((a, b) => a.monthKey.localeCompare(b.monthKey))) {
      const list = monthsByPeriod.get(m.fiscalPeriodId) ?? []
      list.push(m)
      monthsByPeriod.set(m.fiscalPeriodId, list)
    }
    const presentBudgetByPeriod = new Map<string, (typeof budgets)[number]>()
    for (const b of budgets) if (isBudgetPresent(b)) presentBudgetByPeriod.set(b.fiscalPeriodId, b)
    const boardReportPeriods = new Set(boardReports.map((r) => r.fiscalPeriodId))

    // ── One user lookup for every name on the page.
    const userIds = new Set<string>()
    for (const i of imports) if (i.uploadedBy) userIds.add(i.uploadedBy)
    for (const b of presentBudgetByPeriod.values()) if (b.updatedByUserId) userIds.add(b.updatedByUserId)
    for (const r of removals) if (r.removedBy) userIds.add(r.removedBy)
    const users: UserLite[] = userIds.size
      ? await this.prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : []
    const usersById = new Map(users.map((u) => [u.id, u]))

    // ── Years.
    const years: OnFileYear[] = []
    for (const p of periods) {
      const periodImports = importsByPeriod.get(p.id) ?? []
      const periodMonths = monthsByPeriod.get(p.id) ?? []
      const budget = presentBudgetByPeriod.get(p.id) ?? null
      const snapshotCount = snapshotsByPeriod.get(p.id) ?? 0
      if (periodImports.length === 0 && periodMonths.length === 0 && !budget && snapshotCount === 0) continue

      const trialBalances: TbItem[] = []
      for (const role of ROLE_ORDER) {
        const stack = periodImports.filter((i) => i.role === role)
        const active = stack[0]
        if (!active) continue
        const half = halfFromPartial(active.partial)
        let hiddenHalf: TbItem['hiddenHalf'] = null
        if (half === 'pl' || half === 'bs') {
          const opposite = half === 'pl' ? 'bs' : 'pl'
          const older = stack.slice(1).find((i) => halfFromPartial(i.partial) === opposite)
          if (older) {
            hiddenHalf = { half: opposite, sourceName: older.sourceName, uploadedAt: toDate(older.createdAt).toISOString() }
          }
        }
        trialBalances.push({
          role,
          importId: active.id,
          sourceName: active.sourceName,
          source: sourceFromRaw(active.source),
          rowCount: Number(active.rowCount),
          uploadedAt: toDate(active.createdAt).toISOString(),
          uploadedBy: toPerson(active.uploadedBy, usersById),
          half,
          versions: stack.length,
          hiddenHalf,
        })
      }

      years.push({
        periodId: p.id,
        label: p.label,
        shortLabel: shortLabelFor(p),
        periodEndDate: ymd(p.periodEndDate),
        periodType: p.periodType,
        hasStatements: snapshotCount > 0,
        hasBoardReport: boardReportPeriods.has(p.id),
        trialBalances,
        monthly: periodMonths.length
          ? {
              count: periodMonths.length,
              total: 12,
              months: periodMonths.map((m) => ({
                monthKey: m.monthKey,
                sourceName: m.sourceName,
                uploadedAt: m.updatedAt.toISOString(),
              })),
            }
          : null,
        budget: budget
          ? {
              kind: budgetKind(budget.lines),
              hasForecast: budgetHasForecast(budget.lines),
              updatedAt: budget.updatedAt.toISOString(),
              updatedBy: toPerson(budget.updatedByUserId, usersById),
            }
          : null,
      })
    }
    years.sort((a, b) => b.periodEndDate.localeCompare(a.periodEndDate))

    // ── Recently removed (editors only), each with "is the slot filled now?".
    const recentlyRemoved = removals.map((r) => {
      let conflict: RemovalConflict | null = null
      if (r.kind === 'trial_balance') {
        const stack = (importsByPeriod.get(r.fiscalPeriodId) ?? []).filter((i) => i.role === r.role)
        conflict = tbConflict(stack.map((i) => ({ sourceName: i.sourceName, createdAt: toDate(i.createdAt) })))
      } else if (r.kind === 'monthly') {
        conflict = monthsConflict(r.monthKeys ?? [], monthsByPeriod.get(r.fiscalPeriodId) ?? [])
      } else if (r.kind === 'budget') {
        // Same rule as restore: a later forecast/notes-only row also fills the slot.
        const row = budgets.find((b) => b.fiscalPeriodId === r.fiscalPeriodId) ?? null
        conflict = budgetConflict(row && budgetHoldsWork(row) ? row : null)
      }
      return toRemovedEntry(r, toPerson(r.removedBy, usersById), conflict)
    })

    return { restoreDays: RESTORE_DAYS, years, recentlyRemoved }
  }
}

/** $queryRaw hands back Date for timestamp columns; tolerate a string defensively. */
function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v)
}

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'

interface SchoolRollupEntry {
  schoolId: string
  name: string
  imported: boolean
  totalRevenue: number | null
  totalExpenses: number | null
}

export interface OrgBudgetRollup {
  orgId: string
  fiscalYearStart: string | null
  schools: SchoolRollupEntry[]
  consolidated: {
    revenue: Record<string, number>
    expense: Record<string, number>
    totalRevenue: number
    totalExpenses: number
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/** Sum the numeric values of a `{key:number}` record (NaN-safe). */
function sumValues(src: unknown): number {
  if (!src || typeof src !== 'object') return 0
  let s = 0
  for (const v of Object.values(src as Record<string, unknown>)) {
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n)) s += n
  }
  return round2(s)
}

/** Numeric-key sum: fold a `{key:number}` record into the accumulator. */
function addRecord(acc: Record<string, number>, src: unknown): void {
  if (!src || typeof src !== 'object') return
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n)) acc[k] = round2((acc[k] ?? 0) + n)
  }
}

/**
 * Diocese-wide budget consolidation. STRICT org isolation: the roll-up only ever
 * spans the schools that BOTH (a) belong to :orgId and (b) the CALLER has an
 * active membership on. Cross-org schools — and even in-org schools the caller
 * cannot see — are never summed or leaked.
 */
@Injectable()
export class BudgetRollupService {
  constructor(private readonly prisma: PrismaService) {}

  async getRollup(
    user: User,
    orgId: string,
    fiscalYearStart: string | null,
  ): Promise<OrgBudgetRollup> {
    // 1) Caller's active memberships, joined to their school (for the org id).
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, status: 'active' },
      include: { school: true },
    })
    if (memberships.length === 0) {
      throw new NotFoundException('You do not belong to an organization yet.')
    }

    // 2) :orgId MUST be one the caller belongs to (no cross-org probing).
    const inOrg = memberships.filter((m) => m.school.organizationId === orgId)
    if (inOrg.length === 0) {
      throw new ForbiddenException('You do not have access to this organization.')
    }

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } })
    if (!org) throw new NotFoundException('Organization not found.')

    // 3) Restrict to the caller's own in-org schools (dedupe).
    const schoolMap = new Map<string, { id: string; name: string }>()
    for (const m of inOrg) schoolMap.set(m.school.id, { id: m.school.id, name: m.school.name })
    const schools = [...schoolMap.values()]

    // 4) Pull every budget for those schools (with its period for FY matching).
    const budgets = await this.prisma.periodBudget.findMany({
      where: { schoolId: { in: schools.map((s) => s.id) } },
      include: { fiscalPeriod: true },
    })

    // Resolve a budget's fiscal-year-start: prefer lines.spread.fiscalYearStart
    // ('YYYY-MM'); else derive from the period end on the SAME Jul–Jun convention
    // the web uses (deriveFiscalYearStart) so the query param and a budget's FY
    // always agree — months Jan–Jun belong to the FY that started the prior July;
    // Jul–Dec to the FY that started THIS July. (A generic period-end+1 rule would
    // mismatch the web for any period not ending in June, silently dropping that
    // school from the roll-up.)
    const fyStartOf = (b: (typeof budgets)[number]): string | null => {
      const lines = b.lines as Record<string, unknown> | null
      const spread = lines?.spread as Record<string, unknown> | undefined
      const fromSpread = spread?.fiscalYearStart
      if (typeof fromSpread === 'string' && /^\d{4}-\d{2}$/.test(fromSpread)) {
        return fromSpread.slice(0, 7)
      }
      const end = b.fiscalPeriod?.periodEndDate
      if (!end) return null
      const y = end.getUTCFullYear()
      const m = end.getUTCMonth() + 1 // 1..12 (period end)
      const startYear = m <= 6 ? y - 1 : y
      return `${startYear}-07`
    }

    const consolidatedRevenue: Record<string, number> = {}
    const consolidatedExpense: Record<string, number> = {}

    const schoolEntries: SchoolRollupEntry[] = schools.map((s) => {
      // Candidate budgets for this school, optionally filtered by fiscal year.
      const candidates = budgets.filter(
        (b) => b.schoolId === s.id && (!fiscalYearStart || fyStartOf(b) === fiscalYearStart),
      )
      // Pick the most-recent matching budget.
      const chosen = candidates.sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      )[0]

      if (!chosen) {
        return { schoolId: s.id, name: s.name, imported: false, totalRevenue: null, totalExpenses: null }
      }

      const lines = chosen.lines as Record<string, unknown> | null
      addRecord(consolidatedRevenue, lines?.revenue)
      addRecord(consolidatedExpense, lines?.expense)
      // Per-school totals come from the MAPPED category lines (not the sheet-
      // printed PeriodBudget.totalRevenue) so the school rows, the category table,
      // and the consolidated card all reconcile to the same figure.
      return {
        schoolId: s.id,
        name: s.name,
        imported: true,
        totalRevenue: sumValues(lines?.revenue),
        totalExpenses: sumValues(lines?.expense),
      }
    })

    return {
      orgId,
      fiscalYearStart: fiscalYearStart ?? null,
      schools: schoolEntries,
      consolidated: {
        revenue: consolidatedRevenue,
        expense: consolidatedExpense,
        totalRevenue: sumValues(consolidatedRevenue),
        totalExpenses: sumValues(consolidatedExpense),
      },
    }
  }
}

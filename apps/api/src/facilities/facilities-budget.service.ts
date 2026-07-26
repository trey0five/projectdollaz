import { Injectable, NotFoundException } from '@nestjs/common'
import { EXPENSE_LINE_KEYS, EXPENSE_LINE_LABELS } from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Facilities inherited budget — READ-ONLY derivation over the Finance
// PeriodBudget. This service NEVER writes budget data (all budget mutation stays
// in analytics/budget.controller.ts); the only write here is the per-school
// mapping config (FacilitiesSetting.budgetExpenseKeys).
//
// D1 (frozen): the mapping vocabulary is EXACTLY the 10 EXPENSE_LINE_KEYS from
// @finrep/analytics (the PeriodBudget lines.expense rollup-line keys). Default =
// ['facilities']. No regex/heuristic matching.
//
// The pure pieces (resolveMappedKeys / pickBudgetPeriod / deriveFacilitiesTotals)
// are exported for direct unit testing — deterministic, injectable-today, no I/O.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_FACILITIES_BUDGET_KEYS = ['facilities'] as const

export interface FacilitiesBudgetPeriod {
  id: string
  label: string
  periodEndDate: string
}

export interface MappedLine {
  key: string
  label: string
  amount: number
}

export interface FacilitiesBudgetActive {
  hasBudget: true
  period: FacilitiesBudgetPeriod
  mappedKeys: string[]
  mappedLines: MappedLine[]
  budgetTotal: number
  /** Σ estimatedCost over NON-resolved items — a present-day quantity (D4: NOT
   *  FY-windowed). Accepted bids are inside automatically (accept stamps
   *  estimatedCost); nothing is committed until Leadership accepts. */
  committed: number
  /** Σ actualCost over items resolved INSIDE the FY window (resolvedAt ?? updatedAt;
   *  day-granular — the FY's whole last calendar day is in). */
  actual: number
  remaining: number
  overBudget: boolean
  /** In-window resolved items with NULL actualCost (UI nudge). */
  resolvedMissingActualCount: number
}

export interface FacilitiesBudgetEmpty {
  hasBudget: false
  reason: 'no_budget' | 'no_lines'
  period: { id: string; label: string } | null
  mappedKeys: string[]
}

export type FacilitiesBudgetResponse = FacilitiesBudgetActive | FacilitiesBudgetEmpty

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Validate the stored budgetExpenseKeys Json into a mapped-key list. PURE.
 * Anything that is not a non-empty array of known EXPENSE_LINE_KEYS strings
 * (after filtering unknowns + dupes) falls back to the default ['facilities'].
 */
export function resolveMappedKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_FACILITIES_BUDGET_KEYS]
  const seen = new Set<string>()
  const keys: string[] = []
  for (const k of raw) {
    if (typeof k !== 'string') continue
    if (!(EXPENSE_LINE_KEYS as readonly string[]).includes(k)) continue
    if (seen.has(k)) continue
    seen.add(k)
    keys.push(k)
  }
  return keys.length > 0 ? keys : [...DEFAULT_FACILITIES_BUDGET_KEYS]
}

/** A period candidate for auto-resolution (already filtered to budget-bearing). */
export interface BudgetPeriodCandidate {
  id: string
  label: string
  periodType: string
  periodEndDate: Date
}

/**
 * Pick the period the facilities card should read when none is specified. PURE.
 * Prefer annual periods (fall back to all candidates when no annual ones exist);
 * within the preferred pool pick the SMALLEST periodEndDate >= today (the current/
 * next fiscal year), else the LARGEST periodEndDate (the most recent past budget).
 */
export function pickBudgetPeriod<T extends BudgetPeriodCandidate>(
  candidates: readonly T[],
  today: Date,
): T | null {
  if (candidates.length === 0) return null
  const annual = candidates.filter((c) => c.periodType === 'annual')
  const pool = annual.length > 0 ? annual : candidates
  const upcoming = pool
    .filter((c) => c.periodEndDate.getTime() >= today.getTime())
    .sort((a, b) => a.periodEndDate.getTime() - b.periodEndDate.getTime())
  if (upcoming.length > 0) return upcoming[0]
  return [...pool].sort((a, b) => b.periodEndDate.getTime() - a.periodEndDate.getTime())[0]
}

/** The item slice the derivation needs (Decimals already coerced to numbers). */
export interface BudgetItemInput {
  status: string
  estimatedCost: number | null
  actualCost: number | null
  resolvedAt: Date | null
  updatedAt: Date
}

export interface FacilitiesTotals {
  mappedLines: MappedLine[]
  budgetTotal: number
  committed: number
  actual: number
  remaining: number
  overBudget: boolean
  resolvedMissingActualCount: number
}

/**
 * The deterministic derivation core. PURE — no clock, no I/O.
 *  budgetTotal = Σ lines.expense[k] for k ∈ mappedKeys (missing/non-numeric → 0)
 *  committed   = Σ estimatedCost over status != 'resolved' (NOT windowed — D4)
 *  actual      = Σ actualCost over status == 'resolved' with (resolvedAt ?? updatedAt)
 *                ∈ [periodEndDate+1d − 1y, periodEndDate+1d)  (the DAY-granular FY
 *                window — periodEndDate is @db.Date midnight UTC, so the whole last
 *                calendar day counts; legacy resolved rows have null resolvedAt →
 *                updatedAt fallback — D3)
 *  remaining   = budgetTotal − committed − actual;  overBudget = remaining < 0
 * Money accumulates in integer cents (mirrors summarizeBacklog — no float drift).
 */
export function deriveFacilitiesTotals(args: {
  mappedKeys: readonly string[]
  expenseLines: Record<string, unknown>
  items: readonly BudgetItemInput[]
  periodEndDate: Date
}): FacilitiesTotals {
  const { mappedKeys, expenseLines, items, periodEndDate } = args
  const mappedLines: MappedLine[] = mappedKeys.map((key) => {
    const v = expenseLines[key]
    const amount = typeof v === 'number' && Number.isFinite(v) ? round2(v) : 0
    return {
      key,
      label: (EXPENSE_LINE_LABELS as Record<string, string>)[key] ?? key,
      amount,
    }
  })
  const budgetTotal = round2(mappedLines.reduce((s, l) => s + Math.round(l.amount * 100), 0) / 100)

  // FY window = [start-of-day-after-prior-end, start-of-day-after-end) — DAY-
  // granular. periodEndDate is @db.Date (midnight UTC) while resolvedAt/updatedAt
  // are full timestamps, so the end bound is periodEndDate + 1 day: anything
  // resolved DURING the FY's last calendar day (e.g. Jun 30 14:00) still belongs
  // to this FY, and the prior FY's last-day afternoon does not leak in.
  const windowEndDate = new Date(periodEndDate)
  windowEndDate.setUTCHours(0, 0, 0, 0)
  windowEndDate.setUTCDate(windowEndDate.getUTCDate() + 1)
  const windowEnd = windowEndDate.getTime()
  const windowStartDate = new Date(windowEndDate)
  windowStartDate.setUTCFullYear(windowStartDate.getUTCFullYear() - 1)
  const windowStart = windowStartDate.getTime()

  let committedCents = 0
  let actualCents = 0
  let resolvedMissingActualCount = 0
  for (const it of items) {
    if (it.status !== 'resolved') {
      committedCents += Math.round((it.estimatedCost ?? 0) * 100)
      continue
    }
    const when = (it.resolvedAt ?? it.updatedAt).getTime()
    if (when >= windowStart && when < windowEnd) {
      if (it.actualCost === null) resolvedMissingActualCount += 1
      else actualCents += Math.round(it.actualCost * 100)
    }
  }
  const committed = committedCents / 100
  const actual = actualCents / 100
  const remaining = round2(budgetTotal - committed - actual)
  return {
    mappedLines,
    budgetTotal,
    committed,
    actual,
    remaining,
    overBudget: remaining < 0,
    resolvedMissingActualCount,
  }
}

/** True when the value is an object with at least one own key. */
function nonEmptyObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length > 0
}

@Injectable()
export class FacilitiesBudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async mappedKeysFor(schoolId: string): Promise<string[]> {
    const setting = await this.prisma.facilitiesSetting.findUnique({
      where: { schoolId },
      select: { budgetExpenseKeys: true },
    })
    return resolveMappedKeys(setting?.budgetExpenseKeys ?? null)
  }

  /**
   * GET /facilities/budget — derive the facilities view of the Finance budget.
   * Explicit periodId wins (404 when not this school's period); otherwise the
   * budget-bearing period nearest today is auto-resolved (annual preferred).
   */
  async getBudget(
    schoolId: string,
    periodId?: string,
    now = new Date(),
  ): Promise<FacilitiesBudgetResponse> {
    const mappedKeys = await this.mappedKeysFor(schoolId)

    let period: { id: string; label: string; periodEndDate: Date } | null = null
    let lines: unknown = null

    if (periodId) {
      const fp = await this.prisma.fiscalPeriod.findFirst({
        where: { id: periodId, schoolId },
        select: { id: true, label: true, periodEndDate: true },
      })
      if (!fp) throw new NotFoundException('Fiscal period not found.')
      const budget = await this.prisma.periodBudget.findFirst({
        where: { schoolId, fiscalPeriodId: fp.id },
        select: { lines: true },
      })
      if (!budget) {
        return {
          hasBudget: false,
          reason: 'no_budget',
          period: { id: fp.id, label: fp.label },
          mappedKeys,
        }
      }
      period = fp
      lines = budget.lines
    } else {
      const budgets = await this.prisma.periodBudget.findMany({
        where: { schoolId },
        select: {
          lines: true,
          fiscalPeriod: { select: { id: true, label: true, periodType: true, periodEndDate: true } },
        },
      })
      // Budget-bearing = lines.revenue OR lines.expense non-empty.
      const candidates = budgets
        .filter((b) => {
          const l = b.lines as Record<string, unknown> | null
          return nonEmptyObject(l?.revenue) || nonEmptyObject(l?.expense)
        })
        .map((b) => ({ ...b.fiscalPeriod, lines: b.lines }))
      const picked = pickBudgetPeriod(candidates, now)
      if (!picked) {
        return { hasBudget: false, reason: 'no_budget', period: null, mappedKeys }
      }
      period = { id: picked.id, label: picked.label, periodEndDate: picked.periodEndDate }
      lines = picked.lines
    }

    const expense = (lines as Record<string, unknown> | null)?.expense
    if (!nonEmptyObject(expense)) {
      return {
        hasBudget: false,
        reason: 'no_lines',
        period: { id: period.id, label: period.label },
        mappedKeys,
      }
    }

    const items = await this.prisma.maintenanceItem.findMany({
      where: { schoolId },
      select: {
        status: true,
        estimatedCost: true,
        actualCost: true,
        resolvedAt: true,
        updatedAt: true,
      },
    })
    const totals = deriveFacilitiesTotals({
      mappedKeys,
      expenseLines: expense,
      // Prisma.Decimal → number BEFORE the pure core (decimal discipline).
      items: items.map((i) => ({
        status: i.status,
        estimatedCost: i.estimatedCost === null ? null : Number(i.estimatedCost),
        actualCost: i.actualCost === null ? null : Number(i.actualCost),
        resolvedAt: i.resolvedAt,
        updatedAt: i.updatedAt,
      })),
      periodEndDate: period.periodEndDate,
    })
    return {
      hasBudget: true,
      period: {
        id: period.id,
        label: period.label,
        periodEndDate: period.periodEndDate.toISOString().slice(0, 10),
      },
      mappedKeys,
      ...totals,
    }
  }

  /** PUT /facilities/budget/config — upsert the mapping (keys already @IsIn-validated). */
  async putConfig(
    schoolId: string,
    keys: string[],
    userId: string,
  ): Promise<{ keys: string[] }> {
    // Dedupe while preserving order (the DTO guarantees vocabulary membership).
    const deduped = [...new Set(keys)]
    await this.prisma.facilitiesSetting.upsert({
      where: { schoolId },
      create: { schoolId, budgetExpenseKeys: deduped, updatedByUserId: userId },
      update: { budgetExpenseKeys: deduped, updatedByUserId: userId },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'facilities.budget_config.updated',
      targetType: 'facilities_settings',
      targetId: schoolId,
      metadata: { keys: deduped },
    })
    return { keys: deduped }
  }
}

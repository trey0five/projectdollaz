import { describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import {
  FacilitiesBudgetService,
  deriveFacilitiesTotals,
  pickBudgetPeriod,
  resolveMappedKeys,
} from './facilities-budget.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Facilities inherited budget — the deterministic derivation core (pure) + the
// service's period-resolution/empty-state branches (Prisma hand-mocked). The
// frozen §2 table: mapping default, multi-key sum, missing-key→0, no_budget /
// no_lines, committed excludes resolved, FY windowing incl. legacy updatedAt
// fallback, accept-then-recompute no-double-count, overBudget flag.
// ─────────────────────────────────────────────────────────────────────────────

const FY_END = new Date('2027-06-30T00:00:00.000Z') // FY Jul–Jun

function bItem(over: Partial<Parameters<typeof deriveFacilitiesTotals>[0]['items'][number]> = {}) {
  return {
    status: 'open',
    estimatedCost: null,
    actualCost: null,
    resolvedAt: null,
    updatedAt: new Date('2027-01-15T00:00:00.000Z'),
    ...over,
  }
}

describe('resolveMappedKeys — validated subset with default fallback', () => {
  it("null / absent / non-array → default ['facilities']", () => {
    expect(resolveMappedKeys(null)).toEqual(['facilities'])
    expect(resolveMappedKeys(undefined)).toEqual(['facilities'])
    expect(resolveMappedKeys('facilities')).toEqual(['facilities'])
  })

  it('keeps only known EXPENSE_LINE_KEYS, dedupes, preserves order', () => {
    expect(resolveMappedKeys(['fixedOther', 'facilities', 'fixedOther', 'bogus', 42])).toEqual([
      'fixedOther',
      'facilities',
    ])
  })

  it('all-invalid list falls back to the default (never an empty mapping)', () => {
    expect(resolveMappedKeys(['bogus', 'facilSal'])).toEqual(['facilities'])
  })
})

describe('pickBudgetPeriod — annual preferred, nearest-future else most-recent-past', () => {
  const TODAY = new Date('2026-07-26T00:00:00.000Z')
  const p = (id: string, periodType: string, end: string) => ({
    id,
    label: id,
    periodType,
    periodEndDate: new Date(end),
  })

  it('empty → null', () => {
    expect(pickBudgetPeriod([], TODAY)).toBeNull()
  })

  it('prefers annual periods and the SMALLEST end date >= today', () => {
    const picked = pickBudgetPeriod(
      [
        p('past', 'annual', '2026-06-30'),
        p('next', 'annual', '2027-06-30'),
        p('later', 'annual', '2028-06-30'),
        p('monthly-nearer', 'monthly', '2026-08-31'),
      ],
      TODAY,
    )
    expect(picked!.id).toBe('next') // annual pool beats the nearer monthly
  })

  it('no future candidate → the largest (most recent) past end date', () => {
    const picked = pickBudgetPeriod(
      [p('old', 'annual', '2025-06-30'), p('recent', 'annual', '2026-06-30')],
      TODAY,
    )
    expect(picked!.id).toBe('recent')
  })

  it('falls back to non-annual candidates when no annual ones exist', () => {
    const picked = pickBudgetPeriod(
      [p('m1', 'monthly', '2026-08-31'), p('m2', 'monthly', '2026-09-30')],
      TODAY,
    )
    expect(picked!.id).toBe('m1')
  })
})

describe('deriveFacilitiesTotals — the frozen derivation table', () => {
  it('default mapping sums lines.expense.facilities; missing key → 0', () => {
    const t = deriveFacilitiesTotals({
      mappedKeys: ['facilities'],
      expenseLines: { facilities: 120000.5, instructional: 900000 },
      items: [],
      periodEndDate: FY_END,
    })
    expect(t.budgetTotal).toBe(120000.5)
    expect(t.mappedLines).toEqual([{ key: 'facilities', label: 'Facilities', amount: 120000.5 }])

    const missing = deriveFacilitiesTotals({
      mappedKeys: ['facilities'],
      expenseLines: { instructional: 900000 },
      items: [],
      periodEndDate: FY_END,
    })
    expect(missing.budgetTotal).toBe(0)
    expect(missing.mappedLines[0].amount).toBe(0)
  })

  it('multi-key mapping sums each mapped line (labels from EXPENSE_LINE_LABELS)', () => {
    const t = deriveFacilitiesTotals({
      mappedKeys: ['facilities', 'fixedOther'],
      expenseLines: { facilities: 100000, fixedOther: 25000.25, admin: 999999 },
      items: [],
      periodEndDate: FY_END,
    })
    expect(t.budgetTotal).toBe(125000.25)
    expect(t.mappedLines.map((l) => l.label)).toEqual(['Facilities', 'Fixed & other'])
  })

  it('committed = Σ estimates over NON-resolved only (open/scheduled/in_progress); not windowed', () => {
    const t = deriveFacilitiesTotals({
      mappedKeys: ['facilities'],
      expenseLines: { facilities: 50000 },
      items: [
        bItem({ status: 'open', estimatedCost: 100.1 }),
        bItem({ status: 'scheduled', estimatedCost: 200.2 }),
        bItem({ status: 'in_progress', estimatedCost: null }), // null → 0
        // resolved NEVER counts toward committed, however old:
        bItem({ status: 'resolved', estimatedCost: 9999, actualCost: null, resolvedAt: new Date('2020-01-01') }),
      ],
      periodEndDate: FY_END,
    })
    expect(t.committed).toBe(300.3) // integer-cents accumulation, no float drift
  })

  it('actual IS FY-windowed day-granularly on [Jul 1, next Jul 1); resolvedAt wins, legacy null falls back to updatedAt', () => {
    const t = deriveFacilitiesTotals({
      mappedKeys: ['facilities'],
      expenseLines: { facilities: 50000 },
      items: [
        // in-window by resolvedAt (boundary: periodEndDate midnight is INCLUDED).
        bItem({ status: 'resolved', actualCost: 1000, resolvedAt: FY_END }),
        // in-window: the AFTERNOON of the FY's last calendar day still counts
        // (periodEndDate is @db.Date midnight UTC; resolvedAt is a full timestamp).
        bItem({ status: 'resolved', actualCost: 100, resolvedAt: new Date('2027-06-30T14:00:00.000Z') }),
        // out-of-window: ANY time on the prior FY's last day is EXCLUDED.
        bItem({ status: 'resolved', actualCost: 500, resolvedAt: new Date('2026-06-30T00:00:00.000Z') }),
        bItem({ status: 'resolved', actualCost: 500, resolvedAt: new Date('2026-06-30T14:00:00.000Z') }),
        // legacy row (null resolvedAt) windows on updatedAt — in-window here.
        bItem({ status: 'resolved', actualCost: 250, resolvedAt: null, updatedAt: new Date('2026-12-01T00:00:00.000Z') }),
        // in-window resolved with NULL actualCost → the nudge count, not 0-summed silently.
        bItem({ status: 'resolved', actualCost: null, resolvedAt: new Date('2027-01-01T00:00:00.000Z') }),
      ],
      periodEndDate: FY_END,
    })
    expect(t.actual).toBe(1350)
    expect(t.resolvedMissingActualCount).toBe(1)
  })

  it('accept-then-recompute: the accepted amount lives in the item estimate — NO separate term, no double count', () => {
    // After accept, the item carries estimatedCost = winning amount. The bid itself
    // is NOT an input to the derivation — committed only reads items.
    const afterAccept = deriveFacilitiesTotals({
      mappedKeys: ['facilities'],
      expenseLines: { facilities: 10000 },
      items: [bItem({ status: 'scheduled', estimatedCost: 2500 })], // stamped by accept
      periodEndDate: FY_END,
    })
    expect(afterAccept.committed).toBe(2500)
    expect(afterAccept.remaining).toBe(7500)
  })

  it('remaining = budget − committed − actual; overBudget flips when negative', () => {
    const t = deriveFacilitiesTotals({
      mappedKeys: ['facilities'],
      expenseLines: { facilities: 1000 },
      items: [
        bItem({ status: 'open', estimatedCost: 700 }),
        bItem({ status: 'resolved', actualCost: 600, resolvedAt: new Date('2027-01-01T00:00:00.000Z') }),
      ],
      periodEndDate: FY_END,
    })
    expect(t.remaining).toBe(-300)
    expect(t.overBudget).toBe(true)

    const under = deriveFacilitiesTotals({
      mappedKeys: ['facilities'],
      expenseLines: { facilities: 2000 },
      items: [bItem({ status: 'open', estimatedCost: 700 })],
      periodEndDate: FY_END,
    })
    expect(under.remaining).toBe(1300)
    expect(under.overBudget).toBe(false)
  })
})

// ── Service branches (period resolution + empty states) ───────────────────────

function makeService(over: {
  setting?: unknown
  fiscalPeriod?: unknown
  budgets?: unknown[]
  budget?: unknown
  items?: unknown[]
} = {}) {
  const facilitiesSetting = {
    findUnique: vi.fn(async () => over.setting ?? null),
    upsert: vi.fn(async () => ({})),
  }
  const fiscalPeriod = { findFirst: vi.fn(async () => over.fiscalPeriod ?? null) }
  const periodBudget = {
    findMany: vi.fn(async () => over.budgets ?? []),
    findFirst: vi.fn(async () => over.budget ?? null),
  }
  const maintenanceItem = { findMany: vi.fn(async () => over.items ?? []) }
  const prisma = { facilitiesSetting, fiscalPeriod, periodBudget, maintenanceItem }
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new FacilitiesBudgetService(prisma as never, audit as never)
  return { svc, facilitiesSetting, fiscalPeriod, periodBudget, maintenanceItem, audit }
}

const NOW = new Date('2026-07-26T00:00:00.000Z')

describe('FacilitiesBudgetService.getBudget — branches', () => {
  it('zero budget-bearing periods → { hasBudget:false, reason:no_budget, period:null }', async () => {
    const { svc } = makeService({ budgets: [] })
    const res = await svc.getBudget('school-A', undefined, NOW)
    expect(res).toEqual({
      hasBudget: false,
      reason: 'no_budget',
      period: null,
      mappedKeys: ['facilities'],
    })
  })

  it('a budget row with EMPTY lines is not a candidate (still no_budget)', async () => {
    const { svc } = makeService({
      budgets: [
        {
          lines: { revenue: {}, expense: {} },
          fiscalPeriod: { id: 'p1', label: 'FY27', periodType: 'annual', periodEndDate: new Date('2027-06-30') },
        },
      ],
    })
    const res = await svc.getBudget('school-A', undefined, NOW)
    expect(res).toMatchObject({ hasBudget: false, reason: 'no_budget', period: null })
  })

  it('revenue-only budget resolves the period but reports no_lines (with the period)', async () => {
    const { svc } = makeService({
      budgets: [
        {
          lines: { revenue: { tuition: 1_000_000 }, expense: {} },
          fiscalPeriod: { id: 'p1', label: 'FY27', periodType: 'annual', periodEndDate: new Date('2027-06-30') },
        },
      ],
    })
    const res = await svc.getBudget('school-A', undefined, NOW)
    expect(res).toEqual({
      hasBudget: false,
      reason: 'no_lines',
      period: { id: 'p1', label: 'FY27' },
      mappedKeys: ['facilities'],
    })
  })

  it('happy path: derives from the auto-resolved annual budget with the stored mapping', async () => {
    const { svc } = makeService({
      setting: { budgetExpenseKeys: ['facilities', 'fixedOther'] },
      budgets: [
        {
          lines: { expense: { facilities: 100000, fixedOther: 20000 } },
          fiscalPeriod: { id: 'p1', label: 'FY27', periodType: 'annual', periodEndDate: new Date('2027-06-30T00:00:00.000Z') },
        },
      ],
      items: [
        { status: 'open', estimatedCost: 30000, actualCost: null, resolvedAt: null, updatedAt: new Date('2026-01-01') },
        { status: 'resolved', estimatedCost: null, actualCost: 5000, resolvedAt: new Date('2027-01-01T00:00:00.000Z'), updatedAt: new Date('2027-01-01') },
      ],
    })
    const res = await svc.getBudget('school-A', undefined, NOW)
    expect(res).toMatchObject({
      hasBudget: true,
      period: { id: 'p1', label: 'FY27', periodEndDate: '2027-06-30' },
      mappedKeys: ['facilities', 'fixedOther'],
      budgetTotal: 120000,
      committed: 30000,
      actual: 5000,
      remaining: 85000,
      overBudget: false,
      resolvedMissingActualCount: 0,
    })
  })

  it('explicit periodId: 404 on a foreign period; no_budget (with period) when it has no budget row', async () => {
    const foreign = makeService({ fiscalPeriod: null })
    await expect(foreign.svc.getBudget('school-A', 'p-of-other-school', NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    )

    const noBudget = makeService({
      fiscalPeriod: { id: 'p9', label: 'FY26', periodEndDate: new Date('2026-06-30') },
      budget: null,
    })
    const res = await noBudget.svc.getBudget('school-A', 'p9', NOW)
    expect(res).toEqual({
      hasBudget: false,
      reason: 'no_budget',
      period: { id: 'p9', label: 'FY26' },
      mappedKeys: ['facilities'],
    })
  })
})

describe('FacilitiesBudgetService.putConfig', () => {
  it('upserts the deduped keys, audits, returns { keys }', async () => {
    const { svc, facilitiesSetting, audit } = makeService()
    const res = await svc.putConfig('school-A', ['facilities', 'fixedOther', 'facilities'], 'u1')
    expect(res).toEqual({ keys: ['facilities', 'fixedOther'] })
    expect(facilitiesSetting.upsert).toHaveBeenCalledWith({
      where: { schoolId: 'school-A' },
      create: { schoolId: 'school-A', budgetExpenseKeys: ['facilities', 'fixedOther'], updatedByUserId: 'u1' },
      update: { budgetExpenseKeys: ['facilities', 'fixedOther'], updatedByUserId: 'u1' },
    })
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'facilities.budget_config.updated' }),
    )
  })

  it('vocabulary enforcement lives in the DTO: a non-EXPENSE_LINE_KEYS key is rejected by @IsIn', async () => {
    const { UpdateFacilitiesBudgetConfigDto } = await import(
      './dto/facilities-budget-config.dto.js'
    )
    const { validate } = await import('class-validator')
    const { plainToInstance } = await import('class-transformer')
    const bad = plainToInstance(UpdateFacilitiesBudgetConfigDto, { keys: ['facilities', 'facilSal'] })
    const errs = await validate(bad)
    expect(errs.length).toBeGreaterThan(0) // 'facilSal' is a SCoA category, NOT a rollup line

    const good = plainToInstance(UpdateFacilitiesBudgetConfigDto, { keys: ['facilities', 'fixedOther'] })
    expect(await validate(good)).toEqual([])

    const empty = plainToInstance(UpdateFacilitiesBudgetConfigDto, { keys: [] })
    expect((await validate(empty)).length).toBeGreaterThan(0) // @ArrayNotEmpty
  })
})

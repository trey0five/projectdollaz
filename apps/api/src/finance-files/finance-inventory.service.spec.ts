import { describe, it, expect, vi } from 'vitest'
import { FinanceInventoryService } from './finance-inventory.service.js'
import { budgetKind, isBudgetPresent } from './finance-files.constants.js'

const d = (s: string) => new Date(s)

function rawImport(over: Record<string, unknown>) {
  return {
    id: 'i',
    fiscalPeriodId: 'p25',
    role: 'cy',
    sourceName: 'TB.xlsx',
    rowCount: 10,
    uploadedBy: 'u1',
    createdAt: d('2025-10-03T12:00:00Z'),
    source: 'upload',
    partial: null,
    ...over,
  }
}

function make(opts: {
  periods?: unknown[]
  imports?: unknown[]
  snapshots?: unknown[]
  months?: unknown[]
  budgets?: unknown[]
  boardReports?: unknown[]
  removals?: unknown[]
  users?: unknown[]
} = {}) {
  const prisma = {
    fiscalPeriod: { findMany: vi.fn(async () => opts.periods ?? []) },
    $queryRaw: vi.fn(async () => opts.imports ?? []),
    statementSnapshot: { groupBy: vi.fn(async () => opts.snapshots ?? []) },
    monthlySnapshot: { findMany: vi.fn(async () => opts.months ?? []) },
    periodBudget: { findMany: vi.fn(async () => opts.budgets ?? []) },
    boardReport: { findMany: vi.fn(async () => opts.boardReports ?? []) },
    dataRemoval: { findMany: vi.fn(async () => opts.removals ?? []) },
    user: {
      findMany: vi.fn(async () =>
        opts.users ?? [
          { id: 'u1', firstName: 'Jacqui', lastName: 'Lee', email: 'jacqui@school.org' },
          { id: 'u2', firstName: null, lastName: null, email: 'treasurer@school.org' },
        ],
      ),
    },
  }
  return { svc: new FinanceInventoryService(prisma as never), prisma }
}

const P24 = { id: 'p24', label: 'FY 2024', periodEndDate: d('2024-06-30'), periodType: 'fy' }
const P25 = { id: 'p25', label: 'FY 2025', periodEndDate: d('2025-06-30'), periodType: 'fy' }
const P26 = { id: 'p26', label: 'FY 2026', periodEndDate: d('2026-06-30'), periodType: 'fy' }
const PQ = { id: 'pq', label: 'Q3 2026', periodEndDate: d('2026-03-31'), periodType: 'quarter' }

describe('FinanceInventoryService.inventory', () => {
  it('reports the ACTIVE version per role, how many versions, ordered cy/py/audit', async () => {
    const { svc } = make({
      periods: [P25],
      imports: [
        rawImport({ id: 'a1', role: 'audit', createdAt: d('2025-09-01T00:00:00Z') }),
        rawImport({ id: 'c2', createdAt: d('2025-10-03T00:00:00Z'), sourceName: 'TB v2.xlsx' }),
        rawImport({ id: 'p1', role: 'py', createdAt: d('2025-08-01T00:00:00Z') }),
        rawImport({ id: 'c1', createdAt: d('2025-09-12T00:00:00Z') }),
      ],
    })
    const out = await svc.inventory('s1', 'owner')
    const tbs = out.years[0]!.trialBalances
    expect(tbs.map((t) => t.role)).toEqual(['cy', 'py', 'audit'])
    expect(tbs[0]).toMatchObject({ importId: 'c2', sourceName: 'TB v2.xlsx', versions: 2 })
    expect(tbs[0]!.uploadedBy).toEqual({ id: 'u1', name: 'Jacqui Lee' })
  })

  it('reads the half: none, pl, bs and full', async () => {
    const { svc } = make({
      periods: [P24, P25, P26, PQ],
      imports: [
        rawImport({ id: 'n', fiscalPeriodId: 'p24' }),
        rawImport({ id: 'pl', fiscalPeriodId: 'p25', partial: 'pl' }),
        rawImport({ id: 'bs', fiscalPeriodId: 'p26', partial: 'bs' }),
        rawImport({ id: 'f', fiscalPeriodId: 'pq', partial: 'full' }),
      ],
    })
    const out = await svc.inventory('s1', 'owner')
    const half = (pid: string) => out.years.find((y) => y.periodId === pid)!.trialBalances[0]!.half
    expect([half('p24'), half('p25'), half('p26'), half('pq')]).toEqual([null, 'pl', 'bs', 'full'])
  })

  it('flags a hidden half under the active one (newest such)', async () => {
    const { svc } = make({
      periods: [P25],
      imports: [
        rawImport({ id: 'bs', partial: 'bs', createdAt: d('2025-10-03T00:00:00Z') }),
        rawImport({ id: 'pl2', partial: 'pl', sourceName: 'PL new.xlsx', createdAt: d('2025-09-12T00:00:00Z') }),
        rawImport({ id: 'pl1', partial: 'pl', sourceName: 'PL old.xlsx', createdAt: d('2025-09-01T00:00:00Z') }),
      ],
    })
    const tb = (await svc.inventory('s1', 'owner')).years[0]!.trialBalances[0]!
    expect(tb.hiddenHalf).toEqual({ half: 'pl', sourceName: 'PL new.xlsx', uploadedAt: '2025-09-12T00:00:00.000Z' })
  })

  it('no hidden half for a plain trial balance', async () => {
    const { svc } = make({
      periods: [P25],
      imports: [rawImport({ id: 'x' }), rawImport({ id: 'y', partial: 'pl', createdAt: d('2025-01-01T00:00:00Z') })],
    })
    expect((await svc.inventory('s1', 'owner')).years[0]!.trialBalances[0]!.hiddenHalf).toBeNull()
  })

  it('names QuickBooks as the source', async () => {
    const { svc } = make({ periods: [P25], imports: [rawImport({ source: 'quickbooks' })] })
    expect((await svc.inventory('s1', 'owner')).years[0]!.trialBalances[0]!.source).toBe('quickbooks')
  })

  it('monthly: count, months ASC, total 12; null when there are none', async () => {
    const { svc } = make({
      periods: [P25, P26],
      imports: [rawImport({ fiscalPeriodId: 'p25' })],
      months: [
        { fiscalPeriodId: 'p26', monthKey: '2025-09', sourceName: 'Sep.xlsx', updatedAt: d('2025-10-01T00:00:00Z') },
        { fiscalPeriodId: 'p26', monthKey: '2025-07', sourceName: 'Jul.xlsx', updatedAt: d('2025-08-01T00:00:00Z') },
      ],
    })
    const out = await svc.inventory('s1', 'owner')
    const fy26 = out.years.find((y) => y.periodId === 'p26')!
    expect(fy26.monthly).toMatchObject({ count: 2, total: 12 })
    expect(fy26.monthly!.months.map((m) => m.monthKey)).toEqual(['2025-07', '2025-09'])
    expect(fy26.monthly!.months[0]!.uploadedAt).toBe('2025-08-01T00:00:00.000Z')
    expect(out.years.find((y) => y.periodId === 'p25')!.monthly).toBeNull()
  })

  it('budget: the present predicate and the kind priority', async () => {
    expect(isBudgetPresent({ totalRevenue: null, totalExpenses: null, lines: null })).toBe(false)
    expect(isBudgetPresent({ totalRevenue: null, totalExpenses: null, lines: { revenue: {}, expense: {}, notes: 'x' } })).toBe(false)
    expect(isBudgetPresent({ totalRevenue: 5, totalExpenses: null, lines: null })).toBe(true)
    expect(isBudgetPresent({ lines: { spread: { rows: [] } } })).toBe(true)
    expect(isBudgetPresent({ lines: { driverModel: {} } })).toBe(true)
    expect(isBudgetPresent({ lines: { expense: { salaries: 1 } } })).toBe(true)
    expect(budgetKind({ spread: { format: 'driver' } })).toBe('driver')
    expect(budgetKind({ spread: { format: 'diocesan' }, driverModel: {} })).toBe('driver')
    expect(budgetKind({ spread: { format: 'diocesan' }, revenue: { a: 1 } })).toBe('spread')
    expect(budgetKind({ revenue: { a: 1 } })).toBe('lines')
    expect(budgetKind(null)).toBe('totals')

    const { svc } = make({
      periods: [P25, P26],
      budgets: [
        { fiscalPeriodId: 'p25', totalRevenue: null, totalExpenses: null, lines: { notes: 'only' }, updatedAt: d('2025-10-03T00:00:00Z'), updatedByUserId: 'u1' },
        { fiscalPeriodId: 'p26', totalRevenue: 100, totalExpenses: 90, lines: { spread: { format: 'x' }, forecast: { a: 1 } }, updatedAt: d('2025-10-03T00:00:00Z'), updatedByUserId: 'u2' },
      ],
    })
    const out = await svc.inventory('s1', 'owner')
    expect(out.years.map((y) => y.periodId)).toEqual(['p26']) // a not-present budget holds nothing
    expect(out.years[0]!.budget).toEqual({
      kind: 'spread',
      hasForecast: true,
      updatedAt: '2025-10-03T00:00:00.000Z',
      updatedBy: { id: 'u2', name: 'treasurer' }, // email local part
    })
  })

  it('omits empty periods, orders newest first, and labels June vs other year-ends', async () => {
    const { svc } = make({
      periods: [P24, P25, P26, PQ],
      imports: [rawImport({ fiscalPeriodId: 'p24' }), rawImport({ fiscalPeriodId: 'pq' })],
      snapshots: [{ fiscalPeriodId: 'p26', _count: { _all: 2 } }],
      boardReports: [{ fiscalPeriodId: 'p26' }],
    })
    const out = await svc.inventory('s1', 'owner')
    expect(out.restoreDays).toBe(30)
    expect(out.years.map((y) => y.periodId)).toEqual(['p26', 'pq', 'p24'])
    expect(out.years.map((y) => y.shortLabel)).toEqual(['FY26', 'Q3 2026', 'FY24'])
    expect(out.years[0]).toMatchObject({ hasStatements: true, hasBoardReport: true, trialBalances: [], periodEndDate: '2026-06-30' })
  })

  it('a viewer gets no Recently removed (and the bin is not even read)', async () => {
    const { svc, prisma } = make({ periods: [P25], imports: [rawImport({})] })
    const out = await svc.inventory('s1', 'viewer')
    expect(out.recentlyRemoved).toEqual([])
    expect(prisma.dataRemoval.findMany).not.toHaveBeenCalled()
    const unknown = await svc.inventory('s1', undefined)
    expect(unknown.recentlyRemoved).toEqual([])
  })

  it('fills conflict for TB, monthly and budget removals when the slot is filled now', async () => {
    const header = (over: Record<string, unknown>) => ({
      id: 'r',
      schoolId: 's1',
      fiscalPeriodId: 'p25',
      role: null,
      monthKeys: [],
      reason: 'removed',
      summary: { periodLabel: 'FY 2025', shortLabel: 'FY25', periodEndDate: '2025-06-30', periodType: 'fy', files: [], months: [], budget: null, snapshotCount: 0 },
      removedBy: 'u1',
      removedAt: d('2025-10-20T00:00:00Z'),
      expiresAt: d('2025-11-19T00:00:00Z'),
      ...over,
    })
    const { svc } = make({
      periods: [P25],
      imports: [rawImport({ id: 'now', sourceName: 'New TB.xlsx', createdAt: d('2025-10-24T00:00:00Z') })],
      months: [{ fiscalPeriodId: 'p25', monthKey: '2025-03', sourceName: 'Mar.xlsx', updatedAt: d('2025-10-22T00:00:00Z') }],
      budgets: [{ fiscalPeriodId: 'p25', totalRevenue: 1, totalExpenses: 1, lines: null, updatedAt: d('2025-10-23T00:00:00Z'), updatedByUserId: null }],
      removals: [
        header({ id: 'r-tb', kind: 'trial_balance', role: 'cy' }),
        header({ id: 'r-py', kind: 'trial_balance', role: 'py' }),
        header({ id: 'r-m', kind: 'monthly', monthKeys: ['2025-04', '2025-03'] }),
        header({ id: 'r-b', kind: 'budget' }),
      ],
    })
    const out = await svc.inventory('s1', 'accountant')
    const byId = Object.fromEntries(out.recentlyRemoved.map((e) => [e.id, e]))
    expect(byId['r-tb']!.conflict).toEqual({ sourceName: 'New TB.xlsx', uploadedAt: '2025-10-24T00:00:00.000Z', monthKeys: [] })
    expect(byId['r-py']!.conflict).toBeNull()
    expect(byId['r-m']!.conflict).toEqual({ sourceName: 'Mar.xlsx', uploadedAt: '2025-10-22T00:00:00.000Z', monthKeys: ['2025-03'] })
    expect(byId['r-m']!.monthKeys).toEqual(['2025-03', '2025-04'])
    expect(byId['r-b']!.conflict).toEqual({ sourceName: null, uploadedAt: '2025-10-23T00:00:00.000Z', monthKeys: [] })
    expect(byId['r-tb']).toMatchObject({ shortLabel: 'FY25', removedBy: { id: 'u1', name: 'Jacqui Lee' }, expiresAt: '2025-11-19T00:00:00.000Z' })
  })

  it('a later forecast-only budget row counts as a conflict for a removed budget', async () => {
    const { svc } = make({
      periods: [P25],
      imports: [rawImport({})],
      budgets: [{ fiscalPeriodId: 'p25', totalRevenue: null, totalExpenses: null, notes: null, lines: { forecast: { a: 1 } }, updatedAt: d('2025-10-23T00:00:00Z'), updatedByUserId: null }],
      removals: [
        {
          id: 'r-b', schoolId: 's1', fiscalPeriodId: 'p25', kind: 'budget', role: null, monthKeys: [], reason: 'removed',
          summary: { periodLabel: 'FY 2025', shortLabel: 'FY25', periodEndDate: '2025-06-30', periodType: 'fy', files: [], months: [], budget: { kind: 'totals', hasForecast: false, updatedAt: '2025-10-01T00:00:00.000Z' }, snapshotCount: 0 },
          removedBy: null, removedAt: d('2025-10-20T00:00:00Z'), expiresAt: d('2099-01-01T00:00:00Z'),
        },
      ],
    })
    const out = await svc.inventory('s1', 'owner')
    expect(out.years[0]!.budget).toBeNull() // still not "on file" as a budget
    expect(out.recentlyRemoved[0]!.conflict).toEqual({ sourceName: null, uploadedAt: '2025-10-23T00:00:00.000Z', monthKeys: [] })
  })

  it('never reads import rows (the raw query selects no rows column)', async () => {
    const { svc, prisma } = make({ periods: [P25] })
    await svc.inventory('s1', 'owner')
    const call = prisma.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]]
    const sql = call[0].join('?')
    expect(sql).toMatch(/FROM imports/)
    expect(sql).not.toMatch(/\brows\b/)
    expect(sql).not.toMatch(/\*/)
  })
})

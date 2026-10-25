import { describe, it, expect, vi } from 'vitest'
import { FinanceRemovalsService } from './finance-removals.service.js'

// ── A Prisma double: $transaction(fn) => fn(tx); every raw statement is logged in
// order so the specs can assert WHAT moved and WHEN (lock → bin → header delete).

const d = (s: string) => new Date(s)
const P25 = { id: 'p25', schoolId: 's1', label: 'FY 2025', periodEndDate: d('2025-06-30'), periodType: 'fy' }
const P26 = { id: 'p26', schoolId: 's1', label: 'FY 2026', periodEndDate: d('2026-06-30'), periodType: 'fy' }
const actor = { id: 'u1', firstName: 'Jacqui', lastName: 'Lee', email: 'j@x.org' } as never

type Lite = { id: string; fiscalPeriodId: string; role: string; createdAt: Date }

interface EnvOpts {
  target?: { id: string; schoolId: string; fiscalPeriodId: string; role: string } | null
  stack?: { id: string; sourceName: string; createdAt: Date; metadata: unknown }[]
  snapshots?: { id: string }[]
  /** lite imports BEFORE the removal and AFTER it (the reload). */
  liteBefore?: Lite[]
  liteAfter?: Lite[]
  cyRemaining?: number
  months?: { id: string; monthKey: string; sourceName: string; updatedAt: Date }[]
  budget?: Record<string, unknown> | null
  header?: Record<string, unknown> | null
  headerInLock?: Record<string, unknown> | null
  restoreThrows?: boolean
  generateThrowsFor?: string[]
}

function env(o: EnvOpts = {}) {
  const log: string[] = []
  const exec = vi.fn(async (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const sql = strings.join('?')
    if (sql.includes('pg_advisory_xact_lock')) {
      log.push(`lock:${vals.join(',')}`)
      return 1
    }
    const ids = vals.find(Array.isArray) as string[] | undefined
    if (sql.includes('INSERT INTO data_removal_items')) {
      log.push(`bin:${String(vals[1])}:${ids!.join(',')}`)
      return ids!.length
    }
    if (sql.includes('DELETE FROM')) {
      expect(sql).toMatch(/WHERE id = ANY\(\?::uuid\[\]\)/) // by the ids read, never by slot
      log.push(`delete:${ids!.join(',')}`)
      return ids!.length
    }
    if (sql.includes('jsonb_populate_record')) {
      const model = String(vals[vals.length - 1])
      log.push(`restore:${model}`)
      if (o.restoreThrows) throw new Error('column "x" violates not-null constraint')
      return 1
    }
    throw new Error(`unexpected SQL: ${sql}`)
  })
  let created = 0
  // restoreFromBin first reads which columns the binned JSON carries.
  const query = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join('?')
    if (sql.includes('information_schema.columns')) return [{ column_name: 'id' }, { column_name: 'created_at' }]
    throw new Error(`unexpected query: ${sql}`)
  })
  const tx = {
    $executeRaw: exec,
    $queryRaw: query,
    import: { findMany: vi.fn(async () => o.stack ?? []) },
    statementSnapshot: { findMany: vi.fn(async () => o.snapshots ?? []) },
    monthlySnapshot: {
      findMany: vi.fn(async (args: { where: { monthKey: { in: string[] } } }) =>
        (o.months ?? []).filter((m) => args.where.monthKey.in.includes(m.monthKey)),
      ),
    },
    periodBudget: {
      findUnique: vi.fn(async () => o.budget ?? null),
      delete: vi.fn(async () => {
        log.push('budget:delete-empty')
        return {}
      }),
    },
    dataRemoval: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        created += 1
        log.push(`header:create:${String(args.data.reason ?? 'removed')}`)
        return {
          id: `r${created}`,
          role: null,
          monthKeys: [],
          reason: 'removed',
          removedAt: d('2025-10-25T00:00:00Z'),
          ...args.data,
        }
      }),
      findFirst: vi.fn(async () => (o.headerInLock === undefined ? o.header : o.headerInLock) ?? null),
      delete: vi.fn(async () => {
        log.push('header:delete')
        return {}
      }),
    },
  }
  let liteCalls = 0
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    fiscalPeriod: { findMany: vi.fn(async () => [P25, P26]) },
    import: {
      findUnique: vi.fn(async () => (o.target === undefined ? { id: 'i1', schoolId: 's1', fiscalPeriodId: 'p25', role: 'cy' } : o.target)),
      findMany: vi.fn(async () => {
        liteCalls += 1
        return liteCalls === 1 ? (o.liteBefore ?? []) : (o.liteAfter ?? o.liteBefore ?? [])
      }),
      count: vi.fn(async () => o.cyRemaining ?? 0),
    },
    statementSnapshot: { count: vi.fn(async () => (o.snapshots ?? []).length) },
    boardReport: { findFirst: vi.fn(async () => null) },
    periodBudget: { findUnique: vi.fn(async () => o.budget ?? null) },
    monthlySnapshot: { findMany: vi.fn(async () => o.months ?? []) },
    dataRemoval: { findFirst: vi.fn(async () => o.header ?? null) },
    user: { findUnique: vi.fn(async () => ({ id: 'u1', firstName: 'Jacqui', lastName: 'Lee', email: 'j@x.org' })) },
    periodInsight: { deleteMany: vi.fn(async () => ({ count: 1 })) },
  }
  const periods = {
    getOwnedPeriod: vi.fn(async (_s: string, id: string) => (id === 'p26' ? P26 : P25)),
  }
  const statements = {
    generate: vi.fn(async (_a: unknown, _s: string, periodId: string) => {
      log.push(`generate:${periodId}`)
      if (o.generateThrowsFor?.includes(periodId)) throw new Error('engine failed')
      return {}
    }),
  }
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new FinanceRemovalsService(prisma as never, audit as never, periods as never, statements as never)
  return { svc, log, prisma, tx, statements, audit, exec }
}

const STACK = [
  { id: 'i2', sourceName: 'TB v2.xlsx', createdAt: d('2025-10-03T00:00:00Z'), metadata: { source: 'quickbooks' } },
  { id: 'i1', sourceName: 'TB v1.xlsx', createdAt: d('2025-09-12T00:00:00Z'), metadata: { statement: { partial: 'pl' } } },
]
const lite = (id: string, pid: string, role: string, at: string): Lite => ({ id, fiscalPeriodId: pid, role, createdAt: d(at) })
const LITE_BOTH = [lite('i2', 'p25', 'cy', '2025-10-03'), lite('i1', 'p25', 'cy', '2025-09-12'), lite('c26', 'p26', 'cy', '2026-08-01')]
const LITE_FY26_ONLY = [lite('c26', 'p26', 'cy', '2026-08-01')]

async function rejectBody(p: Promise<unknown>) {
  try {
    await p
  } catch (err) {
    const e = err as { getStatus(): number; getResponse(): Record<string, unknown> }
    return { status: e.getStatus(), ...e.getResponse() }
  }
  throw new Error('expected a rejection')
}

describe('FinanceRemovalsService.removeTrialBalance', () => {
  it('locks, bins exactly the ids it read (the whole stack + cy snapshots), then rebuilds later years', async () => {
    const { svc, log, statements, prisma, audit } = env({
      stack: STACK,
      snapshots: [{ id: 'sn1' }, { id: 'sn2' }],
      liteBefore: LITE_BOTH,
      liteAfter: LITE_FY26_ONLY,
    })
    const out = await svc.removeTrialBalance(actor, 's1', 'i1')
    expect(log.slice(0, 4)).toEqual([
      'lock:s1,p25',
      'header:create:removed',
      'bin:import:i2,i1',
      'delete:i2,i1',
    ])
    expect(log).toContain('bin:statement_snapshot:sn1,sn2')
    // No cy left → cleared (insights dropped), and FY26 lost its prior year → rebuilt.
    expect(prisma.periodInsight.deleteMany).toHaveBeenCalled()
    expect(out.effects).toEqual({ statements: 'cleared', rebuilt: [{ periodId: 'p26', shortLabel: 'FY26' }], failed: [] })
    expect(statements.generate).toHaveBeenCalledWith(actor, 's1', 'p26', {}, { trigger: 'data_removed' })
    expect(out.removal).toMatchObject({
      kind: 'trial_balance',
      role: 'cy',
      shortLabel: 'FY25',
      periodEndDate: '2025-06-30',
      removedBy: { id: 'u1', name: 'Jacqui Lee' },
      conflict: null,
    })
    expect(out.removal.files).toEqual([
      { sourceName: 'TB v2.xlsx', uploadedAt: '2025-10-03T00:00:00.000Z', half: null },
      { sourceName: 'TB v1.xlsx', uploadedAt: '2025-09-12T00:00:00.000Z', half: 'pl' },
    ])
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'finance_data.removed', targetType: 'data_removal', targetId: 'r1' }),
    )
  })

  it('bins snapshots only for the current year', async () => {
    const { svc, log, tx } = env({
      target: { id: 'py1', schoolId: 's1', fiscalPeriodId: 'p25', role: 'py' },
      stack: [{ id: 'py1', sourceName: 'PY.xlsx', createdAt: d('2025-10-01'), metadata: null }],
      snapshots: [{ id: 'sn1' }],
      cyRemaining: 1,
    })
    const out = await svc.removeTrialBalance(actor, 's1', 'py1')
    expect(tx.statementSnapshot.findMany).not.toHaveBeenCalled()
    expect(log.some((l) => l.startsWith('bin:statement_snapshot'))).toBe(false)
    // A cy remains → the period is regenerated with the removal trigger.
    expect(log).toContain('generate:p25')
    expect(out.effects.statements).toBe('rebuilt')
  })

  it('a stale expectedImportId → 409 CHANGED with what is there now', async () => {
    const { svc, log } = env({ stack: STACK })
    const body = await rejectBody(svc.removeTrialBalance(actor, 's1', 'i1', 'i1'))
    expect(body).toMatchObject({ status: 409, code: 'CHANGED', current: { importId: 'i2', sourceName: 'TB v2.xlsx' } })
    expect(log.some((l) => l.startsWith('bin:'))).toBe(false)
  })

  it('an empty stack → 404 NOTHING_TO_REMOVE', async () => {
    const { svc } = env({ stack: [] })
    expect(await rejectBody(svc.removeTrialBalance(actor, 's1', 'i1'))).toMatchObject({ status: 404, code: 'NOTHING_TO_REMOVE' })
  })

  it("another school's import → 404 IMPORT_NOT_FOUND", async () => {
    const { svc } = env({ target: { id: 'i1', schoolId: 'other', fiscalPeriodId: 'p25', role: 'cy' } })
    expect(await rejectBody(svc.removeTrialBalance(actor, 's1', 'i1'))).toMatchObject({
      status: 404,
      code: 'IMPORT_NOT_FOUND',
      message: "That trial balance isn't on file anymore.",
    })
  })

  it('a generate that throws lands in effects.failed and never fails the request', async () => {
    const { svc } = env({
      stack: STACK,
      liteBefore: LITE_BOTH,
      liteAfter: LITE_FY26_ONLY,
      generateThrowsFor: ['p26'],
    })
    const out = await svc.removeTrialBalance(actor, 's1', 'i1')
    expect(out.effects.failed).toEqual([{ periodId: 'p26', shortLabel: 'FY26' }])
    expect(out.effects.rebuilt).toEqual([])
  })

  it('a regen failure of the period itself reads "unchanged"', async () => {
    const { svc } = env({
      target: { id: 'py1', schoolId: 's1', fiscalPeriodId: 'p25', role: 'py' },
      stack: [{ id: 'py1', sourceName: 'PY.xlsx', createdAt: d('2025-10-01'), metadata: null }],
      cyRemaining: 1,
      generateThrowsFor: ['p25'],
    })
    expect((await svc.removeTrialBalance(actor, 's1', 'py1')).effects.statements).toBe('unchanged')
  })
})

describe('FinanceRemovalsService.preview', () => {
  it('names every file in the stack, the effects and the later year that loses its comparison', async () => {
    const { svc, prisma } = env({
      stack: STACK,
      snapshots: [{ id: 'sn1' }],
      liteBefore: LITE_BOTH,
      budget: { id: 'b', totalRevenue: 1, totalExpenses: null, lines: null, updatedAt: d('2025-10-01') },
    })
    // prisma.import.findMany is the stack read here too (outside a tx) — route by call shape.
    prisma.import.findMany = vi.fn(async (args: { where: { role?: string } }) =>
      args.where.role ? STACK : LITE_BOTH,
    ) as never
    const pv = await svc.preview('s1', { kind: 'trial_balance', importId: 'i1' })
    expect(pv).toMatchObject({ kind: 'trial_balance', shortLabel: 'FY25', role: 'cy', activeImportId: 'i2', restoreDays: 30 })
    expect(pv.files.map((f) => [f.importId, f.active, f.source, f.half])).toEqual([
      ['i2', true, 'quickbooks', null],
      ['i1', false, 'unknown', 'pl'],
    ])
    expect(pv.effects).toEqual({
      statements: 'emptied',
      boardReport: false,
      budgetVsActual: true,
      quickbooks: true,
      self: null,
      laterYears: [{ periodId: 'p26', shortLabel: 'FY26', comparison: 'prior-year', after: null }],
    })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('py: self says where this year compares from afterwards', async () => {
    const PY = [{ id: 'py26', sourceName: 'PY.xlsx', createdAt: d('2026-08-02'), metadata: null }]
    const { svc, prisma } = env({ target: { id: 'py26', schoolId: 's1', fiscalPeriodId: 'p26', role: 'py' } })
    const liteAll = [lite('c25', 'p25', 'cy', '2025-08-01'), lite('c26', 'p26', 'cy', '2026-08-01'), lite('py26', 'p26', 'py', '2026-08-02')]
    prisma.import.findMany = vi.fn(async (args: { where: { role?: string } }) => (args.where.role ? PY : liteAll)) as never
    const pv = await svc.preview('s1', { kind: 'trial_balance', importId: 'py26' })
    expect(pv.effects.statements).toBe('rebuilt')
    expect(pv.effects.self).toEqual({ comparison: 'prior-year', after: { periodId: 'p25', shortLabel: 'FY25' } })
  })

  it('400 BAD_TARGET when the kind is missing its fields', async () => {
    const { svc } = env()
    expect(await rejectBody(svc.preview('s1', { kind: 'trial_balance' }))).toMatchObject({ status: 400, code: 'BAD_TARGET', message: 'Say which trial balance to remove.' })
    expect(await rejectBody(svc.preview('s1', { kind: 'monthly', periodId: 'p25' }))).toMatchObject({ code: 'BAD_TARGET', message: 'Say which months to remove.' })
    expect(await rejectBody(svc.preview('s1', { kind: 'budget' }))).toMatchObject({ code: 'BAD_TARGET', message: "Say which year's budget to remove." })
  })
})

describe('FinanceRemovalsService.removeMonths / removeBudget', () => {
  const MONTHS = [
    { id: 'm3', monthKey: '2025-03', sourceName: 'Mar.xlsx', updatedAt: d('2025-04-02') },
    { id: 'm1', monthKey: '2025-01', sourceName: 'Jan.xlsx', updatedAt: d('2025-02-02') },
  ]

  it('removes only the months that exist, sorted', async () => {
    const { svc, log, statements } = env({ months: MONTHS })
    const out = await svc.removeMonths(actor, 's1', 'p25', ['2025-03', '2025-01', '2025-02'])
    expect(out.removal.monthKeys).toEqual(['2025-01', '2025-03'])
    expect(log).toContain('bin:monthly_snapshot:m1,m3')
    expect(out.effects).toEqual({ statements: 'none', rebuilt: [], failed: [] })
    expect(statements.generate).not.toHaveBeenCalled()
  })

  it('404 when none of the months are on file', async () => {
    const { svc } = env({ months: MONTHS })
    expect(await rejectBody(svc.removeMonths(actor, 's1', 'p25', ['2025-05']))).toMatchObject({ status: 404, code: 'NOTHING_TO_REMOVE' })
  })

  it('a budget that holds no numbers → 404', async () => {
    const { svc } = env({ budget: { id: 'b', totalRevenue: null, totalExpenses: null, lines: { notes: 'x' }, updatedAt: d('2025-10-01') } })
    expect(await rejectBody(svc.removeBudget(actor, 's1', 'p25'))).toMatchObject({ status: 404, code: 'NOTHING_TO_REMOVE' })
  })

  it('a present budget moves whole into the bin', async () => {
    const { svc, log } = env({ budget: { id: 'b', totalRevenue: 1, totalExpenses: 2, lines: { forecast: {} }, updatedAt: d('2025-10-01') } })
    const out = await svc.removeBudget(actor, 's1', 'p25')
    expect(log).toContain('bin:period_budget:b')
    expect(out.removal).toMatchObject({ kind: 'budget', budgetKind: 'totals' })
  })
})

describe('FinanceRemovalsService.restore', () => {
  const header = (over: Record<string, unknown> = {}) => ({
    id: 'r9',
    schoolId: 's1',
    fiscalPeriodId: 'p25',
    kind: 'trial_balance',
    role: 'cy',
    monthKeys: [],
    reason: 'removed',
    summary: { periodLabel: 'FY 2025', shortLabel: 'FY25', periodEndDate: '2025-06-30', periodType: 'fy', files: [{ importId: 'i2', sourceName: 'TB v2.xlsx', uploadedAt: '2025-10-03T00:00:00.000Z', half: null, source: 'upload', active: true }], months: [], budget: null, snapshotCount: 1 },
    removedBy: 'u1',
    removedAt: d('2025-10-20T00:00:00Z'),
    expiresAt: new Date(Date.now() + 86_400_000),
    ...over,
  })

  it("another school's (or a missing) removal → 404 REMOVAL_NOT_FOUND", async () => {
    const { svc } = env({ header: null })
    expect(await rejectBody(svc.restore(actor, 's1', 'r9'))).toMatchObject({ status: 404, code: 'REMOVAL_NOT_FOUND' })
  })

  it('expired → 410 REMOVAL_EXPIRED', async () => {
    const { svc } = env({ header: header({ expiresAt: new Date(Date.now() - 1000) }) })
    expect(await rejectBody(svc.restore(actor, 's1', 'r9'))).toMatchObject({ status: 410, code: 'REMOVAL_EXPIRED' })
  })

  it('a header gone by the time the lock is held → 404', async () => {
    const { svc } = env({ header: header(), headerInLock: null })
    expect(await rejectBody(svc.restore(actor, 's1', 'r9'))).toMatchObject({ status: 404, code: 'REMOVAL_NOT_FOUND' })
  })

  it('a filled slot → 409 SLOT_FILLED with what is there now', async () => {
    const { svc, log } = env({ header: header(), stack: [{ id: 'n1', sourceName: 'New.xlsx', createdAt: d('2025-10-24T00:00:00Z'), metadata: null }] })
    expect(await rejectBody(svc.restore(actor, 's1', 'r9'))).toMatchObject({
      status: 409,
      code: 'SLOT_FILLED',
      message: 'FY25 has newer data now.',
      current: { sourceName: 'New.xlsx', uploadedAt: '2025-10-24T00:00:00.000Z', monthKeys: [] },
    })
    expect(log.some((l) => l.startsWith('restore:'))).toBe(false)
  })

  it('replaceCurrent swaps: R2 (swapped_on_restore) first, then restore, then the header delete', async () => {
    const { svc, log, statements } = env({
      header: header(),
      stack: [{ id: 'n1', sourceName: 'New.xlsx', createdAt: d('2025-10-24T00:00:00Z'), metadata: null }],
      snapshots: [{ id: 'snNew' }],
      cyRemaining: 1,
    })
    const out = await svc.restore(actor, 's1', 'r9', { replaceCurrent: true })
    expect(log).toEqual([
      'lock:s1,p25',
      'header:create:swapped_on_restore',
      'bin:import:n1',
      'delete:n1',
      'bin:statement_snapshot:snNew',
      'delete:snNew',
      'restore:import',
      'restore:statement_snapshot',
      'header:delete',
      'generate:p25',
    ])
    expect(statements.generate).toHaveBeenCalledWith(actor, 's1', 'p25', {}, { trigger: 'data_restored' })
    expect(out.restored).toMatchObject({ id: 'r9', conflict: null, removedBy: { id: 'u1', name: 'Jacqui Lee' } })
    expect(out.replaced).toMatchObject({ id: 'r1', kind: 'trial_balance', files: [{ sourceName: 'New.xlsx' }] })
    expect(out.effects.statements).toBe('rebuilt')
  })

  it('an empty slot restores and rebuilds later years with data_restored', async () => {
    const { svc, statements } = env({
      header: header(),
      stack: [],
      cyRemaining: 1,
      liteBefore: LITE_FY26_ONLY,
      liteAfter: LITE_BOTH,
    })
    const out = await svc.restore(actor, 's1', 'r9')
    expect(out.replaced).toBeNull()
    expect(out.effects.rebuilt).toEqual([{ periodId: 'p26', shortLabel: 'FY26' }])
    expect(statements.generate).toHaveBeenCalledWith(actor, 's1', 'p26', {}, { trigger: 'data_restored' })
  })

  it('a SQL error while putting rows back → 409 RESTORE_FAILED, header kept', async () => {
    const { svc, log } = env({ header: header(), stack: [], restoreThrows: true })
    expect(await rejectBody(svc.restore(actor, 's1', 'r9'))).toMatchObject({
      status: 409,
      code: 'RESTORE_FAILED',
      message: "We couldn't bring this back. Nothing was changed.",
    })
    expect(log).not.toContain('header:delete')
  })

  it('monthly: only the conflicting months are swapped out', async () => {
    const { svc, log } = env({
      header: header({ kind: 'monthly', role: null, monthKeys: ['2025-03', '2025-04'] }),
      months: [
        { id: 'mNew', monthKey: '2025-03', sourceName: 'Mar new.xlsx', updatedAt: d('2025-10-24') },
        { id: 'mOther', monthKey: '2025-05', sourceName: 'May.xlsx', updatedAt: d('2025-10-24') },
      ],
    })
    const filled = await rejectBody(svc.restore(actor, 's1', 'r9'))
    expect(filled).toMatchObject({ code: 'SLOT_FILLED', current: { monthKeys: ['2025-03'] } })
    log.length = 0
    await svc.restore(actor, 's1', 'r9', { replaceCurrent: true })
    expect(log).toContain('bin:monthly_snapshot:mNew')
    expect(log).toContain('restore:monthly_snapshot')
  })

  it('budget: a row holding no numbers is dropped before the restore', async () => {
    const { svc, log } = env({
      header: header({ kind: 'budget', role: null }),
      budget: { id: 'empty', totalRevenue: null, totalExpenses: null, lines: null, updatedAt: d('2025-10-24') },
    })
    await svc.restore(actor, 's1', 'r9')
    expect(log.indexOf('budget:delete-empty')).toBeLessThan(log.indexOf('restore:period_budget'))
    expect(log.at(-1)).toBe('header:delete')
  })

  it('budget: a later forecast-only row fills the slot — 409, and a swap bins it (never a hard delete)', async () => {
    const forecastOnly = { id: 'fc', totalRevenue: null, totalExpenses: null, lines: { forecast: { revenue: 1 } }, notes: null, updatedAt: d('2025-10-24') }
    const { svc, log } = env({ header: header({ kind: 'budget', role: null }), budget: forecastOnly })
    expect(await rejectBody(svc.restore(actor, 's1', 'r9'))).toMatchObject({
      status: 409,
      code: 'SLOT_FILLED',
      current: { sourceName: null, uploadedAt: '2025-10-24T00:00:00.000Z', monthKeys: [] },
    })
    expect(log).not.toContain('budget:delete-empty')
    log.length = 0
    const out = await svc.restore(actor, 's1', 'r9', { replaceCurrent: true })
    expect(log).not.toContain('budget:delete-empty')
    expect(log.indexOf('header:create:swapped_on_restore')).toBeLessThan(log.indexOf('bin:period_budget:fc'))
    expect(log.indexOf('bin:period_budget:fc')).toBeLessThan(log.indexOf('restore:period_budget'))
    expect(out.replaced).toMatchObject({ kind: 'budget' })
  })

  it('budget: a notes-only row also fills the slot', async () => {
    const { svc } = env({
      header: header({ kind: 'budget', role: null }),
      budget: { id: 'n', totalRevenue: null, totalExpenses: null, lines: null, notes: 'Board asked for 3% raises', updatedAt: d('2025-10-24') },
    })
    expect(await rejectBody(svc.restore(actor, 's1', 'r9'))).toMatchObject({ code: 'SLOT_FILLED' })
  })
})

import 'reflect-metadata'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Logger } from '@nestjs/common'
import { DEFAULT_MAPPING, categoryDef } from '@finrep/engine'
import { ingest } from '@finrep/ingestion'
import { AUTO_MAP_MAX, statementAutoMapping, statementSectionsOf } from './statement-auto-map.js'
import { ImportsService } from './imports.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// A1 (owner live report 2026-10-15): a QuickBooks "Financial Statements"
// workbook imported into a fresh school saved 34 accounts, but the Finance page
// said "We can't read these accounts yet": every 5-digit account was unmapped,
// and the name-only guesses waited on a review step nobody found. A statement
// export knows each account's report SECTION, so the server merges the SURE
// section-backed category for every account the school's mapping doesn't know
// — on every save path, including a KYRO-chat import with no review step.
// ─────────────────────────────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url))
const XLSX = createRequire(join(here, '../../../../packages/ingestion/package.json'))('xlsx') as {
  utils: {
    book_new: () => unknown
    aoa_to_sheet: (rows: unknown[][]) => unknown
    book_append_sheet: (wb: unknown, ws: unknown, name: string) => void
  }
  write: (wb: unknown, opts: { type: 'buffer'; bookType: 'xlsx' }) => Buffer
}

/** The default chart's effective entries (what a fresh school's mapping knows). */
const DEFAULTS = DEFAULT_MAPPING.entries as unknown as Record<string, unknown>
const sectionOf = (cat: string | undefined) => (cat ? categoryDef(cat as never)?.section : undefined)

// ── The Holy Family Academy sample, as the owner exported it ─────────────────
// (/home/dream/.cache/kyro-samples/make.mjs — a two-sheet "Financial
// Statements" workbook: P&L Budget vs Actual + Balance Sheet.)
const CO = 'Holy Family Academy'
const I = (n: number, s: string) => '   '.repeat(n) + s
const INCOME: Array<[string, number, number]> = [
  ['40100 Tuition', 3850000, 3900000],
  ['40200 Registration Fees', 96000, 90000],
  ['40900 Tuition Assistance', -310000, -300000],
  ['41000 Contributions without Donor Restrictions', 245000, 220000],
  ['41100 Contributions with Donor Restrictions', 120000, 100000],
  ['42000 Fundraising Events', 88500, 95000],
  ['43000 Auxiliary - Aftercare', 64200, 60000],
  ['44000 Investment Income', 18300, 12000],
]
const EXPENSE: Array<[string, number, number]> = [
  ['60100 Salaries - Faculty', 2140000, 2100000],
  ['60200 Salaries - Administration', 412000, 405000],
  ['61000 Payroll Taxes & Benefits', 598000, 590000],
  ['62000 Instructional Supplies', 86400, 90000],
  ['63000 Technology', 74800, 70000],
  ['64000 Facilities & Maintenance', 236500, 220000],
  ['65000 Utilities', 142300, 135000],
  ['66000 Insurance', 98700, 95000],
  ['67000 Diocesan Assessment', 124000, 124000],
  ['68000 Professional Fees', 41600, 40000],
  ['69000 Depreciation', 155000, 150000],
]
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 10000) / 100 : null)
const sum = (rows: Array<[string, number, ...number[]]>, i: number) => rows.reduce((a, r) => a + (r[i] as number), 0)
const line = (label: string, a: number, b: number) => [label, a, b, a - b, pct(a, b)]

function holyFamilyWorkbook(): ArrayBuffer {
  const ti = [sum(INCOME, 1), sum(INCOME, 2)] as const
  const te = [sum(EXPENSE, 1), sum(EXPENSE, 2)] as const
  const pl: unknown[][] = [
    [CO], ['Profit and Loss Budget vs. Actual'], ['July 2025 - June 2026'], [],
    ['', 'Actual', 'Budget', 'over Budget', '% of Budget'],
    [I(1, 'Income')], ...INCOME.map(([l, a, b]) => line(I(2, l), a, b)),
    line(I(1, 'Total Income'), ti[0], ti[1]),
    line(I(0, 'Gross Profit'), ti[0], ti[1]),
    [I(1, 'Expenses')], ...EXPENSE.map(([l, a, b]) => line(I(2, l), a, b)),
    line(I(1, 'Total Expenses'), te[0], te[1]),
    line('Net Operating Income', ti[0] - te[0], ti[1] - te[1]),
    line('Net Income', ti[0] - te[0], ti[1] - te[1]),
    [], ['Cash Basis  Wednesday, July 15, 2026 09:42 AM GMT-04:00'],
  ]
  const net = ti[0] - te[0]
  const bank: Array<[string, number]> = [['10100 Operating Checking', 612400], ['10200 Savings - Reserve', 1050000], ['10300 Payroll Account', 48600]]
  const otherCur: Array<[string, number]> = [['11000 Tuition Receivable', 184300], ['11500 Pledges Receivable', 95000], ['12000 Prepaid Expenses', 42700]]
  const fixed: Array<[string, number]> = [['15000 Buildings & Improvements', 4850000], ['15500 Furniture & Equipment', 620000], ['17000 Accumulated Depreciation', -2310000]]
  const ap: Array<[string, number]> = [['20000 Accounts Payable', 118400]]
  const ocl: Array<[string, number]> = [['21000 Accrued Payroll', 236900], ['24110 Deferred Tuition', 512000]]
  const ltl: Array<[string, number]> = [['25000 Note Payable - Diocese', 400000]]
  const s1 = (r: Array<[string, number]>) => r.reduce((a, x) => a + x[1], 0)
  const tBank = s1(bank), tCur = tBank + s1(otherCur), tFixed = s1(fixed), tAssets = tCur + tFixed
  const tCurLiab = s1(ap) + s1(ocl), tLiab = tCurLiab + s1(ltl)
  const restricted = 380000
  const unrestricted = tAssets - tLiab - restricted - net
  const equity: Array<[string, number]> = [['30000 Net Assets Without Donor Restrictions', unrestricted], ['31000 Net Assets With Donor Restrictions', restricted], ['Net Income', net]]
  const tEq = s1(equity)
  const v = (l: string, n: number) => [l, n]
  const bs: unknown[][] = [
    [CO], ['Balance Sheet'], ['As of June 30, 2026'], [],
    ['', 'Total'],
    ['ASSETS'], [I(1, 'Current Assets')], [I(2, 'Bank Accounts')], ...bank.map(([l, n]) => v(I(3, l), n)),
    v(I(2, 'Total Bank Accounts'), tBank), [I(2, 'Other Current Assets')], ...otherCur.map(([l, n]) => v(I(3, l), n)),
    v(I(2, 'Total Other Current Assets'), s1(otherCur)), v(I(1, 'Total Current Assets'), tCur),
    [I(1, 'Fixed Assets')], ...fixed.map(([l, n]) => v(I(2, l), n)), v(I(1, 'Total Fixed Assets'), tFixed),
    v('TOTAL ASSETS', tAssets),
    ['LIABILITIES AND EQUITY'], [I(1, 'Liabilities')], [I(2, 'Current Liabilities')],
    [I(3, 'Accounts Payable')], ...ap.map(([l, n]) => v(I(4, l), n)), v(I(3, 'Total Accounts Payable'), s1(ap)),
    [I(3, 'Other Current Liabilities')], ...ocl.map(([l, n]) => v(I(4, l), n)), v(I(3, 'Total Other Current Liabilities'), s1(ocl)),
    v(I(2, 'Total Current Liabilities'), tCurLiab),
    [I(2, 'Long Term Liabilities')], ...ltl.map(([l, n]) => v(I(3, l), n)), v(I(2, 'Total Long Term Liabilities'), s1(ltl)),
    v(I(1, 'Total Liabilities'), tLiab),
    [I(1, 'Equity')], ...equity.map(([l, n]) => v(I(2, l), n)), v(I(1, 'Total Equity'), tEq),
    v('TOTAL LIABILITIES AND EQUITY', tLiab + tEq),
    [], ['Cash Basis  Wednesday, July 15, 2026 09:44 AM GMT-04:00'],
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pl), 'Profit and Loss')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bs), 'Balance Sheet')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('statementAutoMapping — the Holy Family Academy workbook', () => {
  const parsed = ingest('Holy Family Academy Financial Statements 6-30-26.xlsx', holyFamilyWorkbook())
  const total = (acct: number) => parsed.rows.find((r) => r.acct === acct)?.total

  it('reads as one full statement with the expected totals (income, expense, net, assets)', () => {
    const md = parsed.metadata!
    expect(md.statement?.partial).toBe('full')
    expect(md.periodEndDate).toBe('2026-06-30')
    const sections = statementSectionsOf(md)!
    expect(sections).not.toBeNull()
    const inSections = (keys: string[]) => (r: { acct: number }) => keys.includes(sections[String(r.acct)]?.section ?? '')
    const income = -parsed.rows.filter(inSections(['income', 'otherIncome'])).reduce((t, r) => t + r.total, 0)
    const expense = parsed.rows.filter(inSections(['expenses', 'otherExpense'])).reduce((t, r) => t + r.total, 0)
    expect(income).toBe(4172000)
    expect(expense).toBe(4109300)
    expect(income - expense).toBe(62700)
    const ASSET_SECTIONS = new Set(['bank', 'accountsReceivable', 'otherCurrentAssets', 'currentAssets', 'fixedAssets', 'otherAssets', 'assets'])
    const assets = parsed.rows
      .filter((r) => ASSET_SECTIONS.has(sections[String(r.acct)]?.section ?? ''))
      .reduce((t, r) => t + r.total, 0)
    expect(assets).toBe(5193000)
    expect(total(41000)).toBe(-245000)
  })

  it('★ a fresh school (default chart only) gets every P&L + BS account sorted — by SECTION, not by name', () => {
    const patch = statementAutoMapping(parsed.rows, parsed.metadata, DEFAULTS)
    // The two lines a name rule alone files as balance-sheet net assets are INCOME here.
    expect(sectionOf(patch['41000'])).toBe('revenue')
    expect(sectionOf(patch['41100'])).toBe('revenue')
    expect(patch['44000']).toBe('investments')
    expect(sectionOf(patch['67000'])).toBe('expense')
    expect(patch['10300']).toBe('cash')
    expect(patch['17000']).toBe('accumDepr')
    // Every pick is a real SCoA category whose section matches the report's.
    const sections = statementSectionsOf(parsed.metadata)!
    for (const [acct, cat] of Object.entries(patch)) {
      const fact = sections[acct]!
      const sec = sectionOf(cat)
      expect(sec, `${acct} → ${cat}`).toBeDefined()
      if (fact.statement === 'pl') expect(['revenue', 'expense']).toContain(sec)
      else expect(['asset', 'liability', 'netAssets']).toContain(sec)
    }
    // Most of the file is sorted without asking anyone.
    expect(Object.keys(patch).length).toBeGreaterThanOrEqual(25)
  })

  it('an account the school already mapped is never re-pointed', () => {
    const patch = statementAutoMapping(parsed.rows, parsed.metadata, { ...DEFAULTS, 41000: 'support', '44000': 'other' })
    expect(patch['41000']).toBeUndefined()
    expect(patch['44000']).toBeUndefined()
    expect(patch['41100']).toBeDefined()
  })
})

describe('statementAutoMapping — guards', () => {
  const rows = [
    { acct: 41000, desc: 'Contributions without Donor Restrictions', total: -245000 },
    { acct: 10300, desc: 'Payroll Account', total: 48600 },
  ]
  const md = (sections: unknown) => ({ source: 'upload', statement: { type: 'pl', partial: 'full', sections } })

  it('a plain trial balance (no section facts) is untouched — confirm-first stays', () => {
    expect(statementAutoMapping(rows, { source: 'upload', rowCount: 2 }, {})).toEqual({})
    expect(statementAutoMapping(rows, undefined, {})).toEqual({})
    expect(statementAutoMapping(rows, md(undefined), {})).toEqual({})
  })

  it('malformed client-written section facts are ignored', () => {
    expect(
      statementSectionsOf(md({ 41000: { statement: 'xx', section: 'income' }, abc: { statement: 'pl', section: 'income' }, 10300: 'bank' })),
    ).toBeNull()
    expect(statementAutoMapping(rows, md({ 41000: { statement: 'pl', section: 42 } }), {})).toEqual({})
  })

  it('applies only SURE suggestions (a position-only class waits for a person)', () => {
    const patch = statementAutoMapping(
      rows,
      md({
        41000: { statement: 'pl', section: 'income', basis: 'position' },
        10300: { statement: 'bs', section: 'bank', basis: 'section' },
      }),
      {},
    )
    expect(patch).toEqual({ 10300: 'cash' })
  })

  it('caps one import at AUTO_MAP_MAX picks', () => {
    const many = Array.from({ length: AUTO_MAP_MAX + 20 }, (_, i) => ({ acct: 100000 + i, desc: 'Operating Checking', total: 1 }))
    const sections = Object.fromEntries(many.map((r) => [String(r.acct), { statement: 'bs', section: 'bank' }]))
    expect(Object.keys(statementAutoMapping(many, md(sections), {}))).toHaveLength(AUTO_MAP_MAX)
  })
})

describe('ImportsService.create — merges the sorted accounts before anything generates', () => {
  const user = { id: 'u1' } as never
  const sectioned = {
    source: 'upload',
    statement: {
      type: 'pl',
      partial: 'full',
      sections: {
        41000: { statement: 'pl', section: 'income' },
        10300: { statement: 'bs', section: 'bank' },
        99999: { statement: 'pl', section: 'expenses' },
      },
    },
  }
  const dto = (metadata?: unknown) =>
    ({
      role: 'cy',
      periodEndDate: '2026-06-30',
      periodType: 'fiscal_year',
      sourceName: 'Holy Family Academy Financial Statements 6-30-26.xlsx',
      rows: [
        { acct: 41000, desc: 'Contributions without Donor Restrictions', total: -245000 },
        { acct: 10300, desc: 'Payroll Account', total: 48600 },
        { acct: 401, desc: 'Tuition', total: -1 },
      ],
      ...(metadata ? { metadata } : {}),
    }) as never

  function make(mapping?: unknown) {
    const created = { id: 'imp1', schoolId: 's1', fiscalPeriodId: 'p1', role: 'cy', sourceName: 'x', rows: [], metadata: null, rowCount: 3, uploadedBy: 'u1', createdAt: new Date() }
    const prisma = { import: { create: vi.fn(async () => created) } }
    const audit = { write: vi.fn(async () => undefined) }
    const periods = { resolveForImport: vi.fn(async () => ({ period: { id: 'p1' } })) }
    return new ImportsService(prisma as never, audit as never, periods as never, {} as never, mapping as never)
  }
  const mappingStub = (entries: Record<string, string> = { 401: 'tuition' }) => ({
    ensureActive: vi.fn(async () => ({ chart: { mapping: { entries } } })),
    mergeEntries: vi.fn(async () => ({ mappingVersion: 'v', entriesCount: 1, merged: 1 })),
  })

  it('★ a statement import merges its sure, not-yet-known accounts into the school mapping', async () => {
    const mapping = mappingStub()
    await make(mapping).create(user, 's1', dto(sectioned))
    expect(mapping.mergeEntries).toHaveBeenCalledTimes(1)
    const [schoolId, patch, opts] = mapping.mergeEntries.mock.calls[0] as unknown as [string, Record<string, string>, { onlyNew?: boolean }]
    expect(schoolId).toBe('s1')
    // Fill-only: a manual pick landing between the read and this write is never overwritten.
    expect(opts).toEqual({ onlyNew: true })
    expect(sectionOf(patch['41000'])).toBe('revenue')
    expect(patch['10300']).toBe('cash')
    expect(patch['401']).toBeUndefined() // already known
    expect(patch['99999']).toBeUndefined() // no such row in the file
  })

  it('a plain trial balance never touches the mapping', async () => {
    const mapping = mappingStub()
    await make(mapping).create(user, 's1', dto({ source: 'upload', rowCount: 3 }))
    await make(mapping).create(user, 's1', dto())
    expect(mapping.ensureActive).not.toHaveBeenCalled()
    expect(mapping.mergeEntries).not.toHaveBeenCalled()
  })

  it('nothing new to sort → no merge call', async () => {
    const mapping = mappingStub({ 401: 'tuition', 41000: 'development', 10300: 'cash' })
    await make(mapping).create(user, 's1', dto(sectioned))
    expect(mapping.mergeEntries).not.toHaveBeenCalled()
  })

  it('a mapping failure never fails the import (the accounts just stay to review)', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    try {
      const mapping = { ...mappingStub(), mergeEntries: vi.fn(async () => Promise.reject(new Error('db down'))) }
      await expect(make(mapping).create(user, 's1', dto(sectioned))).resolves.toMatchObject({ id: 'imp1' })
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/statement auto-sort skipped: db down/))
    } finally {
      warn.mockRestore()
    }
  })

  it('no MappingService (positional-arg specs) → skipped, import still saved', async () => {
    await expect(make(undefined).create(user, 's1', dto(sectioned))).resolves.toMatchObject({ id: 'imp1' })
  })
})

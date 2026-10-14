// ─────────────────────────────────────────────────────────────
// Ingestion (issue #31): QuickBooks statement EXPORTS in their natural form
// — Profit and Loss / Statement of Activity, Balance Sheet, Budget vs
// Actuals — read "just like a TB". Fixtures are built with xlsx aoa_to_sheet
// in the exact row shapes QBO's Export-to-Excel produces (banner rows,
// section rows with no value, `Total …` subtotals, computed Net Income).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  ingest,
  classifyRole,
  parseTrialBalance,
  isStatementExport,
  detectStatementType,
  parseStatementGrid,
  parseStatementWorkbook,
  parseStatementCsv,
  mergeStatementResults,
  parseMoney,
  bannerDates,
  applyBalancePlug,
  PLUG_ACCT,
  QBO_REVENUE_BASE,
  QBO_EXPENSE_BASE,
  QBO_SYNTHETIC_OFFSET,
  QBO_SYNTHETIC_SPAN,
  syntheticOffset,
  BS_ENGINE_ACCT,
  sectionSign,
  pnlGroupSign,
  bsGroupSign,
  bsSectionFromGroups,
} from '../src/index.js'

/** The export adapter's number for an unnumbered P&L leaf (no collisions in these fixtures). */
const rev = (name: string): number => QBO_REVENUE_BASE + syntheticOffset(name)
const exp = (name: string): number => QBO_EXPENSE_BASE + syntheticOffset(name)

const here = dirname(fileURLToPath(import.meta.url))
const sampleDir = resolve(here, '..', '..', '..', 'sample-data')

function loadSample(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(sampleDir, name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/** Build an xlsx ArrayBuffer from one or more {name → rows} sheets. */
function workbook(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return out
}

function gridOf(rows: unknown[][]): unknown[][] {
  // Round-trip through xlsx so the grid is exactly what the adapter sees.
  const wb = XLSX.read(new Uint8Array(workbook({ S: rows })), { type: 'array' })
  return XLSX.utils.sheet_to_json(wb.Sheets['S']!, { header: 1, defval: null }) as unknown[][]
}

const sum = (rows: Array<{ total: number }>): number =>
  Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** (a) QBO Profit and Loss export: names only, nested Other Income, Total rows, computed rows. */
const PL_ROWS: unknown[][] = [
  ['Sample School'],
  ['Profit and Loss'],
  ['July 2025 - June 2026'],
  [],
  [null, 'Total'],
  ['Income'],
  ['   Tuition', 500000],
  ['   Fees', 20000],
  ['   Other Income'],
  ['      Interest', 1000],
  ['   Total Other Income', 1000],
  ['Total Income', 521000],
  ['Gross Profit', 521000],
  ['Expenses'],
  ['   Salaries', 300000],
  ['   Supplies', 25000],
  ['Total Expenses', 325000],
  ['Net Operating Income', 196000],
  ['Net Income', 196000],
]

/** (b) The customer's Statement of Activity: Acct | Desc | Actual with 5-digit numbers. */
const SOA_ROWS: unknown[][] = [
  ['Sample School'],
  ['Statement of Activity'],
  ['July 2025 - June 2026'],
  [],
  ['Acct', 'Desc', 'Actual'],
  [null, 'Income'],
  [40000, '40000 Income', -26301.61],
  [40009, '40009 Discounts and Assistance', 53550],
  [40200, '40200 Income - Monthly Tuition Installments', 488257.5],
  [null, 'Total Income', 515505.89],
  [null, 'Expenses'],
  [60100, '60100 Salaries', 300000],
  [null, 'Total Expenses', 300000],
  [null, 'Net Income', 215505.89],
]

/** (c) Budget vs Actuals: Actual | Budget | over Budget | % of Budget. */
const BVA_ROWS: unknown[][] = [
  ['Sample School'],
  ['Budget vs. Actuals: FY2026 Budget - FY26 P&L'],
  ['July 2025 - June 2026'],
  [],
  [null, 'Actual', 'Budget', 'over Budget', '% of Budget'],
  ['Income'],
  ['   Tuition', 500000, 480000, 20000, '104.17 %'],
  ['   Fees', 20000, 25000, -5000, '80.00 %'],
  ['Total Income', 520000, 505000, 15000, '102.97 %'],
  ['Expenses'],
  ['   Salaries', 300000, 310000, -10000, '96.77 %'],
  ['Total Expenses', 300000, 310000, -10000, '96.77 %'],
  ['Net Operating Income', 220000, 195000, 25000, '112.82 %'],
  ['Net Income', 220000, 195000, 25000, '112.82 %'],
]

/** (d) Balance Sheet export: the full QBO section tree + computed TOTAL rows. */
const BS_ROWS: unknown[][] = [
  ['Sample School'],
  ['Balance Sheet'],
  ['As of June 30, 2026'],
  ['Accrual Basis'],
  [],
  [null, 'Total'],
  ['ASSETS'],
  ['   Current Assets'],
  ['      Bank Accounts'],
  ['         Checking', 150000],
  ['         Savings', 50000],
  ['      Total Bank Accounts', 200000],
  ['      Accounts Receivable'],
  ['         Accounts Receivable (A/R)', 30000],
  ['      Total Accounts Receivable', 30000],
  ['      Other Current Assets'],
  ['         Prepaid Expenses', 5000],
  ['      Total Other Current Assets', 5000],
  ['   Total Current Assets', 235000],
  ['   Fixed Assets'],
  ['      Buildings', 400000],
  ['      Accumulated Depreciation', -100000],
  ['   Total Fixed Assets', 300000],
  ['TOTAL ASSETS', 535000],
  ['LIABILITIES AND EQUITY'],
  ['   Liabilities'],
  ['      Current Liabilities'],
  ['         Accounts Payable'],
  ['            Accounts Payable (A/P)', 20000],
  ['         Total Accounts Payable', 20000],
  ['         Other Current Liabilities'],
  ['            Deferred Tuition', 100000],
  ['         Total Other Current Liabilities', 100000],
  ['      Total Current Liabilities', 120000],
  ['      Long-Term Liabilities'],
  ['         Mortgage', 200000],
  ['      Total Long-Term Liabilities', 200000],
  ['   Total Liabilities', 320000],
  ['   Equity'],
  ['      Opening Balance Equity', 19000],
  ['      Net Income', 196000],
  ['   Total Equity', 215000],
  ['TOTAL LIABILITIES AND EQUITY', 535000],
]

/** Multi-period P&L: one column per month + Total. */
const PL_MONTHLY_ROWS: unknown[][] = [
  ['Sample School'],
  ['Profit and Loss'],
  ['July - September 2025'],
  [],
  [null, 'Jul 2025', 'Aug 2025', 'Sep 2025', 'Total'],
  ['Income'],
  ['   Tuition', 100, 200, 300, 600],
  ['Total Income', 100, 200, 300, 600],
  ['Expenses'],
  ['   Salaries', 50, 60, 70, 180],
  ['Total Expenses', 50, 60, 70, 180],
  ['Net Income', 50, 140, 230, 420],
]

// ── Detection ─────────────────────────────────────────────────────────────────

describe('statement detection', () => {
  it('recognises each report by its banner', () => {
    expect(detectStatementType('Profit and Loss')).toBe('pl')
    expect(detectStatementType('Statement of Activity')).toBe('pl')
    expect(detectStatementType('Balance Sheet')).toBe('bs')
    expect(detectStatementType('Statement of Financial Position')).toBe('bs')
    expect(detectStatementType('Budget vs. Actuals: FY2026 Budget - FY26 P&L')).toBe('bva')
    expect(detectStatementType('Budget Overview: FY26')).toBe('bva')
    expect(detectStatementType('Trial Balance')).toBeUndefined()
  })

  it('detects the four export shapes', () => {
    expect(isStatementExport(gridOf(PL_ROWS))).toBe(true)
    expect(isStatementExport(gridOf(SOA_ROWS))).toBe(true)
    expect(isStatementExport(gridOf(BVA_ROWS))).toBe(true)
    expect(isStatementExport(gridOf(BS_ROWS))).toBe(true)
  })

  it('detects a title-less export by structure alone (section row + Total row)', () => {
    const noBanner = PL_ROWS.slice(4) // drop company / title / period rows
    expect(detectStatementType(noBanner.flat().join(' '))).toBeUndefined()
    expect(isStatementExport(gridOf(noBanner))).toBe(true)
  })

  it('(e) does NOT detect a plain trial balance as a statement', () => {
    const wb = XLSX.read(new Uint8Array(loadSample('TB_CurrentYear_FY26.xlsx')), { type: 'array' })
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, defval: null }) as unknown[][]
    expect(isStatementExport(grid)).toBe(false)
    // …nor a TB that happens to end with a "Total" footer.
    const tb = gridOf([
      ['Trial Balance'],
      ['Number', 'Description', 'Debit', 'Credit', 'Total'],
      [100, 'Cash', 100, 0, 100],
      [401, 'Tuition', 0, 100, -100],
      ['Total', '', 100, 100, 0],
    ])
    expect(isStatementExport(tb)).toBe(false)
  })
})

// ── (a) Profit and Loss, names only ───────────────────────────────────────────

describe('(a) Profit and Loss export (names only)', () => {
  const res = parseStatementGrid(gridOf(PL_ROWS), 'Profit and Loss')!

  it('keeps only leaf accounts — no Total / Gross Profit / Net rows', () => {
    expect(res).not.toBeNull()
    expect(res.rows.map((r) => r.desc)).toEqual(['Tuition', 'Fees', 'Interest', 'Salaries', 'Supplies'])
  })

  it('applies the TB sign convention per section', () => {
    expect(res.rows.find((r) => r.desc === 'Tuition')!.total).toBe(-500000)
    expect(res.rows.find((r) => r.desc === 'Interest')!.total).toBe(-1000) // nested Other Income
    expect(res.rows.find((r) => r.desc === 'Salaries')!.total).toBe(300000)
  })

  it('never double-counts: leaf sums equal the report’s own Total rows', () => {
    const revenue = res.rows.filter((r) => r.acct > QBO_REVENUE_BASE && r.acct < QBO_EXPENSE_BASE)
    const expense = res.rows.filter((r) => r.acct > QBO_EXPENSE_BASE)
    expect(sum(revenue)).toBe(-521000) // Total Income
    expect(sum(expense)).toBe(325000) // Total Expenses
    expect(sum(res.rows)).toBe(-196000) // Net Income (credit)
  })

  it('synthesises block-base + a stable NAME hash (not an order) and records them for re-keying', () => {
    // base + 1000 + fnv1a(name) % 8000 — the live sync owns base + id (< +1000).
    expect(res.rows.map((r) => r.acct)).toEqual([rev('Tuition'), rev('Fees'), rev('Interest'), exp('Salaries'), exp('Supplies')])
    expect(res.rows.map((r) => r.acct)).toEqual([45187, 43064, 46139, 63851, 63038]) // pinned: a hash change re-keys every school
    for (const r of res.rows) {
      const base = r.acct < QBO_EXPENSE_BASE ? QBO_REVENUE_BASE : QBO_EXPENSE_BASE
      expect(r.acct - base).toBeGreaterThanOrEqual(QBO_SYNTHETIC_OFFSET)
      expect(r.acct - base).toBeLessThan(QBO_SYNTHETIC_OFFSET + QBO_SYNTHETIC_SPAN)
    }
    expect(res.metadata.statement.synthesized).toEqual([
      { acct: rev('Tuition'), name: 'Tuition', section: 'revenue' },
      { acct: rev('Fees'), name: 'Fees', section: 'revenue' },
      { acct: rev('Interest'), name: 'Interest', section: 'revenue' },
      { acct: exp('Salaries'), name: 'Salaries', section: 'expense' },
      { acct: exp('Supplies'), name: 'Supplies', section: 'expense' },
    ])
    // Stable across a re-upload of the same file.
    const again = parseStatementGrid(gridOf(PL_ROWS), 'Profit and Loss')!
    expect(again.rows).toEqual(res.rows)
  })

  it('keeps a later export’s numbers when a row is inserted or a zero turns into a value', () => {
    const withZero = PL_ROWS.flatMap((r) => (r[0] === '   Fees' ? [['   Grants', 0], r] : [r]))
    const later = withZero.map((r) => (r[0] === '   Grants' ? ['   Grants', 5] : r))
    const a = parseStatementGrid(gridOf(withZero), 'Profit and Loss')!
    const b = parseStatementGrid(gridOf(later), 'Profit and Loss')!
    // Zero leaves are KEPT (the plain TB keeps zeros; mapping needs the full chart).
    expect(a.rows.find((r) => r.desc === 'Grants')).toEqual({ acct: rev('Grants'), desc: 'Grants', total: 0 })
    expect(b.rows.find((r) => r.desc === 'Grants')!.total).toBe(-5)
    expect(a.rows.map((r) => [r.desc, r.acct])).toEqual(b.rows.map((r) => [r.desc, r.acct]))
    expect(b.rows.find((r) => r.desc === 'Tuition')!.acct).toBe(res.rows.find((r) => r.desc === 'Tuition')!.acct)
  })

  it('skips forward on a hash collision or a number an explicit account already uses', () => {
    const rows: unknown[][] = [
      ['Profit and Loss'],
      ['July 2025 - June 2026'],
      [],
      [null, 'Total'],
      ['Income'],
      [`${rev('Tuition')} Numbered`, 10], // an explicit account sitting on Tuition's hash
      ['   Tuition', 20],
      ['   Tuition', 30], // same name twice → same hash → next free number
      ['Total Income', 60],
    ]
    const r = parseStatementGrid(gridOf(rows), 'P&L')!
    expect(r.rows.map((x) => x.acct)).toEqual([rev('Tuition'), rev('Tuition') + 1, rev('Tuition') + 2])
    expect(new Set(r.rows.map((x) => x.acct)).size).toBe(3)
  })

  it('reads the period from the banner range and flags the P&L half', () => {
    const m = res.metadata
    expect(m.statement.type).toBe('pl')
    expect(m.statement.partial).toBe('pl')
    expect(m.statement.title).toBe('Profit and Loss')
    expect(m.periodEndDate).toBe('2026-06-30')
    expect(m.periodEndSource).toBe('explicit')
    expect(m.statement.periodStart).toBe('2025-07-01')
    expect(m.fiscalYear).toBe(2026)
    expect(m.statement.column).toBe('Total')
    expect(m.net).toBe(-196000)
    expect(m.accountCount).toBe(5)
  })
})

// ── (b) Statement of Activity: Acct | Desc | Actual, 5-digit ──────────────────

describe('(b) Statement of Activity with Acct | Desc | Actual (5-digit numbers)', () => {
  it('keeps the explicit 5-digit numbers and flips natural-positive income to credits', () => {
    const res = parseStatementGrid(gridOf(SOA_ROWS), 'Statement of Activity')!
    expect(res.rows).toEqual([
      { acct: 40000, desc: '40000 Income', total: 26301.61 },
      { acct: 40009, desc: '40009 Discounts and Assistance', total: -53550 },
      { acct: 40200, desc: '40200 Income - Monthly Tuition Installments', total: -488257.5 },
      { acct: 60100, desc: '60100 Salaries', total: 300000 },
    ])
    // Σ revenue leaves == −Total Income; nothing synthesised.
    expect(sum(res.rows.filter((r) => r.acct < 60000))).toBe(-515505.89)
    expect(res.metadata.statement.synthesized).toEqual([])
    expect(res.metadata.statement.column).toBe('Actual')
    expect(res.metadata.periodEndDate).toBe('2026-06-30')
  })

  it('still signs a FLAT numbered export (no section rows) by the account block', () => {
    const flat = SOA_ROWS.filter((r) => !(r[0] === null && typeof r[1] === 'string' && /^(Income|Expenses)$/.test(r[1])))
    const res = parseStatementGrid(gridOf(flat), 'Statement of Activity')!
    expect(res.rows.find((r) => r.acct === 40200)!.total).toBe(-488257.5)
    expect(res.rows.find((r) => r.acct === 60100)!.total).toBe(300000)
  })

  it('goes through the ingest facade with the statement result winning', () => {
    const res = ingest('Statement_of_Activity.xlsx', workbook({ 'Statement of Activity': SOA_ROWS }))
    expect(res.metadata?.statement?.type).toBe('pl')
    expect(res.rows.find((r) => r.acct === 40200)!.total).toBe(-488257.5)
    expect(res.sourceName).toBe('Statement_of_Activity.xlsx')
    expect(res.metadata?.sourceName).toBe('Statement_of_Activity.xlsx')
  })

  it('parses the same shape exported as CSV (with accounting-style negatives)', () => {
    const csv = [
      'Sample School',
      'Statement of Activity',
      'July 2025 - June 2026',
      '',
      'Acct,Desc,Actual',
      ',Income,',
      '40000,40000 Income,"(26,301.61)"',
      '40009,40009 Discounts and Assistance,"53,550.00"',
      '40200,40200 Income - Monthly Tuition Installments,"$488,257.50"',
      ',Total Income,"515,505.89"',
      ',Expenses,',
      '60100,60100 Salaries,"300,000.00"',
      ',Total Expenses,"300,000.00"',
      ',Net Income,"215,505.89"',
    ].join('\r\n')
    const bytes = new TextEncoder().encode(csv).buffer as ArrayBuffer
    const direct = parseStatementCsv(bytes)!
    expect(direct.rows).toEqual([
      { acct: 40000, desc: '40000 Income', total: 26301.61 },
      { acct: 40009, desc: '40009 Discounts and Assistance', total: -53550 },
      { acct: 40200, desc: '40200 Income - Monthly Tuition Installments', total: -488257.5 },
      { acct: 60100, desc: '60100 Salaries', total: 300000 },
    ])
    const viaFacade = ingest('soa.csv', bytes)
    expect(viaFacade.rows).toEqual(direct.rows)
    expect(viaFacade.metadata?.statement?.partial).toBe('pl')
  })
})

// ── (c) Budget vs Actuals ─────────────────────────────────────────────────────

describe('(c) Budget vs Actuals export', () => {
  it('reads the Actual column and ignores Budget / over Budget / % columns', () => {
    const res = parseStatementGrid(gridOf(BVA_ROWS), 'Budget vs Actuals')!
    expect(res.metadata.statement.type).toBe('bva')
    expect(res.metadata.statement.partial).toBe('pl')
    expect(res.metadata.statement.column).toBe('Actual')
    expect(res.rows).toEqual([
      { acct: rev('Tuition'), desc: 'Tuition', total: -500000 },
      { acct: rev('Fees'), desc: 'Fees', total: -20000 },
      { acct: exp('Salaries'), desc: 'Salaries', total: 300000 },
    ])
    expect(sum(res.rows.filter((r) => r.acct < 60000))).toBe(-520000) // Total Income (Actual)
    expect(sum(res.rows)).toBe(-220000) // Net Income (Actual)
  })

  it('can be pointed at a specific column (an explicit choice may read the Budget)', () => {
    const res = parseStatementGrid(gridOf(BVA_ROWS), 'Budget vs Actuals', { column: 'Budget' })!
    expect(res.metadata.statement.column).toBe('Budget')
    expect(res.rows.find((r) => r.desc === 'Tuition')!.total).toBe(-480000)
  })

  it('refuses a budget-only "Budget Overview" (no Actual column) instead of importing the budget as actuals', () => {
    const overview: unknown[][] = [
      ['Sample School'],
      ['Budget Overview: FY2026 Budget - FY26 P&L'],
      ['July 2025 - June 2026'],
      [],
      [null, 'Jul 2025', 'Aug 2025', 'Total'],
      ['Income'],
      ['   Tuition', 100, 200, 300],
      ['Total Income', 100, 200, 300],
      ['Expenses'],
      ['   Salaries', 50, 60, 110],
      ['Total Expenses', 50, 60, 110],
      ['Net Income', 50, 140, 190],
    ]
    expect(() => parseStatementGrid(gridOf(overview), 'Budget Overview')).toThrow(/Budget vs Actuals export has no Actual column/)
    // …and THAT message is what the facade surfaces (not the plain adapter's).
    expect(() => ingest('Budget Overview.xlsx', workbook({ Sheet1: overview }))).toThrow(/no Actual column/)
    // A numbered overview the plain adapter COULD read is refused too — never debit-positive budget rows.
    const numbered = overview.map((r, i) => (i === 4 ? ['Acct', 'Desc', ...r.slice(1)] : i > 4 && typeof r[1] === 'number' ? [40000 + i, ...r] : [null, ...r]))
    expect(() => ingest('Budget Overview.xlsx', workbook({ Sheet1: numbered }))).toThrow(/no Actual column/)
  })
})

// ── Multi-period P&L ──────────────────────────────────────────────────────────

describe('multi-period P&L (one column per month + Total)', () => {
  it('uses the Total column by default', () => {
    const res = parseStatementGrid(gridOf(PL_MONTHLY_ROWS), 'Profit and Loss')!
    expect(res.metadata.statement.column).toBe('Total')
    expect(res.rows).toEqual([
      { acct: rev('Tuition'), desc: 'Tuition', total: -600 },
      { acct: exp('Salaries'), desc: 'Salaries', total: 180 },
    ])
    expect(res.metadata.periodEndDate).toBe('2025-09-30')
  })

  it('uses a requested month column instead', () => {
    const res = parseStatementGrid(gridOf(PL_MONTHLY_ROWS), 'Profit and Loss', { column: 'Aug 2025' })!
    expect(res.metadata.statement.column).toBe('Aug 2025')
    expect(res.rows).toEqual([
      { acct: rev('Tuition'), desc: 'Tuition', total: -200 },
      { acct: exp('Salaries'), desc: 'Salaries', total: 60 },
    ])
  })
})

// ── (d) Balance Sheet ─────────────────────────────────────────────────────────

describe('(d) Balance Sheet export', () => {
  const res = parseStatementGrid(gridOf(BS_ROWS), 'Balance Sheet')!

  it('keeps leaves only, signed asset +, liability/equity −, on the engine’s fixed numbers', () => {
    expect(res.rows).toEqual([
      { acct: BS_ENGINE_ACCT.bank, desc: 'Checking', total: 150000 },
      { acct: BS_ENGINE_ACCT.bank, desc: 'Savings', total: 50000 },
      { acct: BS_ENGINE_ACCT.receivable, desc: 'Accounts Receivable (A/R)', total: 30000 },
      { acct: BS_ENGINE_ACCT.prepaid, desc: 'Prepaid Expenses', total: 5000 },
      { acct: BS_ENGINE_ACCT.fixedAsset, desc: 'Buildings', total: 400000 },
      { acct: BS_ENGINE_ACCT.accumulatedDepreciation, desc: 'Accumulated Depreciation', total: -100000 },
      { acct: BS_ENGINE_ACCT.currentLiability, desc: 'Accounts Payable (A/P)', total: -20000 },
      { acct: BS_ENGINE_ACCT.currentLiability, desc: 'Deferred Tuition', total: -100000 },
      { acct: BS_ENGINE_ACCT.longTermLiability, desc: 'Mortgage', total: -200000 },
      { acct: BS_ENGINE_ACCT.equity, desc: 'Opening Balance Equity', total: -19000 },
      { acct: BS_ENGINE_ACCT.equity, desc: 'Net Income', total: -196000 },
    ])
  })

  it('never double-counts: leaf sums equal TOTAL ASSETS and the sheet balances on its own', () => {
    const assets = res.rows.filter((r) => r.acct < 200)
    expect(sum(assets)).toBe(535000) // TOTAL ASSETS
    expect(sum(res.rows.filter((r) => r.acct >= 200 && r.acct < 300))).toBe(-320000) // Total Liabilities
    expect(sum(res.rows)).toBe(0) // a BS-only upload is self-balancing (Net Income kept as equity)
  })

  it('reads "As of" date, basis and flags the BS half', () => {
    const m = res.metadata
    expect(m.statement.type).toBe('bs')
    expect(m.statement.partial).toBe('bs')
    expect(m.statement.basis).toBe('accrual')
    expect(m.periodEndDate).toBe('2026-06-30')
    expect(m.periodEndSource).toBe('explicit')
    expect(m.fiscalYear).toBe(2026)
    expect(m.statement.synthesized.every((s) => s.acct < 1000)).toBe(true)
  })
})

// ── Merge P&L + BS → full TB ──────────────────────────────────────────────────

describe('merging a P&L with a Balance Sheet', () => {
  it('one workbook holding both sheets yields a full TB that ties without a plug', () => {
    const res = parseStatementWorkbook(workbook({ 'Profit and Loss': PL_ROWS, 'Balance Sheet': BS_ROWS }))!
    expect(res.metadata.statement.partial).toBe('full')
    expect(res.metadata.statement.balancePlug).toBeNull()
    // The BS's equity "Net Income" line is dropped — the P&L leaves ARE the net income.
    expect(res.rows.filter((r) => r.desc === 'Net Income')).toHaveLength(0)
    expect(res.rows.some((r) => r.acct === PLUG_ACCT)).toBe(false)
    expect(sum(res.rows)).toBe(0)
    expect(res.rows).toHaveLength(5 + 10)
    expect(res.metadata.periodEndDate).toBe('2026-06-30')
    expect(res.metadata.sheet).toBe('Profit and Loss + Balance Sheet')
  })

  it('two separately parsed files merge the same way and a residual gets the acct-399 plug', () => {
    // Supplies 25000 → 29000: the P&L nets −192000 but the BS still says +196000.
    const plRows = PL_ROWS.map((r) => (r[0] === '   Supplies' ? ['   Supplies', 29000] : r))
    const pl = parseStatementGrid(gridOf(plRows), 'Profit and Loss')!
    const bs = parseStatementGrid(gridOf(BS_ROWS), 'Balance Sheet')!
    const merged = mergeStatementResults(pl, bs)
    expect(merged.metadata.statement.partial).toBe('full')
    expect(merged.metadata.statement.imbalance).toBe(4000)
    expect(merged.metadata.statement.balancePlug).toBe(-4000)
    const plug = merged.rows[merged.rows.length - 1]!
    expect(plug.acct).toBe(PLUG_ACCT)
    expect(plug.total).toBe(-4000)
    expect(sum(merged.rows)).toBe(0)
    expect(merged.warnings?.some((w) => /did not tie/.test(w))).toBe(true)
  })

  it('the ingest facade merges a two-sheet workbook too', () => {
    const res = ingest('qbo-export.xlsx', workbook({ 'Profit and Loss': PL_ROWS, 'Balance Sheet': BS_ROWS }))
    expect(res.metadata?.statement?.partial).toBe('full')
    expect(sum(res.rows)).toBe(0)
  })
})

// ── Registry hand-off order ───────────────────────────────────────────────────

describe('registry hand-off', () => {
  it('a plain trial balance still parses through the plain adapter, byte-identical, with no statement metadata', () => {
    const bytes = loadSample('TB_CurrentYear_FY26.xlsx')
    const plain = parseTrialBalance(bytes)
    const res = ingest('TB_CurrentYear_FY26.xlsx', bytes)
    expect(res.rows).toEqual(plain.rows)
    expect(res.metadata?.statement).toBeUndefined()
  })

  it('detection WINS when the plain adapter also produced rows (it would have the signs wrong)', () => {
    // A numbered Statement of Activity in the legacy 3-digit range parses as a
    // TB through the plain adapter — with natural-positive income as DEBITS.
    // The statement walk must take precedence and flip them.
    const rows: unknown[][] = [
      ['Sample School'],
      ['Statement of Activity'],
      ['July 2025 - June 2026'],
      [],
      ['Acct', 'Desc', 'Actual'],
      [null, 'Income'],
      [401, 'Tuition', 500000],
      [null, 'Total Income', 500000],
      [null, 'Expenses'],
      [500, 'Salaries', 300000],
      [null, 'Total Expenses', 300000],
      [null, 'Net Income', 200000],
    ]
    const bytes = workbook({ 'Statement of Activity': rows })
    const plain = parseTrialBalance(bytes)
    expect(plain.rows).toHaveLength(2) // the plain adapter DOES produce rows…
    expect(plain.rows.find((r) => r.acct === 401)!.total).not.toBe(-500000) // …but never the credit
    const res = ingest('soa.xlsx', bytes)
    expect(res.metadata?.statement?.type).toBe('pl')
    expect(res.rows).toEqual([
      { acct: 401, desc: 'Tuition', total: -500000 },
      { acct: 500, desc: 'Salaries', total: 300000 },
    ])
  })

  it('a file that is neither still raises the plain adapter’s error', () => {
    expect(() => ingest('junk.xlsx', workbook({ Notes: [['hello'], ['world'], ['again']] }))).toThrow(/No account rows/)
  })
})

// ── Classifier ────────────────────────────────────────────────────────────────

describe('classifyRole — statement exports', () => {
  const now = new Date('2026-03-14T12:00:00Z') // FY2026 — the fixtures' "July 2025 - June 2026"

  it('a Statement of Activity dated in the CURRENT FY is cy, not "Needs a role"', () => {
    const res = parseStatementGrid(gridOf(SOA_ROWS), 'Statement of Activity')!
    const c = classifyRole({ fileName: 'Statement of Activity.xlsx', metadata: res.metadata, now })
    expect(c.role).toBe('cy')
    expect(c.confidence).toBeGreaterThanOrEqual(0.7)
  })

  it('Budget vs Actuals, Profit and Loss and Balance Sheet likewise', () => {
    for (const [rows, name] of [
      [BVA_ROWS, 'Budget vs Actuals.xlsx'],
      [PL_ROWS, 'Profit and Loss.xlsx'],
      [BS_ROWS, 'Balance Sheet.xlsx'],
    ] as const) {
      const res = parseStatementGrid(gridOf(rows as unknown[][]), name)!
      expect(classifyRole({ fileName: name, metadata: res.metadata, now }).role).toBe('cy')
    }
  })

  it('the JUST-CLOSED FY stays unknown with its explicit date (the batch resolver places it)', () => {
    const res = parseStatementGrid(gridOf(SOA_ROWS), 'Statement of Activity')!
    const c = classifyRole({ fileName: 'Statement of Activity.xlsx', metadata: res.metadata, now: new Date('2026-10-14T12:00:00Z') })
    expect(c.role).toBe('unknown')
    expect(c.signals.periodEndDate).toBe('2026-06-30')
    expect(c.signals.periodEndSource).toBe('explicit')
    expect(c.confidence).toBe(0.5)
  })

  it('an old statement is NOT forced to cy (date drives batch resolution)', () => {
    const res = parseStatementGrid(gridOf(SOA_ROWS), 'Statement of Activity')!
    const c = classifyRole({ fileName: 'Statement of Activity.xlsx', metadata: res.metadata, now: new Date('2029-01-01') })
    expect(c.role).toBe('unknown')
  })

  it('a role keyword still wins over the statement rule', () => {
    const res = parseStatementGrid(gridOf(SOA_ROWS), 'Statement of Activity')!
    expect(classifyRole({ fileName: 'PriorYear_SOA.xlsx', metadata: res.metadata, now }).role).toBe('py')
  })
})

// ── Shared conventions (the live QBO sync re-exports these) ───────────────────

describe('shared TB conventions', () => {
  it('money parsing handles accounting formats', () => {
    expect(parseMoney('(1,234.00)')).toBe(-1234)
    expect(parseMoney('$(1,234.00)')).toBe(-1234) // Excel accounting: $ outside the parens
    expect(parseMoney('($1,234.00)')).toBe(-1234)
    expect(parseMoney('$1,234.50')).toBe(1234.5)
    expect(parseMoney('$ 1,234')).toBe(1234)
    expect(parseMoney('-1,234')).toBe(-1234)
    expect(parseMoney('-$1,234')).toBe(-1234)
    expect(parseMoney('$ -1,234')).toBe(-1234)
    expect(parseMoney('1.234,00')).toBe(1234) // EU thousands — never 1.234
    expect(parseMoney('1234,50')).toBe(1234.5)
    expect(parseMoney('-')).toBe(0)
    expect(parseMoney('—')).toBe(0)
    expect(parseMoney('N/A')).toBeNull()
    expect(parseMoney('104.17 %')).toBeNull()
    expect(parseMoney(new Date('2026-06-30'))).toBeNull()
    expect(parseMoney('Tuition')).toBeNull()
    expect(parseMoney('')).toBeNull()
    expect(parseMoney(12.5)).toBe(12.5)
  })

  it('banner dates: ranges end on the last token, "As of" on the day', () => {
    expect(bannerDates('July 2025 - June 2026')).toEqual(['2025-07-31', '2026-06-30'])
    expect(bannerDates('Jul 1, 2025 - Jun 30, 2026')).toEqual(['2025-07-01', '2026-06-30'])
    expect(bannerDates('As of June 30, 2026')).toEqual(['2026-06-30'])
    expect(bannerDates('As of 6/30/2026')).toEqual(['2026-06-30'])
  })

  it('sign rules match the live sync', () => {
    expect(sectionSign('revenue')).toBe(-1)
    expect(sectionSign('expense')).toBe(1)
    expect(sectionSign('asset')).toBe(1)
    expect(sectionSign('liability')).toBe(-1)
    expect(sectionSign('equity')).toBe(-1)
    expect(pnlGroupSign(['Income'])).toBe(-1)
    expect(pnlGroupSign(['OtherIncome'])).toBe(-1)
    expect(pnlGroupSign(['Expenses'])).toBe(1)
    expect(pnlGroupSign(['Mystery'])).toBe(1)
    expect(bsGroupSign(['TotalLiabilitiesAndEquity', 'Equity'])).toBe(-1)
    expect(bsGroupSign(['Assets'])).toBe(1)
    // A leaf directly under "LIABILITIES AND EQUITY" (no subsection) is a LIABILITY, not equity.
    expect(bsSectionFromGroups(['LIABILITIES AND EQUITY'])).toBe('liability')
    expect(bsSectionFromGroups(['LIABILITIES AND EQUITY', 'Equity'])).toBe('equity')
  })

  it('applyBalancePlug appends one acct-399 row only when off by more than a cent', () => {
    const plugged = applyBalancePlug([{ acct: 100, desc: 'Cash', total: 30 }])
    expect(plugged.balancePlug).toBe(-30)
    expect(plugged.rows[1]).toEqual({ acct: PLUG_ACCT, desc: expect.any(String), total: -30 })
    const tiny = applyBalancePlug([{ acct: 100, desc: 'Cash', total: 0.01 }])
    expect(tiny.balancePlug).toBeNull()
  })
})

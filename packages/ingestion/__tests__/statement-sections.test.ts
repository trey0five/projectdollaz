// ─────────────────────────────────────────────────────────────
// A1 — statement accounts sort themselves. The owner's 2026-10-15 upload: a
// fresh school, the QuickBooks "Financial Statements" workbook (P&L Budget vs
// Actual + Balance Sheet). It imported 34 accounts, but every 5-digit account
// was unmapped and the Finance page stayed empty until someone confirmed 34
// name-only guesses — two of them WRONG (Income-section Contributions filed
// as balance-sheet net assets). The export knows each account's section; the
// adapter now records it (metadata.statement.sections) and the engine's
// section-aware suggester sorts every account from it.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  ingest,
  mergeStatementResults,
  parseStatementGrid,
  asStatementResult,
  statementSections,
  normalizeStatementSection,
  STATEMENT_SECTION_KEYS,
  renumberSynthetic,
  type StatementSheetResult,
} from '../src/index.js'
import {
  DEFAULT_CHART,
  calcSOA,
  calcSFP,
  suggestStatementCategories,
  SCOA_CATEGORIES,
  type SCoaCategory,
  type StandardChart,
} from '@finrep/engine'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '__fixtures__', 'holy-family')
const WORKBOOK = 'Holy Family Academy Financial Statements 6-30-26.xlsx'
const PL_FILE = 'Holy Family Academy Profit and Loss Budget vs Actual 6-30-26.xlsx'
const BS_FILE = 'Holy Family Academy Balance Sheet 6-30-26.xlsx'

function load(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(dir, name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}
function workbook(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
function gridOf(rows: unknown[][]): unknown[][] {
  const wb = XLSX.read(new Uint8Array(workbook({ S: rows })), { type: 'array' })
  return XLSX.utils.sheet_to_json(wb.Sheets['S']!, { header: 1, defval: null }) as unknown[][]
}

/** What the web does after upload: map every section-backed account, then run the statements. */
function statementsWithAutoMapping(rows: Array<{ acct: number; desc: string; total: number }>, sections: Record<string, unknown>) {
  const sug = suggestStatementCategories(rows, sections as never)
  const entries: Record<number, SCoaCategory> = { ...DEFAULT_CHART.mapping.entries }
  for (const [acct, s] of Object.entries(sug)) if (s.sure) entries[Number(acct)] = s.category
  const chart: StandardChart = { ...DEFAULT_CHART, mapping: { ...DEFAULT_CHART.mapping, entries } }
  const soa = calcSOA(rows, chart)
  const sfp = calcSFP(rows, soa.totalRev - soa.totalExp, chart)!
  return { sug, soa, sfp }
}

describe('A1 — the Holy Family two-sheet workbook', () => {
  const r = ingest(WORKBOOK, load(WORKBOOK))
  const st = r.metadata!.statement!

  it('imports the full trial balance (34 accounts, FY2026) and records a section for every numbered account', () => {
    expect(st.partial).toBe('full')
    expect(r.metadata!.fiscalYear).toBe(2026)
    expect(r.rows).toHaveLength(34)
    const sections = statementSections(r.metadata)
    expect(Object.keys(sections)).toHaveLength(34)
    expect(sections[40100]).toEqual({ statement: 'pl', section: 'income', basis: 'section' })
    expect(sections[41000]).toEqual({ statement: 'pl', section: 'income', basis: 'section' })
    expect(sections[67000]).toEqual({ statement: 'pl', section: 'expenses', basis: 'section' })
    expect(sections[10300]).toEqual({ statement: 'bs', section: 'bank', basis: 'section' })
    expect(sections[11000]).toEqual({ statement: 'bs', section: 'otherCurrentAssets', basis: 'section' })
    expect(sections[17000]).toEqual({ statement: 'bs', section: 'fixedAssets', basis: 'section' })
    expect(sections[20000]).toEqual({ statement: 'bs', section: 'accountsPayable', basis: 'section' })
    expect(sections[24110]).toEqual({ statement: 'bs', section: 'otherCurrentLiabilities', basis: 'section' })
    expect(sections[25000]).toEqual({ statement: 'bs', section: 'longTermLiabilities', basis: 'section' })
    expect(sections[30000]).toEqual({ statement: 'bs', section: 'equity', basis: 'section' })
  })

  it('maps 41000/41100 to revenue, 44000 to investments, 67000 to an expense and 10300 to cash — all without asking', () => {
    const sug = suggestStatementCategories(r.rows, st.sections as never)
    for (const acct of [41000, 41100]) expect(SCOA_CATEGORIES[sug[acct]!.category].section).toBe('revenue')
    expect(sug[44000]!.category).toBe('investments')
    expect(SCOA_CATEGORIES[sug[67000]!.category].section).toBe('expense')
    expect(sug[10300]!.category).toBe('cash')
    expect(r.rows.every((row) => sug[row.acct]?.sure === true)).toBe(true)
  })

  it('the statements read income 4,172,000 · expense 4,109,300 · net 62,700 · assets 5,193,000', () => {
    const { soa, sfp } = statementsWithAutoMapping(r.rows, st.sections!)
    expect(soa.totalRev).toBe(4_172_000)
    expect(soa.totalExp).toBe(4_109_300)
    expect(soa.totalRev - soa.totalExp).toBe(62_700)
    expect(sfp.totalAssets).toBe(5_193_000)
    expect(st.balancePlug).toBeNull() // the pair ties exactly
  })

  it('the two separate exports give the same sections, and merge to the same totals', () => {
    const pl = ingest(PL_FILE, load(PL_FILE))
    const bs = ingest(BS_FILE, load(BS_FILE))
    expect(pl.metadata!.statement!.partial).toBe('pl')
    expect(bs.metadata!.statement!.partial).toBe('bs')
    expect(Object.keys(pl.metadata!.statement!.sections!)).toHaveLength(19)
    expect(Object.keys(bs.metadata!.statement!.sections!)).toHaveLength(15)
    const merged = mergeStatementResults(
      asStatementResult(pl.rows, pl.metadata)!,
      asStatementResult(bs.rows, bs.metadata)!,
    )
    expect(merged.metadata.statement.sections).toEqual(st.sections)
    const { soa, sfp } = statementsWithAutoMapping(merged.rows, merged.metadata.statement.sections!)
    expect([soa.totalRev, soa.totalExp, sfp.totalAssets]).toEqual([4_172_000, 4_109_300, 5_193_000])
  })
})

describe('A1 — section facts: shape and edge cases', () => {
  it('normalises the standard QuickBooks headings', () => {
    const cases: Record<string, string | undefined> = {
      'Income': 'income', 'Other Income': 'otherIncome', 'Expenses': 'expenses', 'Other Expenses': 'otherExpense',
      'Cost of Goods Sold': 'costOfGoodsSold', 'Bank Accounts': 'bank', 'Accounts Receivable': 'accountsReceivable',
      'Accounts Receivable (A/R)': 'accountsReceivable', 'Other Current Assets': 'otherCurrentAssets', 'Current Assets': 'currentAssets',
      'Fixed Assets': 'fixedAssets', 'Other Assets': 'otherAssets', 'ASSETS': 'assets', 'Accounts Payable (A/P)': 'accountsPayable',
      'Credit Cards': 'creditCards', 'Other Current Liabilities': 'otherCurrentLiabilities', 'Current Liabilities': 'currentLiabilities',
      'Long Term Liabilities': 'longTermLiabilities', 'Liabilities': 'liabilities', 'LIABILITIES AND EQUITY': 'liabilities',
      'Equity': 'equity', 'Tuition Revenue': undefined, 'Operating': undefined,
    }
    for (const [label, key] of Object.entries(cases)) expect(normalizeStatementSection(label), label).toBe(key)
    for (const k of Object.keys(STATEMENT_SECTION_KEYS)) expect(typeof k).toBe('string')
  })

  it('a user sub-group inside a standard section still reports the standard section', () => {
    const rows: unknown[][] = [
      ['Profit and Loss'], ['July 2025 - June 2026'], [], ['', 'Total'],
      ['Income'], ['   Tuition Revenue'], ['      40100 Day Tuition', 1000], ['   Total Tuition Revenue', 1000],
      ['Total Income', 1000], ['Expenses'], ['   60100 Salaries', 400], ['Total Expenses', 400], ['Net Income', 600],
    ]
    const r = parseStatementGrid(gridOf(rows), 'P&L')!
    expect(r.metadata.statement.sections).toEqual({
      '40100': { statement: 'pl', section: 'income', basis: 'section' },
      '60100': { statement: 'pl', section: 'expenses', basis: 'section' },
    })
  })

  it('synthesized P&L numbers get a section; the balance sheet’s shared engine family numbers do not', () => {
    const pl = parseStatementGrid(gridOf([
      ['Profit and Loss'], ['July 2025 - June 2026'], [], ['', 'Total'],
      ['Income'], ['   Tuition', 1000], ['Total Income', 1000], ['Other Expenses'], ['   Interest Paid', 50], ['Total Other Expenses', 50],
      ['Net Income', 950],
    ]), 'P&L')!
    const tuition = pl.rows.find((x) => x.desc === 'Tuition')!.acct
    const interest = pl.rows.find((x) => x.desc === 'Interest Paid')!.acct
    expect(pl.metadata.statement.sections).toEqual({
      [tuition]: { statement: 'pl', section: 'income', basis: 'section' },
      [interest]: { statement: 'pl', section: 'otherExpense', basis: 'section' },
    })
    const bs = parseStatementGrid(gridOf([
      ['Balance Sheet'], ['As of June 30, 2026'], [], ['', 'Total'],
      ['ASSETS'], ['   Bank Accounts'], ['      Checking', 100], ['   Total Bank Accounts', 100], ['TOTAL ASSETS', 100],
      ['LIABILITIES AND EQUITY'], ['   Equity'], ['      Opening Balance Equity', 100], ['   Total Equity', 100],
    ]), 'Balance Sheet')!
    expect(bs.rows.map((x) => x.acct)).toEqual([100, 300])
    expect(bs.metadata.statement.sections).toBeUndefined()
  })

  it('a flat P&L records its class from the number block (basis "number"), S-C rows by position', () => {
    const rows: unknown[][] = [
      ['Profit and Loss'], ['July 2025 - June 2026'], [], ['Acct', 'Desc', 'Total'],
      [40100, 'Tuition', 512000], [24110, 'Deferred Income - Spring', 18000], [40200, 'Registration Fees', 9600],
      [60100, 'Salaries', 300000], [65000, 'Utilities', 21000],
    ]
    const r = ingest('Flat Profit and Loss 6-30-26.xlsx', workbook({ Sheet1: rows }))
    const sections = statementSections(r.metadata)
    expect(sections[40100]).toEqual({ statement: 'pl', section: 'income', basis: 'number' })
    expect(sections[24110]).toEqual({ statement: 'pl', section: 'income', basis: 'position' })
    expect(sections[60100]).toEqual({ statement: 'pl', section: 'expenses', basis: 'number' })
  })

  it('a plain trial balance has no section facts (confirm-first review stays)', () => {
    const tb = workbook({ Sheet1: [
      ['School'], ['Trial Balance June 30, 2026'], ['Acct', 'Desc', 'Debit', 'Credit'],
      [1010, 'Cash', 500, null], [4000, 'Tuition', null, 500],
    ] })
    const r = ingest('TB.xlsx', tb)
    expect(r.metadata?.statement).toBeUndefined()
    expect(statementSections(r.metadata)).toEqual({})
  })

  it('statementSections drops malformed client-written entries', () => {
    const md = {
      sourceName: 'x', rowCount: 1,
      statement: {
        type: 'pl', title: 'P&L', partial: 'pl', synthesized: [],
        sections: {
          '40100': { statement: 'pl', section: 'income', basis: 'section' },
          '40200': { statement: 'pl', section: 'nonsense' },
          'abc': { statement: 'pl', section: 'income' },
          '60100': { statement: 'xx', section: 'expenses' },
          '60200': { statement: 'pl', section: 'expenses' },
        },
      },
    }
    expect(statementSections(md as never)).toEqual({
      40100: { statement: 'pl', section: 'income', basis: 'section' },
      60200: { statement: 'pl', section: 'expenses', basis: 'section' },
    })
  })

  it('an account number printed under two different sections is ambiguous and gets no fact', () => {
    const a = { rows: [], startRow: 0, metadata: { sourceName: '', rowCount: 0, statement: { type: 'pl', title: 'P&L', partial: 'pl', synthesized: [], sections: { '24110': { statement: 'pl', section: 'income', basis: 'position' }, '40100': { statement: 'pl', section: 'income', basis: 'section' } } } } } as unknown as StatementSheetResult
    const b = { rows: [], startRow: 0, metadata: { sourceName: '', rowCount: 0, statement: { type: 'bs', title: 'BS', partial: 'bs', synthesized: [], sections: { '24110': { statement: 'bs', section: 'otherCurrentLiabilities', basis: 'section' } } } } } as unknown as StatementSheetResult
    const m = mergeStatementResults(a, b)
    expect(Object.keys(m.metadata.statement.sections!)).toEqual(['40100'])
  })

  it('re-keying a synthesized number moves its section fact with it', () => {
    const r = parseStatementGrid(gridOf([
      ['Profit and Loss'], ['July 2025 - June 2026'], [], ['', 'Total'],
      ['Income'], ['   Tuition', 1000], ['Total Income', 1000], ['Net Income', 1000],
    ]), 'P&L')!
    const from = r.rows[0]!.acct
    const out = renumberSynthetic(r.rows, r.metadata, from, 4100)
    expect(out.metadata.statement!.sections).toEqual({ '4100': { statement: 'pl', section: 'income', basis: 'section' } })
  })
})

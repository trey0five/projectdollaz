// ─────────────────────────────────────────────────────────────
// Live UX review MUST: a "ledger export.xlsx" with Acct | Description and
// UNLABELED debit (C) and credit (D) columns. The failure preview guessed
// Amounts = C only (dropping every credit) and the picker could not offer
// Debit / Credit because C and D read as account-number-shaped columns, not
// money. Money columns are now judged by CONTENT, an unlabeled pair is
// guessed as Debit / Credit, a populated numeric column the guess leaves
// unread is named in preview.warnings, and a single-amount pick on such a
// grid says it does not balance.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  ingest,
  ingestFailureOf,
  previewFile,
  unassignedNumericColumns,
  type ColumnChoice,
} from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
function load(path: string): ArrayBuffer {
  const b = readFileSync(path)
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}
function workbook(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
const sum = (rows: Array<{ total: number }>) => Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100

/** The review fixture's exact shape (St Rita "ledger export.xlsx"). */
const LEDGER: unknown[][] = [
  ['St Rita School', null, null, null, null],
  ['Ledger export', null, null, null, null],
  [null, null, null, null, null],
  ['Acct', 'Description', '', '', 'Memo'],
  ['10100', 'Operating Checking', 612400, '', 'FY26'],
  ['10200', 'Savings - Reserve', 1050000, '', 'FY26'],
  ['11000', 'Tuition Receivable', 184300, '', 'FY26'],
  ['15000', 'Buildings & Improvements', 2400000, '', 'FY26'],
  ['20000', 'Accounts Payable', '', 96500, 'FY26'],
  ['24000', 'Deferred Tuition Revenue', '', 410000, 'FY26'],
  ['30000', 'Net Assets without Donor Restrictions', '', 2653125, 'FY26'],
  ['40100', 'Tuition', '', 3850000, 'FY26'],
  ['40200', 'Registration Fees', '', 96000, 'FY26'],
  ['41000', 'Contributions without Donor Restrictions', '', 245000, 'FY26'],
  ['48230', 'Miscellaneous income', '', 12750, 'FY26'],
  ['48990', 'Uniform resale - spirit wear and other student store items', '', 8400, 'FY26'],
  ['60100', 'Salaries - Faculty', 2140000, '', 'FY26'],
  ['61000', 'Payroll Taxes & Benefits', 598000, '', 'FY26'],
  ['64000', 'Facilities & Maintenance', 236500, '', 'FY26'],
  ['65000', 'Utilities', 142300, '', 'FY26'],
  ['77770', 'Sundry', 4975, '', 'FY26'],
  ['79410', 'Bank service charges and merchant processing fees', 3300, '', 'FY26'],
]

describe('unlabeled debit / credit columns (the ledger export)', () => {
  const bytes = workbook({ Sheet1: LEDGER })

  it('the automatic read still refuses (never-hijack) and its preview guesses Debit = C, Credit = D', () => {
    const f = ingestFailureOf((() => { try { ingest('ledger export.xlsx', bytes) } catch (e) { return e } })())
    expect(f.code).toBe('no-amount')
    const p = f.preview!
    expect(p.guess).toMatchObject({ headerRow: 3, acct: 0, desc: 1, amount: -1, debit: 2, credit: 3 })
    expect(p.suggestedDebitCredit).toEqual({ debit: 2, credit: 3 })
    expect(p.warnings).toEqual([])
  })

  it('C and D are flagged numeric money columns by content; the memo column is not', () => {
    const p = previewFile('ledger export.xlsx', bytes)!
    const by = (l: string) => p.columns.find((c) => c.letter === l)!
    expect([by('C').numeric, by('C').kind]).toEqual([true, 'money'])
    expect([by('D').numeric, by('D').kind]).toEqual([true, 'money'])
    expect(by('A').kind).toBe('acct')
    expect(by('E').numeric).toBe(false)
  })

  it('the guess, applied, reads a balanced trial balance', () => {
    const p = previewFile('ledger export.xlsx', bytes)!
    const r = ingest('ledger export.xlsx', bytes, { columns: p.guess })
    expect(r.rows).toHaveLength(18)
    expect(sum(r.rows)).toBe(0)
    expect(r.rows.find((x) => x.acct === 40100)!.total).toBe(-3850000)
    expect(r.warnings).toBeUndefined()
  })

  it('a single amount column on the pair says it does not balance and names the other half', () => {
    const pick: ColumnChoice = { headerRow: 3, acct: 0, desc: 1, amount: 2, debit: -1, credit: -1 }
    const r = ingest('ledger export.xlsx', bytes, { columns: pick })
    expect(r.metadata!.net).toBe(7371775)
    expect(r.warnings).toEqual([
      'These amounts don\'t balance: they are off by $7,371,775. Column D looks like the other half — choose "Debit and credit columns".',
    ])
    // …and the picker can say which populated column the pick leaves out.
    const p = previewFile('ledger export.xlsx', bytes)!
    expect(unassignedNumericColumns(p, pick)).toEqual([{ code: 'unassigned-numeric-column', column: 3, letter: 'D' }])
  })

  it('a guess never silently drops a populated numeric column', () => {
    // Signed balance + an unlabeled second number column that is NOT a pair
    // (negatives, rows filled in both): one is guessed, the other is named.
    const grid = [
      ['Acct', 'Desc', '', ''],
      [1010, 'Cash', 500, 450],
      [4000, 'Tuition', -500, -450],
      [5000, 'Salaries', 300, 280],
      [2000, 'Payables', -300, -280],
    ]
    const p = previewFile('two numbers.xlsx', workbook({ Sheet1: grid }))!
    expect(p.suggestedDebitCredit).toBeNull()
    const picked = [p.guess.amount, p.guess.debit, p.guess.credit].filter((i) => i >= 0)
    expect(picked).toHaveLength(1)
    const other = picked[0] === 2 ? 'D' : 'C'
    expect(p.warnings).toEqual([{ code: 'unassigned-numeric-column', column: other === 'D' ? 3 : 2, letter: other }])
  })

  it('labelled month columns whose totals happen to tie are never guessed as a pair', () => {
    const grid = [
      ['Acct', 'Desc', 'Jul 2025', 'Aug 2025'],
      [4000, 'Tuition', 1000, 1000],
      [5000, 'Salaries', 400, 400],
    ]
    expect(previewFile('months.xlsx', workbook({ Sheet1: grid }))!.suggestedDebitCredit).toBeNull()
  })
})

describe('regressions', () => {
  it('a named Debit | Credit TB (the St Rita shape) imports automatically; its preview suggests the named pair', () => {
    const tb = [
      ['Account', 'Account Name', 'Debit', 'Credit'],
      ...LEDGER.slice(4).map((r) => [r[0], r[1], r[2], r[3]]),
    ]
    const bytes = workbook({ 'Trial Balance': tb })
    const r = ingest('St Rita Trial Balance June 2026.xlsx', bytes)
    expect(r.rows).toHaveLength(18)
    expect(sum(r.rows)).toBe(0)
    const p = previewFile('St Rita Trial Balance June 2026.xlsx', bytes)!
    expect(p.suggestedDebitCredit).toEqual({ debit: 2, credit: 3 })
    expect(p.guess).toMatchObject({ amount: -1, debit: 2, credit: 3 })
    expect(p.warnings).toEqual([])
  })

  it('a Debit | Credit | Total TB: the Total column is the pair\'s net, never reported as unassigned', () => {
    const tb = [['Account', 'Description', 'Debit', 'Credit', 'Total'], [1010, 'Cash', 500, 0, 500], [4000, 'Tuition', 0, 500, -500]]
    const p = previewFile('TB.xlsx', workbook({ Sheet1: tb }))!
    expect(p.columns[4]!.netOfPair).toBe(true)
    expect(p.warnings).toEqual([])
    // A single signed-amount pick of that Total is balanced: no warning.
    expect(ingest('TB.xlsx', workbook({ Sheet1: tb }), { columns: { headerRow: 0, acct: 0, desc: 1, amount: 4, debit: -1, credit: -1 } }).warnings).toBeUndefined()
  })

  it('the repo sample TBs import unchanged', () => {
    for (const name of ['TB_CurrentYear_FY26.xlsx', 'TB_PriorYear_FY25.xlsx', 'TB_AuditedFYEnd_FY25.xlsx']) {
      const r = ingest(name, load(resolve(here, '..', '..', '..', 'sample-data', name)))
      expect(r.rows.length).toBeGreaterThan(0)
      expect(r.warnings ?? []).not.toContainEqual(expect.stringMatching(/don't balance/))
    }
  })

  it('Holy Family samples: 19 P&L (net −62,700), 16 BS (balanced), 34 full', () => {
    const dir = resolve(here, '__fixtures__', 'holy-family')
    const pl = ingest('Holy Family Academy Profit and Loss Budget vs Actual 6-30-26.xlsx', load(resolve(dir, 'Holy Family Academy Profit and Loss Budget vs Actual 6-30-26.xlsx')))
    const bs = ingest('Holy Family Academy Balance Sheet 6-30-26.xlsx', load(resolve(dir, 'Holy Family Academy Balance Sheet 6-30-26.xlsx')))
    const full = ingest('Holy Family Academy Financial Statements 6-30-26.xlsx', load(resolve(dir, 'Holy Family Academy Financial Statements 6-30-26.xlsx')))
    expect([pl.rows.length, pl.metadata!.statement!.partial, sum(pl.rows)]).toEqual([19, 'pl', -62700])
    expect([bs.rows.length, bs.metadata!.statement!.partial, sum(bs.rows)]).toEqual([16, 'bs', 0])
    expect([full.rows.length, full.metadata!.statement!.partial, sum(full.rows)]).toEqual([34, 'full', 0])
  })

  it('a Budget vs Actuals preview: Actual guessed, budget columns flagged, no pair, no warnings', () => {
    const bva = [
      ['Acct', 'Desc', 'Actual', 'Budget', 'over Budget'],
      [4000, 'Tuition', -480000, -500000, 20000],
      [5000, 'Salaries', 300000, 310000, -10000],
    ]
    const p = previewFile('Budget vs Actuals.xlsx', workbook({ Sheet1: bva }))!
    expect(p.guess.amount).toBe(2)
    expect(p.suggestedDebitCredit).toBeNull()
    expect(p.warnings).toEqual([])
  })
})

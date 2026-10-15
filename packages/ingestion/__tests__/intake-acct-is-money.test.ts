// ─────────────────────────────────────────────────────────────
// 2026-10-15 live garble: the owner opened "Wrong numbers? Change columns" on
// the Holy Family two-sheet workbook (a QuickBooks Profit and Loss Budget vs.
// Actual + Balance Sheet, read correctly: 34 accounts, full) and the picker's
// pre-selected guess took the BUDGET column for the account numbers:
// { headerRow 5, desc A, amount B (Actual), acct C (Budget) } → 14 rows like
// { acct: 2100000, desc: '60100 Salaries - Faculty', total: 2140000 }.
//
// An "account numbers" column that holds amounts is now refused on every
// picker path ('acct-is-money'), the preview never guesses one and flags it
// (holdsAmounts), and a pick on a statement grid is walked section-signed.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  ingest,
  isIngestError,
  parseWithColumns,
  previewFile,
  columnHoldsAmounts,
  columnsHoldingAmounts,
  EMPTY_INTAKE_MEMORY,
  type ColumnChoice,
  type IngestError,
  type IntakeMemory,
} from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
function load(...parts: string[]): ArrayBuffer {
  const b = readFileSync(resolve(here, '__fixtures__', ...parts))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}
function workbook(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
function caught(fn: () => unknown): IngestError {
  try {
    fn()
  } catch (e) {
    if (isIngestError(e)) return e
    throw new Error(`not an IngestError: ${String(e)}`)
  }
  throw new Error('did not throw')
}
const sum = (rows: Array<{ total: number }>) => Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100

const WORKBOOK = 'Holy Family Academy Financial Statements 6-30-26.xlsx'
const PL_FILE = 'Holy Family Academy Profit and Loss Budget vs Actual 6-30-26.xlsx'
const BS_FILE = 'Holy Family Academy Balance Sheet 6-30-26.xlsx'
const hf = (name: string) => load('holy-family', name)

/** The exact layout the live picker saved. */
const OWNER: ColumnChoice = { sheet: 'Profit and Loss', headerRow: 5, desc: 0, amount: 1, acct: 2, debit: -1, credit: -1 }

describe('the owner’s layout on the Holy Family P&L is refused', () => {
  it('workbook: acct-is-money, column C, the "None" way out named', () => {
    const e = caught(() => ingest(WORKBOOK, hf(WORKBOOK), { columns: OWNER }))
    expect(e.code).toBe('acct-is-money')
    expect(e.reason).toBe('Column C holds amounts, not account numbers.')
    expect(e.ask).toBe('Pick the column with your account numbers, or “None — KYRO numbers them” if there isn’t one.')
    expect(e.preview).toBeNull()
  })

  it('the separate P&L file too, and parseWithColumns directly', () => {
    expect(caught(() => ingest(PL_FILE, hf(PL_FILE), { columns: OWNER })).code).toBe('acct-is-money')
    expect(caught(() => parseWithColumns(WORKBOOK, hf(WORKBOOK), OWNER)).code).toBe('acct-is-money')
  })

  it('Actual (B) as the account numbers is refused the same way', () => {
    const e = caught(() => ingest(WORKBOOK, hf(WORKBOOK), { columns: { ...OWNER, acct: 1, amount: -1, debit: -1, credit: -1, desc: 0 } }))
    expect(e.code).toBe('bad-choice') // no amount column at all: the shape check speaks first
    const grid = workbook({ Sheet1: [['Name', 'Actual', 'Amount'], ['Tuition', 3850, 3850], ['Fees', 960, 960]] })
    const e2 = caught(() => parseWithColumns('x.xlsx', grid, { headerRow: 0, acct: 1, desc: 0, amount: 2, debit: -1, credit: -1 }))
    expect([e2.code, e2.reason]).toEqual(['acct-is-money', 'Column B holds amounts, not account numbers.'])
  })
})

describe('a pick on a statement grid is walked, section-signed', () => {
  it('owner layout with account numbers = None reads the P&L as the automatic read does', () => {
    const r = ingest(WORKBOOK, hf(WORKBOOK), { columns: { ...OWNER, acct: -1 } })
    expect(r.metadata!.statement).toMatchObject({ partial: 'pl', column: 'Actual' })
    expect(r.rows.length).toBe(19)
    expect(sum(r.rows)).toBe(-62700)
    const by = (a: number) => r.rows.find((x) => x.acct === a)!.total
    expect(by(40100)).toBe(-3850000) // income credit-signed
    expect(by(40900)).toBe(310000) // contra-revenue (tuition assistance)
    expect(by(60100)).toBe(2140000) // expense debit-signed
    expect(r.rows.every((x) => x.acct <= 999_999)).toBe(true)
    expect(r.metadata!.layout).toMatchObject({ source: 'picked', acct: -1, desc: 0, amount: 1 })
    expect(r.warnings ?? []).toEqual([])
  })

  it('the Balance Sheet sheet picked from its guess: 16 rows, balanced, no skipped section totals', () => {
    const p = previewFile(BS_FILE, hf(BS_FILE))!
    const r = ingest(BS_FILE, hf(BS_FILE), { columns: p.guess })
    expect([r.rows.length, sum(r.rows), r.metadata!.statement!.partial]).toEqual([16, 0, 'bs'])
    expect(r.warnings ?? []).toEqual([])
  })
})

describe('the preview never offers a money column as the account numbers', () => {
  it('Holy Family P&L: guess = None + names + Actual; B–E hold amounts', () => {
    for (const [name, bytes] of [[WORKBOOK, hf(WORKBOOK)], [PL_FILE, hf(PL_FILE)]] as const) {
      const p = previewFile(name, bytes)!
      expect(p.guess).toMatchObject({ acct: -1, desc: 0, amount: 1, debit: -1, credit: -1 })
      expect(p.columns.map((c) => [c.letter, c.holdsAmounts])).toEqual([
        ['A', false],
        ['B', true],
        ['C', true],
        ['D', true],
        ['E', true],
      ])
      // Whole-dollar columns are no longer reported as account-number columns.
      expect(p.columns.filter((c) => c.kind === 'acct')).toEqual([])
      expect(p.readsAsStatement).toBe(true)
    }
  })

  it('a real account column is not flagged (ledger export + plain TB)', () => {
    const p = previewFile('ledger export.xlsx', load('ledger', 'ledger export.xlsx'))!
    expect(p.columns.map((c) => c.holdsAmounts)).toEqual([false, false, true, true, false])
  })
})

describe('acct-is-money on a plain table', () => {
  const choice = (acct: number): ColumnChoice => ({ headerRow: 0, acct, desc: 1, amount: 2, debit: -1, credit: -1 })
  const read = (rows: unknown[][], acct = 0) => parseWithColumns('TB.xlsx', workbook({ Sheet1: rows }), choice(acct))

  it('a money header (Total / Budget / Balance / a month) is refused, letters only, no "None" offer', () => {
    for (const h of ['Total', 'Budget', 'Balance', 'Amount', 'Jun 2026', 'over Budget', '% of Budget', 'Actual']) {
      const e = caught(() => read([[h, 'Desc', 'Amt'], [1010, 'Cash', 500], [4000, 'Tuition', -500]]))
      expect(e.code, h).toBe('acct-is-money')
      expect(e.reason).toBe('Column A holds amounts, not account numbers.')
      expect(e.ask).toBe('Pick the column with your account numbers.')
    }
  })

  it('a number no chart uses (2,100,000) is refused', () => {
    const e = caught(() => read([['', 'Desc', 'Amt'], [1010, 'Cash', 500], [2100000, 'Salaries', 300], [4000, 'Tuition', -800]]))
    expect(e.code).toBe('acct-is-money')
  })

  it('decimals or negatives on two or more rows (and a fifth of them) are refused', () => {
    expect(caught(() => read([['', 'Desc', 'Amt'], [1010.5, 'Cash', 500], [4000.25, 'Tuition', -500], [5000, 'Salaries', 0]])).code).toBe('acct-is-money')
    expect(caught(() => read([['', 'Desc', 'Amt'], ['98.72', 'Cash', 500], ['106.67', 'Tuition', -500]])).code).toBe('acct-is-money')
    expect(caught(() => read([['', 'Desc', 'Amt'], [-300000, 'Aid', 500], [-12000, 'Refunds', 100], [4000, 'Tuition', -600]])).code).toBe('acct-is-money')
  })

  it('one footer date-time cell or a 0000 suspense row is a skipped row, never a refused column (as at HEAD)', () => {
    const r = read([
      ['', 'Desc', 'Amt'],
      [1010, 'Cash', 500],
      [0, 'Suspense', 0],
      [4000, 'Tuition', -500],
      [46310.43, null, null],
    ])
    expect(r.rows.map((x) => x.acct)).toEqual([1010, 4000])
  })

  it('under an Account header the numbers are trusted: 1010.10 sub-accounts read as at HEAD', () => {
    const r = read([['Account', 'Desc', 'Amt'], [1010.1, 'Cash', 500], [4010.1, 'Tuition', -500]])
    expect(r.rows.map((x) => x.acct)).toEqual([1010, 4010])
  })

  it('a multi-fund trial balance (the same account in funds 01 and 02) reads', () => {
    const bytes = workbook({
      Sheet1: [
        ['Fund', 'Account', 'Desc', 'Balance'],
        ['01', 1010, 'Cash', 500],
        ['01', 4010, 'Tuition', -500],
        ['02', 1010, 'Cash', 200],
        ['02', 4010, 'Tuition', -200],
      ],
    })
    const r = parseWithColumns('Fund TB.xlsx', bytes, { headerRow: 0, acct: 1, desc: 2, amount: 3, debit: -1, credit: -1 })
    expect(r.rows.map((x) => x.acct)).toEqual([1010, 4010, 1010, 4010])
    expect(previewFile('Fund TB.xlsx', bytes)!.columns[1]!.holdsAmounts).toBe(false)
  })

  it('a department-split trial balance (6010 three times) reads', () => {
    const rows = [
      ['Acct', 'Desc', 'Balance'],
      [1010, 'Cash', 900],
      [6010, 'Salaries - Lower School', -300],
      [6010, 'Salaries - Middle School', -300],
      [6010, 'Salaries - Upper School', -300],
    ]
    expect(read(rows).rows.map((x) => x.acct)).toEqual([1010, 6010, 6010, 6010])
    // …even with no header over the numbers: repeats are never evidence of money.
    expect(read([['', 'Desc', 'Balance'], ...rows.slice(1)]).rows).toHaveLength(4)
  })

  it('parent-total lines (1000 Cash … 1000 Total Cash) read', () => {
    const r = read([
      ['', 'Desc', 'Balance'],
      [1000, 'Cash', null],
      [1010, 'Checking', 400],
      [1020, 'Savings', 100],
      [1000, 'Total Cash', 500],
      [4000, 'Tuition', -500],
    ])
    expect(r.rows.map((x) => x.acct)).toEqual([1000, 1010, 1020, 1000, 4000])
  })

  it('columnHoldsAmounts: banner text above a blank header is not a column name (one- or multi-cell banner)', () => {
    const grid = [['Trial Balance'], ['As of June 30, 2026'], [null, 'Desc', 'Amount'], [1010, 'Cash', 5], [4000, 'Tuition', -5]]
    expect(columnHoldsAmounts(grid, 2, 0)).toBe(false)
    expect(columnHoldsAmounts(grid, 2, 2)).toBe(true)
    const multi = [['Trial Balance', null, null, 'As of June 30, 2026'], [null, 'Desc', 'Debit', 'Credit'], [1010, 'Cash', 5, null], [4000, 'Tuition', null, 5]]
    expect(columnHoldsAmounts(multi, 1, 0)).toBe(false)
  })

  it('the banner row picked as the header: the ROW is wrong, not the column', () => {
    const bytes = workbook({
      Sheet1: [
        ['Trial Balance', null, null, 'As of June 30, 2026'],
        ['Acct', 'Desc', 'Debit', 'Credit'],
        [1010, 'Cash', 500, null],
        [4000, 'Tuition', null, 500],
      ],
    })
    const e = caught(() => parseWithColumns('TB.xlsx', bytes, { headerRow: 0, acct: 0, desc: 1, amount: -1, debit: 2, credit: 3 }))
    expect([e.code, e.reason, e.ask]).toEqual(['bad-choice', "That row doesn't look like your column names.", 'Pick the row with the column names.'])
    // The right header row reads.
    expect(parseWithColumns('TB.xlsx', bytes, { headerRow: 1, acct: 0, desc: 1, amount: -1, debit: 2, credit: 3 }).rows).toHaveLength(2)
  })

  it('a genuine account column still reads (text numbers, repeats)', () => {
    const r = read([
      ['Acct', 'Desc', 'Amt'],
      ['1010', 'Cash', 500],
      ['1010', 'Cash (fund B)', 100],
      ['4000-10', 'Tuition', -600],
    ])
    expect(r.rows.map((x) => x.acct)).toEqual([1010, 1010, 4000])
  })

  it('columnsHoldingAmounts re-judges every column at another header row', () => {
    const bytes = workbook({ Sheet1: [['Acct', 'Desc', 'Balance'], [1010, 'Cash', 500], [4000, 'Tuition', -500]] })
    expect(columnsHoldingAmounts('TB.xlsx', bytes, { sheet: null, headerRow: 0 })).toEqual([false, false, true])
    expect(columnsHoldingAmounts('TB.xlsx', bytes, { sheet: null, headerRow: -1 })).toEqual([false, false, false])
  })
})

describe('remembered layouts', () => {
  // Names carry no numbers and there is no banner: the automatic read fails, so
  // memory is consulted — and a remembered layout whose account column is the
  // Budget column must not be applied.
  const GRID = [
    ['Name', 'Actual', 'Budget'],
    ['Registration Fees', 96000, 90000],
    ['Fundraising', 88500, 95000],
    ['Aftercare', 64200, 60000],
  ]
  const bytes = workbook({ Sheet1: GRID })
  const p = previewFile('report.xlsx', bytes)!

  it('a remembered money-as-account layout is ignored (the automatic failure stands)', () => {
    const memory: IntakeMemory = {
      ...EMPTY_INTAKE_MEMORY,
      layouts: [
        { sheet: 'Sheet1', headerRow: 0, acct: 2, desc: 0, amount: 1, debit: -1, credit: -1, signature: p.signature, source: 'picked' },
      ],
    }
    expect(p.signature).not.toBeNull()
    const e = caught(() => ingest('report.xlsx', bytes, { memory }))
    expect(e.code).not.toBe('acct-is-money')
    expect(e.preview).not.toBeNull()
    expect(p.guess.acct).toBe(-1)
  })
})

describe('regressions', () => {
  it('Holy Family files read as before automatically', () => {
    const pl = ingest(PL_FILE, hf(PL_FILE))
    const bs = ingest(BS_FILE, hf(BS_FILE))
    const full = ingest(WORKBOOK, hf(WORKBOOK))
    expect([pl.rows.length, pl.metadata!.statement!.partial, sum(pl.rows)]).toEqual([19, 'pl', -62700])
    expect([bs.rows.length, bs.metadata!.statement!.partial, sum(bs.rows)]).toEqual([16, 'bs', 0])
    expect([full.rows.length, full.metadata!.statement!.partial, sum(full.rows)]).toEqual([34, 'full', 0])
  })

  it('the ledger export fixture imports via picked debit C / credit D', () => {
    const bytes = load('ledger', 'ledger export.xlsx')
    const p = previewFile('ledger export.xlsx', bytes)!
    expect(p.guess).toMatchObject({ headerRow: 3, acct: 0, desc: 1, amount: -1, debit: 2, credit: 3 })
    const r = ingest('ledger export.xlsx', bytes, { columns: { ...p.guess, amount: -1, debit: 2, credit: 3 } })
    expect(r.rows.length).toBe(18)
    expect(sum(r.rows)).toBe(0)
    expect(r.metadata!.statement).toBeUndefined()
    expect(r.metadata!.layout).toMatchObject({ source: 'picked', acct: 0, debit: 2, credit: 3 })
  })
})

// ─────────────────────────────────────────────────────────────
// #32 — when a finance file cannot be read, ingest() says WHY in plain words,
// asks the one question that unblocks it, and hands the picker a preview.
// The reason names column LETTERS only — never a cell's text.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  ingest,
  IngestError,
  isIngestError,
  ingestFailureOf,
  previewFile,
  explainFailure,
  columnLetter,
  layoutSignature,
  PREVIEW_ROWS,
} from '../src/index.js'

function workbook(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
/** A sheet whose data starts at C3 (its !ref starts there). */
function offsetWorkbook(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows, { origin: 'C3' } as never)
  ws['!ref'] = XLSX.utils.encode_range({ s: { c: 2, r: 2 }, e: { c: 4, r: 2 + rows.length - 1 } })
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
const csv = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer
function caught(fn: () => unknown): IngestError {
  try {
    fn()
  } catch (e) {
    if (isIngestError(e)) return e
    throw new Error(`not an IngestError: ${String(e)}`)
  }
  throw new Error('did not throw')
}

const UNLABELED: unknown[][] = [['Trial Balance FY26'], ['Acct', 'Desc', null], [1010, 'Cash', 500], [4000, 'Tuition', -500]]

const FIXTURES: Record<string, { name: string; bytes: ArrayBuffer; cells: unknown[][] }> = {
  unlabeled: { name: 'TB_FY26.xlsx', bytes: workbook({ Sheet1: UNLABELED }), cells: UNLABELED },
  amountsOnly: {
    name: 'Mystery.xlsx',
    cells: [['Holy Family'], ['Report'], ['Name', 'Amount'], ['Tuition', 500], ['Salaries', 300], ['Cash', 200]],
    bytes: workbook({ Sheet1: [['Holy Family'], ['Report'], ['Name', 'Amount'], ['Tuition', 500], ['Salaries', 300], ['Cash', 200]] }),
  },
  numbersOnly: {
    name: 'Numbers.xlsx',
    cells: [['x'], ['y'], [1010, 500], [4000, 700], [5000, 900]],
    bytes: workbook({ Sheet1: [['x'], ['y'], [1010, 500], [4000, 700], [5000, 900]] }),
  },
}

describe('A32-1 — the B3 grid fails with a plain reason, the ask, and a preview guess', () => {
  const e = caught(() => ingest('TB_FY26.xlsx', FIXTURES.unlabeled!.bytes))
  it('is an IngestError with code no-amount and the legacy message kept', () => {
    expect(e).toBeInstanceOf(IngestError)
    expect(e.code).toBe('no-amount')
    expect(e.reason).toBe('We found account numbers in column A but no amount column.')
    expect(e.ask).toBe('Which column holds the balances?')
    expect(e.message).toMatch(/no amount column/)
  })
  it('carries a preview whose guess is pre-selected (never applied)', () => {
    expect(e.preview).not.toBeNull()
    expect(e.preview!.guess).toMatchObject({ headerRow: 1, acct: 0, desc: 1, amount: 2, debit: -1, credit: -1 })
    expect(e.preview!.columns.map((c) => c.letter)).toEqual(['A', 'B', 'C'])
    expect(e.preview!.columns.map((c) => c.kind)).toEqual(['acct', 'text', 'money'])
    expect(e.preview!.rows[2]).toEqual(['1010', 'Cash', '500'])
    expect(e.preview!.readsAsStatement).toBe(false)
    expect(e.preview!.signature).toBe('w=3:acct|desc')
  })
  it('ingestFailureOf normalises it, and a plain Error too', () => {
    expect(ingestFailureOf(e)).toMatchObject({ code: 'no-amount', reason: e.reason, ask: e.ask, technical: e.message })
    expect(ingestFailureOf(new Error('boom'))).toEqual({ code: null, reason: 'boom', ask: null, preview: null, technical: 'boom' })
    expect(isIngestError({ name: 'IngestError', code: 'empty' })).toBe(true)
    expect(isIngestError(new Error('x'))).toBe(false)
  })
})

describe('codes', () => {
  it('unsupported (no preview)', () => {
    const e = caught(() => ingest('notes.pdf', new ArrayBuffer(4)))
    expect(e.code).toBe('unsupported')
    expect(e.reason).toBe('KYRO reads Excel (.xlsx, .xls) and .csv files.')
    expect(e.ask).toBeNull()
    expect(e.preview).toBeNull()
  })
  it('empty', () => {
    const e = caught(() => ingest('blank.csv', csv('a\n')))
    expect(e.code).toBe('empty')
    expect(e.reason).toBe('This file looks empty.')
  })
  it('no-accounts when amounts exist but no account numbers', () => {
    const e = caught(() => ingest('Mystery.xlsx', FIXTURES.amountsOnly!.bytes))
    expect(e.code).toBe('no-accounts')
    expect(e.reason).toBe('We found amounts in column B but no account numbers.')
    expect(e.ask).toBe('Which column has the account numbers?')
  })
  it('no-description when numbers exist but no names', () => {
    const e = caught(() => ingest('Numbers.xlsx', FIXTURES.numbersOnly!.bytes))
    expect(e.code).toBe('no-description')
    expect(e.reason).toBe('We found account numbers in column A but no account names.')
  })
  it('budget-only (a Budget Overview) has no preview, and keeps the old message', () => {
    const budget = [
      ['Sample School'], ['Budget Overview: FY2026 Budget - FY26 P&L'], ['July 2025 - June 2026'], [], [null, 'Jul 2025', 'Total'],
      ['Income'], ['   Tuition', 100, 300], ['Total Income', 100, 300], ['Net Income', 100, 300],
    ]
    const e = caught(() => ingest('Budget Overview.xlsx', workbook({ Budget: budget })))
    expect(e.code).toBe('budget-only')
    expect(e.preview).toBeNull()
    expect(e.message).toMatch(/no Actual column/)
    expect(e.reason).toBe('This is a budget report — it has no actual amounts.')
    expect(e.ask).toBe('Export Budget vs. Actuals or the Profit and Loss instead.')
  })
  it('the CSV whose amount header is unrecognised now refuses instead of importing zeros (A32-7)', () => {
    const e = caught(() => ingest('Odd TB.csv', csv('Acct,Desc,Mystery\n4000,Tuition,-500\n5000,Salaries,500\n1010,Cash,0\n')))
    expect(e.message).toMatch(/no amount column/)
    expect(e.reason).toBe('We found account numbers in column A but no amount column.')
  })
})

describe('A32-2 — no reason ever quotes a cell', () => {
  it('for every fixture', () => {
    for (const f of Object.values(FIXTURES)) {
      const e = caught(() => ingest(f.name, f.bytes))
      const cells = f.cells.flat().filter((c) => c != null && String(c).trim() !== '').map(String)
      for (const c of cells) {
        if (/^[A-Z]$/.test(c)) continue
        expect(`${e.reason} ${e.ask ?? ''}`, `${f.name}: "${c}"`).not.toContain(c)
      }
    }
  })
})

describe('preview details', () => {
  it('letters follow the sheet’s !ref start column (data starting at C3)', () => {
    const p = previewFile('Offset.xlsx', offsetWorkbook([['Acct', 'Desc', null], [1010, 'Cash', 500], [4000, 'Tuition', -500]]))!
    expect(p.columns.map((c) => c.letter)).toEqual(['C', 'D', 'E'])
    const e = caught(() => ingest('Offset.xlsx', offsetWorkbook([['T'], ['Acct', 'Desc', null], [1010, 'Cash', 500], [4000, 'Tuition', -500]])))
    expect(e.reason).toBe('We found account numbers in column C but no amount column.')
  })
  it('caps rows, flags budget-ish headers, and lists sheets', () => {
    const many: unknown[][] = [['Acct', 'Desc', 'Actual', 'Budget']]
    for (let i = 0; i < 60; i++) many.push([1000 + i, `A${i}`, i, i])
    const p = previewFile('Big.xlsx', workbook({ One: many, Two: [['x']] }))!
    expect(p.rows).toHaveLength(PREVIEW_ROWS)
    expect(p.totalRows).toBe(61)
    expect(p.sheets).toEqual(['One', 'Two'])
    expect(p.columns[3]!.budgetish).toBe(true)
    expect(p.columns[2]!.budgetish).toBe(false)
  })
  it('columnLetter / explainFailure / layoutSignature', () => {
    expect([columnLetter(0), columnLetter(25), columnLetter(26), columnLetter(0, 2)]).toEqual(['A', 'Z', 'AA', 'C'])
    expect(explainFailure('bad-choice', null, { variant: 'same-column', roles: ['desc', 'amount'], column: 1 })).toEqual({
      reason: "Names and amounts can't both be column B.",
      ask: 'Pick a different column for one of them.',
    })
    expect(explainFailure('bad-choice', null, { variant: 'same-column', roles: ['acct', 'amount'] }).reason).toBe(
      "Account numbers and amounts can't be the same column.",
    )
    expect(explainFailure('budget-column', null, { column: 3 }).reason).toBe('Column D holds budget, variance or prior-year figures, not actual balances.')
    const a = [['Acct', 'Desc', 'Q4 2026']]
    const b = [['Acct', 'Desc', 'Q1 2027']]
    expect(layoutSignature(a, 0)).toBe('w=3:acct|desc|q# #')
    expect(layoutSignature(a, 0)).toBe(layoutSignature(b, 0))
    expect(layoutSignature([['Acct', null]], 0)).toBeNull()
    expect(layoutSignature(a, -1)).toBeNull()
  })
})

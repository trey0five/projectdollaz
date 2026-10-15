// ─────────────────────────────────────────────────────────────
// #32 — reading a file with the columns a person picked. The pick supplies
// columns, never a statement verdict; budget columns, zero columns and text
// amounts are refused; and a file the automatic read accepts is never
// touched by a pick or by memory (never-hijack).
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
  gridReadsAsStatement,
  BUDGETISH,
  EMPTY_INTAKE_MEMORY,
  type ColumnChoice,
  type IngestError,
  type IntakeMemory,
} from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const sampleDir = resolve(here, '..', '..', '..', 'sample-data')
function loadSample(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(sampleDir, name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
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
const pick = (p: Partial<ColumnChoice>): ColumnChoice => ({ headerRow: 1, acct: 0, desc: 1, amount: 2, debit: -1, credit: -1, ...p })

const UNLABELED = workbook({ Sheet1: [['Trial Balance FY26'], ['Acct', 'Desc', null], [1010, 'Cash', 500], [4000, 'Tuition', -500]] })

describe('A32-3 — the guess, picked, reads the file', () => {
  it('2 rows, [500, −500], layout source picked with a signature', () => {
    let guess: ColumnChoice | undefined
    try {
      ingest('TB_FY26.xlsx', UNLABELED)
    } catch (e) {
      guess = (e as IngestError).preview!.guess
    }
    const r = ingest('TB_FY26.xlsx', UNLABELED, { columns: guess! })
    expect(r.rows).toEqual([
      { acct: 1010, desc: 'Cash', total: 500 },
      { acct: 4000, desc: 'Tuition', total: -500 },
    ])
    expect(r.metadata!.layout).toMatchObject({ source: 'picked', headerRow: 1, acct: 0, desc: 1, amount: 2, signature: 'w=3:acct|desc' })
    expect(r.metadata!.fiscalYear).toBe(2026)
    expect(r.metadata!.statement).toBeUndefined()
  })

  it('Debit + Credit columns read debit − credit, always as a trial balance', () => {
    const bytes = workbook({ Sheet1: [['Profit and Loss'], ['Acct', 'Desc', 'Dr', 'Cr'], [1010, 'Cash', 500, null], [4000, 'Tuition', null, 500]] })
    const r = ingest('Profit and Loss.xlsx', bytes, { columns: pick({ amount: -1, debit: 2, credit: 3 }) })
    expect(r.rows.map((x) => x.total)).toEqual([500, -500])
    expect(r.metadata!.statement).toBeUndefined()
  })

  it('names fall back to "Account <n>" when no name column is picked', () => {
    const r = parseWithColumns('TB.xlsx', UNLABELED, pick({ desc: -1 }))
    expect(r.rows.map((x) => x.desc)).toEqual(['Account 1010', 'Account 4000'])
  })
})

describe('A32-4 — refusals', () => {
  const BVA = workbook({ Sheet1: [['T'], ['Acct', 'Desc', 'Actual', 'Budget', '% of Budget', 'Variance', 'Prior Year'], [1010, 'Cash', 500, 400, 1.2, 100, 300], [4000, 'Tuition', -500, -400, 1.2, -100, -300]] })
  it('a Budget / % / Variance / Prior Year column → budget-column', () => {
    for (const col of [3, 4, 5, 6]) {
      const e = caught(() => parseWithColumns('TB.xlsx', BVA, pick({ amount: col })))
      expect(e.code).toBe('budget-column')
      expect(e.reason).toMatch(/^Column [D-G] holds budget, variance or prior-year figures/)
    }
    expect(parseWithColumns('TB.xlsx', BVA, pick({ amount: 2 })).rows).toHaveLength(2)
    expect(BUDGETISH.test('Actual')).toBe(false)
  })
  it('an all-blank column → no-amount (zeros)', () => {
    const e = caught(() => parseWithColumns('TB.xlsx', workbook({ Sheet1: [['T'], ['Acct', 'Desc', 'X', 'Y'], [1010, 'Cash', null, 5], [4000, 'Tuition', null, 6]] }), pick({ amount: 2 })))
    expect(e.code).toBe('no-amount')
    expect(e.reason).toBe('Every amount in column C is blank or zero.')
  })
  it('acct === amount → bad-choice (same column)', () => {
    const e = caught(() => parseWithColumns('TB.xlsx', UNLABELED, pick({ amount: 0 })))
    expect(e.code).toBe('bad-choice')
    expect(e.reason).toBe("Account numbers and amounts can't both be column A.")
    expect(e.ask).toBe('Pick a different column for one of them.')
  })
  it('names the roles that ACTUALLY collide (review: Names = Amounts = column B said "Account numbers and amounts")', () => {
    const e = caught(() => parseWithColumns('TB.xlsx', UNLABELED, pick({ amount: 1 })))
    expect(e.code).toBe('bad-choice')
    expect(e.reason).toBe("Names and amounts can't both be column B.")
    const dc = caught(() => parseWithColumns('TB.xlsx', UNLABELED, pick({ amount: -1, debit: 2, credit: 2 })))
    expect(dc.reason).toBe("Debits and credits can't both be column C.")
  })
  it('acct −1 on a grid that is not a statement → bad-choice (need-acct)', () => {
    const e = caught(() => parseWithColumns('TB.xlsx', UNLABELED, pick({ acct: -1 })))
    expect(e.code).toBe('bad-choice')
    expect(e.reason).toBe('We can only number accounts ourselves for a QuickBooks Profit and Loss or Balance Sheet.')
  })
  it('text in amount cells skips those rows and says how many', () => {
    const bytes = workbook({ Sheet1: [['T'], ['Acct', 'Desc', null], [1010, 'Cash', 500], [1020, 'Petty', 'n/a'], [1030, 'Bank', 'see note'], [4000, 'Tuition', -500]] })
    const r = parseWithColumns('TB.xlsx', bytes, pick({}))
    expect(r.rows.map((x) => x.acct)).toEqual([1010, 4000])
    expect(r.warnings).toEqual(['2 rows had text in the amount column and were skipped.'])
  })
  it('half a Debit/Credit pair, or out-of-range indices → bad-choice', () => {
    expect(caught(() => parseWithColumns('TB.xlsx', UNLABELED, pick({ amount: -1, debit: 2 }))).code).toBe('bad-choice')
    expect(caught(() => parseWithColumns('TB.xlsx', UNLABELED, pick({ amount: 9 }))).code).toBe('bad-choice')
    expect(caught(() => parseWithColumns('TB.xlsx', UNLABELED, pick({ acct: -1, desc: -1 }))).code).toBe('bad-choice')
  })
})

describe('picked columns on a statement', () => {
  const PL = [['Profit and Loss'], ['July 2025 - June 2026'], [], ['', 'Actual', 'Budget'], ['Income'], ['   Tuition', 1000, 900], ['Total Income', 1000, 900], ['Expenses'], ['   Salaries', 400, 450], ['Total Expenses', 400, 450], ['Net Income', 600, 450]]
  it('is still walked as a statement (signed by section, numbers synthesised when acct is −1)', () => {
    const r = parseWithColumns('P&L.xlsx', workbook({ Sheet1: PL }), { headerRow: 3, acct: -1, desc: 0, amount: 1, debit: -1, credit: -1 })
    expect(r.metadata!.statement!.partial).toBe('pl')
    expect(r.rows.map((x) => [x.desc, x.total])).toEqual([['Tuition', -1000], ['Salaries', 400]])
    expect(r.metadata!.layout!.source).toBe('picked')
  })
  it('the budget column of a statement is refused too', () => {
    expect(caught(() => parseWithColumns('P&L.xlsx', workbook({ Sheet1: PL }), { headerRow: 3, acct: -1, desc: 0, amount: 2, debit: -1, credit: -1 })).code).toBe('budget-column')
  })
  it('gridReadsAsStatement never claims a Debit | Credit grid', () => {
    expect(gridReadsAsStatement('Profit and Loss.xlsx', [['Profit and Loss'], ['Acct', 'Desc', 'Debit', 'Credit'], [1, 'x', 1, 0]], 'S')).toBe(false)
    expect(gridReadsAsStatement('P&L.xlsx', PL, 'S')).toBe(true)
    expect(gridReadsAsStatement('TB.xlsx', [['Trial Balance'], ['Acct', 'Desc', null], [1010, 'Cash', 1]], 'S')).toBe(false)
  })
  it('a Debit/Credit grid read with an amount override is never statement-walked', () => {
    const bytes = workbook({ Sheet1: [['Profit and Loss'], ['Acct', 'Desc', 'Debit', 'Credit', 'Net'], [1010, 'Cash', 500, null, 500], [4000, 'Tuition', null, 500, -500]] })
    const r = parseWithColumns('Profit and Loss.xlsx', bytes, pick({ amount: 4 }))
    expect(r.metadata!.statement).toBeUndefined()
    expect(r.rows.map((x) => x.total)).toEqual([500, -500])
  })
})

describe('A32-5 — never hijack a file the automatic read accepts', () => {
  const SAMPLES = ['TB_CurrentYear_FY26.xlsx', 'TB_PriorYear_FY25.xlsx', 'TB_AuditedFYEnd_FY25.xlsx']
  it('memory (undefined / null / empty / a matching layout + pins) leaves every sample byte-identical', () => {
    for (const name of SAMPLES) {
      const bytes = loadSample(name)
      const base = ingest(name, bytes)
      const sigLayout = {
        sheet: null, headerRow: 0, acct: 0, desc: 1, amount: 2, debit: -1, credit: -1,
        signature: 'w=5:account|description|debit|credit|total', source: 'picked' as const,
      }
      const memory: IntakeMemory = { layouts: [sigLayout], synthetic: { 'revenue:tuition': { acct: 45000, section: 'revenue', name: 'Tuition' } } }
      for (const m of [undefined, null, EMPTY_INTAKE_MEMORY, memory]) {
        const r = ingest(name, bytes, { memory: m })
        expect(r.rows).toEqual(base.rows)
        expect(r.metadata).toEqual(base.metadata)
        expect(r.metadata?.layout).toBeUndefined()
      }
    }
  })
})

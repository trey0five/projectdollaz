// ─────────────────────────────────────────────────────────────
// Review fix: a workbook holding ONE Balance Sheet beside SEVERAL P&Ls
// ('P&L Jan 2026' + 'P&L FY26' + 'Balance Sheet') imported only the FIRST
// tab (a January P&L, "Income only") and then told the person to add the
// Balance Sheet that was already in the file. The workbook path now pairs
// the P&L whose period end matches the BS date into a full trial balance and
// names the sheets it did not use, in plain words + a structured note.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { ingest, parseStatementWorkbook } from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const WORKBOOK = resolve(here, '__fixtures__', 'holy-family', 'Holy Family Academy Financial Statements 6-30-26.xlsx')

function grids(): Record<string, unknown[][]> {
  const wb = XLSX.read(readFileSync(WORKBOOK), { type: 'buffer' })
  const out: Record<string, unknown[][]> = {}
  for (const n of wb.SheetNames) out[n] = XLSX.utils.sheet_to_json(wb.Sheets[n]!, { header: 1, defval: null }) as unknown[][]
  return out
}
function book(sheets: Array<[string, unknown[][]]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
const JAN_PL: unknown[][] = [
  ['Holy Family Academy'], ['Profit and Loss'], ['Year-to-Date ending Jan 31, 2026'], [],
  ['', 'Total'], ['   Income'], ['      40100 Tuition', 2200000], ['      40200 Registration Fees', 50000],
  ['   Total Income', 2250000], ['Net Income', 2250000],
]

describe('a workbook with one Balance Sheet and several P&Ls', () => {
  const g = grids()
  const bytes = book([['P&L Jan 2026', JAN_PL], ['P&L FY26', g['Profit and Loss']!], ['Balance Sheet', g['Balance Sheet']!]])

  it('imports the P&L dated like the Balance Sheet, merged as a full trial balance', () => {
    const r = ingest('Holy Family statements.xlsx', bytes)
    const st = r.metadata!.statement!
    expect(st.partial).toBe('full')
    expect(r.metadata!.sheet).toBe('P&L FY26 + Balance Sheet')
    expect(r.metadata!.periodEndDate).toBe('2026-06-30')
    // The FY P&L's income, not January's.
    expect(r.rows.find((x) => x.acct === 40100)!.total).toBe(-3850000)
    // Balance-sheet accounts are present.
    expect(r.rows.some((x) => x.acct === 10100)).toBe(true)
    expect(Math.round(r.rows.reduce((s, x) => s + x.total, 0) * 100) / 100).toBe(0)
  })

  it('names the unused sheet in plain words and in metadata.statement.workbook', () => {
    const r = ingest('Holy Family statements.xlsx', bytes)
    expect(r.metadata!.statement!.workbook).toEqual({
      code: 'other-statement-sheets',
      statements: 3,
      used: ['P&L FY26', 'Balance Sheet'],
      unused: ['P&L Jan 2026'],
    })
    expect(r.warnings).toContain(
      'This workbook has 3 statements: we used "P&L FY26" + "Balance Sheet". Use Add years for the others ("P&L Jan 2026").',
    )
  })

  it('the plain two-sheet workbook is unchanged (no workbook note, no warning)', () => {
    const r = parseStatementWorkbook(book([['Profit and Loss', g['Profit and Loss']!], ['Balance Sheet', g['Balance Sheet']!]]))!
    expect(r.metadata.statement.partial).toBe('full')
    expect(r.metadata.statement.workbook).toBeUndefined()
  })

  it('a Debit | Credit trial-balance sheet is never counted as a statement', () => {
    const tb: unknown[][] = [
      ['Trial Balance'], ['As of June 30, 2026'], ['Account', 'Description', 'Debit', 'Credit', 'Total'],
      [null, 'Assets'], [1010, 'Cash', 500, 0, 500], [null, 'Total Assets', 500, 0, 500],
      [null, 'Income'], [4000, 'Tuition', 0, 500, -500], [null, 'Total Income', 0, 500, -500],
    ]
    const r = parseStatementWorkbook(
      book([['TB', tb], ['P&L Jan 2026', JAN_PL], ['P&L FY26', g['Profit and Loss']!], ['Balance Sheet', g['Balance Sheet']!]]),
    )!
    expect(r.metadata.statement.workbook).toEqual({
      code: 'other-statement-sheets',
      statements: 3,
      used: ['P&L FY26', 'Balance Sheet'],
      unused: ['P&L Jan 2026'],
    })
    // A workbook that is ONLY a sectioned TB (sheet named like a statement) stays a TB.
    const only = ingest('Balance Sheet.xlsx', book([['Balance Sheet', tb]]))
    expect(only.metadata?.statement).toBeUndefined()
    expect(only.rows.map((x) => [x.acct, x.total])).toEqual([[1010, 500], [4000, -500]])
  })

  it('two P&Ls on the Balance Sheet date never guess: first sheet + the plain note', () => {
    const r = parseStatementWorkbook(
      book([['A', g['Profit and Loss']!], ['B', g['Profit and Loss']!], ['Balance Sheet', g['Balance Sheet']!]]),
    )!
    expect(r.metadata.sheet).toBe('A')
    expect(r.metadata.statement.partial).toBe('pl')
    expect(r.metadata.statement.workbook).toEqual({ code: 'other-statement-sheets', statements: 3, used: ['A'], unused: ['B', 'Balance Sheet'] })
  })
})

// Customer upload 2026-10-24: a P&L and Balance Sheet $977,876.30 apart were
// combined with an acct-399 balancing line that hid the gap. A workbook pair
// that doesn't tie is not combined — the first statement is read on its own,
// and the warning says how far apart they are.
describe('a workbook whose P&L and Balance Sheet do not tie', () => {
  const g = grids()
  const off = (g['Balance Sheet'] as unknown[][]).map((row) =>
    String(row[0] ?? '').includes('10100') ? [row[0], Number(row[1]) + 977876.3] : row,
  )

  it('is not combined, adds no balancing line, and says how far apart', () => {
    const r = ingest('Holy Family statements.xlsx', book([['Profit and Loss', g['Profit and Loss']!], ['Balance Sheet', off]]))
    expect(r.metadata!.statement!.partial).toBe('pl')
    expect(r.rows.some((x) => x.acct === 399)).toBe(false)
    expect((r.warnings ?? []).join(' ')).toMatch(/977876\.30 apart, so they were not combined/)
  })

  it('…while a pair that ties still combines', () => {
    const r = ingest('Holy Family statements.xlsx', book([['Profit and Loss', g['Profit and Loss']!], ['Balance Sheet', g['Balance Sheet']!]]))
    expect(r.metadata!.statement!.partial).toBe('full')
  })
})

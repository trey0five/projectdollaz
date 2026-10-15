// ─────────────────────────────────────────────────────────────
// Review MUST: a QuickBooks Budget Overview must never import as ACTUALS
// through the column picker or a remembered layout. A Budget Overview's money
// columns are "Total" and month names (no "Budget" in the header), so the
// per-column BUDGETISH test alone let them through; and a remembered
// "P&L by Month" layout has the SAME header signature as a Budget Overview by
// month. On a budget report only a column headed Actual may be read, and a
// budget refusal never falls through to remembered layouts.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  ingest,
  isIngestError,
  isBudgetReport,
  layoutSignature,
  parseWithColumns,
  previewFile,
  type ColumnChoice,
  type IngestError,
  type IntakeMemory,
} from '../src/index.js'

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
const choice = (p: Partial<ColumnChoice>): ColumnChoice => ({ headerRow: 4, acct: -1, desc: 0, amount: 3, debit: -1, credit: -1, ...p })

const HEADER = [null, 'Jul 2025', 'Aug 2025', 'Total']
const BUDGET_OVERVIEW: unknown[][] = [
  ['Sample School'],
  ['Budget Overview: FY2026 Budget - FY26 P&L'],
  ['July 2025 - June 2026'],
  [],
  HEADER,
  ['Income'],
  ['   40100 Tuition', 250000, 250000, 500000],
  ['Total Income', 250000, 250000, 500000],
  ['Expenses'],
  ['   50100 Salaries', 150000, 150000, 300000],
  ['Total Expenses', 150000, 150000, 300000],
  ['Net Income', 100000, 100000, 200000],
]
/** The ACTUALS report with the identical month header — the layout a school would have picked before. */
const PL_BY_MONTH: unknown[][] = [
  ['Sample School'],
  ['Profit and Loss by Month'],
  ['July 2025 - June 2026'],
  [],
  HEADER,
  ['Income'],
  ['   40100 Tuition', 240000, 240000, 480000],
  ['Total Income', 240000, 240000, 480000],
  ['Expenses'],
  ['   50100 Salaries', 140000, 150000, 290000],
  ['Total Expenses', 140000, 150000, 290000],
  ['Net Income', 100000, 90000, 190000],
]
const BVA: unknown[][] = [
  ['Sample School'],
  ['Profit and Loss Budget vs. Actual'],
  ['July 2025 - June 2026'],
  [],
  [null, 'Actual', 'Budget', 'over Budget', '% of Budget'],
  ['Income'],
  ['   40100 Tuition', 480000, 500000, -20000, 0.96],
  ['Total Income', 480000, 500000, -20000, 0.96],
  ['Expenses'],
  ['   50100 Salaries', 300000, 310000, -10000, 0.97],
  ['Total Expenses', 300000, 310000, -10000, 0.97],
  ['Net Income', 180000, 190000, -10000, 0.95],
]

describe('the column picker never reads a budget report as actuals', () => {
  const bytes = workbook({ Sheet1: BUDGET_OVERVIEW })

  it('the reviewer repro (Total column) is refused with a plain line', () => {
    const e = caught(() => ingest('Budget Overview.xlsx', bytes, { columns: choice({}) }))
    expect(e.code).toBe('budget-column')
    expect(e.reason).toBe('Column D holds budget figures.')
    expect(e.ask).toMatch(/^Pick the Actual column\./)
  })

  it('a month column, Debit + Credit picks, and a neutral file name are refused too (the banner decides)', () => {
    expect(caught(() => ingest('Budget Overview.xlsx', bytes, { columns: choice({ amount: 1 }) })).code).toBe('budget-column')
    expect(caught(() => ingest('FY26 report.xlsx', bytes, { columns: choice({}) })).reason).toBe('Column D holds budget figures.')
    expect(caught(() => ingest('FY26 report.xlsx', bytes, { columns: choice({ amount: -1, debit: 1, credit: 2 }) })).code).toBe('budget-column')
  })

  it('a sheet titled Budget is a budget report even with no banner; the same grid elsewhere imports', () => {
    const grid = [['Acct', 'Desc', 'Amount'], [4000, 'Tuition', -500], [5000, 'Salaries', 500]]
    const pick = { headerRow: 0, acct: 0, desc: 1, amount: 2, debit: -1, credit: -1 }
    expect(caught(() => parseWithColumns('FY26.xlsx', workbook({ 'FY26 Budget': grid }), pick)).code).toBe('budget-column')
    expect(parseWithColumns('FY26.xlsx', workbook({ Sheet1: grid }), pick).rows.map((r) => r.total)).toEqual([-500, 500])
  })

  it('the preview flags every non-Actual money column of a budget report and never guesses one', () => {
    const p = previewFile('Budget Overview.xlsx', bytes)!
    expect(p.columns.slice(1, 4).map((c) => c.budgetish)).toEqual([true, true, true])
    expect(p.guess.amount).toBe(-1)
  })
})

describe('a remembered layout never imports a budget', () => {
  // The school once picked column D of a "P&L by Month" whose header row is
  // [blank, Jul 2025, Aug 2025, Total] — the Budget Overview's signature too.
  const signature = layoutSignature(PL_BY_MONTH, 4)
  const memory: IntakeMemory = {
    layouts: [{ sheet: 'Sheet1', headerRow: 4, acct: -1, desc: 0, amount: 3, debit: -1, credit: -1, signature, source: 'picked' }],
    synthetic: {},
  }

  it('the two reports really do share a signature', () => {
    expect(signature).not.toBeNull()
    expect(layoutSignature(BUDGET_OVERVIEW, 4)).toBe(signature)
  })

  it('the Budget Overview still fails with the budget refusal — no rows, no remembered layout', () => {
    const e = caught(() => ingest('Budget Overview.xlsx', workbook({ Sheet1: BUDGET_OVERVIEW }), { memory }))
    expect(e.code).toBe('budget-only')
    expect(e.message).toMatch(/no Actual column/)
  })

  it('a budget-titled sheet whose automatic read failed for another reason is not rescued by memory either', () => {
    // "Mystery" is no amount header, so the automatic read fails (no-amount)
    // and the remembered layout matches. On "Sheet1" memory rescues it; on a
    // sheet titled Budget the picker's guard refuses, and the plain error stands.
    const grid = [['Acct', 'Desc', 'Mystery'], [4000, 'Tuition', -500], [5000, 'Salaries', 500]]
    const mem: IntakeMemory = {
      layouts: [{ sheet: null, headerRow: 0, acct: 0, desc: 1, amount: 2, debit: -1, credit: -1, signature: layoutSignature(grid, 0), source: 'picked' }],
      synthetic: {},
    }
    expect(ingest('FY26.xlsx', workbook({ Sheet1: grid }), { memory: mem }).metadata!.layout!.source).toBe('remembered')
    expect(caught(() => ingest('FY26.xlsx', workbook({ 'FY26 Budget': grid }), { memory: mem })).code).toBe('no-amount')
  })
})

describe('the automatic read never imports a Budget Overview whose names carry account numbers', () => {
  it('"40100 Tuition" rows used to parse as a garbage trial balance; now the budget refusal is fatal', () => {
    const e = caught(() => ingest('Budget Overview.xlsx', workbook({ Sheet1: BUDGET_OVERVIEW })))
    expect(e.code).toBe('budget-only')
    expect(e.message).toMatch(/no Actual column/)
  })
  it('a Budget Overview SIBLING of a trial balance is still only a warning (F1)', () => {
    const tb = [['Trial Balance'], ['Account', 'Description', 'Debit', 'Credit'], [1010, 'Cash', 500, 0], [4000, 'Tuition', 0, 500]]
    const r = ingest('FY26 workbook.xlsx', workbook({ TB: tb, Budget: BUDGET_OVERVIEW }))
    expect(r.rows.map((x) => x.total)).toEqual([500, -500])
    expect(r.warnings).toEqual([expect.stringMatching(/no Actual column/)])
  })
})

describe('regressions: real actuals still import', () => {
  it('a genuine Budget vs Actuals export reads its Actual column, automatically and when picked', () => {
    const bytes = workbook({ Sheet1: BVA })
    const auto = ingest('Profit and Loss Budget vs Actual.xlsx', bytes)
    expect(auto.rows.map((r) => [r.acct, r.total])).toEqual([[40100, -480000], [50100, 300000]])
    const picked = ingest('Profit and Loss Budget vs Actual.xlsx', bytes, { columns: choice({ amount: 1 }) })
    expect(picked.rows.map((r) => [r.acct, r.total])).toEqual([[40100, -480000], [50100, 300000]])
    expect(isBudgetReport(XLSX.utils.sheet_to_json(XLSX.read(bytes).Sheets.Sheet1!, { header: 1, defval: null }) as unknown[][], 'Sheet1', 4)).toBe(true)
    // …and its Budget column is still refused.
    expect(caught(() => ingest('Profit and Loss Budget vs Actual.xlsx', bytes, { columns: choice({ amount: 2 }) })).code).toBe('budget-column')
    const p = previewFile('Profit and Loss Budget vs Actual.xlsx', bytes)!
    expect(p.columns[1]!.budgetish).toBe(false)
  })

  it('a P&L by Month (actuals) with the same header still imports from its Total column when picked', () => {
    const r = ingest('Profit and Loss by Month.xlsx', workbook({ Sheet1: PL_BY_MONTH }), { columns: choice({}) })
    expect(r.rows.map((x) => [x.acct, x.total])).toEqual([[40100, -480000], [50100, 290000]])
  })

  it('a plain trial balance picks as before, even in a file named like a Budget vs Actuals', () => {
    const tb = workbook({ Sheet1: [['Trial Balance'], ['Account', 'Description', 'Debit', 'Credit'], [1010, 'Cash', 500, 0], [4000, 'Tuition', 0, 500]] })
    const pick = { headerRow: 1, acct: 0, desc: 1, amount: -1, debit: 2, credit: 3 }
    expect(ingest('TB.xlsx', tb, { columns: pick }).rows.map((r) => r.total)).toEqual([500, -500])
    const r = ingest('Budget vs Actuals TB.xlsx', tb, { columns: pick })
    expect(r.rows.map((x) => x.total)).toEqual([500, -500])
    expect(r.metadata!.statement).toBeUndefined()
  })
})

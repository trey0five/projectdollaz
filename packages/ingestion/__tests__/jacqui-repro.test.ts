// Regression for the 2026-10-14 customer failure (GitHub #29, #30): a QuickBooks
// "Statement of Activity — Budget vs Actuals" export with 5-digit account
// numbers and an "Actual" amount column parsed to "No account rows found".
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseTrialBalance, listTrialBalanceSheets } from '../src/adapters/excelAdapter.js'
import { parseTrialBalanceCsv } from '../src/adapters/csvAdapter.js'

function wb(rows: any[][], name = 'Sheet1'): ArrayBuffer {
  const b = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(b, XLSX.utils.aoa_to_sheet(rows), name)
  return XLSX.write(b, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
const CUSTOMER: any[][] = [
  [],
  [null, null, 'Actual'],
  ['Acct', 'Desc', null],
  [40000, '40000 Income', -26301.61],
  [40009, '40009 Discounts and Assistance', 53550],
  [40010, '40010 Income - Enrollment Tuition', 26612.5],
  [40200, '40200 Income - Monthly Tuition Installments', 488257.5],
  [41010, '41010 Contributions with Donor Restriction', 169414.99],
]

describe('5-digit QuickBooks-style accounts (#29)', () => {
  it('parses the customer sheet shape: header row Acct | Desc, amounts under "Actual"', () => {
    // The customer's header split "Actual" onto the row above; a one-row header
    // is the common export, so test that exact layout first.
    const rows: any[][] = [[], [], ['Acct', 'Desc', 'Actual'], ...CUSTOMER.slice(3)]
    const r = parseTrialBalance(wb(rows))
    expect(r.rows.map((x) => x.acct)).toEqual([40000, 40009, 40010, 40200, 41010])
    expect(r.rows.find((x) => x.acct === 40200)!.total).toBeCloseTo(488257.5, 2)
    expect(r.rows.find((x) => x.acct === 40000)!.total).toBeCloseTo(-26301.61, 2)
    expect(listTrialBalanceSheets(wb(rows))).toHaveLength(1)
  })
  it('CSV: 5-digit accounts with a Total column', () => {
    const csv = 'Account,Description,Debit,Credit,Total\n40200,Monthly Tuition,,,488257.50\n60100,Salaries,120000,,\n'
    const r = parseTrialBalanceCsv(new TextEncoder().encode(csv).buffer as ArrayBuffer)
    expect(r.rows.map((x) => [x.acct, x.total])).toEqual([[40200, 488257.5], [60100, 120000]])
  })
  it('still rejects non-account junk in column A (phone numbers, ZIP+4, ids beyond 6 digits)', () => {
    const r = parseTrialBalance(wb([['Account', 'Description', 'Total'], [3055551212, 'A phone', 5], [331391234, 'A ZIP+4', 5], [4000, 'Tuition', 7]]))
    expect(r.rows.map((x) => x.acct)).toEqual([4000])
  })
})

describe('amount-column recognition (#30)', () => {
  it('"Actual" is the balance; Budget / over Budget / % of Budget are ignored', () => {
    const rows: any[][] = [
      ['Statement of Activity — Budget vs. Actuals'], [],
      ['Acct', 'Desc', 'Actual', 'Budget', 'over Budget', '% of Budget'],
      [40200, 'Monthly Tuition', 488257.5, 500000, -11742.5, '97.65%'],
      [60100, 'Salaries', 120000, 118000, 2000, '101.69%'],
    ]
    const r = parseTrialBalance(wb(rows))
    expect(r.rows.map((x) => x.total)).toEqual([488257.5, 120000])
  })
  it('Budget listed BEFORE Actual still picks Actual', () => {
    const r = parseTrialBalance(wb([['Budget vs Actuals'], ['Acct', 'Desc', 'Budget', 'Actual'], [40200, 'Tuition', 500000, 488257.5]]))
    expect(r.rows[0]!.total).toBe(488257.5)
  })
  it('YTD and "Ending Balance" headers are recognised as the balance', () => {
    expect(parseTrialBalance(wb([['Report'], ['Acct', 'Desc', 'YTD'], [40200, 'Tuition', 10]])).rows[0]!.total).toBe(10)
    expect(parseTrialBalance(wb([['Report'], ['Acct', 'Desc', 'Ending Balance'], [40200, 'Tuition', 11]])).rows[0]!.total).toBe(11)
  })
  it('refuses to import a chart of zeros when no amount column is recognisable', () => {
    expect(() => parseTrialBalance(wb([['Acct', 'Desc', 'Mystery'], [40200, 'Tuition', 10], [60100, 'Salaries', 20]])))
      .toThrow(/no amount column.*Mystery/)
  })
  it('Debit/Credit pairs still compute Debit − Credit', () => {
    const r = parseTrialBalance(wb([['Account', 'Description', 'Debit', 'Credit'], [1010, 'Cash', 500, 0], [4000, 'Tuition', 0, 500]]))
    expect(r.rows.map((x) => x.total)).toEqual([500, -500])
  })
})

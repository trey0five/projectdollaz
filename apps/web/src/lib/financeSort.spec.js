// #43 — "upload your financial files and we'll figure it out": one verdict per
// file, from the same parsers the tiles run.
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { sortFinanceFile, groupByDestination } from './financeSort.js'
import { HF_PL, HF_BS, workbook } from './__fixtures__/holyFamily.js'

const fileOf = (name, bytes) => new File([bytes], name)
const csv = (name, lines) => fileOf(name, new TextEncoder().encode(lines.join('\n')))

const TB = (fy, asOf) => [
  'Sample School — Trial Balance',
  `Fiscal Year ${fy} — As of ${asOf}`,
  '',
  'Number,Description,Debit,Credit,Total',
  '100,Cash,500000,,500000',
  '120,Receivable,30000,,30000',
  '200,Payable,,20000,-20000',
  '300,Net assets,,374000,-374000',
  '401,Tuition,,500000,-500000',
  '402,Fees,,20000,-20000',
  '501,Salaries,300000,,300000',
  '502,Benefits,60000,,60000',
  '503,Supplies,24000,,24000',
]
// Sheet cells: numbers as numbers (a CSV splits to strings; a workbook holds numbers).
const tbRows = (asOf) =>
  TB('FY', asOf)
    .slice(1)
    .map((l) => l.split(',').map((c) => (c !== '' && /^-?\d+$/.test(c) ? Number(c) : c)))

describe('sortFinanceFile', () => {
  it('a full-year trial balance → This year', async () => {
    const v = await sortFinanceFile(csv('TB_FY26.csv', TB('FY26', 'June 30, 2026')))
    expect(v.kind).toBe('annual')
    expect(v.destination).toBe('tb-single')
    expect(v.detail).toMatch(/9 accounts/)
  })

  it('a QuickBooks P&L export → This year, named as half a trial balance', async () => {
    const v = await sortFinanceFile(fileOf('Holy Family Profit and Loss 6-30-26.xlsx', workbook({ Sheet1: HF_PL })))
    expect(v.kind).toBe('half')
    expect(v.destination).toBe('tb-single')
    expect(v.title).toBe('Profit and Loss')
    expect(v.detail).toMatch(/Half a trial balance \(Profit and Loss only\)/)
    const bs = await sortFinanceFile(fileOf('Holy Family Balance Sheet 6-30-26.xlsx', workbook({ Sheet1: HF_BS })))
    expect(bs.title).toBe('Balance Sheet')
  })

  it('a workbook with several annual years → Add years', async () => {
    const wb = workbook({ FY25: tbRows('June 30, 2025'), FY26: tbRows('June 30, 2026') })
    const v = await sortFinanceFile(fileOf('Trial balances FY25-FY26.xlsx', wb))
    expect(v.kind, JSON.stringify(v)).toBe('multi-year')
    expect(v.destination).toBe('tb-bulk')
  })

  it('a PDF or an unreadable file is told apart, never thrown', async () => {
    const pdf = await sortFinanceFile(fileOf('audit.pdf', new TextEncoder().encode('%PDF-1.4')))
    expect(pdf.kind).toBe('unsupported')
    expect(pdf.destination).toBeNull()
    const junk = await sortFinanceFile(csv('notes.csv', ['hello', 'world']))
    expect(junk.kind).toBe('unread')
    expect(junk.destination).toBe('tb-single') // the intake's column picker takes it from here
  })

  it('groups files by where they go', () => {
    const groups = groupByDestination([
      { destination: 'tb-single', file: 'a' },
      { destination: 'tb-single', file: 'b' },
      { destination: 'budget', file: 'c' },
      { destination: null, file: 'd' },
    ])
    expect([...groups.keys()]).toEqual(['tb-single', 'budget'])
    expect(groups.get('tb-single')).toHaveLength(2)
  })
})

// Keep the xlsx import "used" for environments that tree-shake test files.
void XLSX

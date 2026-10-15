// ─────────────────────────────────────────────────────────────
// #40 / #41 S-D — statement halves: which half a file is, pairing halves by
// period end (never guessing), rebuilding a mergeable result from stored rows,
// and re-keying a synthesized number (A40-4). Plus the classify reason (A40-5).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  statementHalf,
  pairStatements,
  asStatementResult,
  mergeStatementResults,
  parseStatementGrid,
  validateSyntheticRenumber,
  renumberSynthetic,
  classifyRole,
  statementLabel,
  ingest,
  type SheetMetadata,
} from '../src/index.js'

function gridOf(rows: unknown[][]): unknown[][] {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'S')
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const back = XLSX.read(new Uint8Array(bytes), { type: 'array' })
  return XLSX.utils.sheet_to_json(back.Sheets['S']!, { header: 1, defval: null }) as unknown[][]
}
const half = (partial: 'pl' | 'bs' | 'full' | null, date?: string): SheetMetadata => ({
  sourceName: 'x',
  rowCount: 1,
  ...(date ? { periodEndDate: date } : {}),
  ...(partial ? { statement: { type: partial === 'bs' ? 'bs' : 'pl', title: 't', partial, synthesized: [] } } : {}),
})
type It = { id: string; md: SheetMetadata }
const it_ = (id: string, md: SheetMetadata): It => ({ id, md })
const ids = (r: ReturnType<typeof pairStatements<It>>) => ({
  pairs: r.pairs.map((p) => `${p.pl.id}+${p.bs.id}`),
  unpaired: r.unpaired.map((u) => `${u.item.id}:${u.why}${u.partnerDate ? `@${u.partnerDate}` : ''}`),
})

describe('statementHalf', () => {
  it('pl / bs / null', () => {
    expect(statementHalf(half('pl'))).toBe('pl')
    expect(statementHalf(half('bs'))).toBe('bs')
    expect(statementHalf(half('full'))).toBeNull()
    expect(statementHalf(half(null))).toBeNull()
    expect(statementHalf(undefined)).toBeNull()
  })
})

describe('pairStatements', () => {
  const D = '2026-06-30'
  it('one P&L + one BS on the same date pair; non-halves are ignored', () => {
    const r = pairStatements([it_('p', half('pl', D)), it_('tb', half(null, D)), it_('b', half('bs', D))], (x) => x.md)
    expect(ids(r)).toEqual({ pairs: ['p+b'], unpaired: [] })
  })
  it('2 P&Ls + 1 BS on one date → all three ambiguous', () => {
    const r = pairStatements([it_('p1', half('pl', D)), it_('p2', half('pl', D)), it_('b', half('bs', D))], (x) => x.md)
    expect(ids(r)).toEqual({ pairs: [], unpaired: ['p1:ambiguous', 'p2:ambiguous', 'b:ambiguous'] })
  })
  it('2 P&Ls and no BS → each no-partner', () => {
    const r = pairStatements([it_('p1', half('pl', D)), it_('p2', half('pl', D))], (x) => x.md)
    expect(ids(r).unpaired).toEqual(['p1:no-partner', 'p2:no-partner'])
  })
  it('different dates → date-mismatch with the partner date', () => {
    const r = pairStatements([it_('p', half('pl', '2026-01-31')), it_('b', half('bs', D))], (x) => x.md)
    expect(ids(r)).toEqual({ pairs: [], unpaired: ['p:date-mismatch@2026-06-30', 'b:date-mismatch@2026-01-31'] })
  })
  it('undated → no-date; canPair false → no pair', () => {
    expect(ids(pairStatements([it_('p', half('pl')), it_('b', half('bs', D))], (x) => x.md)).unpaired).toEqual(['p:no-date', 'b:no-partner'])
    const r = pairStatements([it_('p', half('pl', D)), it_('b', half('bs', D))], (x) => x.md, { canPair: () => false })
    expect(ids(r)).toEqual({ pairs: [], unpaired: ['p:no-partner', 'b:no-partner'] })
  })
  it('the A41-SD workbook shape: Jan P&L, FY P&L, BS Jun → one pair + one partial', () => {
    const r = pairStatements(
      [it_('jan', half('pl', '2026-01-31')), it_('fy', half('pl', D)), it_('bs', half('bs', D))],
      (x) => x.md,
    )
    expect(ids(r)).toEqual({ pairs: ['fy+bs'], unpaired: ['jan:no-partner'] })
  })
})

const PL = [['Profit and Loss'], ['July 2025 - June 2026'], [], ['', 'Total'], ['Income'], ['   Tuition', 1000], ['   Fees', 50], ['Total Income', 1050], ['Expenses'], ['   Salaries', 400], ['Total Expenses', 400], ['Net Income', 650]]
const BS = [['Balance Sheet'], ['As of June 30, 2026'], [], ['', 'Total'], ['ASSETS'], ['   Bank Accounts'], ['      10100 Checking', 900], ['   Total Bank Accounts', 900], ['TOTAL ASSETS', 900], ['LIABILITIES AND EQUITY'], ['   Equity'], ['      30000 Net Assets', 250], ['      Net Income', 650], ['   Total Equity', 900], ['TOTAL LIABILITIES AND EQUITY', 900]]

describe('asStatementResult → mergeStatementResults', () => {
  it('rebuilds stored halves and merges them like the adapter does', () => {
    const pl = parseStatementGrid(gridOf(PL), 'P&L')!
    const bs = parseStatementGrid(gridOf(BS), 'Balance Sheet')!
    const direct = mergeStatementResults(pl, bs)
    const rebuilt = mergeStatementResults(
      asStatementResult(JSON.parse(JSON.stringify(pl.rows)), JSON.parse(JSON.stringify(pl.metadata)))!,
      asStatementResult(JSON.parse(JSON.stringify(bs.rows)), JSON.parse(JSON.stringify(bs.metadata)))!,
    )
    expect(rebuilt.rows).toEqual(direct.rows)
    expect(rebuilt.metadata.statement.partial).toBe('full')
    expect(rebuilt.metadata.statement.balancePlug).toBeNull()
  })
  it('null unless the metadata is a half', () => {
    expect(asStatementResult([], half('full'))).toBeNull()
    expect(asStatementResult([], half(null))).toBeNull()
    expect(asStatementResult([], null)).toBeNull()
    expect(asStatementResult([], half('pl'), ['w'])!.warnings).toEqual(['w'])
  })
})

describe('A40-4 — re-keying a synthesized number', () => {
  const r = parseStatementGrid(gridOf(PL), 'P&L')!
  const tuition = r.rows.find((x) => x.desc === 'Tuition')!.acct
  const fees = r.rows.find((x) => x.desc === 'Fees')!.acct
  const salaries = r.rows.find((x) => x.desc === 'Salaries')!.acct
  it('validates with the exact plain messages', () => {
    expect(validateSyntheticRenumber(r.rows, r.metadata, 12345, 4100)).toBe('Only accounts KYRO numbered can be renumbered.')
    expect(validateSyntheticRenumber(r.rows, r.metadata, tuition, 4100.5)).toBe('Use a whole number.')
    expect(validateSyntheticRenumber(r.rows, r.metadata, tuition, 2100)).toBe('Income accounts start with 4.')
    expect(validateSyntheticRenumber(r.rows, r.metadata, salaries, 4100)).toBe('Expense accounts start with 5, 6, 7, 8 or 9.')
    expect(validateSyntheticRenumber(r.rows, r.metadata, tuition, fees)).toBe('Already used by "Fees".')
    expect(validateSyntheticRenumber(r.rows, r.metadata, tuition, tuition)).toBeNull()
    expect(validateSyntheticRenumber(r.rows, r.metadata, tuition, 4100)).toBeNull()
  })
  it('renumberSynthetic(Tuition → 4100) changes exactly one row and the entry (source user)', () => {
    const out = renumberSynthetic(r.rows, r.metadata, tuition, 4100)
    const changed = out.rows.filter((row, i) => row.acct !== r.rows[i]!.acct)
    expect(changed).toEqual([{ acct: 4100, desc: 'Tuition', total: -1000 }])
    expect(out.metadata.statement!.synthesized.find((s) => s.name === 'Tuition')).toEqual({ acct: 4100, name: 'Tuition', section: 'revenue', source: 'user' })
    expect(out.metadata.net).toBe(r.metadata.net)
    expect(() => renumberSynthetic(r.rows, r.metadata, tuition, 2100)).toThrow('Income accounts start with 4.')
    // The input is not mutated.
    expect(r.rows.find((x) => x.desc === 'Tuition')!.acct).toBe(tuition)
  })
})

describe('A40-5 — the classify reason names the report plainly', () => {
  it('a title-less CSV P&L ending in the current FY', () => {
    const csv = 'Acct,Desc,Total\n40100,Tuition,1000\n60100,Salaries,400\n'
    const r = ingest('Profit and Loss 6-30-26.csv', new TextEncoder().encode(csv).buffer as ArrayBuffer)
    const c = classifyRole({ fileName: 'Profit and Loss 6-30-26.csv', metadata: r.metadata, now: new Date('2026-06-15') })
    expect(c.signals.reasons).toContain('QuickBooks Profit and Loss for the period ending 2026-06-30 is the current fiscal year')
    expect(c.signals.reasons.join(' ')).not.toMatch(/ {2}|\bPL\b|Actual/)
  })
  it('statementLabel', () => {
    expect(statementLabel({ type: 'pl', title: 'Total', partial: 'pl', synthesized: [] })).toBe('Profit and Loss')
    expect(statementLabel({ type: 'bs', title: '', partial: 'bs', synthesized: [] })).toBe('Balance Sheet')
    expect(statementLabel({ type: 'bva', title: 'Actual', partial: 'pl', synthesized: [] })).toBe('Budget vs Actuals')
    expect(statementLabel({ type: 'pl', title: 'x', partial: 'full', synthesized: [] })).toBe('Profit and Loss + Balance Sheet')
    expect(statementLabel({ type: 'pl', title: 'Statement of Activity', partial: 'pl', synthesized: [] })).toBe('Statement of Activity')
  })
})

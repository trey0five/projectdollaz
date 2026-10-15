// ─────────────────────────────────────────────────────────────────────────────
// #41 S-D — half a trial balance is never saved as a year.
//
// A workbook with two Profit and Loss sheets and one Balance Sheet is not a
// pair, so the "Add years" uploader used to get three half-trial-balance
// candidates and could save a P&L alone as an annual period. Now a half is
// `partial`, same-date halves merge into ONE ready year, and "Pair with…"
// lets the person join the rest.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import {
  expandFileToCandidates,
  partitionCandidates,
  monthlyStatementKeys,
  settleCandidates,
  pairChosen,
  pairCandidates,
  toCandidate,
  errorCandidate,
  candidateFromColumns,
  candidateName,
} from './trendIntake.js'
import { workbook } from './__fixtures__/holyFamily.js'

const plSheet = (period, tuition, salaries) => [
  ['Sunny Day School'],
  ['Profit and Loss'],
  [period],
  [],
  ['', 'Total'],
  ['Income'],
  ['   40100 Tuition', tuition],
  ['Total Income', tuition],
  ['Expenses'],
  ['   60100 Salaries', salaries],
  ['Total Expenses', salaries],
  ['Net Income', tuition - salaries],
]

const bsSheet = (asOf, netIncome) => [
  ['Sunny Day School'],
  ['Balance Sheet'],
  [asOf],
  [],
  ['', 'Total'],
  ['ASSETS'],
  ['   Current Assets'],
  ['      Bank Accounts'],
  ['         10100 Operating Checking', 500_000 + netIncome],
  ['      Total Bank Accounts', 500_000 + netIncome],
  ['   Total Current Assets', 500_000 + netIncome],
  ['TOTAL ASSETS', 500_000 + netIncome],
  ['LIABILITIES AND EQUITY'],
  ['   Equity'],
  ['      30000 Net Assets Without Donor Restrictions', 500_000],
  ['      Net Income', netIncome],
  ['   Total Equity', 500_000 + netIncome],
  ['TOTAL LIABILITIES AND EQUITY', 500_000 + netIncome],
]

const F4 = () =>
  workbook({
    'P&L Jan 2026': plSheet('January 2026', 64_000, 35_000),
    'P&L FY26': plSheet('July 2025 - June 2026', 768_000, 420_000),
    'Balance Sheet': bsSheet('As of June 30, 2026', 348_000),
  })

const savableOf = (cands) => partitionCandidates(cands).annual.filter((c) => c.status === 'ready' && !c.duplicate)

describe('A41-SD — the three-statement workbook', () => {
  it('yields exactly ONE ready merged year and ONE partial', async () => {
    const raw = await expandFileToCandidates('Three statements FY26.xlsx', F4())
    expect(raw.filter((c) => c.status === 'partial')).toHaveLength(3)
    const cands = settleCandidates(raw)
    const ready = cands.filter((c) => c.status === 'ready')
    const partial = cands.filter((c) => c.status === 'partial')
    expect(ready).toHaveLength(1)
    expect(ready[0].merged).toBe(true)
    expect(ready[0].periodEndDate).toBe('2026-06-30')
    expect(ready[0].metadata.statement.partial).toBe('full')
    expect(ready[0].sheet).toBe('P&L FY26 + Balance Sheet')
    expect(partial).toHaveLength(1)
    expect(partial[0].sheet).toBe('P&L Jan 2026')
    expect(partial[0].partial).toBe('pl')
  })

  it('a partial is never in the annual bucket, so never savable', async () => {
    const cands = settleCandidates(await expandFileToCandidates('Three statements FY26.xlsx', F4()))
    const parts = partitionCandidates(cands)
    expect(parts.annual.some((c) => c.partial)).toBe(false)
    expect(parts.partial).toHaveLength(1)
    expect(savableOf(cands).every((c) => !c.partial)).toBe(true)
    expect(savableOf(cands)).toHaveLength(1)
  })

  it('"Pair with…" joins a half to a Balance Sheet from another date (the year is the Balance Sheet’s)', async () => {
    const cands = settleCandidates(await expandFileToCandidates('Three statements FY26.xlsx', F4()))
    const dec = settleCandidates(
      await expandFileToCandidates('Balance Sheet 12-31-25.xlsx', workbook({ BS: bsSheet('As of December 31, 2025', 29_000) })),
    )
    const all = settleCandidates([...cands, ...dec])
    const jan = all.find((c) => c.sheet === 'P&L Jan 2026')
    const bsd = all.find((c) => c.partial === 'bs')
    const next = pairChosen(all, jan.key, bsd.key)
    const merged = next.filter((c) => c.merged)
    expect(merged).toHaveLength(2)
    expect(merged.map((c) => c.periodEndDate).sort()).toEqual(['2025-12-31', '2026-06-30'])
    expect(next.filter((c) => c.status === 'partial')).toHaveLength(0)
    expect(savableOf(next)).toHaveLength(2)
  })

  it('two halves of the same kind can’t be "paired"', async () => {
    const cands = await expandFileToCandidates('Three statements FY26.xlsx', F4())
    const pls = cands.filter((c) => c.partial === 'pl')
    expect(pairChosen(cands, pls[0].key, pls[1].key)).toBe(cands)
  })

  it('candidates already saving or saved are never re-paired', () => {
    const a = { ...toCandidate('a.xlsx', [], { statement: { partial: 'pl' }, periodEndDate: '2026-06-30' }), status: 'saved' }
    expect(pairCandidates([a])).toEqual([a])
  })
})

describe('#32 — a file the bulk uploader couldn’t read', () => {
  const ODD = [
    ['Sunny Day School'],
    ['Trial Balance June 30, 2026'],
    ['Acct', 'Desc', null],
    [1010, 'Cash', 250_000],
    [1200, 'Tuition Receivable', 40_000],
    [2100, 'Accounts Payable', -30_000],
    [3000, 'Net Assets', -200_000],
    [4000, 'Tuition', -512_000],
    [5000, 'Salaries', 452_000],
  ]

  it('says why in plain words, keeps its bytes for the picker, and re-reads with the picked columns', async () => {
    const bytes = workbook({ Sheet1: ODD })
    const [err] = await expandFileToCandidates('Odd TB 6-30-26.xlsx', bytes)
    expect(err.status).toBe('error')
    expect(err.failure.reason).toBe('We found account numbers in column A but no amount column.')
    expect(err.failure.ask).toBe('Which column holds the balances?')
    expect(err.error).toBe('We found account numbers in column A but no amount column. Which column holds the balances?')
    expect(err.failure.canPick).toBe(true)
    expect(err.bytes).toBe(bytes)
    const fixed = candidateFromColumns(err, err.bytes, err.failure.preview.guess)
    expect(fixed.key).toBe(err.key)
    expect(fixed.status).toBe('ready')
    expect(fixed.accountCount).toBe(6)
    expect(fixed.metadata.layout.source).toBe('picked')
  })

  it('a failure with no preview keeps no bytes', () => {
    const c = errorCandidate('x.pdf', new Error('No ingestion adapter for x.pdf'), new ArrayBuffer(4))
    expect(c.bytes).toBeNull()
    expect(c.failure.canPick).toBe(false)
  })

  it('names a candidate "file — sheet"', () => {
    expect(candidateName({ sourceName: 'a.xlsx', sheet: 'P&L' })).toBe('a.xlsx — P&L')
    expect(candidateName({ sourceName: 'a.xlsx', sheet: null })).toBe('a.xlsx')
  })
})

describe('N4 — a workbook of monthly P&L tabs points to Monthly numbers, not "add its Balance Sheet"', () => {
  const pl = (key, end, extra = {}) => ({
    key,
    sourceName: 'Statement of Activity FY26.xlsx',
    status: 'partial',
    partial: 'pl',
    periodEndDate: end,
    periodType: 'ytd',
    metadata: { statement: { type: 'pl', partial: 'pl', ...(extra.statement || {}) } },
    ...extra,
  })

  it('a set of month tabs (no Balance Sheet in the file) is monthly', () => {
    const cands = [pl('jan', '2026-01-31'), pl('feb', '2026-02-28'), pl('mar', '2026-03-31')]
    const parts = partitionCandidates(cands)
    expect(parts.monthly.map((c) => c.key)).toEqual(['jan', 'feb', 'mar'])
    expect(parts.partial).toEqual([])
    expect(parts.annual).toEqual([])
  })

  it('a banner spanning one month is monthly on its own', () => {
    const one = pl('jan', '2026-01-31', { sourceName: 'Jan.xlsx', statement: { periodStart: '2026-01-01' } })
    expect([...monthlyStatementKeys([one])]).toEqual(['jan'])
  })

  it('a full-year P&L is still half a trial balance (it needs its Balance Sheet)', () => {
    const fy = pl('fy', '2026-06-30', {
      sourceName: 'P&L FY26.xlsx',
      periodType: 'fy',
      statement: { periodStart: '2025-07-01' },
    })
    const parts = partitionCandidates([fy])
    expect(parts.partial.map((c) => c.key)).toEqual(['fy'])
    expect(parts.monthly).toEqual([])
  })

  it('a P&L next to its Balance Sheet in the same file is not a month set', () => {
    const cands = [
      pl('ytd', '2026-01-31', { sourceName: 'Book.xlsx' }),
      pl('fy', '2026-06-30', { sourceName: 'Book.xlsx' }),
      { key: 'bs', sourceName: 'Book.xlsx', status: 'partial', partial: 'bs', periodEndDate: '2026-06-30', metadata: {} },
    ]
    expect(monthlyStatementKeys(cands).size).toBe(0)
  })
})

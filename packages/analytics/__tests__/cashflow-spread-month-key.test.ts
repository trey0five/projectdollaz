// ─────────────────────────────────────────────────────────────────────────────
// AN IMPORTED SPREAD'S PHASING ACTUALLY REACHES THE CASH FORECAST.
//
// Bug reproduced before the fix: an imported budget spread stores its first
// fiscal month as a month KEY — `lines.spread.fiscalYearStart = '2026-07'`
// (packages/ingestion budgetSpread: `fiscalYearStart: monthKeys[0]`). The
// phasing helpers parsed it as a full 'YYYY-MM-DD' date, got null, and returned
// no events at all, so every school's forecast silently ran on commitments
// alone. The older tests passed '2026-07-01', a shape no real spread has.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest'
import { parseFiscalYearStart, spreadDisbursements, spreadReceipts } from '../src/index.js'

const accounts = [
  { acct: '5100', label: 'Supplies', category: 'instrSup', section: 'expense' as const, months: [500, 400, null] },
  { acct: '4200', label: 'Auxiliary', category: 'other', section: 'revenue' as const, months: [0, 1_000] },
]

describe("a 'YYYY-MM' spread start", () => {
  it('phases expense from the stored month key', () => {
    const ev = spreadDisbursements({ accounts, fiscalYearStart: '2026-07' })
    expect(ev.map((e) => [e.date, e.amount])).toEqual([
      ['2026-07-31', 500],
      ['2026-08-31', 400],
    ])
  })

  it('phases receipts from the stored month key', () => {
    const ev = spreadReceipts({ accounts, fiscalYearStart: '2026-07' })
    expect(ev.map((e) => [e.date, e.amount, e.direction])).toEqual([['2026-08-31', 1_000, 'in']])
  })

  it('crosses the calendar year inside the fiscal year', () => {
    const ev = spreadDisbursements({
      accounts: [{ acct: '1', category: 'x', section: 'expense', months: [0, 0, 0, 0, 0, 0, 7] }],
      fiscalYearStart: '2026-07',
    })
    expect(ev.map((e) => e.date)).toEqual(['2027-01-31'])
  })

  it('the month key and the full ISO date phase identically', () => {
    expect(spreadDisbursements({ accounts, fiscalYearStart: '2026-07' })).toEqual(
      spreadDisbursements({ accounts, fiscalYearStart: '2026-07-01' }),
    )
  })

  it('a malformed start still yields nothing, never a guessed month', () => {
    for (const bad of ['2026-13', '2026-7', 'July 2026', '', '2026-02-30']) {
      expect(parseFiscalYearStart(bad)).toBeNull()
      expect(spreadDisbursements({ accounts, fiscalYearStart: bad })).toEqual([])
    }
    expect(parseFiscalYearStart('2026-07')).toEqual({ y: 2026, m: 7 })
    expect(parseFiscalYearStart('2026-07-01')).toEqual({ y: 2026, m: 7 })
  })
})

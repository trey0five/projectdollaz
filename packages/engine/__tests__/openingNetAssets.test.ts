// ─────────────────────────────────────────────────────────────
// deriveOpeningNetAssets — recovers opening net assets from a TB.
// Sign convention: debit positive, credit negative.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { deriveOpeningNetAssets } from '../src/calc/openingNetAssets.js'
import type { Dataset } from '../src/types/rows.js'

// A management TB (no opening-equity row): assets + liabilities + the
// year's revenue/expense. Opening net assets = 1,000,000.
//   assets 1,200,000(dr) − liabilities 200,000(cr)
//   + revenue 900,000(cr) − expense 900,000(dr) ... arranged so the
//   residual is exactly the omitted opening equity of 1,000,000.
const managementTB: Dataset = [
  { acct: 101, desc: 'Cash', total: 1_200_000 }, // asset, debit +
  { acct: 201, desc: 'Accounts payable', total: -200_000 }, // liability, credit −
  { acct: 410, desc: 'Tuition revenue', total: -500_000 }, // revenue, credit −
  { acct: 510, desc: 'Salaries', total: 500_000 }, // expense, debit +
]
// sum = 1,200,000 − 200,000 − 500,000 + 500,000 = 1,000,000

// The same TB WITH its opening-equity row restored → complete, nets to 0.
const completeTB: Dataset = [
  ...managementTB,
  { acct: 301, desc: 'Net assets, beginning', total: -1_000_000 }, // equity, credit −
]

// A pure revenue/expense extract — no balance-sheet accounts at all.
const activityOnlyTB: Dataset = [
  { acct: 410, desc: 'Tuition revenue', total: -500_000 },
  { acct: 510, desc: 'Salaries', total: 480_000 },
]

describe('deriveOpeningNetAssets', () => {
  it('recovers opening from a management TB as the imbalance (plug)', () => {
    const r = deriveOpeningNetAssets(managementTB)
    expect(r.source).toBe('plug')
    expect(r.value).toBe(1_000_000) // exact, because this synthetic TB DOES tie out
    expect(r.confident).toBe(false) // but a plug is never auto-trusted — confirm
    expect(r.hasBalanceSheet).toBe(true)
    expect(r.hasEquityRow).toBe(false)
  })

  it('reads opening directly from a complete TB and confirms it balances', () => {
    const r = deriveOpeningNetAssets(completeTB)
    expect(r.source).toBe('equity-row')
    expect(r.value).toBe(1_000_000) // −(−1,000,000)
    expect(r.confident).toBe(true)
    expect(Math.abs(r.imbalance)).toBeLessThan(0.01) // nets to zero
  })

  it('flags a complete-but-unbalanced TB as not confident', () => {
    const broken: Dataset = [...completeTB, { acct: 102, desc: 'Stray', total: 5_000 }]
    const r = deriveOpeningNetAssets(broken)
    expect(r.source).toBe('equity-row')
    expect(r.value).toBe(1_000_000) // still reads the equity row
    expect(r.confident).toBe(false) // but TB no longer balances
  })

  it('returns unavailable when there are no balance-sheet accounts', () => {
    const r = deriveOpeningNetAssets(activityOnlyTB)
    expect(r.source).toBe('unavailable')
    expect(r.value).toBe(0)
    expect(r.confident).toBe(false)
  })

  it('is pure — does not mutate the input', () => {
    const snapshot = JSON.stringify(managementTB)
    deriveOpeningNetAssets(managementTB)
    expect(JSON.stringify(managementTB)).toBe(snapshot)
  })
})

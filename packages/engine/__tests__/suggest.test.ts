// ─────────────────────────────────────────────────────────────────────────────
// THE GUESSES ARE GOOD, AND THEY KNOW WHEN THEY ARE GUESSING.
//
// Making the engine chart-agnostic left one job on the school: telling it what
// each of its accounts is. For a real trial balance that is thirty-odd dropdown
// decisions before a single number appears — and the account's own NAME answers
// almost all of them.
//
// What matters as much as the hit-rate is the MISSES. A suggestion nobody looks
// at that lands in the wrong bucket does not raise an error; it produces a wrong
// statement that looks exactly like a right one and goes to a board. So the
// tests below spend as much effort on what must NOT be guessed as on what must.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest'
import { suggestCategory, suggestCategories } from '../src/scoa/suggest.js'

const g = (desc: string, total = 1000) => suggestCategory({ acct: 1, desc, total })
const cat = (desc: string, total = 1000) => g(desc, total)?.category ?? null

describe('the balance sheet reads from the names', () => {
  it.each([
    ['Cash - Operating Checking', 'cash'],
    ['Cash - Money Market Reserve', 'cash'],
    ['Petty Cash', 'cash'],
    ['Undeposited Funds', 'cash'],
    ['Tuition & Fees Receivable', 'tuitionRec'],
    ['Pledges Receivable', 'tuitionRec'],
    ['Prepaid Expenses', 'prepaid'],
    ['Land', 'ppGross'],
    ['Buildings & Improvements', 'ppGross'],
    ['Furniture & Equipment', 'ppGross'],
    ['Right-of-Use Asset', 'rouAsset'],
  ])('%s → %s', (desc, expected) => {
    expect(cat(desc)).toBe(expected)
  })

  it.each([
    ['Accounts Payable', 'apAccrued'],
    ['Accrued Salaries & Benefits', 'apAccrued'],
    ['Deferred Tuition Revenue', 'deferredIntl'],
    ['Mortgage Note Payable', 'leaseNonCurr'],
    ['Net Assets - Without Donor Restrictions', 'naWithoutDonor'],
    ['Net Assets - With Donor Restrictions', 'naWithDonor'],
  ])('%s → %s (credit balance)', (desc, expected) => {
    expect(cat(desc, -1000)).toBe(expected)
  })

  it('the SPECIFIC name beats the general one', () => {
    // Each of these contains a word that a laxer rule would have claimed first.
    expect(cat('Accumulated Depreciation', -2000)).toBe('accumDepr') // not ppGross, not deprExpense
    expect(cat('Restricted Cash - Endowment')).toBe('restrictedCash') // not cash
    expect(cat('Net Assets - With Donor Restrictions', -1000)).toBe('naWithDonor') // not equityOpening
  })
})

describe('the income statement reads from the names', () => {
  it.each([
    ['Tuition & Fees Income', 'tuition'],
    ['Annual Fund Contributions', 'development'],
    ['Interest & Dividend Income', 'interest'],
    ['Auxiliary Programs Income', 'other'],
  ])('%s → %s (credit)', (desc, expected) => {
    expect(cat(desc, -1000)).toBe(expected)
  })

  it.each([
    ['Salaries - Instructional', 'instrSal'],
    ['Salaries - Administration', 'adminSal'],
    ['Employee Benefits', 'adminCost'],
    ['Payroll Taxes', 'adminCost'],
    ['Instructional Supplies & Curriculum', 'instrSup'],
    ['Technology', 'instrSup'],
    ['Plant Operations & Maintenance', 'facilCost'],
    ['Utilities', 'facilCost'],
    ['Insurance', 'fixedOther'],
    ['Professional Fees', 'adminCost'],
    ['Interest Expense - Mortgage', 'fixedOther'],
    ['Depreciation Expense', 'deprExpense'],
  ])('%s → %s (debit)', (desc, expected) => {
    expect(cat(desc, 1000)).toBe(expected)
  })

  it('financial aid is netted against tuition, not treated as a cost', () => {
    // It carries a DEBIT balance like an expense, which is exactly the trap.
    expect(cat('Financial Aid & Scholarships', 549_000)).toBe('tuition')
  })
})

describe('the sign decides what a word means', () => {
  it('"Advancement" is income on a credit and a cost on a debit', () => {
    // The reason this uses the balance's sign rather than the account number:
    // a number range would only answer this for charts numbered like the one
    // the engine has just stopped assuming.
    expect(cat('Advancement & Marketing', 67_900)).toBe('adminCost')
    expect(cat('Advancement Income', -67_900)).toBe('development')
  })

  it('"Athletics" splits the same way', () => {
    expect(cat('Athletic Fees', -5_000)).toBe('studActRev')
    expect(cat('Athletics Program Costs', 5_000)).toBe('athletics')
  })
})

describe('what it refuses to guess', () => {
  it('an unqualified "Salaries" is ambiguous — teaching or administration?', () => {
    // Both are plausible and the difference moves the instructional ratio every
    // board looks at. Better an empty picker than a coin flip.
    expect(cat('Salaries')).toBeNull()
    expect(cat('Wages')).toBeNull()
  })

  it('a name that says nothing gets nothing', () => {
    expect(cat('Miscellaneous')).toBeNull()
    expect(cat('Account 4823')).toBeNull()
    expect(cat('Other')).toBeNull()
    expect(cat('')).toBeNull()
    expect(suggestCategory({ acct: 1, desc: null })).toBeNull()
  })

  it('a dormant account is not review work', () => {
    // Zero balance ⇒ nothing to classify, and nothing that could move a number.
    expect(suggestCategories([{ acct: 1010, desc: 'Cash - Operating', total: 0 }])).toEqual({})
  })
})

describe('every suggestion says how sure it is, and why', () => {
  it('carries a confidence and a human reason', () => {
    const s = g('Cash - Operating Checking')
    expect(s).toMatchObject({ category: 'cash', confidence: 'high' })
    expect(s!.reason).toBe('a cash account')
  })

  it('a stretch is marked medium, not high', () => {
    // "Mortgage Note Payable" has no exactly-right home in the vocabulary, so
    // the closest bucket is offered — and marked as the approximation it is.
    expect(g('Mortgage Note Payable', -2000)!.confidence).toBe('medium')
    expect(g('Investments - Endowment')!.confidence).toBe('medium')
  })
})

describe('a whole real trial balance', () => {
  // The four-digit file that reproduced the original bug.
  const ROWS = [
    { acct: 1010, desc: 'Cash - Operating Checking', total: 508_400 },
    { acct: 1020, desc: 'Cash - Money Market Reserve', total: 585_000 },
    { acct: 1200, desc: 'Tuition & Fees Receivable', total: 94_200 },
    { acct: 1300, desc: 'Pledges Receivable', total: 38_500 },
    { acct: 1400, desc: 'Prepaid Expenses', total: 66_800 },
    { acct: 1600, desc: 'Land', total: 850_000 },
    { acct: 1610, desc: 'Buildings & Improvements', total: 6_298_000 },
    { acct: 1620, desc: 'Furniture & Equipment', total: 561_000 },
    { acct: 1690, desc: 'Accumulated Depreciation', total: -2_444_000 },
    { acct: 2010, desc: 'Accounts Payable', total: -104_100 },
    { acct: 2100, desc: 'Accrued Salaries & Benefits', total: -161_300 },
    { acct: 2200, desc: 'Deferred Tuition Revenue', total: -561_000 },
    { acct: 2500, desc: 'Mortgage Note Payable', total: -2_186_000 },
    { acct: 3000, desc: 'Net Assets - Without Donor Restrictions', total: -3_146_800 },
    { acct: 3100, desc: 'Net Assets - With Donor Restrictions', total: -289_000 },
    { acct: 4010, desc: 'Tuition & Fees Income', total: -4_562_000 },
    { acct: 4020, desc: 'Financial Aid & Scholarships', total: 549_000 },
    { acct: 4100, desc: 'Annual Fund Contributions', total: -371_000 },
    { acct: 4200, desc: 'Auxiliary Programs Income', total: -214_800 },
    { acct: 4300, desc: 'Interest & Dividend Income', total: -28_900 },
    { acct: 5010, desc: 'Salaries - Instructional', total: 2_010_000 },
    { acct: 5020, desc: 'Salaries - Administration', total: 621_000 },
    { acct: 5100, desc: 'Employee Benefits', total: 497_400 },
    { acct: 5200, desc: 'Payroll Taxes', total: 226_300 },
    { acct: 6010, desc: 'Instructional Supplies & Curriculum', total: 134_800 },
    { acct: 6100, desc: 'Plant Operations & Maintenance', total: 244_100 },
    { acct: 6110, desc: 'Utilities', total: 124_600 },
    { acct: 6200, desc: 'Insurance', total: 89_700 },
    { acct: 6300, desc: 'Technology', total: 108_200 },
    { acct: 6400, desc: 'Professional Fees', total: 55_600 },
    { acct: 6500, desc: 'Interest Expense - Mortgage', total: 98_400 },
    { acct: 6600, desc: 'Depreciation Expense', total: 240_000 },
    { acct: 6700, desc: 'Advancement & Marketing', total: 67_900 },
  ]

  it('covers the whole file — the thirty-odd decisions become a review', () => {
    const s = suggestCategories(ROWS)
    const missed = ROWS.filter((r) => !s[r.acct]).map((r) => r.desc)
    expect(missed, 'accounts with no suggestion').toEqual([])
  })

  it('and every suggestion is the RIGHT one for this file', () => {
    // Hand-checked against what the accounts actually are — a suite that only
    // measured coverage would happily pass on thirty confident mistakes.
    const s = suggestCategories(ROWS)
    const got = Object.fromEntries(Object.entries(s).map(([a, v]) => [a, v.category]))
    expect(got).toEqual({
      1010: 'cash', 1020: 'cash',
      1200: 'tuitionRec', 1300: 'tuitionRec',
      1400: 'prepaid',
      1600: 'ppGross', 1610: 'ppGross', 1620: 'ppGross',
      1690: 'accumDepr',
      2010: 'apAccrued', 2100: 'apAccrued',
      2200: 'deferredIntl',
      2500: 'leaseNonCurr',
      3000: 'naWithoutDonor', 3100: 'naWithDonor',
      4010: 'tuition', 4020: 'tuition',
      4100: 'development', 4200: 'other', 4300: 'interest',
      5010: 'instrSal', 5020: 'adminSal', 5100: 'adminCost', 5200: 'adminCost',
      6010: 'instrSup', 6300: 'instrSup',
      6100: 'facilCost', 6110: 'facilCost',
      6200: 'fixedOther', 6500: 'fixedOther', 6600: 'deprExpense',
      6400: 'adminCost', 6700: 'adminCost',
    })
  })
})

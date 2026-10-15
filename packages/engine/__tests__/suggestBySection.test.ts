// ─────────────────────────────────────────────────────────────────────────────
// Section-aware suggestions (A1): a QuickBooks statement export prints every
// account under its section, so the SECTION fixes the class and the name only
// refines within it. Pinned on the Holy Family Academy export the owner
// uploaded on 2026-10-15 (P&L Budget vs Actual + Balance Sheet, 34 accounts,
// FY2026) — where name rules alone filed two Income lines as balance-sheet net
// assets and left Investment Income, Diocesan Assessment and the Payroll bank
// account with no suggestion at all.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest'
import {
  suggestCategoryInSection,
  suggestStatementCategories,
  classOfSection,
  type StatementSectionFact,
  type StatementSectionKey,
} from '../src/scoa/suggestBySection.js'
import { suggestCategory } from '../src/scoa/suggest.js'
import { SCOA_CATEGORIES, type SCoaCategory } from '../src/scoa/categories.js'
import { DEFAULT_CHART, type StandardChart } from '../src/scoa/chart.js'
import { calcSOA } from '../src/calc/soa.js'
import { calcSFP } from '../src/calc/sfp.js'
import type { Dataset } from '../src/types/rows.js'

type Row = { acct: number; desc: string; total: number; section: StatementSectionKey; statement: 'pl' | 'bs' }

/** The merged Holy Family trial balance (TB-signed: debit +, credit −) with each account's printed section. */
const HOLY_FAMILY: Row[] = [
  { acct: 40100, desc: '40100 Tuition', total: -3_850_000, section: 'income', statement: 'pl' },
  { acct: 40200, desc: '40200 Registration Fees', total: -96_000, section: 'income', statement: 'pl' },
  { acct: 40900, desc: '40900 Tuition Assistance', total: 310_000, section: 'income', statement: 'pl' },
  { acct: 41000, desc: '41000 Contributions without Donor Restrictions', total: -245_000, section: 'income', statement: 'pl' },
  { acct: 41100, desc: '41100 Contributions with Donor Restrictions', total: -120_000, section: 'income', statement: 'pl' },
  { acct: 42000, desc: '42000 Fundraising Events', total: -88_500, section: 'income', statement: 'pl' },
  { acct: 43000, desc: '43000 Auxiliary - Aftercare', total: -64_200, section: 'income', statement: 'pl' },
  { acct: 44000, desc: '44000 Investment Income', total: -18_300, section: 'income', statement: 'pl' },
  { acct: 60100, desc: '60100 Salaries - Faculty', total: 2_140_000, section: 'expenses', statement: 'pl' },
  { acct: 60200, desc: '60200 Salaries - Administration', total: 412_000, section: 'expenses', statement: 'pl' },
  { acct: 61000, desc: '61000 Payroll Taxes & Benefits', total: 598_000, section: 'expenses', statement: 'pl' },
  { acct: 62000, desc: '62000 Instructional Supplies', total: 86_400, section: 'expenses', statement: 'pl' },
  { acct: 63000, desc: '63000 Technology', total: 74_800, section: 'expenses', statement: 'pl' },
  { acct: 64000, desc: '64000 Facilities & Maintenance', total: 236_500, section: 'expenses', statement: 'pl' },
  { acct: 65000, desc: '65000 Utilities', total: 142_300, section: 'expenses', statement: 'pl' },
  { acct: 66000, desc: '66000 Insurance', total: 98_700, section: 'expenses', statement: 'pl' },
  { acct: 67000, desc: '67000 Diocesan Assessment', total: 124_000, section: 'expenses', statement: 'pl' },
  { acct: 68000, desc: '68000 Professional Fees', total: 41_600, section: 'expenses', statement: 'pl' },
  { acct: 69000, desc: '69000 Depreciation', total: 155_000, section: 'expenses', statement: 'pl' },
  { acct: 10100, desc: '10100 Operating Checking', total: 612_400, section: 'bank', statement: 'bs' },
  { acct: 10200, desc: '10200 Savings - Reserve', total: 1_050_000, section: 'bank', statement: 'bs' },
  { acct: 10300, desc: '10300 Payroll Account', total: 48_600, section: 'bank', statement: 'bs' },
  { acct: 11000, desc: '11000 Tuition Receivable', total: 184_300, section: 'otherCurrentAssets', statement: 'bs' },
  { acct: 11500, desc: '11500 Pledges Receivable', total: 95_000, section: 'otherCurrentAssets', statement: 'bs' },
  { acct: 12000, desc: '12000 Prepaid Expenses', total: 42_700, section: 'otherCurrentAssets', statement: 'bs' },
  { acct: 15000, desc: '15000 Buildings & Improvements', total: 4_850_000, section: 'fixedAssets', statement: 'bs' },
  { acct: 15500, desc: '15500 Furniture & Equipment', total: 620_000, section: 'fixedAssets', statement: 'bs' },
  { acct: 17000, desc: '17000 Accumulated Depreciation', total: -2_310_000, section: 'fixedAssets', statement: 'bs' },
  { acct: 20000, desc: '20000 Accounts Payable', total: -118_400, section: 'accountsPayable', statement: 'bs' },
  { acct: 21000, desc: '21000 Accrued Payroll', total: -236_900, section: 'otherCurrentLiabilities', statement: 'bs' },
  { acct: 24110, desc: '24110 Deferred Tuition', total: -512_000, section: 'otherCurrentLiabilities', statement: 'bs' },
  { acct: 25000, desc: '25000 Note Payable - Diocese', total: -400_000, section: 'longTermLiabilities', statement: 'bs' },
  { acct: 30000, desc: '30000 Net Assets Without Donor Restrictions', total: -3_483_000, section: 'equity', statement: 'bs' },
  { acct: 31000, desc: '31000 Net Assets With Donor Restrictions', total: -380_000, section: 'equity', statement: 'bs' },
]
const SECTIONS: Record<string, StatementSectionFact> = Object.fromEntries(
  HOLY_FAMILY.map((r) => [String(r.acct), { statement: r.statement, section: r.section, basis: 'section' as const }]),
)
const ROWS = HOLY_FAMILY.map(({ acct, desc, total }) => ({ acct, desc, total }))

describe('Holy Family export — every account sorted by its section', () => {
  const s = suggestStatementCategories(ROWS, SECTIONS)

  it('suggests a category for all 34 accounts, every one sure', () => {
    expect(Object.keys(s)).toHaveLength(34)
    for (const r of HOLY_FAMILY) expect(s[r.acct]?.sure, `${r.desc}`).toBe(true)
  })

  it('files the two Contributions lines (Income section) as REVENUE, not balance-sheet net assets', () => {
    // The bug: name rules alone say net assets.
    expect(suggestCategory({ acct: 41000, desc: 'Contributions without Donor Restrictions', total: -245_000 })?.category).toBe('naWithoutDonor')
    expect(suggestCategory({ acct: 41100, desc: 'Contributions with Donor Restrictions', total: -120_000 })?.category).toBe('naWithDonor')
    expect(s[41000]!.category).toBe('development')
    expect(s[41100]!.category).toBe('development')
    expect(SCOA_CATEGORIES[s[41000]!.category].section).toBe('revenue')
    expect(SCOA_CATEGORIES[s[41100]!.category].section).toBe('revenue')
  })

  it('44000 Investment Income → investments; 67000 Diocesan Assessment → an expense; 10300 Payroll Account → cash', () => {
    expect(s[44000]!.category).toBe('investments')
    expect(SCOA_CATEGORIES[s[67000]!.category].section).toBe('expense')
    expect(s[67000]!.category).toBe('fixedOther')
    expect(s[10300]!.category).toBe('cash')
  })

  it('pins the full map', () => {
    const got = Object.fromEntries(HOLY_FAMILY.map((r) => [r.acct, s[r.acct]!.category]))
    expect(got).toEqual({
      40100: 'tuition', 40200: 'tuition', 40900: 'tuition', 41000: 'development', 41100: 'development',
      42000: 'development', 43000: 'other', 44000: 'investments',
      60100: 'instrSal', 60200: 'adminSal', 61000: 'fixedOther', 62000: 'instrSup', 63000: 'instrSup',
      64000: 'facilCost', 65000: 'facilCost', 66000: 'fixedOther', 67000: 'fixedOther', 68000: 'adminCost', 69000: 'deprExpense',
      10100: 'cash', 10200: 'cash', 10300: 'cash', 11000: 'tuitionRec', 11500: 'tuitionRec', 12000: 'prepaid',
      15000: 'ppGross', 15500: 'ppGross', 17000: 'accumDepr',
      20000: 'apAccrued', 21000: 'apAccrued', 24110: 'deferredIntl', 25000: 'leaseNonCurr',
      30000: 'naWithoutDonor', 31000: 'naWithDonor',
    })
  })

  it('applied as the school mapping, the statements read income 4,172,000 · expense 4,109,300 · net 62,700 · assets 5,193,000', () => {
    const entries: Record<number, SCoaCategory> = { ...DEFAULT_CHART.mapping.entries }
    for (const [acct, sug] of Object.entries(s)) entries[Number(acct)] = sug.category
    const chart: StandardChart = { ...DEFAULT_CHART, mapping: { ...DEFAULT_CHART.mapping, entries } }
    const data: Dataset = ROWS
    const soa = calcSOA(data, chart)
    expect(soa.totalRev).toBe(4_172_000)
    expect(soa.totalExp).toBe(4_109_300)
    expect(soa.totalRev - soa.totalExp).toBe(62_700)
    const sfp = calcSFP(data, soa.totalRev - soa.totalExp + 3_863_000, chart)!
    expect(sfp.totalAssets).toBe(5_193_000)
    expect(sfp.totalLiab).toBe(1_267_300)
  })
})

describe('the section fixes the class — a suggestion never contradicts it', () => {
  const NAMES = [
    'Tuition', 'Contributions without Donor Restrictions', 'Net Assets With Donor Restrictions', 'Accumulated Depreciation',
    'Cash - Operating', 'Accounts Payable', 'Deferred Revenue', 'Salaries', 'Interest', 'Investment Income', 'Prepaid Expenses',
    'Note Payable', 'Lease Liability', 'Student Club Funds', 'Miscellaneous', 'Equipment', 'Pledges Receivable', '', 'Payroll Account',
    'Depreciation', 'Restricted Cash', 'Right-of-use Asset', 'Retained Earnings', 'Opening Balance Equity', 'Fundraising Events',
  ]
  const SECTION_OF: Record<string, string> = {
    income: 'revenue', otherIncome: 'revenue', expenses: 'expense', otherExpense: 'expense', costOfGoodsSold: 'expense',
    bank: 'asset', accountsReceivable: 'asset', otherCurrentAssets: 'asset', currentAssets: 'asset', fixedAssets: 'asset',
    otherAssets: 'asset', assets: 'asset', accountsPayable: 'liability', creditCards: 'liability', otherCurrentLiabilities: 'liability',
    currentLiabilities: 'liability', longTermLiabilities: 'liability', liabilities: 'liability', equity: 'netAssets',
  }
  it('every (section × name × sign) suggestion is a real SCoA category inside that section', () => {
    let offered = 0
    for (const [section, want] of Object.entries(SECTION_OF)) {
      expect(classOfSection(section)).not.toBeNull()
      for (const desc of NAMES) {
        for (const total of [-1000, 0, 1000, undefined]) {
          const sug = suggestCategoryInSection({ acct: 1, desc, total, section })
          if (!sug) continue
          offered++
          const def = SCOA_CATEGORIES[sug.category]
          expect(def, `${section} / ${desc}`).toBeDefined()
          expect(def.section, `${section} / ${desc} → ${sug.category}`).toBe(want)
          expect(['studActExp', 'ancillary', 'restricted']).not.toContain(sug.category)
        }
      }
    }
    expect(offered).toBeGreaterThan(300)
  })

  it('an unknown section suggests nothing (the caller keeps the name-only, confirm-first path)', () => {
    expect(suggestCategoryInSection({ acct: 1, desc: 'Tuition', total: -5, section: 'mystery' })).toBeNull()
    expect(classOfSection('nope')).toBeNull()
  })
})

describe('sure vs. to review', () => {
  it('class known, category unclear → pre-filled but NOT sure', () => {
    const misc = suggestCategoryInSection({ acct: 69900, desc: 'Miscellaneous', total: 500, section: 'expenses' })!
    expect(misc).toMatchObject({ category: 'fixedOther', accountClass: 'expense', sure: false })
    const sal = suggestCategoryInSection({ acct: 60000, desc: 'Salaries', total: 500, section: 'expenses' })!
    expect(sal).toMatchObject({ category: 'instrSal', confidence: 'medium', sure: false })
    const sup = suggestCategoryInSection({ acct: 62500, desc: 'Supplies', total: 500, section: 'expenses' })!
    expect(sup).toMatchObject({ category: 'instrSup', confidence: 'medium', sure: false })
    // A qualified name still settles it (sure).
    expect(suggestCategoryInSection({ acct: 60200, desc: 'Salaries - Administration', total: 5, section: 'expenses' })).toMatchObject({ category: 'adminSal', sure: true })
    expect(suggestCategoryInSection({ acct: 61000, desc: 'Payroll Taxes & Benefits', total: 5, section: 'expenses' })).toMatchObject({ category: 'fixedOther', sure: true })
    const oca = suggestCategoryInSection({ acct: 13000, desc: 'Inventory', total: 500, section: 'otherCurrentAssets' })!
    expect(oca).toMatchObject({ category: 'tuitionRec', sure: false })
    const ocl = suggestCategoryInSection({ acct: 22000, desc: 'Suspense', total: -500, section: 'otherCurrentLiabilities' })!
    expect(ocl).toMatchObject({ category: 'apAccrued', sure: false })
  })

  it('a one-category class is sure without a name rule (Bank → cash, A/P → apAccrued, long-term → leaseNonCurr)', () => {
    expect(suggestCategoryInSection({ acct: 10900, desc: 'First National 4471', total: 10, section: 'bank' })).toMatchObject({ category: 'cash', sure: true })
    expect(suggestCategoryInSection({ acct: 20500, desc: 'Visa', total: -10, section: 'creditCards' })).toMatchObject({ category: 'apAccrued', sure: true })
    expect(suggestCategoryInSection({ acct: 27000, desc: 'Bus loan', total: -10, section: 'longTermLiabilities' })).toMatchObject({ category: 'leaseNonCurr', sure: true })
  })

  it('a credit balance among fixed assets with no telling name is offered as accumulated depreciation, not sure', () => {
    expect(suggestCategoryInSection({ acct: 17500, desc: 'Less: Reserve', total: -10, section: 'fixedAssets' })).toMatchObject({ category: 'accumDepr', sure: false })
  })

  it('a position-only class (a balance-sheet-numbered row inside a flat P&L) is never sure', () => {
    const s = suggestCategoryInSection({ acct: 24110, desc: 'Deferred Income - Spring', total: -18_000, section: 'income', basis: 'position' })!
    expect(SCOA_CATEGORIES[s.category].section).toBe('revenue')
    expect(s.sure).toBe(false)
  })

  it('a flat P&L (class from the number block) is sure only when a name rule settles the category', () => {
    expect(suggestCategoryInSection({ acct: 40010, desc: 'Income - Enrollment Tuition', total: -5, section: 'income', basis: 'number' })).toMatchObject({ category: 'tuition', sure: true })
    expect(suggestCategoryInSection({ acct: 49000, desc: 'Something', total: -5, section: 'income', basis: 'number' })).toMatchObject({ category: 'other', sure: false })
  })

  it('accounts without a section fact are absent (a real trial balance keeps confirm-first)', () => {
    const out = suggestStatementCategories(
      [{ acct: 1010, desc: 'Cash', total: 5 }, { acct: 4100, desc: 'Tuition', total: -5 }],
      { 4100: { statement: 'pl', section: 'income' } },
    )
    expect(Object.keys(out)).toEqual(['4100'])
    expect(suggestStatementCategories([{ acct: 1010, desc: 'Cash', total: 5 }], null)).toEqual({})
  })
})

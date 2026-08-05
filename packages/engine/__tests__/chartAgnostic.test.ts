// ─────────────────────────────────────────────────────────────────────────────
// A SCHOOL'S OWN CHART OF ACCOUNTS PRODUCES REAL FINANCIALS.
//
// The engine used to understand exactly one chart: a 3-digit Florida AUP chart,
// written into calcSFP and calcSCF as literal account numbers. Cash WAS
// "accounts 100, 101, 102, 105, 107, 109". Any school numbering its cash 1010
// got a balance sheet of zeros, and — this is the part that made it a defect
// rather than a gap — the product reported "Balanced ✓" and "your books are
// live" over the top of them. Reproduced end to end before the fix: statements
// POSTed 201, hasSnapshot true, every line 0, every metric unavailable.
//
// The fixture below is a REAL four-digit trial balance (the one that reproduced
// the bug). Its expected figures were computed by hand from the source rows, not
// captured from the engine, so this cannot rubber-stamp whatever it happens to
// return.
//
// regression.test.ts is the other half of this: the legacy chart must keep
// producing byte-identical numbers through the new category route. Both files
// have to pass, and neither's fixture may be edited to make the other work.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest'
import { generateReports } from '../src/calc/generateReports.js'
import { findUnmapped, hasEquityRow } from '../src/calc/validate.js'
import { deriveOpeningNetAssets } from '../src/calc/openingNetAssets.js'
import { DEFAULT_CHART, type StandardChart } from '../src/scoa/chart.js'
import type { SCoaCategory } from '../src/scoa/categories.js'
import type { Dataset } from '../src/types/rows.js'

/** Debits positive, credits negative — the engine's normalised convention. */
const CY: Dataset = [
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

/** What the school said its accounts mean — nothing here is guessed. */
const ENTRIES: Record<number, SCoaCategory> = {
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
}

/** Exactly the shape MappingService.ensureActive builds for a real school. */
const CHART: StandardChart = {
  ...DEFAULT_CHART,
  mapping: { mappingVersion: 'map-v1', entries: ENTRIES },
}

// Opening net assets = both equity rows, credit-flipped.
const SCHOOL = { netAssetsBegin: 3_435_800, pyNetAssetsBegin: 0, auditNetAssetsBegin: 0 }

function run() {
  return generateReports({
    cyData: CY,
    pyData: [],
    auditData: [],
    school: SCHOOL as never,
    chart: CHART,
  })
}

// Hand-computed from the rows above.
const TUITION = 4_562_000 - 549_000 // 4,013,000 — aid is a contra-revenue debit
const TOTAL_REV = TUITION + 371_000 + 214_800 + 28_900 // 4,627,700
const TOTAL_EXP = 4_518_000

describe('the income statement reads a four-digit chart', () => {
  it('totals what the school actually earned and spent', () => {
    const { soaResults } = run()
    expect(soaResults.cy.tuition).toBe(TUITION)
    expect(soaResults.cy.dev).toBe(371_000)
    expect(soaResults.cy.totalRev).toBe(TOTAL_REV)
    expect(soaResults.cy.instructional).toBe(2_010_000 + 134_800 + 108_200)
    expect(soaResults.cy.facilities).toBe(244_100 + 124_600)
    expect(soaResults.cy.admin).toBe(621_000 + 497_400 + 226_300 + 55_600 + 67_900)
    // Depreciation rolls into fixedOther exactly as it does on the legacy chart.
    expect(soaResults.cy.fixedOther).toBe(89_700 + 98_400 + 240_000)
    expect(soaResults.cy.totalExp).toBe(TOTAL_EXP)
    expect(soaResults.cy.netChange).toBe(TOTAL_REV - TOTAL_EXP)
  })
})

describe('the BALANCE SHEET reads a four-digit chart — the half no mapping could fix', () => {
  it('cash is the school’s cash, not zero', () => {
    const { sfpResults } = run()
    expect(sfpResults.cy).not.toBeNull()
    // The number that stayed 0 no matter how carefully a school categorised.
    expect(sfpResults.cy!.cash).toBe(508_400 + 585_000)
  })

  it('receivables, prepaid and net property all resolve', () => {
    const { sfpResults } = run()
    const sfp = sfpResults.cy!
    expect(sfp.tuitionRec).toBe(94_200 + 38_500)
    expect(sfp.prepaid).toBe(66_800)
    // Gross property plus accumulated depreciation, which carries a credit.
    expect(sfp.ppNet).toBe(850_000 + 6_298_000 + 561_000 - 2_444_000)
    expect(sfp.totalCurrentA).toBe(1_093_400 + 132_700 + 66_800)
  })

  it('liabilities are reported positive', () => {
    const sfp = run().sfpResults.cy!
    expect(sfp.apAccrued).toBe(104_100 + 161_300)
    expect(sfp.deferredIntl).toBe(561_000)
    expect(sfp.leaseNonCurr).toBe(2_186_000)
    expect(sfp.totalLiab).toBe(265_400 + 561_000 + 2_186_000)
  })

  it('the statement articulates: assets === liabilities + net assets', () => {
    const sfp = run().sfpResults.cy!
    expect(sfp.totalAssets).toBeCloseTo(sfp.totalLiabNA, 2)
  })
})

describe('the chart tells us what kind of trial balance this is', () => {
  it('a four-digit net-assets row makes it a COMPLETE trial balance', () => {
    // Was `acct >= 300 && acct <= 399`, so account 3000 read as an
    // activity-only extract and opening net assets came back unavailable.
    expect(hasEquityRow(CY, CHART)).toBe(true)
    const opening = deriveOpeningNetAssets(CY, CHART)
    expect(opening.hasEquityRow).toBe(true)
    expect(opening.hasBalanceSheet).toBe(true)
    expect(opening.source).toBe('equity-row')
    expect(opening.value).toBe(3_435_800)
  })

  it('…and the legacy chart still answers the same way', () => {
    const legacy: Dataset = [{ acct: 350, desc: 'Opening net assets', total: -100 }]
    expect(hasEquityRow(legacy)).toBe(true)
  })
})

describe('unmapped means "we cannot name this", not "it is numbered above 400"', () => {
  it('flags an unmapped BALANCE-SHEET account — invisible under the old rule', () => {
    // The old predicate was `acct >= 400`: only income-statement accounts could
    // ever be unmapped, because the balance sheet was assumed to live below 400.
    // So an account the chart could not name simply never came up for review,
    // and its balance silently contributed nothing to any statement.
    const withStray: Dataset = [
      { acct: 100, desc: 'Cash', total: 1_000 },
      { acct: 250, desc: 'Something we have not classified', total: -5_000 },
    ]
    expect(findUnmapped(withStray).map((r) => r.acct)).toEqual([250])
  })

  it('flags an unmapped account on a four-digit chart too', () => {
    const withStray: Dataset = [...CY, { acct: 1900, desc: 'Something new', total: 5_000 }]
    expect(findUnmapped(withStray, CHART).map((r) => r.acct)).toEqual([1900])
  })

  it('a fully described chart has nothing to review', () => {
    expect(findUnmapped(CY, CHART)).toEqual([])
  })

  it('a zero-balance account is not busywork', () => {
    const withZero: Dataset = [...CY, { acct: 1901, desc: 'Closed account', total: 0 }]
    expect(findUnmapped(withZero, CHART)).toEqual([])
  })
})

describe('the metrics that were blank now have inputs', () => {
  it('the fields @finrep/analytics reads are all present and non-zero', () => {
    // fromBundle (packages/analytics/src/adapt.ts) reads exactly these; when
    // they were 0/null every metric reported inputsMissing and rendered '—'.
    const b = run()
    expect(b.soaResults.cy.totalRev).toBeGreaterThan(0)
    expect(b.soaResults.cy.totalExp).toBeGreaterThan(0)
    expect(b.sfpResults.cy!.cash).toBeGreaterThan(0)
    expect(b.sfpResults.cy).not.toBeNull()
  })
})

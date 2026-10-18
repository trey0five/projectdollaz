// ─────────────────────────────────────────────────────────────────────────────
// THE CASH FLOW STATEMENT RECONCILES TO THE BALANCE SHEET'S CASH — ON ANY CHART.
//
// Bug reproduced before the fix: on a non-legacy chart the investing section's
// PP&E group took ppGross AND accumDepr, i.e. NET property. The movement in net
// property already includes the year's depreciation, and operating activities
// add depreciation back as well — so depreciation was counted twice and the
// statement's net cash change overshot the real cash delta by exactly the
// depreciation charge.
//
// The figures below are hand-computed from the rows, not captured from the
// engine. Both years are balanced trial balances (debits positive).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest'
import { generateReports } from '../src/calc/generateReports.js'
import { DEFAULT_CHART, type StandardChart } from '../src/scoa/chart.js'
import type { SCoaCategory } from '../src/scoa/categories.js'
import type { Dataset } from '../src/types/rows.js'

const DEPRECIATION = 240_000
const PURCHASES = 300_000
const NET_INCOME = 1_000_000 - 600_000 - DEPRECIATION // 160,000
const AP_INCREASE = 20_000
const CASH_BEGIN = 1_000_000
// Indirect method by hand: NI + depr + ΔAP − capex.
const CASH_END = CASH_BEGIN + NET_INCOME + DEPRECIATION + AP_INCREASE - PURCHASES // 1,120,000

const PY: Dataset = [
  { acct: 1010, desc: 'Cash - Operating', total: CASH_BEGIN },
  { acct: 1600, desc: 'Buildings & Equipment', total: 5_000_000 },
  { acct: 1690, desc: 'Accumulated Depreciation', total: -2_000_000 },
  { acct: 2010, desc: 'Accounts Payable', total: -100_000 },
  { acct: 3000, desc: 'Net Assets - Without Donor Restrictions', total: -3_900_000 },
]

const CY: Dataset = [
  { acct: 1010, desc: 'Cash - Operating', total: CASH_END },
  { acct: 1600, desc: 'Buildings & Equipment', total: 5_000_000 + PURCHASES },
  { acct: 1690, desc: 'Accumulated Depreciation', total: -2_000_000 - DEPRECIATION },
  { acct: 2010, desc: 'Accounts Payable', total: -100_000 - AP_INCREASE },
  { acct: 3000, desc: 'Net Assets - Without Donor Restrictions', total: -3_900_000 },
  { acct: 4010, desc: 'Tuition & Fees Income', total: -1_000_000 },
  { acct: 5010, desc: 'Salaries - Instructional', total: 600_000 },
  { acct: 6600, desc: 'Depreciation Expense', total: DEPRECIATION },
]

const ENTRIES: Record<number, SCoaCategory> = {
  1010: 'cash',
  1600: 'ppGross',
  1690: 'accumDepr',
  2010: 'apAccrued',
  3000: 'naWithoutDonor',
  4010: 'tuition',
  5010: 'instrSal',
  6600: 'deprExpense',
}

const CHART: StandardChart = {
  ...DEFAULT_CHART,
  mapping: { mappingVersion: 'map-v1', entries: ENTRIES },
}

function run() {
  return generateReports({
    cyData: CY,
    pyData: PY,
    auditData: [],
    school: { netAssetsBegin: 3_900_000, pyNetAssetsBegin: 3_900_000, auditNetAssetsBegin: 0 } as never,
    chart: CHART,
  })
}

describe('Statement of Cash Flows on a non-legacy chart with depreciation', () => {
  it('the inputs are balanced trial balances (the fixture is honest)', () => {
    expect(PY.reduce((s, r) => s + r.total, 0)).toBe(0)
    expect(CY.reduce((s, r) => s + r.total, 0)).toBe(0)
  })

  it('adds depreciation back exactly once', () => {
    const scf = run().scf!
    expect(scf.netChange).toBe(NET_INCOME)
    expect(scf.depr).toBe(DEPRECIATION)
    expect(scf.operatingCash).toBe(NET_INCOME + DEPRECIATION + AP_INCREASE)
  })

  it('investing shows the gross purchases, not the net-property movement', () => {
    const scf = run().scf!
    expect(scf.ppePurchases).toBe(-PURCHASES)
    expect(scf.investingCash).toBe(-PURCHASES)
  })

  it('net cash change equals the balance sheet cash delta', () => {
    const b = run()
    const scf = b.scf!
    expect(scf.cashBegin).toBe(CASH_BEGIN)
    expect(scf.cashEnd).toBe(CASH_END)
    expect(scf.netCashChange).toBe(scf.cashEnd - scf.cashBegin)
    expect(scf.netCashChange).toBe(b.sfpResults.cy!.cash - b.sfpResults.py!.cash)
  })

  it('the investing lineage cites gross property only', () => {
    const lin = run().lineage.scf!.ppePurchases
    expect(lin.sources.map((r) => r.acct)).toEqual([1600])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DEPRECIATION NOT MAPPED AS DEPRECIATION — the statement must still reconcile.
//
// Review finding, reproduced on the demo network's real imports: the seed maps
// its "8650 Depreciation" expense to fixedOther, so there is no deprExpense row
// to add back. With investing on GROSS property only, the year's depreciation
// sat in net income and nowhere else, and the statement missed the balance
// sheet's cash change by exactly the charge. The fallback reads the movement in
// accumulated depreciation instead.
// ─────────────────────────────────────────────────────────────────────────────
describe('depreciation mapped to a generic expense (fixedOther)', () => {
  const MISMAPPED: StandardChart = {
    ...DEFAULT_CHART,
    mapping: { mappingVersion: 'map-v1', entries: { ...ENTRIES, 6600: 'fixedOther' } },
  }
  const runMismapped = () =>
    generateReports({
      cyData: CY,
      pyData: PY,
      auditData: [],
      school: { netAssetsBegin: 3_900_000, pyNetAssetsBegin: 3_900_000, auditNetAssetsBegin: 0 } as never,
      chart: MISMAPPED,
    })

  it('adds back the accumulated-depreciation movement, once', () => {
    const scf = runMismapped().scf!
    expect(scf.netChange).toBe(NET_INCOME)
    expect(scf.depr).toBe(DEPRECIATION)
    expect(scf.ppePurchases).toBe(-PURCHASES)
  })

  it('net cash change equals the balance sheet cash delta', () => {
    const b = runMismapped()
    const scf = b.scf!
    expect(scf.netCashChange).toBe(CASH_END - CASH_BEGIN)
    expect(scf.netCashChange).toBe(b.sfpResults.cy!.cash - b.sfpResults.py!.cash)
  })

  it('the depreciation lineage cites the accumulated-depreciation rows it read', () => {
    const lin = runMismapped().lineage.scf!.depr
    expect(lin.sources.map((r) => r.acct)).toEqual([1690])
  })

  it('a chart that states its depreciation expense never takes the fallback', () => {
    // Same balances, but the expense row says 100k less than the accumulated
    // depreciation moved (e.g. a disposal): the stated expense wins.
    const cy = CY.map((r) => (r.acct === 6600 ? { ...r, total: DEPRECIATION - 100_000 } : r))
    const scf = generateReports({
      cyData: cy,
      pyData: PY,
      auditData: [],
      school: { netAssetsBegin: 3_900_000, pyNetAssetsBegin: 3_900_000, auditNetAssetsBegin: 0 } as never,
      chart: CHART,
    }).scf!
    expect(scf.depr).toBe(DEPRECIATION - 100_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A QUICKBOOKS-SHAPED TRIAL BALANCE on the legacy path.
//
// The QBO sync files balance-sheet accounts onto the legacy numbers (bank 100,
// fixed assets 150, accumulated depreciation 170, payables 200, equity 300) and
// every expense at 60000+id, categorised fixedOther — depreciation included.
// There is no 865, so the legacy add-back was 0 and 170 is not an investing
// account: the statement said −120,000 against a +120,000 cash change.
// ─────────────────────────────────────────────────────────────────────────────
describe('QuickBooks-shaped legacy trial balance with depreciation at 60000+id', () => {
  const QDEPR = 120_000
  const QPURCH = 0
  const QNI = 800_000 - 560_000 - QDEPR // 120,000
  const QCASH_BEGIN = 500_000
  // Indirect method by hand: NI + depr − capex (no working-capital movement).
  const QCASH_END = QCASH_BEGIN + QNI + QDEPR - QPURCH // 740,000

  const QPY: Dataset = [
    { acct: 100, desc: 'Checking', total: QCASH_BEGIN },
    { acct: 150, desc: 'Building', total: 2_000_000 },
    { acct: 170, desc: 'Accumulated Depreciation', total: -400_000 },
    { acct: 200, desc: 'Accounts Payable', total: -50_000 },
    { acct: 300, desc: 'Opening Balance Equity', total: -2_050_000 },
  ]
  const QCY: Dataset = [
    { acct: 100, desc: 'Checking', total: QCASH_END },
    { acct: 150, desc: 'Building', total: 2_000_000 + QPURCH },
    { acct: 170, desc: 'Accumulated Depreciation', total: -400_000 - QDEPR },
    { acct: 200, desc: 'Accounts Payable', total: -50_000 },
    { acct: 300, desc: 'Opening Balance Equity', total: -2_050_000 },
    { acct: 40001, desc: 'Program Income', total: -800_000 },
    { acct: 60001, desc: 'Teacher Salaries', total: 560_000 },
    { acct: 60002, desc: 'Depreciation', total: QDEPR },
  ]
  const QCHART: StandardChart = {
    ...DEFAULT_CHART,
    mapping: {
      mappingVersion: 'map-v1',
      entries: { ...DEFAULT_CHART.mapping.entries, 40001: 'other', 60001: 'instrSal', 60002: 'fixedOther' },
    },
  }
  const runQ = () =>
    generateReports({
      cyData: QCY,
      pyData: QPY,
      auditData: [],
      school: { netAssetsBegin: 2_050_000, pyNetAssetsBegin: 2_050_000, auditNetAssetsBegin: 0 } as never,
      chart: QCHART,
    })

  it('the fixture is balanced (honest)', () => {
    expect(QPY.reduce((s, r) => s + r.total, 0)).toBe(0)
    expect(QCY.reduce((s, r) => s + r.total, 0)).toBe(0)
  })

  it('adds back the 170 movement and reconciles to the cash change', () => {
    const b = runQ()
    const scf = b.scf!
    expect(scf.netChange).toBe(QNI)
    expect(scf.depr).toBe(QDEPR)
    expect(scf.netCashChange).toBe(QCASH_END - QCASH_BEGIN)
    expect(scf.netCashChange).toBe(scf.cashEnd - scf.cashBegin)
  })

  it('a legacy dataset WITH an 865 row keeps reading 865 (audited numbers unmoved)', () => {
    const withExpense: Dataset = [
      ...QCY.filter((r) => r.acct !== 60002),
      { acct: 865, desc: 'Depreciation', total: QDEPR - 20_000 },
      { acct: 60002, desc: 'Depreciation (QBO)', total: 20_000 },
    ]
    const scf = generateReports({
      cyData: withExpense,
      pyData: QPY,
      auditData: [],
      school: { netAssetsBegin: 2_050_000, pyNetAssetsBegin: 2_050_000, auditNetAssetsBegin: 0 } as never,
      chart: QCHART,
    }).scf!
    expect(scf.depr).toBe(QDEPR - 20_000)
  })
})

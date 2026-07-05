// Fixture-JSON unit tests for the pure org-QuickBooks synthesis module. The
// fixtures mirror the REAL shape of QBO's summarized ProfitAndLoss /
// BalanceSheet reports (nested Rows.Row with Header/Summary section rows,
// natural-positive Money cells, computed NetIncome/GrossProfit groups) so the
// parser's skip/emit rules are pinned down without a live company.
import { describe, expect, it } from 'vitest'
import type { QboAccountMeta } from './qbo.client.js'
import {
  applyBalancePlug,
  buildSchoolRows,
  flattenRows,
  matchColumns,
  notSpecifiedTotals,
  PLUG_ACCT,
  PLUG_DESC,
  type AccountMetaMaps,
  type QboReportColumn,
  type QboSummarizedReport,
} from './qbo-company.synth.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DIMENSIONS = [
  { id: '1', name: 'Main Campus' },
  { id: '2', name: 'North Campus' },
  { id: '3', name: 'South Campus' },
]

/** Column set shared by both report fixtures: Main matched by METADATA ID
 *  (its title drifted after a rename), North/South matched by TITLE. */
const COLUMNS: QboReportColumn[] = [
  { ColTitle: '', ColType: 'Account' },
  { ColTitle: 'Main (renamed)', ColType: 'Money', MetaData: [{ Name: 'ColKey', Value: '1' }] },
  { ColTitle: 'North Campus', ColType: 'Money' },
  { ColTitle: 'South Campus', ColType: 'Money' },
  { ColTitle: 'Not Specified', ColType: 'Money' },
  { ColTitle: 'TOTAL', ColType: 'Money' },
]

// Cells: [name, Main, North, South, NotSpecified, TOTAL]
const PNL: QboSummarizedReport = {
  Header: { ReportName: 'ProfitAndLoss' },
  Columns: { Column: COLUMNS },
  Rows: {
    Row: [
      {
        group: 'Income',
        type: 'Section',
        Header: { ColData: [{ value: 'Income' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }] },
        Rows: {
          Row: [
            {
              type: 'Data',
              ColData: [
                { value: 'Tuition', id: '11' },
                { value: '100.00' },
                { value: '50.00' },
                { value: '30.00' },
                { value: '25.00' },
                { value: '205.00' },
              ],
            },
            {
              // Parent ACCOUNT with its own balance: Header carries an id +
              // numeric cells and must be emitted exactly once; the child is a
              // separate row; the Summary would double-count and never is.
              type: 'Section',
              Header: {
                ColData: [
                  { value: 'Fees', id: '12' },
                  { value: '10.00' },
                  { value: '0.00' },
                  { value: '0.00' },
                  { value: '0.00' },
                  { value: '10.00' },
                ],
              },
              Rows: {
                Row: [
                  {
                    type: 'Data',
                    ColData: [
                      { value: 'Activity Fees', id: '13' },
                      { value: '5.00' },
                      { value: '0.00' },
                      { value: '0.00' },
                      { value: '0.00' },
                      { value: '5.00' },
                    ],
                  },
                ],
              },
              Summary: {
                ColData: [
                  { value: 'Total Fees' },
                  { value: '15.00' },
                  { value: '0.00' },
                  { value: '0.00' },
                  { value: '0.00' },
                  { value: '15.00' },
                ],
              },
            },
            {
              // Structural sub-section whose header has an id but NO numeric
              // cells (a parent account with no balance of its own) — the
              // header must NOT become a row; the child still is one.
              type: 'Section',
              Header: { ColData: [{ value: 'Grants', id: '14' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }] },
              Rows: {
                Row: [
                  {
                    type: 'Data',
                    ColData: [
                      { value: 'Restricted Grants', id: '15' },
                      { value: '0.00' },
                      { value: '20.00' },
                      { value: '0.00' },
                      { value: '0.00' },
                      { value: '20.00' },
                    ],
                  },
                ],
              },
              Summary: { ColData: [{ value: 'Total Grants' }, { value: '' }, { value: '20.00' }, { value: '' }, { value: '' }, { value: '20.00' }] },
            },
          ],
        },
        Summary: {
          ColData: [
            { value: 'Total Income' },
            { value: '115.00' },
            { value: '70.00' },
            { value: '30.00' },
            { value: '25.00' },
            { value: '240.00' },
          ],
        },
      },
      {
        // Computed subtotal SECTION — skipped entirely.
        group: 'GrossProfit',
        type: 'Section',
        Summary: { ColData: [{ value: 'Gross Profit' }, { value: '115.00' }, { value: '70.00' }, { value: '30.00' }, { value: '25.00' }, { value: '240.00' }] },
      },
      {
        group: 'Expenses',
        type: 'Section',
        Header: { ColData: [{ value: 'Expenses' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }] },
        Rows: {
          Row: [
            {
              type: 'Data',
              ColData: [
                { value: 'Salaries', id: '21' },
                { value: '60.00' },
                { value: '30.00' },
                { value: '10.00' },
                { value: '5.00' },
                { value: '105.00' },
              ],
            },
            {
              // All-zero row: parsed but dropped by buildSchoolRows.
              type: 'Data',
              ColData: [
                { value: 'Dormant Expense', id: '22' },
                { value: '0.00' },
                { value: '0.00' },
                { value: '0.00' },
                { value: '0.00' },
                { value: '0.00' },
              ],
            },
            {
              // Account with NO metadata row → synthetic 90000+ numbering.
              type: 'Data',
              ColData: [
                { value: 'Mystery Cost', id: '99' },
                { value: '0.00' },
                { value: '5.00' },
                { value: '0.00' },
                { value: '0.00' },
                { value: '5.00' },
              ],
            },
          ],
        },
        Summary: { ColData: [{ value: 'Total Expenses' }, { value: '60.00' }, { value: '35.00' }, { value: '10.00' }, { value: '5.00' }, { value: '110.00' }] },
      },
      {
        // Computed NET INCOME section + the id-less Data-row variant some
        // layouts emit — both must be excluded.
        group: 'NetIncome',
        type: 'Section',
        Summary: { ColData: [{ value: 'Net Income' }, { value: '55.00' }, { value: '35.00' }, { value: '20.00' }, { value: '20.00' }, { value: '130.00' }] },
      },
      { type: 'Data', ColData: [{ value: 'Net Income' }, { value: '55.00' }, { value: '35.00' }, { value: '20.00' }, { value: '20.00' }, { value: '130.00' }] },
      { type: 'Data', ColData: [{ value: 'Total Everything' }, { value: '1.00' }, { value: '1.00' }, { value: '1.00' }, { value: '1.00' }, { value: '4.00' }] },
    ],
  },
}

const BS: QboSummarizedReport = {
  Header: { ReportName: 'BalanceSheet' },
  Columns: { Column: COLUMNS },
  Rows: {
    Row: [
      {
        group: 'TotalAssets',
        type: 'Section',
        Header: { ColData: [{ value: 'ASSETS' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }] },
        Rows: {
          Row: [
            {
              type: 'Data',
              ColData: [
                { value: 'Checking', id: '31' },
                { value: '80.00' },
                { value: '10.00' },
                { value: '20.00' },
                { value: '0.00' },
                { value: '110.00' },
              ],
            },
          ],
        },
        Summary: { ColData: [{ value: 'Total ASSETS' }, { value: '80.00' }, { value: '10.00' }, { value: '20.00' }, { value: '0.00' }, { value: '110.00' }] },
      },
      {
        group: 'TotalLiabilitiesAndEquity',
        type: 'Section',
        Header: { ColData: [{ value: 'LIABILITIES AND EQUITY' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }] },
        Rows: {
          Row: [
            {
              group: 'Liabilities',
              type: 'Section',
              Rows: {
                Row: [
                  {
                    type: 'Data',
                    ColData: [
                      { value: 'Accounts Payable', id: '41' },
                      { value: '15.00' },
                      { value: '5.00' },
                      { value: '0.00' },
                      { value: '0.00' },
                      { value: '20.00' },
                    ],
                  },
                ],
              },
              Summary: { ColData: [{ value: 'Total Liabilities' }, { value: '15.00' }, { value: '5.00' }, { value: '0.00' }, { value: '0.00' }, { value: '20.00' }] },
            },
            {
              group: 'Equity',
              type: 'Section',
              Rows: {
                Row: [
                  {
                    type: 'Data',
                    ColData: [
                      { value: 'Opening Balance Equity', id: '51' },
                      { value: '10.00' },
                      { value: '0.00' },
                      { value: '0.00' },
                      { value: '0.00' },
                      { value: '10.00' },
                    ],
                  },
                ],
              },
              Summary: { ColData: [{ value: 'Total Equity' }, { value: '10.00' }, { value: '0.00' }, { value: '0.00' }, { value: '0.00' }, { value: '10.00' }] },
            },
          ],
        },
        Summary: { ColData: [{ value: 'Total LIABILITIES AND EQUITY' }, { value: '25.00' }, { value: '5.00' }, { value: '0.00' }, { value: '0.00' }, { value: '30.00' }] },
      },
    ],
  },
}

function meta(
  id: number,
  fields: Partial<Omit<QboAccountMeta, 'id'>> & { name: string },
): [number, string, QboAccountMeta] {
  const m: QboAccountMeta = {
    id,
    acctNum: fields.acctNum ?? null,
    accountType: fields.accountType ?? '',
    accountSubType: fields.accountSubType ?? '',
    classification: fields.classification ?? '',
  }
  return [id, fields.name.toLowerCase(), m]
}

function metaMaps(): AccountMetaMaps {
  const defs: Array<[number, string, QboAccountMeta]> = [
    meta(11, { name: 'Tuition', acctNum: 4010, accountType: 'Income', classification: 'Revenue' }),
    meta(12, { name: 'Fees', accountType: 'Income', classification: 'Revenue' }),
    meta(13, { name: 'Activity Fees', accountType: 'Income', classification: 'Revenue' }),
    meta(15, { name: 'Restricted Grants', accountType: 'Income', classification: 'Revenue' }),
    meta(21, { name: 'Salaries', accountType: 'Expense', classification: 'Expense' }),
    meta(22, { name: 'Dormant Expense', accountType: 'Expense', classification: 'Expense' }),
    meta(31, { name: 'Checking', accountType: 'Bank', classification: 'Asset' }),
    meta(41, { name: 'Accounts Payable', accountType: 'Accounts Payable', classification: 'Liability' }),
    meta(51, { name: 'Opening Balance Equity', accountType: 'Equity', classification: 'Equity' }),
    // id 99 ('Mystery Cost') deliberately absent → synthetic numbering.
  ]
  const byId = new Map(defs.map(([id, , m]) => [id, m]))
  const byName = new Map(defs.map(([, name, m]) => [name, m]))
  return { byId, byName }
}

// ── matchColumns ──────────────────────────────────────────────────────────────

describe('matchColumns', () => {
  it('matches dimension columns by metadata id first, then by title', () => {
    const m = matchColumns(COLUMNS, DIMENSIONS)
    expect(m.valueByQboId.get('1')).toBe(1) // renamed title, matched via MetaData id
    expect(m.valueByQboId.get('2')).toBe(2) // matched by title
    expect(m.valueByQboId.get('3')).toBe(3)
    expect(m.valueByQboId.size).toBe(3)
  })

  it('identifies the Not Specified and Total columns and never maps them to a value', () => {
    const m = matchColumns(COLUMNS, DIMENSIONS)
    expect(m.notSpecified).toBe(4)
    expect(m.total).toBe(5)
    expect([...m.valueByQboId.values()]).not.toContain(4)
    expect([...m.valueByQboId.values()]).not.toContain(5)
  })

  it('leaves a dimension with no report column unmatched (no activity in window)', () => {
    const m = matchColumns(COLUMNS, [...DIMENSIONS, { id: '9', name: 'Closed Campus' }])
    expect(m.valueByQboId.has('9')).toBe(false)
  })
})

// ── flattenRows ───────────────────────────────────────────────────────────────

describe('flattenRows', () => {
  it('flattens nested sections without emitting Summary rows (no double count)', () => {
    const names = flattenRows(PNL).map((r) => r.name)
    expect(names).toEqual([
      'Tuition',
      'Fees',
      'Activity Fees',
      'Restricted Grants',
      'Salaries',
      'Dormant Expense',
      'Mystery Cost',
    ])
    expect(names).not.toContain('Total Income')
    expect(names).not.toContain('Total Fees')
  })

  it('excludes computed rows: NetIncome/GrossProfit groups and id-less Net Income / Total rows', () => {
    const names = flattenRows(PNL).map((r) => r.name)
    expect(names).not.toContain('Net Income')
    expect(names).not.toContain('Gross Profit')
    expect(names).not.toContain('Total Everything')
  })

  it('emits a parent-account Header with its own balance exactly once, and skips value-less headers', () => {
    const flat = flattenRows(PNL)
    const fees = flat.filter((r) => r.name === 'Fees')
    expect(fees).toHaveLength(1)
    expect(fees[0].accountId).toBe('12')
    expect(fees[0].values[1]).toBe(10)
    // 'Grants' header has an id but no numeric cells → structural only.
    expect(flat.some((r) => r.name === 'Grants')).toBe(false)
    expect(flat.some((r) => r.name === 'Restricted Grants')).toBe(true)
  })

  it('carries the enclosing section groups for the sign fallback', () => {
    const flat = flattenRows(BS)
    const equity = flat.find((r) => r.name === 'Opening Balance Equity')
    expect(equity?.groups).toEqual(['TotalLiabilitiesAndEquity', 'Equity'])
  })
})

// ── buildSchoolRows ───────────────────────────────────────────────────────────

describe('buildSchoolRows', () => {
  const pnlFlat = flattenRows(PNL)
  const bsFlat = flattenRows(BS)

  it('applies all four sign conventions (P&L rev −, exp +; BS asset +, liability/equity −)', () => {
    const { rows } = buildSchoolRows(pnlFlat, bsFlat, { pnl: [1], bs: [1] }, metaMaps())
    const byDesc = new Map(rows.map((r) => [r.desc, r.total]))
    expect(byDesc.get('Tuition')).toBe(-100) // P&L revenue → −v
    expect(byDesc.get('Salaries')).toBe(60) // P&L expense → +v
    expect(byDesc.get('Checking')).toBe(80) // BS asset → +v
    expect(byDesc.get('Accounts Payable')).toBe(-15) // BS liability → −v
    expect(byDesc.get('Opening Balance Equity')).toBe(-10) // BS equity → −v
  })

  it('falls back to the report section groups when an account has no metadata', () => {
    // 'Mystery Cost' (id 99, no meta) sits under the 'Expenses' group → +v.
    const { rows } = buildSchoolRows(pnlFlat, bsFlat, { pnl: [2], bs: [2] }, metaMaps())
    const mystery = rows.find((r) => r.desc === 'Mystery Cost')
    expect(mystery?.total).toBe(5)
  })

  it('numbers accounts: real AcctNum, type-derived block (+plEntries), synthetic 90000+', () => {
    const { rows, plEntries } = buildSchoolRows(pnlFlat, bsFlat, { pnl: [1, 2], bs: [1, 2] }, metaMaps())
    const byDesc = new Map(rows.map((r) => [r.desc, r.acct]))
    expect(byDesc.get('Tuition')).toBe(4010) // real AcctNum wins
    expect(byDesc.get('Fees')).toBe(40012) // Income without AcctNum → 40000 + id
    expect(byDesc.get('Salaries')).toBe(60021) // Expense without AcctNum → 60000 + id
    expect(byDesc.get('Checking')).toBe(100) // Bank collapses onto engine cash
    expect(byDesc.get('Mystery Cost')).toBe(90000) // no metadata → synthetic
    expect(plEntries['40012']).toBe('other')
    expect(plEntries['60021']).toBe('fixedOther')
    expect(plEntries['90000']).toBeUndefined()
  })

  it('sums many-to-one columns and drops zero rows', () => {
    const one = buildSchoolRows(pnlFlat, bsFlat, { pnl: [2], bs: [2] }, metaMaps())
    const both = buildSchoolRows(pnlFlat, bsFlat, { pnl: [2, 3], bs: [2, 3] }, metaMaps())
    const tuition = (b: typeof both) => b.rows.find((r) => r.desc === 'Tuition')?.total
    expect(tuition(one)).toBe(-50)
    expect(tuition(both)).toBe(-80) // 50 + 30, then revenue sign
    // Zero everywhere → dropped entirely (never a 0-total row).
    expect(both.rows.some((r) => r.desc === 'Dormant Expense')).toBe(false)
    expect(both.rows.every((r) => r.total !== 0)).toBe(true)
  })

  it('treats a mapped dimension with no report column as zero (missing index)', () => {
    const { rows } = buildSchoolRows(pnlFlat, bsFlat, { pnl: [], bs: [] }, metaMaps())
    expect(rows).toHaveLength(0)
  })
})

// ── applyBalancePlug ──────────────────────────────────────────────────────────

describe('applyBalancePlug', () => {
  it('appends the acct-399 plug when the location is off balance', () => {
    // Main campus: P&L −100−10−5+60 = −55; BS 80−15−10 = +55 → balanced. Use
    // North instead: −50−20+30+5 = −35; BS 10−5 = +5 → diff −30.
    const { rows } = buildSchoolRows(flattenRows(PNL), flattenRows(BS), { pnl: [2], bs: [2] }, metaMaps())
    const plugged = applyBalancePlug(rows)
    expect(plugged.imbalance).toBe(-30)
    expect(plugged.balancePlug).toBe(30)
    const plug = plugged.rows[plugged.rows.length - 1]
    expect(plug).toEqual({ acct: PLUG_ACCT, desc: PLUG_DESC, total: 30 })
    expect(plugged.rows.reduce((s, r) => s + r.total, 0)).toBeCloseTo(0, 2)
  })

  it('adds nothing when the rows already balance within a cent', () => {
    const { rows } = buildSchoolRows(flattenRows(PNL), flattenRows(BS), { pnl: [1], bs: [1] }, metaMaps())
    const plugged = applyBalancePlug(rows)
    expect(plugged.balancePlug).toBeNull()
    expect(plugged.imbalance).toBe(0)
    expect(plugged.rows).toBe(rows)
    // And a sub-cent residue is tolerated, not plugged.
    const tiny = applyBalancePlug([{ acct: 100, desc: 'Cash', total: 0.01 }])
    expect(tiny.balancePlug).toBeNull()
  })
})

// ── notSpecifiedTotals ────────────────────────────────────────────────────────

describe('notSpecifiedTotals', () => {
  it('splits the Not Specified column into revenue and expense totals', () => {
    const totals = notSpecifiedTotals(flattenRows(PNL), 4, metaMaps())
    expect(totals).toEqual({ revenue: 25, expense: 5 })
  })

  it('returns zeros when the report has no Not Specified column', () => {
    expect(notSpecifiedTotals(flattenRows(PNL), null, metaMaps())).toEqual({ revenue: 0, expense: 0 })
  })
})

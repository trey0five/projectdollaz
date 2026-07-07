// Fixture-JSON unit tests for the PURE cash-flow parser + reconcile/runway math. The
// CashFlow fixture mirrors a reports/CashFlow shape: a Columns declaration, then
// activity SECTION rows keyed on `group` (with DELIBERATELY off header text to prove
// the parser keys on group, not labels), each carrying a Summary subtotal, plus tail
// rows for net change / begin / end cash. Also exercises the derived-fallback trigger
// (a degenerate report → null), the P&L net-income + BS-cash extractors, the STRONG/
// LOOSE reconciliation tolerance bands, and the months-of-cash runway.
import { describe, expect, it } from 'vitest'
import {
  parseCashFlow,
  parseNetIncome,
  parseBalanceSheetCash,
  strongCheck,
  looseCheck,
  fyStartISO,
  monthsElapsedInFy,
  monthlyBurnOf,
  monthsOfCash,
} from './qbo-cashflow.js'

const MONEY_COLS = { Column: [{ ColType: 'Account' }, { ColType: 'Money', ColTitle: 'Total' }] }

function section(group: string, header: string, subtotal: string) {
  return {
    group,
    type: 'Section',
    Header: { ColData: [{ value: header }, { value: '' }] },
    Rows: { Row: [{ ColData: [{ value: `${header} line` }, { value: subtotal }] }] },
    Summary: { ColData: [{ value: `Total ${header}` }, { value: subtotal }] },
  }
}
function dataRow(label: string, amount: string) {
  return { type: 'Data', ColData: [{ value: label }, { value: amount }] }
}

describe('parseCashFlow', () => {
  it('reads the three activity sections by GROUP (ignoring off header text) + tail rows', () => {
    const raw = {
      Columns: MONEY_COLS,
      Rows: {
        Row: [
          // Header text is deliberately generic/wrong; the parser must key on `group`.
          section('OperatingActivities', 'Operations', '-40000.00'),
          section('InvestingActivities', 'Capital', '-5000.00'),
          section('FinancingActivities', 'Loans', '12000.00'),
          dataRow('Net cash increase for period', '-33000.00'),
          dataRow('Cash at beginning of period', '100000.00'),
          dataRow('Cash at end of period', '67000.00'),
        ],
      },
    }
    const cf = parseCashFlow(raw)
    expect(cf).not.toBeNull()
    expect(cf!.operating).toBe(-40000)
    expect(cf!.investing).toBe(-5000)
    expect(cf!.financing).toBe(12000)
    expect(cf!.netChange).toBe(-33000)
    expect(cf!.cashBegin).toBe(100000)
    expect(cf!.cashEnd).toBe(67000)
  })

  it('derives net change from the three sections when the tail row is absent', () => {
    const raw = {
      Columns: MONEY_COLS,
      Rows: {
        Row: [
          section('OperatingActivities', 'Op', '1000.00'),
          section('InvestingActivities', 'Inv', '-300.00'),
          section('FinancingActivities', 'Fin', '50.00'),
        ],
      },
    }
    const cf = parseCashFlow(raw)!
    expect(cf.netChange).toBe(750) // 1000 - 300 + 50
  })

  it('returns null for a degenerate report (the derived-from-SCF fallback trigger)', () => {
    expect(parseCashFlow({ Rows: { Row: [] } })).toBeNull()
    expect(parseCashFlow({})).toBeNull()
    expect(parseCashFlow(null)).toBeNull()
  })
})

describe('parseNetIncome', () => {
  it('extracts the Net Income summary value structurally', () => {
    const raw = {
      Columns: MONEY_COLS,
      Rows: {
        Row: [
          { group: 'Income', Summary: { ColData: [{ value: 'Total Income' }, { value: '500000.00' }] } },
          { Summary: { ColData: [{ value: 'Net Income' }, { value: '75000.00' }] } },
        ],
      },
    }
    expect(parseNetIncome(raw)).toBe(75000)
  })

  it('returns null when no Net Income row is present', () => {
    expect(parseNetIncome({ Rows: { Row: [{ ColData: [{ value: 'Something' }, { value: '1' }] }] } })).toBeNull()
  })
})

describe('parseBalanceSheetCash', () => {
  it('reads the Bank section total (the QBO cash grouping)', () => {
    const raw = {
      Columns: MONEY_COLS,
      Rows: {
        Row: [
          {
            group: 'Bank',
            Header: { ColData: [{ value: 'Bank Accounts' }] },
            Rows: { Row: [{ ColData: [{ value: 'Checking' }, { value: '67000.00' }] }] },
            Summary: { ColData: [{ value: 'Total Bank Accounts' }, { value: '67000.00' }] },
          },
        ],
      },
    }
    expect(parseBalanceSheetCash(raw)).toBe(67000)
  })

  it('returns null when no Bank section is present', () => {
    expect(parseBalanceSheetCash({ Rows: { Row: [] } })).toBeNull()
  })
})

describe('reconciliation tolerance', () => {
  it('STRONG check ties within max($1, 0.5%) and differs beyond it', () => {
    const tie = strongCheck('cash', 'Cash balance', 100000.5, 100000) // $0.50 diff
    expect(tie.status).toBe('tied')
    expect(tie.material).toBe(false)
    const differ = strongCheck('cash', 'Cash balance', 100600, 100000) // $600 diff (>0.5% of 100k=$500)
    expect(differ.status).toBe('differs')
    expect(differ.material).toBe(false) // below the $1000 / 1% material band
  })

  it('STRONG check flags MATERIAL beyond max($1000, 1%)', () => {
    const m = strongCheck('net_income', 'Net income', 90000, 75000) // $15k diff
    expect(m.status).toBe('differs')
    expect(m.material).toBe(true)
  })

  it('LOOSE check reads "expected" (never "differs") when beyond tolerance, with a note', () => {
    const c = looseCheck('cash_change', 'Net change in cash', -30000, -33200) // $3200 gap
    expect(c.status).toBe('expected')
    expect(c.note).toBeTruthy()
    expect((c as { material?: boolean }).material).toBeUndefined() // never material
  })
})

describe('runway / months-of-cash', () => {
  it('fyStartISO returns the Jul-1 start for a Jun-30 annual period end', () => {
    expect(fyStartISO('2026-06-30')).toBe('2025-07-01')
  })

  it('monthsElapsedInFy is ~12 for a full FY and floors to ≥1', () => {
    expect(monthsElapsedInFy('2025-07-01', '2026-06-30')).toBe(12)
    expect(monthsElapsedInFy('2026-06-30', '2026-06-30')).toBe(1) // degenerate → floor 1
  })

  it('monthsOfCash = openingCash / |monthlyBurn| when burning; null when cash-flow positive', () => {
    const burn = monthlyBurnOf(-48000, 12) // -$4k/mo
    expect(burn).toBe(-4000)
    expect(monthsOfCash(32000, burn)).toBe(8) // 32k / 4k = 8 months
    expect(monthsOfCash(32000, 4000)).toBeNull() // positive burn → not burning
    expect(monthsOfCash(null, burn)).toBeNull() // unknown cash → null
  })
})

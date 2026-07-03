// ─────────────────────────────────────────────────────────────
// Multi-sheet enumeration + header-name column mapping.
// Mirrors the real TB_Monthly_Samples workbook: a prior-year ANNUAL
// sheet, a non-TB "Assumptions" tab, and three MONTHLY YTD sheets with
// DISTINCT values — listTrialBalanceSheets must fan them out correctly.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { listTrialBalanceSheets, parseTrialBalance } from '../src/index.js'

/** A trial-balance-shaped sheet: banner, blank, header, rows, balance-check tail. */
function tbSheet(
  banner: string,
  header: string[],
  rows: (string | number | null)[][],
): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet([
    [banner],
    [],
    header,
    ...rows,
    [null, 'Balance check (Debit - Credit, should be 0)', null, null, 0],
  ])
}

function toArrayBuffer(wb: XLSX.WorkBook): ArrayBuffer {
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | Uint8Array
  if (out instanceof ArrayBuffer) return out
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer
}

/** Monthly YTD sheet: tuition credit scales with the month (distinct nets). */
function monthlySheet(banner: string, tuition: number, salaries: number): XLSX.WorkSheet {
  return tbSheet(banner, ['Number', 'Description', 'Debit', 'Credit', 'Total'], [
    [401, 'Tuition - net of discounts', null, tuition, -tuition],
    [402, 'Registration fees', null, 12000, -12000],
    [110, 'Cash', 25000, null, 25000],
    [120, 'Accounts receivable', 8000, null, 8000],
    [500, 'Salaries', salaries, null, salaries],
    [510, 'Benefits', 40000, null, 40000],
    [600, 'Facilities', 30000, null, 30000],
    [610, 'Instructional supplies', 15000, null, 15000],
    [300, 'Net assets - beginning of year', null, 100000, -100000],
  ])
}

function buildWorkbook(): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  // Prior-year ANNUAL sheet — only Debit/Credit (no Total column).
  XLSX.utils.book_append_sheet(
    wb,
    tbSheet(
      'Sample 01 High School — Trial Balance — Prior Year (FY25)',
      ['Number', 'Description', 'Debit', 'Credit'],
      [
        [401, 'Tuition - net of discounts', null, 8160000],
        [402, 'Registration fees', null, 144000],
        [110, 'Cash', 500000, null],
        [500, 'Salaries', 5000000, null],
        [510, 'Benefits', 900000, null],
        [600, 'Facilities', 700000, null],
        [610, 'Supplies', 300000, null],
        [300, 'Net assets - beginning of year', null, 9000000],
      ],
    ),
    'FY25 Source',
  )

  // NON-trial-balance tab — must be skipped (no account rows).
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Assumptions'],
      [],
      ['Months in fiscal year', 12],
      ['Fiscal year', 'FY27 (Jul 2026 - Jun 2027)'],
      ['Month', 'Months elapsed', 'YTD fraction'],
      ['July 2026', 1, 0.0833],
      ['August 2026', 2, 0.1667],
    ]),
    'Assumptions',
  )

  XLSX.utils.book_append_sheet(
    wb,
    monthlySheet('Sample 01 High School — Trial Balance — July 2026 (FY27, YTD)', 680000, 420000),
    'Jul 2026',
  )
  XLSX.utils.book_append_sheet(
    wb,
    monthlySheet('Sample 01 High School — Trial Balance — August 2026 (FY27, YTD)', 1360000, 840000),
    'Aug 2026',
  )
  XLSX.utils.book_append_sheet(
    wb,
    monthlySheet('Sample 01 High School — Trial Balance — September 2026 (FY27, YTD)', 2040000, 1260000),
    'Sep 2026',
  )

  return toArrayBuffer(wb)
}

describe('listTrialBalanceSheets (multi-sheet fan-out)', () => {
  it('returns the annual + 3 monthly candidates and SKIPS Assumptions', () => {
    const candidates = listTrialBalanceSheets(buildWorkbook())
    const sheets = candidates.map((c) => c.sheet)
    expect(sheets).toEqual(['FY25 Source', 'Jul 2026', 'Aug 2026', 'Sep 2026'])
    expect(sheets).not.toContain('Assumptions')
  })

  it('classifies the annual sheet as NOT monthly with an FY25 June-30 period', () => {
    const annual = listTrialBalanceSheets(buildWorkbook()).find((c) => c.sheet === 'FY25 Source')!
    expect(annual.metadata.isMonthly).toBeFalsy()
    expect(annual.metadata.monthKey).toBeUndefined()
    expect(annual.metadata.periodEndDate).toBe('2025-06-30')
    expect(annual.metadata.accountCount).toBe(annual.rows.length)
  })

  it('classifies each monthly sheet with monthKey + FY27 period-end + distinct nets', () => {
    const candidates = listTrialBalanceSheets(buildWorkbook())
    const byKey = (mk: string) => candidates.find((c) => c.metadata.monthKey === mk)!

    for (const mk of ['2026-07', '2026-08', '2026-09']) {
      const c = byKey(mk)
      expect(c.metadata.isMonthly).toBe(true)
      expect(c.metadata.monthKey).toBe(mk)
      // Jul 2026 belongs to FY27 (Jul 2026 – Jun 2027) → FY end 2027-06-30.
      expect(c.metadata.periodEndDate).toBe('2027-06-30')
    }

    // Distinct rows/nets per month (tuition 680k / 1.36M / 2.04M drives it).
    const jul = byKey('2026-07').metadata.net!
    const aug = byKey('2026-08').metadata.net!
    const sep = byKey('2026-09').metadata.net!
    expect(new Set([jul, aug, sep]).size).toBe(3)
    expect(byKey('2026-07').rows.find((r) => r.acct === 401)!.total).toBe(-680000)
    expect(byKey('2026-08').rows.find((r) => r.acct === 401)!.total).toBe(-1360000)
    expect(byKey('2026-09').rows.find((r) => r.acct === 401)!.total).toBe(-2040000)
  })

  it('parseTrialBalance targets a NAMED sheet (not blind index 0)', () => {
    const bytes = buildWorkbook()
    const sep = parseTrialBalance(bytes, 'Sep 2026')
    expect(sep.metadata!.monthKey).toBe('2026-09')
    expect(sep.rows.find((r) => r.acct === 401)!.total).toBe(-2040000)
    // Default (no sheet) picks the FIRST trial-balance sheet — the annual one.
    const first = parseTrialBalance(bytes)
    expect(first.metadata!.isMonthly).toBeFalsy()
    expect(first.metadata!.periodEndDate).toBe('2025-06-30')
  })
})

describe('header-NAME column mapping (shuffled columns)', () => {
  it('maps by header text regardless of column order', () => {
    // Columns intentionally re-ordered: Total, Description, Debit, Number, Credit.
    const ws = XLSX.utils.aoa_to_sheet([
      ['Reordered Trial Balance — FY26'],
      [],
      ['Total', 'Description', 'Debit', 'Number', 'Credit'],
      [-100, 'Tuition', 0, 401, 100],
      [250, 'Salaries', 250, 500, 0],
      [8000, 'Cash', 8000, 110, 0],
      [-9000, 'Net assets', 0, 300, 9000],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'TB')
    const res = parseTrialBalance(toArrayBuffer(wb))
    expect(res.rows).toEqual([
      { acct: 401, desc: 'Tuition', total: -100 },
      { acct: 500, desc: 'Salaries', total: 250 },
      { acct: 110, desc: 'Cash', total: 8000 },
      { acct: 300, desc: 'Net assets', total: -9000 },
    ])
  })

  it('falls back to Debit − Credit when there is no Total column', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Trial Balance'],
      [],
      ['Number', 'Description', 'Debit', 'Credit'],
      [401, 'Tuition', 0, 100],
      [500, 'Salaries', 250, 0],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'TB')
    const res = parseTrialBalance(toArrayBuffer(wb))
    expect(res.rows).toEqual([
      { acct: 401, desc: 'Tuition', total: -100 },
      { acct: 500, desc: 'Salaries', total: 250 },
    ])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The owner's live repro (2026-10-15), rebuilt in-test: Holy Family Academy's
// QuickBooks "Financial Statements" workbook — a Profit and Loss Budget vs.
// Actual sheet + a Balance Sheet — exactly as QuickBooks exports them. Test
// fixture only (never imported by the app).
// ─────────────────────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx'

export const HF_PL = [
  ['Holy Family Academy', null, null, null, null],
  ['Profit and Loss Budget vs. Actual', null, null, null, null],
  ['July 2025 - June 2026', null, null, null, null],
  [null, null, null, null, null],
  ['', 'Actual', 'Budget', 'over Budget', '% of Budget'],
  ['   Income', null, null, null, null],
  ['      40100 Tuition', 3850000, 3900000, -50000, 98.72],
  ['      40200 Registration Fees', 96000, 90000, 6000, 106.67],
  ['      40900 Tuition Assistance', -310000, -300000, -10000, 103.33],
  ['      41000 Contributions without Donor Restrictions', 245000, 220000, 25000, 111.36],
  ['      41100 Contributions with Donor Restrictions', 120000, 100000, 20000, 120],
  ['      42000 Fundraising Events', 88500, 95000, -6500, 93.16],
  ['      43000 Auxiliary - Aftercare', 64200, 60000, 4200, 107],
  ['      44000 Investment Income', 18300, 12000, 6300, 152.5],
  ['   Total Income', 4172000, 4177000, -5000, 99.88],
  ['Gross Profit', 4172000, 4177000, -5000, 99.88],
  ['   Expenses', null, null, null, null],
  ['      60100 Salaries - Faculty', 2140000, 2100000, 40000, 101.9],
  ['      60200 Salaries - Administration', 412000, 405000, 7000, 101.73],
  ['      61000 Payroll Taxes & Benefits', 598000, 590000, 8000, 101.36],
  ['      62000 Instructional Supplies', 86400, 90000, -3600, 96],
  ['      63000 Technology', 74800, 70000, 4800, 106.86],
  ['      64000 Facilities & Maintenance', 236500, 220000, 16500, 107.5],
  ['      65000 Utilities', 142300, 135000, 7300, 105.41],
  ['      66000 Insurance', 98700, 95000, 3700, 103.89],
  ['      67000 Diocesan Assessment', 124000, 124000, 0, 100],
  ['      68000 Professional Fees', 41600, 40000, 1600, 104],
  ['      69000 Depreciation', 155000, 150000, 5000, 103.33],
  ['   Total Expenses', 4109300, 4019000, 90300, 102.25],
  ['Net Operating Income', 62700, 158000, -95300, 39.68],
  ['Net Income', 62700, 158000, -95300, 39.68],
  [null, null, null, null, null],
  ['Cash Basis  Wednesday, July 15, 2026 09:42 AM GMT-04:00', null, null, null, null],
]

export const HF_BS = [
  ['Holy Family Academy', null],
  ['Balance Sheet', null],
  ['As of June 30, 2026', null],
  [null, null],
  ['', 'Total'],
  ['ASSETS', null],
  ['   Current Assets', null],
  ['      Bank Accounts', null],
  ['         10100 Operating Checking', 612400],
  ['         10200 Savings - Reserve', 1050000],
  ['         10300 Payroll Account', 48600],
  ['      Total Bank Accounts', 1711000],
  ['      Other Current Assets', null],
  ['         11000 Tuition Receivable', 184300],
  ['         11500 Pledges Receivable', 95000],
  ['         12000 Prepaid Expenses', 42700],
  ['      Total Other Current Assets', 322000],
  ['   Total Current Assets', 2033000],
  ['   Fixed Assets', null],
  ['      15000 Buildings & Improvements', 4850000],
  ['      15500 Furniture & Equipment', 620000],
  ['      17000 Accumulated Depreciation', -2310000],
  ['   Total Fixed Assets', 3160000],
  ['TOTAL ASSETS', 5193000],
  ['LIABILITIES AND EQUITY', null],
  ['   Liabilities', null],
  ['      Current Liabilities', null],
  ['         Accounts Payable', null],
  ['            20000 Accounts Payable', 118400],
  ['         Total Accounts Payable', 118400],
  ['         Other Current Liabilities', null],
  ['            21000 Accrued Payroll', 236900],
  ['            24110 Deferred Tuition', 512000],
  ['         Total Other Current Liabilities', 748900],
  ['      Total Current Liabilities', 867300],
  ['      Long Term Liabilities', null],
  ['         25000 Note Payable - Diocese', 400000],
  ['      Total Long Term Liabilities', 400000],
  ['   Total Liabilities', 1267300],
  ['   Equity', null],
  ['      30000 Net Assets Without Donor Restrictions', 3483000],
  ['      31000 Net Assets With Donor Restrictions', 380000],
  ['      Net Income', 62700],
  ['   Total Equity', 3925700],
  ['TOTAL LIABILITIES AND EQUITY', 5193000],
  [null, null],
  ['Cash Basis  Wednesday, July 15, 2026 09:44 AM GMT-04:00', null],
]

/** An .xlsx ArrayBuffer with the given sheets ({ name: rows[][] }, in order). */
export function workbook(sheets) {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return out instanceof ArrayBuffer ? out : out.buffer
}

export const holyFamilyStatements = () => workbook({ 'Profit and Loss': HF_PL, 'Balance Sheet': HF_BS })
export const holyFamilyPL = () => workbook({ 'Profit and Loss': HF_PL })
export const holyFamilyBS = () => workbook({ 'Balance Sheet': HF_BS })

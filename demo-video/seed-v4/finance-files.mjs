#!/usr/bin/env node
// KYRO demo v4 — the made-up files for the LIVE Brightwater upload (f1–f4).
//
// Writes, under demo-video/assets/v4-files/:
//   Profit and Loss.xlsx          QuickBooks Online "Profit and Loss" export layout,
//                                 FY 2026 (July 2025 – June 2026), Accrual Basis.
//                                 ~40 plainly-named accounts + EXACTLY FIVE whose
//                                 category the engine can't settle from the
//                                 section + name (sure:false) → "5 need a quick check".
//   Balance Sheet.xlsx            QuickBooks "Balance Sheet" as of June 30, 2026;
//                                 balances (TOTAL ASSETS = TOTAL LIABILITIES AND EQUITY).
//   pl-only/Profit and Loss.xlsx  the same P&L alone (the f4 "Needs your Balance
//                                 Sheet · Add it" insert).
//   messy/Trial Balance Export.xlsx  a non-QuickBooks TB from "another system":
//                                 a banner row, then unlabelled debit/credit columns
//                                 → the automatic read refuses with a preview, so the
//                                 column picker ("Show KYRO where your numbers are")
//                                 opens (f2).
//
// Every file is checked with the BUILT parser (packages/ingestion/dist — the same
// ingest() the browser runs) before it is kept, and the five ambiguous accounts are
// checked with the BUILT engine (suggestStatementCategories) — the same rule the
// intake's auto-sort uses. Fictional school, fictional numbers. No I/O beyond
// writing those files. Usage: node finance-files.mjs [--check-only]
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const REPO = '/home/dream/dollaz'
const require = createRequire(path.join(REPO, 'packages/ingestion/package.json'))
const XLSX = require('xlsx')
const ing = await import(path.join(REPO, 'packages/ingestion/dist/index.js'))
const eng = await import(path.join(REPO, 'packages/engine/dist/index.js'))

const OUT = path.join(REPO, 'demo-video/assets/v4-files')
const CO = 'Brightwater School'

// ── Profit and Loss (July 2025 – June 2026) ──────────────────────────────────
// [name, amount]. Natural-positive per section (QuickBooks prints income and
// expenses positive; a contra-income line prints negative).
// Renamed 2026-10-17 (capture): the first five names were categorised in Brightwater's
// mapping by a dry-run take (no route removes a mapping entry), so the live f3 review
// popup would no longer ask about them. New names → new keys → asked again.
export const AMBIGUOUS = ['Yearbook Revenue', 'Facility Usage', 'Summer Programs', 'Graduation Costs', 'Other Expenses']
const INCOME = [
  ['Tuition', 4268000],
  ['Registration Fees', 96500],
  ['Tuition Assistance', -712000],
  ['Annual Fund', 412600],
  ['Gala Proceeds', 168900],
  ['Capital Campaign Gifts', 141000],
  ['Grants', 74500],
  ['Diocesan Subsidy', 120000],
  ['After-Care Program', 58200],
  ['Athletics Income', 86400],
  ['Bookstore Sales', 31800],
  ['Investment Income', 38700],
  ['Interest Income', 9600],
  ['Yearbook Revenue', 14250], // ambiguous
  ['Facility Usage', 22800], // ambiguous
]
const EXPENSES = [
  ['Salaries - Faculty', 2186000],
  ['Salaries - Administration', 498000],
  ['Salaries - Maintenance', 164000],
  ['Payroll Taxes', 218400],
  ['Employee Benefits', 452700],
  ['Classroom Supplies', 61300],
  ['Technology & Software', 88400],
  ['Library Books', 12600],
  ['Professional Development', 27900],
  ['Utilities', 171200],
  ['Repairs & Maintenance', 96800],
  ['Custodial Services', 72400],
  ['Insurance', 84600],
  ['Diocesan Assessment', 101500],
  ['Interest Expense', 38900],
  ['Depreciation', 192000],
  ['Food Service', 64300],
  ['Transportation', 48700],
  ['Athletics', 112600],
  ['Office Supplies', 18900],
  ['Professional Fees', 41200],
  ['Marketing & Advertising', 36500],
  ['Bank Service Charges', 9800],
  ['Summer Programs', 47300], // ambiguous
  ['Graduation Costs', 18600], // ambiguous
  ['Other Expenses', 11400], // ambiguous
]
const sum = (rows) => Math.round(rows.reduce((a, r) => a + r[1], 0) * 100) / 100
const TI = sum(INCOME)
const TE = sum(EXPENSES)
const NET = Math.round((TI - TE) * 100) / 100

const I = (n, s) => '   '.repeat(n) + s
const plGrid = () => [
  [CO],
  ['Profit and Loss'],
  ['July 2025 - June 2026'],
  [],
  ['', 'Total'],
  [I(0, 'Income')],
  ...INCOME.map(([l, a]) => [I(1, l), a]),
  [I(0, 'Total Income'), TI],
  [I(0, 'Gross Profit'), TI],
  [I(0, 'Expenses')],
  ...EXPENSES.map(([l, a]) => [I(1, l), a]),
  [I(0, 'Total Expenses'), TE],
  ['Net Operating Income', NET],
  ['Net Income', NET],
  [],
  [],
  ['Accrual Basis Friday, July 17, 2026 09:42 AM GMT-04:00'],
]

// ── Balance Sheet (as of June 30, 2026) ──────────────────────────────────────
const BANK = [['Operating Checking', 486300], ['Money Market Reserve', 412000], ['Payroll Account', 38900]]
const AR = [['Tuition Receivable', 96400]]
const OCA = [['Pledges Receivable', 118000], ['Prepaid Expenses', 46200]]
const FIXED = [['Land', 640000], ['Buildings & Improvements', 5320000], ['Furniture & Equipment', 712000], ['Accumulated Depreciation', -2468000]]
const AP = [['Accounts Payable', 84300]]
const OCL = [['Accrued Payroll', 196400], ['Deferred Tuition', 538000], ['Student Activity Funds', 21700]]
const LTL = [['Note Payable - Gymnasium', 905000]]
const RESTRICTED_NA = 214000
const tBank = sum(BANK), tAR = sum(AR), tOCA = sum(OCA)
const tCur = Math.round((tBank + tAR + tOCA) * 100) / 100
const tFixed = sum(FIXED)
const tAssets = Math.round((tCur + tFixed) * 100) / 100
const tAP = sum(AP), tOCL = sum(OCL)
const tCurL = Math.round((tAP + tOCL) * 100) / 100
const tLTL = sum(LTL)
const tLiab = Math.round((tCurL + tLTL) * 100) / 100
const UNRESTRICTED_NA = Math.round((tAssets - tLiab - RESTRICTED_NA - NET) * 100) / 100
const EQUITY = [['Net Assets Without Donor Restrictions', UNRESTRICTED_NA], ['Net Assets With Donor Restrictions', RESTRICTED_NA], ['Net Income', NET]]
const tEq = sum(EQUITY)
// Opening net assets (July 1, 2025) = closing net assets − the year's change.
// The school record's "Opening net assets" must hold this BEFORE the f3 take
// generates statements, or the Statement of Financial Position cannot roll
// forward from the year's opening (load-finance.mjs sets it).
export const OPENING_NET_ASSETS = Math.round((tAssets - tLiab - NET) * 100) / 100
const v = (l, n) => [l, n]
const bsGrid = () => [
  [CO],
  ['Balance Sheet'],
  ['As of June 30, 2026'],
  [],
  ['', 'Total'],
  ['ASSETS'],
  [I(1, 'Current Assets')],
  [I(2, 'Bank Accounts')],
  ...BANK.map(([l, n]) => v(I(3, l), n)),
  v(I(2, 'Total Bank Accounts'), tBank),
  [I(2, 'Accounts Receivable')],
  ...AR.map(([l, n]) => v(I(3, l), n)),
  v(I(2, 'Total Accounts Receivable'), tAR),
  [I(2, 'Other Current Assets')],
  ...OCA.map(([l, n]) => v(I(3, l), n)),
  v(I(2, 'Total Other Current Assets'), tOCA),
  v(I(1, 'Total Current Assets'), tCur),
  [I(1, 'Fixed Assets')],
  ...FIXED.map(([l, n]) => v(I(2, l), n)),
  v(I(1, 'Total Fixed Assets'), tFixed),
  v('TOTAL ASSETS', tAssets),
  ['LIABILITIES AND EQUITY'],
  [I(1, 'Liabilities')],
  [I(2, 'Current Liabilities')],
  [I(3, 'Accounts Payable')],
  ...AP.map(([l, n]) => v(I(4, l), n)),
  v(I(3, 'Total Accounts Payable'), tAP),
  [I(3, 'Other Current Liabilities')],
  ...OCL.map(([l, n]) => v(I(4, l), n)),
  v(I(3, 'Total Other Current Liabilities'), tOCL),
  v(I(2, 'Total Current Liabilities'), tCurL),
  [I(2, 'Long-Term Liabilities')],
  ...LTL.map(([l, n]) => v(I(3, l), n)),
  v(I(2, 'Total Long-Term Liabilities'), tLTL),
  v(I(1, 'Total Liabilities'), tLiab),
  [I(1, 'Equity')],
  ...EQUITY.map(([l, n]) => v(I(2, l), n)),
  v(I(1, 'Total Equity'), tEq),
  v('TOTAL LIABILITIES AND EQUITY', Math.round((tLiab + tEq) * 100) / 100),
  [],
  [],
  ['Accrual Basis Friday, July 17, 2026 09:44 AM GMT-04:00'],
]

// ── The messy file: a TB from "another system" ───────────────────────────────
// A banner row, then a header that names the account and description columns
// but leaves the two money columns UNLABELLED. Same chart as the P&L/BS above
// (numbered by that system), so the column picker's live preview reads sense.
const MESSY_ROWS = [
  [1010, 'Operating Checking', 486300, null],
  [1020, 'Money Market Reserve', 412000, null],
  [1030, 'Payroll Account', 38900, null],
  [1200, 'Tuition Receivable', 96400, null],
  [1210, 'Pledges Receivable', 118000, null],
  [1300, 'Prepaid Expenses', 46200, null],
  [1500, 'Land', 640000, null],
  [1510, 'Buildings & Improvements', 5320000, null],
  [1520, 'Furniture & Equipment', 712000, null],
  [1590, 'Accumulated Depreciation', null, 2468000],
  [2010, 'Accounts Payable', null, 84300],
  [2100, 'Accrued Payroll', null, 196400],
  [2200, 'Deferred Tuition', null, 538000],
  [2300, 'Student Activity Funds', null, 21700],
  [2500, 'Note Payable - Gymnasium', null, 905000],
  [3000, 'Net Assets Without Donor Restrictions', null, UNRESTRICTED_NA],
  [3100, 'Net Assets With Donor Restrictions', null, RESTRICTED_NA],
  ...INCOME.map(([l, a], i) => [4000 + (i + 1) * 10, l, a < 0 ? -a : null, a < 0 ? null : a]),
  ...EXPENSES.map(([l, a], i) => [6000 + (i + 1) * 10, l, a, null]),
]
const messyGrid = () => [
  ['*** BWS-FIN  GL0420  ACCOUNT BALANCES  RUN 07/17/2026 08:12  PAGE 1 ***'],
  ['ENTITY 0007 BRIGHTWATER SCHOOL    FISCAL 2026  PERIOD 12'],
  [],
  ['Acct', 'Description', '', ''],
  ...MESSY_ROWS,
  [],
  ['', 'REPORT TOTALS', MESSY_ROWS.reduce((a, r) => a + (r[2] || 0), 0), MESSY_ROWS.reduce((a, r) => a + (r[3] || 0), 0)],
]

function toBytes(grid, sheet, widths) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(grid)
  ws['!cols'] = widths.map((w) => ({ wch: w }))
  for (const k of Object.keys(ws)) if (!k.startsWith('!') && typeof ws[k].v === 'number') ws[k].z = '#,##0.00;-#,##0.00'
  XLSX.utils.book_append_sheet(wb, ws, sheet)
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}
const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

const fail = (m) => {
  throw new Error(`finance-files check failed: ${m}`)
}

export function buildAndCheck() {
  const pl = toBytes(plGrid(), 'Profit and Loss', [44, 16])
  const bs = toBytes(bsGrid(), 'Balance Sheet', [48, 16])
  const messy = toBytes(messyGrid(), 'GL0420', [10, 40, 16, 16])
  const report = {}

  // 1. Each QuickBooks file reads on its own, as a statement export.
  const rPl = ing.ingest('Profit and Loss.xlsx', ab(pl))
  const rBs = ing.ingest('Balance Sheet.xlsx', ab(bs))
  const stPl = rPl.metadata?.statement
  const stBs = rBs.metadata?.statement
  if (!stPl || stPl.type == null) fail('P&L was not read as a statement export')
  if (!stBs || stBs.type == null) fail('Balance Sheet was not read as a statement export')
  if (rPl.metadata?.periodEndDate !== '2026-06-30') fail(`P&L period end ${rPl.metadata?.periodEndDate}`)
  if (rBs.metadata?.periodEndDate !== '2026-06-30') fail(`BS period end ${rBs.metadata?.periodEndDate}`)
  if (rPl.rows.length !== INCOME.length + EXPENSES.length) fail(`P&L rows ${rPl.rows.length}`)
  if (tAssets !== Math.round((tLiab + tEq) * 100) / 100) fail('Balance Sheet does not balance')
  report.pl = { rows: rPl.rows.length, type: stPl.type, partial: stPl.partial, periodEnd: rPl.metadata.periodEndDate }
  report.bs = { rows: rBs.rows.length, type: stBs.type, partial: stBs.partial, periodEnd: rBs.metadata.periodEndDate, balances: true, totalAssets: tAssets }

  // 2. Dropped together they merge into ONE full trial balance.
  const merged = ing.mergeStatementResults(rPl, rBs)
  const st = merged.metadata?.statement
  const mergedSum = Math.round(merged.rows.reduce((a, r) => a + r.total, 0) * 100) / 100
  if (st?.partial !== 'full') fail(`merged pair is "${st?.partial}", not full`)
  report.merged = { rows: merged.rows.length, partial: st.partial, sum: mergedSum, plug: st.balancePlug ?? null }

  // 3. The auto-sort the intake runs: accounts the DEFAULT chart doesn't know,
  //    sorted by section; whatever is not `sure` is what the review popup asks.
  const sections = ing.statementSections(merged.metadata)
  const unmapped = eng.findUnmapped(merged.rows, eng.DEFAULT_CHART)
  const sugg = eng.suggestStatementCategories(unmapped, sections)
  const review = unmapped.filter((r) => !sugg[r.acct]?.sure)
  const sorted = unmapped.length - review.length
  const reviewNames = review.map((r) => r.desc).sort()
  if (JSON.stringify(reviewNames) !== JSON.stringify([...AMBIGUOUS].sort())) {
    fail(`review set is [${reviewNames.join(', ')}], want [${AMBIGUOUS.join(', ')}]`)
  }
  report.autoSort = {
    sortedBySection: sorted,
    needQuickCheck: review.length,
    review: review.map((r) => ({ acct: r.acct, desc: r.desc, side: r.total < 0 ? 'income' : 'expense', suggested: sugg[r.acct]?.category ?? null })),
  }

  // 4. P&L alone is a PARTIAL statement (P&L half only).
  report.plOnly = { partial: stPl.partial }
  if (stPl.partial === 'full') fail('P&L alone reads as full')

  // 5. The messy file: the automatic read must REFUSE it with a preview (that is
  //    what opens the column picker), and the picker's guess must read it.
  let messyErr = null
  try {
    ing.ingest('Trial Balance Export.xlsx', ab(messy))
  } catch (e) {
    messyErr = e
  }
  if (!messyErr) fail('messy file was read automatically — the column picker would never open')
  const f = ing.ingestFailureOf(messyErr)
  if (!f?.preview) fail(`messy refusal has no preview (code ${f?.code})`)
  const guess = f.preview.guess
  let picked = null
  try {
    picked = guess ? ing.ingest('Trial Balance Export.xlsx', ab(messy), { columns: guess }) : null
  } catch (e) {
    picked = { error: e.message }
  }
  report.messy = {
    code: f.code,
    reason: f.reason,
    ask: f.ask,
    guess,
    pickedRows: picked?.rows?.length ?? null,
    pickedError: picked?.error ?? null,
    pickedSum: picked?.rows ? Math.round(picked.rows.reduce((a, r) => a + r.total, 0) * 100) / 100 : null,
  }
  return { files: { pl, bs, messy }, report }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { files, report } = buildAndCheck()
  console.log(JSON.stringify(report, null, 1))
  if (!process.argv.includes('--check-only')) {
    fs.mkdirSync(path.join(OUT, 'pl-only'), { recursive: true })
    fs.mkdirSync(path.join(OUT, 'messy'), { recursive: true })
    fs.writeFileSync(path.join(OUT, 'Profit and Loss.xlsx'), files.pl)
    fs.writeFileSync(path.join(OUT, 'Balance Sheet.xlsx'), files.bs)
    fs.writeFileSync(path.join(OUT, 'pl-only/Profit and Loss.xlsx'), files.pl)
    fs.writeFileSync(path.join(OUT, 'messy/Trial Balance Export.xlsx'), files.messy)
    console.log(`wrote 4 files under ${OUT}`)
  }
}

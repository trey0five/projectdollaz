// ─────────────────────────────────────────────────────────────────────────────
// gen-sample-data.mjs — generate INTERNALLY CONSISTENT sample trial balances.
//
// Replaces the old demo files (whose balance sheets didn't balance, whose
// openings didn't roll forward, and whose imbalance didn't equal the stated
// opening). The data here is engineered so that, by construction:
//
//   • opening net assets = the trial-balance imbalance  (so it's recoverable)
//   • the engine's Statement of Financial Position balances (assets = L + NA)
//   • FY25 ending net assets == FY26 opening net assets   (roll-forward)
//
// It emits BOTH artifacts that must stay in sync:
//   • sample-data/TB_*.xlsx                       (what users upload)
//   • packages/engine/__tests__/__fixtures__/sampleRows.json  (engine fixture)
//
// Only accounts the engine maps into its statement totals are used (no unmapped
// / ancillary accounts), so raw debits−credits == the engine's own subtotals —
// that equivalence is what makes the three properties above hold exactly.
//
//   Usage:  node scripts/gen-sample-data.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// xlsx (SheetJS) is a dependency of @finrep/ingestion; resolve it from there.
const require = createRequire(resolve(repoRoot, 'packages/ingestion/package.json'))
const XLSX = require('xlsx')

// ── The three trial balances. total = signed (debit +, credit −). ────────────
// Assets 100–170, Liabilities 200–260, Revenue 400s, Expense 500–959.
const PY = [
  // assets
  [100, 'Operating cash', 420_000],
  [120, 'Tuition receivable', 600_000],
  [125, 'Prepaid expenses', 150_000],
  [135, 'Restricted investments', 1_500_000],
  [150, 'Buildings & improvements', 9_000_000],
  [170, 'Accumulated depreciation', -2_500_000],
  // liabilities
  [200, 'Accounts payable & accrued', -700_000],
  [230, 'Deferred international tuition', -200_000],
  [260, 'Lease liability — noncurrent', -400_000],
  // revenue
  [401, 'Tuition — net of discounts', -9_000_000],
  [407, 'International program tuition', -600_000],
  [410, 'Textbook leasing income', -120_000],
  [440, 'Student activity fees', -80_000],
  [453, 'Investment income', -90_000],
  [470, 'Interest income', -30_000],
  [480, 'Contributions & support', -400_000],
  // expense
  [500, 'Instructional salaries', 4_500_000],
  [520, 'Instructional supplies', 600_000],
  [600, 'Administrative salaries', 1_500_000],
  [620, 'Administrative costs', 800_000],
  [700, 'Facilities salaries', 500_000],
  [720, 'Facilities & maintenance', 900_000],
  [865, 'Depreciation expense', 500_000], // acct 865: the SCF adds this back
  [925, 'Transportation', 150_000],
  [935, 'Food service', 300_000],
  [950, 'Athletics', 200_000],
]

// FY25 audited: a CLEAN audit (no adjustments) so the audited prior year — which
// the cash-flow statement uses as its beginning balance sheet — articulates
// exactly with the FY26 roll-forward. (A sample with audit adjustments would
// need those adjustments routed through cash to keep the SCF reconciling.)
const AUDIT = PY.map(([a, d, t]) => [a, d, t])

// FY26 current year: opening = FY25 ending (roll-forward), modest growth.
const CY = [
  [100, 'Operating cash', 1_230_000],
  [120, 'Tuition receivable', 650_000],
  [125, 'Prepaid expenses', 160_000],
  [135, 'Restricted investments', 1_600_000],
  [150, 'Buildings & improvements', 9_000_000],
  [170, 'Accumulated depreciation', -3_020_000],
  [200, 'Accounts payable & accrued', -750_000],
  [230, 'Deferred international tuition', -220_000],
  [260, 'Lease liability — noncurrent', -350_000],
  [401, 'Tuition — net of discounts', -9_400_000],
  [407, 'International program tuition', -650_000],
  [410, 'Textbook leasing income', -130_000],
  [440, 'Student activity fees', -85_000],
  [453, 'Investment income', -100_000],
  [470, 'Interest income', -35_000],
  [480, 'Contributions & support', -450_000],
  [500, 'Instructional salaries', 4_700_000],
  [520, 'Instructional supplies', 640_000],
  [600, 'Administrative salaries', 1_560_000],
  [620, 'Administrative costs', 840_000],
  [700, 'Facilities salaries', 520_000],
  [720, 'Facilities & maintenance', 950_000],
  [865, 'Depreciation expense', 520_000], // acct 865: the SCF adds this back
  [925, 'Transportation', 160_000],
  [935, 'Food service', 320_000],
  [950, 'Athletics', 210_000],
]

const toRows = (spec) => spec.map(([acct, desc, total]) => ({ acct, desc, total }))
const sum = (spec) => spec.reduce((s, [, , t]) => s + t, 0)
const isRevExp = (a) => a >= 400
const netChange = (spec) => -spec.filter(([a]) => isRevExp(a)).reduce((s, [, , t]) => s + t, 0)

// ── Self-check the accounting BEFORE writing anything. ───────────────────────
const PY_OPEN = sum(PY) // imbalance = opening net assets
const AUDIT_OPEN = sum(AUDIT)
const CY_OPEN = sum(CY)
const PY_END = PY_OPEN + netChange(PY)
const CY_END = CY_OPEN + netChange(CY)

const checks = [
  ['PY opening (imbalance)', PY_OPEN, 7_500_000],
  ['AUDIT opening (imbalance)', AUDIT_OPEN, 7_500_000],
  ['CY opening (imbalance)', CY_OPEN, 7_870_000],
  ['roll-forward: PY ending == CY opening', PY_END, CY_OPEN],
]
let ok = true
for (const [label, actual, expected] of checks) {
  const pass = actual === expected
  ok = ok && pass
  console.log(`${pass ? 'ok ' : 'XX '} ${label}: ${actual.toLocaleString()}${pass ? '' : ' (expected ' + expected.toLocaleString() + ')'}`)
}
if (!ok) {
  console.error('\nAccounting self-check FAILED — not writing files.')
  process.exit(1)
}
console.log(`\nPY:   open ${PY_OPEN.toLocaleString()} -> end ${PY_END.toLocaleString()}`)
console.log(`CY:   open ${CY_OPEN.toLocaleString()} -> end ${CY_END.toLocaleString()}`)
console.log(`AUDIT:open ${AUDIT_OPEN.toLocaleString()} -> end ${(AUDIT_OPEN + netChange(AUDIT)).toLocaleString()}\n`)

// ── Write the xlsx files. The FIRST banner row becomes periodTitle and carries
// the role keyword (Current Year / Prior Year / Audited) the classifier scores;
// the second row carries FY + audit status + an explicit period-end date. ─────
function writeXlsx(spec, file, roleLabel, subtitle) {
  const aoa = [
    [`Sample 01 High School — ${roleLabel} Trial Balance`],
    [subtitle],
    [],
    ['Number', 'Description', 'Debit', 'Credit', 'Total'],
    ...spec.map(([acct, desc, total]) => [acct, desc, '', '', total]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Trial Balance')
  XLSX.writeFile(wb, resolve(repoRoot, 'sample-data', file))
  console.log(`wrote sample-data/${file} (${spec.length} accounts)`)
}

writeXlsx(CY, 'TB_CurrentYear_FY26.xlsx', 'Current Year', 'Fiscal Year FY26 — Unaudited — As of June 30, 2026')
writeXlsx(PY, 'TB_PriorYear_FY25.xlsx', 'Prior Year', 'Fiscal Year FY25 — Unaudited — As of June 30, 2025')
writeXlsx(AUDIT, 'TB_AuditedFYEnd_FY25.xlsx', 'Audited', 'Fiscal Year FY25 — Audited Year-End — As of June 30, 2025')

// ── Write the engine fixture JSON (same rows, same order). ───────────────────
const fixture = { cyData: toRows(CY), pyData: toRows(PY), auditData: toRows(AUDIT) }
const fixturePath = resolve(repoRoot, 'packages/engine/__tests__/__fixtures__/sampleRows.json')
writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + '\n')
console.log(`wrote ${fixturePath.replace(repoRoot + '/', '')}`)

console.log('\nOpenings for SCHOOLS/fixtures:  netAssetsBegin=%d  pyNetAssetsBegin=%d  auditNetAssetsBegin=%d', CY_OPEN, PY_OPEN, AUDIT_OPEN)

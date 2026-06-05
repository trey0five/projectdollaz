// ─────────────────────────────────────────────────────────────────────────────
// verify-engine.mjs — proves the shared @finrep/engine runs SERVER-SIDE.
//
// Parses sample-data/*.xlsx via @finrep/ingestion (parseTrialBalance) into
// NormalizedRow[], POSTs them + SCHOOLS.school01's 3 net-asset begin balances
// to a running api's /reports/generate, and asserts the regression numbers.
//
// Usage:  node scripts/verify-engine.mjs            (defaults to :8000)
//         API_URL=http://localhost:8123 node scripts/verify-engine.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { parseTrialBalance } from '@finrep/ingestion'
import { SCHOOLS } from '@finrep/engine'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const API_URL = process.env.API_URL ?? 'http://localhost:8000'

function parse(file) {
  const buf = readFileSync(resolve(repoRoot, 'sample-data', file))
  // parseTrialBalance takes an ArrayBuffer; slice to the exact byte range.
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return parseTrialBalance(ab).rows
}

const cyData = parse('TB_CurrentYear_FY26.xlsx')
const pyData = parse('TB_PriorYear_FY25.xlsx')
const auditData = parse('TB_AuditedFYEnd_FY25.xlsx')

const s = SCHOOLS.school01
const body = {
  cyData,
  pyData,
  auditData,
  school: {
    netAssetsBegin: s.netAssetsBegin,
    pyNetAssetsBegin: s.pyNetAssetsBegin,
    auditNetAssetsBegin: s.auditNetAssetsBegin,
  },
}

const res = await fetch(`${API_URL}/reports/generate`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`)
  process.exit(1)
}

const out = await res.json()

const checks = [
  ['soaResults.cy.totalRev', out.soaResults.cy.totalRev, 10342000],
  ['soaResults.cy.totalExp', out.soaResults.cy.totalExp, 8359000],
  ['soaResults.cyNAEnd', out.soaResults.cyNAEnd, 2983000],
  ['sfpResults.cy.totalAssets', out.sfpResults.cy.totalAssets, 13243000],
  ['scf.operatingCash', out.scf.operatingCash, 2420100],
]

let ok = true
for (const [label, actual, expected] of checks) {
  const pass = actual === expected
  ok = ok && pass
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label} = ${actual} (expected ${expected})`)
}

console.log(`\nrows parsed: cy=${cyData.length} py=${pyData.length} audit=${auditData.length}`)
console.log(`meta: ${JSON.stringify(out.meta)}`)

if (!ok) {
  console.error('\nREGRESSION MISMATCH')
  process.exit(1)
}
console.log('\nALL REGRESSION NUMBERS MATCH ✓')

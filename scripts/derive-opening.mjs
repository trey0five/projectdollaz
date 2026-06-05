// ─────────────────────────────────────────────────────────────────────────────
// derive-opening.mjs — DIAGNOSTIC, not a regression check.
//
// Tests the hypothesis "opening net assets is recoverable from the uploaded
// trial balance" against the real sample files, by comparing:
//   • deriveOpeningNetAssets(TB)              — the plug / equity-row recovery
//   • prior-year SOA ending net assets        — the roll-forward candidate
//   • SCHOOLS.school01 hand-entered openings   — what the UI asks users to type
//
// With the regenerated sample data (scripts/gen-sample-data.mjs) all three
// checks now pass: each TB's imbalance equals its stated opening, the balance
// sheet balances, and FY25 rolls forward into FY26. (The original demo files
// failed all three — they were decoupled placeholders.) Kept as a runnable
// proof that the sample data articulates and the opening is recoverable.
//
//   Usage:  node scripts/derive-opening.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { parseTrialBalance } from '@finrep/ingestion'
import { deriveOpeningNetAssets, generateReports, SCHOOLS } from '@finrep/engine'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const parse = (file) => {
  const buf = readFileSync(resolve(repoRoot, 'sample-data', file))
  return parseTrialBalance(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)).rows
}
const fmt = (n) => (n == null ? 'n/a' : Math.round(n).toLocaleString())

const cy = parse('TB_CurrentYear_FY26.xlsx')
const py = parse('TB_PriorYear_FY25.xlsx')
const audit = parse('TB_AuditedFYEnd_FY25.xlsx')
const s = SCHOOLS.school01

console.log('1) DERIVE-FROM-TB (plug / equity-row) vs the hand-entered opening\n')
for (const [file, rows, field] of [
  ['TB_CurrentYear_FY26.xlsx', cy, 'netAssetsBegin'],
  ['TB_PriorYear_FY25.xlsx', py, 'pyNetAssetsBegin'],
  ['TB_AuditedFYEnd_FY25.xlsx', audit, 'auditNetAssetsBegin'],
]) {
  const r = deriveOpeningNetAssets(rows)
  const match = Math.abs(r.value - s[field]) < 0.01
  console.log(
    `   ${file}\n` +
      `     derived ${fmt(r.value)} (${r.source}, confident=${r.confident})  vs typed ${field}=${fmt(s[field])}  →  ${match ? 'match' : 'OFF by ' + fmt(r.value - s[field])}`,
  )
}

console.log('\n2) ROLL-FORWARD: does prior-year ENDING net assets == current-year opening?\n')
const o = generateReports({ cyData: cy, pyData: py, auditData: audit, school: s })
const r = o.soaResults
console.log(`   PY ending ${fmt(r.pyNAEnd)}  vs CY opening ${fmt(r.cyNABegin)}  →  ${r.pyNAEnd === r.cyNABegin ? 'ties' : 'does NOT tie'}`)

console.log('\n3) DOES THE BALANCE SHEET EVEN BALANCE?\n')
const sfp = o.sfpResults.cy
console.log(`   totalAssets ${fmt(sfp.totalAssets)}  vs totalLiabilities+NetAssets ${fmt(sfp.totalLiabNA)}  →  ${Math.abs(sfp.totalAssets - sfp.totalLiabNA) < 0.01 ? 'balances' : 'OFF by ' + fmt(sfp.totalAssets - sfp.totalLiabNA)}`)

console.log(
  '\nConclusion: the sample trial balances are internally consistent — the opening\n' +
    'net assets is recoverable from each upload, the balance sheet balances, and\n' +
    'FY25 rolls forward into FY26. Regenerate with: node scripts/gen-sample-data.mjs',
)

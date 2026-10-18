#!/usr/bin/env node
// KYRO demo v4 — READ-ONLY check of the enrollment seed (scenes e1–e7), through
// the product API as Morgan (one POST /auth/login; token in memory only).
// Prints PASS/FAIL per precondition. Never prints the password or the token.
import fs from 'node:fs'
import path from 'node:path'

const REPO = '/home/dream/dollaz'
const API = process.argv[2] || 'http://127.0.0.1:8000'
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'demo-video/seed-v4/out/structure.json'), 'utf8'))
const S = Object.fromEntries(manifest.schools.map((s) => [s.key, s]))
const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, 'demo-video/.env.capture.local'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let H
for (let i = 0; i < 6 && !H; i++) {
  const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: env.MORGAN_EMAIL, password: env.MORGAN_PASSWORD }) })
  if (res.status === 429) { await sleep(Number(res.headers.get('retry-after')) * 1000 || 15000); continue }
  const b = await res.json()
  if (!res.ok || !b.access_token) throw new Error(`login HTTP ${res.status}`)
  H = { authorization: `Bearer ${b.access_token}` }
}
const get = async (p) => {
  const r = await fetch(`${API}${p}`, { headers: H })
  if (!r.ok) throw new Error(`GET ${p} → ${r.status}`)
  return r.json()
}
let fails = 0
const check = (ok, label) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`) }
const val = (c) => (c && typeof c === 'object' ? (c.suppressed ? 'hidden' : c.value) : c)

const sa = S.aurelia.id
const periods = await get(`/schools/${sa}/periods`)
const fy = (y) => periods.filter((p) => p.periodEndDate === `${y}-06-30`)
check(periods[0]?.periodEndDate === '2027-06-30', `St. Aurelia periods[0] = FY27 (Enrollment page anchor): ${periods[0]?.label}`)
for (const y of [2023, 2024, 2025, 2026, 2027]) check(fy(y).length === 1, `St. Aurelia exactly one FY${y} period (${fy(y).map((p) => p.periodType).join(',') || 'none'})`)
const fy27 = fy(2027)[0], fy26 = fy(2026)[0]

const a = await get(`/schools/${sa}/enrollment/analytics?periodId=${fy27.id}`)
console.log(`      asOf ${a.asOf?.observedOn} (${a.asOf?.source}, stale ${a.asOf?.stale}) · period ${a.period?.label}`)
check(a.asOf?.source === 'roster' && a.asOf?.observedOn?.startsWith('2026-10'), 'live register reading, as of Oct 2026')
const tiles = Object.fromEntries(a.tiles.map((t) => [t.key, t]))
console.log(`      tiles: ${a.tiles.map((t) => `${t.key}=${t.value?.toFixed?.(3) ?? t.value} [${t.status}]`).join(' · ')}`)
check(tiles.enrollment_headcount?.value === 204, 'headcount tile 204')
check(tiles.enrollment_vs_plan?.status === 'watch', `vs-plan tile reads Watch (${tiles.enrollment_vs_plan?.value?.toFixed?.(3)})`)
check(a.trend.points.length === 5 && a.trend.points[0].observedOn.startsWith('2022-10'), `trend: ${a.trend.points.map((p) => `${p.observedOn.slice(0, 7)}=${p.total}`).join(' ')}`)
check(a.trend.planTotal === 213, `trend plan line ${a.trend.planTotal}`)
check(a.gradeByYear?.years?.length === 5, `grade×year grid years ${a.gradeByYear?.years?.join(',')}`)
const minCell = Math.min(...a.gradeByYear.cells.map((c) => (typeof val(c.count) === 'number' ? val(c.count) : 0)))
check(a.gradeByYear.cells.every((c) => typeof val(c.count) === 'number') && minCell >= 5, `every grade×year cell visible, min ${minCell}`)
const cs = a.cohortSize
const dirs = (cs?.cohorts ?? []).map((p) => `${p.label} ${p.startGrade}→${p.endGrade} ${p.direction}(${p.netChange})`)
console.log(`      cohorts: window ${cs?.window} (avail ${cs?.availableWindows}) · ${dirs.join(' · ')}`)
const dset = new Set((cs?.cohorts ?? []).map((p) => p.direction))
check((cs?.cohorts?.length ?? 0) >= 4 && dset.has('grew') && dset.has('held'), 'at least 4 cohort panels with grew + held')
const vp = a.vsPlan
console.log(`      vsPlan: ${JSON.stringify(vp?.rows?.[0] ?? null)} … totals ${JSON.stringify(vp?.totals ?? null)} · source ${vp?.planSource}`)
check(vp && (vp.rows ?? []).length === 11, 'vs-plan table has 11 grades')
const d = a.demographics
console.log(`      race ${JSON.stringify(d?.race?.rows ?? d?.race)}`.slice(0, 600))
const m = a.mix
console.log(`      mix status ${JSON.stringify(m?.status)} · flags ${JSON.stringify(m?.flags)} · new ${JSON.stringify(m?.newThisYear)} · dated ${JSON.stringify(m?.datedCoverage)}`)
check(m && val(m.flags.plan504) === 'hidden' && typeof val(m.flags.iep) === 'number' && typeof val(m.flags.ell) === 'number', 'support flags: 504 hidden, learning support + ELL shown')
console.log(`      notes:\n        - ${a.notes.join('\n        - ')}`)

for (const [label, p] of [['FY27', fy27], ['FY26', fy26]]) {
  const b = await get(`/schools/${sa}/periods/${p.id}/briefing`)
  const items = b.items ?? []
  const enr = items.filter((i) => i.source === 'enrollment')
  console.log(`      ${label} briefing (${items.length} items): ${items.map((i) => `[${i.source}] ${i.title}`).join(' | ')}`)
  for (const e of enr) console.log(`        enrollment why: ${e.why}`)
  check(enr.length >= 1, `${label} briefing carries the enrollment → tuition item`)
}

const fc = await get(`/schools/${sa}/periods/${fy27.id}/budget/forecast`).catch((e) => ({ err: e.message }))
console.log(`      FY27 forecast envelope: hasBudget ${fc.hasBudget} · feeder ${JSON.stringify(fc.feederEnrollmentByGrade ?? null)} · saved ${!!fc.forecast}`)
check(fc.hasBudget === true && !fc.forecast, 'FY27 budget present, no saved forecast (e7 starts clean)')

for (const k of ['cedar', 'mangrove', 'odile', 'heron', 'brightwater']) {
  const ps = await get(`/schools/${S[k].id}/periods`)
  const snaps = await get(`/schools/${S[k].id}/enrollment/snapshots`)
  console.log(`      ${S[k].name}: periods ${ps.map((p) => p.label).join(', ') || 'none'} · snapshots ${snaps.map((s) => `${s.observedOn.slice(0, 7)}=${s.totalEnrolled}`).join(' ')}`)
  if (k === 'brightwater') check(ps.length === 0 && snaps.length === 0, 'Brightwater still has zero periods and no enrollment')
  // Cedar Ridge's FY27 period is the finance loader's (its FY27 budget for f7).
  else if (k !== 'cedar') check(!ps.some((p) => p.periodEndDate === '2027-06-30'), `${S[k].name}: this loader created no FY27 period`)
}
console.log(fails ? `\n${fails} FAIL` : '\nall PASS')
process.exit(fails ? 1 : 0)

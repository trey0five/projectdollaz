#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// KYRO demo v4 — PER-SCENE RESET (storyboard §E, PLAN §5 "A reset").
//
// Puts back what a take changed, so every take starts from the same state.
// Logs in ONCE as the fictional demo user Morgan (POST /auth/login with the
// password from the gitignored demo-video/.env.capture.local; the token lives in
// memory only and is never printed or written) and changes data ONLY through the
// product routes the web app itself calls. No SQL. Local API (:8000) only.
//
// Usage: node reset-v4.mjs <scene> [<scene> …] [--dry-run] [--force]
//
//   brightwater  (alias f1 f2 f4)  BEFORE each f1 / f2 / f4-insert / f3 rehearsal.
//                Removes every Brightwater finance import (the product's DELETE —
//                one call clears the whole role slot and the period's statements),
//                then re-checks: no import, no statements, opening net assets back
//                on the files' own opening. Refuses once Brightwater has statements
//                unless --force: the f3 FINAL take is left in place (f6 guided, f8
//                all-schools and o1 read it).
//                Product limits (no API for either, so they are REPORTED, not fixed):
//                  • a period, once created, stays (an empty one is harmless);
//                  • account picks approved in the f3 review popup stay in the
//                    school's mapping, so a LATER take shows fewer than 5 accounts
//                    to check → rehearse f3 up to the popup, approve only on the
//                    final take.
//   e2           AFTER the e2 roster drop: clears Brightwater's roster (the register's
//                own "clear"), every enrollment import receipt and the snapshots.
//   e7-before    BEFORE the e7 take: stages St. Aurelia's FY 2027 for Planning. The
//                page opens on the newest year that holds numbers, so FY 2027 gets
//                its prior-year comparative (the FY 2026 trial balance, the same file
//                the intake's "Prior year" slot takes). No statements are generated
//                (home, briefing and the org roll-ups still read FY 2026). Also
//                clears any forecast autosave so the take starts in "Manual roster".
//   e7           AFTER every e7 take (even when "Save forecast" was never pressed —
//                "Roll forward from this year" autosaves): clears St. Aurelia's FY27
//                forecast and the feeder grid, and removes the FY27 comparative again
//                (HR & Staffing reads the hydrated year; x1 must see FY 2026).
//   f7           AFTER f7: removes the gift/adjustments the take added. A BUILT cash
//                forecast cannot be removed (no route) — f7's "Build your forecast"
//                beat is a ONE-TAKE scene; this reports whether it is still unbuilt.
//   f9           BEFORE f9: Cedar Ridge FY26 board report MD&A and variance notes
//                blank again ("Draft with AI", not "Regenerate").
//   o2           AFTER o2: deletes the gym-roof repair at St. Aurelia and undoes any
//                Studio action not yet undone (the log keeps an "Undone" row — film
//                the final take once, or crop the log to its newest row).
//   r2           AFTER r2: un-adopts any framework adopted on camera at Cedar Ridge
//                (Cedar stays Cognia 2025 only) and keeps the SACS CASI division.
//   r4           AFTER r4: runs load-accreditation.mjs --reset (evidence attached on
//                camera, improvement items, rubric scores back to the seed).
//   a1           BEFORE a1: dry-runs the network upload PREVIEW of the a1 file (no
//                commit) and fails if it would read as anything but a clean
//                "Save to 3 schools" (3 matched, 0 unmatched, no warnings, TerraNova).
//                TerraNova 2026 is already committed by load-academics.mjs (a2–a7
//                read it); the org import has no undo route and a re-commit is an
//                upsert of the same numbers, so the take needs no reset.
//   check        read-only: prints the state every reset above looks at.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const REPO = '/home/dream/dollaz'
const SEED = path.join(REPO, 'demo-video/seed-v4')
const API = 'http://127.0.0.1:8000'
const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')
const FORCE = argv.includes('--force')
const ALIAS = { f1: 'brightwater', f2: 'brightwater', f4: 'brightwater' }
const SCENES = argv.filter((a) => !a.startsWith('--')).map((a) => ALIAS[a] ?? a)
const KNOWN = ['brightwater', 'e2', 'e7-before', 'e7', 'f7', 'f9', 'o2', 'r2', 'r4', 'a1', 'check']
if (!SCENES.length || SCENES.some((s) => !KNOWN.includes(s))) {
  console.error(`usage: node reset-v4.mjs <${KNOWN.join('|')}> [more…] [--dry-run] [--force]`)
  process.exit(2)
}

const man = JSON.parse(fs.readFileSync(path.join(SEED, 'out/structure.json'), 'utf8'))
const S = Object.fromEntries(man.schools.map((s) => [s.key, s]))
const ORG = man.org.id
const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, 'demo-video/.env.capture.local'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
)
const log = (...a) => console.log(...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const fail = (msg) => {
  failures++
  log(`  ✗ ${msg}`)
}
const ok = (msg) => log(`  ✓ ${msg}`)
const note = (msg) => log(`  ! ${msg}`)

// ── auth: ONE login, token in memory only ────────────────────────────────────
let TOKEN = null
async function login() {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: env.MORGAN_EMAIL, password: env.MORGAN_PASSWORD }) })
    if (r.status === 429) {
      await sleep((Number(r.headers.get('retry-after')) || 20) * 1000)
      continue
    }
    const b = await r.json().catch(() => ({}))
    if (!r.ok || !b.access_token) throw new Error(`login failed (HTTP ${r.status})`)
    if (b.user?.email !== env.MORGAN_EMAIL) throw new Error('login returned a different user')
    return b.access_token
  }
  throw new Error('login rate-limited')
}
async function api(method, p, body, { allow = [] } = {}) {
  if (DRY && method !== 'GET') {
    log(`    (dry) ${method} ${p}`)
    return { dry: true }
  }
  for (let i = 0; i < 5; i++) {
    const r = await fetch(API + p, { method, headers: { authorization: `Bearer ${TOKEN}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined })
    if (r.status === 429) {
      await sleep((Number(r.headers.get('retry-after')) || 5) * 1000)
      continue
    }
    const t = await r.text()
    let j = null
    try {
      j = t ? JSON.parse(t) : null
    } catch {
      j = t
    }
    if (!r.ok && !allow.includes(r.status)) throw new Error(`${method} ${p} → ${r.status} ${JSON.stringify(j?.message ?? j).slice(0, 300)}`)
    return r.ok ? j : { status: r.status, body: j }
  }
  throw new Error(`${method} ${p} rate-limited`)
}
const get = (p) => api('GET', p)
const periodsOf = (key) => get(`/schools/${S[key].id}/periods`)
const byEnd = (list, fy) => (list ?? []).find((p) => String(p.periodEndDate).slice(0, 10) === `${fy}-06-30`)

// ── brightwater: the live finance upload (f1 / f2 / f4 insert / f3 rehearsal) ──
const BW_MAPPING_BASELINE = 227 // entriesCount of the default chart before any f3 approve
async function resetBrightwater() {
  log('▸ brightwater (f1 / f2 / f4 insert / f3 rehearsal)')
  const id = S.brightwater.id
  let periods = await periodsOf('brightwater')
  if (periods.some((p) => p.hasSnapshot) && !FORCE) {
    fail('Brightwater has statements — that is the f3 FINAL take (left in place for f6 guided, f8 and o1). Re-run with --force to clear it anyway.')
    return
  }
  let n = 0
  for (const p of periods) {
    const imps = await get(`/schools/${id}/periods/${p.id}/imports`)
    for (const imp of imps ?? []) {
      const r = await api('DELETE', `/schools/${id}/imports/${imp.id}`, undefined, { allow: [404] })
      if (r?.status !== 404) n++
    }
  }
  log(`  removed ${n} import(s)`)
  // Opening net assets back on the files' own opening (the intake autosaves this field).
  const { OPENING_NET_ASSETS } = await import('./finance-files.mjs')
  const rec = (await get('/schools')).find((s) => s.id === id)
  const want = { netAssetsBegin: OPENING_NET_ASSETS, pyNetAssetsBegin: OPENING_NET_ASSETS, auditNetAssetsBegin: OPENING_NET_ASSETS }
  if (Object.entries(want).some(([k, v]) => Number(rec?.[k]) !== v)) {
    await api('PATCH', `/schools/${id}`, want)
    log(`  opening net assets ← $${OPENING_NET_ASSETS.toLocaleString()}`)
  }
  // Re-check.
  periods = await periodsOf('brightwater')
  const busy = periods.filter((p) => p.hasSnapshot || p.roles?.cy || p.roles?.py || p.roles?.audit)
  if (DRY) note('dry run — re-check skipped')
  else if (busy.length) fail(`still holds data: ${busy.map((p) => p.label).join(', ')}`)
  else ok(`no imports, no statements${periods.length ? ` (${periods.length} empty period(s) stay — no route removes a period; the intake reuses it)` : ', zero periods'}`)
  const m = await get(`/schools/${id}/mapping`)
  if ((m?.entriesCount ?? 0) > BW_MAPPING_BASELINE)
    note(`mapping holds ${m.entriesCount - BW_MAPPING_BASELINE} account pick(s) from an earlier f3 approve — the review popup will ask about fewer than 5 accounts (no route removes a mapping entry)`)
  else ok('mapping at the default chart — the f3 popup will ask about all 5 accounts')
}

// ── e2: Brightwater roster drop ──────────────────────────────────────────────
async function resetE2() {
  log('▸ e2 (Brightwater roster drop)')
  const id = S.brightwater.id
  const st = await get(`/schools/${id}/enrollment/status`)
  if (st.studentCount > 0) {
    await api('DELETE', `/schools/${id}/enrollment/students`, { expectedCount: st.studentCount })
    log(`  roster cleared (${st.studentCount} students)`)
  }
  const imps = await get(`/schools/${id}/enrollment/imports`)
  for (const imp of Array.isArray(imps) ? imps : imps?.imports ?? []) {
    await api('DELETE', `/schools/${id}/enrollment/imports/${imp.id}`, undefined, { allow: [404] })
    log(`  import receipt removed (${imp.fileName ?? imp.id})`)
  }
  const snaps = await get(`/schools/${id}/enrollment/snapshots`)
  if ((Array.isArray(snaps) ? snaps : []).length || st.rosterMode !== 'none') {
    await api('DELETE', `/schools/${id}/enrollment?removeData=true`)
    log('  enrollment snapshots removed')
  }
  if (!DRY) {
    const after = await get(`/schools/${id}/enrollment/status`)
    const s2 = await get(`/schools/${id}/enrollment/snapshots`)
    if (after.studentCount === 0 && (Array.isArray(s2) ? s2.length : 0) === 0) ok(`Brightwater roster empty (mode ${after.rosterMode})`)
    else fail(`Brightwater still has ${after.studentCount} students / ${Array.isArray(s2) ? s2.length : '?'} snapshots`)
  }
}

// ── e7: St. Aurelia Planning (FY 2027) ───────────────────────────────────────
async function clearAureliaForecast(p27) {
  const id = S.aurelia.id
  const fc = await get(`/schools/${id}/periods/${p27.id}/budget/forecast`)
  if (fc?.forecast) {
    // PUT budget merges lines over the stored row; forecast:null is the only way the
    // product clears lines.forecast (spread, driver model, revenue/expense unchanged).
    const b = await get(`/schools/${id}/periods/${p27.id}/budget`)
    await api('PUT', `/schools/${id}/periods/${p27.id}/budget`, { lines: { ...(b.lines ?? {}), forecast: null } })
    log('  FY27 forecast autosave cleared')
  }
  const op = await get(`/schools/${id}/periods/${p27.id}/operational`)
  if (op?.feederEnrollmentByGrade && Object.keys(op.feederEnrollmentByGrade).length) {
    await api('PUT', `/schools/${id}/periods/${p27.id}/operational`, { feederEnrollmentByGrade: null })
    log('  FY27 feeder grid cleared')
  }
}
async function stageAureliaFy27(on) {
  const id = S.aurelia.id
  const periods = await periodsOf('aurelia')
  const p27 = byEnd(periods, 2027)
  if (!p27) return fail('St. Aurelia has no FY 2027 period')
  await clearAureliaForecast(p27)
  const imps = (await get(`/schools/${id}/periods/${p27.id}/imports`)) ?? []
  const py = imps.filter((i) => i.role === 'py')
  if (on && !py.length) {
    const ing = await import(path.join(REPO, 'packages/ingestion/dist/index.js'))
    const file = path.join(SEED, 'out/finance-files/aurelia/Trial Balance FY2026.xlsx')
    const buf = fs.readFileSync(file)
    const res = ing.ingest(path.basename(file), buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    if (res.metadata?.periodEndDate !== '2026-06-30') return fail(`${path.basename(file)} reads as ${res.metadata?.periodEndDate}`)
    await api('POST', `/schools/${id}/imports`, { role: 'py', periodEndDate: '2027-06-30', periodType: 'fy', sourceName: path.basename(file), rows: res.rows, metadata: res.metadata })
    log(`  FY 2027 prior-year comparative ← ${path.basename(file)} (${res.rows.length} accounts; no statements generated)`)
  }
  if (!on) for (const i of py) {
    await api('DELETE', `/schools/${id}/imports/${i.id}`, undefined, { allow: [404] })
    log('  FY 2027 prior-year comparative removed')
  }
  if (DRY) return
  const after = byEnd(await periodsOf('aurelia'), 2027)
  const fc = await get(`/schools/${id}/periods/${after.id}/budget/forecast`)
  if (fc.forecast) fail('FY27 forecast still saved')
  else if (!fc.hasBudget) fail('FY27 budget missing (load-enrollment.mjs saves it)')
  else ok('FY27 budget on file, no saved forecast')
  if (after.hasSnapshot) fail('FY 2027 has statements — home and the org roll-ups would move off FY 2026')
  if (on) after.roles?.py ? ok('Planning will open on FY 2027 (it holds the prior-year comparative)') : fail('FY 2027 comparative missing')
  else !after.roles?.py ? ok('FY 2027 holds nothing — Planning / HR open on FY 2026 again') : fail('FY 2027 comparative still there')
}

// ── f7: Cedar Ridge cash forecast ────────────────────────────────────────────
const CEDAR_COMMITMENTS = ['Building note — principal & interest', 'Faculty & staff payroll', 'HVAC replacement — accepted bid', 'Science wing — final construction draw']
async function resetF7() {
  log('▸ f7 (Cedar Ridge cash forecast)')
  const id = S.cedar.id
  const adj = await get(`/schools/${id}/cash-flow/adjustments`)
  for (const a of Array.isArray(adj) ? adj : adj?.adjustments ?? []) {
    await api('DELETE', `/schools/${id}/cash-flow/adjustments/${a.id}`)
    log(`  adjustment removed (${a.label ?? a.sourceRef ?? a.id})`)
  }
  const cm = await get(`/schools/${id}/cash-flow/commitments`)
  for (const c of Array.isArray(cm) ? cm : cm?.commitments ?? []) {
    if (CEDAR_COMMITMENTS.includes(c.label)) continue
    await api('DELETE', `/schools/${id}/cash-flow/commitments/${c.id}`)
    log(`  commitment added on camera removed (${c.label})`)
  }
  const op = await get(`/schools/${id}/cash-flow/opening`)
  if (op.openingCash == null) ok('Cedar Ridge cash forecast still unbuilt — "Build your forecast" will show')
  else fail(`a cash forecast is already BUILT (opening $${Number(op.openingCash).toLocaleString()}) — no route removes it; the page now rebuilds it on open, so the "Build your forecast" beat cannot be re-filmed`)
}

// ── f9: Cedar Ridge board report ─────────────────────────────────────────────
async function resetF9() {
  log('▸ f9 (Cedar Ridge FY26 board report)')
  const id = S.cedar.id
  const p = byEnd(await periodsOf('cedar'), 2026)
  const b = await get(`/schools/${id}/periods/${p.id}/board-report`)
  const notes = JSON.stringify(b?.explanations ?? b?.variance?.explanations ?? {})
  if (b?.mda?.text || /"[^"]+":"[^"]+"/.test(notes)) {
    await api('PUT', `/schools/${id}/periods/${p.id}/board-report`, { mdaText: null, explanations: null })
    log('  MD&A and variance notes cleared')
  }
  if (!DRY) {
    const a = await get(`/schools/${id}/periods/${p.id}/board-report`)
    a?.mda?.text ? fail('MD&A still filled') : ok('MD&A blank — the button reads "Draft with AI"')
  }
}

// ── o2: KYRO Studio action ───────────────────────────────────────────────────
async function resetO2() {
  log('▸ o2 (KYRO Studio action at St. Aurelia)')
  const id = S.aurelia.id
  const act = await get(`/schools/${id}/assistant/activity`)
  for (const a of Array.isArray(act) ? act : []) {
    if (a.undone || !a.reversible) continue
    await api('POST', `/schools/${id}/assistant/activity/${a.id}/undo`, {})
    log(`  undone: ${a.summary || a.tool}`)
  }
  const items = (await get(`/schools/${id}/facilities/maintenance`)).items ?? []
  for (const it of items) {
    if (!(/gym/i.test(it.title) && /roof/i.test(it.title))) continue
    await api('DELETE', `/schools/${id}/facilities/maintenance/${it.id}`, undefined, { allow: [404] })
    log(`  repair removed: ${it.title}`)
  }
  const after = DRY ? [] : await get(`/schools/${id}/assistant/activity`)
  if ((after ?? []).length) note(`the action log keeps ${after.length} row(s), now marked Undone — no route removes a log row; crop the log to the newest row or film o2 once`)
  else ok('Studio action log empty')
}

// ── r2: framework adoption ───────────────────────────────────────────────────
async function resetR2() {
  log('▸ r2 (frameworks at Cedar Ridge)')
  const base = `/schools/${S.cedar.id}/accreditation/frameworks`
  const fws = (await get(base)).frameworks ?? []
  for (const f of fws.filter((x) => x.adopted && x.code !== 'cognia_2025')) {
    await api('DELETE', `${base}/${f.code}`)
    log(`  un-adopted ${f.code}`)
  }
  const cog = fws.find((f) => f.code === 'cognia_2025')
  if (cog && cog.division !== 'sacs_casi') {
    await api('PATCH', `${base}/cognia_2025/profile`, { division: 'sacs_casi' })
    log('  Cognia division ← SACS CASI')
  }
  if (!DRY) {
    const after = (await get(base)).frameworks ?? []
    const adopted = after.filter((f) => f.adopted).map((f) => f.code)
    adopted.length === 1 && adopted[0] === 'cognia_2025' ? ok('Cedar Ridge on Cognia 2025 only (SACS CASI)') : fail(`adopted: ${adopted.join(', ')}`)
  }
}

// ── r4: delegated to the accreditation loader's own reset ────────────────────
function resetR4() {
  log('▸ r4 (load-accreditation.mjs --reset)')
  if (DRY) return note('dry run — not run')
  execFileSync('node', [path.join(SEED, 'load-accreditation.mjs'), '--reset', '--only', 'accreditation'], { stdio: 'inherit' })
}

// ── a1: dry-run the network upload preview ───────────────────────────────────
async function checkA1() {
  log('▸ a1 (network TerraNova 2026 preview — no commit)')
  const file = path.join(REPO, 'demo-video/assets/v4-files/bayview-terranova-2026-results.csv')
  const fd = new FormData()
  fd.append('file', new Blob([fs.readFileSync(file, 'utf8')], { type: 'text/csv' }), path.basename(file))
  // Exactly as the web panel's first drop: no testType, PREVIEW route only.
  const r = await fetch(`${API}/organizations/${ORG}/academics/assessments/upload`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: fd })
  const p = await r.json().catch(() => ({}))
  if (!r.ok) return fail(`preview HTTP ${r.status}`)
  const od = await get(`/organizations/${ORG}/academics/dashboard`)
  const committed = (od.context?.years ?? []).includes(2026)
  log(`  preview: ${p.testType} · years ${(p.years ?? []).join(',')} · ${p.rows} rows · ${p.matched} matched / ${p.unmatched} unmatched · warnings ${JSON.stringify(p.warnings ?? [])}`)
  log(`  TerraNova 2026 already committed network-wide: ${committed ? 'yes' : 'no'}`)
  if (p.testType === 'terranova' && p.matched === 3 && p.unmatched === 0 && !(p.warnings ?? []).length)
    ok('reads as a clean "Save to 3 schools" — the preview has no replace/duplicate notice; the commit re-upserts the same numbers, so the a1 take needs no reset')
  else fail('the preview is not a clean "Save to 3 schools" — do not film a1 until this is fixed')
}

// ── check: read-only state report ────────────────────────────────────────────
async function check() {
  log('▸ check (read-only)')
  const bw = await periodsOf('brightwater')
  log(`  Brightwater: ${bw.length} period(s); statements ${bw.some((p) => p.hasSnapshot) ? 'YES (f3 final take in place?)' : 'none'}`)
  const st = await get(`/schools/${S.brightwater.id}/enrollment/status`)
  log(`  Brightwater roster: ${st.studentCount} students (${st.rosterMode})`)
  const a27 = byEnd(await periodsOf('aurelia'), 2027)
  const fc = await get(`/schools/${S.aurelia.id}/periods/${a27.id}/budget/forecast`)
  log(`  St. Aurelia FY27: comparative ${a27.roles?.py ? 'STAGED (e7)' : 'not staged'}; forecast ${fc.forecast ? 'SAVED' : 'none'}`)
  const op = await get(`/schools/${S.cedar.id}/cash-flow/opening`)
  log(`  Cedar Ridge cash forecast: ${op.openingCash == null ? 'unbuilt' : 'BUILT'}`)
  const act = await get(`/schools/${S.aurelia.id}/assistant/activity`)
  log(`  St. Aurelia Studio log: ${(act ?? []).length} row(s)`)
}

TOKEN = await login()
log(`logged in as the demo user (token in memory only)${DRY ? ' · DRY RUN' : ''}`)
for (const s of SCENES) {
  if (s === 'brightwater') await resetBrightwater()
  if (s === 'e2') await resetE2()
  if (s === 'e7-before') {
    log('▸ e7-before (stage St. Aurelia FY 2027 for Planning)')
    await stageAureliaFy27(true)
  }
  if (s === 'e7') {
    log('▸ e7 (after the take: clear the forecast autosave, un-stage FY 2027)')
    await stageAureliaFy27(false)
  }
  if (s === 'f7') await resetF7()
  if (s === 'f9') await resetF9()
  if (s === 'o2') await resetO2()
  if (s === 'r2') await resetR2()
  if (s === 'r4') resetR4()
  if (s === 'a1') await checkA1()
  if (s === 'check') await check()
}
log(failures ? `\n${failures} problem(s)` : '\nreset done')
process.exit(failures ? 1 : 0)

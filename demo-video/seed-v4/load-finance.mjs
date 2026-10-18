#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// KYRO demo v4 — FINANCE content loader for the fictional Bayview Catholic
// Schools network (storyboard §E Finance, f1–f10).
//
// Logs in ONCE as the demo user Morgan (POST /auth/login with the password from
// the gitignored demo-video/.env.capture.local; the token lives in memory only,
// never on disk) and loads everything through the same product routes the web
// app calls — the global ValidationPipe is forbidNonWhitelisted, so every body
// below carries only whitelisted DTO fields. No SQL, no token minting.
//
// What it loads (check-before-create everywhere; a re-run converges):
//   • account mapping      PATCH /schools/:id/mapping — the 4-digit chart, once,
//                          BEFORE the first upload (a PATCH re-generates every
//                          period, so it never runs again once a school has data)
//   • trial balances       real .xlsx files written to seed-v4/out/finance-files/,
//                          read by the BUILT @finrep/ingestion ingest() exactly as
//                          the browser does, then period create-or-get → import →
//                          statements generate, oldest year first, with the
//                          school's opening net assets set (PATCH /schools/:id) to
//                          each year's opening first — the same field the intake's
//                          "Opening net assets" autosaves.
//                          FY22–FY26 for all five reporting schools (equal-length
//                          histories, so the network trend charts line up and the
//                          bar race has five years); Brightwater: NOTHING
//                          (the live f1–f3 upload starts from empty).
//                          Cedar Ridge FY26 = this year + prior year + the audited
//                          FY25 close, then a corrected re-upload of this year →
//                          2 versions of the FY26 statements.
//   • operational          financial aid + students on aid per year (enrollment is
//                          only filled where nobody has recorded one)
//   • budgets              FY26 budget spread (monthly) for every reporting school,
//                          FY27 spread for Cedar Ridge (cash-forecast phasing)
//   • month-ends           Cedar Ridge Jul 2025–Jun 2026 (board report Monthly +
//                          the forecast's "moderate" tier)
//   • board schedules      Cedar Ridge FY26 capital / cash & investments / campaign
//   • cash                 assumptions (first billing date) at Cedar Ridge and St.
//                          Aurelia, 4 commitments at Cedar Ridge + 3 at St. Aurelia, ONE built forecast
//                          at St. Aurelia (s3); Cedar Ridge's is left unbuilt (f7)
//   • f6 "What moved"      Cedar Ridge's FY26 budget plans Development and Facilities
//                          12% away from actual (offset on the same side, so the
//                          $523K → $435K waterfall is unchanged); re-imported when
//                          the stored budget differs
//   • openings             opening net assets on all six school records where 0
//                          (Brightwater: the files' own opening, before the f3 take)
//   • r5 forecast          Cedar Ridge FY26 year-end forecast (Planning's saved
//                          forecast at the year's actuals) for "Forecast vs Budget"
//   • advancement          a Cedar Ridge capital campaign with an April pledge
//                          (only when Cedar Ridge has no capital campaign yet)
//   • compliance (f10)     St. Aurelia FY26 scholarship intake + a disbursement file
//                          keyed by student ref only (no names)
//   • insight cache        warmed for Cedar Ridge FY26/FY25 and St. Aurelia FY26
//   • Brightwater files    regenerated + checked (finance-files.mjs) — never uploaded
//
// Usage: node load-finance.mjs [--api=http://127.0.0.1:8000] [--dry-run] [--no-insights] [--rebudget] [--reload=key,…]
//   --reload deletes that school's finance imports (product DELETE) and loads it again.
//   --remonthly deletes Cedar Ridge's month-end TBs (product DELETE) and uploads them again.
//   --rebudget re-imports the FY26 budget spreads (an upsert of the same budget).
// Never prints the password or the token.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  CHART,
  MAPPING_ENTRIES,
  SCHOOLS as MODEL,
  buildSchool,
  vitals,
  tbGrid,
  budgetAccounts,
  spreadGrid,
  monthlyTbs,
  MONTHS_FY,
} from './finance-model.mjs'

const REPO = '/home/dream/dollaz'
const SEED = path.join(REPO, 'demo-video/seed-v4')
const OUT = path.join(SEED, 'out')
const FILES = path.join(OUT, 'finance-files')
const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const val = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const API = val('api', 'http://127.0.0.1:8000')
const DRY = flag('dry-run')
const WARM = !flag('no-insights')
const RELOAD = (val('reload', '') || '').split(',').filter(Boolean)

const require = createRequire(path.join(REPO, 'packages/ingestion/package.json'))
const XLSX = require('xlsx')
const ing = await import(path.join(REPO, 'packages/ingestion/dist/index.js'))

const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'structure.json'), 'utf8'))
const S = Object.fromEntries(manifest.schools.map((s) => [s.key, s]))
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(REPO, 'demo-video/.env.capture.local'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
)

const log = (...a) => console.log(...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100
const today = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

// ── Auth: ONE login per run, token in memory only ────────────────────────────
async function login() {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: env.MORGAN_EMAIL, password: env.MORGAN_PASSWORD }),
    })
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 20000
      log(`login 429 — backing off ${wait / 1000}s`)
      await sleep(wait)
      continue
    }
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`login HTTP ${res.status} ${body.code ?? ''} ${body.message ?? ''}`)
    if (body.mfa_required) throw new Error('login asked for MFA — Morgan must not have MFA')
    if (!body.access_token) throw new Error('login returned no access_token')
    if (body.user?.email !== env.MORGAN_EMAIL) throw new Error('login returned a different user')
    return body.access_token
  }
  throw new Error('login rate-limited 6 times')
}
let TOKEN = null
const WRITES = []
async function api(method, p, body, { allow = [] } = {}) {
  if (DRY && method !== 'GET') {
    WRITES.push(`${method} ${p}`)
    return { dry: true }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${API}${p}`, {
      method,
      headers: { authorization: `Bearer ${TOKEN}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 5000
      await sleep(wait)
      continue
    }
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = text
    }
    if (!res.ok && !allow.includes(res.status)) {
      const msg = typeof json === 'object' && json ? JSON.stringify(json.message ?? json).slice(0, 400) : String(text).slice(0, 400)
      throw new Error(`${method} ${p} → ${res.status} ${msg}`)
    }
    if (method !== 'GET') WRITES.push(`${method} ${p} → ${res.status}`)
    return res.ok ? json : { status: res.status, body: json }
  }
  throw new Error(`${method} ${p} rate-limited 5 times`)
}

// ── Files: write a real workbook, read it back with the BUILT parser ─────────
const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
function writeXlsx(file, grid, sheet, widths) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(grid, { cellDates: true })
  ws['!cols'] = widths.map((w) => ({ wch: w }))
  for (const k of Object.keys(ws)) if (!k.startsWith('!') && typeof ws[k].v === 'number') ws[k].z = '#,##0.00;-#,##0.00'
  XLSX.utils.book_append_sheet(wb, ws, sheet)
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, buf)
  return buf
}
function readTb(file, buf, expectRows, expectEnd) {
  const res = ing.ingest(path.basename(file), ab(buf))
  const got = new Map(res.rows.map((r) => [r.acct, r2(r.total)]))
  for (const r of expectRows) {
    if (got.get(r.acct) !== r2(r.total)) throw new Error(`${path.basename(file)}: acct ${r.acct} read ${got.get(r.acct)} want ${r2(r.total)}`)
  }
  if (res.rows.length !== expectRows.length) throw new Error(`${path.basename(file)}: ${res.rows.length} rows read, ${expectRows.length} written`)
  if (res.metadata?.periodEndDate !== expectEnd) throw new Error(`${path.basename(file)}: period end ${res.metadata?.periodEndDate} want ${expectEnd}`)
  const per = ing.inferPeriod(res.metadata)
  return { rows: res.rows, metadata: res.metadata ?? {}, periodType: per.periodType }
}

// ── Model helpers ────────────────────────────────────────────────────────────
const FINANCE_SCHOOLS = ['cedar', 'aurelia', 'mangrove', 'odile', 'heron']
const fyEnd = (fy) => `${fy}-06-30`
const byEnd = (periods, fy) => periods.find((p) => String(p.periodEndDate).slice(0, 10) === fyEnd(fy))

// The FY26 Cedar Ridge variants: this year as first uploaded (a late
// re-enrollment fee batch not yet posted) and corrected; plus the AUDITED
// prior-year-end trial balance — the product's "Audited FY end" column is the
// audited close of the year BEFORE (the SCF and the net-assets roll read it as
// the opening position). The audit only reclassifies, so audited FY25 net
// assets equal FY26's opening.
const LATE_FEES = 46800
function cedarVariants(year, prevYear) {
  const corrected = year.tb.map((r) => ({ ...r }))
  const original = corrected.map((r) =>
    r.acct === 4020 ? { ...r, total: r2(r.total + LATE_FEES) } : r.acct === 1200 ? { ...r, total: r2(r.total - LATE_FEES) } : { ...r },
  )
  const audit = prevYear.tb.map((r) => {
    if (r.acct === 6110) return { ...r, total: r2(r.total - 14200) } // audit fee accrual reclassed to office
    if (r.acct === 6100) return { ...r, total: r2(r.total + 14200) }
    if (r.acct === 2100) return { ...r, total: r2(r.total + 9600) } // payroll liability reclassed to payables
    if (r.acct === 2010) return { ...r, total: r2(r.total - 9600) }
    return { ...r }
  })
  for (const [n, rows] of Object.entries({ original, audit })) {
    const s = r2(rows.reduce((a, r) => a + r.total, 0))
    if (Math.abs(s) > 0.005) throw new Error(`cedar ${n} out of balance ${s}`)
  }
  return { original, corrected, audit }
}

// ── 0. --reload=<key,…>: remove a school's finance imports so it reloads clean ─
// Uses the product's own DELETE (which clears each period's statements once no
// current-year file remains). Never touches Brightwater.
async function clearSchoolImports(key) {
  if (key === 'brightwater') throw new Error('refusing to touch Brightwater')
  const school = S[key]
  const periods = await api('GET', `/schools/${school.id}/periods`)
  let n = 0
  for (const p of periods ?? []) {
    const imps = await api('GET', `/schools/${school.id}/periods/${p.id}/imports`)
    for (const imp of imps ?? []) {
      // A DELETE clears the whole role slot of that period, so a superseded
      // import of the same role is already gone (404) — that is fine.
      const r = await api('DELETE', `/schools/${school.id}/imports/${imp.id}`, undefined, { allow: [404] })
      if (r?.status !== 404) n++
    }
  }
  log(`  ${school.name}: --reload — ${n} import(s) removed`)
}

// ── 1. Trial balances ────────────────────────────────────────────────────────
async function loadTrialBalances(key, report) {
  const school = S[key]
  const cfg = MODEL[key]
  const fys = Object.keys(cfg.years).map(Number).sort()
  if (RELOAD.includes(key)) await clearSchoolImports(key)
  let periods = await api('GET', `/schools/${school.id}/periods`)
  // Enrollment from the school's own operational record (another loader owns it).
  const enrollment = {}
  for (const fy of fys) {
    const p = byEnd(periods, fy)
    if (!p) continue
    const op = await api('GET', `/schools/${school.id}/periods/${p.id}/operational`, undefined, { allow: [404] })
    if (op && typeof op.enrollment === 'number' && op.enrollment > 0) enrollment[fy] = op.enrollment
  }
  const book = buildSchool(key, enrollment)
  const hasCy = (fy) => !!byEnd(periods, fy)?.roles?.cy
  const anyImports = periods.some((p) => p.roles?.cy || p.roles?.py || p.roles?.audit)
  const todo = fys.filter((fy) => !hasCy(fy))
  report.schools[key] = { name: school.name, years: {}, enrollmentFrom: Object.keys(enrollment).length ? 'operational record' : 'model' }

  if (todo.length && !anyImports) {
    const r = await api('PATCH', `/schools/${school.id}/mapping`, { entries: MAPPING_ENTRIES })
    log(`  ${school.name}: mapping — ${Object.keys(MAPPING_ENTRIES).length} accounts (${r?.merged ?? '?'} merged)`)
  } else if (todo.length) {
    log(`  ${school.name}: has imports already — mapping left alone (a PATCH would re-generate every year)`)
  }

  for (const fy of fys) {
    const y = book[fy]
    const prev = book[fy - 1]
    report.schools[key].years[fy] = { ...vitals(y), naOpen: y.naOpen, naEnd: y.naEnd, cash: y.cash, enrollment: y.act.enr, aid: y.act.aid }
    if (!todo.includes(fy)) continue
    const dir = path.join(FILES, key)
    const isCedar26 = key === 'cedar' && fy === 2026
    const v = isCedar26 ? cedarVariants(y, prev) : null
    const cyRows = isCedar26 ? v.original : y.tb
    const cyFile = path.join(dir, `Trial Balance FY${fy}.xlsx`)
    const cy = readTb(cyFile, writeXlsx(cyFile, tbGrid(school.name, fy, cyRows), 'Trial Balance', [12, 44, 16, 16]), cyRows, fyEnd(fy))
    // Opening net assets for the columns this generate will compute.
    await api('PATCH', `/schools/${school.id}`, {
      netAssetsBegin: r2(y.naOpen),
      pyNetAssetsBegin: r2(prev ? prev.naOpen : y.naOpen),
      auditNetAssetsBegin: r2(isCedar26 ? prev.naOpen : y.naOpen),
    })
    const period = await api('POST', `/schools/${school.id}/periods`, { periodEndDate: fyEnd(fy), periodType: cy.periodType })
    const imports = [{ role: 'cy', file: cyFile, read: cy }]
    if (isCedar26) {
      const pyFile = path.join(dir, `Trial Balance FY${fy - 1} (prior year).xlsx`)
      imports.push({ role: 'py', file: pyFile, read: readTb(pyFile, writeXlsx(pyFile, tbGrid(school.name, fy - 1, prev.tb), 'Trial Balance', [12, 44, 16, 16]), prev.tb, fyEnd(fy - 1)) })
      const auFile = path.join(dir, `Audited Trial Balance FY${fy - 1}.xlsx`)
      imports.push({ role: 'audit', file: auFile, read: readTb(auFile, writeXlsx(auFile, tbGrid(school.name, fy - 1, v.audit, { note: 'Audited' }), 'Trial Balance', [12, 44, 16, 16]), v.audit, fyEnd(fy - 1)) })
    }
    for (const imp of imports) {
      await api('POST', `/schools/${school.id}/imports`, {
        role: imp.role,
        periodEndDate: fyEnd(fy),
        periodType: cy.periodType,
        sourceName: path.basename(imp.file),
        rows: imp.read.rows,
        metadata: imp.read.metadata,
      })
    }
    const snap = await api('POST', `/schools/${school.id}/periods/${period?.id}/statements`, {})
    log(`  ${school.name}: FY${fy} — ${imports.map((i) => i.role).join('+')} (${cy.rows.length} accounts) → snapshot ${snap?.id ? 'saved' : '?'}`)
    if (isCedar26) {
      // The corrected re-upload: same period, a NEW import (append-only), a 2nd version.
      const fixFile = path.join(dir, `Trial Balance FY${fy} (final).xlsx`)
      const fix = readTb(fixFile, writeXlsx(fixFile, tbGrid(school.name, fy, v.corrected), 'Trial Balance', [12, 44, 16, 16]), v.corrected, fyEnd(fy))
      await api('POST', `/schools/${school.id}/imports`, {
        role: 'cy',
        periodEndDate: fyEnd(fy),
        periodType: fix.periodType,
        sourceName: path.basename(fixFile),
        rows: fix.rows,
        metadata: fix.metadata,
      })
      await api('POST', `/schools/${school.id}/periods/${period?.id}/statements`, {})
      log(`  ${school.name}: FY${fy} — corrected re-upload (+$${LATE_FEES.toLocaleString()} re-enrollment fees) → 2nd version`)
    }
  }
  // Leave the school's openings on the latest year (what the intake would show).
  const last = book[fys[fys.length - 1]]
  const lastPrev = book[fys[fys.length - 2]]
  if (todo.length) {
    await api('PATCH', `/schools/${school.id}`, {
      netAssetsBegin: r2(last.naOpen),
      pyNetAssetsBegin: r2(lastPrev ? lastPrev.naOpen : last.naOpen),
      auditNetAssetsBegin: r2(key === 'cedar' && lastPrev ? lastPrev.naOpen : last.naOpen),
    })
  }
  if (!todo.length) log(`  ${school.name}: FY${fys[0]}–FY${fys[fys.length - 1]} already loaded — skipped`)
  periods = await api('GET', `/schools/${school.id}/periods`)
  return { book, periods }
}

// ── 2. Operational: aid (and enrollment only where none is on file) ──────────
const AID_SHARE = { cedar: 0.33, aurelia: 0.29, mangrove: 0.38, odile: 0.31, heron: 0.24 }
async function loadOperational(key, book, periods) {
  const school = S[key]
  for (const [fy, y] of Object.entries(book)) {
    const p = byEnd(periods, Number(fy))
    if (!p || DRY) continue
    const op = (await api('GET', `/schools/${school.id}/periods/${p.id}/operational`, undefined, { allow: [404] })) ?? {}
    const body = {}
    if (op.enrollment == null) body.enrollment = y.act.enr
    if (op.financialAidTotal == null) body.financialAidTotal = r2(y.act.aid)
    if (op.studentsOnAid == null) body.studentsOnAid = Math.round(y.act.enr * AID_SHARE[key])
    if (Object.keys(body).length) {
      await api('PUT', `/schools/${school.id}/periods/${p.id}/operational`, body)
      log(`  ${school.name}: FY${fy} operational ← ${Object.keys(body).join(', ')}`)
    }
  }
}

// ── 3. Budgets (monthly spread workbooks → parseBudgetSpread → PUT spread) ────
// Budget-vs-actual variance: income came in a little under plan (enrollment was
// budgeted higher), spending a little under too — "a modest variance".
const VARIANCE = {
  cedar: { revAdj: { 4010: 1.018, 4100: 1.06, 4110: 0.96, 4310: 1.08 }, expAdj: { 5010: 1.021, 6010: 1.015, 7110: 0.86, 7100: 1.04, 8010: 1.03, 5110: 1.09 } },
  aurelia: { revAdj: { 4010: 1.01, 4100: 0.97, 4200: 1.0 }, expAdj: { 5010: 1.012, 7110: 0.92, 8010: 1.02 } },
  mangrove: { revAdj: { 4010: 1.035, 4100: 1.08 }, expAdj: { 5010: 0.99, 7110: 0.9, 8010: 1.0 } },
  odile: { revAdj: { 4010: 1.04, 4100: 1.1 }, expAdj: { 5010: 0.985, 7110: 0.88 } },
  heron: { revAdj: { 4010: 0.99, 4100: 1.02 }, expAdj: { 5010: 1.01, 7110: 0.95 } },
}
async function putSpread(key, period, fy, accounts, label) {
  const school = S[key]
  const file = path.join(FILES, key, `${label}.xlsx`)
  const buf = writeXlsx(file, spreadGrid(school.name, fy, accounts), 'Budget Spread', [8, 40, ...Array(12).fill(12), 14])
  const spread = ing.parseBudgetSpread(ab(buf))
  if (spread.accounts.length !== accounts.length) throw new Error(`${label}: spread read ${spread.accounts.length} accounts, wrote ${accounts.length}`)
  if (spread.fiscalYearStart !== MONTHS_FY(fy)[0]) throw new Error(`${label}: spread starts ${spread.fiscalYearStart}`)
  const res = await api('PUT', `/schools/${school.id}/periods/${period.id}/budget/spread`, { spread, fileName: path.basename(file) })
  if (!DRY && res?.unmappedAccts?.length) throw new Error(`${label}: unmapped ${res.unmappedAccts}`)
  log(`  ${school.name}: FY${fy} budget spread — ${spread.accounts.length} accounts, revenue ${Math.round(res?.totalRevenue ?? 0).toLocaleString()} / expenses ${Math.round(res?.totalExpenses ?? 0).toLocaleString()}`)
}
// Where each school lands against its own FY26 budget (actual net − budget net):
// Cedar Ridge a little behind (the "Behind plan" card + the f6 waterfall), St.
// Aurelia a little ahead (its Finance band reads all clear).
const AGAINST_BUDGET = { cedar: -88000, aurelia: 36500, mangrove: -61000, odile: -42000, heron: 24500 }
function fy26Budget(key, act) {
  // Every line moves a little (deterministic), plus the named swings above.
  const wobble = (a, k) => 1 + 0.024 * Math.sin(a * k)
  const revAdj = {}
  const expAdj = {}
  for (const [a, , , sec] of CHART) {
    if (sec === 'rev') revAdj[a] = VARIANCE[key].revAdj[a] ?? wobble(a, 1.7)
    if (sec === 'exp') expAdj[a] = VARIANCE[key].expAdj[a] ?? wobble(a, 1.3)
  }
  const accts = budgetAccounts(act, { revAdj, expAdj })
  const net = accts.reduce((s, a) => s + (a.acct < 5000 ? a.annual : -a.annual), 0)
  // Settle the gap on the tuition line so actual − budget lands where intended.
  const fix = Math.round(act.net - AGAINST_BUDGET[key] - net)
  const t = accts.find((a) => a.acct === 4010)
  t.annual += fix
  const per = Math.round(fix / 10)
  for (let i = 1; i <= 10; i++) t.months[i] += per
  t.months[11] += fix - per * 10
  if (WHAT_MOVED[key]) whatMoved(key, act, accts)
  return accts
}

// f6 "What moved": the Budget vs. Actual tiles list only lines more than 10% off
// budget, so Cedar Ridge's FY26 budget plans two lines >10% away from where they
// landed — Development (the annual fund came in short) and Facilities (repairs
// deferred). Each move is taken from a big line ON THE SAME SIDE (tuition,
// faculty salaries), so budgeted revenue, budgeted spending and the net — the
// whole f6 waterfall, plan $523K → actual $435K — are exactly unchanged.
const WHAT_MOVED = {
  cedar: [
    // [statement line accounts (actual group), add-to account, take-from account, actual ÷ budget]
    { group: [4100, 4110, 4120], side: 'rev', to: 4100, from: 4010, ratio: 0.88 },
    { group: [7010, 7100, 7110, 7120], side: 'exp', to: 7110, from: 5010, ratio: 0.88 },
  ],
}
function shiftMonths(acc, delta) {
  // Spread a dollar change over an account's months in proportion to its own phasing.
  const tot = acc.months.reduce((s, v) => s + v, 0) || 1
  const add = acc.months.map((m) => Math.round((delta * m) / tot))
  add[11] += delta - add.reduce((s, v) => s + v, 0)
  acc.months = acc.months.map((m, i) => m + add[i])
  acc.annual += delta
}
function whatMoved(key, act, accts) {
  for (const m of WHAT_MOVED[key]) {
    const src = m.side === 'rev' ? act.rev : act.exp
    const actual = m.group.reduce((s, a) => s + (src[a] ?? 0), 0)
    const budget = m.group.reduce((s, a) => s + (accts.find((x) => x.acct === a)?.annual ?? 0), 0)
    const delta = Math.round(actual / m.ratio - budget)
    if (delta <= 0) continue
    shiftMonths(accts.find((x) => x.acct === m.to), delta)
    shiftMonths(accts.find((x) => x.acct === m.from), -delta)
  }
}
// The stored budget equals the wanted one (same accounts, same annual amounts)?
function sameSpread(stored, want) {
  const have = new Map((stored?.accounts ?? []).map((a) => [Number(a.acct), Math.round(Number(a.annual))]))
  return have.size === want.length && want.every((a) => have.get(a.acct) === Math.round(a.annual))
}
async function loadBudgets(key, book, periods) {
  const school = S[key]
  const p26 = byEnd(periods, 2026)
  if (p26) {
    const b = DRY ? null : await api('GET', `/schools/${school.id}/periods/${p26.id}/budget`)
    const want26 = fy26Budget(key, book[2026].act)
    if (!b?.lines?.spread || flag('rebudget')) await putSpread(key, p26, 2026, want26, `Operating Budget FY2026`)
    else if (WHAT_MOVED[key] && !sameSpread(b.lines.spread, want26)) {
      // The f6 "What moved" lines changed since this budget was loaded — re-import
      // the same totals with the two moved lines (an upsert of the period's budget).
      await putSpread(key, p26, 2026, want26, `Operating Budget FY2026`)
      log(`  ${school.name}: FY2026 budget re-imported — Development and Facilities now planned >10% away from actual (totals unchanged)`)
    } else log(`  ${school.name}: FY2026 budget already on file — left alone (--rebudget re-imports it)`)
  }
  if (key === 'cedar') {
    // FY27 = the year we are in: the cash forecast phases operating spend from it.
    const p27 = byEnd(periods, 2027) ?? (await api('POST', `/schools/${school.id}/periods`, { periodEndDate: fyEnd(2027), periodType: 'fy' }))
    const b = DRY ? null : await api('GET', `/schools/${school.id}/periods/${p27.id}/budget`)
    const cfg = MODEL.cedar
    const y26 = book[2026]
    const grossRatio = (cfg.enr2027 * cfg.rate2027) / y26.act.gross
    if (!b?.lines?.spread || flag('rebudget')) {
      await putSpread(key, p27, 2027, budgetAccounts(y26.act, { revAdj: { 4010: grossRatio, 4020: 1.02, 4050: grossRatio * 1.01, 4100: 1.04 }, expAdj: Object.fromEntries(CHART.filter((c) => c[3] === 'exp').map(([a]) => [a, 1.034])) }), `Operating Budget FY2027`)
    } else log(`  ${school.name}: FY2027 budget already on file — left alone`)
    if (!DRY) {
      const op = (await api('GET', `/schools/${school.id}/periods/${p27.id}/operational`, undefined, { allow: [404] })) ?? {}
      const body = {}
      if (op.enrollment == null) body.enrollment = cfg.enr2027
      if (op.financialAidTotal == null) body.financialAidTotal = Math.round(cfg.enr2027 * cfg.rate2027 * 0.19)
      if (op.studentsOnAid == null) body.studentsOnAid = Math.round(cfg.enr2027 * AID_SHARE.cedar)
      if (Object.keys(body).length) {
        await api('PUT', `/schools/${school.id}/periods/${p27.id}/operational`, body)
        log(`  ${school.name}: FY2027 operational ← ${Object.keys(body).join(', ')}`)
      }
    }
  }
}

// ── 4. Cedar Ridge month-ends (Jul 2025 – Jun 2026, year-to-date TBs) ────────
async function loadMonthly(book, periods) {
  const school = S.cedar
  const p26 = byEnd(periods, 2026)
  if (!p26 || DRY) return
  const have = await api('GET', `/schools/${school.id}/periods/${p26.id}/monthly-snapshots`)
  const loaded = new Set((have?.months ?? []).map((m) => m.monthKey))
  if (flag('remonthly')) {
    for (const k of loaded) await api('DELETE', `/schools/${school.id}/periods/${p26.id}/monthly-snapshots/${k}`)
    log(`  ${school.name}: --remonthly — ${loaded.size} month-end(s) removed`)
    loaded.clear()
  }
  const tbs = monthlyTbs(book[2025], book[2026])
  const keys = MONTHS_FY(2026)
  let n = 0
  for (let i = 0; i < 12; i++) {
    if (loaded.has(keys[i])) continue
    const rows = tbs[i]
    const s = r2(rows.reduce((a, r) => a + r.total, 0))
    if (Math.abs(s) > 0.01) throw new Error(`month ${keys[i]} out of balance ${s}`)
    // Through the same parser as the annual file (the web parses month-ends with ingest() too).
    const [yy, mm] = keys[i].split('-').map(Number)
    const end = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10)
    const file = path.join(FILES, 'cedar', 'month-ends', `Trial Balance ${keys[i]}.xlsx`)
    const grid = tbGrid(school.name, 2026, rows).map((r, idx) => (idx === 1 ? [`Trial Balance — Month Ending ${end}`] : idx === 2 ? [`As of ${new Date(`${end}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`] : r))
    const read = readTb(file, writeXlsx(file, grid, 'Trial Balance', [12, 44, 16, 16]), rows, end)
    await api('POST', `/schools/${school.id}/periods/${p26.id}/monthly-snapshots`, { monthKey: keys[i], sourceName: path.basename(file), rows: read.rows })
    n++
  }
  log(`  ${school.name}: month-end TBs — ${n} uploaded, ${loaded.size} already on file`)
}

// ── 5. Board packet schedules (Cedar Ridge FY26) ─────────────────────────────
const CAMPAIGN_NAME = 'Building Our Future Campaign'
async function loadSchedules(book, periods) {
  const school = S.cedar
  const p = byEnd(periods, 2026)
  if (!p || DRY) return
  const bs = book[2026].bs
  const cap = await api('GET', `/schools/${school.id}/periods/${p.id}/capital-schedule`)
  if (!cap?.items?.length) {
    await api('PUT', `/schools/${school.id}/periods/${p.id}/capital-schedule`, {
      items: [
        { group: 'rollover', label: 'Science wing renovation — phase 2', actual: 612400, budget: 650000, comment: 'Substantially complete; punch list open.' },
        { group: 'rollover', label: 'Athletic field lighting', actual: 148900, budget: 140000, comment: 'Change order for pole footings.' },
        { group: 'current', label: 'Gym roof replacement', actual: 214600, budget: 240000 },
        { group: 'current', label: 'Student Chromebook refresh', actual: 96300, budget: 102000 },
        { group: 'current', label: 'HVAC controls — main building', actual: 71800, budget: 65000, comment: 'Two units replaced rather than repaired.' },
        { group: 'current', label: 'Parking lot resurfacing', actual: 0, budget: 85000, comment: 'Deferred to summer 2027.' },
      ],
    })
    log(`  ${school.name}: capital schedule — 6 projects`)
  }
  let cash = await api('GET', `/schools/${school.id}/periods/${p.id}/cash-schedule`)
  // Fictional institutions only (rough-cut review 2026-10-17: the first seed used
  // real-sounding Florida names). An existing schedule carrying them is renamed in place.
  const RENAME = { 'Tampa Bay Community Bank': 'Bayview Community Bank', 'Suncoast Credit Union': 'Harbor Light Credit Union', 'Gulfstream Investment Advisors': 'Cedar Point Advisors' }
  if (cash?.accounts?.some((a) => RENAME[a.institution])) {
    await api('PUT', `/schools/${school.id}/periods/${p.id}/cash-schedule`, { accounts: cash.accounts.map((a) => ({ ...a, institution: RENAME[a.institution] ?? a.institution })) })
    log(`  ${school.name}: cash & investments schedule — institutions renamed to fictional names`)
    cash = await api('GET', `/schools/${school.id}/periods/${p.id}/cash-schedule`)
  }
  if (!cash?.accounts?.length) {
    const acct = (restriction, institution, accountDescription, vehicle, balance, extra = {}) => {
      const insured = Math.min(balance, 250000)
      return { restriction, institution, accountDescription, vehicle, balance, insuredPortion: insured, uninsuredPortion: r2(balance - insured), ...extra }
    }
    await api('PUT', `/schools/${school.id}/periods/${p.id}/cash-schedule`, {
      accounts: [
        acct('unrestricted', 'Bayview Community Bank', 'Operating checking', 'Checking', bs[1010]),
        acct('unrestricted', 'Bayview Community Bank', 'Money market reserve', 'Money market', bs[1020], { interestRate: 0.0385, comment: 'Swept nightly above $50,000.' }),
        acct('unrestricted', 'Bayview Community Bank', 'Payroll account', 'Checking', bs[1030]),
        acct('temporarily_restricted', 'Harbor Light Credit Union', 'Scholarship fund', 'Savings', bs[1100], { interestRate: 0.031 }),
        acct('permanently_restricted', 'Cedar Point Advisors', 'Endowment pool', 'Managed portfolio', bs[1400], { comment: 'Board-designated spending rule: 4.5%.' }),
      ],
    })
    log(`  ${school.name}: cash & investments schedule — 5 accounts`)
  }
  const camp = await api('GET', `/schools/${school.id}/periods/${p.id}/campaign-schedule`)
  if (!camp?.items?.length) {
    await api('PUT', `/schools/${school.id}/periods/${p.id}/campaign-schedule`, {
      campaignName: CAMPAIGN_NAME,
      items: [
        { group: 'Sources', label: 'Leadership gifts', budget: 1800000, estimate: 1650000 },
        { group: 'Sources', label: 'Major gifts', budget: 1400000, estimate: 1525000 },
        { group: 'Sources', label: 'Alumni & parent gifts', budget: 900000, estimate: 780000 },
        { group: 'Sources', label: 'Foundation grants', budget: 400000, estimate: 450000, comment: 'Two proposals pending.' },
        { group: 'Uses', label: 'Science & innovation wing', budget: 3100000, estimate: 3050000 },
        { group: 'Uses', label: 'Tuition assistance endowment', budget: 1000000, estimate: 900000 },
        { group: 'Uses', label: 'Campaign costs', budget: 400000, estimate: 380000 },
      ],
    })
    log(`  ${school.name}: capital campaign schedule — 7 lines`)
  }
}

// ── 6. Cash: assumptions, commitments, St. Aurelia's built forecast ──────────
async function loadCash(books) {
  if (DRY) return
  for (const key of ['cedar', 'aurelia']) {
    const school = S[key]
    const a = await api('GET', `/schools/${school.id}/cash-flow/assumptions`)
    if (!a?.firstBillingDate) {
      await api('PUT', `/schools/${school.id}/cash-flow/assumptions`, {
        planMix: { annual: 0.22, semiannual: 0.18, monthly10: 0.6, monthly12: 0 },
        collectionRate: 0.97,
        collectionRateSource: 'entered',
        firstBillingDate: '2026-07-15',
      })
      log(`  ${school.name}: cash assumptions — first billing Jul 15, 2026; 97% collected`)
    }
  }
  const cedar = S.cedar
  const have = await api('GET', `/schools/${cedar.id}/cash-flow/commitments`)
  const haveRows = Array.isArray(have) ? have : have?.commitments ?? []
  const labels = new Set(haveRows.map((c) => c.label))
  const want = [
    { label: 'Building note — principal & interest', category: 'debt_service', direction: 'out', amount: 28400, confidence: 'committed', recurrence: 'monthly', startDate: '2026-11-01', notes: 'Fixed-rate note on the science wing.' },
    // Payroll as a commitment: today the forecast's budget phasing reads nothing
    // (spread fiscalYearStart is stored 'YYYY-MM', spreadDisbursements wants an
    // ISO date — see the report), so without this the forecast has no payroll.
    { label: 'Faculty & staff payroll', category: 'payroll', direction: 'out', amount: 232000, confidence: 'committed', recurrence: 'semimonthly', startDate: '2026-10-31', dayRule: [15, 31], notes: 'Salaries, benefits and payroll taxes.' },
    { label: 'HVAC replacement — accepted bid', category: 'capital', direction: 'out', amount: 96000, confidence: 'scheduled', recurrence: 'once', startDate: '2027-01-20' },
    { label: 'Science wing — final construction draw', category: 'capital', direction: 'out', amount: 165000, confidence: 'scheduled', recurrence: 'once', startDate: '2027-03-01' },
  ]
  for (const c of want) {
    const cur = haveRows.find((x) => x.label === c.label)
    if (cur && Number(cur.amount) !== c.amount) {
      await api('PATCH', `/schools/${cedar.id}/cash-flow/commitments/${cur.id}`, c)
      log(`  ${cedar.name}: commitment updated — ${c.label}`)
    }
    if (labels.has(c.label)) continue
    await api('POST', `/schools/${cedar.id}/cash-flow/commitments`, c)
    log(`  ${cedar.name}: commitment — ${c.label}`)
  }
  // St. Aurelia: two dated items outside the operating budget, so the forecast
  // has a real dip (and no "no commitments are recorded" gap).
  const aurHave = await api('GET', `/schools/${S.aurelia.id}/cash-flow/commitments`)
  const aurLabels = new Set((Array.isArray(aurHave) ? aurHave : aurHave?.commitments ?? []).map((c) => c.label))
  for (const c of [
    { label: 'Faculty & staff payroll', category: 'payroll', direction: 'out', amount: 61500, confidence: 'committed', recurrence: 'semimonthly', startDate: '2026-10-31', dayRule: [15, 31], notes: 'Salaries, benefits and payroll taxes.' },
    { label: 'Parish loan — principal & interest', category: 'debt_service', direction: 'out', amount: 5600, confidence: 'committed', recurrence: 'monthly', startDate: '2026-11-01' },
    { label: 'STEM wing — construction draw', category: 'capital', direction: 'out', amount: 210000, confidence: 'scheduled', recurrence: 'once', startDate: '2026-12-10', notes: 'Funded later by campaign pledges.' },
  ]) {
    if (aurLabels.has(c.label)) continue
    await api('POST', `/schools/${S.aurelia.id}/cash-flow/commitments`, c)
    log(`  ${S.aurelia.name}: commitment — ${c.label}`)
  }
  // St. Aurelia: ONE built forecast (Build forecast = persist) from its FY26 cash.
  const aur = S.aurelia
  const opening = await api('GET', `/schools/${aur.id}/cash-flow/opening?today=${today}`)
  if (opening?.openingCash == null) {
    const cash = Math.round(books.aurelia[2026].bs[1010] + books.aurelia[2026].bs[1020] + books.aurelia[2026].bs[1030])
    const run = await api('POST', `/schools/${aur.id}/cash-flow/project`, { openingCash: cash, asOfDate: today, openingSource: 'keyed', horizon: '13w' })
    log(`  ${aur.name}: cash forecast built — opening $${cash.toLocaleString()} as of ${today}; tier ${run?.dataTier ?? '?'}`)
  } else log(`  ${aur.name}: a cash forecast is already built — left alone`)
}

// ── 6b. Opening net assets on every school record ────────────────────────────
// The Statement of Financial Position rolls forward from the school record's
// "Opening net assets" (the same field the intake autosaves). The five reporting
// schools leave step 1 with their latest year's openings; Brightwater has no
// books until the live f3 take, so its record is given the files' own opening
// (closing net assets on the Balance Sheet less the year's change on the P&L)
// BEFORE that take generates its statements. Only ever fills a 0 — never moves
// a value someone set.
async function loadOpenings(books) {
  if (DRY) return {}
  const { OPENING_NET_ASSETS } = await import('./finance-files.mjs')
  const list = await api('GET', '/schools')
  const out = {}
  for (const key of Object.keys(S)) {
    const rec = list.find((s) => s.id === S[key].id)
    const cur = { netAssetsBegin: Number(rec?.netAssetsBegin ?? 0), pyNetAssetsBegin: Number(rec?.pyNetAssetsBegin ?? 0), auditNetAssetsBegin: Number(rec?.auditNetAssetsBegin ?? 0) }
    let want
    if (key === 'brightwater') want = { netAssetsBegin: OPENING_NET_ASSETS, pyNetAssetsBegin: OPENING_NET_ASSETS, auditNetAssetsBegin: OPENING_NET_ASSETS }
    else {
      const fys = Object.keys(books[key] ?? {}).map(Number).sort()
      const last = books[key]?.[fys.at(-1)]
      const prev = books[key]?.[fys.at(-2)]
      if (!last) continue
      want = { netAssetsBegin: r2(last.naOpen), pyNetAssetsBegin: r2(prev ? prev.naOpen : last.naOpen), auditNetAssetsBegin: r2(key === 'cedar' && prev ? prev.naOpen : last.naOpen) }
    }
    const body = Object.fromEntries(Object.entries(want).filter(([k]) => !cur[k]))
    if (Object.keys(body).length) {
      await api('PATCH', `/schools/${S[key].id}`, body)
      log(`  ${S[key].name}: opening net assets ← ${Object.entries(body).map(([k, v]) => `${k} $${Math.round(v).toLocaleString()}`).join(', ')}`)
    }
    out[key] = { ...cur, ...body }
  }
  return out
}

// ── 6c. Cedar Ridge FY26 year-end forecast (r5 "Forecast vs Budget (Net)") ───
// The accreditation Warnings tab reads forecast_vs_budget_net, which needs a
// SAVED FY-end forecast on the period (Planning & Forecasting → Save forecast),
// not the cash forecast — Cedar's cash forecast stays unbuilt for f7. The
// forecast lands where FY26 actually landed: every line is the year's own
// statement figure (tuition through the driver: 431 students in grades 9–12 at
// the year's net tuition per student), so it reads honestly against the budget.
async function loadCedarForecast(periods) {
  if (DRY) return null
  const school = S.cedar
  const p = byEnd(periods, 2026)
  if (!p) return null
  const have = await api('GET', `/schools/${school.id}/periods/${p.id}/budget/forecast`)
  if (have?.forecast) {
    log(`  ${school.name}: FY2026 year-end forecast already saved — left alone`)
    return { kept: true }
  }
  const snap = await api('GET', `/schools/${school.id}/periods/${p.id}/statements`)
  const cy = snap?.payload?.soaResults?.cy
  if (!cy) throw new Error('Cedar FY26 statements missing — cannot seed the forecast')
  const op = await api('GET', `/schools/${school.id}/periods/${p.id}/operational`)
  const enr = Number(op?.enrollment) || 431
  const split = [0.26, 0.255, 0.245]
  const byGrade = { 9: Math.round(enr * split[0]), 10: Math.round(enr * split[1]), 11: Math.round(enr * split[2]) }
  byGrade[12] = enr - byGrade[9] - byGrade[10] - byGrade[11]
  const rate = Math.round((cy.tuition / enr) * 100) / 100
  const z = { count: 0, avgSalary: 0 }
  const assumptions = {
    enrollmentByGrade: Object.fromEntries(Object.entries(byGrade).map(([g, n]) => [g, n])),
    tuitionRates: { high: rate },
    tuitionProgramSplit: { parent: 100, ftc: 0, fes: 0 },
    feePerStudent: 0,
    staffing: { teachers: z, admin: z, facilities: z, benefitsPct: 0 },
    inflationPct: 0,
    overrides: Object.fromEntries(
      ['dev', 'studAct', 'textbook', 'other', 'support', 'intlRev', 'investments', 'interest', 'instructional', 'facilities', 'fixedOther', 'intlExp', 'bus', 'food', 'studActExp', 'athletics', 'admin', 'restricted'].map((k) => [k, Math.round(Number(cy[k] ?? 0))]),
    ),
  }
  const res = await api('PUT', `/schools/${school.id}/periods/${p.id}/budget/forecast`, { projectionMethod: 'manual', assumptions, explanations: { revenue: {}, expense: {} } })
  const k = res?.forecast?.projected?.kpis ?? res?.projected?.kpis ?? {}
  log(`  ${school.name}: FY2026 year-end forecast saved — revenue $${Math.round(k.totalRevenue ?? 0).toLocaleString()}, expense $${Math.round(k.totalExpense ?? 0).toLocaleString()} (statements: $${cy.totalRev.toLocaleString()} / $${cy.totalExp.toLocaleString()})`)
  return { revenue: k.totalRevenue ?? null, expense: k.totalExpense ?? null }
}

// ── 7. Cedar Ridge capital campaign + the April pledge (f7's "add the gift") ──
async function loadCampaign() {
  if (DRY) return null
  const cedar = S.cedar
  const list = await api('GET', `/schools/${cedar.id}/advancement/campaigns`)
  const rows = Array.isArray(list) ? list : list?.campaigns ?? list?.items ?? []
  let camp = rows.find((c) => c.campaignType === 'capital') ?? null
  if (!camp) {
    camp = await api('POST', `/schools/${cedar.id}/advancement/campaigns`, {
      name: CAMPAIGN_NAME,
      campaignType: 'capital',
      goalAmount: 4500000,
      fiscalYear: 2027,
      startDate: '2025-09-01',
      closeDate: '2027-06-30',
      status: 'active',
      notes: 'Science & innovation wing and the tuition assistance endowment.',
    })
    log(`  ${cedar.name}: advancement — ${CAMPAIGN_NAME} (capital)`)
  } else log(`  ${cedar.name}: a capital campaign already exists ("${camp.name}") — reused`)
  const gifts = await api('GET', `/schools/${cedar.id}/advancement/campaigns/${camp.id}/gifts`)
  const gl = Array.isArray(gifts) ? gifts : gifts?.gifts ?? gifts?.items ?? []
  const add = [
    { kind: 'pledge', amount: 150000, occurredOn: '2025-11-14', label: 'Whitcombe Family — pledge, final payment due April 15, 2027', note: 'Payment due April 15, 2027.', source: 'Leadership gifts' },
    { kind: 'gift', amount: 250000, receivedAmount: 250000, occurredOn: '2025-12-19', label: 'Harborview Foundation — grant', source: 'Foundation grants' },
    { kind: 'gift', amount: 85000, receivedAmount: 85000, occurredOn: '2026-03-06', label: 'Parent leadership circle', source: 'Alumni & parent gifts' },
  ]
  for (const g of add) {
    if (gl.some((x) => x.label === g.label)) continue
    await api('POST', `/schools/${cedar.id}/advancement/campaigns/${camp.id}/gifts`, g)
    log(`  ${cedar.name}: advancement ${g.kind} — ${g.label}`)
  }
  return { id: camp.id, name: camp.name }
}

// ── 8. f10: St. Aurelia scholarship self-check (FY26) ────────────────────────
async function loadCompliance(periods) {
  if (DRY) return null
  const aur = S.aurelia
  const p = byEnd(periods, 2026)
  if (!p) return null
  const have = await api('GET', `/schools/${aur.id}/periods/${p.id}/disbursements`)
  const existing = Array.isArray(have) ? have : have?.rows ?? []
  // 58 scholarship students, refs only. FTC paid in four quarterly payments,
  // FES-EO in two semester payments. No names anywhere.
  const rows = []
  const pays = { FTC: ['2025-08-15', '2025-10-15', '2026-01-15', '2026-04-15'], FES_EO: ['2025-09-30', '2026-02-27'] }
  for (let i = 1; i <= 58; i++) {
    const program = i <= 36 ? 'FTC' : 'FES_EO'
    const award = program === 'FTC' ? 8400 + (i % 4) * 150 : 8950 + (i % 3) * 120
    const dates = pays[program]
    dates.forEach((d, j) => {
      rows.push({ studentRef: `SA-${String(1000 + i * 7).padStart(4, '0')}`, program, payDate: d, amount: r2(award / dates.length), term: j < dates.length / 2 ? 'Fall 2025' : 'Spring 2026', batchRef: `${program}-${d.slice(0, 7)}` })
    })
  }
  const total = r2(rows.reduce((a, r) => a + r.amount, 0))
  if (!existing.length) {
    await api('PUT', `/schools/${aur.id}/periods/${p.id}/disbursements`, { rows })
    log(`  ${aur.name}: FY26 scholarship disbursements — ${rows.length} rows, $${total.toLocaleString()} (student refs only)`)
  }
  // Every attestation answered so the self-check PASSES: a failing answer files a
  // "material finding" + corrective actions that lead St. Aurelia's morning brief
  // (critical) and turn its Finance tile red — the brief belongs to the attention
  // recipe, not to f10. Re-PUT when the stored answers differ.
  const want = {
    scholarshipFundsReceived: total,
    programs: ['FTC', 'FES_EO'],
    fundsAtInsuredInstitution: true,
    avgDailyBalanceOver250k: false,
    reconciledWithin60Days: true,
    reconciliationIndependentlyReviewed: true,
    doeStatusApproved: true,
    yearsInOperation: 41,
  }
  const inputs = await api('GET', `/schools/${aur.id}/periods/${p.id}/compliance/inputs`)
  const cur = inputs?.inputs ?? inputs ?? {}
  const differs = Object.entries(want).some(([k, v]) => JSON.stringify(Array.isArray(v) ? [...v].sort() : v) !== JSON.stringify(Array.isArray(cur[k]) ? [...cur[k]].sort() : cur[k] == null ? null : typeof v === 'number' ? Number(cur[k]) : cur[k]))
  if (differs) {
    await api('PUT', `/schools/${aur.id}/periods/${p.id}/compliance/inputs`, want)
    log(`  ${aur.name}: FY26 scholarship intake — $${total.toLocaleString()} received (above the $250,000 trigger), every answer passing`)
  }
  return { rows: rows.length, total }
}

// ── 9. Insight cache ─────────────────────────────────────────────────────────
async function warmInsights(periodsBy) {
  if (DRY || !WARM) return {}
  const out = {}
  for (const [key, fy] of [['cedar', 2026], ['cedar', 2025], ['aurelia', 2026]]) {
    const p = byEnd(periodsBy[key], fy)
    if (!p) continue
    const t0 = Date.now()
    const ins = await api('GET', `/schools/${S[key].id}/periods/${p.id}/insights`, undefined, { allow: [404, 503] })
    const text = String(ins?.summary ?? ins?.text ?? ins?.insight ?? '')
    const tags = (text.match(/\[(RISK|WATCH|STRENGTH)\]/g) ?? []).reduce((a, t) => ({ ...a, [t]: (a[t] ?? 0) + 1 }), {})
    out[`${key}-FY${fy}`] = { source: ins?.source ?? null, tags, ms: Date.now() - t0 }
    log(`  ${S[key].name}: FY${fy} insight — ${JSON.stringify(tags)} (${ins?.source ?? 'n/a'})`)
  }
  return out
}

// ── run ──────────────────────────────────────────────────────────────────────
async function main() {
  log(`API ${API}${DRY ? ' · DRY RUN' : ''} · today ${today}`)
  // Brightwater's upload files first (pure; no login needed to build/check them).
  const { buildAndCheck } = await import('./finance-files.mjs')
  const { files, report: fileReport } = buildAndCheck()
  const V4 = path.join(REPO, 'demo-video/assets/v4-files')
  fs.mkdirSync(path.join(V4, 'pl-only'), { recursive: true })
  fs.mkdirSync(path.join(V4, 'messy'), { recursive: true })
  fs.writeFileSync(path.join(V4, 'Profit and Loss.xlsx'), files.pl)
  fs.writeFileSync(path.join(V4, 'Balance Sheet.xlsx'), files.bs)
  fs.writeFileSync(path.join(V4, 'pl-only/Profit and Loss.xlsx'), files.pl)
  fs.writeFileSync(path.join(V4, 'messy/Trial Balance Export.xlsx'), files.messy)
  log(`Brightwater files checked + written: P&L ${fileReport.pl.rows} rows, BS ${fileReport.bs.rows} rows (balances), pair → ${fileReport.merged.partial}; auto-sort ${fileReport.autoSort.sortedBySection} sorted, ${fileReport.autoSort.needQuickCheck} need a quick check; messy → "${fileReport.messy.code}" with a column-picker preview`)

  TOKEN = await login()
  log('logged in as Morgan (one login; token in memory only)')

  const mine = await api('GET', '/schools')
  const ids = new Set((mine ?? []).map((s) => s.id))
  for (const s of manifest.schools) if (!ids.has(s.id)) throw new Error(`Morgan cannot see ${s.name}`)
  if (ids.size !== manifest.schools.length) throw new Error(`Morgan sees ${ids.size} schools, expected ${manifest.schools.length} — refusing`)

  // Brightwater must stay empty for f1–f3.
  const bw = await api('GET', `/schools/${S.brightwater.id}/periods`)
  if ((bw ?? []).some((p) => p.roles?.cy || p.roles?.py || p.roles?.audit || p.hasSnapshot)) {
    log(`  WARNING: Brightwater already holds finance data — this loader never writes there; reset it before f1.`)
  }

  const report = { generatedAt: new Date().toISOString(), api: API, schools: {}, brightwaterFiles: fileReport }
  const books = {}
  const periodsBy = {}
  for (const key of FINANCE_SCHOOLS) {
    log(`▸ ${S[key].name}`)
    const { book, periods } = await loadTrialBalances(key, report)
    books[key] = book
    await loadOperational(key, book, periods)
    await loadBudgets(key, book, periods)
    periodsBy[key] = DRY ? periods : await api('GET', `/schools/${S[key].id}/periods`)
  }
  log('▸ Cedar Ridge extras')
  await loadMonthly(books.cedar, periodsBy.cedar)
  await loadSchedules(books.cedar, periodsBy.cedar)
  report.campaign = await loadCampaign()
  log('▸ Cash')
  await loadCash(books)
  log('▸ Opening net assets (all six school records)')
  report.openings = await loadOpenings(books)
  log('▸ Cedar Ridge FY26 year-end forecast (r5)')
  report.cedarForecast = await loadCedarForecast(periodsBy.cedar)
  log('▸ f10 scholarship self-check')
  report.compliance = await loadCompliance(periodsBy.aurelia)
  log('▸ Insight cache')
  report.insights = await warmInsights(periodsBy)

  report.writes = WRITES.length
  if (!DRY) fs.writeFileSync(path.join(OUT, 'finance.json'), JSON.stringify(report, null, 1))
  log(`\n${DRY ? 'DRY RUN — would write' : 'done —'} ${WRITES.length} write call(s)${DRY ? '' : `; manifest → ${path.relative(REPO, path.join(OUT, 'finance.json'))}`}`)
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`)
  process.exit(1)
})

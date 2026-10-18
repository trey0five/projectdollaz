#!/usr/bin/env node
// KYRO demo v4 — ENROLLMENT content loader (storyboard §E, scenes e1–e7).
//
// Logs in ONCE as the fictional demo user Morgan (POST /auth/login with the real
// password from the gitignored demo-video/.env.capture.local; the token stays in
// memory, nothing is written to disk) and loads every enrollment row through the
// SAME routes the web UI uses:
//
//   St. Aurelia Academy (PK3–8, the filmed school)
//     • FY23–FY26 headcounts by grade ............ POST /enrollment/manual (Oct 1 census)
//     • the live FY27 register (≈200 enrolled +
//       waitlist / withdrawals / last year's
//       graduates, demographics, support flags) ... POST /enrollment/students/batch
//       → the register's own auto-sync files today's roster reading and promotes it
//     • FY27 driver budget (plan by grade, tuition
//       per band, staff & pay) ...................... PUT /periods/:id/budget/driver
//     • FY26 grade-by-grade plan (one grade short:
//       the home-brief attention recipe) ............ PUT /periods/:id/operational
//   Cedar Ridge / Mangrove Point / St. Odile / Heron Cove
//     • headcounts by grade for the years their books cover (org roll-ups,
//       per-pupil metrics, accreditation signal, academics quadrant)
//   Brightwater: NOTHING (it must stay at zero periods for f1–f3).
//
// It also writes the made-up files used on camera in e2 to
// demo-video/assets/v4-files/ (a OneRoster users.csv for Brightwater and one
// diocesan census workbook), and a counts/ids manifest to seed-v4/out/.
//
// Privacy shape, by design: every grade ≥ 5, every demographic category ≥ 5
// EXCEPT exactly one race category of 3 (the e6 "listed but not drawn" tile),
// and exactly one support flag under 5 (504 = 4, hidden). All people are
// invented; names never appear on camera (the register tab is never filmed).
//
// Idempotent: snapshots are keyed by (school, provider, observedOn) server-side,
// students by externalId (existing ids are skipped), the plan/budget PUTs are
// deterministic overwrites. Never prints the password or the token.
//
// Usage: node load-enrollment.mjs [--api=http://127.0.0.1:8000] [--only=a,b]
//        steps: history, roster, plan, budget, others, files, diocesan-check
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const REPO = '/home/dream/dollaz'
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/)
    return m ? [m[1], m[2] ?? true] : [a, true]
  }),
)
const API = args.api || 'http://127.0.0.1:8000'
const ONLY = args.only ? new Set(String(args.only).split(',')) : null
const step = (name) => !ONLY || ONLY.has(name)
if (!/^http:\/\/(127\.0\.0\.1|localhost):8000$/.test(API)) {
  console.error('refusing: this loader only talks to the local dev API on :8000')
  process.exit(2)
}

const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'demo-video/seed-v4/out/structure.json'), 'utf8'))
const ORG_ID = manifest.org.id
const SCHOOL = Object.fromEntries(manifest.schools.map((s) => [s.key, s]))
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(REPO, 'demo-video/.env.capture.local'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
)
const OUT_DIR = path.join(REPO, 'demo-video/seed-v4/out')
const FILES_DIR = path.join(REPO, 'demo-video/assets/v4-files')

// ── HTTP ─────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let TOKEN = null
async function login() {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: env.MORGAN_EMAIL, password: env.MORGAN_PASSWORD }),
    })
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 15000
      console.log(`login 429 — backing off ${wait / 1000}s`)
      await sleep(wait)
      continue
    }
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`login HTTP ${res.status} ${body.code ?? ''} ${body.message ?? ''}`)
    if (body.mfa_required) throw new Error('login asked for MFA — Morgan must not have MFA')
    if (!body.access_token) throw new Error('login returned no access_token')
    if (body.user?.email !== manifest.user.email) throw new Error('logged in as an unexpected user')
    TOKEN = body.access_token
    return body
  }
  throw new Error('login rate-limited 6 times')
}
async function call(method, p, body, { form = false, ok404 = false } = {}) {
  const headers = { authorization: `Bearer ${TOKEN}` }
  let payload
  if (form) payload = body
  else if (body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(`${API}${p}`, { method, headers, body: payload })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {}
  if (ok404 && res.status === 404) return null
  if (!res.ok) {
    const msg = json?.message ? (Array.isArray(json.message) ? json.message.join('; ') : json.message) : text.slice(0, 300)
    throw new Error(`${method} ${p} → HTTP ${res.status}: ${msg}`)
  }
  return json
}
const get = (p, o) => call('GET', p, undefined, o)
const post = (p, b, o) => call('POST', p, b, o)
const put = (p, b) => call('PUT', p, b)

// ── Deterministic randomness ─────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20261017)
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const pad = (n, w = 2) => String(n).padStart(w, '0')

// ── The numbers (one source of truth for every step + the files) ─────────────
const K8 = ['PK3', 'PK4', 'K', '1', '2', '3', '4', '5', '6', '7', '8']
const HS = ['9', '10', '11', '12']
const vec = (grades, arr) => Object.fromEntries(grades.map((g, i) => [g, arr[i]]))
const sum = (m) => Object.values(m).reduce((s, v) => s + v, 0)

// St. Aurelia: built as cohort diagonals, so "Following a class" is real.
//   grade-2 class (FY23 PK3) 14→20 grew · grade-5 class 17→21 grew · grade-6 class
//   22→16 shrank · grade-3 class 20→17 shrank · grades 4/7/8 classes held steady.
//   Totals 208 → 205 → 201 → 202 → 204: a gentle dip, then recovery.
const AURELIA = {
  2023: vec(K8, [14, 20, 18, 17, 22, 22, 21, 20, 19, 18, 17]),
  2024: vec(K8, [15, 16, 19, 18, 18, 21, 22, 21, 19, 18, 18]),
  2025: vec(K8, [13, 17, 18, 18, 19, 19, 19, 21, 20, 19, 18]),
  2026: vec(K8, [15, 17, 18, 19, 18, 19, 20, 18, 20, 20, 18]),
  2027: vec(K8, [14, 18, 20, 19, 20, 17, 19, 21, 16, 20, 20]), // the live register
}
// FY27 plan (driver budget): 213 → 204 is 9 short (-4.2%, Watch). Grades 3 and 6
// are clearly under (-5 each), PK3 is 1 under, grade 5 is 2 over.
const AURELIA_PLAN_FY27 = vec(K8, [15, 18, 20, 19, 20, 22, 19, 19, 21, 20, 20])
// FY26 plan (operational form): only grade 5 short (18 vs 23) — the SAME class
// that is grade 6 in FY27, so the home brief and the enrollment page tell one story.
const AURELIA_PLAN_FY26 = { ...AURELIA[2026], 5: 23 }

const OTHERS = {
  cedar: {
    grades: HS,
    years: {
      2022: vec(HS, [108, 101, 99, 94]),
      2023: vec(HS, [112, 104, 99, 96]),
      2024: vec(HS, [113, 108, 101, 96]),
      2025: vec(HS, [116, 109, 104, 97]),
      2026: vec(HS, [117, 111, 104, 99]),
    },
    census2027: vec(HS, [118, 113, 107, 101]),
  },
  mangrove: {
    grades: HS,
    years: {
      2024: vec(HS, [82, 78, 75, 74]),
      2025: vec(HS, [78, 77, 74, 72]),
      2026: vec(HS, [76, 75, 73, 72]),
    },
    census2027: vec(HS, [74, 74, 72, 70]),
  },
  odile: {
    grades: K8,
    years: {
      2024: vec(K8, [16, 20, 22, 21, 22, 21, 23, 22, 25, 24, 25]),
      2025: vec(K8, [17, 21, 23, 22, 21, 22, 21, 23, 22, 25, 24]),
      2026: vec(K8, [18, 22, 24, 23, 22, 21, 22, 21, 23, 22, 24]),
    },
    census2027: vec(K8, [18, 23, 25, 24, 23, 22, 21, 22, 21, 23, 22]),
  },
  heron: {
    grades: K8,
    years: {
      2024: vec(K8, [10, 13, 15, 14, 15, 16, 15, 16, 17, 17, 18]),
      2025: vec(K8, [11, 12, 14, 15, 14, 15, 16, 15, 16, 17, 16]),
      2026: vec(K8, [9, 13, 13, 14, 15, 14, 15, 16, 15, 16, 17]),
    },
    census2027: vec(K8, [10, 12, 14, 13, 14, 15, 14, 15, 16, 15, 16]),
  },
}
const censusDate = (fyEnd) => `${fyEnd - 1}-10-01` // the fall count, inside FY(fyEnd)

// ── St. Aurelia register (FY27) ──────────────────────────────────────────────
const FIRST_F = ['Ava', 'Sofia', 'Isabella', 'Mia', 'Amelia', 'Harper', 'Evelyn', 'Abigail', 'Ella', 'Grace', 'Chloe', 'Lily', 'Nora', 'Zoe', 'Leah', 'Hazel', 'Lucia', 'Camila', 'Maya', 'Elena', 'Claire', 'Naomi', 'Ruby', 'Iris', 'Julia', 'Alice', 'Vivian', 'Rosa', 'Adeline', 'Talia', 'Imani', 'Priya', 'Mei', 'Layla', 'Esme', 'Bianca', 'Celeste', 'Daphne', 'Faith', 'Gemma']
const FIRST_M = ['Liam', 'Noah', 'Mateo', 'Lucas', 'Elijah', 'James', 'Henry', 'Leo', 'Owen', 'Jack', 'Wyatt', 'Julian', 'Gabriel', 'Isaac', 'Caleb', 'Miles', 'Adrian', 'Rafael', 'Thomas', 'Andrew', 'Dominic', 'Felix', 'Hugo', 'Elias', 'Xavier', 'Marcus', 'Desmond', 'Kenji', 'Arjun', 'Omar', 'Samuel', 'Simon', 'Tobias', 'Vincent', 'Wesley', 'Brendan', 'Cyrus', 'Damian', 'Emmett', 'Ronan']
const LAST = ['Alder', 'Bramwell', 'Castellano', 'Delacroix', 'Ellery', 'Fairbanks', 'Galloway', 'Hartwell', 'Iverson', 'Jessop', 'Kincaid', 'Lockhart', 'Marchetti', 'Northcott', 'Okafor', 'Pembrook', 'Quintero', 'Rourke', 'Sandoval', 'Thackeray', 'Underhill', 'Vasquez-Lane', 'Whitlock', 'Yarrow', 'Zamora', 'Ashby', 'Beaumont', 'Corrigan', 'Dunmore', 'Escobedo', 'Finnegan', 'Greaves', 'Holloway', 'Ibarra', 'Kessler', 'Lindqvist', 'Moreland', 'Nakashima', 'Ortega-Bell', 'Prescott', 'Ravenel', 'Stroud', 'Treadwell', 'Valcourt', 'Winslow', 'Achebe', 'Brightman', 'Calloway', 'Devereux', 'Fontaine']

// The one deliberately small group (3) is MENA; nhpi is simply absent (0, not drawn).
const RACE_POOL = { white: 108, hispanicLatino: 38, black: 27, asian: 16, twoOrMore: 12, mena: 3 }
const HISPANIC_EXTRA = { white: 10, twoOrMore: 4 } // ethnicity=hispanic beyond race=hispanicLatino → 52
const GENDER_POOL = { female: 101, male: 103 }
const ageOf = (g) => (g === 'PK3' ? 3 : g === 'PK4' ? 4 : g === 'K' ? 5 : Number(g) + 5)

function birthDateFor(grade, schoolYearStart /* e.g. 2026 */) {
  // Age `a` on Sept 1 of the school year ⇒ born between Sept 2 (y-a-1) and Sept 1 (y-a).
  const a = ageOf(grade)
  const start = Date.UTC(schoolYearStart - a - 1, 8, 2)
  const end = Date.UTC(schoolYearStart - a, 8, 1)
  const d = new Date(start + Math.floor(rnd() * (end - start)))
  return d.toISOString().slice(0, 10)
}

function buildAureliaRegister() {
  const enrolled = []
  // New this year (enrolledOn ≥ 2026-07-01): all PK3 + the transfers each grade gained.
  const prevIdx = (g) => K8[K8.indexOf(g) - 1]
  for (const g of K8) {
    const n = AURELIA[2027][g]
    const gained = g === 'PK3' ? n : Math.max(0, n - AURELIA[2026][prevIdx(g)])
    for (let i = 0; i < n; i++) {
      const isNew = i < gained
      const yearsHere = isNew ? 0 : 1 + Math.floor(rnd() * K8.indexOf(g))
      const entryYear = 2026 - yearsHere
      enrolled.push({
        grade: g,
        status: 'enrolled',
        enrolledOn: `${entryYear}-08-${pad(10 + Math.floor(rnd() * 5))}`,
        birthDate: birthDateFor(g, 2026),
      })
    }
  }
  // Demographic pools, shuffled across the enrolled register.
  const races = shuffle(Object.entries(RACE_POOL).flatMap(([k, n]) => Array(n).fill(k)))
  const genders = shuffle(Object.entries(GENDER_POOL).flatMap(([k, n]) => Array(n).fill(k)))
  if (races.length !== enrolled.length || genders.length !== enrolled.length) {
    throw new Error(`pool size mismatch: ${races.length}/${genders.length} vs ${enrolled.length}`)
  }
  const extra = { ...HISPANIC_EXTRA }
  enrolled.forEach((s, i) => {
    s.race = races[i]
    s.gender = genders[i]
    let hisp = s.race === 'hispanicLatino'
    if (!hisp && extra[s.race] > 0) {
      extra[s.race]--
      hisp = true
    }
    s.ethnicity = hisp ? 'hispanic' : 'nonHispanic'
  })
  // Support flags on ENROLLED students only (the aggregate counts every status).
  // Learning support (iep key) 14 · English learner 9 · 504 = 4 (the one hidden flag).
  const inGrades = (gs) => enrolled.filter((s) => gs.includes(s.grade))
  const g38 = ['3', '4', '5', '6', '7', '8']
  const take = (pool, n, key, taken) => {
    const cands = shuffle(pool.filter((s) => !taken.has(s)))
    cands.slice(0, n).forEach((s) => {
      s[key] = true
      taken.add(s)
    })
  }
  const iep = new Set()
  take(inGrades(g38), 10, 'hasIep', iep)
  take(inGrades(['1', '2']), 4, 'hasIep', iep)
  const ell = new Set()
  take(inGrades(g38), 6, 'ell', ell)
  take(inGrades(['K', '1', '2']), 3, 'ell', ell)
  const p504 = new Set(iep) // 504 students are never also on a learning-support plan
  take(inGrades(g38), 4, 'has504', p504)

  const others = []
  // Waitlist (6) — only in grades at or over plan.
  for (const g of ['K', 'K', '5', '5', 'PK4', 'PK4']) {
    others.push({ grade: g, status: 'waitlist', birthDate: birthDateFor(g, 2026) })
  }
  // Withdrawals this fall (5) — they are why grades 3 and 6 read short.
  const wd = [
    ['6', '2026-08-28'],
    ['6', '2026-09-11'],
    ['3', '2026-09-04'],
    ['3', '2026-09-25'],
    ['7', '2026-10-02'],
  ]
  for (const [g, on] of wd) {
    others.push({
      grade: g,
      status: 'withdrawn',
      enrolledOn: `${2026 - 2 - Math.floor(rnd() * 3)}-08-12`,
      withdrawnOn: on,
      birthDate: birthDateFor(g, 2026),
    })
  }
  // Last year's eighth grade (FY26: 18) — graduated in June.
  for (let i = 0; i < AURELIA[2026]['8']; i++) {
    others.push({
      grade: '8',
      status: 'graduated',
      enrolledOn: `${2026 - 4 - Math.floor(rnd() * 6)}-08-12`,
      withdrawnOn: '2026-06-05',
      birthDate: birthDateFor('8', 2025),
    })
  }
  const nonEnrolledRaces = shuffle(['white', 'white', 'white', 'white', 'hispanicLatino', 'black', 'asian', 'twoOrMore'])
  others.forEach((s, i) => {
    s.race = nonEnrolledRaces[i % nonEnrolledRaces.length]
    s.gender = i % 2 ? 'female' : 'male'
    s.ethnicity = s.race === 'hispanicLatino' ? 'hispanic' : 'nonHispanic'
  })

  // Names + stable external ids (the academics loader matches test rows on these).
  const used = new Set()
  const all = [...enrolled, ...others]
  all.forEach((s, i) => {
    let first, last, key
    do {
      first = pick(s.gender === 'female' ? FIRST_F : FIRST_M)
      last = pick(LAST)
      key = `${first} ${last}`
    } while (used.has(key))
    used.add(key)
    s.firstName = first
    s.lastName = last
    s.externalId = `SAA-${pad(10001 + i, 5)}`
  })
  return all
}

function toDto(s) {
  const dto = {
    firstName: s.firstName,
    lastName: s.lastName,
    grade: s.grade,
    gender: s.gender,
    race: s.race,
    ethnicity: s.ethnicity,
    birthDate: s.birthDate,
    status: s.status,
    externalId: s.externalId,
    hasIep: !!s.hasIep,
    has504: !!s.has504,
    ell: !!s.ell,
  }
  if (s.enrolledOn) dto.enrolledOn = s.enrolledOn
  if (s.withdrawnOn) dto.withdrawnOn = s.withdrawnOn
  return dto
}

// ── Helpers on the product API ───────────────────────────────────────────────
async function periodsOf(schoolId) {
  return (await get(`/schools/${schoolId}/periods`)) ?? []
}
async function periodFor(schoolId, fyEnd) {
  const list = await periodsOf(schoolId)
  const hits = list.filter((p) => p.periodEndDate === `${fyEnd}-06-30`)
  if (hits.length > 1) console.log(`  WARN ${fyEnd}: ${hits.length} periods share this end date (${hits.map((h) => h.periodType).join(', ')})`)
  return hits.find((p) => p.hasSnapshot) ?? hits[0] ?? null
}

async function fileHeadcount(key, fyEnd, byGrade) {
  const s = SCHOOL[key]
  const observedOn = censusDate(fyEnd)
  const res = await post(`/schools/${s.id}/enrollment/manual`, { observedOn, byGrade })
  const total = sum(byGrade)
  // The promote never overwrites a hand-entered operational figure; if another
  // writer typed one first, line it up with the census so every surface agrees.
  const op = await get(`/schools/${s.id}/periods/${res.fiscalPeriodId}/operational`)
  let note = res.promoted ? 'promoted' : 'kept'
  if ((op?.enrollment ?? null) !== total) {
    await put(`/schools/${s.id}/periods/${res.fiscalPeriodId}/operational`, { enrollment: total })
    note = `operational ${op?.enrollment ?? 'null'} → ${total}`
  }
  console.log(`  ${s.name} FY${String(fyEnd).slice(2)} @ ${observedOn}: ${total} (${note})`)
  return res.fiscalPeriodId
}

// ── Steps ────────────────────────────────────────────────────────────────────
const report = { generatedAt: new Date().toISOString(), schools: { aurelia: {} } }

async function stepHistory() {
  console.log('\n[history] St. Aurelia FY23–FY26 fall census (hand-entered)')
  report.schools.aurelia.history = {}
  for (const fy of [2023, 2024, 2025, 2026]) {
    await fileHeadcount('aurelia', fy, AURELIA[fy])
    report.schools.aurelia.history[`FY${fy}`] = sum(AURELIA[fy])
  }
}

async function stepRoster(register) {
  const s = SCHOOL.aurelia
  console.log(`\n[roster] ${s.name} live register (FY27)`)
  const have = new Map()
  for (let page = 1; ; page++) {
    const res = await get(`/schools/${s.id}/enrollment/students?page=${page}&pageSize=100`)
    const items = res?.items ?? res?.rows ?? res?.students ?? []
    for (const it of items) if (it.externalId) have.set(it.externalId, it)
    const total = res?.total ?? items.length
    if (items.length < 100 || page * 100 >= total) break
  }
  const missing = register.filter((r) => !have.has(r.externalId))
  const foreign = [...have.keys()].filter((id) => !register.some((r) => r.externalId === id))
  if (foreign.length) console.log(`  WARN ${foreign.length} students on file that this loader did not write`)
  console.log(`  on file ${have.size}, to create ${missing.length}`)
  for (let i = 0; i < missing.length; i += 150) {
    const chunk = missing.slice(i, i + 150).map(toDto)
    const r = await post(`/schools/${s.id}/enrollment/students/batch`, { students: chunk })
    console.log(`  batch created ${r.created}`)
  }
  const agg = await get(`/schools/${s.id}/enrollment/students/aggregate`)
  console.log(`  register: enrolled ${agg.kpis.enrolled} · waitlist ${agg.kpis.waitlist} · new this year ${agg.kpis.newThisYear} · flagged ${agg.kpis.flagged}`)
  console.log(`  status ${JSON.stringify(agg.counts.status)} · flags ${JSON.stringify(agg.counts.flags)}`)
  report.schools.aurelia.register = { kpis: agg.kpis, status: agg.counts.status, flags: agg.counts.flags, race: agg.counts.race }
}

async function stepPlan() {
  const s = SCHOOL.aurelia
  console.log(`\n[plan] ${s.name} FY26 grade-by-grade plan (operational form)`)
  const fy26 = await periodFor(s.id, 2026)
  if (!fy26) throw new Error('FY26 period missing — run the history step first')
  await put(`/schools/${s.id}/periods/${fy26.id}/operational`, { plannedEnrollmentByGrade: AURELIA_PLAN_FY26 })
  console.log(`  FY26 plan ${sum(AURELIA_PLAN_FY26)} vs actual ${sum(AURELIA[2026])} (grade 5 short)`)
  const fy27 = await periodFor(s.id, 2027)
  if (fy27) {
    // The SAME FY27 plan the driver budget carries, also typed on the plan form:
    // EnrollmentService.summary() (the overview band's "Gap to plan" / "Plan"
    // cards) reads only lines.assumptions / plannedEnrollmentByGrade — not the
    // driver budget's lines.driverModel.assumptions that analytics + the briefing
    // read — so without this the band says "No plan set" while the analytics tab
    // shows the plan. Identical numbers, so every surface agrees.
    await put(`/schools/${s.id}/periods/${fy27.id}/operational`, { plannedEnrollmentByGrade: AURELIA_PLAN_FY27 })
    console.log(`  FY27 plan ${sum(AURELIA_PLAN_FY27)} also on the plan form (overview band reads it)`)
    // e7 types the feeder live: the FY27 feeder row must start blank.
    const op = await get(`/schools/${s.id}/periods/${fy27.id}/operational`)
    if (op?.feederEnrollmentByGrade && Object.keys(op.feederEnrollmentByGrade).length) {
      await put(`/schools/${s.id}/periods/${fy27.id}/operational`, { feederEnrollmentByGrade: null })
      console.log('  FY27 feeder cleared')
    }
  }
}

// Florida K-8 parish-school pricing (fictional), set so the plan of record lands
// a modest surplus (~3.5%) against the FY26 books the finance loader uploads.
// The driver model has no tuition-assistance line, so the band prices here sit
// near FY26's NET tuition per student rather than the gross sticker price.
// Program split covers the state scholarships (FTC / FES) that pay a share of
// tuition at Florida schools. Overrides on the four driver expense lines are the
// NON-salary supplements (supplies, contracted services, insurance, utilities);
// the salary/benefit terms come from the staffing block.
const DRIVER_FY27 = {
  enrollmentByGrade: AURELIA_PLAN_FY27,
  tuitionRates: { prek3: 6600, prek5: 7600, elem: 8350, middle: 8750, high: 0 },
  tuitionProgramSplit: { parent: 46, ftc: 34, fes: 20 },
  feePerStudent: 350, // same registration fee the FY26 books carry (finance-model.mjs)
  staffing: {
    teachers: { count: 17, avgSalary: 52000 },
    admin: { count: 5, avgSalary: 66000 },
    facilities: { count: 3, avgSalary: 41000 },
    benefitsPct: 25,
  },
  inflationPct: 3,
  overrides: { instructional: 195000, admin: 52000, facilities: 212000, fixedOther: 340000 },
}

async function stepBudget() {
  const s = SCHOOL.aurelia
  console.log(`\n[budget] ${s.name} FY27 driver budget (the plan of record)`)
  const fy26 = await periodFor(s.id, 2026)
  if (!fy26?.hasSnapshot) {
    console.log('  NOTE FY26 books are not uploaded yet — the driver budget reads them as its prior year.')
    console.log('       Saving now; re-run with --only=budget after the finance loader to refresh the prior-year lines.')
  }
  const fy27 = await periodFor(s.id, 2027)
  if (!fy27) throw new Error('FY27 period missing — the roster step creates it')
  const r = await put(`/schools/${s.id}/periods/${fy27.id}/budget/driver`, { assumptions: DRIVER_FY27 })
  const k = r?.kpis ?? r?.driverModel?.kpis ?? r?.lines?.driverModel?.kpis ?? {}
  console.log(`  plan ${sum(AURELIA_PLAN_FY27)} students · net tuition/student ${k.netTuitionPerStudent ?? '?'} · revenue ${k.totalRevenue ?? '?'} · expense ${k.totalExpense ?? '?'}`)
  report.schools.aurelia.fy27Plan = { total: sum(AURELIA_PLAN_FY27), byGrade: AURELIA_PLAN_FY27, kpis: k }
}

async function stepOthers() {
  console.log('\n[others] headcounts for the rest of the network (Brightwater untouched)')
  for (const [key, cfg] of Object.entries(OTHERS)) {
    report.schools[key] = { history: {} }
    for (const [fy, byGrade] of Object.entries(cfg.years)) {
      await fileHeadcount(key, Number(fy), byGrade)
      report.schools[key].history[`FY${fy}`] = sum(byGrade)
    }
  }
}

// ── e2 files ─────────────────────────────────────────────────────────────────
// Spelled the way a diocesan office would — and tuned against the product's own
// matcher (school-match.ts): three pair automatically (1.00) and two land in the
// amber "review" tier for a one-click approve (Mangrove 0.74, Heron 0.67).
// NOTE: the storyboard's "St Aurelia Acad." scores 0.54 — below the 0.62 review
// floor — so it would show as UNMATCHED; "Cedar Ridge Prep" scores 0.59 (same).
const DIOCESAN_NAMES = {
  aurelia: 'Saint Aurelia Academy',
  cedar: 'Cedar Ridge Preparatory School',
  mangrove: 'Mangrove Point Catholic HS',
  odile: 'St Odile Catholic',
  heron: 'Heron Cove Acad.',
}
const DIOCESAN_FILE = path.join(FILES_DIR, 'Bayview Fall Census 2026-27.xlsx')
const ONEROSTER_FILE = path.join(FILES_DIR, 'brightwater-oneroster', 'users.csv')

function writeFiles() {
  console.log('\n[files] e2 on-camera files')
  fs.mkdirSync(path.dirname(ONEROSTER_FILE), { recursive: true })
  // Brightwater OneRoster users.csv — ≈120 students in 9–12, every grade ≥ 5.
  const bw = [['09', 33], ['10', 30], ['11', 29], ['12', 28]]
  const r2 = mulberry32(7700)
  const p2 = (a) => a[Math.floor(r2() * a.length)]
  const header = 'sourcedId,status,dateLastModified,enabledUser,orgSourcedIds,role,username,userIds,givenName,familyName,middleName,identifier,email,sms,phone,agentSourcedIds,grades,password'
  const lines = [header]
  const used = new Set()
  let n = 0
  for (const [g, count] of bw) {
    for (let i = 0; i < count; i++) {
      n++
      let given, family
      do {
        given = p2(r2() < 0.5 ? FIRST_F : FIRST_M)
        family = p2(LAST)
      } while (used.has(given + family))
      used.add(given + family)
      const id = `bw-stu-${pad(n, 4)}`
      lines.push(`${id},active,2026-10-01T07:00:00.000Z,true,bw-campus,student,,,${given},${family},,BW${pad(24000 + n, 5)},,,,,${g},`)
    }
  }
  fs.writeFileSync(ONEROSTER_FILE, lines.join('\n') + '\n')
  console.log(`  ${path.relative(REPO, ONEROSTER_FILE)}: ${n} students (${bw.map(([g, c]) => `${g}:${c}`).join(' ')})`)

  // One diocesan census workbook: one row per school, a column per grade.
  const require = createRequire(path.join(REPO, 'package.json'))
  const XLSX = require('/home/dream/dollaz/node_modules/.pnpm/xlsx@0.18.5/node_modules/xlsx')
  const cols = ['PK3', 'PK4', 'K', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
  const keyOf = (c) => (/^\d/.test(c) ? String(Number(c)) : c)
  const rows = [
    ['Bayview Catholic Schools — Office of the Superintendent'],
    ['Fall Enrollment Census 2026-27 · as of 10/01/2026'],
    [],
    ['School Name', ...cols, 'Total'],
  ]
  const census = { aurelia: AURELIA[2027], ...Object.fromEntries(Object.entries(OTHERS).map(([k, v]) => [k, v.census2027])) }
  for (const key of ['aurelia', 'cedar', 'mangrove', 'odile', 'heron']) {
    const g = census[key]
    rows.push([DIOCESAN_NAMES[key], ...cols.map((c) => g[keyOf(c)] ?? ''), sum(g)])
  }
  const totals = cols.map((c) => Object.values(census).reduce((s, g) => s + (g[keyOf(c)] ?? 0), 0))
  rows.push(['Total', ...totals.map((t) => t || ''), totals.reduce((a, b) => a + b, 0)])
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 30 }, ...cols.map(() => ({ wch: 6 })), { wch: 8 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Fall Census')
  fs.writeFileSync(DIOCESAN_FILE, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  console.log(`  ${path.relative(REPO, DIOCESAN_FILE)}: 5 schools`)
  report.files = { oneroster: ONEROSTER_FILE, diocesan: DIOCESAN_FILE, diocesanNames: DIOCESAN_NAMES }
}

// Stage the diocesan file through the org import (exactly what e2 does), read the
// match table, then DISCARD it — nothing is applied, no alias is learned.
async function stepDiocesanCheck() {
  console.log('\n[diocesan-check] stage → read matches → discard')
  const fd = new FormData()
  fd.append('file', new Blob([fs.readFileSync(DIOCESAN_FILE)]), path.basename(DIOCESAN_FILE))
  const res = await post(`/organizations/${ORG_ID}/enrollment/imports`, fd, { form: true })
  const rows = res?.rows ?? res?.import?.rows ?? []
  if (args.debug) console.log(JSON.stringify({ ...res, rows: rows.slice(0, 2) }, null, 1).slice(0, 3000))
  console.log(`  summary ${JSON.stringify(res?.summary ?? {})}`)
  for (const r of rows) {
    const best = r.match ?? r.candidates?.[0] ?? null
    console.log(`  "${r.sourceName}" → ${best?.name ?? '—'} · ${r.tier} / ${r.decision} (${best?.confidence != null ? Number(best.confidence).toFixed(2) : '—'}) · total ${r.total ?? r.totalEnrolled ?? '?'}`)
  }
  report.diocesanPreview = { summary: res?.summary, rows: rows.map((r) => ({ sourceName: r.sourceName, tier: r.tier, decision: r.decision, matched: (r.match ?? r.candidates?.[0])?.name ?? null })) }
  const id = res?.importId ?? res?.id ?? res?.import?.id
  if (id) {
    await call('DELETE', `/organizations/${ORG_ID}/enrollment/imports/${id}`)
    console.log(`  discarded staged import ${id}`)
  } else {
    console.log('  WARN no import id in the preview response — check for a staged import')
  }
}

// ── Run ──────────────────────────────────────────────────────────────────────
const register = buildAureliaRegister()
const enrolledCount = register.filter((r) => r.status === 'enrolled').length
if (enrolledCount !== sum(AURELIA[2027])) throw new Error('register does not match the FY27 vector')

await login()
console.log(`logged in as ${manifest.user.email} (token held in memory only)`)

if (step('history')) await stepHistory()
if (step('roster')) await stepRoster(register)
if (step('plan')) await stepPlan()
if (step('budget')) await stepBudget()
if (step('others')) await stepOthers()
if (step('files')) writeFiles()
if (step('diocesan-check')) {
  if (!fs.existsSync(DIOCESAN_FILE)) writeFiles()
  await stepDiocesanCheck()
}

// Manifest for the other loaders/capture: counts + external ids (gitignored dir).
fs.mkdirSync(OUT_DIR, { recursive: true })
const prev = fs.existsSync(path.join(OUT_DIR, 'enrollment.json'))
  ? JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'enrollment.json'), 'utf8'))
  : {}
const merged = {
  ...prev,
  ...report,
  schools: Object.fromEntries(
    [...new Set([...Object.keys(prev.schools ?? {}), ...Object.keys(report.schools)])].map((k) => [k, { ...(prev.schools?.[k] ?? {}), ...(report.schools[k] ?? {}) }]),
  ),
  aurelia: {
    fy27ByGrade: AURELIA[2027],
    fy27Plan: AURELIA_PLAN_FY27,
    fy26Plan: AURELIA_PLAN_FY26,
    history: Object.fromEntries(Object.entries(AURELIA).map(([y, g]) => [`FY${y}`, g])),
  },
  others: Object.fromEntries(Object.entries(OTHERS).map(([k, v]) => [k, v.years])),
}
fs.writeFileSync(path.join(OUT_DIR, 'enrollment.json'), JSON.stringify(merged, null, 2))
// Fictional register (names included, for the academics loader's id matching) —
// gitignored out dir, never filmed.
fs.writeFileSync(
  path.join(OUT_DIR, 'enrollment-aurelia-register.json'),
  JSON.stringify(register.map(({ externalId, firstName, lastName, grade, status, birthDate, hasIep, has504, ell }) => ({ externalId, firstName, lastName, grade, status, birthDate, iep: !!hasIep, plan504: !!has504, ell: !!ell })), null, 1),
)
console.log('\nwrote seed-v4/out/enrollment.json + enrollment-aurelia-register.json')

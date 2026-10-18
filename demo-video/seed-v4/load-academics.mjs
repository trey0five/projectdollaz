#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// KYRO demo v4 — ACADEMICS content loader (storyboard §E, scenes a1–a7).
//
// Front door only: logs in ONCE as Morgan (POST /auth/login with the password in
// the gitignored demo-video/.env.capture.local), keeps the token in memory, and
// loads every row through the same product routes the web UI calls:
//
//   POST /organizations/:org/academics/assessments/{upload,commit}  network files
//   POST /schools/:id/academics/assessments/{upload,commit}         student + objective files
//   POST /schools/:id/academics/gradebook/{upload,commit}           marks
//   POST /schools/:id/academics/lesson-plans                        lesson plans
//
// What it loads (all fictional — Bayview Catholic Schools, Florida):
//   • TerraNova (national percentiles) for the PK–8 trio — St. Aurelia, St. Odile,
//     Heron Cove — 2024, 2025, 2026, grades 3–8 × reading/language/math/science/
//     social studies. 2024–25 = off-camera history file; 2026 = THE a1 FILE, saved
//     to demo-video/assets/v4-files/ (it is the file dropped on camera; a
//     re-commit is an idempotent upsert of the same numbers).
//   • St. Aurelia student-level TerraNova 2024–26 (Student ID only — no names in
//     the files), matched to the enrollment roster by external id when the
//     roster is loaded; support flags come from the roster. Never filmed.
//   • TerraNova objective summaries (2025, 2026) for the trio → Strengths /
//     Opportunities.
//   • ACT 2025 + 2026 for the three 9–12 schools (Cedar Ridge ~94% tested,
//     Mangrove Point ~65% → "read with care", Brightwater ~84%); SAT 2025 + 2026
//     for Cedar Ridge and Mangrove Point.
//   • Gradebook marks (St. Aurelia, Cedar Ridge) and lesson plans (all six), so
//     the overview never shows the "No gradebook data / No lesson plans" tiles.
//
// Designed outcomes (2026, all grades): St. Aurelia ranks 2nd of 3 on TerraNova,
// ~+3 against the network, math its widest gap (one red heat-map cell: Grade 5
// math), +4 on last year (improving), ~95% participation. Quadrant corners:
// St. Aurelia ahead & rising, St. Odile ahead & falling, Heron Cove behind but
// rising. Cohort "Grades 3 → 5" climbs.
//
// Idempotent: every commit is an upsert / replace-this-slice in the product; a
// state file (seed-v4/out/academics/state.json) skips files already committed
// with identical bytes so the import history is not cluttered. --force re-sends.
// Lesson plans are created only when a plan with the same title is missing.
//
// Usage: node load-academics.mjs [--api http://127.0.0.1:8000] [--force] [--dry]
// Never prints the password or the token.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const REPO = '/home/dream/dollaz'
const args = process.argv.slice(2)
const flag = (k) => args.includes(k)
const opt = (k, d) => {
  const i = args.indexOf(k)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}
const API = opt('--api', 'http://127.0.0.1:8000')
const FORCE = flag('--force')
const DRY = flag('--dry')

if (!/^http:\/\/(127\.0\.0\.1|localhost):8000$/.test(API)) {
  console.error('Refusing: this loader only talks to the LOCAL api on :8000.')
  process.exit(2)
}

const OUT = path.join(REPO, 'demo-video/seed-v4/out/academics')
const ASSETS = path.join(REPO, 'demo-video/assets/v4-files')
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(ASSETS, { recursive: true })
const STATE_FILE = path.join(OUT, 'state.json')
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : { committed: {} }
const saveState = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))

const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'demo-video/seed-v4/out/structure.json'), 'utf8'))
const ORG_ID = manifest.org.id
const S = Object.fromEntries(manifest.schools.map((s) => [s.key, s]))
for (const k of ['aurelia', 'odile', 'heron', 'cedar', 'mangrove', 'brightwater']) {
  if (!S[k]) throw new Error(`structure.json has no school "${k}"`)
}

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(REPO, 'demo-video/.env.capture.local'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
)
if (env.MORGAN_EMAIL !== 'morgan@demo.example.com') throw new Error('capture env is not the Morgan demo account')

// ── deterministic randomness ─────────────────────────────────────────────────
function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function gauss(r) {
  const u = Math.max(1e-12, r())
  const v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
function erf(x) {
  const s = Math.sign(x)
  x = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * x)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return s * y
}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2))
const npr = (z) => Math.min(99, Math.max(1, Math.round(100 * Phi(z))))
const r1 = (v) => Math.round(v * 10) / 10
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

// ── the design ───────────────────────────────────────────────────────────────
const YEARS = [2024, 2025, 2026]
const GRADES = [3, 4, 5, 6, 7, 8]
const SUBJ = ['reading', 'language', 'math', 'science', 'socialStudies']
const SUBJ_HEADER = { reading: 'Reading', language: 'Language', math: 'Mathematics', science: 'Science', socialStudies: 'Social Studies' }
/** The roster's "current" school year (2026-27 → spring label 2027). */
const ROSTER_YEAR = 2027

const testers = {
  aurelia: (y, g) => 16 + ((y * 3 + g * 5) % 4),
  odile: (y, g) => 23 + ((y + g * 2) % 5),
  heron: (y, g) => 16 + ((y * 2 + g) % 4),
}
const eligible = {
  aurelia: (y, g) => testers.aurelia(y, g) + 1 + ((y + g) % 5 === 0 ? 1 : 0),
  odile: (y, g) => testers.odile(y, g) + 1,
  heron: (y, g) => testers.heron(y, g) + 2,
}

// Peers: base composite by year + subject + grade offsets (national percentiles).
const PEER = {
  odile: {
    base: { 2024: 70, 2025: 69, 2026: 67 },
    subj: { reading: 2, language: 0, math: 2, science: -1, socialStudies: -3 },
    grade: { 3: 1, 4: 0, 5: 1.5, 6: -1, 7: 0.5, 8: -1 },
  },
  heron: {
    base: { 2024: 48, 2025: 47.5, 2026: 50 },
    subj: { reading: -2, language: 1, math: 2, science: 0, socialStudies: -1 },
    grade: { 3: 2, 4: -1, 5: 0, 6: 1, 7: -2, 8: 0 },
  },
}
function peerT(key, y, g, j) {
  const p = PEER[key]
  const wobble = (((y * 7 + g * 3 + SUBJ.indexOf(j) * 5) % 5) - 2) * 0.4
  return p.base[y] + p.subj[j] + p.grade[g] + wobble
}

// St. Aurelia: the peer cell + a year gap + a subject profile + small variation
// + the one deliberate dip (Grade 5 math, 2026).
const AUR_TARGET = { 2024: 56, 2025: 59, 2026: 63 }
const AUR_SUBJ = { reading: 3, language: 0, math: -6, science: 0, socialStudies: 3 }
const AUR_SPECIAL = (y, g, j) => (y === 2026 && g === 5 && j === 'math' ? -15 : 0)
const AUR_V = (g, j) => (((g * 7 + SUBJ.indexOf(j) * 3) % 5) - 2) * 0.6
// The cohort that is 5th grade in 2026 started lower and grew clearly (≥5 NPR).
const AUR_GRADE_ADJ = (y, g) => (y === 2024 && g === 3 ? -2.5 : y === 2026 && g === 5 ? 2.5 : 0)

function peerCell(y, g, j) {
  const wo = testers.odile(y, g)
  const wh = testers.heron(y, g)
  return (peerT('odile', y, g, j) * wo + peerT('heron', y, g, j) * wh) / (wo + wh)
}
const AUR = {}
for (const y of YEARS) {
  // Solve the year gap so the tester-weighted school composite hits the target.
  let num = 0
  let den = 0
  for (const g of GRADES) {
    const w = testers.aurelia(y, g)
    for (const j of SUBJ) {
      num += (peerCell(y, g, j) + AUR_SUBJ[j] + AUR_V(g, j) + AUR_SPECIAL(y, g, j) + AUR_GRADE_ADJ(y, g)) * w
      den += w
    }
  }
  const gap = AUR_TARGET[y] - num / den
  AUR[y] = {}
  for (const g of GRADES) {
    AUR[y][g] = {}
    for (const j of SUBJ) AUR[y][g][j] = peerCell(y, g, j) + gap + AUR_SUBJ[j] + AUR_V(g, j) + AUR_SPECIAL(y, g, j) + AUR_GRADE_ADJ(y, g)
  }
}

// ── St. Aurelia roster (enrollment module's data — READ ONLY here) ───────────
async function fetchRoster(get, schoolId) {
  const out = []
  for (let page = 1; page < 50; page++) {
    const r = await get(`/schools/${schoolId}/enrollment/students?page=${page}&pageSize=100`)
    if (r.status !== 200) return { ok: false, status: r.status, students: [] }
    const items = r.body?.items ?? []
    for (const s of items) {
      // Keep only what matching + subgroups need — never names.
      out.push({
        externalId: s.externalId ?? null,
        grade: s.grade,
        status: s.status,
        hasIep: !!s.hasIep,
        has504: !!s.has504,
        ell: !!s.ell,
      })
    }
    if (items.length < 100) break
  }
  return { ok: true, students: out }
}

/** Build the per-student TerraNova rows for one (year, grade). */
function aureliaStudents(y, g, roster) {
  const N = testers.aurelia(y, g)
  const r = rng(`aur|${y}|${g}`)
  const a = Array.from({ length: N }, () => gauss(r))
  const e = Array.from({ length: N }, () => SUBJ.map(() => gauss(r)))
  const lat = (i, k) => Math.sqrt(0.7) * a[i] + Math.sqrt(0.3) * e[i][k]
  const scores = Array.from({ length: N }, () => ({}))
  // Solve each subject's shift so the mean of integer percentiles hits the target.
  SUBJ.forEach((j, k) => {
    const target = AUR[y][g][j]
    let lo = -3
    let hi = 3
    for (let it = 0; it < 60; it++) {
      const mid = (lo + hi) / 2
      const m = mean(a.map((_, i) => npr(mid + lat(i, k))))
      if (m < target) lo = mid
      else hi = mid
    }
    const d = (lo + hi) / 2
    for (let i = 0; i < N; i++) scores[i][j] = npr(d + lat(i, k))
  })
  // Composite: the student's overall standing, on its own unit scale.
  const zbar = a.map((_, i) => mean(SUBJ.map((_, k) => lat(i, k))))
  const zm = mean(zbar)
  const zs = Math.sqrt(mean(zbar.map((v) => (v - zm) ** 2))) || 1
  const std = zbar.map((v) => (v - zm) / zs)
  const cTarget = mean(SUBJ.map((j) => AUR[y][g][j]))
  let lo = -3
  let hi = 3
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2
    if (mean(std.map((v) => npr(mid + v))) < cTarget) lo = mid
    else hi = mid
  }
  const dc = (lo + hi) / 2
  for (let i = 0; i < N; i++) scores[i].total = npr(dc + std[i])

  // Who sat in which slot: roster students in the grade they were in that year,
  // then synthetic ids for testers no longer on the roster (moved on/graduated).
  const rosterGradeNow = String(g + (ROSTER_YEAR - y))
  const pool = roster.filter((s) => s.externalId && s.status === 'enrolled' && s.grade === rosterGradeNow)
  pool.sort((p, q) => p.externalId.localeCompare(q.externalId))
  const pr = rng(`aur-pick|${y}|${g}`)
  const people = pool.slice(0, N).map((s) => {
    const mult = Math.min(s.hasIep ? 0.45 : 1, s.ell ? 0.65 : 1, s.has504 ? 0.75 : 1)
    return { id: s.externalId, prio: pr() * mult, matched: true }
  })
  for (let i = people.length; i < N; i++) {
    people.push({ id: `BV-TN-${y}-${String(g).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`, prio: pr(), matched: false })
  }
  // Lowest priority takes the lowest composite: flagged students sit lower,
  // and because scores are only PERMUTED among slots, every mean is unchanged.
  const slots = scores.map((s, i) => ({ s, i })).sort((p, q) => p.s.total - q.s.total || p.i - q.i)
  const order = [...people].sort((p, q) => p.prio - q.prio)
  return order.map((p, k) => ({ studentId: p.id, matched: p.matched, grade: g, year: y, ...slots[k].s }))
}

// ── files ────────────────────────────────────────────────────────────────────
const csvCell = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'

function nrtNetworkFile(years, studentRowsByYG) {
  const head = ['School', 'Grade', 'Year', 'Students Tested', 'Students Eligible', ...SUBJ.map((j) => SUBJ_HEADER[j]), 'Total Battery']
  const rows = [head]
  for (const y of years) {
    for (const key of ['aurelia', 'odile', 'heron']) {
      for (const g of GRADES) {
        let subj
        let total
        let tested
        if (key === 'aurelia') {
          // St. Aurelia's line is the SAME numbers its student file derives, so
          // the summary and the register can never disagree.
          const st = studentRowsByYG[`${y}|${g}`]
          tested = st.length
          subj = SUBJ.map((j) => r1(mean(st.map((s) => s[j]))))
          total = r1(mean(st.map((s) => s.total)))
        } else {
          tested = testers[key](y, g)
          subj = SUBJ.map((j) => r1(peerT(key, y, g, j)))
          total = r1(mean(SUBJ.map((j) => peerT(key, y, g, j))))
        }
        rows.push([S[key].name, String(g), String(y), tested, eligible[key](y, g), ...subj, total])
      }
    }
  }
  return toCsv(rows)
}

// ACT: composite + four sections, grades 11 and 12.
const ACT = {
  cedar: { 2025: { 11: [23.9, 86, 92], 12: [24.3, 82, 88] }, 2026: { 11: [24.6, 88, 93], 12: [25.0, 85, 90] }, sec: [0.4, -0.6, 0.8, -0.4] },
  mangrove: { 2025: { 11: [25.8, 70, 108], 12: [25.4, 68, 104] }, 2026: { 11: [25.3, 71, 110], 12: [25.1, 69, 106] }, sec: [0.6, -0.9, 1.0, -0.5] },
  brightwater: { 2025: { 11: [21.4, 48, 57], 12: [21.8, 47, 56] }, 2026: { 11: [22.3, 50, 58], 12: [22.6, 49, 58] }, sec: [0.2, -0.7, 0.9, -0.3] },
}
function actFile() {
  const rows = [['School', 'Grade', 'Year', 'Students Tested', 'Students Eligible', 'English', 'Mathematics', 'Reading', 'Science', 'Composite']]
  for (const y of [2025, 2026]) {
    for (const key of ['cedar', 'mangrove', 'brightwater']) {
      for (const g of [11, 12]) {
        const [c, t, e] = ACT[key][y][g]
        const sec = ACT[key].sec.map((d) => r1(c + d))
        rows.push([S[key].name, String(g), String(y), t, e, ...sec, c])
      }
    }
  }
  return toCsv(rows)
}
const SAT = {
  cedar: { 2025: { 11: [1138, 80, 92], 12: [1152, 78, 88] }, 2026: { 11: [1150, 82, 93], 12: [1166, 80, 90] } },
  mangrove: { 2025: { 11: [1176, 64, 108], 12: [1190, 62, 104] }, 2026: { 11: [1172, 66, 110], 12: [1184, 64, 106] } },
}
function satFile() {
  const rows = [['School', 'Grade', 'Year', 'Students Tested', 'Students Eligible', 'Evidence-Based Reading and Writing', 'Math', 'Total']]
  for (const y of [2025, 2026]) {
    for (const key of ['cedar', 'mangrove']) {
      for (const g of [11, 12]) {
        const [t, n, e] = SAT[key][y][g]
        rows.push([S[key].name, String(g), String(y), n, e, Math.round(t / 2 + 8), Math.round(t / 2 - 8), t])
      }
    }
  }
  return toCsv(rows)
}

function aureliaStudentFile(y, rowsByYG) {
  const rows = [['Student ID', 'Grade', 'Year', ...SUBJ.map((j) => SUBJ_HEADER[j]), 'Total Battery']]
  for (const g of GRADES) {
    for (const s of rowsByYG[`${y}|${g}`]) rows.push([s.studentId, String(g), String(y), ...SUBJ.map((j) => s[j]), s.total])
  }
  return toCsv(rows)
}

// TerraNova objectives (publisher's own skill groupings).
const OBJECTIVES = {
  reading: [['02', 'Basic understanding', 4], ['03', 'Analyze text', 0], ['04', 'Evaluate and extend meaning', -3], ['05', 'Identify reading strategies', 1]],
  language: [['07', 'Sentence structure', 2], ['08', 'Writing strategies', -2], ['09', 'Editing skills', 0]],
  math: [['10', 'Number and number relations', 3], ['11', 'Computation and numerical estimation', 1], ['13', 'Measurement', -4], ['14', 'Geometry and spatial sense', -1], ['16', 'Patterns, functions, algebra', -2]],
  science: [['19', 'Science inquiry', 1], ['21', 'Physical science', -1], ['22', 'Life science', 2], ['23', 'Earth and space science', -2]],
  socialStudies: [['26', 'Geographic perspectives', 1], ['27', 'Historical and cultural perspectives', 0], ['28', 'Civics and government perspectives', -1], ['29', 'Economic perspectives', -2]],
}
// St. Aurelia's specific strengths and soft spots (2026), in specific grades.
const AUR_OBJ_SPECIAL = {
  'reading|Evaluate and extend meaning|7': 14,
  'language|Writing strategies|4': 12,
  'socialStudies|Historical and cultural perspectives|6': 13,
  'science|Life science|8': 11,
  'reading|Analyze text|3': 10,
  'math|Measurement|5': -18,
  'math|Computation and numerical estimation|5': -14,
  'math|Geometry and spatial sense|6': -10,
  'science|Earth and space science|4': -9,
  'language|Editing skills|8': -8,
}
function objectiveFile(key, y, testedFor) {
  const rows = [['Year', 'Grade', 'Subject', 'Objective Code', 'Objective', 'OPI', 'Students Tested']]
  const r = rng(`obj|${key}|${y}`)
  for (const g of GRADES) {
    for (const j of SUBJ) {
      const cellScore = key === 'aurelia' ? AUR[y][g][j] : peerT(key, y, g, j)
      for (const [code, label, off] of OBJECTIVES[j]) {
        // A neutral mastery index tied to the cell's percentile, the objective's
        // own difficulty, and a little noise.
        let opi = 50 + 0.45 * (cellScore - 55) + off + (r() - 0.5) * 3
        if (key === 'aurelia') {
          // Specials sit on top of a NEUTRALISED subject profile, so the lists
          // are led by the named skills rather than whole columns.
          opi -= 0.45 * (AUR_SUBJ[j] + AUR_SPECIAL(y, g, j))
          if (y === 2026) opi += AUR_OBJ_SPECIAL[`${j}|${label}|${g}`] ?? 0
          else opi += (AUR_OBJ_SPECIAL[`${j}|${label}|${g}`] ?? 0) * 0.5
        }
        rows.push([String(y), String(g), SUBJ_HEADER[j], code, label, r1(Math.min(97, Math.max(8, opi))), testedFor(g)])
      }
    }
  }
  return toCsv(rows)
}

// Gradebook (current year, quarter 1).
const AUR_COURSES = [
  ['Mathematics', 'Mrs. Halvorsen'],
  ['English Language Arts', 'Mr. Okafor'],
  ['Science', 'Ms. Delacroix'],
  ['Social Studies', 'Mr. Brennick'],
  ['Religion', 'Sr. Marguerite'],
]
const LETTER = (n) => (n >= 93 ? 'A' : n >= 90 ? 'A-' : n >= 87 ? 'B+' : n >= 83 ? 'B' : n >= 80 ? 'B-' : n >= 77 ? 'C+' : n >= 73 ? 'C' : n >= 70 ? 'C-' : 'D+')
function aureliaGradebook(roster) {
  const rows = [['Student ID', 'Grade Level', 'Course', 'Teacher', 'Term', 'Year', 'Final Grade']]
  const r = rng('aur-gb')
  for (const g of GRADES) {
    let pool = roster.filter((s) => s.externalId && s.status === 'enrolled' && s.grade === String(g)).map((s) => s.externalId)
    pool.sort()
    if (pool.length < 12) {
      pool = pool.concat(Array.from({ length: 18 - pool.length }, (_, i) => `BV-GB-${g}-${String(i + 1).padStart(3, '0')}`))
    }
    for (const id of pool) {
      const base = 84 + gauss(r) * 6
      for (const [course, teacher] of AUR_COURSES) {
        const n = Math.round(Math.min(99, Math.max(66, base + gauss(r) * 4)))
        rows.push([id, String(g), `Grade ${g} ${course}`, teacher, 'Q1', '2027', String(n)])
      }
    }
  }
  return toCsv(rows)
}
const CEDAR_COURSES = [
  ['Algebra II', 'Mr. Vantongeren', 10],
  ['AP Biology', 'Dr. Aldana-Reyes', 11],
  ['English 11', 'Ms. Prendergast', 11],
  ['U.S. History', 'Mr. Szymborski', 11],
  ['Theology III', 'Fr. Castellane', 11],
  ['Pre-Calculus', 'Mrs. Ilunga', 12],
]
function cedarGradebook() {
  const rows = [['Student ID', 'Grade Level', 'Course', 'Teacher', 'Term', 'Year', 'Final Grade']]
  const r = rng('cedar-gb')
  for (const [course, teacher, g] of CEDAR_COURSES) {
    for (let i = 1; i <= 24; i++) {
      const n = Math.round(Math.min(99, Math.max(64, 85 + gauss(r) * 7)))
      rows.push([`CR-${g}-${String(i).padStart(3, '0')}`, String(g), course, teacher, 'Q1', '2027', String(n)])
    }
  }
  return toCsv(rows)
}

const LESSON_PLANS = {
  aurelia: [
    ['Fractions on a number line', 'math', '4', 'Mrs. Halvorsen', 'delivered', '2026-09-15'],
    ['Measurement: converting units with ratio tables', 'math', '5', 'Mrs. Halvorsen', 'planned', '2026-10-20'],
    ['Area and perimeter in the real world', 'math', '5', 'Mrs. Halvorsen', 'draft', '2026-10-27'],
    ['Making inferences from informational text', 'reading', '6', 'Mr. Okafor', 'reviewed', '2026-09-08'],
    ['Persuasive paragraph: claim, reason, evidence', 'language', '7', 'Mr. Okafor', 'delivered', '2026-09-29'],
    ['The water cycle lab', 'science', '4', 'Ms. Delacroix', 'delivered', '2026-09-22'],
    ['Earth and space: phases of the moon', 'science', '4', 'Ms. Delacroix', 'planned', '2026-10-21'],
    ['Florida geography and early settlements', 'socialStudies', '3', 'Mr. Brennick', 'planned', '2026-10-22'],
    ['Saints of the Americas research project', 'religion', '8', 'Sr. Marguerite', 'draft', '2026-11-03'],
  ],
  odile: [
    ['Multiplying decimals', 'math', '5', 'Ms. Ferraro', 'delivered', '2026-09-17'],
    ['Narrative writing workshop', 'language', '6', 'Mr. Lindqvist', 'planned', '2026-10-19'],
    ['Ecosystems field journal', 'science', '7', 'Mrs. Abernathy', 'reviewed', '2026-09-10'],
    ['Civics: how a bill becomes law', 'socialStudies', '8', 'Mr. Oyelaran', 'draft', '2026-10-28'],
  ],
  heron: [
    ['Place value to the millions', 'math', '4', 'Mrs. Quintero', 'delivered', '2026-09-16'],
    ['Reading closely: theme and evidence', 'reading', '7', 'Ms. Haverford', 'planned', '2026-10-20'],
    ['Simple machines build', 'science', '5', 'Mr. Delgado-Price', 'planned', '2026-10-23'],
    ['Ratios and rates', 'math', '6', 'Mrs. Quintero', 'draft', '2026-10-30'],
  ],
  cedar: [
    ['ACT science reasoning: data representation', 'science', '11', 'Dr. Aldana-Reyes', 'delivered', '2026-09-18'],
    ['Rhetorical analysis of founding documents', 'english', '11', 'Ms. Prendergast', 'reviewed', '2026-09-11'],
    ['Exponential and logarithmic models', 'math', '10', 'Mr. Vantongeren', 'planned', '2026-10-21'],
    ['Trig identities workshop', 'math', '12', 'Mrs. Ilunga', 'planned', '2026-10-22'],
    ['Catholic social teaching seminar', 'theology', '11', 'Fr. Castellane', 'draft', '2026-11-04'],
  ],
  mangrove: [
    ['SAT reading: command of evidence', 'reading', '11', 'Mr. Hollingsworth', 'delivered', '2026-09-24'],
    ['Chemistry: stoichiometry lab', 'science', '10', 'Ms. Barrientos', 'planned', '2026-10-20'],
    ['World history: the Renaissance', 'socialStudies', '9', 'Mr. Kettering', 'draft', '2026-10-29'],
  ],
  brightwater: [
    ['Algebra I: systems of equations', 'math', '9', 'Mrs. Oduya', 'planned', '2026-10-21'],
    ['Argumentative essay drafting', 'english', '10', 'Mr. Faulkner-Ruiz', 'delivered', '2026-09-30'],
    ['Marine biology: estuaries of Tampa Bay', 'science', '11', 'Ms. Whitcombe', 'planned', '2026-10-23'],
  ],
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function login() {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: env.MORGAN_EMAIL, password: env.MORGAN_PASSWORD }),
    })
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 20000
      console.log(`login 429 — backing off ${wait / 1000}s`)
      await sleep(wait)
      continue
    }
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`login HTTP ${res.status} ${body.code ?? ''}`)
    if (body.mfa_required) throw new Error('login asked for MFA')
    if (!body.access_token) throw new Error('login returned no access_token')
    return body.access_token
  }
  throw new Error('login rate-limited 6 times')
}

let TOKEN = null
const H = () => ({ authorization: `Bearer ${TOKEN}` })
async function get(p) {
  const r = await fetch(`${API}${p}`, { headers: H() })
  let body = null
  try {
    body = await r.json()
  } catch {}
  return { status: r.status, body }
}
async function postJson(p, data) {
  const r = await fetch(`${API}${p}`, { method: 'POST', headers: { ...H(), 'content-type': 'application/json' }, body: JSON.stringify(data) })
  let body = null
  try {
    body = await r.json()
  } catch {}
  return { status: r.status, body }
}
async function postFile(p, fileName, text, fields = {}) {
  const fd = new FormData()
  fd.append('file', new Blob([text], { type: 'text/csv' }), fileName)
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) fd.append(k, String(v))
  const r = await fetch(`${API}${p}`, { method: 'POST', headers: H(), body: fd })
  let body = null
  try {
    body = await r.json()
  } catch {}
  return { status: r.status, body }
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16)

/** Preview, then commit — the two calls the web upload makes. */
async function uploadPair({ label, base, fileName, text, fields = {}, expect }) {
  const h = sha(text + JSON.stringify(fields))
  if (!FORCE && state.committed[label] === h) {
    console.log(`skip   ${label} (already committed, same bytes)`)
    return { skipped: true }
  }
  const pv = await postFile(`${base}/upload`, fileName, text, fields)
  if (pv.status >= 300) throw new Error(`${label} preview HTTP ${pv.status}: ${JSON.stringify(pv.body)?.slice(0, 400)}`)
  const p = pv.body
  const brief = {
    scope: p.scope,
    testType: p.testType,
    years: p.years,
    rows: p.rows,
    ...(p.match ? { match: p.match } : {}),
    ...(p.schools ? { schoolsMatched: p.matched, unmatched: p.unmatched } : {}),
    warnings: p.warnings,
  }
  console.log(`preview ${label}: ${JSON.stringify(brief)}`)
  if (expect) expect(p)
  if (DRY) return { preview: p }
  const cm = await postFile(`${base}/commit`, fileName, text, fields)
  if (cm.status >= 300) throw new Error(`${label} commit HTTP ${cm.status}: ${JSON.stringify(cm.body)?.slice(0, 400)}`)
  const c = cm.body
  console.log(
    `commit  ${label}: ${JSON.stringify({ aggregatesUpserted: c.aggregatesUpserted, resultsCreated: c.resultsCreated, matched: c.matched, unmatched: c.unmatched, schoolsTouched: c.schoolsTouched, skipped: c.skipped, unresolved: c.unresolvedSchools, warnings: c.warnings })}`,
  )
  state.committed[label] = h
  saveState()
  return { preview: p, commit: c }
}

// ── run ──────────────────────────────────────────────────────────────────────
TOKEN = await login()
console.log('login  ok (Morgan, token in memory only)')

const schools = await get('/schools')
const mine = new Set((Array.isArray(schools.body) ? schools.body : schools.body?.items ?? []).map((s) => s.id))
for (const k of Object.keys(S)) if (!mine.has(S[k].id)) throw new Error(`Morgan cannot see ${S[k].name}`)

const rosterRes = await fetchRoster(get, S.aurelia.id)
const roster = rosterRes.students
const enrolled = roster.filter((s) => s.status === 'enrolled' && s.externalId)
console.log(
  `roster St. Aurelia: ${roster.length} students (${enrolled.length} enrolled with an external id; flags iep ${enrolled.filter((s) => s.hasIep).length} · 504 ${enrolled.filter((s) => s.has504).length} · ell ${enrolled.filter((s) => s.ell).length})`,
)

// Student rows for every (year, grade).
const byYG = {}
for (const y of YEARS) for (const g of GRADES) byYG[`${y}|${g}`] = aureliaStudents(y, g, roster)

// Design checks — fail loudly rather than load a dataset that films wrong.
const aurComp = (y, g) => mean(byYG[`${y}|${g}`].map((s) => s.total))
const climb = [aurComp(2024, 3), aurComp(2025, 4), aurComp(2026, 5)]
if (!(climb[0] < climb[1] && climb[1] < climb[2] && climb[2] - climb[0] >= 6)) throw new Error(`cohort 3→5 does not climb: ${climb.map(r1).join(' → ')}`)
console.log(`design cohort Grades 3 → 5 (Total Battery): ${climb.map(r1).join(' → ')}`)

const files = {
  history: { name: 'bayview-terranova-2024-2025-history.csv', text: nrtNetworkFile([2024, 2025], byYG) },
  a1: { name: 'bayview-terranova-2026-results.csv', text: nrtNetworkFile([2026], byYG) },
  act: { name: 'bayview-act-2025-2026.csv', text: actFile() },
  sat: { name: 'bayview-sat-2025-2026.csv', text: satFile() },
}
fs.writeFileSync(path.join(ASSETS, files.a1.name), files.a1.text)
for (const k of ['history', 'act', 'sat']) fs.writeFileSync(path.join(OUT, files[k].name), files[k].text)

const orgBase = `/organizations/${ORG_ID}/academics/assessments`
const expectSchools = (n) => (p) => {
  if (p.matched !== n || p.unmatched !== 0) throw new Error(`expected ${n} schools matched, got ${p.matched} (+${p.unmatched} unmatched)`)
  if ((p.warnings ?? []).length > 0) throw new Error(`unexpected warnings: ${p.warnings.join(' | ')}`)
}

// 1. Network TerraNova history (off camera), then the a1 file itself.
await uploadPair({ label: 'org-terranova-history', base: orgBase, fileName: files.history.name, text: files.history.text, fields: { testType: 'terranova' }, expect: expectSchools(3) })
// The a1 file is previewed WITHOUT a testType, exactly as the web panel sends it,
// so the take is known to read as TerraNova on its own.
await uploadPair({
  label: 'org-terranova-2026-a1',
  base: orgBase,
  fileName: files.a1.name,
  text: files.a1.text,
  fields: {},
  expect: (p) => {
    expectSchools(3)(p)
    if (p.testType !== 'terranova') throw new Error(`a1 file reads as ${p.testType}, not terranova`)
  },
})
// 2. ACT + SAT for the 9–12 schools.
await uploadPair({ label: 'org-act-2025-2026', base: orgBase, fileName: files.act.name, text: files.act.text, fields: { testType: 'act' }, expect: expectSchools(3) })
await uploadPair({ label: 'org-sat-2025-2026', base: orgBase, fileName: files.sat.name, text: files.sat.text, fields: { testType: 'sat' }, expect: expectSchools(2) })

// 3. St. Aurelia student-level files.
const aurBase = `/schools/${S.aurelia.id}/academics/assessments`
for (const y of YEARS) {
  const name = `st-aurelia-terranova-${y}-students.csv`
  const text = aureliaStudentFile(y, byYG)
  fs.writeFileSync(path.join(OUT, name), text)
  // The ids (and who sits in which slot) come from the roster, so a roster load
  // changes these bytes and the next run re-commits — and re-matches — by itself.
  await uploadPair({
    label: `aurelia-students-${y}`,
    base: aurBase,
    fileName: name,
    text,
    fields: { testType: 'terranova', schoolYear: y },
    expect: (p) => {
      if (p.scope !== 'student') throw new Error(`student file read as ${p.scope}`)
    },
  })
}

// 4. Objective summaries (2025, 2026) for the PK–8 trio, each through its own school.
for (const key of ['aurelia', 'odile', 'heron']) {
  for (const y of [2025, 2026]) {
    const name = `${key}-terranova-${y}-objectives.csv`
    const text = objectiveFile(key, y, (g) => (key === 'aurelia' ? byYG[`${y}|${g}`].length : testers[key](y, g)))
    fs.writeFileSync(path.join(OUT, name), text)
    await uploadPair({
      label: `objectives-${key}-${y}`,
      base: `/schools/${S[key].id}/academics/assessments`,
      fileName: name,
      text,
      fields: { testType: 'terranova', schoolYear: y },
    })
  }
}

// 5. Gradebook marks.
{
  const text = aureliaGradebook(roster)
  fs.writeFileSync(path.join(OUT, 'st-aurelia-gradebook-q1.csv'), text)
  await uploadPair({ label: 'gradebook-aurelia', base: `/schools/${S.aurelia.id}/academics/gradebook`, fileName: 'st-aurelia-gradebook-q1.csv', text, fields: { schoolYear: 2027, term: 'Q1' } })
}
{
  const text = cedarGradebook()
  fs.writeFileSync(path.join(OUT, 'cedar-ridge-gradebook-q1.csv'), text)
  await uploadPair({ label: 'gradebook-cedar', base: `/schools/${S.cedar.id}/academics/gradebook`, fileName: 'cedar-ridge-gradebook-q1.csv', text, fields: { schoolYear: 2027, term: 'Q1' } })
}

// Gradebook marks for the other four schools, so no overview reads "No gradebook data".
const OTHER_GB = {
  odile: [['Grade 5 Mathematics', 'Ms. Ferraro', 5], ['Grade 6 English Language Arts', 'Mr. Lindqvist', 6], ['Grade 7 Science', 'Mrs. Abernathy', 7], ['Grade 8 Social Studies', 'Mr. Oyelaran', 8]],
  heron: [['Grade 4 Mathematics', 'Mrs. Quintero', 4], ['Grade 7 English Language Arts', 'Ms. Haverford', 7], ['Grade 5 Science', 'Mr. Delgado-Price', 5]],
  mangrove: [['English 11', 'Mr. Hollingsworth', 11], ['Chemistry', 'Ms. Barrientos', 10], ['World History', 'Mr. Kettering', 9]],
  brightwater: [['Algebra I', 'Mrs. Oduya', 9], ['English 10', 'Mr. Faulkner-Ruiz', 10], ['Marine Biology', 'Ms. Whitcombe', 11]],
}
for (const [key, courses] of Object.entries(OTHER_GB)) {
  const rows = [['Student ID', 'Grade Level', 'Course', 'Teacher', 'Term', 'Year', 'Final Grade']]
  const r = rng(`${key}-gb`)
  const prefix = { odile: 'SO', heron: 'HC', mangrove: 'MP', brightwater: 'BW' }[key]
  for (const [course, teacher, g] of courses) {
    for (let i = 1; i <= 20; i++) {
      const n = Math.round(Math.min(99, Math.max(64, 84 + gauss(r) * 7)))
      rows.push([`${prefix}-${g}-${String(i).padStart(3, '0')}`, String(g), course, teacher, 'Q1', '2027', String(n)])
    }
  }
  const text = toCsv(rows)
  const name = `${key}-gradebook-q1.csv`
  fs.writeFileSync(path.join(OUT, name), text)
  await uploadPair({ label: `gradebook-${key}`, base: `/schools/${S[key].id}/academics/gradebook`, fileName: name, text, fields: { schoolYear: 2027, term: 'Q1' } })
}

// 6. Lesson plans — create only what is missing (matched by title).
for (const [key, plans] of Object.entries(LESSON_PLANS)) {
  const list = await get(`/schools/${S[key].id}/academics/lesson-plans`)
  const existing = new Set((Array.isArray(list.body) ? list.body : list.body?.items ?? []).map((p) => p.title))
  let made = 0
  for (const [title, subject, gradeLevel, teacherName, status, plannedOn] of plans) {
    if (existing.has(title)) continue
    if (DRY) continue
    const weekOf = (() => {
      const d = new Date(`${plannedOn}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
      return d.toISOString().slice(0, 10)
    })()
    const r = await postJson(`/schools/${S[key].id}/academics/lesson-plans`, { title, subject, gradeLevel, teacherName, status, plannedOn, weekOf })
    if (r.status >= 300) throw new Error(`lesson plan "${title}" HTTP ${r.status}: ${JSON.stringify(r.body)?.slice(0, 300)}`)
    made++
  }
  console.log(`lesson plans ${S[key].name}: ${made} created, ${existing.size} already there`)
}

// ── verification through the read routes ────────────────────────────────────
const fmt = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d))
const report = {}
{
  const d = (await get(`/schools/${S.aurelia.id}/academics/assessments/dashboard`)).body
  const k = d.kpis
  const subj = (d.subjects ?? []).map((s) => `${s.subject} ${fmt(s.variance)} (${s.standing})`).join(', ')
  const red = (d.heatmap ?? []).filter((c) => c.standing === 'below').map((c) => `G${c.grade} ${c.subject} ${fmt(c.variance)}`)
  const sup = (d.heatmap ?? []).filter((c) => c.suppressed).length
  const dist = (d.distribution ?? []).map((b) => `${b.band}:${b.count ?? 'x'}`).join(' ')
  const sg = d.subgroups
  const sgs = sg
    ? ['isp', 'plan504', 'ell'].map((g) => `${g} ${sg[g].withFlag.suppressed ? 'withheld' : `${fmt(sg[g].withFlag.value)} vs ${fmt(sg[g].without.value)} (n=${sg[g].withFlag.count})`}`).join(' · ')
    : 'none (no roster match)'
  const mv = (d.movements ?? []).map((m) => `${m.schoolName}: ${fmt(m.current)} (${m.change >= 0 ? '+' : ''}${fmt(m.change)})`).join(' | ')
  report.aurelia = {
    test: `${d.context?.testType} ${d.context?.year}`,
    average: `${fmt(k.average.value)} vs network ${fmt(k.average.peer)} (${k.average.standing})`,
    rank: `${k.rank.rank} of ${k.rank.of}`,
    yoy: fmt(k.yoy),
    trend: d.trendDirection,
    participation: k.participation.rate == null ? '—' : `${Math.round(k.participation.rate * 100)}% (comparable ${k.participation.comparable})`,
    subjects: subj,
    heatRed: red,
    heatSuppressed: sup,
    distribution: dist,
    subgroups: sgs,
    strengths: (d.objectives?.strengths ?? []).map((o) => `${o.subject}/${o.objectiveLabel} G${o.grade} ${fmt(o.variance)}`),
    opportunities: (d.objectives?.opportunities ?? []).map((o) => `${o.subject}/${o.objectiveLabel} G${o.grade} ${fmt(o.variance)}`),
    movements: mv,
    keyInsight: d.keyInsight,
  }
  const hp = (await get(`/schools/${S.aurelia.id}/academics/assessments/dashboard?hidePeerNames=true`)).body
  report.aurelia.hiddenPeers = (hp.schools ?? []).map((s) => s.schoolName).join(', ')
  const co = (await get(`/schools/${S.aurelia.id}/academics/assessments/cohorts`)).body
  report.aurelia.cohortPanels = (co.panels ?? []).map((p) => `${p.label}: ${(p.focus?.legs ?? []).map((x) => fmt(x.value)).join(' → ')} (${p.focus?.direction})`)
  report.aurelia.cohortContext = co.context ? { window: co.context.window, endYear: co.context.endYear ?? co.context.year } : null
}
{
  const d = (await get(`/schools/${S.cedar.id}/academics/assessments/dashboard?testType=act`)).body
  report.cedarAct = {
    test: `${d.context?.testType} ${d.context?.year}`,
    rank: `${d.kpis?.rank?.rank} of ${d.kpis?.rank?.of}`,
    table: (d.table ?? []).map((t) => `${t.schoolName}: ${fmt(t.prior)} → ${fmt(t.current)} (${t.change >= 0 ? '+' : ''}${fmt(t.change)}), tested ${t.tested}/${t.eligible} = ${t.participationRate == null ? '—' : Math.round(t.participationRate * 100) + '%'}`),
  }
  const dd = (await get(`/schools/${S.cedar.id}/academics/assessments/dashboard`)).body
  report.cedarDefaultTest = dd.context?.testType
}
{
  const o = (await get(`/organizations/${ORG_ID}/academics/dashboard`)).body
  report.org = { test: `${o.context?.testType} ${o.context?.year}`, schools: (o.schools ?? []).map((s) => `${s.rank}. ${s.schoolName} ${fmt(s.value)}`) }
}
for (const key of Object.keys(S)) {
  const st = (await get(`/schools/${S[key].id}/academics/status`)).body
  report[`status_${key}`] = `years ${JSON.stringify(st.assessments?.years)} · rows ${st.assessments?.rows} · gradebook ${st.gradebook?.total ?? 0} · plans ${st.lessonPlans?.total ?? 0}`
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))

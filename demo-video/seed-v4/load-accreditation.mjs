#!/usr/bin/env node
// KYRO demo v4 — ACCREDITATION + the lighter modules, loaded through the PRODUCT
// API as Morgan (storyboard §E: r1–r7, x1, o1, o2).
//
//   node demo-video/seed-v4/load-accreditation.mjs [--api http://127.0.0.1:8000] [--only a,b] [--rebaseline]
//
// RULES THIS FILE KEEPS
//   • ONE real password login (POST /auth/login) per run; tokens live in memory
//     only and are refreshed through POST /auth/refresh. Nothing is written to disk
//     but the id manifest (seed-v4/out/accreditation.json, gitignored, no secrets).
//   • Every row goes in through the same routes the web UI calls (apps/web/src/lib/
//     api.js), with bodies restricted to whitelisted DTO fields (the global
//     forbidNonWhitelisted ValidationPipe 400s anything else).
//   • Never seed-demo-accreditation.ts, never the readiness-history seeder — no
//     isDemo rows, no "DEMO DATA" chip. Cognia is adopted through the real
//     POST /accreditation/frameworks/:code/adopt.
//   • Idempotent: every create is list-then-create keyed on its title; existing rows
//     are PATCHed back to the desired state, so a re-run repairs drift.
//   • Touches ONLY: accreditation, improvement, governance, facilities, advancement,
//     HR (people/evaluations/clearances/PD + the staff-FTE fields of operational
//     data), strategy. Finance, enrollment and academics belong to other loaders.
//   • Dates are RELATIVE to the run day, so the demo shape (expiring in ~45 days,
//     next milestone in ~5 months) holds whenever it is re-run.
//
// Never prints the password or a token.
import fs from 'node:fs'
import path from 'node:path'

const REPO = '/home/dream/dollaz'
const argv = process.argv.slice(2)
const arg = (k, d = null) => {
  const i = argv.indexOf(k)
  return i >= 0 ? argv[i + 1] : d
}
const API = arg('--api', 'http://127.0.0.1:8000')
const ONLY = arg('--only') ? new Set(arg('--only').split(',')) : null
const REBASELINE = argv.includes('--rebaseline')
// --reset: put back what an r4 / o2 take changed (run it before each take).
//   r4 — clears any evidence attached on camera to the five Quickest-wins standards
//        and deletes improvement initiatives that are not part of this seed; the
//        normal pass then restores every rubric score (COG-11 back to unscored).
//   o2 — deletes the "gym roof" repair the Studio take proposes at St. Aurelia.
const RESET = argv.includes('--reset')
if (!/^http:\/\/(127\.0\.0\.1|localhost):8000$/.test(API)) {
  console.error('refusing: this loader only talks to the LOCAL api on :8000')
  process.exit(2)
}
const want = (k) => !ONLY || ONLY.has(k)

const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'demo-video/seed-v4/out/structure.json'), 'utf8'))
const SCHOOL = Object.fromEntries(manifest.schools.map((s) => [s.key, s]))
const AURELIA = SCHOOL.aurelia.id
const CEDAR = SCHOOL.cedar.id
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(REPO, 'demo-video/.env.capture.local'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
)

// ── dates, relative to the run day ───────────────────────────────────────────
const NOW = new Date()
const TODAY = NOW.toISOString().slice(0, 10)
const iso = (dt) => dt.toISOString().slice(0, 10)
const days = (n) => {
  const x = new Date(`${TODAY}T00:00:00Z`)
  x.setUTCDate(x.getUTCDate() + n)
  return iso(x)
}
const months = (n, fromIso = TODAY) => {
  const [y, m, d] = fromIso.split('-').map(Number)
  const x = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate()
  x.setUTCDate(Math.min(d, last))
  return iso(x)
}
const at = (isoDay, hh = 18) => `${isoDay}T${String(hh).padStart(2, '0')}:00:00.000Z`

// ── session: one login, in-memory tokens, refresh on 401, back off on 429 ────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let TOK = null
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
    if (body.mfa_required || !body.access_token) throw new Error('login did not return a session (MFA?)')
    TOK = { access: body.access_token, refresh: body.refresh_token, user: body.user }
    return
  }
  throw new Error('login rate-limited 6 times')
}
async function refresh() {
  const res = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: TOK.refresh }),
  })
  if (!res.ok) throw new Error(`refresh HTTP ${res.status}`)
  const b = await res.json()
  TOK.access = b.access_token
  TOK.refresh = b.refresh_token
}
let CALLS = 0
async function api(method, p, body) {
  for (let attempt = 0; attempt < 8; attempt++) {
    CALLS++
    const res = await fetch(`${API}${p}`, {
      method,
      headers: { authorization: `Bearer ${TOK.access}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (res.status === 401 && attempt === 0) {
      await refresh()
      continue
    }
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 5000
      await sleep(wait)
      continue
    }
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {}
    if (!res.ok) {
      const msg = json?.message ? (Array.isArray(json.message) ? json.message.join('; ') : json.message) : text.slice(0, 300)
      throw new Error(`${method} ${p} → ${res.status} ${json?.code ?? ''} ${msg}`)
    }
    return unwrap(json)
  }
  throw new Error(`${method} ${p} → gave up after retries`)
}
/** Creates answer { vendor: {...} } / { item: {...} } on some routes — unwrap a
 *  single-entity envelope so callers can read .id. Lists are left alone. */
function unwrap(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json) || json.id) return json
  const vals = Object.values(json)
  if (vals.length === 1 && vals[0] && typeof vals[0] === 'object' && !Array.isArray(vals[0]) && vals[0].id) return vals[0]
  return json
}
const get = (p) => api('GET', p)
const post = (p, b = {}) => api('POST', p, b)
const patch = (p, b) => api('PATCH', p, b)
const put = (p, b) => api('PUT', p, b)

const stats = { created: 0, updated: 0, kept: 0 }
const log = (...a) => console.log(...a)

/** Shallow "does the row already say this?" — only compares the keys we send. */
function differs(row, desired, keyMap = {}) {
  for (const [k, v] of Object.entries(desired)) {
    const rk = keyMap[k] ?? k
    let have = row?.[rk]
    if (have === undefined) continue // field not echoed → cannot compare, leave it
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && typeof have === 'string') {
      if (have.slice(0, 10) !== v.slice(0, 10)) return true
      continue
    }
    if (typeof v === 'number' && have !== null && have !== undefined) {
      if (Number(have) !== v) return true
      continue
    }
    if (Array.isArray(v)) {
      if (JSON.stringify([...(have ?? [])].sort()) !== JSON.stringify([...v].sort())) return true
      continue
    }
    if ((have ?? null) !== (v ?? null)) return true
  }
  return false
}

/** list-then-create-or-patch, keyed on a name field. Returns the row. */
async function ensure({ list, match, create, update, desired, label, keyMap, noPatch }) {
  const rows = await list()
  const hit = rows.find(match)
  if (!hit) {
    const row = await create(desired)
    stats.created++
    log(`  + ${label}`)
    return row
  }
  if (!noPatch && update && differs(hit, desired, keyMap)) {
    const row = await update(hit, desired)
    stats.updated++
    log(`  ~ ${label}`)
    return row ?? hit
  }
  stats.kept++
  return hit
}

const OUT = { generatedAt: new Date().toISOString(), today: TODAY, cedar: {}, aurelia: {} }

// ══════════════════════════════════════════════════════════════════════════════
// PEOPLE (governance people register — board + staff), per school
// ══════════════════════════════════════════════════════════════════════════════
const PEOPLE = {
  cedar: [
    { name: 'Margaret Ellison', title: 'Board Chair', groups: ['board'], termStart: months(-30), termEnd: months(18) },
    { name: 'Thomas Reyes', title: 'Vice Chair', groups: ['board'], termStart: months(-42), termEnd: months(6) },
    { name: 'Angela Brooks', title: 'Treasurer', groups: ['board', 'finance_team'], termStart: months(-20), termEnd: months(16) },
    { name: 'Daniel Whitfield', title: 'Secretary', groups: ['board'], termStart: months(-26), termEnd: months(10) },
    { name: 'Rev. Paul Okafor', title: 'Pastor, ex officio', groups: ['board'], termStart: months(-60), termEnd: null },
    { name: 'Lauren Castellano', title: 'Trustee', groups: ['board'], termStart: months(-14), termEnd: months(22) },
    { name: 'Gregory Hale', title: 'Trustee', groups: ['board'], termStart: months(-26), termEnd: months(10) },
    { name: 'Priya Natarajan', title: 'Trustee', groups: ['board', 'finance_team'], termStart: months(-8), termEnd: months(28) },
    { name: 'Elena Marsh', title: 'Business Manager', groups: ['finance_team', 'staff'] },
    { name: 'Robert Kim', title: 'Dean of Academics', groups: ['staff'] },
    { name: 'Sarah Delgado', title: 'Math Department Chair', groups: ['staff'] },
    { name: 'Michael Brennan', title: 'Science Teacher', groups: ['staff'] },
    { name: 'Jessica Tran', title: 'English Teacher', groups: ['staff'] },
    { name: 'Kevin Moore', title: 'Theology Teacher', groups: ['staff'] },
    { name: 'Rachel Adeyemi', title: 'School Counselor', groups: ['staff'] },
    { name: 'Andrew Novak', title: 'Athletic Director', groups: ['staff'] },
    { name: 'Hannah Pierce', title: 'World Languages Teacher', groups: ['staff'] },
  ],
  aurelia: [
    { name: 'Catherine Doyle', title: 'Board Chair', groups: ['board'], termStart: months(-24), termEnd: months(12) },
    { name: 'James Whitaker', title: 'Vice Chair', groups: ['board'], termStart: months(-18), termEnd: months(18) },
    { name: 'Monica Alvarez', title: 'Treasurer', groups: ['board', 'finance_team'], termStart: months(-12), termEnd: months(24) },
    { name: 'Rev. Stephen Mbeki', title: 'Pastor, ex officio', groups: ['board'], termStart: months(-48), termEnd: null },
    { name: 'Brian Sullivan', title: 'Trustee', groups: ['board'], termStart: months(-20), termEnd: months(16) },
    { name: 'Teresa Lindqvist', title: 'Trustee', groups: ['board'], termStart: months(-6), termEnd: months(30) },
    { name: 'Diane Foster', title: 'Business Manager', groups: ['finance_team', 'staff'] },
    { name: 'Nicole Baptiste', title: 'Assistant Principal', groups: ['staff'] },
    { name: 'Laura Hennessy', title: 'Kindergarten Teacher', groups: ['staff'] },
    { name: 'Marcus Webb', title: 'Grade 3 Teacher', groups: ['staff'] },
    { name: 'Emily Rasmussen', title: 'Grade 5 Teacher', groups: ['staff'] },
    { name: 'Carlos Medina', title: 'Middle School Math', groups: ['staff'] },
    { name: 'Grace Oduya', title: 'Middle School Science', groups: ['staff'] },
    { name: 'Patrick Quinlan', title: 'Religion Coordinator', groups: ['staff'] },
    { name: 'Sophie Laurent', title: 'Music Teacher', groups: ['staff'] },
    { name: 'Olivia Chen', title: 'Pre-K Lead Teacher', groups: ['staff'] },
    { name: 'Denise Harper', title: 'Learning Specialist', groups: ['staff'] },
  ],
}

async function loadPeople(key, schoolId) {
  log(`[${key}] governance people`)
  const out = {}
  for (const p of PEOPLE[key]) {
    const desired = {
      name: p.name,
      title: p.title,
      groups: p.groups,
      termStart: p.termStart ?? null,
      termEnd: p.termEnd ?? null,
      active: true,
    }
    const row = await ensure({
      label: `person ${p.name}`,
      list: () => get(`/schools/${schoolId}/governance/people`),
      match: (r) => r.name === p.name,
      create: (b) => post(`/schools/${schoolId}/governance/people`, b),
      update: (r, b) => patch(`/schools/${schoolId}/governance/people/${r.id}`, b),
      desired,
    })
    out[p.name] = row.id
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════
// GOVERNANCE — policies (one+ past review), committees, meetings
// ══════════════════════════════════════════════════════════════════════════════
const POLICIES = {
  cedar: [
    { title: 'Board Governance Policy Manual', category: 'Governance', owner: 'Board Chair', adoptedDate: '2016-08-18', lastReviewedDate: months(-13), reviewIntervalMonths: 24 },
    { title: 'Conflict of Interest Policy', category: 'Governance', owner: 'Board Secretary', adoptedDate: '2017-01-19', lastReviewedDate: months(-26), reviewIntervalMonths: 12 },
    { title: 'Fiscal Management and Operating Reserve Policy', category: 'Finance', owner: 'Treasurer', adoptedDate: '2018-06-21', lastReviewedDate: months(-8), reviewIntervalMonths: 12 },
    { title: 'Investment and Endowment Policy', category: 'Finance', owner: 'Finance Committee', adoptedDate: '2019-09-12', lastReviewedDate: months(-5), reviewIntervalMonths: 24 },
    { title: 'Admissions and Non-Discrimination Policy', category: 'Admissions', owner: 'Head of School', adoptedDate: '2015-02-12', lastReviewedDate: months(-16), reviewIntervalMonths: 12 },
    { title: 'Crisis and Emergency Response Policy', category: 'Safety', owner: 'Head of School', adoptedDate: '2019-08-01', lastReviewedDate: months(-11, days(10)), reviewIntervalMonths: 12 },
    { title: 'Staff Hiring, Supervision and Evaluation Policy', category: 'Human Resources', owner: 'Head of School', adoptedDate: '2017-07-01', lastReviewedDate: months(-6), reviewIntervalMonths: 24 },
    { title: 'Technology Acceptable Use Policy', category: 'Technology', owner: 'Dean of Academics', adoptedDate: '2020-08-10', lastReviewedDate: months(-9), reviewIntervalMonths: 12 },
    { title: 'Marketing and Communications Standards', category: 'Advancement', owner: 'Director of Advancement', adoptedDate: '2021-03-18', lastReviewedDate: months(-10), reviewIntervalMonths: 24 },
    { title: 'Gift Acceptance Policy', category: 'Advancement', owner: 'Advancement Committee', adoptedDate: '2018-10-11', lastReviewedDate: months(-14), reviewIntervalMonths: 36 },
  ],
  aurelia: [
    { title: 'Board Bylaws and Governance Manual', category: 'Governance', owner: 'Board Chair', adoptedDate: '2014-09-11', lastReviewedDate: months(-10), reviewIntervalMonths: 24 },
    { title: 'Conflict of Interest Policy', category: 'Governance', owner: 'Board Secretary', adoptedDate: '2016-01-21', lastReviewedDate: months(-7), reviewIntervalMonths: 12 },
    { title: 'Tuition Assistance and Scholarship Policy', category: 'Finance', owner: 'Business Manager', adoptedDate: '2017-04-20', lastReviewedDate: months(-4), reviewIntervalMonths: 12 },
    { title: 'Fiscal Controls and Purchasing Policy', category: 'Finance', owner: 'Treasurer', adoptedDate: '2018-02-15', lastReviewedDate: months(-9), reviewIntervalMonths: 24 },
    { title: 'Student Technology Acceptable Use Policy', category: 'Technology', owner: 'Assistant Principal', adoptedDate: '2019-08-12', lastReviewedDate: months(-12, days(-42)), reviewIntervalMonths: 12 },
    { title: 'Safe Environment and Child Protection Policy', category: 'Safety', owner: 'Principal', adoptedDate: '2015-08-01', lastReviewedDate: months(-3), reviewIntervalMonths: 12 },
    { title: 'Crisis and Emergency Response Plan', category: 'Safety', owner: 'Principal', adoptedDate: '2016-08-01', lastReviewedDate: months(-5), reviewIntervalMonths: 12 },
    { title: 'Admissions and Enrollment Policy', category: 'Admissions', owner: 'Principal', adoptedDate: '2015-01-15', lastReviewedDate: months(-6), reviewIntervalMonths: 12 },
    { title: 'Curriculum Review Cycle', category: 'Curriculum', owner: 'Assistant Principal', adoptedDate: '2018-06-01', lastReviewedDate: months(-11), reviewIntervalMonths: 36 },
  ],
}

async function loadPolicies(key, schoolId) {
  log(`[${key}] policies`)
  const out = {}
  for (const p of POLICIES[key]) {
    const desired = { ...p, status: 'active' }
    const row = await ensure({
      label: `policy ${p.title}`,
      list: async () => (await get(`/schools/${schoolId}/policies`)).policies,
      match: (r) => r.title === p.title,
      create: (b) => post(`/schools/${schoolId}/policies`, b),
      update: (r, b) => patch(`/schools/${schoolId}/policies/${r.id}`, b),
      desired,
    })
    out[p.title] = row.id
  }
  return out
}

const COMMITTEES = {
  cedar: [
    { name: 'Finance Committee', kind: 'finance', chair: 'Angela Brooks', description: 'Budget, audit, reserves and tuition-setting recommendations to the full board.', members: [['Angela Brooks', 'chair'], ['Priya Natarajan', 'member'], ['Elena Marsh', 'secretary']] },
    { name: 'Governance and Nominating Committee', kind: 'governance', chair: 'Daniel Whitfield', description: 'Board recruitment, onboarding, policy review calendar and self-assessment.', members: [['Daniel Whitfield', 'chair'], ['Margaret Ellison', 'member'], ['Lauren Castellano', 'member']] },
    { name: 'Facilities and Campus Committee', kind: 'facilities', chair: 'Thomas Reyes', description: 'Capital plan, deferred maintenance and safety inspections.', members: [['Thomas Reyes', 'chair'], ['Gregory Hale', 'member']] },
    { name: 'Accreditation Steering Committee', kind: 'standing', chair: 'Margaret Ellison', description: 'Owns the Cognia self-assessment, evidence calendar and the next Engagement Review.', members: [['Margaret Ellison', 'chair'], ['Robert Kim', 'member'], ['Sarah Delgado', 'member'], ['Rachel Adeyemi', 'member']] },
  ],
  aurelia: [
    { name: 'Finance Committee', kind: 'finance', chair: 'Monica Alvarez', description: 'Budget, audit, tuition assistance and reserve oversight.', members: [['Monica Alvarez', 'chair'], ['Brian Sullivan', 'member'], ['Diane Foster', 'secretary']] },
    { name: 'Governance Committee', kind: 'governance', chair: 'James Whitaker', description: 'Policy review calendar, board formation and nominations.', members: [['James Whitaker', 'chair'], ['Catherine Doyle', 'member']] },
    { name: 'Facilities Committee', kind: 'facilities', chair: 'Brian Sullivan', description: 'Repairs, capital projects and campus safety.', members: [['Brian Sullivan', 'chair'], ['Teresa Lindqvist', 'member']] },
    { name: 'Advancement Committee', kind: 'advancement', chair: 'Teresa Lindqvist', description: 'Annual fund, the STEM wing campaign and the spring gala.', members: [['Teresa Lindqvist', 'chair'], ['Catherine Doyle', 'member']] },
  ],
}

async function loadCommittees(key, schoolId, people) {
  log(`[${key}] committees`)
  const out = {}
  for (const c of COMMITTEES[key]) {
    const desired = { name: c.name, kind: c.kind, chair: c.chair, description: c.description, active: true }
    const row = await ensure({
      label: `committee ${c.name}`,
      list: async () => (await get(`/schools/${schoolId}/governance/committees`)).committees,
      match: (r) => r.name === c.name,
      create: (b) => post(`/schools/${schoolId}/governance/committees`, b),
      update: (r, b) => patch(`/schools/${schoolId}/governance/committees/${r.id}`, b),
      desired,
    })
    out[c.name] = row.id
    const mres = await get(`/schools/${schoolId}/governance/committees/${row.id}/members`)
    const members = Array.isArray(mres) ? mres : (mres.members ?? [])
    for (const [pname, role] of c.members) {
      const personId = people[pname]
      if (!personId) continue
      if (members.some((m) => (m.personId ?? m.person?.id) === personId)) continue
      await post(`/schools/${schoolId}/governance/committees/${row.id}/members`, { personId, role })
      stats.created++
    }
  }
  return out
}

function meetingsFor(key) {
  const board = key === 'cedar' ? 'Board of Trustees' : 'Board of Directors'
  // Quarterly-plus board cadence over the trailing year, newest held ~30 days ago
  // (its minutes are approved by this run → a ~30-day lag, under the 60-day line).
  const held = [-30, -121, -184, -275, -366 + 6].map((d) => days(d))
  const rows = held.map((d, i) => ({
    title: `${board} — regular meeting`,
    committee: null,
    scheduledAt: at(d),
    status: 'held',
    location: key === 'cedar' ? 'Library conference room' : 'Parish hall',
    agenda: i === 0
      ? '1. Opening prayer\n2. Approval of prior minutes\n3. Head of School report\n4. Finance Committee report: FY26 close and audit\n5. Accreditation Steering Committee: self-assessment progress\n6. Policy review calendar\n7. Executive session'
      : '1. Opening prayer\n2. Approval of prior minutes\n3. Head of School report\n4. Committee reports\n5. New business',
    minutes: i === 0
      ? 'Quorum present. Prior minutes approved as circulated. The board received the FY26 year-end results and the draft audit timeline. The Accreditation Steering Committee reported self-scoring progress and two open must-pass items. The board scheduled the review of the Conflict of Interest Policy for the next meeting.'
      : 'Quorum present. Prior minutes approved. Reports received and filed. Motions recorded in the decisions log.',
    decisions: i === 0 ? 'Accepted the FY26 year-end report. Approved the audit engagement letter.' : 'Reports accepted.',
    minutesStatus: 'approved',
  }))
  rows.push({
    title: `${board} — regular meeting`,
    committee: null,
    scheduledAt: at(days(33)),
    status: 'scheduled',
    location: key === 'cedar' ? 'Library conference room' : 'Parish hall',
    agenda: '1. Opening prayer\n2. Approval of prior minutes\n3. Policy reviews due\n4. Budget assumptions for FY28',
    minutesStatus: 'none',
  })
  rows.push({
    title: 'Finance Committee meeting',
    committee: 'Finance Committee',
    scheduledAt: at(days(-44), 17),
    status: 'held',
    location: 'Business office',
    agenda: '1. FY26 close\n2. Cash and reserves\n3. Audit planning',
    minutes: 'Reviewed the FY26 close, cash position and audit timeline. Recommended the audit engagement letter to the full board.',
    minutesStatus: 'approved',
  })
  rows.push({
    title: 'Finance Committee meeting',
    committee: 'Finance Committee',
    scheduledAt: at(days(19), 17),
    status: 'scheduled',
    location: 'Business office',
    agenda: '1. Q1 budget versus actual\n2. Tuition assumptions',
    minutesStatus: 'none',
  })
  return rows
}

async function loadMeetings(key, schoolId, committees) {
  log(`[${key}] meetings`)
  const res = await get(`/schools/${schoolId}/governance/meetings`)
  const existing = res.meetings
  const out = []
  for (const m of meetingsFor(key)) {
    const body = { ...m }
    delete body.committee
    if (m.committee) body.committeeId = committees[m.committee] ?? null
    const hit = existing.find((r) => r.title === m.title && (r.scheduledAt ?? '').slice(0, 10) === m.scheduledAt.slice(0, 10))
    if (hit) {
      stats.kept++
      out.push(hit.id)
      continue
    }
    const row = await post(`/schools/${schoolId}/governance/meetings`, body)
    stats.created++
    log(`  + meeting ${m.title} ${m.scheduledAt.slice(0, 10)}`)
    out.push(row.id)
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY — a plan with pillars, metric-bound goals and initiatives
// ══════════════════════════════════════════════════════════════════════════════
const PLANS = {
  aurelia: {
    name: 'Faith, Learning and Stewardship 2025–2030',
    mission: 'Form every child in faith, knowledge and service, in a school that is financially strong for the next generation.',
    fyStartYear: 2025,
    fyEndYear: 2030,
    pillars: [
      {
        name: 'Enrollment and Families',
        description: 'Grow and keep the families we serve, from Pre-K through grade 8.',
        goals: [
          { title: 'Grow enrollment to 240 students', renamedFrom: 'Grow enrollment to 420 students', goalType: 'metric', metricKey: 'enrollment_headcount', targetValue: 240, startDate: days(-21), targetDate: '2030-06-30', initiatives: [['Launch a PK3 marketing push with the parish', 'in_progress'], ['Re-enrollment calls for every grade 4 family', 'planned']] },
          { title: 'Open a second Pre-K 4 classroom', goalType: 'milestone', startDate: '2025-07-01', targetDate: '2027-08-15', milestones: [['Board approval', true], ['Licensing inspection', true], ['Hire lead teacher', true], ['Room fit-out', false]], initiatives: [['Pre-K 4 classroom fit-out', 'in_progress']] },
        ],
      },
      {
        name: 'Financial Stewardship',
        description: 'Balanced budgets, healthy reserves and fair tuition.',
        goals: [
          { title: 'Reach a 6% operating margin', renamedFrom: 'Hold an operating margin of 3% or better', goalType: 'metric', metricKey: 'operating_margin', targetValue: 0.06, startDate: days(-21), targetDate: '2028-06-30', initiatives: [['Annual tuition-setting model with the Finance Committee', 'done']] },
          { title: 'Build cash reserves to 120 days', renamedFrom: 'Build cash reserves to 90 days', goalType: 'metric', metricKey: 'days_cash_on_hand', targetValue: 120, startDate: days(-21), targetDate: '2029-06-30', initiatives: [['Move surplus cash into a board-designated reserve', 'in_progress']] },
        ],
      },
      {
        name: 'Academic Excellence',
        description: 'Every child reading and doing math at grade level or above.',
        goals: [
          { title: 'Adopt a new K–5 math curriculum', goalType: 'milestone', startDate: '2025-08-01', targetDate: '2027-06-30', milestones: [['Pilot in grades 2 and 4', true], ['Teacher training', true], ['Full K–5 rollout', false]], initiatives: [['Math curriculum pilot and teacher training', 'in_progress']] },
          { title: 'Keep students per teacher at 12 or fewer', renamedFrom: 'Keep students per teacher at 15 or fewer', goalType: 'metric', metricKey: 'student_teacher_ratio', targetValue: 12, startDate: days(-21), targetDate: '2030-06-30', initiatives: [] },
        ],
      },
    ],
  },
  cedar: {
    // A two-year BRIDGE plan ending June 2027: its end date is the dated
    // STRAT-PLAN-EXPIRING dot on r5's 24-month horizon. (Start stays inside the
    // signal's 600-day freshness window, so it never reads as "gone quiet".)
    name: 'Cedar Ridge Bridge Plan 2025–2027: Mind, Heart and Service',
    renamedFrom: 'Cedar Ridge Forward 2022–2027: Mind, Heart and Service',
    mission: 'A Catholic college-preparatory school that forms leaders for a life of service.',
    fyStartYear: 2025,
    fyEndYear: 2027,
    pillars: [
      {
        name: 'Continuous Improvement',
        description: 'A self-assessment culture that is ready for the next Engagement Review.',
        goals: [
          { title: 'Self-score every Cognia standard before the evidence freeze', goalType: 'milestone', startDate: '2025-07-01', targetDate: '2028-12-31', milestones: [['Culture of Learning scored', true], ['Leadership for Learning scored', true], ['Engagement of Learning scored', false], ['Growth in Learning scored', false]], initiatives: [] },
        ],
      },
      {
        name: 'Financial Strength',
        description: 'Sustainable margins and reserves.',
        goals: [
          { title: 'Hold an operating margin of 3% or better', goalType: 'metric', metricKey: 'operating_margin', targetValue: 0.03, startDate: days(-21), targetDate: '2027-06-30', initiatives: [] },
        ],
      },
    ],
  },
}

async function loadStrategy(key, schoolId) {
  const P = PLANS[key]
  log(`[${key}] strategic plan`)
  const plans = (await get(`/schools/${schoolId}/strategy/plans`)).plans
  let plan = plans.find((p) => p.name === P.name) ?? (P.renamedFrom ? plans.find((p) => p.name === P.renamedFrom) : null)
  if (plan && (plan.name !== P.name || plan.fyStartYear !== P.fyStartYear || plan.fyEndYear !== P.fyEndYear)) {
    await patch(`/schools/${schoolId}/strategy/plans/${plan.id}`, { name: P.name, fyStartYear: P.fyStartYear, fyEndYear: P.fyEndYear })
    stats.updated++
    log(`  ~ plan → ${P.name} (${P.fyStartYear}–${P.fyEndYear})`)
  }
  if (!plan) {
    plan = await post(`/schools/${schoolId}/strategy/plans`, {
      name: P.name,
      mission: P.mission,
      fyStartYear: P.fyStartYear,
      fyEndYear: P.fyEndYear,
      status: 'adopted',
      nextReviewDate: months(8),
    })
    stats.created++
    log(`  + plan ${P.name}`)
  } else stats.kept++
  const detail = await get(`/schools/${schoolId}/strategy/plans/${plan.id}`)
  const d = detail.plan ?? detail
  const pillars = d.pillars ?? []
  const goalIds = []
  for (let pi = 0; pi < P.pillars.length; pi++) {
    const pd = P.pillars[pi]
    let pillar = pillars.find((x) => x.name === pd.name)
    if (!pillar) {
      pillar = await post(`/schools/${schoolId}/strategy/plans/${plan.id}/pillars`, { name: pd.name, description: pd.description, orderIndex: pi })
      pillar.goals = []
      stats.created++
      log(`  + pillar ${pd.name}`)
    } else stats.kept++
    for (let gi = 0; gi < pd.goals.length; gi++) {
      const g = pd.goals[gi]
      let goal = (pillar.goals ?? []).find((x) => x.title === g.title)
      const renamed = !goal && g.renamedFrom ? (pillar.goals ?? []).find((x) => x.title === g.renamedFrom) : null
      if (renamed) {
        const upd = { title: g.title }
        if (g.goalType === 'metric') upd.targetValue = g.targetValue
        goal = { ...renamed, ...(await patch(`/schools/${schoolId}/strategy/goals/${renamed.id}`, upd)), initiatives: renamed.initiatives }
        stats.updated++
        log(`  ~ goal renamed → ${g.title}`)
      }
      if (!goal) {
        const body = {
          title: g.title,
          goalType: g.goalType,
          orderIndex: gi,
          ownerUserId: TOK.user.id,
          startDate: g.startDate,
          targetDate: g.targetDate,
        }
        if (g.goalType === 'metric') {
          body.metricKey = g.metricKey
          body.targetValue = g.targetValue
        }
        if (g.milestones) body.milestones = g.milestones.map(([label, done]) => ({ label, done }))
        goal = await post(`/schools/${schoolId}/strategy/pillars/${pillar.id}/goals`, body)
        goal.initiatives = []
        stats.created++
        log(`  + goal ${g.title}`)
      } else {
        const want = { startDate: g.startDate, targetDate: g.targetDate }
        if (g.goalType === 'metric') want.targetValue = g.targetValue
        const msHave = (goal.milestones ?? []).map((m) => `${m.label}:${!!m.done}`).join('|')
        const msWant = (g.milestones ?? []).map(([label, done]) => `${label}:${!!done}`).join('|')
        const msDiff = g.milestones && msHave !== msWant
        if (differs(goal, want) || msDiff) {
          const body = { ...want }
          if (msDiff) body.milestones = g.milestones.map(([label, done]) => ({ label, done }))
          await patch(`/schools/${schoolId}/strategy/goals/${goal.id}`, body)
          stats.updated++
          log(`  ~ goal dates/target ${g.title}`)
        } else stats.kept++
      }
      goalIds.push({ id: goal.id, metric: g.goalType === 'metric', title: g.title })
      // Self-heal: an earlier run could leave a duplicate initiative — keep the first.
      const seen = new Set()
      for (const ini of goal.initiatives ?? []) {
        if (seen.has(ini.title)) {
          await api('DELETE', `/schools/${schoolId}/strategy/initiatives/${ini.id}`)
          log(`  - duplicate initiative ${ini.title}`)
        }
        seen.add(ini.title)
      }
      for (let ii = 0; ii < g.initiatives.length; ii++) {
        const [title, status] = g.initiatives[ii]
        if ((goal.initiatives ?? []).some((x) => x.title === title)) {
          stats.kept++
          continue
        }
        await post(`/schools/${schoolId}/strategy/goals/${goal.id}/initiatives`, { title, status, ownerUserId: TOK.user.id, orderIndex: ii })
        stats.created++
        log(`  + initiative ${title}`)
      }
    }
  }
  if (REBASELINE) {
    for (const g of goalIds.filter((x) => x.metric)) {
      await post(`/schools/${schoolId}/strategy/goals/${g.id}/rebaseline`, {})
      log(`  ↺ rebaselined ${g.title}`)
    }
  }
  return { planId: plan.id, goals: goalIds }
}

// ══════════════════════════════════════════════════════════════════════════════
// FACILITIES — vendors, repairs (one over budget), bids, inspections
// ══════════════════════════════════════════════════════════════════════════════
const VENDORS = {
  aurelia: [
    { name: 'Heronwood Mechanical', category: 'HVAC', contactName: 'Service desk', contactPhone: '(727) 555-0142' },
    { name: 'Saltmarsh Roofing & Sheet Metal', category: 'Roofing', contactName: 'Estimating', contactPhone: '(727) 555-0187' },
    { name: 'Lanternbay Fire Protection', category: 'Fire & life safety', contactName: 'Inspections', contactPhone: '(727) 555-0119' },
    { name: 'Pelican Reach Paving Co.', category: 'Paving', contactName: 'Bids', contactPhone: '(727) 555-0163' },
    { name: 'Kestrel Bay Electric', category: 'Electrical', contactName: 'Dispatch', contactPhone: '(727) 555-0108' },
  ],
  cedar: [
    { name: 'Lanternbay Fire Protection', category: 'Fire & life safety', contactName: 'Inspections', contactPhone: '(813) 555-0119' },
    { name: 'Driftwood Key Building Services', category: 'General contractor', contactName: 'Project desk', contactPhone: '(813) 555-0175' },
    { name: 'Heronwood Mechanical', category: 'HVAC', contactName: 'Service desk', contactPhone: '(813) 555-0142' },
  ],
}
// Fictional vendors only (final-pass review 2026-10-17: the first seed used
// real-sounding Florida business names). Rows still carrying an old name — vendor
// rows and free-text bid vendors — are renamed in place on the next run; the
// repairs' legacy `vendor` text follows via the normal ensure() patch.
const VENDOR_RENAME = {
  'Gulf Coast Mechanical': 'Heronwood Mechanical',
  'Suncoast Roofing & Sheet Metal': 'Saltmarsh Roofing & Sheet Metal',
  'Bayside Fire Protection': 'Lanternbay Fire Protection',
  'Palmetto Paving Co.': 'Pelican Reach Paving Co.',
  'Tidewater Electric': 'Kestrel Bay Electric',
  'Hillsborough Building Services': 'Driftwood Key Building Services',
  'Westshore Asphalt': 'Egret Hollow Asphalt',
  'Clearwater Site Works': 'Sandpiper Cove Site Works',
}
// NOTE: no "gym roof" item anywhere — o2 asks KYRO to ADD one on camera.
const REPAIRS = {
  aurelia: [
    { title: 'Replace failed compressor on the main-building chiller', location: 'Main building', category: 'HVAC', priority: 'high', status: 'in_progress', estimatedCost: 18500, actualCost: 22350, vendor: 'Heronwood Mechanical', targetDate: days(12), notes: 'Second compressor found worn during the repair — change order approved by the Facilities Committee.' },
    { title: 'Ceiling leak above Room 14', location: 'Room 14', category: 'Roofing', priority: 'high', status: 'open', estimatedCost: 4200, vendor: 'Saltmarsh Roofing & Sheet Metal', targetDate: days(9) },
    { title: 'Annual fire alarm and sprinkler inspection', location: 'Whole campus', category: 'Fire & life safety', priority: 'medium', status: 'scheduled', estimatedCost: 1850, vendor: 'Lanternbay Fire Protection', targetDate: days(26), recurrence: 'annual', complianceKind: 'fire_life_safety' },
    { title: 'Resurface the drop-off loop and staff lot', location: 'North parking lot', category: 'Paving', priority: 'medium', status: 'open', estimatedCost: 46000, targetDate: months(7), notes: 'Three bids requested; summer break install.' },
    { title: 'Playground safety surfacing top-up', location: 'Primary playground', category: 'Grounds', priority: 'medium', status: 'scheduled', estimatedCost: 3600, targetDate: days(40), complianceKind: 'playground' },
    { title: 'LED lighting retrofit, grades 6–8 wing', location: 'Middle school wing', category: 'Electrical', priority: 'low', status: 'scheduled', estimatedCost: 12800, vendor: 'Kestrel Bay Electric', targetDate: months(3) },
    { title: 'Boiler annual inspection', location: 'Mechanical room', category: 'Mechanical', priority: 'medium', status: 'resolved', estimatedCost: 950, actualCost: 950, vendor: 'Heronwood Mechanical', targetDate: days(-35), recurrence: 'annual', complianceKind: 'boiler' },
    { title: 'Replace cafeteria walk-in cooler door gasket', location: 'Cafeteria', category: 'Kitchen', priority: 'low', status: 'resolved', estimatedCost: 650, actualCost: 590, targetDate: days(-20) },
  ],
  cedar: [
    { title: 'Annual fire alarm and sprinkler inspection', location: 'Whole campus', category: 'Fire & life safety', priority: 'high', status: 'resolved', estimatedCost: 2400, actualCost: 2400, vendor: 'Lanternbay Fire Protection', targetDate: days(-52), recurrence: 'annual', complianceKind: 'fire_life_safety' },
    { title: 'Science lab fume hood certification', location: 'Science wing', category: 'Mechanical', priority: 'medium', status: 'scheduled', estimatedCost: 1600, vendor: 'Heronwood Mechanical', targetDate: days(30) },
    { title: 'Gymnasium bleacher repair', location: 'Gymnasium', category: 'General', priority: 'medium', status: 'open', estimatedCost: 7800, vendor: 'Driftwood Key Building Services', targetDate: days(55) },
  ],
}
const BIDS = { // on the paving item at St. Aurelia
  title: 'Resurface the drop-off loop and staff lot',
  bids: [
    { vendor: 'Pelican Reach Paving Co.', amount: 44800, notes: 'Includes restriping and two ADA spaces.' },
    { vendorName: 'Egret Hollow Asphalt', amount: 49250, notes: 'Mill and overlay; 3-week schedule.' },
    { vendorName: 'Sandpiper Cove Site Works', amount: 51900, notes: 'Full-depth repair at the entrance apron.' },
  ],
}

async function loadFacilities(key, schoolId) {
  log(`[${key}] facilities`)
  const vendorIds = {}
  {
    const have = (await get(`/schools/${schoolId}/facilities/vendors`)).vendors
    for (const r of have) {
      const to = VENDOR_RENAME[r.name]
      if (!to || have.some((h) => h.name === to)) continue
      await patch(`/schools/${schoolId}/facilities/vendors/${r.id}`, { name: to })
      stats.updated++
      log(`  ~ vendor renamed ${r.name} -> ${to}`)
    }
  }
  for (const v of VENDORS[key]) {
    const row = await ensure({
      label: `vendor ${v.name}`,
      list: async () => (await get(`/schools/${schoolId}/facilities/vendors`)).vendors,
      match: (r) => r.name === v.name,
      create: (b) => post(`/schools/${schoolId}/facilities/vendors`, b),
      update: (r, b) => patch(`/schools/${schoolId}/facilities/vendors/${r.id}`, b),
      desired: { ...v, active: true },
    })
    vendorIds[v.name] = row.id
  }
  const itemIds = {}
  for (const it of REPAIRS[key]) {
    const desired = { ...it }
    if (it.vendor) desired.vendorId = vendorIds[it.vendor] ?? null
    const row = await ensure({
      label: `repair ${it.title}`,
      list: async () => (await get(`/schools/${schoolId}/facilities/maintenance`)).items,
      match: (r) => r.title === it.title,
      create: (b) => post(`/schools/${schoolId}/facilities/maintenance`, b),
      update: (r, b) => patch(`/schools/${schoolId}/facilities/maintenance/${r.id}`, b),
      desired,
    })
    itemIds[it.title] = row.id
  }
  if (key === 'aurelia') {
    const itemId = itemIds[BIDS.title]
    const res = await get(`/schools/${schoolId}/facilities/maintenance/${itemId}/bids`)
    const have = Array.isArray(res) ? res : (res.bids ?? [])
    for (const h of have) {
      const to = !h.vendorId && VENDOR_RENAME[h.vendorName]
      if (!to) continue
      await patch(`/schools/${schoolId}/facilities/maintenance/${itemId}/bids/${h.id}`, { vendorName: to })
      h.vendorName = to
      stats.updated++
      log(`  ~ bid vendor renamed -> ${to}`)
    }
    for (const b of BIDS.bids) {
      const name = b.vendor ?? b.vendorName
      if (have.some((h) => (h.vendorName ?? h.vendor?.name) === name && Number(h.amount) === b.amount)) {
        stats.kept++
        continue
      }
      const body = { amount: b.amount, notes: b.notes }
      if (b.vendor) body.vendorId = vendorIds[b.vendor]
      else body.vendorName = b.vendorName
      await post(`/schools/${schoolId}/facilities/maintenance/${itemId}/bids`, body)
      stats.created++
      log(`  + bid ${name}`)
    }
  }
  return itemIds
}

// ══════════════════════════════════════════════════════════════════════════════
// ADVANCEMENT — campaigns with gifts and pledges (St. Aurelia)
// ══════════════════════════════════════════════════════════════════════════════
const CAMPAIGNS = [
  {
    name: 'Annual Fund 2026–27',
    campaignType: 'annual_fund',
    goalAmount: 150000,
    fiscalYear: 2027,
    startDate: days(-108),
    closeDate: '2027-06-30',
    status: 'active',
    notes: 'Parent, alumni and parish appeal. Board participation goal: 100%.',
    gifts: [
      ['gift', 25000, 25000, -95, 'Board of Directors — collective gift', 'Check'],
      ['gift', 15000, 15000, -80, 'Alumni family gift', 'Check'],
      ['gift', 12500, 12500, -61, 'Parish matching grant', 'Grant'],
      ['pledge', 30000, 10000, -54, 'Three-year family pledge', 'Pledge form'],
      ['gift', 8200, 8200, -40, 'Back-to-school online appeal', 'Online'],
      ['gift', 6400, 6400, -27, 'Grandparents Day appeal', 'Online'],
      ['pledge', 20000, 5000, -19, 'Local business sponsorship pledge', 'Pledge form'],
      ['gift', 9800, 9800, -9, 'Faculty and staff campaign', 'Payroll'],
      ['gift', 4300, 4300, -3, 'October online appeal', 'Online'],
    ],
  },
  {
    name: 'STEM Wing Capital Campaign',
    campaignType: 'capital',
    goalAmount: 780000,
    fiscalYear: 2027,
    startDate: months(-14),
    closeDate: months(14),
    status: 'active',
    notes: 'Two new science labs and a makerspace for grades 5–8.',
    gifts: [
      ['pledge', 250000, 150000, -400, 'Lead family pledge', 'Pledge form'],
      ['gift', 175000, 175000, -330, 'Foundation grant', 'Grant'],
      ['pledge', 120000, 40000, -250, 'Board leadership pledges', 'Pledge form'],
      ['gift', 60000, 60000, -150, 'Alumni challenge gift', 'Wire'],
      ['pledge', 90000, 30000, -70, 'Parish capital partnership', 'Pledge form'],
      ['gift', 35000, 35000, -25, 'Community campaign gifts', 'Online'],
    ],
  },
  {
    name: 'Spring Gala 2026',
    campaignType: 'event',
    goalAmount: 85000,
    fiscalYear: 2026,
    startDate: '2026-01-15',
    closeDate: '2026-04-25',
    status: 'closed',
    notes: 'Net proceeds to tuition assistance.',
    gifts: [
      ['gift', 42000, 42000, -180, 'Sponsorships', 'Check'],
      ['gift', 31500, 31500, -175, 'Auction and paddle raise', 'Card'],
      ['gift', 14200, 14200, -175, 'Ticket sales', 'Card'],
    ],
  },
]

async function loadAdvancement(schoolId) {
  log('[aurelia] advancement')
  const out = {}
  for (const c of CAMPAIGNS) {
    const desired = { ...c }
    delete desired.gifts
    const row = await ensure({
      label: `campaign ${c.name}`,
      list: async () => (await get(`/schools/${schoolId}/advancement/campaigns`)).campaigns,
      match: (r) => r.name === c.name,
      create: (b) => post(`/schools/${schoolId}/advancement/campaigns`, b),
      update: (r, b) => patch(`/schools/${schoolId}/advancement/campaigns/${r.id}`, b),
      desired,
    })
    out[c.name] = row.id
    const gres = await get(`/schools/${schoolId}/advancement/campaigns/${row.id}/gifts`)
    const have = Array.isArray(gres) ? gres : (gres.gifts ?? [])
    for (const [kind, amount, receivedAmount, offset, label, source] of c.gifts) {
      if (have.some((h) => h.label === label)) {
        stats.kept++
        continue
      }
      const body = { kind, amount, occurredOn: days(offset), label, source }
      if (kind === 'pledge') body.receivedAmount = receivedAmount
      await post(`/schools/${schoolId}/advancement/campaigns/${row.id}/gifts`, body)
      stats.created++
    }
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════
// HR — staff evaluations, clearances, professional development, staff FTE
// ══════════════════════════════════════════════════════════════════════════════
function evaluationsFor(key) {
  const cy = '2026–27'
  if (key === 'aurelia') {
    return [
      ['Nicole Baptiste', cy, days(-70), 'completed', days(-75), 'Principal'],
      ['Laura Hennessy', cy, days(-40), 'completed', days(-38), 'Assistant Principal'],
      ['Marcus Webb', cy, days(-21), 'in_progress', null, 'Assistant Principal'],
      ['Emily Rasmussen', cy, days(12), 'scheduled', null, 'Assistant Principal'],
      ['Carlos Medina', cy, days(18), 'scheduled', null, 'Principal'],
      ['Grace Oduya', cy, days(32), 'scheduled', null, 'Principal'],
      ['Patrick Quinlan', cy, days(-55), 'completed', days(-60), 'Principal'],
      ['Sophie Laurent', cy, days(60), 'scheduled', null, 'Assistant Principal'],
      ['Olivia Chen', cy, days(-30), 'completed', days(-31), 'Assistant Principal'],
      ['Denise Harper', cy, days(75), 'scheduled', null, 'Principal'],
    ]
  }
  return [
    ['Robert Kim', cy, days(-90), 'completed', days(-92), 'Head of School'],
    ['Sarah Delgado', cy, days(-50), 'completed', days(-49), 'Dean of Academics'],
    ['Michael Brennan', cy, days(-25), 'completed', days(-26), 'Dean of Academics'],
    ['Jessica Tran', cy, days(-8), 'in_progress', null, 'Dean of Academics'],
    ['Kevin Moore', cy, days(14), 'scheduled', null, 'Dean of Academics'],
    ['Rachel Adeyemi', cy, days(28), 'scheduled', null, 'Head of School'],
    ['Andrew Novak', cy, days(45), 'scheduled', null, 'Head of School'],
    ['Hannah Pierce', cy, days(-15), 'scheduled', null, 'Dean of Academics'],
  ]
}

async function loadHr(key, schoolId, people) {
  log(`[${key}] HR`)
  const evs = (await get(`/schools/${schoolId}/hr/staff-evaluations`)).evaluations
  for (const [pname, cycleLabel, dueDate, status, completedDate, evaluatorName] of evaluationsFor(key)) {
    const personId = people[pname]
    const hit = evs.find((e) => e.personId === personId && e.cycleLabel === cycleLabel)
    const desired = { cycleLabel, dueDate, status, completedDate, evaluatorName }
    if (!hit) {
      await post(`/schools/${schoolId}/hr/staff-evaluations`, { personId, ...desired })
      stats.created++
    } else if (differs(hit, desired)) {
      await patch(`/schools/${schoolId}/hr/staff-evaluations/${hit.id}`, desired)
      stats.updated++
    } else stats.kept++
  }
  // Safe-environment / background clearances for every staff member (all current,
  // two expiring inside 60 days at St. Aurelia so the register has something to say).
  const staff = PEOPLE[key].filter((p) => p.groups.includes('staff'))
  const cl = (await get(`/schools/${schoolId}/hr/clearances?pageSize=200`)).items
  for (let i = 0; i < staff.length; i++) {
    const personId = people[staff[i].name]
    const kinds = [
      ['background_check', days(-300 - i * 20), months(36, days(-300 - i * 20))],
      ['safe_environment_training', key === 'aurelia' && i < 2 ? days(-700 + i * 15) : days(-200 - i * 11), key === 'aurelia' && i < 2 ? days(30 + i * 15) : months(24, days(-200 - i * 11))],
    ]
    for (const [kind, issuedOn, expiresOn] of kinds) {
      if (cl.some((c) => c.personId === personId && c.kind === kind)) {
        stats.kept++
        continue
      }
      await post(`/schools/${schoolId}/hr/clearances`, { personId, kind, issuedOn, expiresOn, verifiedBy: key === 'cedar' ? 'Business Manager' : 'Business Manager' })
      stats.created++
    }
  }
  const pd = (await get(`/schools/${schoolId}/hr/professional-development?pageSize=200`)).items
  const pdTitles = [
    ['Diocesan catechist formation day', 'catholic_identity', 6],
    ['Differentiated instruction workshop', 'instructional', 3],
    ['Youth protection refresher', 'safety', 2],
    ['Classroom technology bootcamp', 'technology', 4],
  ]
  for (let i = 0; i < staff.length; i++) {
    const personId = people[staff[i].name]
    const [title, category, hours] = pdTitles[i % pdTitles.length]
    if (pd.some((r) => r.personId === personId && r.title === title)) {
      stats.kept++
      continue
    }
    await post(`/schools/${schoolId}/hr/professional-development`, { personId, title, activityDate: days(-20 - i * 9), hours, category, verified: true })
    stats.created++
  }
}

/** Staff FTE on each annual period's operational row — ONLY the two HR fields
 *  (the upsert is merge-on-absent, so the enrollment loader's fields are untouched). */
async function loadStaffing(key, schoolId) {
  const periods = await get(`/schools/${schoolId}/periods`)
  const annual = (Array.isArray(periods) ? periods : periods.periods ?? []).filter((p) => ['fy', 'annual'].includes(p.periodType ?? 'fy'))
  if (annual.length === 0) {
    log(`[${key}] staffing: no fiscal periods yet — skipped (re-run with --only staffing after finance loads)`)
    return { skipped: true }
  }
  const byLabel = annual.map((p) => ({ id: p.id, label: p.label, end: p.periodEndDate ?? p.endDate ?? p.label }))
  byLabel.sort((a, b) => String(a.end).localeCompare(String(b.end)))
  const n = byLabel.length
  const done = []
  for (let i = 0; i < n; i++) {
    const p = byLabel[i]
    const op = await get(`/schools/${schoolId}/periods/${p.id}/operational`).catch(() => null)
    const enrolled = Number(op?.enrollment ?? op?.operational?.enrollment ?? 0) || null
    if (!enrolled) {
      // No headcount on this period (yet) — a ratio needs both halves, so leave it
      // for the re-run after the enrollment loader has filled it.
      done.push(`${p.label} (waiting for enrollment)`)
      continue
    }
    // Ratio drifts DOWN a touch year on year (hiring ahead of growth) — never the
    // HR-RATIO-DRIFT rule's "rising" pattern.
    const targetRatio = key === 'aurelia' ? 12.6 - 0.25 * i : 12.2 - 0.2 * i
    const teaching = Math.round((enrolled / targetRatio) * 10) / 10
    const total = Math.round(teaching * (key === 'aurelia' ? 1.42 : 1.48) * 10) / 10
    const have = op?.teachingFte ?? op?.operational?.teachingFte
    if (have != null && Number(have) === teaching) {
      stats.kept++
      done.push(p.label)
      continue
    }
    await put(`/schools/${schoolId}/periods/${p.id}/operational`, { teachingFte: teaching, totalStaffFte: total })
    stats.updated++
    done.push(p.label)
  }
  log(`[${key}] staffing FTE on ${done.join(', ')}`)
  return { periods: done }
}

// ══════════════════════════════════════════════════════════════════════════════
// ACCREDITATION — Cedar Ridge, Cognia 2025 (+ SACS CASI, Bayview is in Florida), the whole r1–r7 shape
const DIVISION = 'sacs_casi'
// ══════════════════════════════════════════════════════════════════════════════
// rubric scores: 21 of 31 scored (index lands ~235 → "45 points from Accredited",
// mid-arc); 10 unscored. The FIVE unscored-and-unproven leaves are the Quickest
// wins row, in this order (fullLift desc → no-proof first → code asc):
//   COG-11 (the r4 "Work on it" standard), COG-14, COG-23, COG-25, COG-29.
const SCORES = {
  'COG-1': 3, 'COG-2': 4, 'COG-3': 3, 'COG-4': 3, 'COG-5': 3, 'COG-6': 2,
  'COG-7': 4, 'COG-8': 4, 'COG-9': 3, 'COG-10': 3, 'COG-12': 2, 'COG-13': 3,
  'COG-15': 4, 'COG-17': 3, 'COG-19': 2, 'COG-21': 3, 'COG-22': 3, 'COG-24': 3,
  'COG-26': 3, 'COG-27': 3, 'COG-31': 2,
}
const UNSCORED_WITH_PROOF = ['COG-16', 'COG-18', 'COG-20', 'COG-28', 'COG-30']
const QUICK_WINS = ['COG-11', 'COG-14', 'COG-23', 'COG-25', 'COG-29']
const R4_STANDARD = 'COG-11'
const SCORED_NO_PROOF = [] // "a strong self-score has no evidence attached"
const OWNERS = {
  'COG-1': 'Head of School', 'COG-2': 'Campus Minister', 'COG-3': 'Head of School', 'COG-4': 'Dean of Students',
  'COG-5': 'Dean of Academics', 'COG-6': 'Dean of Academics', 'COG-7': 'Accreditation Steering Committee',
  'COG-8': 'Board Chair', 'COG-9': 'Head of School', 'COG-10': 'Head of School', 'COG-11': 'Head of School',
  'COG-12': 'Dean of Academics', 'COG-13': 'Dean of Academics', 'COG-14': 'Librarian', 'COG-15': 'Business Manager',
  'COG-17': 'School Counselor', 'COG-24': 'Dean of Academics', 'COG-26': 'Dean of Academics',
}
const RATING_FOR = { 4: 'met', 3: 'met', 2: 'partially_met', 1: 'not_met' }

// Manual evidence (title → body). effectiveDate offsets in days from today.
// Requirement tags (Cognia requirement rows) drive the currency engine:
//   budget 12m · financial_audit 18m · safety_plan 12m · marketing 24m ·
//   enrollment_data 12m · board_minutes 6m · policy_manual = policy cycle.
const EVIDENCE = {
  'COG-1': [['Student and family climate survey summary, spring', { effectiveDate: days(-150) }]],
  'COG-2': [['Mission statement and Portrait of a Graduate', { effectiveDate: days(-400) }], ['Campus ministry and retreat calendar 2026–27', { effectiveDate: days(-60) }]],
  'COG-3': [['Parent association and advisory council minutes', { effectiveDate: days(-90) }]],
  'COG-4': [['Advisory program handbook', { effectiveDate: days(-75) }]],
  'COG-5': [['Professional learning community schedule and protocols', { effectiveDate: days(-70) }]],
  'COG-6': [['Instructional coaching log, 2025–26', { effectiveDate: days(-120) }]],
  'COG-7': [{ link: 'strategic_plan' }, ['Continuous improvement plan — annual update', { effectiveDate: days(-45) }]],
  'COG-8': [{ link: 'meeting' }, { link: 'policy', policy: 'Board Governance Policy Manual' }],
  'COG-9': [{ link: 'governance_report', title: 'Governance report — board roster and committees', extra: { effectiveDate: days(-5) } }],
  'COG-10': [['Hiring and onboarding checklist, 2026 hires', { effectiveDate: days(-80) }]],
  'COG-12': [['Course catalog and curriculum maps', { effectiveDate: days(-200) }]],
  'COG-13': [['Faculty certification and degree roster', { effectiveDate: days(-40) }]],
  'COG-15': [['FY27 board-approved operating budget', { tag: 'budget', effectiveDate: days(-109) }], ['FY25 audited financial statements', { tag: 'financial_audit', effectiveDate: months(-17, days(-15)) }]],
  'COG-17': [['Tuition assistance and learning-support summary', { effectiveDate: days(-95) }]],
  'COG-19': [['Student government charter', { effectiveDate: days(-300) }]],
  'COG-21': [['Classroom walkthrough summary, fall', { effectiveDate: days(-28) }]],
  'COG-22': [['Common formative assessment and reteach log', { effectiveDate: days(-65) }]],
  'COG-24': [['Fall enrollment census and data review', { tag: 'enrollment_data', effectiveDate: days(-32) }]],
  'COG-26': [['Program review: AP and dual-enrollment outcomes', { effectiveDate: days(-140) }]],
  'COG-27': [['Student support team referral protocol', { effectiveDate: days(-110) }]],
  'COG-31': [['ACT and PreACT growth summary', { effectiveDate: days(-100) }]],
  // unscored, proof gathered
  'COG-16': [['Global studies and world languages course outlines', { effectiveDate: days(-210) }]],
  'COG-18': [['Capstone and design-lab project showcase', { effectiveDate: days(-160) }]],
  'COG-20': [['Student retreat and service-learning reflections', { effectiveDate: days(-130) }]],
  'COG-28': [['College and career advising plan', { effectiveDate: days(-85) }]],
  'COG-30': [['Assessment calendar and common-assessment policy', { effectiveDate: days(-180) }]],
  // assurances: A1, A2, A3, A5 met · A4, A6 NOT met (must-pass 4 of 6)
  'COG-A1': [{ link: 'policy', policy: 'Board Governance Policy Manual' }, ['Board training attendance record', { effectiveDate: days(-150) }]],
  'COG-A2': [['FY25 audited financial statements', { tag: 'financial_audit', effectiveDate: months(-17, days(-15)) }]],
  'COG-A3': [['Safety and crisis management plan', { tag: 'safety_plan', effectiveDate: months(-12, days(45)) }]],
  'COG-A5': [['Admissions viewbook and website review', { tag: 'marketing', effectiveDate: months(-24, days(58)) }]],
}

const PRIOR_FINDINGS = [
  ['COG-7', 'Formalize the continuous improvement process so that goals, data and progress monitoring are documented and shared with all stakeholders.', 'closed', 'Continuous improvement plan adopted by the board; annual update filed.'],
  ['COG-10', 'Implement a consistent, documented evaluation cycle for all professional staff.', 'closed', 'Staff Hiring, Supervision and Evaluation Policy revised; evaluation calendar in use.'],
  ['COG-15', 'Develop a multi-year financial plan aligned to the strategic priorities.', 'closed', 'Five-year financial model presented to the Finance Committee.'],
  ['COG-12', 'Establish a systematic curriculum review cycle with documented outcomes.', 'open', null],
  ['COG-24', 'Use learner performance and perception data more systematically in decision-making.', 'closed', 'Data review protocol adopted; fall census reviewed by the steering committee.'],
]

const IMPROVEMENT = [
  {
    title: 'File the legal-compliance attestation and Cognia training records',
    description: 'Clears two must-pass gates (COG-A4, COG-A6) before the progress report.',
    status: 'in_progress', originType: 'assurance', originCode: 'COG-A4',
    startDate: days(-46), dueDate: days(104), progressSource: 'milestone',
    milestones: [['Assign owners for both gates', true], ['Collect training certificates', true], ['Counsel review of attestation', false], ['Upload to the Cognia portal', false]],
    riskLevel: 'medium',
  },
  {
    title: 'Self-score the remaining Growth in Learning standards',
    description: 'Score COG-25 and COG-29 with the steering committee and attach proof.',
    status: 'in_progress', originType: 'gap', originCode: 'COG-29',
    startDate: days(-169), dueDate: days(62), progressSource: 'milestone', targetRubricScore: 3,
    milestones: [['Gather professional-learning records', true], ['Department self-ratings', false], ['Steering committee calibration', false], ['Attach evidence', false], ['Board summary', false]],
    riskLevel: 'high', riskNote: 'Department ratings slipped past the September meeting.',
  },
  {
    title: 'Bring board policy reviews back on schedule',
    description: 'Review the Conflict of Interest and Admissions policies at the next two board meetings.',
    status: 'planned', originType: 'manual', originCode: null,
    startDate: days(-16), dueDate: days(165), progressSource: 'manual', manualProgressPct: 0.1,
    riskLevel: 'low',
  },
]

async function loadAccreditation(schoolId, refs) {
  log('[cedar] accreditation — Cognia 2025')
  const base = `/schools/${schoolId}/accreditation`
  // 1. adopt (the real endpoint; idempotent gap-filler on re-run)
  const fws = (await get(`${base}/frameworks`)).frameworks
  const cognia = fws.find((f) => f.code === 'cognia_2025')
  if (!cognia.adopted) {
    const r = await post(`${base}/frameworks/cognia_2025/adopt`, {})
    log(`  + adopted cognia_2025 (${r.created} rows)`)
    stats.created++
  } else stats.kept++
  for (const other of fws.filter((f) => f.adopted && f.code !== 'cognia_2025')) {
    log(`  ! WARNING: ${other.code} is also adopted at Cedar Ridge — the Journey title would change`)
  }
  // 2. the Cognia division (metadata on the one Cognia framework). Bayview is a
  //    FLORIDA network, and Florida schools sit in Cognia's SACS CASI division
  //    (NCA CASI is the north-central one) — the product offers both, so r2's
  //    narration names SACS CASI.
  if (cognia.division !== DIVISION) {
    await patch(`${base}/frameworks/cognia_2025/profile`, { division: DIVISION })
    stats.updated++
    log(`  ~ division ${DIVISION}`)
  } else stats.kept++
  // 3. the six-year cycle, anchored ~43 months back so the Progress Report is ~5 months out
  const lastReviewDate = months(-48, days(150))
  const cyc = await get(`${base}/cycle`)
  if (!cyc.configured || cyc.anchor?.lastReviewDate !== lastReviewDate || cyc.anchor?.termYears !== 6) {
    await put(`${base}/cycle`, { frameworkId: cognia.id, lastReviewDate, termYears: 6 })
    stats.updated++
    log(`  ~ cycle anchored at ${lastReviewDate} (6-year term)`)
  } else stats.kept++

  // 4. standards: scores, ratings, owners
  const std = (await get(`${base}/standards`)).standards
  const byCode = Object.fromEntries(std.filter((s) => s.frameworkId === cognia.id || s.catalogStandardId).map((s) => [s.code, s]))
  const leaves = Object.keys(byCode).filter((c) => /^COG-\d+$/.test(c))
  if (leaves.length !== 31) throw new Error(`expected 31 Cognia leaves, found ${leaves.length}`)
  for (const code of [...leaves, 'COG-A1', 'COG-A2', 'COG-A3', 'COG-A4', 'COG-A5', 'COG-A6']) {
    const s = byCode[code]
    const score = SCORES[code] ?? null
    const isGate = /^COG-A/.test(code)
    const desired = isGate
      ? { rating: EVIDENCE[code] ? 'met' : 'not_met' }
      : { rubricScore: score, rating: score ? RATING_FOR[score] : 'not_started' }
    if (OWNERS[code]) desired.owner = OWNERS[code]
    if (code === 'COG-15' || code === 'COG-8' || code === 'COG-7') desired.ownerUserId = TOK.user.id
    if (differs(s, desired)) {
      await patch(`${base}/standards/${s.id}`, desired)
      stats.updated++
    } else stats.kept++
  }
  log(`  ~ ${Object.keys(SCORES).length} of 31 standards scored`)

  // 5a. one historical board report (FY 2025 packet) so r4's "Attach from
  //     operations" lists a board report. Title + generated stamp only — no MD&A,
  //     no explanations — and NEVER the FY 2026 period (f9 films "Draft with AI"
  //     on FY 2026). Skipped if any board report already exists on FY 2025.
  {
    const periods = await get(`/schools/${schoolId}/periods`)
    const fy25 = periods.find((p) => String(p.periodEndDate ?? '').startsWith('2025-06-30'))
    const pre = await get(`${base}/evidence-sources`)
    const has = (pre.boardReports ?? []).some((b) => /2025/.test(b.label ?? '') || b.fiscalPeriodId === fy25?.id)
    if (!fy25) log('  ! no FY 2025 period yet — board report skipped (re-run after finance loads)')
    else if (!has) {
      await put(`/schools/${schoolId}/periods/${fy25.id}/board-report`, {
        reportTitle: 'FY2025 Finance Committee Report',
        committeeName: 'Finance Committee',
        markGenerated: true,
      })
      stats.created++
      log('  + board report FY 2025 (title only)')
    } else stats.kept++
  }

  // 5. evidence
  const sources = await get(`${base}/evidence-sources`)
  let evCount = 0
  for (const [code, items] of Object.entries(EVIDENCE)) {
    const s = byCode[code]
    const have = (await get(`${base}/standards/${s.id}/evidence`))
    const list = Array.isArray(have) ? have : (have.evidence ?? [])
    for (const item of items) {
      let body
      let matchFn
      if (Array.isArray(item)) {
        const [title, extra] = item
        body = { title, kind: 'document', sourceType: 'manual', ...extra }
        matchFn = (e) => e.title === title
      } else if (item.link === 'meeting') {
        const m = sources.meetings.find((x) => /Board of Trustees/.test(x.label))
        if (!m) throw new Error('no approved board minutes to link')
        body = { sourceType: 'meeting', sourceRef: m.id, tag: 'board_minutes' }
        matchFn = (e) => e.sourceType === 'meeting'
      } else if (item.link === 'policy') {
        const pid = refs.policies[item.policy]
        body = { sourceType: 'policy', sourceRef: pid, tag: 'policy_manual' }
        matchFn = (e) => e.sourceType === 'policy' && e.sourceRef === pid
      } else if (item.link === 'strategic_plan') {
        body = { sourceType: 'strategic_plan', sourceRef: refs.planId, tag: 'strategic_plan' }
        matchFn = (e) => e.sourceType === 'strategic_plan'
      } else if (item.link === 'governance_report') {
        body = { sourceType: 'governance_report', title: item.title, ...(item.extra ?? {}) }
        matchFn = (e) => e.sourceType === 'governance_report'
      }
      const hit = list.find(matchFn)
      if (!hit) {
        await post(`${base}/standards/${s.id}/evidence`, body)
        stats.created++
        evCount++
      } else {
        const upd = { ...body }
        delete upd.sourceType
        delete upd.sourceRef
        delete upd.kind
        if (differs(hit, upd)) {
          await patch(`${base}/standards/${s.id}/evidence/${hit.id}`, upd)
          stats.updated++
        } else stats.kept++
      }
    }
  }
  log(`  + ${evCount} evidence rows created this run`)

  // 6. prior-visit findings from the last Engagement Review
  const pv = (await get(`${base}/prior-visit-findings`)).findings
  for (const [code, text, status, evidenceRef] of PRIOR_FINDINGS) {
    const desired = { frameworkId: cognia.id, visitDate: lastReviewDate, citedStandardCode: code, text, status, closedDate: status === 'closed' ? days(-200 - code.length * 10) : null, evidenceRef }
    const hit = pv.find((f) => f.citedStandardCode === code && f.text === text)
    if (!hit) {
      await post(`${base}/prior-visit-findings`, desired)
      stats.created++
    } else if (differs(hit, { status, visitDate: lastReviewDate })) {
      await patch(`${base}/prior-visit-findings/${hit.id}`, desired)
      stats.updated++
    } else stats.kept++
  }

  // 7. improvement initiatives (one in flight, one behind pace, one planned)
  const imp = (await get(`/schools/${schoolId}/improvement`)).initiatives
  for (const it of IMPROVEMENT) {
    const body = {
      title: it.title,
      description: it.description,
      status: it.status,
      ownerUserId: TOK.user.id,
      originType: it.originType,
      originRef: it.originCode ? byCode[it.originCode].id : null,
      startDate: it.startDate,
      dueDate: it.dueDate,
      progressSource: it.progressSource,
      riskLevel: it.riskLevel,
    }
    if (it.milestones) body.milestones = it.milestones.map(([label, done]) => ({ label, done }))
    if (it.manualProgressPct != null) body.manualProgressPct = it.manualProgressPct
    if (it.targetRubricScore) body.targetRubricScore = it.targetRubricScore
    if (it.riskNote) body.riskNote = it.riskNote
    const hit = imp.find((x) => x.title === it.title)
    if (!hit) {
      await post(`/schools/${schoolId}/improvement/initiatives`, body)
      stats.created++
      log(`  + improvement ${it.title}`)
    } else if (differs(hit, { status: it.status, dueDate: it.dueDate, startDate: it.startDate })) {
      const upd = { ...body }
      delete upd.originType
      delete upd.originRef
      await patch(`/schools/${schoolId}/improvement/initiatives/${hit.id}`, upd)
      stats.updated++
    } else stats.kept++
  }

  return {
    frameworkId: cognia.id,
    lastReviewDate,
    r4StandardCode: R4_STANDARD,
    r4StandardId: byCode[R4_STANDARD].id,
    quickWins: QUICK_WINS.map((c) => ({ code: c, id: byCode[c].id })),
    standardIds: Object.fromEntries(Object.entries(byCode).map(([c, s]) => [c, s.id])),
  }
}

async function resetTakes() {
  log('[reset] r4 + o2 takes')
  const base = `/schools/${CEDAR}/accreditation`
  const std = (await get(`${base}/standards`)).standards
  for (const code of QUICK_WINS) {
    const s = std.find((x) => x.code === code)
    if (!s) continue
    const have = await get(`${base}/standards/${s.id}/evidence`)
    for (const e of Array.isArray(have) ? have : (have.evidence ?? [])) {
      await api('DELETE', `${base}/standards/${s.id}/evidence/${e.id}`)
      log(`  - evidence on ${code}: ${e.title ?? e.sourceType}`)
    }
  }
  const keep = new Set(IMPROVEMENT.map((i) => i.title))
  for (const it of (await get(`/schools/${CEDAR}/improvement`)).initiatives) {
    if (keep.has(it.title)) continue
    await api('DELETE', `/schools/${CEDAR}/improvement/initiatives/${it.id}`)
    log(`  - improvement ${it.title}`)
  }
  for (const it of (await get(`/schools/${AURELIA}/facilities/maintenance`)).items) {
    if (!(/gym/i.test(it.title) && /roof/i.test(it.title))) continue
    await api('DELETE', `/schools/${AURELIA}/facilities/maintenance/${it.id}`)
    log(`  - repair ${it.title}`)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
await login()
log(`logged in as ${TOK.user.email}; today=${TODAY}; api=${API}`)
const t0 = performance.now()
try {
  for (const [key, schoolId] of [['cedar', CEDAR], ['aurelia', AURELIA]]) {
    const o = OUT[key]
    if (want('governance') || want('hr') || want('accreditation')) o.people = await loadPeople(key, schoolId)
    if (want('governance') || want('accreditation')) {
      o.policies = await loadPolicies(key, schoolId)
      o.committees = await loadCommittees(key, schoolId, o.people)
      o.meetings = await loadMeetings(key, schoolId, o.committees)
    }
    if (want('strategy') || want('accreditation')) o.strategy = await loadStrategy(key, schoolId)
    if (want('facilities')) o.facilities = await loadFacilities(key, schoolId)
    if (want('hr')) await loadHr(key, schoolId, o.people)
    if (want('hr') || want('staffing')) o.staffing = await loadStaffing(key, schoolId)
  }
  if (RESET) await resetTakes()
  if (want('advancement')) OUT.aurelia.advancement = await loadAdvancement(AURELIA)
  if (want('accreditation')) {
    OUT.cedar.accreditation = await loadAccreditation(CEDAR, { policies: OUT.cedar.policies, planId: OUT.cedar.strategy.planId })
  }
} finally {
  const outDir = path.join(REPO, 'demo-video/seed-v4/out')
  fs.writeFileSync(path.join(outDir, 'accreditation.json'), JSON.stringify(OUT, null, 2))
  log(`\ndone in ${((performance.now() - t0) / 1000).toFixed(1)}s · ${CALLS} API calls · created ${stats.created} · updated ${stats.updated} · kept ${stats.kept}`)
}

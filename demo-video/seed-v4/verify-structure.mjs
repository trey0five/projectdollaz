#!/usr/bin/env node
// KYRO demo v4 — READ-ONLY proof that the structure seed works through the real
// product API. Logs in ONCE as Morgan (POST /auth/login, real password from the
// gitignored .env.capture.local), keeps the token in memory only, then checks:
//   • GET /schools  → exactly the six demo schools, all role owner
//   • GET /organizations/me → Bayview Catholic Schools, all six, can_edit
//   • GET /schools/:id/billing → entitled, every sellable module, ~1 year left
//   • one real @RequiresModule-gated GET per module per school → never 402/403
// Never prints the password or the token. Usage: node verify-structure.mjs [api]
import fs from 'node:fs'
import path from 'node:path'

const REPO = '/home/dream/dollaz'
const API = process.argv[2] || 'http://127.0.0.1:8000'
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'demo-video/seed-v4/out/structure.json'), 'utf8'))
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(REPO, 'demo-video/.env.capture.local'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
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
    return body
  }
  throw new Error('login rate-limited 6 times')
}

// One real gated GET per module (no period needed).
const MODULE_PROBES = {
  finance: (s) => `/schools/${s}/cash-flow/opening`, // @RequiresModule('finance','planning')
  planning: (s) => `/schools/${s}/cash-flow/opening`,
  governance: (s) => `/schools/${s}/policies`,
  enrollment: (s) => `/schools/${s}/enrollment/status`,
  hr: (s) => `/schools/${s}/hr/clearances`,
  facilities: (s) => `/schools/${s}/facilities/maintenance`,
  advancement: (s) => `/schools/${s}/advancement/campaigns`,
  accreditation: (s) => `/schools/${s}/accreditation/standards`,
  strategy: (s) => `/schools/${s}/strategy/plans`,
  academics: (s) => `/schools/${s}/academics/status`,
}

let failures = 0
const check = (ok, label) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

const auth = await login()
check(auth.user?.email === env.MORGAN_EMAIL && auth.user?.first_name === 'Morgan', `POST /auth/login → 200 as ${auth.user?.email} (first_name ${auth.user?.first_name})`)
const H = { authorization: `Bearer ${auth.access_token}` }
const get = async (p) => {
  const r = await fetch(`${API}${p}`, { headers: H })
  let body = null
  try {
    body = await r.json()
  } catch {}
  return { status: r.status, body }
}

const want = manifest.schools.map((s) => s.id).sort()
const schools = await get('/schools')
const got = (schools.body ?? []).map((s) => s.id).sort()
check(schools.status === 200 && JSON.stringify(got) === JSON.stringify(want), `GET /schools → exactly the ${want.length} demo schools (got ${got.length})`)
check((schools.body ?? []).every((s) => s.role === 'owner'), 'every school role = owner')
check(schools.body?.[0]?.name === 'St. Aurelia Academy', `first (default) school = ${schools.body?.[0]?.name}`)
for (const s of schools.body ?? []) {
  console.log(`      ${s.name} · ${s.schoolType} ${s.gradeLow}–${s.gradeHigh} · ${s.county} · ${s.district}`)
}

const org = await get('/organizations/me')
check(
  org.status === 200 && org.body?.name === manifest.org.name && org.body?.can_edit === true && org.body?.schools?.length === want.length,
  `GET /organizations/me → "${org.body?.name}", ${org.body?.schools?.length} schools, can_edit=${org.body?.can_edit}`,
)

for (const s of manifest.schools) {
  const b = await get(`/schools/${s.id}/billing`)
  const keys = new Set((b.body?.licensedModules ?? []).map((m) => m.key))
  const missing = manifest.licensedModules.filter((k) => !keys.has(k))
  check(
    b.status === 200 && b.body?.isEntitled === true && missing.length === 0 && (b.body?.daysLeft ?? 0) >= 360,
    `${s.name}: billing entitled=${b.body?.isEntitled} status=${b.body?.status} daysLeft=${b.body?.daysLeft} missing=[${missing}]`,
  )
  const codes = []
  for (const [mod, probe] of Object.entries(MODULE_PROBES)) {
    const r = await get(probe(s.id))
    const blocked = r.status === 402 || r.status === 403 || r.status === 401
    if (blocked) failures++
    codes.push(`${mod}:${r.status}${blocked ? `(${r.body?.code ?? ''})` : ''}`)
  }
  console.log(`      gated GETs → ${codes.join(' ')}`)
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)

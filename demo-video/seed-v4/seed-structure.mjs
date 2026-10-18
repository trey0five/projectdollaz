#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// KYRO demo v4 — STRUCTURE seed for the fictional "Bayview Catholic Schools"
// network (LOCAL dev DB only).
//
// This is the ONLY direct-DB writer in the v4 pipeline. It creates/updates:
//   • the organization "Bayview Catholic Schools" (Florida, fictional)
//   • its six schools + their peer profile (type, grade span, county, district)
//   • the demo user Morgan (morgan@demo.example.com — RFC 2606 reserved domain),
//     email verified, MFA not enrolled, password hashed EXACTLY like
//     apps/api/src/auth/password.service.ts (pbkdf2_sha256, 600k, 16B salt, 64B key)
//   • OWNER memberships on the six demo schools only
//   • a trialing subscription per school, trial_end one year out, every sellable
//     module licensed (licensed_modules = ARRAY OF {key, tier} OBJECTS)
// Every other row (statements, rosters, scores, accreditation …) goes in through
// the product API as Morgan (seed-v4 content loader), never here.
//
// SAFETY LOCKS
//   1. Refuses to run without --i-am-local.
//   2. Refuses any DATABASE_URL that is not the local docker Postgres
//      (host 127.0.0.1|localhost, port 5434, database finrep), and re-checks the
//      server itself (current_database() = 'finrep', docker port mapping 5434).
//   3. Only ever touches its own org: org is found by exact name and must be
//      unique; schools are matched inside that org only; the Morgan user must not
//      hold memberships outside the org (else abort, nothing written).
//   4. Refuses if any demo school name collides (normalised) with a school in
//      another org of the dev DB.
//   5. Never prints the password. It lives only in
//      demo-video/.env.capture.local (gitignored, mode 600). Re-runs REUSE it.
//
// Idempotent: re-running updates the same rows in place and never deletes or
// resets content loaded later (periods, rosters, scores, accreditation …).
//
// Usage:  node demo-video/seed-v4/seed-structure.mjs --i-am-local
//         (DATABASE_URL optional; if unset it is built from the repo .env
//          POSTGRES_* values for 127.0.0.1:5434 without printing them)
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { pbkdf2Sync, randomBytes, randomInt } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const REPO = '/home/dream/dollaz'
const ENV_CAPTURE = path.join(REPO, 'demo-video/.env.capture.local')
const OUT_DIR = path.join(REPO, 'demo-video/seed-v4/out')

// ── Cast (fictional; Florida, Tampa Bay area counties) ──────────────────────
export const ORG_NAME = 'Bayview Catholic Schools'
export const MORGAN_EMAIL = 'morgan@demo.example.com'
const MORGAN_FIRST = 'Morgan'
const MORGAN_LAST = 'Lane'
const MORGAN_TITLE = 'Chief Operating Officer'

// Order matters: St. Aurelia's membership is the OLDEST, so it is the default
// school on /app and the org resolved by /organizations/me.
export const SCHOOLS = [
  { key: 'aurelia', name: 'St. Aurelia Academy', schoolType: 'K-8', gradeLow: 'PK3', gradeHigh: '8', county: 'Pinellas', district: 'North Bay Deanery' },
  { key: 'cedar', name: 'Cedar Ridge Preparatory', schoolType: 'High', gradeLow: '9', gradeHigh: '12', county: 'Hillsborough', district: 'South Bay Deanery' },
  { key: 'mangrove', name: 'Mangrove Point Catholic High School', schoolType: 'High', gradeLow: '9', gradeHigh: '12', county: 'Sarasota', district: 'South Bay Deanery' },
  { key: 'odile', name: 'St. Odile Catholic School', schoolType: 'K-8', gradeLow: 'PK3', gradeHigh: '8', county: 'Hillsborough', district: 'South Bay Deanery' },
  { key: 'heron', name: 'Heron Cove Academy', schoolType: 'K-8', gradeLow: 'PK3', gradeHigh: '8', county: 'Manatee', district: 'South Bay Deanery' },
  // Left EMPTY (no periods) for the live upload. 9–12 per the storyboard's
  // recommendation (a third A C T school for a7; academics rows never touch the
  // finance periods f1–f3 need empty).
  { key: 'brightwater', name: 'Brightwater School', schoolType: 'High', gradeLow: '9', gradeHigh: '12', county: 'Pasco', district: 'North Bay Deanery' },
]

// Every SELLABLE module key from packages/db/src/modules.ts (core is always-on
// and never stored). Read from the built registry so it can never drift.
async function sellableModuleKeys() {
  const mod = await import(path.join(REPO, 'packages/db/dist/modules.js'))
  const keys = mod.SELLABLE_MODULE_KEYS ?? mod.MODULE_KEYS.filter((k) => k !== 'core')
  return [...keys]
}

// ── Password hashing — lockstep with apps/api/src/auth/password.service.ts ──
const ALGO = 'pbkdf2_sha256'
const ITERS = 600000
const SALT_LEN = 16
const KEY_LEN = 64
function hashPassword(pw) {
  const salt = randomBytes(SALT_LEN)
  const hash = pbkdf2Sync(pw, salt, ITERS, KEY_LEN, 'sha256')
  return { algo: ALGO, iters: ITERS, salt, hash }
}

function generatePassword() {
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const L = 'abcdefghijkmnpqrstuvwxyz'
  const D = '23456789'
  const S = '!#%*+-=?@^_'
  const all = U + L + D + S
  const pick = (set) => set[randomInt(set.length)]
  const chars = [pick(U), pick(U), pick(L), pick(L), pick(D), pick(D), pick(S), pick(S)]
  while (chars.length < 24) chars.push(pick(all))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

// Same rules as PasswordService.validateStrength.
function strongEnough(pw) {
  return (
    typeof pw === 'string' &&
    pw.length >= 10 &&
    pw.length <= 128 &&
    /[A-Z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw)
  )
}

function parseEnvFile(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}

function die(msg) {
  console.error(`seed-structure: REFUSING — ${msg}`)
  process.exit(2)
}

const norm = (s) => s.toLowerCase().replace(/^(saint|st)\.?\s+/, 'st ').replace(/[^a-z0-9]+/g, ' ').trim()

// ── Guards ──────────────────────────────────────────────────────────────────
function resolveDatabaseUrl() {
  if (!process.argv.includes('--i-am-local')) die('pass --i-am-local (this writes to the LOCAL dev DB).')
  let url = process.env.DATABASE_URL
  if (!url) {
    const env = parseEnvFile(path.join(REPO, '.env'))
    const user = env.POSTGRES_USER || 'finrep'
    const pw = env.POSTGRES_PASSWORD || 'finrep_dev_pw'
    const db = env.POSTGRES_DB || 'finrep'
    url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pw)}@127.0.0.1:5434/${db}?schema=public`
  }
  let u
  try {
    u = new URL(url)
  } catch {
    die('DATABASE_URL is not a URL.')
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) die('DATABASE_URL is not postgres.')
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) die(`host ${u.hostname} is not local.`)
  if (u.port !== '5434') die(`port ${u.port || '(default)'} is not the local docker Postgres (5434).`)
  if (u.pathname.replace(/^\//, '') !== 'finrep') die('database is not finrep.')
  // The local docker container must be the one publishing 5434.
  try {
    const mapping = execFileSync('docker', ['port', 'dollaz-postgres-1', '5432/tcp'], { encoding: 'utf8' })
    if (!/:5434\b/.test(mapping)) die('dollaz-postgres-1 does not publish 5434.')
  } catch (e) {
    die(`cannot confirm dollaz-postgres-1 publishes 5434 (${e.message.split('\n')[0]}).`)
  }
  return url
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const url = resolveDatabaseUrl()
  process.env.DATABASE_URL = url
  const require = createRequire(path.join(REPO, 'packages/db/package.json'))
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url } } })

  try {
    const [{ db }] = await prisma.$queryRaw`select current_database() as db`
    if (db !== 'finrep') die('connected database is not finrep.')

    const moduleKeys = await sellableModuleKeys()
    if (moduleKeys.length < 9) die(`module registry returned only ${moduleKeys.length} sellable keys.`)

    // Lock 3a: the org must be unique by name.
    const orgs = await prisma.organization.findMany({ where: { name: ORG_NAME } })
    if (orgs.length > 1) die(`${orgs.length} organizations are named "${ORG_NAME}"; fix by hand first.`)
    const existingOrgId = orgs[0]?.id ?? null

    // Lock 4: no collisions with schools in OTHER orgs.
    const others = await prisma.school.findMany({
      where: existingOrgId ? { organizationId: { not: existingOrgId } } : {},
      select: { name: true },
    })
    const otherNames = new Set(others.map((s) => norm(s.name)))
    for (const s of SCHOOLS) {
      if (otherNames.has(norm(s.name))) die(`school name "${s.name}" already exists in another org.`)
    }
    const orgClash = await prisma.organization.findMany({
      where: { name: { equals: ORG_NAME, mode: 'insensitive' }, NOT: existingOrgId ? { id: existingOrgId } : undefined },
      select: { id: true },
    })
    if (orgClash.length > 0) die('an org with a case-variant of the demo name exists.')

    // Lock 3b: Morgan must not belong to anything outside the demo org.
    const existingUser = await prisma.user.findUnique({
      where: { email: MORGAN_EMAIL },
      include: { memberships: { include: { school: { select: { organizationId: true } } } } },
    })
    if (existingUser) {
      const outside = existingUser.memberships.filter((m) => m.school.organizationId !== existingOrgId)
      if (outside.length > 0) die(`${MORGAN_EMAIL} already has ${outside.length} membership(s) outside the demo org.`)
    }

    // Password: reuse the one in .env.capture.local if present + strong; else generate.
    const cap = parseEnvFile(ENV_CAPTURE)
    let password = cap.MORGAN_PASSWORD
    let passwordState = 'reused'
    if (!strongEnough(password)) {
      password = generatePassword()
      passwordState = 'generated'
    }
    // Confirm gitignore BEFORE writing the secret.
    try {
      execFileSync('git', ['-C', REPO, 'check-ignore', '-q', ENV_CAPTURE])
    } catch {
      die(`${ENV_CAPTURE} is NOT gitignored; refusing to write the password.`)
    }
    const body =
      `# KYRO demo v4 capture login (LOCAL stack only). Gitignored. Never commit or print.\n` +
      `MORGAN_EMAIL=${MORGAN_EMAIL}\nMORGAN_PASSWORD=${password}\n`
    // Preserve any other keys a later pipeline step may have added.
    const extra = Object.entries(cap)
      .filter(([k]) => k !== 'MORGAN_EMAIL' && k !== 'MORGAN_PASSWORD')
      .map(([k, v]) => `${k}=${v}\n`)
      .join('')
    fs.writeFileSync(ENV_CAPTURE, body + extra, { mode: 0o600 })
    fs.chmodSync(ENV_CAPTURE, 0o600)

    const now = Date.now()
    const base = existingOrgId ? null : new Date(now - 60 * 60 * 1000) // stable ordering on first create
    const trialEnd = new Date(now + 365 * 24 * 60 * 60 * 1000)
    const licensed = moduleKeys.map((key) => ({ key, tier: null }))

    const result = await prisma.$transaction(async (tx) => {
      // Org
      const org = existingOrgId
        ? await tx.organization.findUniqueOrThrow({ where: { id: existingOrgId } })
        : await tx.organization.create({ data: { name: ORG_NAME, ...(base ? { createdAt: base } : {}) } })

      // User
      const { algo, iters, salt, hash } = hashPassword(password)
      const userData = {
        firstName: MORGAN_FIRST,
        lastName: MORGAN_LAST,
        passwordAlgo: algo,
        passwordIters: iters,
        passwordSalt: salt,
        passwordHash: hash,
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
        passwordResetCode: null,
        passwordResetExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        totpEnabled: false,
        totpSecretEnc: null,
        totpPendingSecretEnc: null,
        totpPendingExpiresAt: null,
        totpEnrolledAt: null,
        totpLastUsedStep: null,
        isAdmin: false,
      }
      const user = await tx.user.upsert({
        where: { email: MORGAN_EMAIL },
        update: userData,
        create: { email: MORGAN_EMAIL, ...userData, emailVerifiedAt: new Date(now) },
      })
      if (!user.emailVerifiedAt) {
        await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date(now) } })
      }
      // MFA leftovers (only ever Morgan's own rows).
      await tx.mfaBackupCode.deleteMany({ where: { userId: user.id } })

      const schools = []
      for (let i = 0; i < SCHOOLS.length; i++) {
        const s = SCHOOLS[i]
        const profile = {
          schoolType: s.schoolType,
          gradeLow: s.gradeLow,
          gradeHigh: s.gradeHigh,
          county: s.county,
          district: s.district,
        }
        const stamp = base ? new Date(base.getTime() + i * 60 * 1000) : undefined
        const found = await tx.school.findMany({ where: { organizationId: org.id, name: s.name } })
        if (found.length > 1) throw new Error(`duplicate "${s.name}" inside the demo org`)
        const school = found[0]
          ? await tx.school.update({ where: { id: found[0].id }, data: profile })
          : await tx.school.create({
              data: { organizationId: org.id, name: s.name, ...profile, ...(stamp ? { createdAt: stamp } : {}) },
            })

        const mem = await tx.membership.findUnique({
          where: { userId_schoolId: { userId: user.id, schoolId: school.id } },
        })
        if (mem) {
          await tx.membership.update({
            where: { id: mem.id },
            data: { role: 'owner', status: 'active', title: MORGAN_TITLE },
          })
        } else {
          await tx.membership.create({
            data: {
              userId: user.id,
              schoolId: school.id,
              role: 'owner',
              status: 'active',
              title: MORGAN_TITLE,
              createdAt: new Date((base ? base.getTime() : now) + i * 60 * 1000),
            },
          })
        }

        await tx.subscription.upsert({
          where: { schoolId: school.id },
          update: { status: 'trialing', trialEnd, licensedModules: licensed, cancelAtPeriodEnd: false },
          create: { schoolId: school.id, status: 'trialing', trialEnd, licensedModules: licensed },
        })
        schools.push({ key: s.key, id: school.id, name: s.name, ...profile })
      }

      // Lock 3c: within the demo org there are only our schools (no strays).
      const inOrg = await tx.school.findMany({ where: { organizationId: org.id }, select: { name: true } })
      const strays = inOrg.filter((r) => !SCHOOLS.some((s) => s.name === r.name))
      if (strays.length) throw new Error(`demo org holds unexpected schools: ${strays.map((r) => r.name).join(', ')}`)

      return { orgId: org.id, userId: user.id, schools }
    })

    // Non-secret manifest for the content loader / verifier.
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const manifest = {
      generatedAt: new Date().toISOString(),
      org: { id: result.orgId, name: ORG_NAME, state: 'FL' },
      user: { id: result.userId, email: MORGAN_EMAIL, firstName: MORGAN_FIRST, title: MORGAN_TITLE },
      fiscalYear: 'Jul–Jun (FY label = year of June 30 end)',
      trialEnd: trialEnd.toISOString(),
      licensedModules: moduleKeys,
      schools: result.schools,
    }
    fs.writeFileSync(path.join(OUT_DIR, 'structure.json'), JSON.stringify(manifest, null, 2) + '\n')

    console.log(`seed-structure: OK — org ${result.orgId} "${ORG_NAME}", ${result.schools.length} schools, user ${MORGAN_EMAIL} (password ${passwordState}; stored in .env.capture.local, mode 600)`)
    for (const s of result.schools) console.log(`  ${s.key.padEnd(12)} ${s.id}  ${s.name}  [${s.schoolType} ${s.gradeLow}–${s.gradeHigh}, ${s.county} Co.]`)
    console.log(`  modules: ${moduleKeys.join(', ')} · trial_end ${trialEnd.toISOString().slice(0, 10)}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(`seed-structure: FAILED — ${e.message}`)
  process.exit(1)
})

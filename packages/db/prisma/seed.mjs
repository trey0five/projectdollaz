// ─────────────────────────────────────────────────────────────────────────────
// Idempotent seed: an Organization + the demo 'Sample 01 High School'
// (begin-balances 7870000/7500000/7500000, matching sample-data) + a verified
// OWNER dev user so a
// reviewer can log in immediately and the report preview works end to end.
//
// PBKDF2 is inlined (node:crypto) to keep @finrep/db dependency-free and avoid a
// db -> api cycle. It MUST stay in lockstep with apps/api/src/auth/password.service.ts
// (algo 'pbkdf2_sha256', 600000 iterations, 64-byte SHA-256 key, 16-byte salt).
// ─────────────────────────────────────────────────────────────────────────────
import { PrismaClient } from '@prisma/client'
import { pbkdf2Sync, randomBytes } from 'node:crypto'

const prisma = new PrismaClient()

const ALGO = 'pbkdf2_sha256'
const ITERS = 600000
const KEYLEN = 64

function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = pbkdf2Sync(password, salt, ITERS, KEYLEN, 'sha256')
  return { algo: ALGO, iters: ITERS, salt, hash }
}

async function main() {
  const ownerEmail = (process.env.DEV_OWNER_EMAIL ?? 'owner@finrep.dev').toLowerCase()
  const ownerPassword = process.env.DEV_OWNER_PASSWORD ?? 'Password123!'

  // Organization (idempotent by name).
  let org = await prisma.organization.findFirst({ where: { name: 'Sample Org' } })
  if (!org) {
    org = await prisma.organization.create({ data: { name: 'Sample Org' } })
  }

  // School (idempotent by org+name) with the demo begin-balances.
  let school = await prisma.school.findFirst({
    where: { organizationId: org.id, name: 'Sample 01 High School' },
  })
  const beginBalances = {
    netAssetsBegin: 7870000,
    pyNetAssetsBegin: 7500000,
    auditNetAssetsBegin: 7500000,
  }
  if (!school) {
    school = await prisma.school.create({
      data: { organizationId: org.id, name: 'Sample 01 High School', ...beginBalances },
    })
  } else {
    school = await prisma.school.update({ where: { id: school.id }, data: beginBalances })
  }

  // Verified OWNER dev user (idempotent by email). Re-hash on each run so the
  // known dev password always works even if rules change.
  const { algo, iters, salt, hash } = hashPassword(ownerPassword)
  const user = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      passwordAlgo: algo,
      passwordIters: iters,
      passwordSalt: salt,
      passwordHash: hash,
      emailVerified: true,
    },
    create: {
      email: ownerEmail,
      firstName: 'Demo',
      lastName: 'Owner',
      passwordAlgo: algo,
      passwordIters: iters,
      passwordSalt: salt,
      passwordHash: hash,
      emailVerified: true,
    },
  })

  // Owner membership (idempotent by unique [userId, schoolId]).
  await prisma.membership.upsert({
    where: { userId_schoolId: { userId: user.id, schoolId: school.id } },
    update: { role: 'owner', status: 'active' },
    create: { userId: user.id, schoolId: school.id, role: 'owner', status: 'active' },
  })

  console.log(`[seed] org=${org.id} school=${school.id} owner=${ownerEmail} (password: ${ownerPassword})`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('[seed] failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })

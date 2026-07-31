// ─────────────────────────────────────────────────────────────────────────────
// Accreditation Intelligence Phase A — the DEMO readiness history seeder.
//
// A readiness chart is worthless in a demo until it has a past, and a school
// that signed up yesterday has none. This seeder manufactures that past — which
// makes it the single most dangerous file in the phase, because manufactured
// history is indistinguishable from real history unless we force it not to be.
//
// So every row it writes carries isDemo = true, every API payload derived from
// those rows reports demoData: true, and the UI renders a hard DEMO DATA chip.
// The data is honest about being invented; it is never allowed to pass as a
// school's real record.
//
// THREE HARD GUARDS, in order:
//   1. DEMO_SEED_ENABLED must be exactly 'true'. No flag, no run.
//   2. Under NODE_ENV=production the seeder refuses outright unless
//      DEMO_SEED_FORCE=true AND the target org name starts with 'DEMO — '.
//   3. It only ever creates/updates the DEMO org and its schools, and it only
//      ever deletes rows where isDemo = true. It cannot touch tenant data.
//
// Run:  DEMO_SEED_ENABLED=true pnpm -C packages/db seed:demo:accreditation
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client'
import { createHash } from 'node:crypto'

const prisma = new PrismaClient()

/** The 'DEMO — ' prefix is load-bearing: guard 2 checks for it literally. */
const ORG_NAME = 'DEMO — Sample Diocese'

const SCHOOLS: { name: string; frameworkCode: string }[] = [
  { name: 'DEMO — St. Aloysius Academy', frameworkCode: 'cognia_2022' },
  { name: 'DEMO — Holy Trinity School', frameworkCode: 'cognia_2022' },
  { name: 'DEMO — Riverside Country Day', frameworkCode: 'msa_cess_2022' },
  { name: 'DEMO — St. Brigid Catholic School', frameworkCode: 'nsbecs' },
  { name: 'DEMO — Our Lady of Mercy', frameworkCode: 'nsbecs' },
]

const MONTHS = 36

/**
 * What the demo schools are licensed for. Written as {key} OBJECTS because
 * BillingService.resolveLicensed only accepts that shape — an array of bare
 * strings parses to nothing and silently falls back to finance-only.
 * `finance` is listed explicitly: a non-empty stored set REPLACES the default,
 * so omitting it would strip the demo schools of the finance module.
 */
const DEMO_LICENSED_MODULES = [
  { key: 'finance', tier: null },
  { key: 'accreditation', tier: null },
  { key: 'governance', tier: null },
]

/** Far-future trial so the demo org never silently expires mid-demo. */
const DEMO_TRIAL_END = new Date(Date.UTC(2099, 0, 1))

// ── The FROZEN readiness formula ────────────────────────────────────────────
// Mirrors @finrep/compliance/accreditation-readiness.ts (RUBRIC_WEIGHT 0.7 /
// EVIDENCE_WEIGHT 0.3) and readiness-history.ts. Inlined deliberately: adding a
// @finrep/compliance dependency to @finrep/db for a dev-only script would drag
// the whole analytics graph into the DB package's build. If the weights ever
// change, this block changes with them — it is demo data, and it must look
// exactly like what the real engine would have produced.
const RUBRIC_WEIGHT = 0.7
const EVIDENCE_WEIGHT = 0.3

interface DemoLeaf {
  standardId: string
  code: string
  rubricScore: number | null
  evidenceCount: number
}

function leafReadiness(l: DemoLeaf): number {
  const rubricPart = l.rubricScore === null ? 0 : (l.rubricScore - 1) / 3
  const evidencePart = l.evidenceCount > 0 ? 1 : 0
  return Math.round(100 * (RUBRIC_WEIGHT * rubricPart + EVIDENCE_WEIGHT * evidencePart))
}

function readinessPct(leaves: DemoLeaf[]): number {
  if (leaves.length === 0) return 0
  return Math.round(leaves.reduce((s, l) => s + leafReadiness(l), 0) / leaves.length)
}

function selfScoredPct(leaves: DemoLeaf[]): number {
  if (leaves.length === 0) return 0
  const sum = leaves.reduce(
    (s, l) => s + (l.rubricScore === null ? 0 : (100 * (l.rubricScore - 1)) / 3),
    0,
  )
  return Math.round(sum / leaves.length)
}

function verifiedPct(leaves: DemoLeaf[]): number {
  if (leaves.length === 0) return 0
  return Math.round((100 * leaves.filter((l) => l.evidenceCount > 0).length) / leaves.length)
}

function projectedIndex(
  leaves: DemoLeaf[],
  indexMin: number | null,
  indexMax: number | null,
): number | null {
  if (indexMax === null || leaves.length === 0) return null
  const raw = Math.round((leaves.reduce((s, l) => s + (l.rubricScore ?? 1), 0) / leaves.length) * 100)
  return Math.min(indexMax, Math.max(indexMin ?? raw, raw))
}

function bandFor(bands: { min: number; label: string }[], index: number | null): string | null {
  if (index === null) return null
  let best: { min: number; label: string } | null = null
  for (const b of bands) if (b.min <= index && (best === null || b.min > best.min)) best = b
  return best ? best.label : 'Below accreditation threshold'
}

// ── Deterministic pseudo-randomness ─────────────────────────────────────────
// Seeded so re-running the seeder reproduces the SAME demo history. A demo that
// changes shape every run is a demo nobody can rehearse against.
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

/** Last day of the calendar month, `back` months before `from` (UTC). */
function monthEnd(from: Date, back: number): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - back + 1, 0))
}

/** UTC midnight of the calendar day of `at` — the @db.Date discipline. */
function utcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
}

/**
 * A reading is a record of something that already happened, so no demo row may
 * carry a date in the future. monthEnd(today, 0) is the last day of the CURRENT
 * month, which on any day but the 31st is tomorrow-or-later: /series would then
 * advertise a lastPointAt the default /trend window (to = today) excludes, and
 * the chart would end one month behind the live register the seeder just synced
 * to it — reproducing the exact incoherence this phase removes.
 */
function clampToToday(d: Date, today: Date): Date {
  const cap = utcDay(today)
  return d.getTime() > cap.getTime() ? cap : d
}

function fail(message: string): never {
  console.error(`\n  REFUSED: ${message}\n`)
  process.exit(1)
}

async function main(): Promise<void> {
  // ── Guard 1 ──────────────────────────────────────────────────────────────
  if (process.env.DEMO_SEED_ENABLED !== 'true') {
    fail(
      'DEMO_SEED_ENABLED is not "true". This seeder writes fabricated history and will not run without an explicit opt-in.',
    )
  }

  // ── Guard 2 ──────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    if (process.env.DEMO_SEED_FORCE !== 'true') {
      fail('NODE_ENV=production. Demo history must never exist in production tenancy.')
    }
    if (!ORG_NAME.startsWith('DEMO — ')) {
      fail(`NODE_ENV=production and the target org "${ORG_NAME}" is not prefixed "DEMO — ".`)
    }
    console.warn('  WARNING: seeding DEMO data under NODE_ENV=production (DEMO_SEED_FORCE=true).')
  }

  const frameworks = await prisma.accreditationFramework.findMany()
  if (frameworks.length === 0) {
    fail(
      'No accreditation frameworks found. Boot the API once so AccreditationCatalogService seeds the catalog, then re-run.',
    )
  }
  const fwByCode = new Map(frameworks.map((f) => [f.code, f]))

  // ── Org (idempotent by name) ─────────────────────────────────────────────
  let org = await prisma.organization.findFirst({ where: { name: ORG_NAME } })
  if (!org) org = await prisma.organization.create({ data: { name: ORG_NAME } })

  // ── Who can SEE the demo org ─────────────────────────────────────────────
  // Optional and opt-in: DEMO_SEED_OWNER_EMAIL names an EXISTING account that
  // gets owner membership on the demo schools. The seeder deliberately does not
  // create users or credentials — a fabricated login is not something a data
  // seeder should be able to mint.
  const ownerEmail = process.env.DEMO_SEED_OWNER_EMAIL?.trim().toLowerCase()
  const demoOwner = ownerEmail
    ? await prisma.user.findFirst({ where: { email: ownerEmail }, select: { id: true } })
    : null
  if (ownerEmail && !demoOwner) {
    fail(`DEMO_SEED_OWNER_EMAIL="${ownerEmail}" does not match any existing user.`)
  }
  if (!demoOwner) {
    console.warn(
      '  NOTE: no DEMO_SEED_OWNER_EMAIL set — the demo schools will exist but no one can select them in the school switcher.',
    )
  }

  let totalSnapshots = 0
  const today = new Date()

  for (let s = 0; s < SCHOOLS.length; s += 1) {
    const spec = SCHOOLS[s]
    const framework = fwByCode.get(spec.frameworkCode)
    if (!framework) {
      console.warn(`  skipping ${spec.name}: framework ${spec.frameworkCode} not in the catalog.`)
      continue
    }

    let school = await prisma.school.findFirst({
      where: { organizationId: org.id, name: spec.name },
    })
    if (!school) {
      school = await prisma.school.create({ data: { organizationId: org.id, name: spec.name } })
    }

    // ── Make the demo school actually demoable ───────────────────────────────
    // A school created straight through prisma.school.create has no Subscription
    // row (SchoolsService.createSchool is what normally establishes the trial).
    // Without one, isEntitledForModule('accreditation') is false: the nightly
    // capture skips the school and every readiness route 402s behind
    // EntitlementGuard — a demo org that cannot demo the feature it exists for.
    // NOTE the stored shape: an array of {key} OBJECTS, never bare strings.
    await prisma.subscription.upsert({
      where: { schoolId: school.id },
      update: {
        status: 'trialing',
        trialEnd: DEMO_TRIAL_END,
        licensedModules: DEMO_LICENSED_MODULES,
      },
      create: {
        schoolId: school.id,
        status: 'trialing',
        trialEnd: DEMO_TRIAL_END,
        licensedModules: DEMO_LICENSED_MODULES,
      },
    })

    // Nobody can select a school they are not a member of, so the demo org is
    // invisible in the school switcher until an existing user is attached. The
    // seeder never invents a user or a credential — you name a real account.
    if (demoOwner) {
      await prisma.membership.upsert({
        where: { userId_schoolId: { userId: demoOwner.id, schoolId: school.id } },
        update: { role: 'owner', status: 'active' },
        create: { userId: demoOwner.id, schoolId: school.id, role: 'owner', status: 'active' },
      })
    }

    // ── Adopt the framework's catalog tree (idempotent on catalogStandardId) ─
    const catalog = await prisma.accreditationCatalogStandard.findMany({
      where: { frameworkId: framework.id },
      orderBy: { orderIndex: 'asc' },
    })
    const idByCatalogId = new Map<string, string>()
    // Parents first so children can point at them.
    for (const node of [...catalog].sort((a, b) => (a.parentId === null ? -1 : 1) - (b.parentId === null ? -1 : 1))) {
      const existing = await prisma.accreditationStandard.findFirst({
        where: { schoolId: school.id, catalogStandardId: node.id },
        select: { id: true },
      })
      if (existing) {
        idByCatalogId.set(node.id, existing.id)
        continue
      }
      const created = await prisma.accreditationStandard.create({
        data: {
          schoolId: school.id,
          parentId: node.parentId ? (idByCatalogId.get(node.parentId) ?? null) : null,
          code: node.code,
          title: node.title,
          frameworkId: framework.id,
          catalogStandardId: node.id,
          sortOrder: node.orderIndex,
        },
      })
      idByCatalogId.set(node.id, created.id)
    }

    // LEAF = a catalog node nothing else parents, excluding assurance gates
    // (the frozen engine excludes them from the rubric/index math).
    const parentCatalogIds = new Set(catalog.map((c) => c.parentId).filter(Boolean))
    const leafNodes = catalog.filter((c) => !parentCatalogIds.has(c.id) && !c.isAssurance)
    if (leafNodes.length === 0) continue

    // ── Wipe THIS school's previous demo history (isDemo only — never real rows) ─
    await prisma.accreditationReadinessSnapshot.deleteMany({
      where: { schoolId: school.id, isDemo: true },
    })

    // ── Trajectory ───────────────────────────────────────────────────────────
    // Each leaf gets a month at which it is first scored and a month at which
    // evidence lands, both drawn from a seeded RNG. A deliberate minority never
    // reach either — a demo where everything resolves is a demo that teaches the
    // viewer to expect a product that always says "you're fine".
    const rng = makeRng(1000 + s * 97)
    const plan = leafNodes.map((node, i) => {
      const scoredAtMonth = Math.floor(rng() * (MONTHS + 8)) // > MONTHS ⇒ never scored
      const evidenceAtMonth = Math.floor(rng() * (MONTHS + 10)) // > MONTHS ⇒ open gap
      const ceiling = rng() < 0.25 ? 2 : rng() < 0.65 ? 3 : 4
      return { node, i, scoredAtMonth, evidenceAtMonth, ceiling }
    })

    const rows: {
      snapshotDate: Date
      leaves: DemoLeaf[]
    }[] = []
    for (let m = 0; m < MONTHS; m += 1) {
      const monthIndex = m // 0 = oldest
      const snapshotDate = clampToToday(monthEnd(today, MONTHS - 1 - m), today)
      const leaves: DemoLeaf[] = plan.map((p) => {
        const scored = monthIndex >= p.scoredAtMonth
        // Score climbs one level roughly every 8 months after it is first set.
        const climbed = scored
          ? Math.min(p.ceiling, 1 + Math.floor((monthIndex - p.scoredAtMonth) / 8) + 1)
          : null
        return {
          standardId: idByCatalogId.get(p.node.id) ?? p.node.id,
          code: p.node.code,
          rubricScore: climbed,
          evidenceCount: monthIndex >= p.evidenceAtMonth ? 1 : 0,
        }
      })
      rows.push({ snapshotDate, leaves })
    }

    const bands = Array.isArray(framework.statusBands)
      ? (framework.statusBands as unknown as { min: number; label: string }[])
      : []

    for (const r of rows) {
      const leaves = r.leaves
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code) || a.standardId.localeCompare(b.standardId))
      const index = projectedIndex(leaves, framework.indexMin, framework.indexMax)
      const payloadHash = createHash('sha256')
        .update(
          stableStringify({
            engineVersion: '1.0.0',
            catalogVersion: framework.version,
            seriesKey: framework.code,
            leafScores: leaves,
          }),
        )
        .digest('hex')

      await prisma.accreditationReadinessSnapshot.create({
        data: {
          schoolId: school.id,
          frameworkId: framework.id,
          seriesKey: framework.code,
          snapshotDate: r.snapshotDate,
          reason: 'demo_seed',
          readinessPct: readinessPct(leaves),
          selfScoredPct: selfScoredPct(leaves),
          verifiedPct: verifiedPct(leaves),
          projectedIndex: index,
          band: bandFor(bands, index),
          leafCount: leaves.length,
          scoredCount: leaves.filter((l) => l.rubricScore !== null).length,
          coveredCount: leaves.filter((l) => l.evidenceCount > 0).length,
          // Phase A never writes domainScores.
          leafScores: leaves as unknown as object,
          engineVersion: '1.0.0',
          catalogVersion: framework.version,
          payloadHash,
          isDemo: true,
        },
      })
      totalSnapshots += 1
    }

    // ── Make the LIVE register agree with the final reading ──────────────────
    // Otherwise the hero (computed live) and the chart (recorded) would show two
    // different schools, which is exactly the incoherence this phase removes.
    const final = rows[rows.length - 1].leaves
    for (const leaf of final) {
      await prisma.accreditationStandard.updateMany({
        where: { id: leaf.standardId, schoolId: school.id },
        data: {
          rubricScore: leaf.rubricScore,
          scoreProvenance: 'self',
          rubricScoredAt: leaf.rubricScore === null ? null : rows[rows.length - 1].snapshotDate,
        },
      })
      const have = await prisma.accreditationEvidence.count({
        where: { schoolId: school.id, standardId: leaf.standardId },
      })
      if (leaf.evidenceCount > 0 && have === 0) {
        await prisma.accreditationEvidence.create({
          data: {
            schoolId: school.id,
            standardId: leaf.standardId,
            title: 'DEMO — sample artifact',
            kind: 'note',
            notes: 'Fabricated demo evidence. Not a real artifact.',
          },
        })
      }
    }

    const last = rows[rows.length - 1].leaves
    console.log(
      `  ${spec.name}: ${framework.code}, ${MONTHS} monthly readings, ` +
        `${last.filter((l) => l.rubricScore !== null).length}/${last.length} scored, ` +
        `${last.filter((l) => l.evidenceCount === 0).length} open evidence gap(s).`,
    )
  }

  console.log(`\n  Demo org "${ORG_NAME}": ${totalSnapshots} snapshot(s), all flagged isDemo.\n`)
}

main()
  .catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  })

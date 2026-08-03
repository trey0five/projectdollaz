import { describe, expect, it, vi } from 'vitest'
import type { User } from '@finrep/db'
import { canonicalBulkAdoptPayload } from '@finrep/compliance'
import { PortfolioService } from './portfolio.service.js'
import { PortfolioBulkAdoptService } from './bulk-adopt.service.js'
import { ADOPT_REUSED } from '../improvement/improvement.service.js'
import { sha256hex } from '../common/hash.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import type { BillingService } from '../billing/billing.service.js'
import type { AuditService } from '../common/audit/audit.service.js'
import type { ImprovementService } from '../improvement/improvement.service.js'
import type { BulkAdoptDto } from './dto/bulk-adopt.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase I §5 + §6 — INTERVENTION PRIORITIES and BULK ADOPT.
//
// Two claims are tested here that nothing else in the phase can prove:
//   • aggregation is by `catalogStandardId` and by nothing else, because school
//     standards are per-school CLONES and `code` is free text on the clone;
//   • the write path is propose→confirm with exactly ONE audit row per school it
//     acted on, and it RIDES Phase G's idempotent adopt rather than re-implementing
//     the dedupe.
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'user-1' } as unknown as User
const ORG = 'org-1'
const CATALOG = '11111111-1111-4111-8111-111111111111'
const CATALOG_2 = '11111111-1111-4111-8111-222222222222'
const uuid = (n: number) => `4444444${n}-4444-4444-8444-444444444444`

interface Seed {
  id: string
  name: string
  role?: 'owner' | 'accountant' | 'viewer'
  licensed?: boolean
  /** clones this school holds: [catalogStandardId, rubricScore, evidenceCount] */
  standards?: [string, number | null, number][]
  /** clone `code` values, per standard index — deliberately allowed to DIFFER. */
  codes?: string[]
  /** initiatives already adopted, as [originRef(standardId)] */
  adopted?: string[]
}

const CATALOG_ROWS = [
  { id: CATALOG, frameworkId: 'fw-cognia', code: 'COG-14', title: 'Learning culture', domainKey: 'academics' },
  { id: CATALOG_2, frameworkId: 'fw-msa', code: 'MSA-2', title: 'Governance', domainKey: 'governance' },
]
const FRAMEWORKS = [
  { id: 'fw-cognia', code: 'cognia_2022', name: 'Cognia', indexMin: 100, indexMax: 400 },
  { id: 'fw-msa', code: 'msa_cess', name: 'MSA-CESS', indexMin: null, indexMax: null },
]

/** `${schoolId}::${catalogStandardId}` is the school's own clone id. */
const cloneId = (schoolId: string, catalogStandardId: string) => `${schoolId}::${catalogStandardId}`

function makeStack(seeds: Seed[]) {
  const audits: { action: string; schoolId?: string | null; targetId?: string | null }[] = []
  const writes: string[] = []
  const adoptCalls: { schoolId: string; originRef: string }[] = []

  const licensed = new Set(seeds.filter((s) => s.licensed !== false).map((s) => s.id))

  const cloneRows = seeds.flatMap((s) =>
    (s.standards ?? []).map(([catalogStandardId, rubricScore], i) => ({
      id: cloneId(s.id, catalogStandardId),
      schoolId: s.id,
      catalogStandardId,
      // FREE TEXT ON THE CLONE. Two schools may have edited it to differ.
      code: s.codes?.[i] ?? 'COG-14',
      rubricScore,
    })),
  )
  const evidenceRows = seeds.flatMap((s) =>
    (s.standards ?? []).map(([catalogStandardId, , evidenceCount]) => ({
      standardId: cloneId(s.id, catalogStandardId),
      _count: { _all: evidenceCount },
    })),
  )
  const adoptedRows = seeds.flatMap((s) =>
    (s.adopted ?? []).map((originRef) => ({
      id: `ini-${s.id}`,
      schoolId: s.id,
      originRef,
    })),
  )

  const track =
    <T>(name: string, fn: (args: never) => Promise<T>) =>
    async (args: never) => {
      if (/create|update|upsert|delete/i.test(name)) writes.push(name)
      return fn(args)
    }

  const prisma = {
    membership: {
      findMany: vi.fn(async () =>
        seeds.map((s) => ({
          role: s.role ?? 'owner',
          school: {
            id: s.id,
            name: s.name,
            organizationId: ORG,
            county: null,
            district: null,
            schoolType: 'parish',
            gradeLow: 'K',
            gradeHigh: '8',
          },
        })),
      ),
    },
    organization: { findUnique: vi.fn(async () => ({ id: ORG, name: 'Diocese' })) },
    accreditationStandard: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const ids = new Set((where.schoolId as { in: string[] }).in)
        const cat = where.catalogStandardId as string | { not: null } | undefined
        return cloneRows.filter(
          (r) =>
            ids.has(r.schoolId) && (typeof cat === 'string' ? r.catalogStandardId === cat : true),
        )
      }),
      groupBy: vi.fn(async () => []),
    },
    accreditationEvidence: {
      groupBy: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const ids = new Set((where.schoolId as { in: string[] }).in)
        return evidenceRows.filter((e) => ids.has(String(e.standardId).split('::')[0]))
      }),
    },
    accreditationCatalogStandard: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const ids = new Set(where.id.in)
        return CATALOG_ROWS.filter((c) => ids.has(c.id))
      }),
    },
    accreditationFramework: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const ids = new Set(where.id.in)
        return FRAMEWORKS.filter((f) => ids.has(f.id))
      }),
    },
    improvementInitiative: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const ids = new Set((where.schoolId as { in: string[] }).in)
        const refs = where.originRef as { in: string[] } | undefined
        return adoptedRows.filter(
          (r) => ids.has(r.schoolId) && (refs ? refs.in.includes(r.originRef) : true),
        )
      }),
      create: vi.fn(track('improvementInitiative.create', async () => ({ id: 'x' }))),
    },
    accreditationReadinessSnapshot: { groupBy: vi.fn(async () => []), findMany: vi.fn(async () => []) },
    accreditationFinding: { findMany: vi.fn(async () => []) },
    periodOperationalData: { findMany: vi.fn(async () => []) },
    improvementProgressEvent: { findMany: vi.fn(async () => []) },
  }

  const billing = { isEntitledForModule: vi.fn(async (id: string) => licensed.has(id)) }

  const audit = {
    write: vi.fn(async (entry: { action: string; schoolId?: string | null; targetId?: string | null }) => {
      writes.push('audit.write')
      audits.push(entry)
    }),
  }

  const improvement = {
    adopt: vi.fn(
      async (schoolId: string, dto: { originRef: string }) => {
        adoptCalls.push({ schoolId, originRef: dto.originRef })
        writes.push('improvement.adopt')
        // Phase G's real behaviour: an already-adopted (schoolId, originRef) comes
        // back marked REUSED and nothing is created.
        const already = adoptedRows.find(
          (r) => r.schoolId === schoolId && r.originRef === dto.originRef,
        )
        return already
          ? { id: already.id, [ADOPT_REUSED]: true }
          : { id: `new-${schoolId}` }
      },
    ),
  }

  const portfolio = new PortfolioService(
    prisma as unknown as PrismaService,
    billing as unknown as BillingService,
  )
  const service = new PortfolioBulkAdoptService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    improvement as unknown as ImprovementService,
    portfolio,
  )

  return { service, portfolio, prisma, audit, improvement, audits, writes, adoptCalls }
}

const dto = (over: Partial<BulkAdoptDto> = {}): BulkAdoptDto =>
  ({
    mode: 'propose',
    catalogStandardId: CATALOG,
    schoolIds: [],
    title: 'Run one diocesan workshop on COG-14',
    ...over,
  }) as BulkAdoptDto

function hashFor(schoolIds: string[], over: Partial<BulkAdoptDto> = {}): string {
  return sha256hex(
    canonicalBulkAdoptPayload({
      orgId: ORG,
      catalogStandardId: (over.catalogStandardId as string) ?? CATALOG,
      schoolIds,
      title: (over.title as string) ?? 'Run one diocesan workshop on COG-14',
      dueDate: over.dueDate ?? null,
      targetRubricScore: over.targetRubricScore ?? null,
    }),
  )
}

/**
 * Narrow `bulkAdopt`'s discriminated return to the CONFIRM shape.
 *
 * `schools[]` is `BulkAdoptPreviewRow[]` on the propose branch and
 * `BulkAdoptAppliedRow[]` on the confirm branch, so `applied` / `failureMessage`
 * only exist once the union has been narrowed. Narrowing HERE — rather than
 * casting at each assertion — means a future change that stops the confirm
 * branch carrying those keys is a TYPE error in this spec, not a silently
 * weakened assertion.
 */
function confirmed(res: Awaited<ReturnType<PortfolioBulkAdoptService['bulkAdopt']>>) {
  if (res.mode !== 'confirm') throw new Error(`expected a confirm result, got ${res.mode}`)
  return res
}

/** Fourteen schools; five have already adopted this standard. */
function fourteen(): Seed[] {
  return Array.from({ length: 14 }, (_, i) => ({
    id: uuid(i % 10) + i,
    name: `School ${i}`,
    standards: [[CATALOG, i % 4 === 0 ? 4 : 2, i % 3] as [string, number | null, number]],
    adopted: i < 5 ? [cloneId(uuid(i % 10) + i, CATALOG)] : [],
  }))
}

// ── BA-1 ─────────────────────────────────────────────────────────────────────
describe('BA-1 — propose performs ZERO writes', () => {
  // RED PROOF (run): calling `this.improvement.adopt(...)` during propose makes
  // `writes` non-empty and this goes red.
  it('no create/update/upsert, no adopt, no audit row', async () => {
    const seeds = fourteen()
    const { service, writes, audits } = makeStack(seeds)
    const res = await service.bulkAdopt(
      USER,
      ORG,
      dto({ mode: 'propose', schoolIds: seeds.map((s) => s.id) }),
    )
    expect(writes).toEqual([])
    expect(audits).toEqual([])
    expect(res.mode).toBe('propose')
    expect(res.schools).toHaveLength(14)
    expect(res.proposalHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('the preview states every school’s status, including the ones it will skip', async () => {
    const seeds: Seed[] = [
      { id: uuid(1), name: 'Has it', standards: [[CATALOG, 2, 0]] },
      { id: uuid(2), name: 'No clone' },
      { id: uuid(3), name: 'Locked', licensed: false, standards: [[CATALOG, 1, 0]] },
      {
        id: uuid(4),
        name: 'Already',
        standards: [[CATALOG, 2, 0]],
        adopted: [cloneId(uuid(4), CATALOG)],
      },
    ]
    const { service } = makeStack(seeds)
    const res = await service.bulkAdopt(
      USER,
      ORG,
      dto({ schoolIds: seeds.map((s) => s.id) }),
    )
    const byId = Object.fromEntries(res.schools.map((s) => [s.schoolId, s.status]))
    expect(byId[uuid(1)]).toBe('will_create')
    expect(byId[uuid(2)]).toBe('no_standard')
    expect(byId[uuid(3)]).toBe('not_licensed')
    expect(byId[uuid(4)]).toBe('already_adopted')
    expect(res.willCreateCount).toBe(1)
  })
})

// ── BA-2 ─────────────────────────────────────────────────────────────────────
describe('BA-2 — exactly ONE audit row per school, never one summary row', () => {
  // RED PROOF (run): replacing the per-school loop with a single org-level
  // `audit.write` makes `writes.length` 1 and both assertions go red.
  it('14 schools, 5 of them reused → 14 audit rows', async () => {
    const seeds = fourteen()
    const ids = seeds.map((s) => s.id)
    const { service, audits } = makeStack(seeds)
    await service.bulkAdopt(
      USER,
      ORG,
      dto({ mode: 'confirm', schoolIds: ids, proposalHash: hashFor([...ids].sort()) }),
    )
    const rows = audits.filter((a) => a.action === 'improvement.bulk_adopt.applied')
    expect(rows).toHaveLength(14)
    expect(rows.length).not.toBe(1)
    // Every row is attributed to ONE school — "pushed to 14 schools" is not an
    // auditable fact at any one of them.
    expect(new Set(rows.map((r) => r.schoolId)).size).toBe(14)
    for (const r of rows) expect(r.schoolId).toBeTruthy()
    // No org-level summary row alongside them.
    expect(audits.filter((a) => !a.schoolId)).toHaveLength(0)
  })

  it('a REUSED school still gets its row — being targeted is itself the record', async () => {
    const seeds = fourteen()
    const reusedId = seeds[0].id
    const ids = seeds.map((s) => s.id)
    const { service, audits } = makeStack(seeds)
    const res = await service.bulkAdopt(
      USER,
      ORG,
      dto({ mode: 'confirm', schoolIds: ids, proposalHash: hashFor([...ids].sort()) }),
    )
    expect(res.reusedCount).toBe(5)
    expect(res.createdCount).toBe(9)
    expect(audits.some((a) => a.schoolId === reusedId)).toBe(true)
  })

  it('a SKIPPED school gets NO audit row', async () => {
    const seeds: Seed[] = [
      { id: uuid(1), name: 'Has it', standards: [[CATALOG, 2, 0]] },
      { id: uuid(2), name: 'No clone' },
    ]
    const ids = seeds.map((s) => s.id)
    const { service, audits } = makeStack(seeds)
    await service.bulkAdopt(
      USER,
      ORG,
      dto({ mode: 'confirm', schoolIds: ids, proposalHash: hashFor([...ids].sort()) }),
    )
    expect(audits.map((a) => a.schoolId)).toEqual([uuid(1)])
  })
})

// ── BA-3 ─────────────────────────────────────────────────────────────────────
describe('BA-3 — a changed school list between propose and confirm is 409 PROPOSAL_STALE', () => {
  // RED PROOF (run): dropping the `dto.proposalHash !== proposalHash` comparison
  // lets the second call through and this goes red.
  it('confirming with a hash from a DIFFERENT list is refused, and nothing is written', async () => {
    const seeds = fourteen()
    const ids = seeds.map((s) => s.id)
    const { service, writes } = makeStack(seeds)
    const stale = hashFor([...ids].sort().slice(0, 10))
    await expect(
      service.bulkAdopt(USER, ORG, dto({ mode: 'confirm', schoolIds: ids, proposalHash: stale })),
    ).rejects.toMatchObject({ response: { code: 'PROPOSAL_STALE' } })
    expect(writes).toEqual([])
  })

  it('reordering the SAME set is the same proposal', async () => {
    // Confirming the same SET in a different order is the same proposal; confirming
    // a different SET is not, and that is exactly what PROPOSAL_STALE catches.
    const seeds = fourteen()
    const ids = seeds.map((s) => s.id)
    const { service } = makeStack(seeds)
    const res = await service.bulkAdopt(
      USER,
      ORG,
      dto({
        mode: 'confirm',
        schoolIds: [...ids].reverse(),
        proposalHash: hashFor([...ids].sort()),
      }),
    )
    expect(res.mode).toBe('confirm')
  })

  it('a changed TITLE also invalidates the proposal', async () => {
    const seeds = fourteen()
    const ids = seeds.map((s) => s.id)
    const { service } = makeStack(seeds)
    await expect(
      service.bulkAdopt(
        USER,
        ORG,
        dto({
          mode: 'confirm',
          schoolIds: ids,
          title: 'Something else entirely',
          proposalHash: hashFor([...ids].sort()),
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'PROPOSAL_STALE' } })
  })
})

// ── BA-4 ─────────────────────────────────────────────────────────────────────
describe('BA-4 — running confirm twice creates no second initiative', () => {
  it('the ADOPT_REUSED path is EXERCISED, not re-implemented', async () => {
    const seeds: Seed[] = [{ id: uuid(1), name: 'A', standards: [[CATALOG, 2, 0]] }]
    const ids = seeds.map((s) => s.id)
    const { service, improvement, adoptCalls } = makeStack(seeds)
    const hash = hashFor([...ids].sort())

    const first = await service.bulkAdopt(
      USER,
      ORG,
      dto({ mode: 'confirm', schoolIds: ids, proposalHash: hash }),
    )
    expect(first.createdCount).toBe(1)

    // Second run: the double now behaves as Phase G does once a row exists.
    improvement.adopt.mockImplementation(async (schoolId: string, d: { originRef: string }) => {
      adoptCalls.push({ schoolId, originRef: d.originRef })
      return { id: 'new-' + schoolId, [ADOPT_REUSED]: true }
    })
    const second = await service.bulkAdopt(
      USER,
      ORG,
      dto({ mode: 'confirm', schoolIds: ids, proposalHash: hash }),
    )
    expect(second.createdCount).toBe(0)
    expect(second.reusedCount).toBe(1)
    // It went through adopt both times — there is no second dedupe in this service.
    expect(adoptCalls).toHaveLength(2)
  })

  it('bulk-adopt never writes an initiative itself', async () => {
    const seeds = fourteen()
    const ids = seeds.map((s) => s.id)
    const { service, prisma } = makeStack(seeds)
    await service.bulkAdopt(
      USER,
      ORG,
      dto({ mode: 'confirm', schoolIds: ids, proposalHash: hashFor([...ids].sort()) }),
    )
    expect(prisma.improvementInitiative.create).not.toHaveBeenCalled()
  })
})

// ── BA-6 ─────────────────────────────────────────────────────────────────────
describe('BA-6 — a CONFIRMED row reports what DID happen, in the past tense', () => {
  // The preview vocabulary and the applied vocabulary are two different sets and
  // the tense is the whole point. `will_create` coming back from a CONFIRM is not
  // cosmetic: the web maps that token to "Will create an initiative" and puts it
  // under the heading "Applied", with the gold PENDING pill rather than the
  // emerald done one. The only reasonable reading of that screen is that the
  // fourteen-school push did not land, and the natural response is to click
  // Confirm again.
  //
  // RED PROOF (run): restore `status: res.value.reused ? 'already_adopted' :
  // 'will_create'` on bulk-adopt.service.ts's applied row — every assertion in
  // the first two tests reddens. That exact revert passed the 20 pre-existing
  // specs in this file, which is why this block exists.
  const PREVIEW_ONLY = ['will_create', 'already_adopted']

  it('a genuine creation comes back "created", never "will_create"', async () => {
    const seeds: Seed[] = [{ id: uuid(1), name: 'St. Agnes', standards: [[CATALOG, 2, 0]] }]
    const ids = seeds.map((s) => s.id)
    const { service } = makeStack(seeds)

    const proposal = await service.bulkAdopt(USER, ORG, dto({ mode: 'propose', schoolIds: ids }))
    // The PREVIEW is future tense, and stays that way.
    expect(proposal.schools.map((s) => s.status)).toEqual(['will_create'])

    const applied = await service.bulkAdopt(
      USER,
      ORG,
      dto({ mode: 'confirm', schoolIds: ids, proposalHash: hashFor([...ids].sort()) }),
    )
    expect(applied.createdCount).toBe(1)
    expect(applied.schools.map((s) => s.status)).toEqual(['created'])
  })

  it('a reuse comes back "reused", and NO confirmed row wears a preview word', async () => {
    const seeds = fourteen()
    const ids = seeds.map((s) => s.id)
    const { service } = makeStack(seeds)
    const applied = await service.bulkAdopt(
      USER,
      ORG,
      dto({ mode: 'confirm', schoolIds: ids, proposalHash: hashFor([...ids].sort()) }),
    )
    expect(applied.schools.filter((s) => s.status === 'created')).toHaveLength(9)
    expect(applied.schools.filter((s) => s.status === 'reused')).toHaveLength(5)
    // The invariant, stated once over the whole payload: after a write, not one
    // row may still be described in the future tense.
    expect(applied.schools.filter((s) => PREVIEW_ONLY.includes(s.status))).toHaveLength(0)
  })

  it('a school where the adopt THREW is not wearing the same word as one that succeeded', async () => {
    // RED PROOF (run): drop the `status: 'failed'` / `failureMessage` keys from
    // the rejected branch — the failed school comes back `will_create`, identical
    // to the succeeded one, and the last three assertions redden.
    const seeds: Seed[] = [
      { id: uuid(1), name: 'St. Agnes', standards: [[CATALOG, 2, 0]] },
      { id: uuid(2), name: 'St. Bede', standards: [[CATALOG, 2, 0]] },
    ]
    const ids = [...seeds.map((s) => s.id)].sort()
    const { service, improvement, adoptCalls } = makeStack(seeds)
    improvement.adopt.mockImplementation(async (schoolId: string, d: { originRef: string }) => {
      adoptCalls.push({ schoolId, originRef: d.originRef })
      if (schoolId === uuid(2)) throw new Error('initiative limit reached at this school')
      return { id: `new-${schoolId}` }
    })

    const applied = confirmed(
      await service.bulkAdopt(
        USER,
        ORG,
        dto({ mode: 'confirm', schoolIds: ids, proposalHash: hashFor(ids) }),
      ),
    )
    const bede = applied.schools.find((s) => s.schoolId === uuid(2))!
    const agnes = applied.schools.find((s) => s.schoolId === uuid(1))!

    expect(agnes.status).toBe('created')
    expect(agnes.applied).toBe(true)
    expect(bede.status).toBe('failed')
    expect(bede.status).not.toBe(agnes.status)
    expect(bede.applied).toBe(false)
    expect(String(bede.failureMessage)).toMatch(/initiative limit reached/)
    // …and the count and the reason both survive to the caller.
    expect(applied.failedCount).toBe(1)
    expect(applied.createdCount).toBe(1)
    expect(applied.failures.map((f) => f.schoolId)).toEqual([uuid(2)])
    // A school whose write threw gets NO audit row — nothing happened there.
    expect(applied.schools.filter((s) => s.applied)).toHaveLength(1)
  })
})

// ── BA-5 ─────────────────────────────────────────────────────────────────────
describe('BA-5 — a viewer at ONE school 403s the whole batch, before the first write', () => {
  // RED PROOF (run): moving the role check inside the fan-out loop leaves the
  // earlier schools written and `writes` non-empty, which this catches.
  it('names the school and writes nothing anywhere', async () => {
    const seeds: Seed[] = [
      { id: uuid(1), name: 'Writable', standards: [[CATALOG, 2, 0]] },
      { id: uuid(2), name: 'Board Only', role: 'viewer', standards: [[CATALOG, 2, 0]] },
      { id: uuid(3), name: 'Also writable', standards: [[CATALOG, 2, 0]] },
    ]
    const ids = seeds.map((s) => s.id)
    const { service, writes } = makeStack(seeds)
    await expect(
      service.bulkAdopt(
        USER,
        ORG,
        dto({ mode: 'confirm', schoolIds: ids, proposalHash: hashFor([...ids].sort()) }),
      ),
    ).rejects.toMatchObject({ response: { code: 'READ_ONLY_AT_SCHOOL', schoolId: uuid(2) } })
    expect(writes).toEqual([])
  })

  it('refuses a school outside the caller’s organization', async () => {
    const seeds: Seed[] = [{ id: uuid(1), name: 'Mine', standards: [[CATALOG, 2, 0]] }]
    const { service, writes } = makeStack(seeds)
    await expect(
      service.bulkAdopt(USER, ORG, dto({ schoolIds: [uuid(1), uuid(9)] })),
    ).rejects.toMatchObject({ response: { code: 'SCHOOL_NOT_IN_ORGANIZATION' } })
    expect(writes).toEqual([])
  })

  it('an accountant MAY push — the write role is owner or accountant', async () => {
    const seeds: Seed[] = [
      { id: uuid(1), name: 'A', role: 'accountant', standards: [[CATALOG, 2, 0]] },
    ]
    const { service } = makeStack(seeds)
    const res = await service.bulkAdopt(USER, ORG, dto({ schoolIds: [uuid(1)] }))
    expect(res.mode).toBe('propose')
  })
})

// ── STD-1..3 ─────────────────────────────────────────────────────────────────
describe('STD-1 — aggregation is by catalogStandardId, never by the clone’s code', () => {
  // School standards are PER-SCHOOL CLONES and `code` is free text on the clone. It
  // drifts the moment one school edits it, so grouping on it is grouping on a
  // coincidence.
  //
  // RED PROOF (run): grouping by `code` instead of `catalogStandardId` splits this
  // into two priority rows and the length assertion goes red.
  it('two schools whose clone codes were edited to differ still make ONE priority row', async () => {
    const seeds: Seed[] = [
      { id: uuid(1), name: 'A', standards: [[CATALOG, 2, 0]], codes: ['COG-14'] },
      { id: uuid(2), name: 'B', standards: [[CATALOG, 1, 0]], codes: ['Standard 14 (rev 2)'] },
    ]
    const { portfolio } = makeStack(seeds)
    const res = await portfolio.getInterventionPriorities(USER, ORG, {})
    expect(res.priorities).toHaveLength(1)
    expect(res.priorities[0].catalogStandardId).toBe(CATALOG)
    // The CATALOG code is what the headline speaks, not either clone's edited text.
    expect(res.priorities[0].code).toBe('COG-14')
    expect(res.priorities[0].schoolsBelowThreshold).toBe(2)
    expect(res.priorities[0].headline).toBe(
      'COG-14 is below the improvement threshold at 2 of 2 schools.',
    )
  })
})

describe('STD-2 — the denominator counts only schools that adopted THAT framework', () => {
  // RED PROOF (run): using the whole school count as the denominator makes
  // sharePct 33 rather than 50 and this goes red.
  it('a school on another framework is excluded from schoolsInScope', async () => {
    const seeds: Seed[] = [
      { id: uuid(1), name: 'Cognia A', standards: [[CATALOG, 1, 0]] },
      { id: uuid(2), name: 'Cognia B', standards: [[CATALOG, 4, 3]] },
      { id: uuid(3), name: 'MSA only', standards: [[CATALOG_2, 1, 0]] },
    ]
    const { portfolio } = makeStack(seeds)
    const res = await portfolio.getInterventionPriorities(USER, ORG, {})
    const cog = res.priorities.find((p) => p.catalogStandardId === CATALOG)!
    expect(cog.schoolsInScope).toBe(2)
    expect(cog.schoolsBelowThreshold).toBe(1)
    expect(cog.sharePct).toBe(50)
  })

  it('frameworkCode narrows the response to one catalog', async () => {
    const seeds: Seed[] = [
      { id: uuid(1), name: 'Cognia A', standards: [[CATALOG, 1, 0]] },
      { id: uuid(3), name: 'MSA only', standards: [[CATALOG_2, 1, 0]] },
    ]
    const { portfolio } = makeStack(seeds)
    const res = await portfolio.getInterventionPriorities(USER, ORG, {
      frameworkCode: 'msa_cess',
    })
    expect(res.priorities.map((p) => p.catalogStandardId)).toEqual([CATALOG_2])
  })
})

describe('STD-3 — medianRubricScore is null, not 0, when nothing is scored', () => {
  it('an unscored standard reports null', async () => {
    const seeds: Seed[] = [
      { id: uuid(1), name: 'A', standards: [[CATALOG, null, 0]] },
      { id: uuid(2), name: 'B', standards: [[CATALOG, null, 0]] },
    ]
    const { portfolio } = makeStack(seeds)
    const res = await portfolio.getInterventionPriorities(USER, ORG, {})
    expect(res.priorities[0].schoolsScored).toBe(0)
    expect(res.priorities[0].medianRubricScore).toBeNull()
    // …and an unscored standard is not counted as "below threshold" either.
    expect(res.priorities[0].schoolsBelowThreshold).toBe(0)
  })

  it('the evidence gap is counted separately from the score', async () => {
    const seeds: Seed[] = [
      { id: uuid(1), name: 'A', standards: [[CATALOG, 4, 0]] },
      { id: uuid(2), name: 'B', standards: [[CATALOG, 4, 2]] },
    ]
    const { portfolio } = makeStack(seeds)
    const res = await portfolio.getInterventionPriorities(USER, ORG, {})
    expect(res.priorities[0].schoolsWithEvidenceGap).toBe(1)
    expect(res.priorities[0].schoolsBelowThreshold).toBe(0)
  })

  it('the threshold travels as a NUMBER — the API invents no rubric label table', async () => {
    const seeds: Seed[] = [{ id: uuid(1), name: 'A', standards: [[CATALOG, 2, 0]] }]
    const { portfolio } = makeStack(seeds)
    const res = await portfolio.getInterventionPriorities(USER, ORG, {})
    expect(res.thresholdScore).toBe(2)
    expect(JSON.stringify(res)).not.toMatch(/Improving|Initiating|Impacting|Insufficient/)
  })

  it('the viewer lens drops the per-school roster and keeps every count', async () => {
    const seeds: Seed[] = [
      { id: uuid(1), name: 'A', role: 'viewer', standards: [[CATALOG, 1, 0]] },
      { id: uuid(2), name: 'B', role: 'viewer', standards: [[CATALOG, 2, 0]] },
    ]
    const { portfolio } = makeStack(seeds)
    const res = (await portfolio.getInterventionPriorities(USER, ORG, {})) as {
      lens: string
      priorities: Record<string, unknown>[]
    }
    expect(res.lens).toBe('viewer')
    expect('schools' in res.priorities[0]).toBe(false)
    expect(res.priorities[0].schoolsBelowThreshold).toBe(2)
  })
})

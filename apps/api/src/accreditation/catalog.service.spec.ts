import { describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { AccreditationCatalogService } from './catalog.service.js'
import { FRAMEWORK_SEEDS } from './catalog-seed.js'
import { FRAMEWORK_REQUIREMENT_SEEDS } from './catalog-requirements-seed.js'

// ─────────────────────────────────────────────────────────────────────────────
// AccreditationCatalogService — SEED IDEMPOTENCY + ADOPTION. Prisma is an
// in-memory store honoring upsert semantics (no DB, no Nest boot), so a second
// seed run provably creates nothing and re-adoption provably skips everything.
// ─────────────────────────────────────────────────────────────────────────────

interface FwRow {
  id: string
  code: string
  active: boolean
  [k: string]: unknown
}
interface CatRow {
  id: string
  frameworkId: string
  code: string
  parentId: string | null
  orderIndex: number
  isAssurance: boolean
  title: string
  description: string | null
  [k: string]: unknown
}
interface StdRow {
  id: string
  schoolId: string
  catalogStandardId: string | null
  parentId: string | null
  [k: string]: unknown
}
interface ReqRow {
  id: string
  catalogStandardId: string
  tag: string
  label: string
  windowKind: string
  windowMonths: number | null
  dataAvailability: string
  sourceRegister: string | null
  notTrackedReason: string | null
  orderIndex: number
  [k: string]: unknown
}

function makeStore() {
  let seq = 0
  const uid = (p: string) => `${p}-${++seq}`
  const frameworks = new Map<string, FwRow>() // by code
  const catalog = new Map<string, CatRow>() // by `${frameworkId}:${code}`
  const schoolStandards: StdRow[] = []

  const accreditationFramework = {
    upsert: vi.fn(async ({ where, create, update }: never) => {
      const w = where as { code: string }
      const existing = frameworks.get(w.code)
      if (existing) {
        Object.assign(existing, update)
        return existing
      }
      const row: FwRow = { id: uid('fw'), active: true, ...(create as object) } as FwRow
      frameworks.set(w.code, row)
      return row
    }),
    findFirst: vi.fn(async ({ where }: never) => {
      const w = where as { code?: string; id?: string; active?: boolean }
      for (const f of frameworks.values()) {
        if (w.code && f.code !== w.code) continue
        if (w.id && f.id !== w.id) continue
        if (w.active !== undefined && f.active !== w.active) continue
        return { ...f, standards: catalogOf(f.id) }
      }
      return null
    }),
    findMany: vi.fn(async () => [...frameworks.values()]),
  }

  function catalogOf(frameworkId: string): CatRow[] {
    return [...catalog.values()].filter((c) => c.frameworkId === frameworkId)
  }

  const accreditationCatalogStandard = {
    upsert: vi.fn(async ({ where, create, update }: never) => {
      const w = (where as { frameworkId_code: { frameworkId: string; code: string } })
        .frameworkId_code
      const key = `${w.frameworkId}:${w.code}`
      const existing = catalog.get(key)
      if (existing) {
        Object.assign(existing, update)
        return existing
      }
      const row: CatRow = {
        id: uid('cat'),
        parentId: null,
        ...(create as object),
      } as CatRow
      catalog.set(key, row)
      return row
    }),
    findMany: vi.fn(async ({ where }: never) => {
      const w = where as { frameworkId: string }
      return catalogOf(w.frameworkId)
    }),
    update: vi.fn(async ({ where, data }: never) => {
      const w = where as { id: string }
      const row = [...catalog.values()].find((c) => c.id === w.id)
      if (row) Object.assign(row, data as object)
      return row
    }),
  }

  // ── AIC Phase C — the requirement rows (pass 3). Same in-memory upsert
  // semantics as the catalog nodes, plus a deleteMany that honours the orphan
  // sweep's `notIn`, so the self-heal AND the retirement path are both provable.
  const requirements = new Map<string, ReqRow>() // by `${catalogStandardId}:${tag}`
  const accreditationCatalogRequirement = {
    upsert: vi.fn(async ({ where, create, update }: never) => {
      const w = (where as { catalogStandardId_tag: { catalogStandardId: string; tag: string } })
        .catalogStandardId_tag
      const key = `${w.catalogStandardId}:${w.tag}`
      const existing = requirements.get(key)
      if (existing) {
        Object.assign(existing, update)
        return existing
      }
      const row: ReqRow = { id: uid('req'), ...(create as object) } as ReqRow
      requirements.set(key, row)
      return row
    }),
    deleteMany: vi.fn(async ({ where }: never) => {
      const w = where as { catalogStandardId: { in: string[] }; id?: { notIn: string[] } }
      const scope = new Set(w.catalogStandardId.in)
      const keep = w.id ? new Set(w.id.notIn) : null
      let count = 0
      for (const [k, r] of [...requirements.entries()]) {
        if (!scope.has(r.catalogStandardId)) continue
        if (keep && keep.has(r.id)) continue
        requirements.delete(k)
        count += 1
      }
      return { count }
    }),
    findMany: vi.fn(async () => [...requirements.values()]),
  }

  const accreditationStandard = {
    findMany: vi.fn(async ({ where }: never) => {
      const w = where as { schoolId: string; catalogStandardId?: { in: string[] } }
      return schoolStandards.filter(
        (s) =>
          s.schoolId === w.schoolId &&
          (!w.catalogStandardId || w.catalogStandardId.in.includes(s.catalogStandardId ?? '')),
      )
    }),
    create: vi.fn(async ({ data }: never) => {
      const row: StdRow = { id: uid('std'), ...(data as object) } as StdRow
      schoolStandards.push(row)
      return row
    }),
    groupBy: vi.fn(async () => []),
  }

  const prisma = {
    accreditationFramework,
    accreditationCatalogStandard,
    accreditationCatalogRequirement,
    accreditationStandard,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      // $executeRaw stubs the pg_advisory_xact_lock adopt serialization no-op.
      fn({ accreditationStandard, $executeRaw: vi.fn(async () => 0) }),
    ),
  }
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new AccreditationCatalogService(prisma as never, audit as never)
  return { svc, prisma, audit, frameworks, catalog, schoolStandards, requirements }
}

const COGNIA = FRAMEWORK_SEEDS.find((f) => f.code === 'cognia_2022')!

describe('AccreditationCatalogService — seed (idempotent)', () => {
  it('first run seeds 3 frameworks + full catalog trees with wired parents', async () => {
    const { svc, frameworks, catalog } = makeStore()
    await svc.seedCatalog()
    expect([...frameworks.keys()].sort()).toEqual(['cognia_2022', 'msa_cess_2022', 'nsbecs'])

    const cogId = frameworks.get('cognia_2022')!.id
    const cognia = [...catalog.values()].filter((c) => c.frameworkId === cogId)
    // 5 domains + 31 standards + 6 assurances.
    expect(cognia).toHaveLength(42)
    const byCode = new Map(cognia.map((c) => [c.code, c]))
    expect(byCode.get('COG-1')!.parentId).toBe(byCode.get('COG-KC1')!.id)
    expect(byCode.get('COG-31')!.parentId).toBe(byCode.get('COG-KC4')!.id)
    expect(byCode.get('COG-A2')!.parentId).toBe(byCode.get('COG-ASR')!.id)
    expect(byCode.get('COG-A2')!.isAssurance).toBe(true)
    expect(byCode.get('COG-8')!.isAssurance).toBe(false)
    // orderIndex = seed-array position.
    expect(byCode.get('COG-KC1')!.orderIndex).toBe(0)

    // MSA: 5 root leaves; NSBECS: 4 domains + 13 leaves.
    const msaId = frameworks.get('msa_cess_2022')!.id
    const msa = [...catalog.values()].filter((c) => c.frameworkId === msaId)
    expect(msa).toHaveLength(5)
    expect(msa.every((c) => c.parentId === null)).toBe(true)
    const nsbecsId = frameworks.get('nsbecs')!.id
    expect([...catalog.values()].filter((c) => c.frameworkId === nsbecsId)).toHaveLength(17)
  })

  it('second run is a no-op (0 new rows, updates self-heal in place)', async () => {
    const { svc, frameworks, catalog, prisma } = makeStore()
    await svc.seedCatalog()
    const fwCount = frameworks.size
    const catCount = catalog.size
    const ids = new Set([...catalog.values()].map((c) => c.id))
    prisma.accreditationStandard.create.mockClear()

    await svc.seedCatalog()
    expect(frameworks.size).toBe(fwCount)
    expect(catalog.size).toBe(catCount)
    // Same physical rows (ids stable) — an upsert hit, never a duplicate insert.
    for (const c of catalog.values()) expect(ids.has(c.id)).toBe(true)
  })

  it('the domain map + signal binding ride on BOTH the create and the update path', async () => {
    // THE SELF-HEAL ASSERTION (F17). Production catalog rows already exist; the
    // Phase-B columns reach them ONLY because the update path carries the same
    // nodeData the create path does. If domainKey ever appears on `create`
    // alone, every existing production row keeps a NULL domain forever, the
    // domain grid is silently empty in prod and green in dev, and no migration
    // exists to notice.
    const { svc, prisma, catalog } = makeStore()
    await svc.seedCatalog()
    const calls = prisma.accreditationCatalogStandard.upsert.mock.calls as unknown as [
      { create: Record<string, unknown>; update: Record<string, unknown> },
    ][]
    for (const [args] of calls) {
      for (const shape of [args.create, args.update]) {
        expect(shape.domainKey).toBeTruthy()
        expect(shape).toHaveProperty('domainWeights')
        expect(Array.isArray(shape.signalKeys)).toBe(true)
      }
    }
    // Landed on the rows themselves, split and signals included.
    const byCode = new Map([...catalog.values()].map((c) => [c.code, c]))
    expect(byCode.get('COG-15')!.domainKey).toBe('finance')
    expect(byCode.get('COG-15')!.signalKeys).toHaveLength(7)
    expect(byCode.get('MSA-4')!.domainWeights).toEqual({ finance: 0.5, facilities: 0.25, hr: 0.25 })
    expect(byCode.get('NSBECS-12')!.domainKey).toBe('facilities')

    // A SECOND run still creates nothing — the self-heal is an update, not an
    // insert (the existing idempotency guarantee, re-asserted with the new
    // columns in play).
    const catCount = catalog.size
    const ids = new Set([...catalog.values()].map((c) => c.id))
    await svc.seedCatalog()
    expect(catalog.size).toBe(catCount)
    for (const c of catalog.values()) expect(ids.has(c.id)).toBe(true)
  })

  // ── AIC Phase C — pass 3 ────────────────────────────────────────────────────

  it('pass 3 seeds all 45 requirement rows, on BOTH the create and the update path', async () => {
    // THE SELF-HEAL ASSERTION, repeated for Phase C. Production catalog rows
    // already exist; requirement rows reach them ONLY because the update path
    // carries the same reqData the create path does. If a field ever appears on
    // `create` alone, an existing production node keeps a stale requirement
    // forever and no migration exists to notice.
    const { svc, prisma, requirements } = makeStore()
    await svc.seedCatalog()
    expect(requirements.size).toBe(45)

    const calls = prisma.accreditationCatalogRequirement.upsert.mock.calls as unknown as [
      { create: Record<string, unknown>; update: Record<string, unknown> },
    ][]
    expect(calls).toHaveLength(45)
    for (const [args] of calls) {
      for (const shape of [args.create, args.update]) {
        expect(typeof shape.label).toBe('string')
        expect(shape).toHaveProperty('windowMonths')
        expect(shape).toHaveProperty('windowKind')
        expect(shape).toHaveProperty('dataAvailability')
        expect(shape).toHaveProperty('sourceRegister')
        expect(shape).toHaveProperty('notTrackedReason')
        expect(typeof shape.orderIndex).toBe('number')
      }
    }

    const rows = [...requirements.values()]
    const audit = rows.find((r) => r.tag === 'financial_audit' && r.windowMonths === 18)!
    expect(audit.dataAvailability).toBe('platform')
    expect(audit.windowKind).toBe('fixed')
    // AIC Phase F flipped this row to 'platform' (the register exists now) and it
    // KEEPS its notTrackedReason, because staff_evaluation_register is module-gated:
    // a school with no rows still renders `not_tracked` with this sentence, so the
    // seeded reason is still load-bearing. Changing the seed IS the migration for
    // platform reference data — pass 3 upserts every row on every boot — so this
    // assertion is what proves the flip actually reaches a database.
    const evaluations = rows.find((r) => r.tag === 'staff_evaluation')!
    expect(evaluations.dataAvailability).toBe('platform')
    expect(evaluations.sourceRegister).toBe('staff_evaluation_register')
    expect(evaluations.notTrackedReason).toContain('staff-evaluation register')
  })

  it('a second seed run is zero creates and zero deletes', async () => {
    const { svc, prisma, requirements } = makeStore()
    await svc.seedCatalog()
    const ids = new Set([...requirements.values()].map((r) => r.id))
    prisma.accreditationCatalogRequirement.deleteMany.mockClear()

    await svc.seedCatalog()
    expect(requirements.size).toBe(45)
    // Same physical rows — an upsert hit, never a duplicate insert.
    for (const r of requirements.values()) expect(ids.has(r.id)).toBe(true)
    for (const res of prisma.accreditationCatalogRequirement.deleteMany.mock.results) {
      expect((res.value as unknown as Promise<{ count: number }>) instanceof Promise).toBe(true)
    }
    const deleted = await Promise.all(
      prisma.accreditationCatalogRequirement.deleteMany.mock.results.map((r) => r.value),
    )
    expect((deleted as { count: number }[]).reduce((a, b) => a + b.count, 0)).toBe(0)
  })

  it('a requirement removed from the seed is SWEPT — and only from its own framework', async () => {
    // A retired ask must disappear, or it would haunt every school's Evidence
    // Index forever with no way to clear it. The sweep is framework-scoped, so
    // retiring a Cognia row must not touch MSA's or NSBECS's.
    const { svc, requirements } = makeStore()
    await svc.seedCatalog()
    const before = requirements.size
    const others = [...requirements.values()].filter((r) => r.tag !== 'accreditor_training').length

    const seeds = FRAMEWORK_REQUIREMENT_SEEDS.cognia_2022
    const removed = seeds.pop()!
    try {
      await svc.seedCatalog()
      expect(requirements.size).toBe(before - 1)
      expect([...requirements.values()].some((r) => r.tag === 'accreditor_training')).toBe(false)
      expect(requirements.size).toBe(others)
    } finally {
      seeds.push(removed)
    }
  })

  it('a standardCode with no catalog node is skipped fail-soft; boot still completes', async () => {
    const { svc, requirements } = makeStore()
    const seeds = FRAMEWORK_REQUIREMENT_SEEDS.cognia_2022
    seeds.push({
      standardCode: 'COG-DOES-NOT-EXIST',
      tag: 'survey',
      label: 'Ghost',
      windowKind: 'fixed',
      windowMonths: 12,
      dataAvailability: 'platform',
      sourceRegister: 'knowledge_document',
    })
    try {
      await expect(svc.seedCatalog()).resolves.toBeUndefined()
      expect(requirements.size).toBe(45) // the ghost row is simply not written
    } finally {
      seeds.pop()
    }
  })

  it('onModuleInit is FAIL-SOFT: a seed crash logs a warning, never throws', async () => {
    const { svc, prisma } = makeStore()
    prisma.accreditationFramework.upsert.mockRejectedValue(new Error('db down'))
    await expect(svc.onModuleInit()).resolves.toBeUndefined()
  })
})

describe('AccreditationCatalogService — adoption', () => {
  it('adopt cognia_2022 copies the whole tree (42 rows), remaps parents, preserves order', async () => {
    const { svc, schoolStandards, audit } = makeStore()
    await svc.seedCatalog()
    const res = await svc.adoptFramework('school-A', 'cognia_2022', 'user-1')
    expect(res.created).toBe(42)
    expect(res.skipped).toBe(0)

    const byCode = new Map(schoolStandards.map((s) => [s.code as string, s]))
    // Leaf parentId points at the SCHOOL domain row (not the catalog id).
    const cog8 = byCode.get('COG-8')!
    const domain = byCode.get('COG-KC2')!
    expect(cog8.parentId).toBe(domain.id)
    // category = the domain's title; sortOrder preserved; back-links set.
    expect(cog8.category).toBe('Leadership for Learning')
    expect(typeof cog8.sortOrder).toBe('number')
    expect(cog8.frameworkId).toBeTruthy()
    expect(cog8.catalogStandardId).toBeTruthy()
    expect(cog8.rating).toBe('not_started')
    expect(cog8.rubricScore).toBeNull()
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'accreditation.framework.adopted', schoolId: 'school-A' }),
    )
  })

  it('re-adopt is idempotent: created 0, skipped 42, no dupes', async () => {
    const { svc, schoolStandards } = makeStore()
    await svc.seedCatalog()
    await svc.adoptFramework('school-A', 'cognia_2022', 'user-1')
    const res = await svc.adoptFramework('school-A', 'cognia_2022', 'user-1')
    expect(res).toEqual(expect.objectContaining({ created: 0, skipped: 42 }))
    expect(schoolStandards).toHaveLength(42)
  })

  it('a SECOND school adopts independently (tenant-scoped skip check)', async () => {
    const { svc, schoolStandards } = makeStore()
    await svc.seedCatalog()
    await svc.adoptFramework('school-A', 'msa_cess_2022', 'user-1')
    const res = await svc.adoptFramework('school-B', 'msa_cess_2022', 'user-1')
    expect(res.created).toBe(5)
    expect(schoolStandards.filter((s) => s.schoolId === 'school-B')).toHaveLength(5)
  })

  it('unknown code → NotFoundException, nothing created', async () => {
    const { svc, schoolStandards } = makeStore()
    await svc.seedCatalog()
    await expect(svc.adoptFramework('school-A', 'nope', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(schoolStandards).toHaveLength(0)
  })
})

describe('catalog seed data — frozen shape', () => {
  it('Cognia: 31 non-assurance leaves, 6 assurance leaves, 5 domains, bands + 280 target', () => {
    const domains = new Set(
      COGNIA.standards.filter((s) => !s.parentCode).map((s) => s.code),
    )
    const leaves = COGNIA.standards.filter((s) => s.parentCode)
    expect(domains.size).toBe(5)
    expect(leaves.filter((s) => !s.isAssurance)).toHaveLength(31)
    expect(leaves.filter((s) => s.isAssurance)).toHaveLength(6)
    expect(COGNIA.defaultTarget).toBe(280)
    expect(COGNIA.rubricLabels).toEqual(['Insufficient', 'Initiating', 'Improving', 'Impacting'])
    expect(COGNIA.statusBands.map((b) => b.min)).toEqual([240, 280, 320, 360])
  })

  it('every parentCode resolves within its framework (no dangling domains)', () => {
    for (const fw of FRAMEWORK_SEEDS) {
      const codes = new Set(fw.standards.map((s) => s.code))
      for (const s of fw.standards) {
        if (s.parentCode) expect(codes.has(s.parentCode)).toBe(true)
      }
    }
  })
})

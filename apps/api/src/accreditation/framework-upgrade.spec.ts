import { describe, expect, it, vi } from 'vitest'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { AccreditationCatalogService } from './catalog.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// WS2 — THE UPGRADE TRANSACTION, held to the §5.4 corruption checklist.
//
// The upgrade is a single-transaction RE-POINT of a school's existing rows onto
// the successor framework. Row ids are load-bearing (evidence FKs, findings
// `standard:<id>` scope keys, initiative originRefs, the parent/child
// hierarchy), so the checklist is absolute: no score, rating, provenance stamp,
// evidence row or hierarchy link may change; edited text is respected; new
// standards arrive UNSCORED. Prisma is an in-memory store rich enough to prove
// each clause; every write goes through the one $transaction.
// ─────────────────────────────────────────────────────────────────────────────

interface Row {
  id: string
  [k: string]: unknown
}

function makeStore() {
  let seq = 0
  const uid = (p: string) => `${p}-${++seq}`
  const frameworks = new Map<string, Row>() // by code
  const catalog = new Map<string, Row>() // by `${frameworkId}:${code}`
  const standards: Row[] = []
  const evidence: Row[] = []
  const profiles: Row[] = []

  const catalogOf = (frameworkId: string) =>
    [...catalog.values()].filter((c) => c.frameworkId === frameworkId)

  const accreditationFramework = {
    upsert: vi.fn(async ({ where, create, update }: never) => {
      const w = where as { code: string }
      const existing = frameworks.get(w.code)
      if (existing) {
        Object.assign(existing, update)
        return existing
      }
      const row: Row = { id: uid('fw'), active: true, ...(create as object) }
      frameworks.set(w.code, row)
      return row
    }),
    findFirst: vi.fn(async ({ where, include }: never) => {
      const w = where as { code?: string; id?: string; active?: boolean }
      for (const f of frameworks.values()) {
        if (w.code && f.code !== w.code) continue
        if (w.id && f.id !== w.id) continue
        if (w.active !== undefined && f.active !== w.active) continue
        return (include as { standards?: boolean } | undefined)?.standards
          ? { ...f, standards: catalogOf(f.id as string) }
          : { ...f }
      }
      return null
    }),
    findMany: vi.fn(async () => [...frameworks.values()]),
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
      const row: Row = { id: uid('cat'), parentId: null, ...(create as object) }
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

  function matchStd(s: Row, w: Record<string, unknown>): boolean {
    if (w.schoolId && s.schoolId !== w.schoolId) return false
    if (w.frameworkId !== undefined) {
      if (typeof w.frameworkId === 'string' && s.frameworkId !== w.frameworkId) return false
      const fwIn = (w.frameworkId as { not?: null; in?: string[] } | null) ?? null
      if (fwIn && fwIn.not === null && s.frameworkId == null) return false
      if (fwIn && fwIn.in && !fwIn.in.includes(s.frameworkId as string)) return false
    }
    if (w.catalogStandardId !== undefined) {
      const c = w.catalogStandardId as { in?: string[] }
      if (c.in && !c.in.includes((s.catalogStandardId as string) ?? '')) return false
    }
    return true
  }

  const accreditationStandard = {
    findMany: vi.fn(async ({ where }: never) =>
      standards.filter((s) => matchStd(s, where as Record<string, unknown>)),
    ),
    count: vi.fn(async ({ where }: never) =>
      standards.filter((s) => matchStd(s, where as Record<string, unknown>)).length,
    ),
    create: vi.fn(async ({ data }: never) => {
      const row: Row = { id: uid('std'), ...(data as object) }
      standards.push(row)
      return row
    }),
    update: vi.fn(async ({ where, data }: never) => {
      const w = where as { id: string }
      const row = standards.find((s) => s.id === w.id)
      if (row) Object.assign(row, data as object)
      return row
    }),
    deleteMany: vi.fn(async ({ where }: never) => {
      const w = where as { id: { in: string[] } }
      const del = new Set(w.id.in)
      let count = 0
      for (let i = standards.length - 1; i >= 0; i -= 1) {
        if (del.has(standards[i].id)) {
          standards.splice(i, 1)
          count += 1
        }
      }
      return { count }
    }),
    groupBy: vi.fn(async () => []),
  }

  const accreditationEvidence = {
    count: vi.fn(async ({ where }: never) => {
      const w = where as { schoolId: string; standardId: { in: string[] } }
      return evidence.filter(
        (e) => e.schoolId === w.schoolId && w.standardId.in.includes(e.standardId as string),
      ).length
    }),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  }

  const accreditationFrameworkProfile = {
    findFirst: vi.fn(async ({ where }: never) => {
      const w = where as { schoolId: string; frameworkId: string }
      return (
        profiles.find((p) => p.schoolId === w.schoolId && p.frameworkId === w.frameworkId) ?? null
      )
    }),
    findMany: vi.fn(async ({ where }: never) => {
      const w = where as { schoolId: string }
      return profiles.filter((p) => p.schoolId === w.schoolId)
    }),
    upsert: vi.fn(async ({ where, create, update }: never) => {
      const w = (where as { schoolId_frameworkId: { schoolId: string; frameworkId: string } })
        .schoolId_frameworkId
      const existing = profiles.find(
        (p) => p.schoolId === w.schoolId && p.frameworkId === w.frameworkId,
      )
      if (existing) {
        Object.assign(existing, update)
        return existing
      }
      const row: Row = { id: uid('prof'), ...(create as object) }
      profiles.push(row)
      return row
    }),
    delete: vi.fn(async ({ where }: never) => {
      const w = where as { id: string }
      const i = profiles.findIndex((p) => p.id === w.id)
      const [row] = i >= 0 ? profiles.splice(i, 1) : [null]
      return row
    }),
    deleteMany: vi.fn(async ({ where }: never) => {
      const w = where as { schoolId: string; frameworkId: string }
      let count = 0
      for (let i = profiles.length - 1; i >= 0; i -= 1) {
        if (profiles[i].schoolId === w.schoolId && profiles[i].frameworkId === w.frameworkId) {
          profiles.splice(i, 1)
          count += 1
        }
      }
      return { count }
    }),
  }

  const improvementInitiative = { count: vi.fn(async () => 0) }

  const tx = {
    // The in-lock R12 re-check (A5) reads the framework catalog through the tx.
    accreditationFramework,
    accreditationStandard,
    accreditationEvidence,
    accreditationFrameworkProfile,
    $executeRaw: vi.fn(async () => 0),
  }
  // ── ROLLBACK SEMANTICS (A9a). A real $transaction that throws leaves ZERO
  // partial state; the mock must be able to express that or the atomicity test
  // proves nothing. Every store row is snapshotted (shallow-copied) before the
  // callback and restored in place when it throws — mid-callback mutations via
  // Object.assign included, because the restore rewrites field values, not just
  // array membership.
  const snapshotState = () => ({
    frameworks: [...frameworks.entries()].map(([k, v]) => [k, { ...v }] as const),
    catalog: [...catalog.entries()].map(([k, v]) => [k, { ...v }] as const),
    standards: standards.map((r) => ({ ...r })),
    evidence: evidence.map((r) => ({ ...r })),
    profiles: profiles.map((r) => ({ ...r })),
  })
  const restoreState = (s: ReturnType<typeof snapshotState>) => {
    frameworks.clear()
    for (const [k, v] of s.frameworks) frameworks.set(k, v)
    catalog.clear()
    for (const [k, v] of s.catalog) catalog.set(k, v)
    standards.splice(0, standards.length, ...s.standards)
    evidence.splice(0, evidence.length, ...s.evidence)
    profiles.splice(0, profiles.length, ...s.profiles)
  }
  const prisma = {
    accreditationFramework,
    accreditationCatalogStandard,
    accreditationStandard,
    accreditationEvidence,
    accreditationFrameworkProfile,
    improvementInitiative,
    accreditationCatalogRequirement: {
      upsert: vi.fn(async ({ create }: never) => ({ id: uid('req'), ...(create as object) })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => {
      const before = snapshotState()
      try {
        return await fn(tx)
      } catch (err) {
        restoreState(before)
        throw err
      }
    }),
  }
  const audit = { write: vi.fn(async () => undefined) }
  const snapshot = { captureOnEvent: vi.fn() }
  const svc = new AccreditationCatalogService(prisma as never, audit as never, snapshot as never)
  return { svc, prisma, tx, audit, snapshot, frameworks, catalog, standards, evidence, profiles }
}

/** The advisory-lock calls a run made: [schoolId, frameworkId] per lock, in call
 *  order. $executeRaw is invoked as a tagged template, so each mock call is
 *  (TemplateStringsArray, ...interpolated values). */
function lockCalls(tx: { $executeRaw: { mock: { calls: unknown[][] } } }): string[][] {
  return tx.$executeRaw.mock.calls
    .filter((c) => (c[0] as string[])[0]?.includes('pg_advisory_xact_lock'))
    .map((c) => c.slice(1) as string[])
}

/** Seed catalog + adopt cognia_2022 for one school, then dress the register. */
async function scoredSchool() {
  const store = makeStore()
  await store.svc.seedCatalog()
  // Model the true history: the school adopted cognia_2022 BEFORE the 2025
  // supersession shipped — clear the flag for the adopt, then restore it
  // (schools scored under 2022 are exactly the population the upgrade serves).
  const oldFw = store.frameworks.get('cognia_2022')!
  const savedSupersededBy = oldFw.supersededByCode
  oldFw.supersededByCode = null
  await store.svc.adoptFramework('school-A', 'cognia_2022', 'user-1')
  oldFw.supersededByCode = savedSupersededBy
  const byCode = new Map(store.standards.map((s) => [s.code as string, s]))
  // A scored, rated, provenance-stamped leaf with evidence.
  const cog8 = byCode.get('COG-8')!
  Object.assign(cog8, {
    rubricScore: 3,
    rating: 'met',
    scoreProvenance: 'self',
    rubricScoredAt: new Date('2025-04-01T00:00:00Z'),
    rubricScoredByUserId: 'user-9',
  })
  store.evidence.push({ id: 'ev-1', schoolId: 'school-A', standardId: cog8.id })
  // A school-edited title (must be RESPECTED, never overwritten).
  const cog15 = byCode.get('COG-15')!
  Object.assign(cog15, { title: 'Our own resources wording', rubricScore: 2 })
  // A hand-made row (no catalog link) — must never be touched.
  store.standards.push({
    id: 'hand-1',
    schoolId: 'school-A',
    frameworkId: null,
    catalogStandardId: null,
    parentId: null,
    code: 'LOCAL-1',
    title: 'Our own standard',
    rating: 'not_started',
    rubricScore: null,
  })
  // A division profile on the old framework (must be CARRIED).
  store.profiles.push({
    id: 'prof-old',
    schoolId: 'school-A',
    frameworkId: oldFw.id as string,
    division: 'nca_casi',
    lastReviewDate: new Date('2022-04-12T00:00:00Z'),
    nextReviewDate: null,
    termYears: 6,
    targetIndex: 320,
    upgradedFromFrameworkId: null,
    upgradedAt: null,
  })
  return { ...store, byCode }
}

describe('WS2 — upgrade preflight (read-only)', () => {
  it('counts what would move, what arrives unscored, and what blocks', async () => {
    const store = await scoredSchool()
    // Remove COG-31 to simulate a pre-Std-31 adopter (gap-fill candidate).
    const cog31 = store.byCode.get('COG-31')!
    store.standards.splice(store.standards.indexOf(cog31), 1)

    const impact = await store.svc.upgradeImpact('school-A', 'cognia_2022')
    expect(impact.from.code).toBe('cognia_2022')
    expect(impact.to.code).toBe('cognia_2025')
    expect(impact.from.rubricLabels).toEqual(['Insufficient', 'Initiating', 'Improving', 'Impacting'])
    expect(impact.to.rubricLabels).toEqual(['Insufficient', 'Developing', 'Engaging', 'Demonstrating'])
    expect(impact.standardsToMove).toBe(41) // 42 minus the removed COG-31
    expect(impact.scoredCarried).toBe(2) // COG-8 (3) + COG-15 (2)
    expect(impact.ratedCarried).toBe(1) // COG-8 'met'
    expect(impact.evidenceCarried).toBe(1)
    expect(impact.newStandards).toEqual(['COG-31'])
    expect(impact.editedTitleKept).toBe(1) // COG-15's own wording
    expect(impact.unmappedKept).toEqual([]) // Cognia crosswalk is total
    expect(impact.blockers).toEqual([])
    expect(impact.seriesNote).toContain('explicit break')
    // READ-ONLY: nothing moved.
    expect(store.standards.filter((s) => s.code === 'COG-8')[0].frameworkId).toBe(
      store.frameworks.get('cognia_2022')!.id,
    )
  })

  it('404s when the framework is not superseded', async () => {
    const store = await scoredSchool()
    await expect(store.svc.upgradeImpact('school-A', 'msa_cess_2022')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('names the blocker when the successor is already partially adopted', async () => {
    const store = await scoredSchool()
    await store.svc.adoptFramework('school-A', 'cognia_2025', 'user-1')
    const impact = await store.svc.upgradeImpact('school-A', 'cognia_2022')
    expect(impact.blockers).toEqual(['successor_already_adopted'])
  })
})

describe('WS2 — the upgrade transaction (§5.4 corruption checklist)', () => {
  it('re-points EVERY mapped row in place: same ids, same hierarchy, new framework', async () => {
    const store = await scoredSchool()
    const oldFw = store.frameworks.get('cognia_2022')!
    const newFw = store.frameworks.get('cognia_2025')!
    const before = store.standards
      .filter((s) => s.frameworkId === oldFw.id)
      .map((s) => ({
        id: s.id,
        code: s.code,
        parentId: s.parentId,
        rating: s.rating,
        rubricScore: s.rubricScore,
        scoreProvenance: s.scoreProvenance,
        rubricScoredAt: s.rubricScoredAt,
        rubricScoredByUserId: s.rubricScoredByUserId,
      }))
    const evidenceBefore = store.evidence.map((e) => ({ ...e }))

    const res = await store.svc.upgradeFramework('school-A', 'cognia_2022', 'user-1')
    expect(res).toEqual(
      expect.objectContaining({
        from: 'cognia_2022',
        to: 'cognia_2025',
        moved: 42,
        created: 0,
        keptEditedTitles: 1,
        scoredCarried: 2,
        evidenceCarried: 1,
        alreadyUpgraded: false,
      }),
    )

    const after = new Map(store.standards.map((s) => [s.id, s]))
    for (const b of before) {
      const a = after.get(b.id)!
      // The row EXISTS with the SAME id — nothing was copied or deleted.
      expect(a, b.code as string).toBeTruthy()
      expect(a.frameworkId).toBe(newFw.id)
      // §5.4: no score/rating/provenance value changes; no clock restarts.
      expect(a.rating).toBe(b.rating)
      expect(a.rubricScore).toBe(b.rubricScore)
      expect(a.scoreProvenance).toBe(b.scoreProvenance)
      expect(a.rubricScoredAt).toBe(b.rubricScoredAt)
      expect(a.rubricScoredByUserId).toBe(b.rubricScoredByUserId)
      // Hierarchy holds: school-row ids did not change, so parentId is intact.
      expect(a.parentId).toBe(b.parentId)
      // The catalog pointer now targets the SUCCESSOR's node for the same code.
      if (a.catalogStandardId != null) {
        const node = [...store.catalog.values()].find((c) => c.id === a.catalogStandardId)!
        expect(node.frameworkId).toBe(newFw.id)
        expect(node.code).toBe(b.code)
      }
    }
    // §5.4: no evidence row touched (ids, FKs, everything byte-identical).
    expect(store.evidence).toEqual(evidenceBefore)
    // ONE transaction wrapped it all.
    expect(store.prisma.$transaction).toHaveBeenCalledTimes(2) // adopt + upgrade
    // Snapshot fired once for the upgrade (fire-and-forget, after commit).
    expect(store.snapshot.captureOnEvent).toHaveBeenCalledTimes(2) // adopt + upgrade
  })

  it('untouched titles follow the new catalog; school edits are respected', async () => {
    const store = await scoredSchool()
    await store.svc.upgradeFramework('school-A', 'cognia_2022', 'user-1')
    const byCode = new Map(store.standards.map((s) => [s.code as string, s]))
    // COG-1's title was untouched → follows the 2025 verbatim statement.
    expect(byCode.get('COG-1')!.title).toBe(
      'Leaders cultivate and sustain a culture that demonstrates respect and fairness for all learners and is free from bias.',
    )
    // COG-15 was edited by the school → kept verbatim.
    expect(byCode.get('COG-15')!.title).toBe('Our own resources wording')
  })

  it('the update payload NEVER carries score/rating/provenance/owner keys (re-point ≠ score change)', async () => {
    const store = await scoredSchool()
    store.prisma.accreditationStandard.update.mockClear()
    await store.svc.upgradeFramework('school-A', 'cognia_2022', 'user-1')
    const calls = store.prisma.accreditationStandard.update.mock.calls as unknown as [
      { data: Record<string, unknown> },
    ][]
    expect(calls.length).toBe(42)
    for (const [args] of calls) {
      for (const forbidden of [
        'rating',
        'rubricScore',
        'scoreProvenance',
        'rubricScoredAt',
        'rubricScoredByUserId',
        'reviewDate',
        'owner',
        'ownerUserId',
        'parentId',
        'strategySourceType',
        'strategySourceRef',
        'updatedByUserId',
      ]) {
        expect(args.data, forbidden).not.toHaveProperty(forbidden)
      }
    }
  })

  it('hand-made rows are byte-identical after the upgrade', async () => {
    const store = await scoredSchool()
    const before = { ...store.standards.find((s) => s.id === 'hand-1')! }
    await store.svc.upgradeFramework('school-A', 'cognia_2022', 'user-1')
    expect(store.standards.find((s) => s.id === 'hand-1')).toEqual(before)
  })

  it('gap-fills missing successor codes UNSCORED with rating not_started', async () => {
    const store = await scoredSchool()
    const cog31 = store.byCode.get('COG-31')!
    store.standards.splice(store.standards.indexOf(cog31), 1)

    const res = await store.svc.upgradeFramework('school-A', 'cognia_2022', 'user-1')
    expect(res.moved).toBe(41)
    expect(res.created).toBe(1)
    const created = store.standards.find(
      (s) => s.code === 'COG-31' && s.schoolId === 'school-A',
    )!
    expect(created.rating).toBe('not_started')
    expect(created.rubricScore).toBeNull()
    // Wired under the re-pointed KC4 parent row.
    expect(created.parentId).toBe(store.byCode.get('COG-KC4')!.id)
    // The 2025 verbatim statement, not the 2022 condensed one.
    expect(created.title).toBe(
      'Learners demonstrate growth in their academic performance based on valid and reliable assessments.',
    )
  })

  it('carries the WHOLE profile (division + cycle anchor + target), stamps provenance, deletes the old row', async () => {
    const store = await scoredSchool()
    const oldFw = store.frameworks.get('cognia_2022')!
    const newFw = store.frameworks.get('cognia_2025')!
    await store.svc.upgradeFramework('school-A', 'cognia_2022', 'user-1')

    expect(store.profiles.filter((p) => p.frameworkId === oldFw.id)).toHaveLength(0)
    const carried = store.profiles.find((p) => p.frameworkId === newFw.id)!
    expect(carried.division).toBe('nca_casi')
    expect(carried.termYears).toBe(6)
    expect(carried.targetIndex).toBe(320)
    expect((carried.lastReviewDate as Date).toISOString()).toContain('2022-04-12')
    expect(carried.upgradedFromFrameworkId).toBe(oldFw.id)
    expect(carried.upgradedAt).toBeInstanceOf(Date)
  })

  it('409s (SUCCESSOR_ALREADY_ADOPTED) when the school holds successor rows', async () => {
    const store = await scoredSchool()
    await store.svc.adoptFramework('school-A', 'cognia_2025', 'user-1')
    await expect(
      store.svc.upgradeFramework('school-A', 'cognia_2022', 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('a retry after success is an idempotent alreadyUpgraded no-op', async () => {
    const store = await scoredSchool()
    await store.svc.upgradeFramework('school-A', 'cognia_2022', 'user-1')
    const res = await store.svc.upgradeFramework('school-A', 'cognia_2022', 'user-1')
    expect(res.alreadyUpgraded).toBe(true)
    expect(res.moved).toBe(0)
  })

  it('a school with nothing to upgrade and no recorded upgrade 404s', async () => {
    const store = makeStore()
    await store.svc.seedCatalog()
    await expect(
      store.svc.upgradeFramework('school-B', 'cognia_2022', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('audits accreditation.framework.upgraded exactly once', async () => {
    const store = await scoredSchool()
    await store.svc.upgradeFramework('school-A', 'cognia_2022', 'user-1')
    const upgrades = (store.audit.write.mock.calls as unknown as [{ action?: string }][]).filter(
      ([a]) => a.action === 'accreditation.framework.upgraded',
    )
    expect(upgrades).toHaveLength(1)
  })
})

describe('WS2 R12 — the adopt guard for superseded frameworks', () => {
  it('a NEW adopter of cognia_2022 is 409d (FRAMEWORK_SUPERSEDED) and steered to 2025', async () => {
    const store = makeStore()
    await store.svc.seedCatalog()
    await expect(
      store.svc.adoptFramework('school-new', 'cognia_2022', 'user-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FRAMEWORK_SUPERSEDED', supersededBy: 'cognia_2025' }),
    })
    expect(store.standards).toHaveLength(0)
  })

  it('an EXISTING holder keeps adopt as the idempotent gap-filler', async () => {
    const store = await scoredSchool()
    // Remove one row, re-adopt: gap-fill proceeds despite the supersession.
    const cog31 = store.byCode.get('COG-31')!
    store.standards.splice(store.standards.indexOf(cog31), 1)
    const res = await store.svc.adoptFramework('school-A', 'cognia_2022', 'user-1')
    expect(res.created).toBe(1)
    expect(res.skipped).toBe(41)
  })

  it('adopting the (non-superseded) successor directly stays open', async () => {
    const store = makeStore()
    await store.svc.seedCatalog()
    const res = await store.svc.adoptFramework('school-new', 'cognia_2025', 'user-1')
    expect(res.created).toBe(42)
  })
})

describe('WS1 — removeFramework deletes the profile row with the register', () => {
  it('the school profile for that framework is gone after removal', async () => {
    const store = await scoredSchool()
    const oldFw = store.frameworks.get('cognia_2022')!
    expect(store.profiles.some((p) => p.frameworkId === oldFw.id)).toBe(true)
    await store.svc.removeFramework('school-A', 'cognia_2022', 'user-1')
    expect(store.profiles.some((p) => p.frameworkId === oldFw.id)).toBe(false)
  })

  it('A1 — takes the (school, framework) advisory lock inside the removal transaction', async () => {
    // The upgrade's "serializes against remove" comment is only true if remove
    // takes the SAME lock; without it, an upgrade and a removal of the same
    // register interleave freely and either can corrupt the other's read.
    const store = await scoredSchool()
    const oldFw = store.frameworks.get('cognia_2022')!
    store.tx.$executeRaw.mockClear()
    await store.svc.removeFramework('school-A', 'cognia_2022', 'user-1')
    expect(lockCalls(store.tx)).toEqual([['school-A', oldFw.id]])
  })
})

describe('WS2 A5 — the R12 adopt guard re-checks INSIDE the advisory lock', () => {
  it('the race: the fast path passes on stale rows → lock → the in-tx re-check 409s', async () => {
    const store = await scoredSchool()
    const oldFw = store.frameworks.get('cognia_2022')!
    // A concurrent removal has ALREADY committed: the school holds zero rows…
    store.standards.splice(
      0,
      store.standards.length,
      ...store.standards.filter((s) => s.frameworkId !== oldFw.id),
    )
    // …but the fast-path guard reads a STALE count (the TOCTOU window) and
    // passes as though the school were still a holder. The in-tx re-check,
    // running after the advisory lock, sees the truth and refuses.
    store.prisma.accreditationStandard.count.mockImplementationOnce(async () => 42)
    await expect(
      store.svc.adoptFramework('school-A', 'cognia_2022', 'user-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FRAMEWORK_SUPERSEDED', supersededBy: 'cognia_2025' }),
    })
    // Nothing was created for the would-be new adopter of a superseded framework.
    expect(store.standards.filter((s) => s.frameworkId === oldFw.id)).toHaveLength(0)
  })
})

describe('WS2 A6 — an existing successor profile survives the upgrade carry', () => {
  it('prefers the successor profile’s own values, fills only its nulls from the old profile', async () => {
    const store = await scoredSchool()
    const oldFw = store.frameworks.get('cognia_2022')!
    const newFw = store.frameworks.get('cognia_2025')!
    // Someone already set a cycle + target AGAINST the successor (metadata never
    // implies adoption, so this coexists with zero successor rows).
    store.profiles.push({
      id: 'prof-new',
      schoolId: 'school-A',
      frameworkId: newFw.id as string,
      division: null,
      lastReviewDate: new Date('2025-06-01T00:00:00Z'),
      nextReviewDate: new Date('2031-06-01T00:00:00Z'),
      termYears: 7,
      targetIndex: 340,
      upgradedFromFrameworkId: null,
      upgradedAt: null,
    })
    await store.svc.upgradeFramework('school-A', 'cognia_2022', 'user-1')
    const carried = store.profiles.find((p) => p.frameworkId === newFw.id)!
    // The successor profile's OWN cycle metadata is the newer intent — kept.
    expect((carried.lastReviewDate as Date).toISOString()).toContain('2025-06-01')
    expect((carried.nextReviewDate as Date).toISOString()).toContain('2031-06-01')
    expect(carried.termYears).toBe(7)
    expect(carried.targetIndex).toBe(340)
    // Its null division is filled from the OLD profile (nothing is wiped)…
    expect(carried.division).toBe('nca_casi')
    // …and the provenance stamp is always the upgrade's.
    expect(carried.upgradedFromFrameworkId).toBe(oldFw.id)
    expect(carried.upgradedAt).toBeInstanceOf(Date)
    // One live profile: the predecessor row is gone.
    expect(store.profiles.filter((p) => p.frameworkId === oldFw.id)).toHaveLength(0)
  })
})

describe('WS2 A9 — arch-promised transaction guarantees', () => {
  it('(a) a mid-callback failure leaves ZERO partial state — the transaction rolls back', async () => {
    const store = await scoredSchool()
    const before = JSON.parse(
      JSON.stringify({ standards: store.standards, profiles: store.profiles, evidence: store.evidence }),
    )
    const real = store.prisma.accreditationStandard.update.getMockImplementation()!
    let updates = 0
    store.prisma.accreditationStandard.update.mockImplementation(async (args: never) => {
      updates += 1
      if (updates === 5) throw new Error('boom mid-transaction')
      return real(args)
    })
    try {
      await expect(
        store.svc.upgradeFramework('school-A', 'cognia_2022', 'user-1'),
      ).rejects.toThrow('boom mid-transaction')
    } finally {
      store.prisma.accreditationStandard.update.mockImplementation(real)
    }
    // Four rows WERE re-pointed before the throw; the rollback undid them all.
    expect(
      JSON.parse(
        JSON.stringify({ standards: store.standards, profiles: store.profiles, evidence: store.evidence }),
      ),
    ).toEqual(before)
    // No after-commit side effects either: no upgrade audit, no extra snapshot.
    expect(
      (store.audit.write.mock.calls as unknown as [{ action?: string }][]).filter(
        ([a]) => a.action === 'accreditation.framework.upgraded',
      ),
    ).toHaveLength(0)
    expect(store.snapshot.captureOnEvent).toHaveBeenCalledTimes(1) // the adopt only
  })

  it('(b) takes BOTH advisory locks, (school, from) before (school, to)', async () => {
    const store = await scoredSchool()
    const oldFw = store.frameworks.get('cognia_2022')!
    const newFw = store.frameworks.get('cognia_2025')!
    store.tx.$executeRaw.mockClear()
    await store.svc.upgradeFramework('school-A', 'cognia_2022', 'user-1')
    expect(lockCalls(store.tx)).toEqual([
      ['school-A', oldFw.id],
      ['school-A', newFw.id],
    ])
  })

  it('(c) notes and category FOLLOW the catalog when untouched, are KEPT when edited', async () => {
    const store = await scoredSchool()
    const oldFw = store.frameworks.get('cognia_2022')!
    const newFw = store.frameworks.get('cognia_2025')!
    const catNode = (fwId: unknown, code: string) =>
      [...store.catalog.values()].find((c) => c.frameworkId === fwId && c.code === code)!
    // Dress the catalog: COG-3's guidance changes between editions, and the 2025
    // edition renames the KC1 domain.
    catNode(oldFw.id, 'COG-3').description = 'Old edition guidance.'
    catNode(newFw.id, 'COG-3').description = 'New edition guidance.'
    catNode(newFw.id, 'COG-KC1').title = 'Culture of Learning (rev. 2025)'
    // Row A (COG-3): notes/category exactly as adopt derived them → UNTOUCHED.
    const cog3 = store.byCode.get('COG-3')!
    Object.assign(cog3, { notes: 'Old edition guidance.' })
    // Row B (COG-4): the school wrote its own note and its own grouping → EDITED.
    const cog4 = store.byCode.get('COG-4')!
    Object.assign(cog4, { notes: 'Our own note', category: 'Our own grouping' })

    await store.svc.upgradeFramework('school-A', 'cognia_2022', 'user-1')
    // Untouched text follows the successor catalog…
    expect(cog3.notes).toBe('New edition guidance.')
    expect(cog3.category).toBe('Culture of Learning (rev. 2025)')
    // …school edits are respected verbatim.
    expect(cog4.notes).toBe('Our own note')
    expect(cog4.category).toBe('Our own grouping')
  })
})

describe('n3 — a non-injective crosswalk refuses cleanly, before any write', () => {
  it('409s CROSSWALK_NOT_INJECTIVE naming the colliding codes; nothing moves', async () => {
    const store = await scoredSchool()
    const crosswalks = (
      AccreditationCatalogService as unknown as {
        FRAMEWORK_CROSSWALKS: Record<string, Record<string, string>>
      }
    ).FRAMEWORK_CROSSWALKS
    // A broken future table: two old codes land on ONE successor code.
    crosswalks['cognia_2022->cognia_2025'] = { 'COG-1': 'COG-2' }
    try {
      await expect(
        store.svc.upgradeFramework('school-A', 'cognia_2022', 'user-1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CROSSWALK_NOT_INJECTIVE' }),
      })
      // A clean refusal, not a half-moved register: every row still on 2022.
      const oldFw = store.frameworks.get('cognia_2022')!
      expect(store.standards.filter((s) => s.frameworkId === oldFw.id)).toHaveLength(42)
      expect(store.standards.filter((s) => s.frameworkId === store.frameworks.get('cognia_2025')!.id)).toHaveLength(0)
    } finally {
      delete crosswalks['cognia_2022->cognia_2025']
    }
  })
})

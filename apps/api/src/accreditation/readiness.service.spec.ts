import { describe, expect, it, vi } from 'vitest'
import { AccreditationReadinessService } from './readiness.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AccreditationReadinessService — framework selection (explicit → dominant →
// none), the assurance split, index/band/target math wiring, and framework-less
// / no-index degradation. Prisma hand-mocked (no DB, no Nest boot); the pure
// math itself is covered in @finrep/compliance.
// ─────────────────────────────────────────────────────────────────────────────

const COGNIA = {
  id: 'fw-cognia',
  code: 'cognia_2022',
  name: 'Cognia Performance Standards',
  rubricLabels: ['Insufficient', 'Initiating', 'Improving', 'Impacting'],
  statusBands: [
    { min: 240, label: 'Accredited Needing Improvement' },
    { min: 280, label: 'Accredited' },
    { min: 320, label: 'Accredited with Merit' },
    { min: 360, label: 'Accredited with Distinction' },
  ],
  indexMin: 100,
  indexMax: 400,
  defaultTarget: 280,
}
const MSA = {
  id: 'fw-msa',
  code: 'msa_cess_2022',
  name: 'MSA-CESS Standards',
  rubricLabels: ['Not Evident', 'Emerging', 'Meets Expectations', 'Exceeds Expectations'],
  statusBands: [],
  indexMin: null,
  indexMax: null,
  defaultTarget: null,
}

function stdRow(over: Record<string, unknown> = {}) {
  return {
    id: 's1',
    schoolId: 'school-A',
    parentId: null,
    code: 'COG-1',
    title: 'T',
    rating: 'not_started',
    frameworkId: null,
    catalogStandardId: null,
    rubricScore: null,
    sortOrder: null,
    ...over,
  }
}

function makeService(over: {
  standards?: unknown[]
  groupBy?: unknown[]
  frameworks?: unknown[]
  assuranceCatalog?: unknown[]
}) {
  const frameworks = over.frameworks ?? [COGNIA, MSA]
  const prisma = {
    accreditationStandard: {
      findMany: vi.fn(async () => over.standards ?? []),
    },
    accreditationEvidence: {
      groupBy: vi.fn(async () => over.groupBy ?? []),
    },
    accreditationFramework: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
        (frameworks as { id: string }[]).find((f) => f.id === where.id) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        (frameworks as { id: string }[]).filter((f) => where.id.in.includes(f.id)),
      ),
    },
    accreditationCatalogStandard: {
      findMany: vi.fn(async () => over.assuranceCatalog ?? []),
    },
  }
  const svc = new AccreditationReadinessService(prisma as never)
  return { svc, prisma }
}

describe('AccreditationReadinessService — Cognia (index) mode', () => {
  // 3 scored leaves (3,3,3 w/ evidence) + 1 assurance leaf (evidenced) + 1 domain parent.
  const rows = [
    stdRow({ id: 'dom', code: 'COG-KC1', frameworkId: 'fw-cognia', catalogStandardId: 'c-dom' }),
    stdRow({ id: 'a', code: 'COG-1', parentId: 'dom', frameworkId: 'fw-cognia', catalogStandardId: 'c1', rubricScore: 3 }),
    stdRow({ id: 'b', code: 'COG-2', parentId: 'dom', frameworkId: 'fw-cognia', catalogStandardId: 'c2', rubricScore: 3 }),
    stdRow({ id: 'c', code: 'COG-3', parentId: 'dom', frameworkId: 'fw-cognia', catalogStandardId: 'c3', rubricScore: 3 }),
    stdRow({ id: 'asr', code: 'COG-A2', parentId: 'dom', frameworkId: 'fw-cognia', catalogStandardId: 'cA2', title: 'Audit' }),
  ]
  const groupBy = [
    { standardId: 'a', _count: { _all: 1 } },
    { standardId: 'b', _count: { _all: 1 } },
    { standardId: 'c', _count: { _all: 1 } },
  ]
  const assuranceCatalog = [{ id: 'cA2' }]

  it('splits assurances out of the index math; dominant framework auto-resolves', async () => {
    const { svc } = makeService({ standards: rows, groupBy, assuranceCatalog })
    const res = await svc.getReadiness('school-A')
    expect(res.framework?.code).toBe('cognia_2022')
    // 3 non-assurance leaves at score 3 + evidence → 77 each; index 300 "Accredited".
    expect(res.leafCount).toBe(3)
    expect(res.scoredCount).toBe(3)
    expect(res.coveredCount).toBe(3)
    expect(res.readinessPct).toBe(77)
    expect(res.projectedIndex).toBe(300)
    expect(res.band).toBe('Accredited')
    // Assurance leaf has NO evidence → unsatisfied checklist entry.
    expect(res.assurances).toEqual([
      { standardId: 'asr', code: 'COG-A2', title: 'Audit', satisfied: false },
    ])
    // Default target 280 already met.
    expect(res.target).toEqual({
      index: 280,
      bandLabel: 'Accredited',
      pointGap: 0,
      stepsToTarget: 0,
    })
  })

  it('explicit ?target overrides defaultTarget (320 → gap 20, 1 step for 3 leaves)', async () => {
    const { svc } = makeService({ standards: rows, groupBy, assuranceCatalog })
    const res = await svc.getReadiness('school-A', { target: 320 })
    // ceil(20·3/100) = 1 step.
    expect(res.target).toEqual({
      index: 320,
      bandLabel: 'Accredited with Merit',
      pointGap: 20,
      stepsToTarget: 1,
    })
  })

  it('explicit frameworkId wins over dominance', async () => {
    const { svc } = makeService({ standards: rows, groupBy, assuranceCatalog })
    const res = await svc.getReadiness('school-A', { frameworkId: 'fw-msa' })
    expect(res.framework?.code).toBe('msa_cess_2022')
    // No school rows belong to MSA → empty leaf set.
    expect(res.leafCount).toBe(0)
    expect(res.projectedIndex).toBeNull()
  })

  it('dominance tie breaks by framework code asc', async () => {
    const tied = [
      stdRow({ id: 'x', code: 'COG-1', frameworkId: 'fw-cognia' }),
      stdRow({ id: 'y', code: 'MSA-1', frameworkId: 'fw-msa' }),
    ]
    const { svc } = makeService({ standards: tied })
    const res = await svc.getReadiness('school-A')
    expect(res.framework?.code).toBe('cognia_2022') // 'cognia_2022' < 'msa_cess_2022'
  })

  it('gaps rank unscored/unevidenced leaves first with index lifts', async () => {
    const gapRows = [
      stdRow({ id: 'a', code: 'COG-1', frameworkId: 'fw-cognia', catalogStandardId: 'c1', rubricScore: 4 }),
      stdRow({ id: 'b', code: 'COG-2', frameworkId: 'fw-cognia', catalogStandardId: 'c2', rubricScore: null }),
    ]
    const { svc } = makeService({
      standards: gapRows,
      groupBy: [{ standardId: 'a', _count: { _all: 1 } }],
    })
    const res = await svc.getReadiness('school-A')
    expect(res.gaps).toHaveLength(1) // score-4-with-evidence leaf is not a gap
    expect(res.gaps[0]).toEqual(
      expect.objectContaining({ code: 'COG-2', evidenceGap: true, fullLift: 150, nextStepLift: 50 }),
    )
  })
})

describe('AccreditationReadinessService — degraded modes', () => {
  it('framework-less: framework/index/band/target null, gaps still returned, assurances []', async () => {
    const rows = [
      stdRow({ id: 'a', code: 'H-1', rubricScore: 2 }),
      stdRow({ id: 'b', code: 'H-2' }),
    ]
    const { svc, prisma } = makeService({ standards: rows })
    const res = await svc.getReadiness('school-A')
    expect(res.framework).toBeNull()
    expect(res.projectedIndex).toBeNull()
    expect(res.band).toBeNull()
    expect(res.target).toBeNull()
    expect(res.assurances).toEqual([])
    expect(res.gaps.map((g) => g.code)).toEqual(['H-2', 'H-1']) // score asc (null≙1 first)
    expect(res.gaps[0].fullLift).toBeNull()
    // No framework/catalog queries fire for a fully hand-made register.
    expect(prisma.accreditationFramework.findMany).not.toHaveBeenCalled()
    expect(prisma.accreditationCatalogStandard.findMany).not.toHaveBeenCalled()
  })

  it('MSA (no index scale): readinessPct present, index/band/target null, no errors', async () => {
    const rows = [
      stdRow({ id: 'a', code: 'MSA-1', frameworkId: 'fw-msa', catalogStandardId: 'm1', rubricScore: 3 }),
      stdRow({ id: 'b', code: 'MSA-2', frameworkId: 'fw-msa', catalogStandardId: 'm2' }),
    ]
    const { svc } = makeService({
      standards: rows,
      groupBy: [{ standardId: 'a', _count: { _all: 2 } }],
    })
    const res = await svc.getReadiness('school-A')
    expect(res.framework?.code).toBe('msa_cess_2022')
    // leaf a: 77, leaf b: 0 → mean 39 (rounded).
    expect(res.readinessPct).toBe(39)
    expect(res.projectedIndex).toBeNull()
    expect(res.band).toBeNull()
    expect(res.target).toBeNull()
    expect(res.gaps.length).toBeGreaterThan(0)
  })

  it('empty school → honest zeros', async () => {
    const { svc } = makeService({})
    const res = await svc.getReadiness('school-A')
    expect(res).toEqual(
      expect.objectContaining({
        framework: null,
        readinessPct: 0,
        leafCount: 0,
        projectedIndex: null,
        gaps: [],
        assurances: [],
      }),
    )
  })
})

import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { AccreditationCycleService } from './accreditation-cycle.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// WS3 F1 — the cycle SERVICE: anchor resolution (profile row), the honest
// unconfigured payload + prior-visit SUGGESTION (offered, never adopted),
// PUT validation (targetIndex against the framework's own scale), and the
// composed payload's provenance (everything from the pure engine).
// ─────────────────────────────────────────────────────────────────────────────

const FW = {
  id: 'fw-2025',
  code: 'cognia_2025',
  name: 'Cognia Performance Standards (rev. 2025)',
  indexMin: 100,
  indexMax: 400,
  defaultTarget: 280,
  active: true,
}
const MSA = {
  id: 'fw-msa',
  code: 'msa_cess_2022',
  name: 'MSA-CESS Standards for Accreditation, School Edition (2021)',
  indexMin: null,
  indexMax: null,
  defaultTarget: null,
  active: true,
}

function makeService(opts: {
  profile?: Record<string, unknown> | null
  standards?: { frameworkId: string | null }[]
  priorVisits?: { visitDate: Date; status: string }[]
}) {
  const profiles: Record<string, unknown>[] = opts.profile ? [{ ...opts.profile }] : []
  const prisma = {
    accreditationStandard: {
      findMany: vi.fn(async () => opts.standards ?? [{ frameworkId: FW.id }]),
    },
    accreditationFramework: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string } }) =>
        [FW, MSA].find((f) => f.id === where.id) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        [FW, MSA].filter((f) => where.id.in.includes(f.id)),
      ),
    },
    accreditationFrameworkProfile: {
      findFirst: vi.fn(async ({ where }: { where: { schoolId: string; frameworkId: string } }) =>
        profiles.find((p) => p.frameworkId === where.frameworkId) ?? null,
      ),
      upsert: vi.fn(async ({ where, create, update }: never) => {
        const w = (where as { schoolId_frameworkId: { frameworkId: string } }).schoolId_frameworkId
        const ex = profiles.find((p) => p.frameworkId === w.frameworkId)
        if (ex) {
          Object.assign(ex, update)
          return ex
        }
        const row = { id: 'prof-1', ...(create as object) }
        profiles.push(row)
        return row
      }),
    },
    priorVisitFinding: {
      findMany: vi.fn(async () => opts.priorVisits ?? []),
      findFirst: vi.fn(async () => {
        const sorted = [...(opts.priorVisits ?? [])].sort(
          (a, b) => b.visitDate.getTime() - a.visitDate.getTime(),
        )
        return sorted[0] ?? null
      }),
    },
    accreditationEvidence: { count: vi.fn(async () => 2) },
  }
  const readiness = {
    getReadiness: vi.fn(async () => ({
      leafCount: 31,
      scoredCount: 12,
      selfScoredPct: 40,
      verifiedPct: 22,
      projectedIndex: 262,
      band: 'Accredited Needing Improvement',
      assurances: [
        { standardId: 'a1', code: 'COG-A1', title: 'x', satisfied: true },
        { standardId: 'a2', code: 'COG-A2', title: 'y', satisfied: false },
      ],
    })),
  }
  const evidenceReadiness = {
    // Framework-SENSITIVE on purpose (A4): the cycle service must ask for THIS
    // framework's evidence index, so the mock answers differently per framework
    // and the specs can prove the other register's artifacts never count.
    getEvidenceReadiness: vi.fn(async (_schoolId: string, o: { frameworkId?: string } = {}) =>
      o.frameworkId === MSA.id
        ? { health: { evidenceHealthPct: 90, rated: 50, current: 45, expiring: 0 } }
        : { health: { evidenceHealthPct: 55, rated: 20, current: 11, expiring: 2 } },
    ),
  }
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new AccreditationCycleService(
    prisma as never,
    audit as never,
    readiness as never,
    evidenceReadiness as never,
  )
  return { svc, prisma, profiles, audit, evidenceReadiness }
}

describe('GET cycle — configured', () => {
  it('composes the engine payload off the profile anchor, with the persisted target', async () => {
    const { svc } = makeService({
      profile: {
        id: 'prof-1',
        schoolId: 'school-A',
        frameworkId: FW.id,
        lastReviewDate: new Date('2022-04-12T00:00:00.000Z'),
        nextReviewDate: null,
        termYears: 6,
        targetIndex: 320,
      },
    })
    const res = await svc.getCycle('school-A', {}, new Date('2026-08-25T12:00:00.000Z'))
    expect(res.configured).toBe(true)
    if (res.configured !== true) return
    expect(res.framework.code).toBe('cognia_2025')
    expect(res.anchor).toEqual({
      lastReviewDate: '2022-04-12',
      nextReviewDate: '2028-04-12',
      termYears: 6,
      source: 'manual',
    })
    expect(res.milestones).toHaveLength(6)
    expect(res.phase.yearOfCycle).toBe(5)
    expect(res.targetIndex).toBe(320) // profile beats framework default
    expect(res.suggestion).toBeNull()
  })

  it('A4 — a dual-framework school: the evidence read is scoped to THIS framework, so the other register’s artifacts never count', async () => {
    const { svc, evidenceReadiness } = makeService({
      profile: {
        id: 'prof-1',
        schoolId: 'school-A',
        frameworkId: FW.id,
        lastReviewDate: new Date('2024-04-12T00:00:00.000Z'),
        nextReviewDate: null,
        termYears: 6,
        targetIndex: null,
      },
      // The school holds BOTH registers; Cognia dominates and is also explicit.
      standards: [
        { frameworkId: FW.id },
        { frameworkId: FW.id },
        { frameworkId: MSA.id },
      ],
    })
    const res = await svc.getCycle(
      'school-A',
      { frameworkId: FW.id },
      new Date('2026-08-25T12:00:00.000Z'),
    )
    if (res.configured !== true) throw new Error('expected configured')
    // The read was framework-scoped — never the {} whole-school index.
    expect(evidenceReadiness.getEvidenceReadiness).toHaveBeenCalledWith(
      'school-A',
      { frameworkId: FW.id },
      expect.any(Date),
    )
    // And the implementing measure carries COGNIA's 55% index, not the MSA
    // register's 90% — the figure the {} call would have blended in.
    const implementing = res.milestones.find((m) => m.key === 'implementing')!
    expect(implementing.measure?.num).toBe(55)
    expect(implementing.measure?.text).toContain('55% of rated evidence is current')
    expect(implementing.measure?.text).not.toContain('90%')
  })

  it('falls back to the framework default target when the profile has none', async () => {
    const { svc } = makeService({
      profile: {
        id: 'prof-1',
        schoolId: 'school-A',
        frameworkId: FW.id,
        lastReviewDate: new Date('2022-04-12T00:00:00.000Z'),
        nextReviewDate: null,
        termYears: 6,
        targetIndex: null,
      },
    })
    const res = await svc.getCycle('school-A', {})
    if (res.configured !== true) throw new Error('expected configured')
    expect(res.targetIndex).toBe(280)
  })
})

describe('GET cycle — unconfigured (the honest empty)', () => {
  it('no profile → configured:false with the adopted frameworks listed', async () => {
    const { svc } = makeService({ profile: null })
    const res = await svc.getCycle('school-A', {})
    expect(res.configured).toBe(false)
    if (res.configured !== false) return
    expect(res.framework?.code).toBe('cognia_2025')
    expect(res.frameworks.map((f) => f.code)).toEqual(['cognia_2025'])
    expect(res.suggestion).toBeNull() // no prior visits on file → nothing offered
  })

  it('a profile with no lastReviewDate (division-only) is still unconfigured', async () => {
    const { svc } = makeService({
      profile: { id: 'prof-1', schoolId: 'school-A', frameworkId: FW.id, division: 'nca_casi', lastReviewDate: null },
    })
    const res = await svc.getCycle('school-A', {})
    expect(res.configured).toBe(false)
  })

  it('the prior-visit ledger yields a SUGGESTION — offered, never silently adopted', async () => {
    const { svc } = makeService({
      profile: null,
      priorVisits: [
        { visitDate: new Date('2019-05-01T00:00:00.000Z'), status: 'closed' },
        { visitDate: new Date('2022-04-12T00:00:00.000Z'), status: 'open' },
      ],
    })
    const res = await svc.getCycle('school-A', {})
    expect(res.configured).toBe(false)
    if (res.configured !== false) return
    expect(res.suggestion).toEqual({ lastReviewDate: '2022-04-12', basis: 'prior_visit' })
  })

  it('no adopted framework at all → configured:false, empty frameworks list', async () => {
    const { svc } = makeService({ profile: null, standards: [] })
    const res = await svc.getCycle('school-A', {})
    expect(res.configured).toBe(false)
    if (res.configured !== false) return
    expect(res.framework).toBeNull()
    expect(res.frameworks).toEqual([])
  })
})

describe('PUT cycle — validation + write', () => {
  it('writes the anchor and returns the composed cycle', async () => {
    const { svc, audit } = makeService({ profile: null })
    const res = await svc.setCycle(
      'school-A',
      { frameworkId: FW.id, lastReviewDate: '2022-04-12', termYears: 6, targetIndex: 320 },
      'user-1',
    )
    expect(res.configured).toBe(true)
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'accreditation.cycle.updated' }),
    )
  })

  it('targetIndex outside the framework scale 400s', async () => {
    const { svc } = makeService({ profile: null })
    await expect(
      svc.setCycle('school-A', { frameworkId: FW.id, targetIndex: 950 }, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('targetIndex on an INDEX-LESS framework 400s — a number its accreditor never awards', async () => {
    const { svc } = makeService({ profile: null, standards: [{ frameworkId: MSA.id }] })
    await expect(
      svc.setCycle('school-A', { frameworkId: MSA.id, targetIndex: 300 }, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('unknown framework 404s', async () => {
    const { svc } = makeService({ profile: null })
    await expect(
      svc.setCycle('school-A', { frameworkId: 'fw-nope', lastReviewDate: '2022-01-01' }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('explicit null clears the anchor back to unconfigured; omitted keeps', async () => {
    const { svc, profiles } = makeService({
      profile: {
        id: 'prof-1',
        schoolId: 'school-A',
        frameworkId: FW.id,
        lastReviewDate: new Date('2022-04-12T00:00:00.000Z'),
        nextReviewDate: null,
        termYears: 6,
        targetIndex: 320,
      },
    })
    // Omitted lastReviewDate keeps it; targetIndex updates alone.
    await svc.setCycle('school-A', { frameworkId: FW.id, targetIndex: 360 }, 'user-1')
    expect(profiles[0].targetIndex).toBe(360)
    expect(profiles[0].lastReviewDate).not.toBeNull()
    // Explicit null CLEARS.
    const res = await svc.setCycle('school-A', { frameworkId: FW.id, lastReviewDate: null }, 'user-1')
    expect(profiles[0].lastReviewDate).toBeNull()
    expect(res.configured).toBe(false)
  })
})

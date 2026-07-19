import { describe, expect, it, vi } from 'vitest'
import type { User } from '@finrep/db'
import { DiocesanEnrollmentService } from './diocesan-enrollment.service.js'
import { NameMatchService, type OrgMatchIndex } from './name-match.service.js'

const USER = { id: 'user-1', email: 'head@diocese.test' } as unknown as User
const ORG = 'org-1'

// ── NameMatchService.matchOne (pure over a supplied index) ────────────────────

describe('NameMatchService.matchOne', () => {
  const svc = new NameMatchService({} as never)
  const index: OrgMatchIndex = {
    candidates: [
      { schoolId: 'aca', name: 'Annunciation Catholic Academy' },
      { schoolId: 'prek', name: 'Annunciation Pre-K' },
      { schoolId: 'rose', name: 'St Rose of Lima' },
    ],
    aliasByNorm: new Map(),
  }

  it('auto-matches an exact name', () => {
    const m = svc.matchOne('St. Rose of Lima Catholic School', index)
    expect(m.decision).toBe('auto')
    expect(m.matchedSchoolId).toBe('rose')
  })

  it('never mis-routes the Annunciation pair — each hits its own row', () => {
    expect(svc.matchOne('Annunciation Pre-K', index).matchedSchoolId).toBe('prek')
    expect(svc.matchOne('Annunciation Catholic Academy', index).matchedSchoolId).toBe('aca')
  })

  it('unmatched name → decision unmatched, no school', () => {
    const m = svc.matchOne('Totally Unrelated Montessori', index)
    expect(m.decision).toBe('unmatched')
    expect(m.matchedSchoolId).toBeNull()
  })

  it('alias hit short-circuits to tier alias', () => {
    const idx: OrgMatchIndex = {
      candidates: index.candidates,
      aliasByNorm: new Map([['annunciation', { schoolId: 'aca', name: 'Annunciation Catholic Academy' }]]),
    }
    const m = svc.matchOne('The Annunciation', idx)
    expect(m.tier).toBe('alias')
    expect(m.matchedSchoolId).toBe('aca')
    expect(m.viaAlias).toBe(true)
  })
})

// ── DiocesanEnrollmentService.apply (mocked deps, no DB boot) ──────────────────

interface RowSeed {
  id: string
  matchStatus: string
  matchedSchoolId: string | null
  normalizedName?: string
  total?: number
}

function makeService(opts: {
  memberships: { schoolId: string; role: string; name: string }[]
  rows: RowSeed[]
  entitled?: (schoolId: string) => boolean
  intakeResult?: (schoolId: string) => { superseded: boolean; supersededManual: number | null }
}) {
  const rows = opts.rows.map((r) => ({
    id: r.id,
    matchStatus: r.matchStatus,
    matchedSchoolId: r.matchedSchoolId,
    normalizedName: r.normalizedName ?? 'x',
    total: r.total ?? 100,
    byGrade: {},
    byStatus: null,
    byDemographics: null,
    sourceName: `src-${r.id}`,
  }))
  const rowUpdate = vi.fn(async () => ({}))
  const importUpdate = vi.fn(async () => ({}))
  const prisma = {
    membership: {
      findMany: vi.fn(async () =>
        opts.memberships.map((m) => ({
          schoolId: m.schoolId,
          role: m.role,
          status: 'active',
          school: { id: m.schoolId, name: m.name, organizationId: ORG },
        })),
      ),
    },
    diocesanEnrollmentImport: {
      findFirst: vi.fn(async () => ({ id: 'imp-1', organizationId: ORG, observedOn: new Date('2025-10-01'), rows })),
      update: importUpdate,
    },
    diocesanEnrollmentRow: { update: rowUpdate },
    // Diocesan imports resolve a per-school EnrollmentSource id (FIX 2) — reuse an
    // existing row so no create is needed.
    enrollmentSource: {
      findUnique: vi.fn(async ({ where }: { where: { schoolId: string } }) => ({ id: `src-${where.schoolId}` })),
      create: vi.fn(async () => ({ id: 'src-new' })),
    },
  }
  const intake = vi.fn(async (_u: User, schoolId: string) => {
    const r = opts.intakeResult?.(schoolId) ?? { superseded: false, supersededManual: null }
    return { promoted: true, superseded: r.superseded, supersededManual: r.supersededManual, snapshot: {}, warnings: [] }
  })
  const enrollment = { intakeNormalized: intake }
  const billing = { isEntitledForModule: vi.fn(async (schoolId: string) => (opts.entitled ? opts.entitled(schoolId) : true)) }
  const nameMatch = { learnAlias: vi.fn(async () => undefined) }
  const audit = { write: vi.fn(async () => undefined) }
  const periods = { resolveExistingForImport: vi.fn(async () => null) }
  const svc = new DiocesanEnrollmentService(
    prisma as never,
    enrollment as never,
    nameMatch as never,
    billing as never,
    audit as never,
    periods as never,
  )
  return { svc, intake, rowUpdate, importUpdate, learnAlias: nameMatch.learnAlias }
}

describe('DiocesanEnrollmentService.apply', () => {
  it('applies auto rows, skips review/unmatched, and marks the import applied', async () => {
    const { svc, intake, importUpdate } = makeService({
      memberships: [
        { schoolId: 's1', role: 'owner', name: 'St One' },
        { schoolId: 's2', role: 'accountant', name: 'St Two' },
      ],
      rows: [
        { id: 'r1', matchStatus: 'auto', matchedSchoolId: 's1' },
        { id: 'r2', matchStatus: 'review', matchedSchoolId: 's2' },
        { id: 'r3', matchStatus: 'unmatched', matchedSchoolId: null },
      ],
    })
    const res = await svc.apply(USER, ORG, 'imp-1', {})
    expect(res.total).toBe(3)
    expect(res.applied).toBe(1) // only the auto row
    expect(res.skipped).toBe(2)
    expect(intake).toHaveBeenCalledTimes(1)
    expect(importUpdate).toHaveBeenCalled()
    const applied = res.results.find((r) => r.status === 'applied')
    expect(applied?.schoolId).toBe('s1')
  })

  it('a reviewer override confirms a review row (and can learn an alias)', async () => {
    const { svc, intake, learnAlias } = makeService({
      memberships: [{ schoolId: 's2', role: 'owner', name: 'St Two' }],
      rows: [{ id: 'r2', matchStatus: 'review', matchedSchoolId: 's2', normalizedName: 'two' }],
    })
    const res = await svc.apply(USER, ORG, 'imp-1', {
      rows: [{ rowId: 'r2', action: 'match', schoolId: 's2', learnAlias: true }],
    })
    expect(res.applied).toBe(1)
    expect(intake).toHaveBeenCalledTimes(1)
    expect(learnAlias).toHaveBeenCalledWith(ORG, 'two', 's2', USER.id)
  })

  it('skips a school the caller lacks owner/accountant access to', async () => {
    const { svc, intake } = makeService({
      memberships: [{ schoolId: 's1', role: 'viewer', name: 'St One' }],
      rows: [{ id: 'r1', matchStatus: 'auto', matchedSchoolId: 's1' }],
    })
    const res = await svc.apply(USER, ORG, 'imp-1', {})
    expect(res.applied).toBe(0)
    expect(res.skipped).toBe(1)
    expect(res.results[0]!.reason).toMatch(/owner|accountant/i)
    expect(intake).not.toHaveBeenCalled()
  })

  it('skips an un-entitled school with a clear reason, batch continues', async () => {
    const { svc } = makeService({
      memberships: [
        { schoolId: 's1', role: 'owner', name: 'St One' },
        { schoolId: 's2', role: 'owner', name: 'St Two' },
      ],
      rows: [
        { id: 'r1', matchStatus: 'auto', matchedSchoolId: 's1' },
        { id: 'r2', matchStatus: 'auto', matchedSchoolId: 's2' },
      ],
      entitled: (id) => id === 's1',
    })
    const res = await svc.apply(USER, ORG, 'imp-1', {})
    expect(res.applied).toBe(1)
    expect(res.skipped).toBe(1)
    expect(res.results.find((r) => r.schoolId === 's2')?.reason).toMatch(/licensed/i)
  })

  it('reports a superseded manual entry as status superseded', async () => {
    const { svc } = makeService({
      memberships: [{ schoolId: 's1', role: 'owner', name: 'St One' }],
      rows: [{ id: 'r1', matchStatus: 'auto', matchedSchoolId: 's1' }],
      intakeResult: () => ({ superseded: true, supersededManual: 275 }),
    })
    const res = await svc.apply(USER, ORG, 'imp-1', {})
    expect(res.superseded).toBe(1)
    expect(res.applied).toBe(1) // superseded counts as applied
    const row = res.results[0]!
    expect(row.status).toBe('superseded')
    expect(row.supersededManual).toBe(275)
  })

  it('skips a second row that re-targets an already-imported school (FIX 6)', async () => {
    const { svc, intake } = makeService({
      memberships: [{ schoolId: 's1', role: 'owner', name: 'St One' }],
      rows: [
        { id: 'r1', matchStatus: 'auto', matchedSchoolId: 's1' },
        { id: 'r2', matchStatus: 'auto', matchedSchoolId: 's1' }, // duplicate target
      ],
    })
    const res = await svc.apply(USER, ORG, 'imp-1', {})
    expect(res.applied).toBe(1)
    expect(res.skipped).toBe(1)
    expect(intake).toHaveBeenCalledTimes(1)
    expect(res.results.find((r) => r.status === 'skipped')?.reason).toMatch(/already imported/i)
  })

  it('rejects a caller with no membership in the org (403)', async () => {
    const { svc } = makeService({ memberships: [], rows: [] })
    await expect(svc.apply(USER, ORG, 'imp-1', {})).rejects.toThrow()
  })
})

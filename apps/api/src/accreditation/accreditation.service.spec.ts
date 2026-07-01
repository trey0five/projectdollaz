import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { AccreditationService } from './accreditation.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AccreditationService — TENANT ISOLATION + evidence linkage + computed coverage.
// Prisma + Audit are hand-mocked (no DB, no Nest boot).
// ─────────────────────────────────────────────────────────────────────────────

function stdRow(over: Record<string, unknown> = {}) {
  return {
    id: 's1',
    schoolId: 'school-A',
    code: 'MSA-1',
    title: 'Governance & Leadership',
    category: 'Governance',
    reviewDate: null,
    owner: null,
    notes: null,
    updatedByUserId: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...over,
  }
}

function evRow(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    schoolId: 'school-A',
    standardId: 's1',
    title: 'Board minutes 2025',
    kind: 'document',
    reference: null,
    notes: null,
    capturedAt: null,
    sourceType: 'manual',
    sourceRef: null,
    createdByUserId: 'user-1',
    createdAt: new Date('2025-02-01T00:00:00.000Z'),
    updatedAt: new Date('2025-02-01T00:00:00.000Z'),
    ...over,
  }
}

function makeService(over: {
  standard?: Record<string, unknown>
  evidence?: Record<string, unknown>
  policy?: Record<string, unknown>
  boardReport?: Record<string, unknown>
}) {
  const standard = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => stdRow(data)),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => stdRow(data)),
    delete: vi.fn(async () => stdRow()),
    count: vi.fn(async () => 0),
    ...over.standard,
  }
  const evidence = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => evRow(data)),
    delete: vi.fn(async () => evRow()),
    groupBy: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    ...over.evidence,
  }
  const policy = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    ...over.policy,
  }
  const boardReport = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    ...over.boardReport,
  }
  const prisma = {
    accreditationStandard: standard,
    accreditationEvidence: evidence,
    policy,
    boardReport,
  }
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new AccreditationService(prisma as never, audit as never)
  return { svc, standard, evidence, policy, boardReport, audit }
}

describe('AccreditationService — standards', () => {
  it('listStandards filters by schoolId, batch-counts evidence, gaps-first order + summary', async () => {
    const NOW = new Date('2026-07-01T12:00:00.000Z')
    const { svc, standard, evidence } = makeService({
      standard: {
        findMany: vi.fn(async () => [
          stdRow({ id: 's1', code: 'A', title: 'Has evidence' }),
          stdRow({ id: 's2', code: 'B', title: 'No evidence' }),
        ]),
      },
      evidence: { groupBy: vi.fn(async () => [{ standardId: 's1', _count: { _all: 3 } }]) },
    })
    const res = await svc.listStandards('school-A', NOW)
    expect(standard.findMany).toHaveBeenCalledWith({ where: { schoolId: 'school-A' } })
    expect(evidence.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: 'school-A' } }),
    )
    // no-evidence sorts first
    expect(res.standards[0].id).toBe('s2')
    expect(res.standards[0].coverage).toBe('no-evidence')
    expect(res.standards[1].coverage).toBe('covered')
    expect(res.standards[1].evidenceCount).toBe(3)
    expect(res.summary).toEqual({ total: 2, withEvidence: 1, gaps: 1, pctCovered: 50 })
  })

  it('update: a standardId owned by ANOTHER school → NotFoundException, never mutates', async () => {
    const { svc, standard } = makeService({ standard: { findFirst: vi.fn(async () => null) } })
    await expect(
      svc.updateStandard('school-B', 'std-of-A', { title: 'hijack' }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(standard.update).not.toHaveBeenCalled()
  })

  it('remove: foreign id → NotFoundException, never deletes', async () => {
    const { svc, standard } = makeService({ standard: { findFirst: vi.fn(async () => null) } })
    await expect(svc.removeStandard('school-B', 'std-of-A', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(standard.delete).not.toHaveBeenCalled()
  })

  it('create scopes schoolId, defaults null category, writes an audit entry', async () => {
    const { svc, standard, audit } = makeService({})
    await svc.createStandard('school-A', { code: 'X', title: 'T' }, 'user-1')
    const arg = standard.create.mock.calls[0][0].data
    expect(arg.schoolId).toBe('school-A')
    expect(arg.category).toBeNull()
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'accreditation.standard.created', schoolId: 'school-A' }),
    )
  })

  it('update merge-pick: explicit null clears, omitted keeps', async () => {
    const { svc, standard } = makeService({
      standard: { findFirst: vi.fn(async () => stdRow({ owner: 'Head', notes: 'keep me' })) },
    })
    await svc.updateStandard('school-A', 's1', { owner: null }, 'user-1')
    const data = standard.update.mock.calls[0][0].data
    expect(data.owner).toBeNull()
    expect(data.notes).toBe('keep me')
  })
})

describe('AccreditationService — evidence linkage (tenant + cross-standard)', () => {
  it('createEvidence under a foreign standard → NotFound, no row written', async () => {
    const { svc, evidence } = makeService({ standard: { findFirst: vi.fn(async () => null) } })
    await expect(
      svc.createEvidence('school-B', 'std-of-A', { title: 'leak' }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(evidence.create).not.toHaveBeenCalled()
  })

  it('createEvidence copies schoolId from the resolved standard (body cannot retarget)', async () => {
    const { svc, evidence } = makeService({
      // Resolved standard belongs to school-A; the create must use school-A.
      standard: { findFirst: vi.fn(async () => stdRow({ id: 's1', schoolId: 'school-A' })) },
    })
    await svc.createEvidence('school-A', 's1', { title: 'Board minutes', kind: 'document' }, 'user-1')
    const data = evidence.create.mock.calls[0][0].data
    expect(data.schoolId).toBe('school-A')
    expect(data.standardId).toBe('s1')
    expect(data.kind).toBe('document')
  })

  it('listEvidence resolves the standard first (foreign → NotFound), filters both keys', async () => {
    const { svc, evidence } = makeService({
      standard: { findFirst: vi.fn(async () => stdRow({ id: 's1', schoolId: 'school-A' })) },
      evidence: { findMany: vi.fn(async () => [evRow()]) },
    })
    await svc.listEvidence('school-A', 's1')
    expect(evidence.findMany).toHaveBeenCalledWith({ where: { standardId: 's1', schoolId: 'school-A' } })
  })

  it('listEvidence under a foreign standard → NotFound', async () => {
    const { svc, evidence } = makeService({ standard: { findFirst: vi.fn(async () => null) } })
    await expect(svc.listEvidence('school-B', 'std-of-A')).rejects.toBeInstanceOf(NotFoundException)
    expect(evidence.findMany).not.toHaveBeenCalled()
  })

  it('removeEvidence: cross-standard evidenceId (right school, wrong standard) → NotFound', async () => {
    const { svc, evidence } = makeService({
      standard: { findFirst: vi.fn(async () => stdRow({ id: 's1', schoolId: 'school-A' })) },
      // The 3-filter findFirst (id + standardId + schoolId) misses → null.
      evidence: { findFirst: vi.fn(async () => null) },
    })
    await expect(
      svc.removeEvidence('school-A', 's1', 'ev-of-other-standard', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(evidence.delete).not.toHaveBeenCalled()
  })

  it('removeEvidence: valid → filters all three keys, deletes, audits', async () => {
    const { svc, evidence, audit } = makeService({
      standard: { findFirst: vi.fn(async () => stdRow({ id: 's1', schoolId: 'school-A' })) },
      evidence: { findFirst: vi.fn(async () => evRow({ id: 'e1' })) },
    })
    await svc.removeEvidence('school-A', 's1', 'e1', 'user-1')
    expect(evidence.findFirst).toHaveBeenCalledWith({
      where: { id: 'e1', standardId: 's1', schoolId: 'school-A' },
    })
    expect(evidence.delete).toHaveBeenCalledWith({ where: { id: 'e1' } })
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'accreditation.evidence.deleted' }),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Evidence-from-operations: discovery + attach-validation + toPublic source fields.
// ─────────────────────────────────────────────────────────────────────────────
describe('AccreditationService — evidence-source discovery', () => {
  it('listEvidenceSources returns ONLY the caller-school artifacts, shaped + dated', async () => {
    const { svc, policy, boardReport } = makeService({
      policy: {
        findMany: vi.fn(async () => [
          {
            id: 'p1',
            title: 'Whistleblower',
            category: 'Governance',
            lastReviewedDate: new Date('2025-05-10T00:00:00.000Z'),
            adoptedDate: null,
          },
          { id: 'p2', title: 'Gift Acceptance', category: null, lastReviewedDate: null, adoptedDate: null },
        ]),
      },
      boardReport: {
        findMany: vi.fn(async () => [
          {
            id: 'b1',
            reportTitle: null,
            generatedAt: new Date('2025-06-01T09:00:00.000Z'),
            createdAt: new Date('2025-05-01T00:00:00.000Z'),
            fiscalPeriod: { label: 'FY25 Q4' },
          },
        ]),
      },
    })
    const res = await svc.listEvidenceSources('school-A')
    expect(policy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: 'school-A' } }),
    )
    expect(boardReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: 'school-A' } }),
    )
    expect(res.policies[0]).toEqual({
      sourceType: 'policy',
      sourceRef: 'p1',
      label: 'Whistleblower (Governance)',
      date: '2025-05-10',
      link: '/governance',
    })
    // No category → bare title (no parens).
    expect(res.policies[1].label).toBe('Gift Acceptance')
    // Null reportTitle → falls back to the fiscalPeriod label; date from generatedAt.
    expect(res.boardReports[0]).toEqual({
      sourceType: 'board_report',
      sourceRef: 'b1',
      label: 'Board report — FY25 Q4',
      date: '2025-06-01',
      link: '/reports',
    })
  })

  it('empty school → { policies: [], boardReports: [] }', async () => {
    const { svc } = makeService({})
    await expect(svc.listEvidenceSources('school-A')).resolves.toEqual({
      policies: [],
      boardReports: [],
    })
  })
})

describe('AccreditationService — attach linked evidence (cross-tenant gate + auto-title)', () => {
  it('valid policy attach (no title): validates school-scoped, auto-derives title, kind=link', async () => {
    const { svc, policy, evidence } = makeService({
      standard: { findFirst: vi.fn(async () => stdRow({ id: 's1', schoolId: 'school-A' })) },
      policy: { findFirst: vi.fn(async () => ({ id: 'p1', title: 'Conflict of Interest', category: 'Governance' })) },
    })
    await svc.createEvidence('school-A', 's1', { sourceType: 'policy', sourceRef: 'p1' }, 'user-1')
    expect(policy.findFirst).toHaveBeenCalledWith({ where: { id: 'p1', schoolId: 'school-A' } })
    const data = evidence.create.mock.calls[0][0].data
    expect(data.sourceType).toBe('policy')
    expect(data.sourceRef).toBe('p1')
    expect(data.kind).toBe('link')
    expect(data.title).toBe('Conflict of Interest (Governance)')
    expect(data.reference).toBe('/governance')
    expect(data.schoolId).toBe('school-A')
  })

  it('valid board_report attach: auto-title from reportTitle, reference=/reports', async () => {
    const { svc, boardReport, evidence } = makeService({
      standard: { findFirst: vi.fn(async () => stdRow({ id: 's1', schoolId: 'school-A' })) },
      boardReport: {
        findFirst: vi.fn(async () => ({
          id: 'b1',
          reportTitle: 'March Finance Packet',
          fiscalPeriod: { label: 'FY25 Q3' },
        })),
      },
    })
    await svc.createEvidence('school-A', 's1', { sourceType: 'board_report', sourceRef: 'b1' }, 'user-1')
    const data = evidence.create.mock.calls[0][0].data
    expect(data.sourceType).toBe('board_report')
    expect(data.title).toBe('March Finance Packet')
    expect(data.reference).toBe('/reports')
    expect(data.kind).toBe('link')
  })

  it('CROSS-TENANT policy sourceRef → NotFound, no evidence row created', async () => {
    const { svc, evidence } = makeService({
      // Standard is school-A; the policy findFirst is scoped to school-A → foreign p-of-B misses → null.
      standard: { findFirst: vi.fn(async () => stdRow({ id: 's1', schoolId: 'school-A' })) },
      policy: { findFirst: vi.fn(async () => null) },
    })
    await expect(
      svc.createEvidence('school-A', 's1', { sourceType: 'policy', sourceRef: 'policy-of-B' }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(evidence.create).not.toHaveBeenCalled()
  })

  it('nonexistent board_report sourceRef → NotFound, no row', async () => {
    const { svc, evidence } = makeService({
      standard: { findFirst: vi.fn(async () => stdRow({ id: 's1', schoolId: 'school-A' })) },
      boardReport: { findFirst: vi.fn(async () => null) },
    })
    await expect(
      svc.createEvidence('school-A', 's1', { sourceType: 'board_report', sourceRef: 'nope' }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(evidence.create).not.toHaveBeenCalled()
  })

  it('sourceType != manual but sourceRef missing → BadRequest', async () => {
    const { svc, evidence, policy } = makeService({
      standard: { findFirst: vi.fn(async () => stdRow({ id: 's1', schoolId: 'school-A' })) },
    })
    await expect(
      svc.createEvidence('school-A', 's1', { sourceType: 'policy' }, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(policy.findFirst).not.toHaveBeenCalled()
    expect(evidence.create).not.toHaveBeenCalled()
  })

  it('manual create with empty/missing title → BadRequest (today’s guarantee preserved)', async () => {
    const { svc, evidence } = makeService({
      standard: { findFirst: vi.fn(async () => stdRow({ id: 's1', schoolId: 'school-A' })) },
    })
    await expect(
      svc.createEvidence('school-A', 's1', {}, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(evidence.create).not.toHaveBeenCalled()
  })

  it('manual create (explicit) → sourceType=manual, sourceRef=null, unchanged behavior', async () => {
    const { svc, evidence } = makeService({
      standard: { findFirst: vi.fn(async () => stdRow({ id: 's1', schoolId: 'school-A' })) },
    })
    await svc.createEvidence('school-A', 's1', { title: 'Handbook', kind: 'document' }, 'user-1')
    const data = evidence.create.mock.calls[0][0].data
    expect(data.sourceType).toBe('manual')
    expect(data.sourceRef).toBeNull()
    expect(data.kind).toBe('document')
    expect(data.title).toBe('Handbook')
  })
})

describe('AccreditationService — toEvidencePublic source fields + coverage', () => {
  it('linked evidence exposes sourceType/sourceRef + sourceLabel/sourceLink', async () => {
    const { svc } = makeService({
      standard: { findFirst: vi.fn(async () => stdRow({ id: 's1', schoolId: 'school-A' })) },
      evidence: {
        findMany: vi.fn(async () => [
          evRow({ id: 'e1', sourceType: 'policy', sourceRef: 'p1', kind: 'link', title: 'CoI' }),
          evRow({ id: 'e2', sourceType: 'board_report', sourceRef: 'b1', kind: 'link' }),
          evRow({ id: 'e3', sourceType: 'manual', sourceRef: null }),
        ]),
      },
    })
    const { evidence } = await svc.listEvidence('school-A', 's1')
    const byId = Object.fromEntries(evidence.map((e) => [e.id, e]))
    expect(byId.e1.sourceLabel).toBe('Governance')
    expect(byId.e1.sourceLink).toBe('/governance')
    expect(byId.e2.sourceLabel).toBe('Reports')
    expect(byId.e2.sourceLink).toBe('/reports')
    expect(byId.e3.sourceType).toBe('manual')
    expect(byId.e3.sourceLabel).toBeNull()
    expect(byId.e3.sourceLink).toBeNull()
  })

  it('coverage counts a single LINKED evidence identically to a manual one', async () => {
    const NOW = new Date('2026-07-01T12:00:00.000Z')
    const { svc } = makeService({
      standard: { findMany: vi.fn(async () => [stdRow({ id: 's1', code: 'A', title: 'Linked only' })]) },
      // One linked (policy) evidence row for s1 → count 1 via groupBy.
      evidence: { groupBy: vi.fn(async () => [{ standardId: 's1', _count: { _all: 1 } }]) },
    })
    const res = await svc.listStandards('school-A', NOW)
    expect(res.standards[0].coverage).toBe('covered')
    expect(res.standards[0].evidenceCount).toBe(1)
    expect(res.summary.withEvidence).toBe(1)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
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
    createdByUserId: 'user-1',
    createdAt: new Date('2025-02-01T00:00:00.000Z'),
    updatedAt: new Date('2025-02-01T00:00:00.000Z'),
    ...over,
  }
}

function makeService(over: {
  standard?: Record<string, unknown>
  evidence?: Record<string, unknown>
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
  const prisma = { accreditationStandard: standard, accreditationEvidence: evidence }
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new AccreditationService(prisma as never, audit as never)
  return { svc, standard, evidence, audit }
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

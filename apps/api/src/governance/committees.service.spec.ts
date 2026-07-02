import { describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { CommitteesService } from './committees.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// CommitteesService — TENANT ISOLATION + deterministic ordering. Prisma + Audit
// are hand-mocked (no DB, no Nest boot).
// ─────────────────────────────────────────────────────────────────────────────

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    schoolId: 'school-A',
    name: 'Finance Committee',
    kind: 'finance',
    description: null,
    chair: null,
    active: true,
    updatedByUserId: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...over,
  }
}

function makeService(prismaOver: Record<string, unknown> = {}) {
  const committee = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => row(data)),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => row(data)),
    delete: vi.fn(async () => row()),
    ...prismaOver,
  }
  const prisma = { committee }
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new CommitteesService(prisma as never, audit as never)
  return { svc, committee, audit }
}

describe('CommitteesService', () => {
  it('list filters by schoolId and sorts active-first then name', async () => {
    const { svc, committee } = makeService({
      findMany: vi.fn(async () => [
        row({ id: 'c1', name: 'Zeta', active: true }),
        row({ id: 'c2', name: 'Alpha', active: false }),
        row({ id: 'c3', name: 'Beta', active: true }),
      ]),
    })
    const res = await svc.list('school-A')
    expect(committee.findMany).toHaveBeenCalledWith({ where: { schoolId: 'school-A' } })
    expect(res.committees.map((c) => c.id)).toEqual(['c3', 'c1', 'c2'])
  })

  it('create scopes schoolId, defaults kind/active, writes audit', async () => {
    const { svc, committee, audit } = makeService()
    await svc.create('school-A', { name: 'Board' }, 'user-1')
    const data = committee.create.mock.calls[0][0].data
    expect(data.schoolId).toBe('school-A')
    expect(data.kind).toBe('other')
    expect(data.active).toBe(true)
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'governance.committee.created', targetType: 'governance_committees' }),
    )
  })

  it('update: a committeeId owned by ANOTHER school → 404, never mutates', async () => {
    const { svc, committee } = makeService({ findFirst: vi.fn(async () => null) })
    await expect(
      svc.update('school-B', 'committee-of-A', { name: 'hijack' }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(committee.update).not.toHaveBeenCalled()
  })

  it('update merge-pick: explicit null clears, omitted keeps', async () => {
    const { svc, committee } = makeService({
      findFirst: vi.fn(async () => row({ id: 'c1', chair: 'Jane', description: 'keep me' })),
    })
    await svc.update('school-A', 'c1', { chair: null }, 'user-1')
    const data = committee.update.mock.calls[0][0].data
    expect(data.chair).toBeNull()
    expect(data.description).toBe('keep me')
  })

  it('remove: foreign id → 404, never deletes', async () => {
    const { svc, committee } = makeService({ findFirst: vi.fn(async () => null) })
    await expect(svc.remove('school-B', 'committee-of-A', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(committee.delete).not.toHaveBeenCalled()
  })
})

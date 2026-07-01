import { describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { PoliciesService } from './policies.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// PoliciesService — TENANT ISOLATION + computed review status. Prisma + Audit are
// hand-mocked (no DB, no Nest boot).
// ─────────────────────────────────────────────────────────────────────────────

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    schoolId: 'school-A',
    title: 'Whistleblower Policy',
    category: 'Governance',
    status: 'active',
    owner: null,
    adoptedDate: null,
    lastReviewedDate: null,
    reviewIntervalMonths: 12,
    notes: null,
    updatedByUserId: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...over,
  }
}

function makeService(prismaOver: Record<string, unknown>) {
  const policy = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => row(data)),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => row(data)),
    delete: vi.fn(async () => row()),
    ...prismaOver,
  }
  const prisma = { policy }
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new PoliciesService(prisma as never, audit as never)
  return { svc, policy, audit }
}

describe('PoliciesService', () => {
  it('list filters by schoolId and enriches with computed review status', async () => {
    const NOW = new Date('2026-06-30T12:00:00.000Z')
    const { svc, policy } = makeService({
      findMany: vi.fn(async () => [
        row({ id: 'p1', title: 'Overdue', adoptedDate: new Date('2024-06-29T00:00:00.000Z'), reviewIntervalMonths: 12 }),
        row({ id: 'p2', title: 'Current', lastReviewedDate: new Date('2026-05-30T00:00:00.000Z'), reviewIntervalMonths: 12 }),
      ]),
    })
    const res = await svc.list('school-A', NOW)
    expect(policy.findMany).toHaveBeenCalledWith({ where: { schoolId: 'school-A' } })
    // Overdue sorts before current (deterministic REVIEW_ORDER).
    expect(res.policies[0].id).toBe('p1')
    expect(res.policies[0].reviewStatus).toBe('overdue')
    expect(res.policies[1].reviewStatus).toBe('current')
  })

  it('update: a policyId owned by ANOTHER school → NotFoundException, never mutates', async () => {
    const { svc, policy } = makeService({
      // findFirst scoped {id, schoolId} returns null for a foreign id.
      findFirst: vi.fn(async () => null),
    })
    await expect(
      svc.update('school-B', 'policy-of-A', { title: 'hijack' }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(policy.update).not.toHaveBeenCalled()
  })

  it('update: ownership check is scoped to {id, schoolId}', async () => {
    const { svc, policy } = makeService({
      findFirst: vi.fn(async () => row({ id: 'p1', schoolId: 'school-A' })),
    })
    await svc.update('school-A', 'p1', { title: 'New Title' }, 'user-1')
    expect(policy.findFirst).toHaveBeenCalledWith({ where: { id: 'p1', schoolId: 'school-A' } })
    expect(policy.update).toHaveBeenCalled()
  })

  it('remove: foreign id → NotFoundException, never deletes', async () => {
    const { svc, policy } = makeService({ findFirst: vi.fn(async () => null) })
    await expect(svc.remove('school-B', 'policy-of-A', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(policy.delete).not.toHaveBeenCalled()
  })

  it('create scopes the schoolId and writes an audit entry', async () => {
    const { svc, policy, audit } = makeService({})
    await svc.create('school-A', { title: 'T', category: 'HR' }, 'user-1')
    const arg = policy.create.mock.calls[0][0].data
    expect(arg.schoolId).toBe('school-A')
    expect(arg.reviewIntervalMonths).toBe(12) // default applied
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'policy.created', schoolId: 'school-A' }),
    )
  })

  it('update merge-pick: explicit null clears, omitted keeps', async () => {
    const { svc, policy } = makeService({
      findFirst: vi.fn(async () => row({ id: 'p1', owner: 'CFO', notes: 'keep me' })),
    })
    await svc.update('school-A', 'p1', { owner: null }, 'user-1')
    const data = policy.update.mock.calls[0][0].data
    expect(data.owner).toBeNull() // cleared
    expect(data.notes).toBe('keep me') // untouched
  })
})

import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { TasksService } from './tasks.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// TasksService — TENANT ISOLATION + assignee-must-be-a-member + computed urgency.
// Prisma + Audit are hand-mocked (no DB, no Nest boot).
// ─────────────────────────────────────────────────────────────────────────────

function row(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    schoolId: 'school-A',
    title: 'Review Q1 close',
    description: null,
    assigneeUserId: null,
    assignee: null,
    dueDate: null,
    status: 'open',
    priority: 'normal',
    sourceType: null,
    sourceRef: null,
    createdByUserId: null,
    completedAt: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...over,
  }
}

function makeService(over: {
  task?: Record<string, unknown>
  membership?: Record<string, unknown>
}) {
  const task = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => row(data)),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => row(data)),
    delete: vi.fn(async () => row()),
    ...over.task,
  }
  const membership = {
    // Default: caller-supplied assignee is NOT a member (findFirst → null).
    findFirst: vi.fn(async () => null),
    ...over.membership,
  }
  const prisma = { task, membership }
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new TasksService(prisma as never, audit as never)
  return { svc, task, membership, audit }
}

describe('TasksService', () => {
  it('list filters by schoolId + status/assignee and enriches with computed urgency', async () => {
    const NOW = new Date('2026-07-01T12:00:00.000Z')
    const { svc, task } = makeService({
      task: {
        findMany: vi.fn(async () => [
          row({ id: 'a', title: 'On track', dueDate: new Date('2026-12-01T00:00:00.000Z') }),
          row({ id: 'b', title: 'Overdue', dueDate: new Date('2026-06-01T00:00:00.000Z') }),
        ]),
      },
    })
    const res = await svc.list('school-A', { status: 'open', assigneeUserId: 'u1' }, NOW)
    expect(task.findMany).toHaveBeenCalledWith({
      where: { schoolId: 'school-A', status: 'open', assigneeUserId: 'u1' },
      include: { assignee: true },
    })
    // Overdue sorts before on-track (deterministic URGENCY_ORDER).
    expect(res.tasks[0].id).toBe('b')
    expect(res.tasks[0].urgency).toBe('overdue')
    expect(res.tasks[1].urgency).toBe('on-track')
  })

  it('create: assignee with NO active membership → BadRequestException, never creates', async () => {
    const { svc, task, membership } = makeService({
      membership: { findFirst: vi.fn(async () => null) }, // not a member
    })
    await expect(
      svc.create('school-A', { title: 'T', assigneeUserId: 'outsider' }, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(membership.findFirst).toHaveBeenCalledWith({
      where: { schoolId: 'school-A', userId: 'outsider', status: 'active' },
    })
    expect(task.create).not.toHaveBeenCalled()
  })

  it('create: cross-tenant assignee (member of ANOTHER school) → BadRequest (scoped by schoolId)', async () => {
    // The membership query is scoped to {schoolId, userId, status:'active'}; a user
    // whose only membership is in another school resolves to null here → 400.
    const { svc } = makeService({ membership: { findFirst: vi.fn(async () => null) } })
    await expect(
      svc.create('school-A', { title: 'T', assigneeUserId: 'member-of-B' }, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('create: active member assignee succeeds; createdByUserId set from caller', async () => {
    const { svc, task, audit } = makeService({
      membership: { findFirst: vi.fn(async () => ({ id: 'm1' })) },
    })
    await svc.create('school-A', { title: 'T', assigneeUserId: 'member-A' }, 'user-1')
    const data = task.create.mock.calls[0][0].data
    expect(data.schoolId).toBe('school-A')
    expect(data.assigneeUserId).toBe('member-A')
    expect(data.createdByUserId).toBe('user-1') // never from the DTO
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.created', schoolId: 'school-A' }),
    )
  })

  it('create: assigneeUserId omitted → NO membership query (unassigned is legal)', async () => {
    const { svc, membership, task } = makeService({})
    await svc.create('school-A', { title: 'Unassigned task' }, 'user-1')
    expect(membership.findFirst).not.toHaveBeenCalled()
    expect(task.create).toHaveBeenCalled()
  })

  it('update: a taskId owned by ANOTHER school → NotFoundException, never mutates', async () => {
    const { svc, task } = makeService({ task: { findFirst: vi.fn(async () => null) } })
    await expect(
      svc.update('school-B', 'task-of-A', { title: 'hijack' }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(task.update).not.toHaveBeenCalled()
  })

  it('update: ownership check is scoped to {id, schoolId}', async () => {
    const { svc, task } = makeService({
      task: { findFirst: vi.fn(async () => row({ id: 't1', schoolId: 'school-A' })) },
    })
    await svc.update('school-A', 't1', { title: 'New' }, 'user-1')
    expect(task.findFirst).toHaveBeenCalledWith({ where: { id: 't1', schoolId: 'school-A' } })
    expect(task.update).toHaveBeenCalled()
  })

  it('update: re-validates a newly-set assignee as an active member', async () => {
    const { svc, membership } = makeService({
      task: { findFirst: vi.fn(async () => row({ id: 't1' })) },
      membership: { findFirst: vi.fn(async () => null) }, // not a member
    })
    await expect(
      svc.update('school-A', 't1', { assigneeUserId: 'outsider' }, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(membership.findFirst).toHaveBeenCalled()
  })

  it('update: transition INTO done stamps completedAt; OUT of done clears it', async () => {
    const intoDone = makeService({
      task: { findFirst: vi.fn(async () => row({ id: 't1', status: 'open', completedAt: null })) },
    })
    await intoDone.svc.update('school-A', 't1', { status: 'done' }, 'user-1')
    expect(intoDone.task.update.mock.calls[0][0].data.completedAt).toBeInstanceOf(Date)

    const outOfDone = makeService({
      task: {
        findFirst: vi.fn(async () =>
          row({ id: 't1', status: 'done', completedAt: new Date('2026-01-01T00:00:00.000Z') }),
        ),
      },
    })
    await outOfDone.svc.update('school-A', 't1', { status: 'open' }, 'user-1')
    expect(outOfDone.task.update.mock.calls[0][0].data.completedAt).toBeNull()
  })

  it('update merge-pick: explicit null clears, omitted keeps', async () => {
    const { svc, task } = makeService({
      task: {
        findFirst: vi.fn(async () => row({ id: 't1', description: 'keep', sourceRef: 'ref' })),
      },
    })
    await svc.update('school-A', 't1', { description: null }, 'user-1')
    const data = task.update.mock.calls[0][0].data
    expect(data.description).toBeNull() // cleared
    expect(data.sourceRef).toBe('ref') // untouched
  })

  it('complete: foreign id → NotFoundException, never updates', async () => {
    const { svc, task } = makeService({ task: { findFirst: vi.fn(async () => null) } })
    await expect(svc.complete('school-B', 'task-of-A', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(task.update).not.toHaveBeenCalled()
  })

  it('complete: sets status=done + completedAt', async () => {
    const { svc, task } = makeService({
      task: { findFirst: vi.fn(async () => row({ id: 't1' })) },
    })
    await svc.complete('school-A', 't1', 'user-1')
    const data = task.update.mock.calls[0][0].data
    expect(data.status).toBe('done')
    expect(data.completedAt).toBeInstanceOf(Date)
  })

  it('remove: foreign id → NotFoundException, never deletes', async () => {
    const { svc, task } = makeService({ task: { findFirst: vi.fn(async () => null) } })
    await expect(svc.remove('school-B', 'task-of-A', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(task.delete).not.toHaveBeenCalled()
  })

  it('listOpenForBriefing filters to open/in_progress and computes urgency', async () => {
    const NOW = new Date('2026-07-01T12:00:00.000Z')
    const { svc, task } = makeService({
      task: {
        findMany: vi.fn(async () => [
          row({ id: 'o', dueDate: new Date('2026-06-01T00:00:00.000Z') }),
        ]),
      },
    })
    const res = await svc.listOpenForBriefing('school-A', NOW)
    expect(task.findMany).toHaveBeenCalledWith({
      where: { schoolId: 'school-A', status: { in: ['open', 'in_progress'] } },
    })
    expect(res[0].urgency).toBe('overdue')
  })
})

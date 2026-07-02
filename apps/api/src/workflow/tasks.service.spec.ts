import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { TasksService } from './tasks.service.js'

/** A minimal User-shaped caller for decide() (only .id is read by the service). */
function user(id: string) {
  return { id, firstName: null, lastName: null, email: `${id}@x.test` } as never
}

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
    approverUserId: null,
    approver: null,
    approvalStatus: 'none',
    decidedByUserId: null,
    decidedByUser: null,
    decidedAt: null,
    decisionNote: null,
    // Phase 3 Workflow depth defaults — recurrence 'none' → spawn helper early-
    // returns; approvalSteps null → decide() takes the LEGACY single-approver path.
    recurrence: 'none',
    recurrenceUntil: null,
    seriesId: null,
    approvalSteps: null,
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
      include: { assignee: true, approver: true, decidedByUser: true },
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

  // ── Phase 3 v1 approval / sign-off state machine ──────────────────────────────
  describe('submitForApproval', () => {
    it('from "none" → pending + approver set; status untouched; decision fields cleared', async () => {
      const { svc, task, membership, audit } = makeService({
        task: { findFirst: vi.fn(async () => row({ id: 't1', status: 'open', approvalStatus: 'none' })) },
        membership: { findFirst: vi.fn(async () => ({ id: 'm1' })) },
      })
      await svc.submitForApproval('school-A', 't1', 'approver-1', 'user-1')
      const data = task.update.mock.calls[0][0].data
      expect(data.approvalStatus).toBe('pending')
      expect(data.approverUserId).toBe('approver-1')
      expect(data.status).toBeUndefined() // status is NOT changed on submit
      expect(data.decidedByUserId).toBeNull()
      expect(data.decidedAt).toBeNull()
      expect(data.decisionNote).toBeNull()
      expect(membership.findFirst).toHaveBeenCalledWith({
        where: { schoolId: 'school-A', userId: 'approver-1', status: 'active' },
      })
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'task.approval_requested' }),
      )
    })

    it('from "rejected" (rework) → pending again (resubmit is legal)', async () => {
      const { svc, task } = makeService({
        task: {
          findFirst: vi.fn(async () =>
            row({ id: 't1', status: 'in_progress', approvalStatus: 'rejected', decidedByUserId: 'x' }),
          ),
        },
        membership: { findFirst: vi.fn(async () => ({ id: 'm1' })) },
      })
      await svc.submitForApproval('school-A', 't1', 'approver-1', 'user-1')
      expect(task.update.mock.calls[0][0].data.approvalStatus).toBe('pending')
    })

    it('when already "pending" → 400 (no double-submit)', async () => {
      const { svc, task } = makeService({
        task: { findFirst: vi.fn(async () => row({ id: 't1', approvalStatus: 'pending' })) },
        membership: { findFirst: vi.fn(async () => ({ id: 'm1' })) },
      })
      await expect(
        svc.submitForApproval('school-A', 't1', 'approver-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(task.update).not.toHaveBeenCalled()
    })

    it('when "approved" → 400', async () => {
      const { svc } = makeService({
        task: { findFirst: vi.fn(async () => row({ id: 't1', approvalStatus: 'approved' })) },
        membership: { findFirst: vi.fn(async () => ({ id: 'm1' })) },
      })
      await expect(
        svc.submitForApproval('school-A', 't1', 'approver-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('on a done/cancelled task → 400', async () => {
      for (const status of ['done', 'cancelled']) {
        const { svc, task } = makeService({
          task: { findFirst: vi.fn(async () => row({ id: 't1', status, approvalStatus: 'none' })) },
          membership: { findFirst: vi.fn(async () => ({ id: 'm1' })) },
        })
        await expect(
          svc.submitForApproval('school-A', 't1', 'approver-1', 'user-1'),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(task.update).not.toHaveBeenCalled()
      }
    })

    it('approver that is NOT an active member → 400 (reuses the membership guard)', async () => {
      const { svc, task } = makeService({
        task: { findFirst: vi.fn(async () => row({ id: 't1', approvalStatus: 'none' })) },
        membership: { findFirst: vi.fn(async () => null) }, // not a member (or cross-tenant)
      })
      await expect(
        svc.submitForApproval('school-A', 't1', 'outsider', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(task.update).not.toHaveBeenCalled()
    })

    it('cross-tenant taskId → 404, never loads/mutates the foreign row', async () => {
      const { svc, task } = makeService({ task: { findFirst: vi.fn(async () => null) } })
      await expect(
        svc.submitForApproval('school-B', 'task-of-A', 'approver-1', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(task.update).not.toHaveBeenCalled()
    })
  })

  describe('decide', () => {
    it('approve from "pending" (BY THE APPROVER) → approved + status done + completedAt + decidedBy/at/note', async () => {
      const { svc, task, audit } = makeService({
        task: {
          findFirst: vi.fn(async () =>
            row({ id: 't1', approvalStatus: 'pending', approverUserId: 'approver-1' }),
          ),
        },
      })
      await svc.decide('school-A', 't1', 'approve', 'looks good', user('approver-1'))
      const data = task.update.mock.calls[0][0].data
      expect(data.approvalStatus).toBe('approved')
      expect(data.status).toBe('done')
      expect(data.completedAt).toBeInstanceOf(Date)
      expect(data.decidedByUserId).toBe('approver-1')
      expect(data.decidedAt).toBeInstanceOf(Date) // stamped server-side, not client
      expect(data.decisionNote).toBe('looks good')
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'task.approved' }),
      )
    })

    it('reject from "pending" → rejected + status in_progress + completedAt null', async () => {
      const { svc, task, audit } = makeService({
        task: {
          findFirst: vi.fn(async () =>
            row({
              id: 't1',
              status: 'done',
              completedAt: new Date('2026-01-01T00:00:00.000Z'),
              approvalStatus: 'pending',
              approverUserId: 'approver-1',
            }),
          ),
        },
      })
      await svc.decide('school-A', 't1', 'reject', null, user('approver-1'))
      const data = task.update.mock.calls[0][0].data
      expect(data.approvalStatus).toBe('rejected')
      expect(data.status).toBe('in_progress')
      expect(data.completedAt).toBeNull() // un-completes a previously-done task
      expect(data.decisionNote).toBeNull()
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'task.rejected' }),
      )
    })

    it('SECURITY: a VIEWER who IS the approver can decide (route allows viewer; service identity passes)', async () => {
      // The service does not consult role — only caller.id === approverUserId. A viewer
      // whose id matches the approver passes the identity gate.
      const { svc, task } = makeService({
        task: {
          findFirst: vi.fn(async () =>
            row({ id: 't1', approvalStatus: 'pending', approverUserId: 'board-chair' }),
          ),
        },
      })
      await svc.decide('school-A', 't1', 'approve', null, user('board-chair'))
      expect(task.update).toHaveBeenCalled()
    })

    it('SECURITY: a NON-approver (even an owner) on a PENDING task → 403, no mutation', async () => {
      const { svc, task } = makeService({
        task: {
          findFirst: vi.fn(async () =>
            row({ id: 't1', approvalStatus: 'pending', approverUserId: 'approver-1' }),
          ),
        },
      })
      await expect(
        svc.decide('school-A', 't1', 'approve', null, user('some-other-owner')),
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(task.update).not.toHaveBeenCalled()
    })

    it('decide when approvalStatus "none" → 400 (decide-without-pending)', async () => {
      const { svc } = makeService({
        task: { findFirst: vi.fn(async () => row({ id: 't1', approvalStatus: 'none' })) },
      })
      await expect(
        svc.decide('school-A', 't1', 'approve', null, user('anyone')),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('double-decide: deciding an already-"approved" task → 400', async () => {
      const { svc } = makeService({
        task: {
          findFirst: vi.fn(async () =>
            row({ id: 't1', approvalStatus: 'approved', approverUserId: 'approver-1' }),
          ),
        },
      })
      await expect(
        svc.decide('school-A', 't1', 'reject', null, user('approver-1')),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('ORDER: pending-guard precedes identity-guard — a non-approver on a NON-pending task gets 400, not 403', async () => {
      const { svc } = makeService({
        task: {
          findFirst: vi.fn(async () =>
            row({ id: 't1', approvalStatus: 'approved', approverUserId: 'approver-1' }),
          ),
        },
      })
      // A random owner poking a non-pending task must get the plain 400 (no approver leak).
      await expect(
        svc.decide('school-A', 't1', 'approve', null, user('random-owner')),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('cross-tenant taskId → 404 for decide, never mutates', async () => {
      const { svc, task } = makeService({ task: { findFirst: vi.fn(async () => null) } })
      await expect(
        svc.decide('school-B', 'task-of-A', 'approve', null, user('approver-1')),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(task.update).not.toHaveBeenCalled()
    })
  })

  // ── Phase 3 Workflow depth — recurring-task spawn-on-transition-to-done ────────
  describe('recurrence spawn', () => {
    const NOW_ISH = () => new Date()

    it('complete: a recurring task spawns exactly ONE next occurrence (fresh open, series seeded)', async () => {
      const { svc, task, audit } = makeService({
        task: {
          findFirst: vi.fn(async () =>
            row({
              id: 't1',
              status: 'open',
              recurrence: 'monthly',
              dueDate: new Date('2026-01-15T00:00:00.000Z'),
            }),
          ),
        },
      })
      await svc.complete('school-A', 't1', 'user-1')
      // update(→done) + create(next occurrence) each once.
      expect(task.update).toHaveBeenCalledTimes(1)
      expect(task.create).toHaveBeenCalledTimes(1)
      const spawned = task.create.mock.calls[0][0].data
      expect(spawned.status).toBe('open')
      expect(spawned.recurrence).toBe('monthly')
      expect(spawned.seriesId).toBe('t1') // first completion seeds the series with the origin id
      expect(toIso(spawned.dueDate)).toBe('2026-02-15') // month-end-safe +1mo
      // A fresh occurrence carries NO approval pointer.
      expect(spawned.approvalStatus).toBeUndefined()
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'task.recurrence_spawned' }),
      )
    })

    it('re-completing an ALREADY-done task NEVER re-spawns (idempotent transition guard)', async () => {
      const { svc, task } = makeService({
        task: {
          findFirst: vi.fn(async () =>
            row({ id: 't1', status: 'done', recurrence: 'monthly', dueDate: new Date('2026-01-15T00:00:00.000Z') }),
          ),
        },
      })
      await svc.complete('school-A', 't1', 'user-1')
      expect(task.create).not.toHaveBeenCalled() // wasDone → no spawn
    })

    it("a 'none' (one-off) task never spawns on completion", async () => {
      const { svc, task } = makeService({
        task: { findFirst: vi.fn(async () => row({ id: 't1', status: 'open', recurrence: 'none' })) },
      })
      await svc.complete('school-A', 't1', 'user-1')
      expect(task.create).not.toHaveBeenCalled()
    })

    it('recurrenceUntil bound: does NOT spawn past the end date', async () => {
      const { svc, task } = makeService({
        task: {
          findFirst: vi.fn(async () =>
            row({
              id: 't1',
              status: 'open',
              recurrence: 'monthly',
              dueDate: new Date('2026-01-15T00:00:00.000Z'),
              recurrenceUntil: new Date('2026-01-31T00:00:00.000Z'), // next (Feb-15) is past this
            }),
          ),
        },
      })
      await svc.complete('school-A', 't1', 'user-1')
      expect(task.create).not.toHaveBeenCalled()
    })

    it('a spawned occurrence inherits the EXISTING seriesId (not the id) after the first cycle', async () => {
      const { svc, task } = makeService({
        task: {
          findFirst: vi.fn(async () =>
            row({
              id: 't2',
              seriesId: 'origin-1',
              status: 'open',
              recurrence: 'weekly',
              dueDate: new Date('2026-03-02T00:00:00.000Z'),
            }),
          ),
        },
      })
      await svc.complete('school-A', 't2', 'user-1')
      const spawned = task.create.mock.calls[0][0].data
      expect(spawned.seriesId).toBe('origin-1')
      expect(toIso(spawned.dueDate)).toBe('2026-03-09') // +7 days
    })

    it('completing via update(status:done) also advances a recurring series', async () => {
      const { svc, task } = makeService({
        task: {
          findFirst: vi.fn(async () =>
            row({ id: 't1', status: 'open', recurrence: 'quarterly', dueDate: new Date('2026-01-15T00:00:00.000Z') }),
          ),
        },
      })
      await svc.update('school-A', 't1', { status: 'done' }, 'user-1')
      expect(task.create).toHaveBeenCalledTimes(1)
      expect(toIso(task.create.mock.calls[0][0].data.dueDate)).toBe('2026-04-15')
    })

    void NOW_ISH
  })

  // ── Phase 3 Workflow depth — multi-step sequential approval chains ─────────────
  describe('approval chains', () => {
    function chainRow(over = {}) {
      const steps = [
        { order: 1, approverUserId: 'a1', status: 'pending', decidedByUserId: null, decidedAt: null, decisionNote: null },
        { order: 2, approverUserId: 'a2', status: 'pending', decidedByUserId: null, decidedAt: null, decisionNote: null },
      ]
      return row({
        id: 't1',
        status: 'in_progress',
        approvalStatus: 'pending',
        approverUserId: 'a1', // pointer = step 1
        approvalSteps: steps,
        ...over,
      })
    }

    it('submitForApproval with an ORDERED list builds an all-pending chain + pointer at step 1', async () => {
      const { svc, task } = makeService({
        task: { findFirst: vi.fn(async () => row({ id: 't1', status: 'open', approvalStatus: 'none' })) },
        membership: { findFirst: vi.fn(async () => ({ id: 'm1' })) },
      })
      await svc.submitForApproval('school-A', 't1', ['a1', 'a2', 'a3'], 'user-1')
      const data = task.update.mock.calls[0][0].data
      expect(data.approverUserId).toBe('a1') // pointer = first step
      expect(data.approvalStatus).toBe('pending')
      expect(steps(data)).toHaveLength(3)
      expect(steps(data).map((s) => s.status)).toEqual(['pending', 'pending', 'pending'])
      expect(steps(data).map((s) => s.order)).toEqual([1, 2, 3])
    })

    it('validates EVERY approver as an active member (any non-member → 400, no write)', async () => {
      const membershipFindFirst = vi
        .fn()
        .mockResolvedValueOnce({ id: 'm1' }) // a1 ok
        .mockResolvedValueOnce(null) // a2 not a member
      const { svc, task } = makeService({
        task: { findFirst: vi.fn(async () => row({ id: 't1', status: 'open', approvalStatus: 'none' })) },
        membership: { findFirst: membershipFindFirst },
      })
      await expect(
        svc.submitForApproval('school-A', 't1', ['a1', 'a2'], 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(task.update).not.toHaveBeenCalled()
    })

    it('APPROVE step 1 advances the pointer to step 2; task stays live (not done)', async () => {
      const { svc, task } = makeService({ task: { findFirst: vi.fn(async () => chainRow()) } })
      await svc.decide('school-A', 't1', 'approve', 'ok', user('a1'))
      const data = task.update.mock.calls[0][0].data
      expect(data.approvalStatus).toBe('pending') // chain still active
      expect(data.approverUserId).toBe('a2') // advanced exactly one step
      expect(data.status).toBeUndefined() // NOT completed mid-chain
      expect(steps(data)[0].status).toBe('approved')
      expect(steps(data)[0].decidedByUserId).toBe('a1')
      expect(steps(data)[1].status).toBe('pending')
    })

    it('FINAL approve (last step) completes the task → done + approved', async () => {
      const lastStep = chainRow({
        approverUserId: 'a2',
        approvalSteps: [
          { order: 1, approverUserId: 'a1', status: 'approved', decidedByUserId: 'a1', decidedAt: 'x', decisionNote: null },
          { order: 2, approverUserId: 'a2', status: 'pending', decidedByUserId: null, decidedAt: null, decisionNote: null },
        ],
      })
      const { svc, task } = makeService({ task: { findFirst: vi.fn(async () => lastStep) } })
      await svc.decide('school-A', 't1', 'approve', null, user('a2'))
      const data = task.update.mock.calls[0][0].data
      expect(data.approvalStatus).toBe('approved')
      expect(data.status).toBe('done')
      expect(data.completedAt).toBeInstanceOf(Date)
      expect(steps(data)[1].status).toBe('approved')
    })

    it('REJECT stops the chain → in_progress + rejected; later steps untouched', async () => {
      const { svc, task } = makeService({ task: { findFirst: vi.fn(async () => chainRow()) } })
      await svc.decide('school-A', 't1', 'reject', 'redo', user('a1'))
      const data = task.update.mock.calls[0][0].data
      expect(data.approvalStatus).toBe('rejected')
      expect(data.status).toBe('in_progress')
      expect(steps(data)[0].status).toBe('rejected')
      expect(steps(data)[1].status).toBe('pending') // not skipped/replayed
    })

    it('a NON-current-step approver cannot decide (identity gate on the pointer) → 403', async () => {
      const { svc, task } = makeService({ task: { findFirst: vi.fn(async () => chainRow()) } })
      // a2 is the SECOND approver but the pointer is at a1 → 403.
      await expect(svc.decide('school-A', 't1', 'approve', null, user('a2'))).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      expect(task.update).not.toHaveBeenCalled()
    })

    it('a decided (rejected) chain 400s further decides via the pending-guard', async () => {
      const rejected = chainRow({
        approvalStatus: 'rejected',
        approvalSteps: [
          { order: 1, approverUserId: 'a1', status: 'rejected', decidedByUserId: 'a1', decidedAt: 'x', decisionNote: null },
          { order: 2, approverUserId: 'a2', status: 'pending', decidedByUserId: null, decidedAt: null, decisionNote: null },
        ],
      })
      const { svc } = makeService({ task: { findFirst: vi.fn(async () => rejected) } })
      await expect(svc.decide('school-A', 't1', 'approve', null, user('a1'))).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('a recurring multi-step task spawns the next occurrence on FINAL approve', async () => {
      const lastStep = chainRow({
        approverUserId: 'a2',
        recurrence: 'monthly',
        dueDate: new Date('2026-05-31T00:00:00.000Z'),
        approvalSteps: [
          { order: 1, approverUserId: 'a1', status: 'approved', decidedByUserId: 'a1', decidedAt: 'x', decisionNote: null },
          { order: 2, approverUserId: 'a2', status: 'pending', decidedByUserId: null, decidedAt: null, decisionNote: null },
        ],
      })
      const { svc, task } = makeService({ task: { findFirst: vi.fn(async () => lastStep) } })
      await svc.decide('school-A', 't1', 'approve', null, user('a2'))
      expect(task.create).toHaveBeenCalledTimes(1)
      expect(toIso(task.create.mock.calls[0][0].data.dueDate)).toBe('2026-06-30') // month-end-safe
    })
  })
})

/** Read a spawned @db.Date back to yyyy-mm-dd (mirrors the service's toIsoDate). */
function toIso(d: unknown): string {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d)
}

/** Narrow the mock update `data.approvalSteps` (typed as unknown in the spec). */
type Step = { order: number; approverUserId: string; status: string; decidedByUserId: string | null }
function steps(data: Record<string, unknown>): Step[] {
  return data.approvalSteps as Step[]
}

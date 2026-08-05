// ─────────────────────────────────────────────────────────────────────────────
// THE CALL SITES, not the notifier. notifications.spec.ts proves the service is
// restrained; these prove TasksService asks it at the right moments — which is
// where the real defect lives, because `update` did not previously compare the
// assignee at all, so "notify on update" would have fired on every typo fix.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi } from 'vitest'
import { TasksService } from './tasks.service.js'

const MEMBER = { id: 'm1', userId: 'u2', schoolId: 's1', status: 'active' }

function harness(existing?: Record<string, unknown>) {
  const notifyAssignment = vi.fn(async (_arg: Record<string, unknown>) => undefined)
  const notify = vi.fn(async (_arg: Record<string, unknown>) => undefined)
  const row = {
    id: 't1',
    schoolId: 's1',
    title: 'Close the books',
    assigneeUserId: 'u2',
    dueDate: new Date('2026-11-01T00:00:00.000Z'),
    status: 'open',
    priority: 'normal',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    completedAt: null,
    approvalStatus: 'none',
    approvalSteps: null,
    approverUserId: null,
    createdByUserId: 'u1',
    assignee: null,
    approver: null,
  }
  const prisma = {
    task: {
      create: vi.fn(async () => row),
      findFirst: vi.fn(async () => existing ?? { ...row, assigneeUserId: 'u2' }),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        ...row,
        ...args.data,
      })),
    },
    membership: { findFirst: vi.fn(async () => MEMBER) },
  }
  const svc = new TasksService(
    prisma as never,
    { write: vi.fn(async () => undefined) } as never,
    { notify, notifyAssignment } as never,
  )
  return { svc, notifyAssignment, notify, prisma }
}

describe('creating a task tells the person it lands on', () => {
  it('notifies the assignee, with the due date and a link back to the task', async () => {
    const h = harness()
    await h.svc.create('s1', { title: 'Close the books', assigneeUserId: 'u2' } as never, 'u1')
    expect(h.notifyAssignment).toHaveBeenCalledTimes(1)
    expect(h.notifyAssignment.mock.calls[0][0]).toMatchObject({
      userId: 'u2',
      actorUserId: 'u1',
      what: 'task',
      title: 'Close the books',
      link: '/tasks?task=t1',
    })
  })

  it('an unassigned task notifies nobody', async () => {
    const h = harness()
    h.prisma.task.create = vi.fn(async () => ({
      id: 't1',
      schoolId: 's1',
      title: 'Close the books',
      assigneeUserId: null,
      dueDate: null,
      status: 'open',
      priority: 'normal',
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      approvalStatus: 'none',
      approvalSteps: null,
      approverUserId: null,
      createdByUserId: 'u1',
      assignee: null,
      approver: null,
    })) as never
    await h.svc.create('s1', { title: 'Close the books' } as never, 'u1')
    // The service still calls through; the notifier is what refuses a null target,
    // and it is pinned to do so. What matters here is that no OTHER person is told.
    const arg = h.notifyAssignment.mock.calls[0]?.[0] as { userId: string | null } | undefined
    expect(arg?.userId ?? null).toBeNull()
  })
})

describe('editing a task notifies ONLY when it changes hands', () => {
  it('an edit that does not move the assignee is silent', async () => {
    // The whole difference between a useful inbox and one people mute.
    const h = harness({
      id: 't1',
      schoolId: 's1',
      title: 'Close the books',
      assigneeUserId: 'u2',
      dueDate: null,
      status: 'open',
      priority: 'normal',
      completedAt: null,
      approvalStatus: 'none',
      approvalSteps: null,
      approverUserId: null,
      createdByUserId: 'u1',
      sourceType: null,
      sourceRef: null,
      description: null,
      recurrence: null,
      recurrenceUntil: null,
    })
    await h.svc.update('s1', 't1', { title: 'Close the books (Q1)' } as never, 'u1')
    expect(h.notifyAssignment).not.toHaveBeenCalled()
  })

  it('a reassignment DOES notify the new owner', async () => {
    const h = harness({
      id: 't1',
      schoolId: 's1',
      title: 'Close the books',
      assigneeUserId: 'u9',
      dueDate: null,
      status: 'open',
      priority: 'normal',
      completedAt: null,
      approvalStatus: 'none',
      approvalSteps: null,
      approverUserId: null,
      createdByUserId: 'u1',
      sourceType: null,
      sourceRef: null,
      description: null,
      recurrence: null,
      recurrenceUntil: null,
    })
    await h.svc.update('s1', 't1', { assigneeUserId: 'u2' } as never, 'u1')
    expect(h.notifyAssignment).toHaveBeenCalledTimes(1)
    expect(h.notifyAssignment.mock.calls[0][0]).toMatchObject({ userId: 'u2', what: 'task' })
  })
})

describe('the approval chain asks one person at a time', () => {
  const BASE = {
    id: 't1',
    schoolId: 's1',
    title: 'Close the books',
    assigneeUserId: 'u2',
    dueDate: null,
    status: 'open',
    priority: 'normal',
    completedAt: null,
    approvalStatus: 'none',
    approvalSteps: null,
    approverUserId: null,
    createdByUserId: 'u1',
    sourceType: null,
    sourceRef: null,
    description: null,
    recurrence: null,
    recurrenceUntil: null,
  }

  it('submitting notifies the FIRST approver only — nobody is asked out of turn', async () => {
    const h = harness(BASE)
    await h.svc.submitForApproval('s1', 't1', ['a1', 'a2', 'a3'], 'u1')
    expect(h.notifyAssignment).toHaveBeenCalledTimes(1)
    expect(h.notifyAssignment.mock.calls[0][0]).toMatchObject({
      userId: 'a1',
      what: 'sign-off request',
    })
  })

  it('a decision closes the loop on the submitter', async () => {
    const h = harness({ ...BASE, approvalStatus: 'pending', approverUserId: 'a1' })
    await h.svc.decide('s1', 't1', 'approve', 'Looks right', { id: 'a1' } as never)
    expect(h.notify).toHaveBeenCalledTimes(1)
    expect(h.notify.mock.calls[0][0]).toMatchObject({
      userId: 'u2',
      actorUserId: 'a1',
      subject: 'Approved: Close the books',
    })
  })

  it('a rejection says so plainly, and carries the note', async () => {
    const h = harness({ ...BASE, approvalStatus: 'pending', approverUserId: 'a1' })
    await h.svc.decide('s1', 't1', 'reject', 'Missing the reconciliation', { id: 'a1' } as never)
    const arg = h.notify.mock.calls[0][0] as { subject: string; body: string }
    expect(arg.subject).toBe('Sent back for rework: Close the books')
    expect(arg.body).toContain('Missing the reconciliation')
  })
})

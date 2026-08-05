// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNMENT STOPS BEING SILENT. Every assignment in the product — a task, an
// approval, an improvement initiative, a strategic goal — ended at audit.write(),
// a table the assignee cannot read. Nothing anywhere could say "given a userId,
// tell that person", so the only way to learn you owned something was to notice.
//
// What these pin is mostly RESTRAINT, because a notifier is one careless call
// site away from being noise nobody opens: never for your own action, never for
// an edit that did not change hands, and never at the cost of the write itself.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi } from 'vitest'
import { NotificationsService } from './notifications.service.js'

function harness(opts: { mailerThrows?: boolean; user?: Record<string, unknown> | null } = {}) {
  const created: Record<string, unknown>[] = []
  const prisma = {
    user: {
      findUnique: vi.fn(async () =>
        opts.user === undefined
          ? { id: 'u2', email: 'sam@x.edu', firstName: 'Sam', lastName: 'Lee' }
          : opts.user,
      ),
    },
    school: { findUnique: vi.fn(async () => ({ name: 'Sample High School' })) },
    message: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args.data)
        return { id: 'm1' }
      }),
    },
  }
  const sendAlert = vi.fn(async () => {
    if (opts.mailerThrows) throw new Error('smtp down')
  })
  const svc = new NotificationsService(prisma as never, { sendAlert } as never)
  return { svc, created, sendAlert, prisma }
}

describe('a notification reaches both channels', () => {
  it('writes the inbox row AND sends the email', async () => {
    const h = harness()
    await h.svc.notify({ userId: 'u2', subject: 'Hi', body: 'There', link: '/tasks?task=t1' })
    expect(h.created[0]).toMatchObject({
      userId: 'u2',
      subject: 'Hi',
      body: 'There',
      link: '/tasks?task=t1',
    })
    expect(h.sendAlert).toHaveBeenCalledWith('sam@x.edu', 'Hi', 'There')
  })

  it('the inbox row is written FIRST — a dead mail server still leaves a record', async () => {
    const h = harness({ mailerThrows: true })
    await h.svc.notify({ userId: 'u2', subject: 'Hi', body: 'There' })
    expect(h.created).toHaveLength(1)
  })

  it('a mailer throw never escapes — the assignment that caused it must still commit', async () => {
    const h = harness({ mailerThrows: true })
    await expect(
      h.svc.notify({ userId: 'u2', subject: 'Hi', body: 'There' }),
    ).resolves.toBeUndefined()
  })

  it('a vanished user is a no-op, not a crash inside someone else’s transaction', async () => {
    const h = harness({ user: null })
    await h.svc.notify({ userId: 'ghost', subject: 'Hi', body: 'There' })
    expect(h.created).toHaveLength(0)
    expect(h.sendAlert).not.toHaveBeenCalled()
  })

  it('email:false keeps it in-app only', async () => {
    const h = harness()
    await h.svc.notify({ userId: 'u2', subject: 'Hi', body: 'There', email: false })
    expect(h.created).toHaveLength(1)
    expect(h.sendAlert).not.toHaveBeenCalled()
  })
})

describe('nobody is told what they just did themselves', () => {
  it('self-assignment sends nothing at all', async () => {
    // The most common assignment in the product is an owner assigning work to
    // themselves. A notice for it is pure noise, and noise is what teaches
    // people to stop opening the inbox.
    const h = harness()
    await h.svc.notify({ userId: 'u1', actorUserId: 'u1', subject: 'Hi', body: 'There' })
    expect(h.created).toHaveLength(0)
    expect(h.sendAlert).not.toHaveBeenCalled()
  })

  it('…and the assignment composer refuses it too, before any query runs', async () => {
    const h = harness()
    await h.svc.notifyAssignment({
      userId: 'u1',
      actorUserId: 'u1',
      schoolId: 's1',
      what: 'task',
      title: 'Close the books',
    })
    expect(h.created).toHaveLength(0)
    expect(h.prisma.school.findUnique).not.toHaveBeenCalled()
  })
})

describe('the assignment sentence names the person, the thing, and the school', () => {
  it('reads as one sentence a human wrote, with a due date when there is one', async () => {
    const h = harness()
    await h.svc.notifyAssignment({
      userId: 'u2',
      actorUserId: 'u1',
      schoolId: 's1',
      what: 'improvement initiative',
      title: 'Raise COG-2.3',
      dueDate: new Date('2026-11-01T00:00:00.000Z'),
      link: '/improvement',
    })
    const row = h.created[0] as { subject: string; body: string; link: string }
    expect(row.subject).toBe("You've been assigned: Raise COG-2.3")
    expect(row.body).toContain('Sam Lee assigned you the improvement initiative "Raise COG-2.3"')
    expect(row.body).toContain('at Sample High School')
    expect(row.body).toContain('Due 2026-11-01')
    expect(row.link).toBe('/improvement')
  })

  it('no due date → no invented deadline line', async () => {
    const h = harness()
    await h.svc.notifyAssignment({
      userId: 'u2',
      actorUserId: 'u1',
      schoolId: 's1',
      what: 'task',
      title: 'Close the books',
    })
    expect((h.created[0] as { body: string }).body).not.toMatch(/Due/)
  })

  it('a null assignee is nothing to notify, not a message to nobody', async () => {
    const h = harness()
    await h.svc.notifyAssignment({ userId: null, what: 'task', title: 'Close the books' })
    expect(h.created).toHaveLength(0)
  })
})

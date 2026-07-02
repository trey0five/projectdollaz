import { describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { MeetingsService } from './meetings.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// MeetingsService — TENANT ISOLATION, forged committeeId same-school validation,
// minutes-approval stamping, computed signal enrichment + summary. Prisma + Audit
// are hand-mocked (no DB, no Nest boot).
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-06-30T12:00:00.000Z')

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    schoolId: 'school-A',
    committeeId: null,
    title: 'Q3 Board Meeting',
    scheduledAt: new Date('2026-07-05T00:00:00.000Z'),
    location: null,
    status: 'scheduled',
    agenda: null,
    minutes: null,
    decisions: null,
    minutesStatus: 'none',
    minutesApprovedAt: null,
    minutesApprovedByUserId: null,
    updatedByUserId: null,
    committee: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...over,
  }
}

function makeService(prismaOver: {
  meeting?: Record<string, unknown>
  committee?: Record<string, unknown>
} = {}) {
  const meeting = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => row(data)),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => row(data)),
    delete: vi.fn(async () => row()),
    ...prismaOver.meeting,
  }
  const committee = {
    findFirst: vi.fn(async () => null),
    ...prismaOver.committee,
  }
  const prisma = { meeting, committee }
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new MeetingsService(prisma as never, audit as never)
  return { svc, meeting, committee, audit }
}

describe('MeetingsService', () => {
  it('listMeetings filters by schoolId, enriches signal + summary', async () => {
    const { svc, meeting } = makeService({
      meeting: {
        findMany: vi.fn(async () => [
          row({ id: 'm1', status: 'scheduled', scheduledAt: new Date('2026-07-05T00:00:00.000Z'), agenda: null }),
          row({ id: 'm2', status: 'held', scheduledAt: new Date('2026-06-01T00:00:00.000Z'), minutesStatus: 'pending_approval' }),
        ]),
      },
    })
    const res = await svc.listMeetings('school-A', NOW)
    expect(meeting.findMany).toHaveBeenCalledWith({
      where: { schoolId: 'school-A' },
      include: { committee: { select: { name: true } } },
    })
    // m1 is upcoming with a blank agenda within the window → agendaMissing.
    const m1 = res.meetings.find((m) => m.id === 'm1')!
    expect(m1.isUpcoming).toBe(true)
    expect(m1.agendaMissing).toBe(true)
    // m2 held + pending, > SLA ago → overdue.
    const m2 = res.meetings.find((m) => m.id === 'm2')!
    expect(m2.minutesPending).toBe(true)
    expect(m2.minutesOverdue).toBe(true)
    expect(res.summary.minutesPendingCount).toBe(1)
    expect(res.summary.minutesOverdueCount).toBe(1)
    expect(res.summary.agendaMissingSoonCount).toBe(1)
    expect(res.summary.nextMeetingAt).toBe('2026-07-05')
  })

  it('create: a forged/foreign committeeId → 404, never creates', async () => {
    const { svc, meeting, committee } = makeService({
      committee: { findFirst: vi.fn(async () => null) }, // foreign committee not in school
    })
    await expect(
      svc.create('school-A', { title: 'T', scheduledAt: '2026-07-05', committeeId: 'committee-of-B' }, 'user-1', NOW),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(committee.findFirst).toHaveBeenCalledWith({ where: { id: 'committee-of-B', schoolId: 'school-A' } })
    expect(meeting.create).not.toHaveBeenCalled()
  })

  it('create: same-school committeeId passes validation and creates', async () => {
    const { svc, meeting, committee } = makeService({
      committee: { findFirst: vi.fn(async () => ({ id: 'c1', schoolId: 'school-A' })) },
    })
    await svc.create('school-A', { title: 'T', scheduledAt: '2026-07-05', committeeId: 'c1' }, 'user-1', NOW)
    expect(committee.findFirst).toHaveBeenCalled()
    expect(meeting.create).toHaveBeenCalled()
    expect(meeting.create.mock.calls[0][0].data.committeeId).toBe('c1')
  })

  it('create with minutesStatus approved stamps approver + date', async () => {
    const { svc, meeting } = makeService()
    await svc.create('school-A', { title: 'T', scheduledAt: '2026-06-01', minutesStatus: 'approved' }, 'user-9', NOW)
    const data = meeting.create.mock.calls[0][0].data
    expect(data.minutesStatus).toBe('approved')
    expect(data.minutesApprovedByUserId).toBe('user-9')
    expect((data.minutesApprovedAt as Date).toISOString().slice(0, 10)).toBe('2026-06-30')
  })

  it('update: a meetingId owned by ANOTHER school → 404, never mutates', async () => {
    const { svc, meeting } = makeService({ meeting: { findFirst: vi.fn(async () => null) } })
    await expect(
      svc.update('school-B', 'meeting-of-A', { title: 'hijack' }, 'user-1', NOW),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(meeting.update).not.toHaveBeenCalled()
  })

  it('update: re-parenting to a foreign committeeId → 404', async () => {
    const { svc, committee } = makeService({
      meeting: { findFirst: vi.fn(async () => row({ id: 'm1' })) },
      committee: { findFirst: vi.fn(async () => null) },
    })
    await expect(
      svc.update('school-A', 'm1', { committeeId: 'committee-of-B' }, 'user-1', NOW),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(committee.findFirst).toHaveBeenCalledWith({ where: { id: 'committee-of-B', schoolId: 'school-A' } })
  })

  it('update: minutesStatus → approved stamps approver + date once', async () => {
    const { svc, meeting } = makeService({
      meeting: { findFirst: vi.fn(async () => row({ id: 'm1', status: 'held', minutesStatus: 'pending_approval' })) },
    })
    await svc.update('school-A', 'm1', { minutesStatus: 'approved' }, 'user-7', NOW)
    const data = meeting.update.mock.calls[0][0].data
    expect(data.minutesStatus).toBe('approved')
    expect(data.minutesApprovedByUserId).toBe('user-7')
    expect((data.minutesApprovedAt as Date).toISOString().slice(0, 10)).toBe('2026-06-30')
  })

  it('update: moving away from approved clears approver + date', async () => {
    const { svc, meeting } = makeService({
      meeting: {
        findFirst: vi.fn(async () =>
          row({ id: 'm1', minutesStatus: 'approved', minutesApprovedByUserId: 'user-1', minutesApprovedAt: new Date('2026-06-01T00:00:00.000Z') }),
        ),
      },
    })
    await svc.update('school-A', 'm1', { minutesStatus: 'draft' }, 'user-2', NOW)
    const data = meeting.update.mock.calls[0][0].data
    expect(data.minutesApprovedAt).toBeNull()
    expect(data.minutesApprovedByUserId).toBeNull()
  })

  it('approveMinutes: foreign id → 404; same-school stamps approval', async () => {
    const foreign = makeService({ meeting: { findFirst: vi.fn(async () => null) } })
    await expect(foreign.svc.approveMinutes('school-B', 'm-of-A', 'user-1', NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(foreign.meeting.update).not.toHaveBeenCalled()

    const { svc, meeting, audit } = makeService({
      meeting: { findFirst: vi.fn(async () => row({ id: 'm1', status: 'held', minutesStatus: 'pending_approval' })) },
    })
    await svc.approveMinutes('school-A', 'm1', 'user-3', NOW)
    const data = meeting.update.mock.calls[0][0].data
    expect(data.minutesStatus).toBe('approved')
    expect(data.minutesApprovedByUserId).toBe('user-3')
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'governance.meeting.minutes_approved' }),
    )
  })

  it('remove: foreign id → 404, never deletes', async () => {
    const { svc, meeting } = makeService({ meeting: { findFirst: vi.fn(async () => null) } })
    await expect(svc.remove('school-B', 'm-of-A', 'user-1')).rejects.toBeInstanceOf(NotFoundException)
    expect(meeting.delete).not.toHaveBeenCalled()
  })
})

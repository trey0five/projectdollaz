import { describe, it, expect } from 'vitest'
import {
  computeMeetingSignal,
  summarizeMeetings,
  AGENDA_DUE_SOON_DAYS,
  MINUTES_APPROVAL_SLA_DAYS,
  type MeetingSignalInput,
} from '../src/meeting-governance.js'

// A fixed injected `now` so every assertion is deterministic.
const NOW = new Date('2026-06-30T12:00:00.000Z')

function m(over: Partial<MeetingSignalInput>): MeetingSignalInput {
  return {
    status: 'scheduled',
    scheduledAt: null,
    agenda: null,
    minutesStatus: 'none',
    ...over,
  }
}

describe('computeMeetingSignal', () => {
  it('upcoming scheduled meeting within the agenda window + blank agenda → agendaMissing', () => {
    // now = 2026-06-30; +5d = 2026-07-05, inside the 7-day agenda window.
    const r = computeMeetingSignal(m({ status: 'scheduled', scheduledAt: '2026-07-05', agenda: null }), NOW)
    expect(r.isUpcoming).toBe(true)
    expect(r.daysUntilMeeting).toBe(5)
    expect(r.agendaMissing).toBe(true)
  })

  it('upcoming meeting WITH an agenda → not agendaMissing', () => {
    const r = computeMeetingSignal(
      m({ status: 'scheduled', scheduledAt: '2026-07-05', agenda: 'Budget review' }),
      NOW,
    )
    expect(r.agendaMissing).toBe(false)
  })

  it('whitespace-only agenda counts as blank', () => {
    const r = computeMeetingSignal(m({ status: 'scheduled', scheduledAt: '2026-07-05', agenda: '   ' }), NOW)
    expect(r.agendaMissing).toBe(true)
  })

  it('upcoming meeting OUTSIDE the agenda window → not agendaMissing yet', () => {
    // +8d is beyond AGENDA_DUE_SOON_DAYS (7).
    const r = computeMeetingSignal(m({ status: 'scheduled', scheduledAt: '2026-07-08', agenda: null }), NOW)
    expect(r.daysUntilMeeting).toBe(8)
    expect(r.daysUntilMeeting!).toBeGreaterThan(AGENDA_DUE_SOON_DAYS)
    expect(r.agendaMissing).toBe(false)
  })

  it('exactly at the agenda-due boundary → agendaMissing', () => {
    const r = computeMeetingSignal(m({ status: 'scheduled', scheduledAt: '2026-07-07', agenda: null }), NOW)
    expect(r.daysUntilMeeting).toBe(AGENDA_DUE_SOON_DAYS)
    expect(r.agendaMissing).toBe(true)
  })

  it('held + pending_approval within the SLA → minutesPending, not overdue', () => {
    // held 10 days ago (2026-06-20), SLA is 14 → pending but not overdue.
    const r = computeMeetingSignal(
      m({ status: 'held', scheduledAt: '2026-06-20', minutesStatus: 'pending_approval' }),
      NOW,
    )
    expect(r.isUpcoming).toBe(false)
    expect(r.minutesPending).toBe(true)
    expect(r.minutesOverdue).toBe(false)
  })

  it('held + pending_approval past the SLA → minutesOverdue', () => {
    // held 20 days ago (2026-06-10), > 14-day SLA → overdue.
    const r = computeMeetingSignal(
      m({ status: 'held', scheduledAt: '2026-06-10', minutesStatus: 'pending_approval' }),
      NOW,
    )
    expect(r.daysUntilMeeting).toBe(-20)
    expect(r.daysUntilMeeting!).toBeLessThan(-MINUTES_APPROVAL_SLA_DAYS)
    expect(r.minutesPending).toBe(true)
    expect(r.minutesOverdue).toBe(true)
  })

  it('exactly at the SLA boundary is NOT overdue (strict >)', () => {
    // held exactly 14 days ago (2026-06-16) → daysUntilMeeting -14, not < -14.
    const r = computeMeetingSignal(
      m({ status: 'held', scheduledAt: '2026-06-16', minutesStatus: 'pending_approval' }),
      NOW,
    )
    expect(r.daysUntilMeeting).toBe(-14)
    expect(r.minutesOverdue).toBe(false)
  })

  it('held with approved minutes → no pending signal', () => {
    const r = computeMeetingSignal(
      m({ status: 'held', scheduledAt: '2026-06-01', minutesStatus: 'approved' }),
      NOW,
    )
    expect(r.minutesPending).toBe(false)
    expect(r.minutesOverdue).toBe(false)
  })

  it('cancelled meeting → no upcoming/agenda signal', () => {
    const r = computeMeetingSignal(m({ status: 'cancelled', scheduledAt: '2026-07-02', agenda: null }), NOW)
    expect(r.isUpcoming).toBe(false)
    expect(r.agendaMissing).toBe(false)
  })

  it('unparseable / null scheduledAt → daysUntilMeeting null, no signals', () => {
    const r = computeMeetingSignal(m({ status: 'scheduled', scheduledAt: null }), NOW)
    expect(r.daysUntilMeeting).toBeNull()
    expect(r.isUpcoming).toBe(false)
    expect(r.agendaMissing).toBe(false)
    expect(r.minutesOverdue).toBe(false)
  })

  it('accepts a JS Date anchor (Prisma @db.Date shape) identically to a string', () => {
    const asDate = computeMeetingSignal(
      m({ status: 'scheduled', scheduledAt: new Date('2026-07-05T00:00:00.000Z') }),
      NOW,
    )
    const asString = computeMeetingSignal(m({ status: 'scheduled', scheduledAt: '2026-07-05' }), NOW)
    expect(asDate).toEqual(asString)
  })

  it('tz determinism: same result at 00:01Z vs 23:59Z on the same civil day', () => {
    const early = new Date('2026-06-30T00:01:00.000Z')
    const late = new Date('2026-06-30T23:59:00.000Z')
    const meeting = m({ status: 'scheduled', scheduledAt: '2026-07-05', agenda: null })
    expect(computeMeetingSignal(meeting, early)).toEqual(computeMeetingSignal(meeting, late))
  })
})

describe('summarizeMeetings', () => {
  it('empty → all zeros + nulls', () => {
    expect(summarizeMeetings([], NOW)).toEqual({
      total: 0,
      upcomingCount: 0,
      agendaMissingSoonCount: 0,
      minutesPendingCount: 0,
      minutesOverdueCount: 0,
      nextMeetingAt: null,
      earliestMinutesPendingHeldAt: null,
    })
  })

  it('aggregates counts + selects earliest upcoming and earliest pending-held', () => {
    const s = summarizeMeetings(
      [
        // upcoming, agenda missing (within window)
        m({ status: 'scheduled', scheduledAt: '2026-07-05', agenda: null }),
        // upcoming, later, agenda present
        m({ status: 'scheduled', scheduledAt: '2026-07-02', agenda: 'set' }),
        // held + pending within SLA
        m({ status: 'held', scheduledAt: '2026-06-20', minutesStatus: 'pending_approval' }),
        // held + pending overdue (earliest held)
        m({ status: 'held', scheduledAt: '2026-06-01', minutesStatus: 'pending_approval' }),
        // cancelled → no signal
        m({ status: 'cancelled', scheduledAt: '2026-07-01' }),
      ],
      NOW,
    )
    expect(s.total).toBe(5)
    expect(s.upcomingCount).toBe(2)
    expect(s.agendaMissingSoonCount).toBe(1)
    expect(s.minutesPendingCount).toBe(2)
    expect(s.minutesOverdueCount).toBe(1)
    // earliest upcoming scheduled date
    expect(s.nextMeetingAt).toBe('2026-07-02')
    // earliest held date among pending-minutes meetings
    expect(s.earliestMinutesPendingHeldAt).toBe('2026-06-01')
  })
})

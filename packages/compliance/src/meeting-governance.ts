// ─────────────────────────────────────────────────────────────────────────────
// Meeting governance — the board-meeting signal engine (Phase 3 depth).
//
// A PURE, framework-free, INJECTABLE-`now` module shared by BOTH the governance
// MeetingsService (to enrich each CRUD response) AND the analytics BriefingService
// (the meeting half of the 'governance' STEP). One source of truth → the meeting
// register list and the briefing can never disagree about a meeting's signal.
//
// DETERMINISM / PURITY CONTRACT (obeys __tests__/purity.test.ts): this module
// reads NOTHING ambient — it NEVER constructs a Date, never calls the clock,
// never touches I/O. All date math is done on plain integers via the shared
// proleptic-Gregorian day math imported from review-status.js (daysFromCivil /
// toCivil). `now` arrives caller-supplied and we only READ its UTC accessors.
//
// The threshold consts are TUNABLE SECTOR DEFAULTS (documented, overridable via
// opts) — not hard truths.
// ─────────────────────────────────────────────────────────────────────────────

import { daysFromCivil, toCivil, type Civil } from './review-status.js'

/** Draft an agenda by this many days before an upcoming meeting (tunable default). */
export const AGENDA_DUE_SOON_DAYS = 7
/** Minutes should be approved within this many days of a held meeting (tunable). */
export const MINUTES_APPROVAL_SLA_DAYS = 14
/** Minutes this far past the SLA are "badly overdue" (tunable; briefing may escalate). */
export const MINUTES_BADLY_OVERDUE_DAYS = 45

export type MeetingStatus = 'scheduled' | 'held' | 'cancelled'
export type MinutesStatus = 'none' | 'draft' | 'pending_approval' | 'approved'

/** The fields a meeting signal reads. scheduledAt is the meeting date. */
export interface MeetingSignalInput {
  status: string
  /** yyyy-mm-dd string, a JS Date (@db.Date), or null. */
  scheduledAt: Date | string | null
  /** The agenda text (blank/absent → agenda missing). */
  agenda?: string | null
  minutesStatus: string
}

export interface MeetingSignal {
  isUpcoming: boolean
  /** Whole UTC days until the meeting; negative = in the past; null unparseable. */
  daysUntilMeeting: number | null
  agendaMissing: boolean
  minutesPending: boolean
  minutesOverdue: boolean
}

/** The item shape summarizeMeetings iterates (same fields as the signal input). */
export type MeetingSummaryItem = MeetingSignalInput

export interface MeetingsSummary {
  total: number
  upcomingCount: number
  agendaMissingSoonCount: number
  minutesPendingCount: number
  minutesOverdueCount: number
  /** Earliest upcoming scheduled meeting date (yyyy-mm-dd), or null. */
  nextMeetingAt: string | null
  /** Earliest held date among pending-minutes meetings (yyyy-mm-dd), or null. */
  earliestMinutesPendingHeldAt: string | null
}

/** Optional per-call threshold overrides (mirrors computeReviewStatus's arg style). */
export interface MeetingSignalOptions {
  agendaDueSoonDays?: number
  minutesApprovalSlaDays?: number
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Serialize a Civil back to a yyyy-mm-dd string (pure; string min-compare safe). */
function civilToIso(c: Civil): string {
  return `${c.y}-${pad(c.m)}-${pad(c.d)}`
}

/**
 * Compute a meeting's board-governance signal. `now` is INJECTED for determinism
 * (tests pin a fixed value; callers pass the current time — we only READ its UTC
 * accessors). All comparisons are whole-UTC-day integer math via the shared civil
 * day helpers, so the same (input, now) always yields the same result on any host.
 *
 *   daysUntilMeeting = schedDays − todayDays  (null if scheduledAt unparseable)
 *   isUpcoming       = scheduled AND daysUntilMeeting >= 0 (today or future)
 *   agendaMissing    = upcoming, within AGENDA_DUE_SOON_DAYS, and blank agenda
 *   minutesPending   = held AND minutesStatus 'pending_approval'
 *   minutesOverdue   = minutesPending AND held more than the SLA days ago
 */
export function computeMeetingSignal(
  m: MeetingSignalInput,
  now: Date,
  opts?: MeetingSignalOptions,
): MeetingSignal {
  const agendaDueSoon = opts?.agendaDueSoonDays ?? AGENDA_DUE_SOON_DAYS
  const slaDays = opts?.minutesApprovalSlaDays ?? MINUTES_APPROVAL_SLA_DAYS

  const sched = toCivil(m.scheduledAt)
  const todayDays = daysFromCivil(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
  const daysUntilMeeting: number | null =
    sched === null ? null : daysFromCivil(sched.y, sched.m, sched.d) - todayDays

  const isUpcoming = m.status === 'scheduled' && daysUntilMeeting !== null && daysUntilMeeting >= 0

  const agendaBlank = !m.agenda || String(m.agenda).trim() === ''
  const agendaMissing =
    isUpcoming && daysUntilMeeting !== null && daysUntilMeeting <= agendaDueSoon && agendaBlank

  const minutesPending = m.status === 'held' && m.minutesStatus === 'pending_approval'
  // Held meetings are in the past (daysUntilMeeting negative). Overdue when the
  // meeting was held more than slaDays ago → daysUntilMeeting < -slaDays.
  const minutesOverdue =
    minutesPending && daysUntilMeeting !== null && daysUntilMeeting < -slaDays

  return { isUpcoming, daysUntilMeeting, agendaMissing, minutesPending, minutesOverdue }
}

/**
 * Aggregate a set of meetings into the register/briefing summary. PURE +
 * deterministic; empty → all zeros/nulls. Serializes the *At dates back to
 * yyyy-mm-dd via the shared civil math so a Date and its equivalent string yield
 * the identical output (and lexicographic min-compare picks the earliest date).
 */
export function summarizeMeetings(items: MeetingSummaryItem[], now: Date): MeetingsSummary {
  let upcomingCount = 0
  let agendaMissingSoonCount = 0
  let minutesPendingCount = 0
  let minutesOverdueCount = 0
  let nextMeetingAt: string | null = null
  let earliestMinutesPendingHeldAt: string | null = null

  for (const it of items) {
    const sig = computeMeetingSignal(it, now)
    const iso = ((): string | null => {
      const c = toCivil(it.scheduledAt)
      return c === null ? null : civilToIso(c)
    })()

    if (sig.isUpcoming) {
      upcomingCount += 1
      if (iso !== null && (nextMeetingAt === null || iso < nextMeetingAt)) nextMeetingAt = iso
    }
    if (sig.agendaMissing) agendaMissingSoonCount += 1
    if (sig.minutesPending) {
      minutesPendingCount += 1
      if (
        iso !== null &&
        (earliestMinutesPendingHeldAt === null || iso < earliestMinutesPendingHeldAt)
      )
        earliestMinutesPendingHeldAt = iso
    }
    if (sig.minutesOverdue) minutesOverdueCount += 1
  }

  return {
    total: items.length,
    upcomingCount,
    agendaMissingSoonCount,
    minutesPendingCount,
    minutesOverdueCount,
    nextMeetingAt,
    earliestMinutesPendingHeldAt,
  }
}

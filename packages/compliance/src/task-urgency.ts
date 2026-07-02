// ─────────────────────────────────────────────────────────────────────────────
// @finrep/compliance — TASK URGENCY (Phase 3 Workflow v1).
//
// A PURE, framework-free, INJECTABLE-`now` function shared by BOTH the workflow
// TasksService (to enrich each CRUD response) AND the analytics BriefingService
// (the new 'workflow' STEP). One source of truth → the task list and the briefing
// can never disagree about whether a task is overdue.
//
// DETERMINISM CONTRACT (identical to computeReviewStatus): this module reads
// NOTHING ambient — it never constructs a date, never calls the clock, never
// touches I/O. It obeys the package PURITY GUARD (see __tests__/purity.test.ts,
// which forbids the date-static / date-constructor tokens): all date math is done
// on plain integers via the shared proleptic-Gregorian day-number helpers from
// review-status.ts, so the same (input, now) ALWAYS yields the same result on any
// host/timezone. `now` arrives as a caller-supplied value and we only READ its
// UTC accessors.
//
// HONESTY CONTRACT: a task that is terminal (done/cancelled) OR has no due date
// yields { urgency:'none', daysUntilDue:null }. We NEVER fabricate a deadline — an
// open task with no due date is 'none', not 'on-track' and never 'overdue'.
//
// A task is SIMPLER than a policy: no anchor+interval math (dueDate IS the
// deadline), no bands. The pure helper returns urgency ONLY; the briefing decides
// warn-vs-critical severity itself (see WORKFLOW_BADLY_OVERDUE_DAYS in the
// briefing) so the pure layer stays minimal.
// ─────────────────────────────────────────────────────────────────────────────
import { toCivil, daysFromCivil, addMonths, civilFromDays, civilToIso } from './review-status.js'

export type TaskUrgency = 'overdue' | 'due-soon' | 'on-track' | 'none'

// ── Phase 3 Workflow depth — recurrence date math (pure, injected-now) ─────────
/** The cadence of a recurring task. 'none' = one-off (never spawns a successor). */
export type TaskRecurrence = 'none' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
export const TASK_RECURRENCES = ['none', 'weekly', 'monthly', 'quarterly', 'annual'] as const

/**
 * Compute the NEXT occurrence's due date (yyyy-mm-dd) from a base date, or null
 * when the cadence is 'none' / unrecognized. PURE — reuses the shared civil day
 * math (weekly = +7 days via civilFromDays; monthly/quarterly/annual = +1/3/12
 * months via addMonths, so month-end is safe: Jan-31 monthly → Feb-28/29). The
 * base is EXPLICIT (prevDue when present, else `now` decomposed via UTC accessors)
 * so the module constructs NO Date and reads only `now`'s UTC accessors — obeying
 * the package purity guard. The impure service layer materializes the returned
 * string into a stored date column.
 */
export function nextTaskOccurrence(
  prevDue: Date | string | null,
  recurrence: string,
  now: Date,
): string | null {
  if (recurrence === 'none' || !(TASK_RECURRENCES as readonly string[]).includes(recurrence)) {
    return null
  }
  const base =
    toCivil(prevDue) ?? {
      y: now.getUTCFullYear(),
      m: now.getUTCMonth() + 1,
      d: now.getUTCDate(),
    }
  if (recurrence === 'weekly') {
    return civilToIso(civilFromDays(daysFromCivil(base.y, base.m, base.d) + 7))
  }
  const months = recurrence === 'monthly' ? 1 : recurrence === 'quarterly' ? 3 : 12
  return civilToIso(addMonths(base, months))
}

/**
 * Default "due soon" horizon — 7 days. Tasks are DAY-SCALE operational items
 * (unlike the 60-day policy review cadence), so the info band is deliberately
 * short: a task is only "due soon" inside a week of its deadline.
 */
export const TASK_DUE_SOON_DAYS = 7

export interface TaskUrgencyInput {
  /** 'open' | 'in_progress' | 'done' | 'cancelled'. Terminal → no live clock. */
  status: string
  /** yyyy-mm-dd string, a JS Date (@db.Date), or null. */
  dueDate: Date | string | null
}

export interface TaskUrgencyResult {
  urgency: TaskUrgency
  /** Whole days until due; negative = overdue by N days; null when 'none'. */
  daysUntilDue: number | null
}

/**
 * Compute a task's urgency. `now` is INJECTED for determinism; tests pin a fixed
 * value, callers pass the current time (we only read its UTC accessors).
 *
 *   daysUntilDue = (dueDate − today) in whole UTC days
 *   urgency      = overdue (<0) | due-soon (0..dueSoonDays) | on-track (>) | none
 *
 * Returns { urgency:'none', daysUntilDue:null } (no fabricated deadline) when the
 * task is terminal (done/cancelled) or has no / an unparseable due date.
 */
export function computeTaskUrgency(
  t: TaskUrgencyInput,
  now: Date,
  dueSoonDays = TASK_DUE_SOON_DAYS,
): TaskUrgencyResult {
  const none: TaskUrgencyResult = { urgency: 'none', daysUntilDue: null }

  // Terminal statuses have no live clock (mirrors review-status' lifecycle gate).
  if (t.status === 'done' || t.status === 'cancelled') return none

  // Honest no-due-date: an open task with no deadline is 'none', NEVER overdue.
  const due = toCivil(t.dueDate)
  if (due === null) return none

  const dueDays = daysFromCivil(due.y, due.m, due.d)
  // Decompose `now` to its UTC calendar day (accessor reads only — no Date built).
  const todayDays = daysFromCivil(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
  const daysUntilDue = dueDays - todayDays

  let urgency: TaskUrgency
  if (daysUntilDue < 0) urgency = 'overdue'
  else if (daysUntilDue <= dueSoonDays) urgency = 'due-soon' // includes 0 = due today
  else urgency = 'on-track'

  return { urgency, daysUntilDue }
}

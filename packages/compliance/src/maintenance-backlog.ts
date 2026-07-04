// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 Facilities v1 — PURE, framework-free, INJECTABLE-`now` deferred-
// maintenance backlog helper, shared by BOTH the facilities FacilitiesService (to
// enrich each list response) AND the analytics BriefingService (the new
// 'facilities' STEP). One source of truth → the register list and the briefing can
// never disagree about item urgency or the backlog rollup (mirrors
// accreditation-coverage.ts).
//
// DETERMINISM CONTRACT: like accreditation-coverage.ts / review-status.ts, this
// module reads NOTHING ambient — it never constructs a Date, never calls the clock,
// never touches I/O. It obeys the package PURITY GUARD (__tests__/purity.test.ts
// forbids the Date tokens): all date math is integer day-numbers via the shared
// daysFromCivil/toCivil helpers, so the same (input, now) ALWAYS yields the same
// result on any host/timezone.
//
// DECIMAL DISCIPLINE (the pure layer stays Prisma-free): estimatedCost arrives as
// `number | null` ONLY — the SERVICE converts Prisma.Decimal → number BEFORE
// calling this helper. backlogCost accumulates in INTEGER CENTS then /100, so
// 100.10 + 200.20 === 300.30 exactly (no float drift).
//
// DUE-SOON HORIZON: a dedicated MAINTENANCE_DUE_SOON_DAYS = 60. A maintenance
// target is an operational-scale deadline (unlike the 180-day accreditation review
// horizon), so the 60-day compliance/AUP cadence is the right default here.
// ─────────────────────────────────────────────────────────────────────────────
import { addMonths, civilFromDays, civilToIso, daysFromCivil, toCivil } from './review-status.js'

export type MaintenancePriority = 'low' | 'medium' | 'high' | 'critical'
export type MaintenanceStatus = 'open' | 'scheduled' | 'in_progress' | 'resolved'
/** 'none' = no targetDate, OR the item is resolved (a done item has no live clock). */
export type MaintenanceUrgency = 'overdue' | 'due-soon' | 'on-track' | 'none'

// ── Facilities depth — recurrence date math (pure, injected-now). MIRRORS the Task
// recurrence convention EXACTLY (see task-urgency.ts nextTaskOccurrence) so the two
// preventive/recurring engines share one shape. ─────────────────────────────────
/** The cadence of a recurring maintenance item. 'none' = one-off (never spawns). */
export type MaintenanceRecurrence = 'none' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
export const MAINTENANCE_RECURRENCES = ['none', 'weekly', 'monthly', 'quarterly', 'annual'] as const

/**
 * Compute the NEXT occurrence's target date (yyyy-mm-dd) from a base date, or null
 * when the cadence is 'none' / unrecognized. PURE — reuses the shared civil day
 * math (weekly = +7 days; monthly/quarterly/annual = +1/3/12 months via addMonths, so
 * month-end is safe: Jan-31 monthly → Feb-28/29). The base is EXPLICIT (prevTarget when
 * present, else `now` decomposed via UTC accessors) so this module constructs NO Date
 * and reads only `now`'s UTC accessors — obeying the package purity guard. Byte-for-byte
 * mirror of nextTaskOccurrence.
 */
export function nextMaintenanceOccurrence(
  prevTarget: Date | string | null,
  recurrence: string,
  now: Date,
): string | null {
  if (
    recurrence === 'none' ||
    !(MAINTENANCE_RECURRENCES as readonly string[]).includes(recurrence)
  ) {
    return null
  }
  const base =
    toCivil(prevTarget) ?? {
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
 * Default "due soon" horizon for a maintenance target date. Operational-scale, so
 * it reuses the 60-day compliance/AUP cadence — DELIBERATELY NOT the 180-day
 * accreditation review horizon. A dedicated named const (not the shared
 * DUE_SOON_DAYS) so the facilities domain owns its own tuning.
 */
export const MAINTENANCE_DUE_SOON_DAYS = 60

export interface MaintenanceUrgencyInput {
  status: string
  /** yyyy-mm-dd string, a JS Date (@db.Date), or null. The target/desired-by date. */
  targetDate?: Date | string | null
}

export interface MaintenanceUrgencyResult {
  urgency: MaintenanceUrgency
  /** Whole UTC days until the target; negative = overdue by N days; null when none. */
  daysUntilTarget: number | null
}

/**
 * Full per-item urgency from a target date. `now` is INJECTED for determinism
 * (tests pin a fixed value; callers pass the current time — only its UTC accessors
 * are read, never a Date constructed).
 *
 * A RESOLVED item is never urgent → { urgency:'none', daysUntilTarget:null } (a done
 * item has no live clock — mirrors the policy lifecycle gate). A missing targetDate
 * also yields 'none'. Otherwise:
 *   daysUntilTarget = (targetDate − today) in whole UTC days
 *   urgency = overdue (<0) | due-soon (0..soonDays) | on-track (>)
 */
export function computeMaintenanceUrgency(
  input: MaintenanceUrgencyInput,
  now: Date,
  soonDays = MAINTENANCE_DUE_SOON_DAYS,
): MaintenanceUrgencyResult {
  // Resolved short-circuit BEFORE any date math — a done item is never urgent.
  if (input.status === 'resolved') return { urgency: 'none', daysUntilTarget: null }
  const civil = toCivil(input.targetDate ?? null)
  if (civil === null) return { urgency: 'none', daysUntilTarget: null }
  const targetDays = daysFromCivil(civil.y, civil.m, civil.d)
  const todayDays = daysFromCivil(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
  const daysUntilTarget = targetDays - todayDays
  let urgency: MaintenanceUrgency
  if (daysUntilTarget < 0) urgency = 'overdue'
  else if (daysUntilTarget <= soonDays) urgency = 'due-soon'
  else urgency = 'on-track'
  return { urgency, daysUntilTarget }
}

/**
 * The school deferred-maintenance backlog rollup. An item is "open" (part of the
 * backlog) when status !== 'resolved' — open/scheduled/in_progress all count
 * (money is still deferred until resolved); only 'resolved' drops out of every
 * count AND out of backlogCost.
 */
export interface MaintenanceBacklogSummary {
  total: number
  /** status !== 'resolved'. */
  openCount: number
  /** (priority high|critical) AND status !== 'resolved'. */
  highPriorityOpenCount: number
  /** priority === 'critical' AND status !== 'resolved'. */
  criticalOpen: number
  /** urgency === 'overdue' (which already excludes resolved). Feeds the briefing escalation. */
  overdueOpen: number
  /** Σ estimatedCost over NON-resolved items (null cost = 0), integer-cents summed. */
  backlogCost: number
}

export interface MaintenanceBacklogInput {
  priority: string
  status: string
  estimatedCost: number | null
  urgency: MaintenanceUrgency
}

/**
 * Roll a list of per-item {priority,status,estimatedCost,urgency} up into the
 * school backlog summary. Pure, deterministic; empty list → all zeros. backlogCost
 * accumulates in integer cents to avoid float drift, resolved items excluded.
 */
export function summarizeBacklog(
  items: readonly MaintenanceBacklogInput[],
): MaintenanceBacklogSummary {
  let openCount = 0
  let highPriorityOpenCount = 0
  let criticalOpen = 0
  let overdueOpen = 0
  let cents = 0
  for (const it of items) {
    const open = it.status !== 'resolved'
    if (!open) continue
    openCount += 1
    if (it.priority === 'high' || it.priority === 'critical') highPriorityOpenCount += 1
    if (it.priority === 'critical') criticalOpen += 1
    if (it.urgency === 'overdue') overdueOpen += 1
    cents += Math.round((it.estimatedCost ?? 0) * 100)
  }
  return {
    total: items.length,
    openCount,
    highPriorityOpenCount,
    criticalOpen,
    overdueOpen,
    backlogCost: cents / 100,
  }
}

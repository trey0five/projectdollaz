// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase G — HOW MUCH OF AN INITIATIVE IS ACTUALLY DONE.
//
// The whole point of the Continuous Improvement Manager is that progress is
// COMPUTED FROM THE SCHOOL'S OWN NUMBERS, not self-reported. A head of school who
// can drag a slider to 80% has a slider, not a plan. So four of the five progress
// sources here are measured — a bound metric, milestone completion, linked-task
// completion — and the fifth, `manual`, is admitted only because some work
// genuinely has no series, and it is quarantined: it never projects a completion
// date and it never counts toward a rollup.
//
// WHY THIS FILE IS IN apps/api AND NOT IN packages/compliance
// ------------------------------------------------------------------
// It must reuse `computePace` VERBATIM, so that "behind" cannot mean one thing on
// /strategy and another on /improvement. `computePace` reaches `Date.parse` via
// its `toMs` helper, and `packages/compliance/__tests__/purity.test.ts` forbids
// `Date.` anywhere under that package's `src/`. Copying the function to satisfy
// the purity test would create exactly the fork the reuse exists to prevent, so
// the shared code stays where it is and this module lives next to it instead.
//
// `strategy-progress.ts` IS NOT EDITED BY THIS PHASE — not one character. A spec
// in improvement-progress.spec.ts asserts this file DEFINES no `computePace`.
//
// Framework-free, Prisma-free, and CLOCK-FREE: `asOf` is a parameter.
// ─────────────────────────────────────────────────────────────────────────────
import { clamp01, computePace, type PaceStatus } from '../strategy/strategy-progress.js'
import { STALE_INITIATIVE_DAYS } from '../strategy/strategy.constants.js'
import type { MilestoneView } from '../strategy/strategy.types.js'

/** How an initiative's progress is measured. `null` is the LEGACY row: status only. */
export type ProgressSource = 'metric' | 'milestone' | 'task_rollup' | 'manual' | null

/** The COMPUTED risk read. Distinct from the stored, human `riskLevel` — see §riskSignal. */
export type RiskSignal = 'none' | 'watch' | 'at_risk' | 'behind' | 'overdue'

/** One recorded reading from `improvement_progress_events`. APPEND-ONLY upstream. */
export interface ProgressObservation {
  /** yyyy-mm-dd, the civil day the reading describes. */
  observedOn: string
  source: Exclude<ProgressSource, null>
  /** The 0..1 fraction toward target at observedOn. Null when unmeasurable. */
  pct: number | null
}

export interface InitiativeProgressInput {
  progressSource: ProgressSource
  status: string
  /** yyyy-mm-dd. */
  startDate: string | null
  /** yyyy-mm-dd. */
  dueDate: string | null
  /** ISO date/time. PASSED IN — there is no clock in this file. */
  asOf: string

  // ── metric source ──
  baselineValue: number | null
  /** The live canonical metric value, resolved by the caller. */
  currentValue: number | null
  targetValue: number | null
  metricLabel: string | null
  metricKey: string | null

  // ── milestone source ──
  milestones: readonly MilestoneView[] | null

  // ── task_rollup source ──
  linkedTaskCounts: { total: number; done: number } | null

  // ── manual source ──
  manualProgressPct: number | null

  // ── risk / staleness ──
  /** Whole days since the row was last touched. The caller owns the subtraction. */
  staleDays: number
  /** STORED human judgement. Echoed, never derived. */
  riskLevel: string | null
  riskNote: string | null

  /** The recorded series. Filtered to `progressSource` inside. */
  events: readonly ProgressObservation[]
}

export interface InitiativeProgress {
  progressSource: ProgressSource
  progressPct: number | null
  /** A literal per source. `'Status only'` when progressSource is null. */
  progressBasis: string
  expectedPct: number | null
  paceStatus: PaceStatus
  overshoot: boolean
  /** COMPUTED. Never stored, never written back to riskLevel. */
  riskSignal: RiskSignal
  /** HUMAN, echoed verbatim from the column. Never derived, never defaulted. */
  riskLevel: string | null
  /** HUMAN, echoed verbatim. */
  riskNote: string | null
  projectedCompletionDate: string | null
  /** Non-null EXACTLY when projectedCompletionDate is null. */
  projectionReason: string | null
  /** False for `manual` and for `null` — a hand-set number never feeds a score. */
  countsTowardRollup: boolean
}

const DAY_MS = 86_400_000

/** yyyy-mm-dd → epoch ms at UTC midnight. NaN when unparseable. */
function civilMs(iso: string | null): number {
  if (!iso) return Number.NaN
  return Date.parse(iso.length <= 10 ? `${iso}T00:00:00.000Z` : iso)
}

/**
 * The CIVIL DAY an instant falls on, as epoch ms at UTC midnight.
 *
 * `dueDate` is a `@db.Date` and arrives as a bare yyyy-mm-dd — midnight. `asOf`
 * is a full timestamp (`getImprovement` defaults it to `new Date()`), so
 * comparing the two directly asks "is midnight on the due date before 15:24
 * today", which is TRUE from 00:00:00.001 on the due date itself. An initiative
 * is not late on the day it is due, so both sides are truncated to their day
 * before any comparison.
 */
function civilDayMs(iso: string | null): number {
  return civilMs(iso === null ? null : iso.slice(0, 10))
}

/** epoch ms → yyyy-mm-dd. */
function civilDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Whole civil days from a → b. */
function daysBetween(a: string, b: string): number {
  return Math.round((civilMs(b) - civilMs(a)) / DAY_MS)
}

/** The minimum span, in days, over which a two-point extrapolation is honest. */
export const MIN_PROJECTION_SPAN_DAYS = 14

/** The frozen basis sentences. One per source; nothing is composed at call time. */
const BASIS: Record<Exclude<ProgressSource, null>, string> = {
  metric: 'Measured', // completed with the metric's label below
  milestone: 'Milestones completed',
  task_rollup: 'Linked tasks completed',
  manual: 'Hand-set percentage',
}

/** Sources that are a MEASURED SERIES and may therefore be extrapolated. */
const PROJECTABLE: ReadonlySet<string> = new Set(['metric', 'milestone'])

/** Terminal statuses: work that is finished or abandoned cannot be overdue. */
const CLOSED_STATUSES: ReadonlySet<string> = new Set(['done', 'cancelled'])

/**
 * The pace inputs, per source. This table is deliberately the SAME SHAPE as
 * `StrategyProgressService.buildGoal`'s — that is the whole point. One pace
 * function, one table shape, so a "behind" verdict cannot fork between a
 * strategic goal and an improvement initiative.
 */
function paceInputs(i: InitiativeProgressInput): {
  baseline: number | null
  current: number | null
  target: number | null
} {
  switch (i.progressSource) {
    case 'metric':
      return { baseline: i.baselineValue, current: i.currentValue, target: i.targetValue }
    case 'milestone': {
      const items = i.milestones ?? []
      const total = items.length
      return { baseline: 0, current: items.filter((m) => m.done).length, target: total > 0 ? total : null }
    }
    case 'task_rollup': {
      const lc = i.linkedTaskCounts ?? { total: 0, done: 0 }
      return { baseline: 0, current: lc.done, target: lc.total > 0 ? lc.total : null }
    }
    case 'manual':
      return { baseline: 0, current: i.manualProgressPct, target: i.manualProgressPct !== null ? 1 : null }
    default:
      // NULL SOURCE — the legacy row. Every pace input is null, so computePace
      // returns no_data and progressPct is null. A legacy initiative renders
      // EXACTLY as it did before this phase existed.
      return { baseline: null, current: null, target: null }
  }
}

function basisFor(i: InitiativeProgressInput): string {
  if (i.progressSource === null) return 'Status only'
  if (i.progressSource === 'metric') {
    // The label is the metric's own display name; the key is the honest fallback
    // when a bind exists but the registry has no label for it.
    return `${BASIS.metric}: ${i.metricLabel ?? i.metricKey ?? 'unnamed metric'}`
  }
  return BASIS[i.progressSource]
}

/**
 * `riskSignal` — the COMPUTED read, in this exact precedence.
 *
 * IT IS A SEPARATE FIELD FROM `riskLevel` AND THE TWO ARE NEVER MERGED. `riskLevel`
 * is what a person decided; `riskSignal` is what the dates and the numbers say. A
 * head of school marking something "low" while it is three weeks overdue is a real
 * and useful disagreement, and collapsing the two would hide exactly the case
 * worth seeing. Neither ever overwrites the other, and `riskLevel` is never
 * defaulted to 'none' — a row nobody has judged says nothing, not "fine".
 */
function riskSignalFor(i: InitiativeProgressInput, paceStatus: PaceStatus): RiskSignal {
  // BOTH sides are civil DAYS. `due < asOf` therefore means "the due day is
  // strictly before today" — the day it is due is not yet late.
  const due = civilDayMs(i.dueDate)
  const asOf = civilDayMs(i.asOf)
  if (!Number.isNaN(due) && !Number.isNaN(asOf) && due < asOf && !CLOSED_STATUSES.has(i.status)) {
    return 'overdue'
  }
  if (paceStatus === 'behind') return 'behind'
  if (paceStatus === 'at_risk') return 'at_risk'
  if (i.status === 'blocked' || i.staleDays > STALE_INITIATIVE_DAYS) return 'watch'
  return 'none'
}

/**
 * `projectedCompletionDate` — emitted ONLY from a real, measured, forward-moving
 * series spanning at least a fortnight. Every other case returns null WITH A
 * LITERAL REASON, because "no date" and "no date because you have one reading"
 * are different answers and only one of them tells a school what to do next.
 *
 * First failing condition wins.
 */
function project(
  i: InitiativeProgressInput,
): { projectedCompletionDate: string | null; projectionReason: string | null } {
  const none = (projectionReason: string) => ({ projectedCompletionDate: null, projectionReason })

  if (i.progressSource === null) {
    return none('This initiative reports status only, so nothing can be projected.')
  }
  if (i.progressSource === 'manual') {
    return none('A hand-set percentage is not an observation, so no completion date can be projected.')
  }
  if (!PROJECTABLE.has(i.progressSource)) {
    return none('Task counts are not a measured series, so no completion date is projected.')
  }

  const series = i.events
    .filter((e) => e.source === i.progressSource && e.pct !== null)
    .slice()
    .sort((a, b) => civilMs(a.observedOn) - civilMs(b.observedOn))

  if (series.length < 2) {
    const n = series.length
    return none(`Only ${n} observation${n === 1 ? '' : 's'} recorded; two are needed to project.`)
  }

  const earliest = series[0]
  const latest = series[series.length - 1]
  const days = daysBetween(earliest.observedOn, latest.observedOn)
  if (days < MIN_PROJECTION_SPAN_DAYS) {
    // "The two readings" would be a FALSE statement about a series of three or
    // more — and the span reported is the earliest-to-latest one, not a pair's.
    // Every refusal sentence in this phase has to be true of the data it
    // describes, so the sentence names what was actually measured.
    return none(
      `Your earliest and latest readings are ${days} days apart; at least ${MIN_PROJECTION_SPAN_DAYS} are needed to project.`,
    )
  }

  const from = clamp01(earliest.pct as number)
  const to = clamp01(latest.pct as number)
  if (to <= from) {
    return none(
      'Progress has not moved forward between the two readings, so no completion date can be projected.',
    )
  }
  if (to >= 1) {
    return none('Already at target.')
  }

  const rate = (to - from) / days
  const remaining = 1 - to
  const daysOut = Math.ceil(remaining / rate)
  return {
    projectedCompletionDate: civilDate(civilMs(latest.observedOn) + daysOut * DAY_MS),
    projectionReason: null,
  }
}

/**
 * THE per-initiative progress verdict. `computePace` is called EXACTLY ONCE, on
 * every branch, from the table above.
 */
export function computeInitiativeProgress(i: InitiativeProgressInput): InitiativeProgress {
  const { baseline, current, target } = paceInputs(i)
  const pace = computePace({
    baseline,
    current,
    target,
    startDate: i.startDate ?? null,
    targetDate: i.dueDate ?? null,
    asOf: i.asOf,
  })

  const { projectedCompletionDate, projectionReason } = project(i)

  return {
    progressSource: i.progressSource,
    progressPct: pace.pctToTarget,
    progressBasis: basisFor(i),
    expectedPct: pace.expectedPct,
    paceStatus: pace.paceStatus,
    overshoot: pace.overshoot,
    riskSignal: riskSignalFor(i, pace.paceStatus),
    // ECHOED. Not derived from riskSignal, not defaulted.
    riskLevel: i.riskLevel,
    riskNote: i.riskNote,
    projectedCompletionDate,
    projectionReason,
    // `manual` and `null` are excluded ON PURPOSE and the exclusion lives here
    // rather than at the call site, so a later phase that adds an org-level score
    // cannot accidentally fold hand-set numbers into it.
    countsTowardRollup:
      i.progressSource === 'metric' ||
      i.progressSource === 'milestone' ||
      i.progressSource === 'task_rollup',
  }
}

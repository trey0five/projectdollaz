// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 Advancement v1 — PURE, framework-free, INJECTABLE-`now` fundraising
// campaign giving-progress helper, shared by BOTH the advancement AdvancementService
// (to enrich each list response) AND the analytics BriefingService (the new
// 'advancement' STEP). One source of truth → the register list and the briefing can
// never disagree about a campaign's progress or the giving rollup (mirrors
// maintenance-backlog.ts).
//
// DETERMINISM CONTRACT: like maintenance-backlog.ts / review-status.ts, this module
// reads NOTHING ambient — it never constructs a Date, never calls the clock, never
// touches I/O. It obeys the package PURITY GUARD (__tests__/purity.test.ts forbids
// the Date tokens): all date math is integer day-numbers via the shared
// daysFromCivil/toCivil helpers, so the same (input, now) ALWAYS yields the same
// result on any host/timezone.
//
// MONEY DISCIPLINE (the pure layer stays Prisma-free): goalAmount/raisedAmount arrive
// as `number | null` ONLY — the SERVICE converts Prisma.Decimal → number BEFORE
// calling this helper. All sums + the pct ratio compute in INTEGER CENTS then /100,
// so 100.10 + 200.20 === 300.30 exactly (no float drift). pctOfGoal is guarded to be
// null (NEVER Infinity/NaN) whenever the goal is absent/zero/negative/sub-cent.
//
// CLOSING-SOON HORIZON: a dedicated ADVANCEMENT_CLOSING_SOON_DAYS = 60. A campaign
// close date is an operational-scale deadline, so the 60-day cadence (same value as
// MAINTENANCE_DUE_SOON_DAYS) is the right default here.
// ─────────────────────────────────────────────────────────────────────────────
import { daysFromCivil, toCivil } from './review-status.js'

export type CampaignStatus = 'planned' | 'active' | 'closed'
/** 'none' = no closeDate, OR the campaign is closed (a closed campaign has no live clock). */
export type CampaignUrgency = 'closing-soon' | 'overdue' | 'on-track' | 'none'

/**
 * Default "closing soon" horizon for a campaign close date. Operational-scale, so it
 * reuses the 60-day cadence (== MAINTENANCE_DUE_SOON_DAYS). A dedicated named const
 * so the advancement domain owns its own tuning.
 */
export const ADVANCEMENT_CLOSING_SOON_DAYS = 60

/**
 * A SECTOR DEFAULT, not a hard truth: an active campaign below 60% of goal is
 * "behind". TUNABLE — surfaced as a named const so the domain owns its tuning.
 */
export const BEHIND_GOAL_THRESHOLD = 0.6

export interface CampaignProgressInput {
  status: string
  goalAmount: number | null
  raisedAmount: number | null
  /** yyyy-mm-dd string, a JS Date (@db.Date), or null. The campaign close date. */
  closeDate?: Date | string | null
}

export interface CampaignProgressResult {
  /** raised/goal, ONLY when goal is a finite number whose cents are > 0; else null (never Infinity/NaN). A RATIO (0.54 = 54%), NOT clamped — over-goal reads > 1. */
  pctOfGoal: number | null
  /**
   * goal - raised, SIGNED — positive = still short by that amount, negative = raised
   * OVER goal. Returned only when goal is a finite number (may be 0); else null.
   */
  gapToGoal: number | null
  urgency: CampaignUrgency
  /** Whole UTC days until close; negative = overdue by N; null when no closeDate/closed. */
  daysUntilClose: number | null
}

/**
 * Full per-campaign progress from goal/raised/closeDate. `now` is INJECTED for
 * determinism (tests pin a fixed value; callers pass the current time — only its UTC
 * accessors are read, never a Date constructed).
 *
 * A CLOSED campaign has no live clock → { urgency:'none', daysUntilClose:null } (like
 * a resolved maintenance item), BUT we STILL report pct/gap so a closed-under-goal
 * campaign stays legible in the list — only the live clock stops. A missing closeDate
 * also yields 'none'. Otherwise:
 *   daysUntilClose = (closeDate − today) in whole UTC days
 *   urgency = overdue (<0) | closing-soon (0..soonDays) | on-track (>)
 */
export function computeCampaignProgress(
  input: CampaignProgressInput,
  now: Date,
  soonDays = ADVANCEMENT_CLOSING_SOON_DAYS,
): CampaignProgressResult {
  // MONEY FIRST — computed for every campaign (incl. closed), in integer cents.
  const raised = input.raisedAmount ?? 0
  const goal = input.goalAmount
  const raisedCents = Math.round(raised * 100)
  // DIV-BY-ZERO GUARD: pct only when goal is a finite number whose cents are > 0.
  // Absent/zero/negative/non-finite/sub-cent goal → null (NEVER Infinity, NEVER NaN).
  // This is THE money-math invariant. The divisor is a positive INTEGER (cents).
  const goalCents = goal !== null && Number.isFinite(goal) ? Math.round(goal * 100) : null
  const pctOfGoal = goalCents !== null && goalCents > 0 ? raisedCents / goalCents : null
  // gapToGoal SIGNED, returned whenever goal is a finite number (may be 0).
  const gapToGoal =
    goal !== null && Number.isFinite(goal) ? (Math.round(goal * 100) - raisedCents) / 100 : null

  // A closed campaign has no live clock — report money, but urgency 'none'.
  if (input.status === 'closed') {
    return { pctOfGoal, gapToGoal, urgency: 'none', daysUntilClose: null }
  }

  // Date math via the shared UTC-day helpers (identical to computeMaintenanceUrgency).
  const civil = toCivil(input.closeDate ?? null)
  if (civil === null) return { pctOfGoal, gapToGoal, urgency: 'none', daysUntilClose: null }
  const closeDays = daysFromCivil(civil.y, civil.m, civil.d)
  const todayDays = daysFromCivil(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
  const daysUntilClose = closeDays - todayDays
  let urgency: CampaignUrgency
  if (daysUntilClose < 0) urgency = 'overdue'
  else if (daysUntilClose <= soonDays) urgency = 'closing-soon'
  else urgency = 'on-track'
  return { pctOfGoal, gapToGoal, urgency, daysUntilClose }
}

/**
 * The school giving rollup. Consumes the ALREADY-computed pctOfGoal + urgency from
 * computeCampaignProgress (one source of truth), mirroring how FacilitiesService
 * feeds urgency into summarizeBacklog.
 */
export interface GivingSummary {
  total: number
  /** status === 'active'. */
  activeCount: number
  /** Σ goalAmount (null → 0), integer-cents summed then /100. */
  totalGoal: number
  /** Σ raisedAmount (null → 0), integer-cents summed then /100. */
  totalRaised: number
  /** totalRaisedCents / totalGoalCents, null when totalGoalCents <= 0 (NO div-by-zero). */
  overallPctOfGoal: number | null
  /** active AND pctOfGoal !== null AND pctOfGoal < BEHIND_GOAL_THRESHOLD. */
  behindGoalActiveCount: number
  /** active AND urgency === 'closing-soon'. */
  closingSoonActiveCount: number
  /** active AND urgency === 'overdue'. */
  overdueActiveCount: number
}

export interface GivingSummaryInput {
  status: string
  goalAmount: number | null
  raisedAmount: number | null
  /** Precomputed by computeCampaignProgress (single source of truth). */
  pctOfGoal: number | null
  urgency: CampaignUrgency
}

/**
 * Roll a list of per-campaign {status,goalAmount,raisedAmount,pctOfGoal,urgency} up
 * into the school giving summary. Pure, deterministic; empty list → all zeros,
 * overallPctOfGoal null. Sums accumulate in integer cents (Math.round(x*100)) then
 * /100 (no float drift). overallPctOfGoal / behindGoal both null-safe:
 *   • overallPctOfGoal is null when totalGoalCents <= 0 (NO div-by-zero), and
 *   • a no-goal active campaign (pctOfGoal null) is NEVER counted as behind — you
 *     cannot be "behind" a goal you don't have. Iterates ONCE.
 */
export function summarizeGiving(items: readonly GivingSummaryInput[]): GivingSummary {
  let activeCount = 0
  let goalCents = 0
  let raisedCents = 0
  let behindGoalActiveCount = 0
  let closingSoonActiveCount = 0
  let overdueActiveCount = 0
  for (const it of items) {
    goalCents += Math.round((it.goalAmount ?? 0) * 100)
    raisedCents += Math.round((it.raisedAmount ?? 0) * 100)
    if (it.status === 'active') {
      activeCount += 1
      if (it.pctOfGoal !== null && it.pctOfGoal < BEHIND_GOAL_THRESHOLD) behindGoalActiveCount += 1
      if (it.urgency === 'closing-soon') closingSoonActiveCount += 1
      if (it.urgency === 'overdue') overdueActiveCount += 1
    }
  }
  return {
    total: items.length,
    activeCount,
    totalGoal: goalCents / 100,
    totalRaised: raisedCents / 100,
    overallPctOfGoal: goalCents > 0 ? raisedCents / goalCents : null,
    behindGoalActiveCount,
    closingSoonActiveCount,
    overdueActiveCount,
  }
}

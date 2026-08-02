// ─────────────────────────────────────────────────────────────────────────────
// The per-initiative rollup, lifted OUT of the plan traversal so it can be fed by
// two callers that must never disagree:
//
//   1. StrategyProgressService.computeForPlan — walks plan.pillars[].goals[]
//      .initiatives[] and rolls up ONE goal's initiatives at a time (Phase 5);
//   2. ImprovementService — a FLAT, school-scoped, goal-AGNOSTIC query over every
//      initiative the school has, including the ones that carry no goal at all
//      (AIC Phase G).
//
// Those two disagreeing is precisely the failure the Continuous Improvement
// Manager could ship: the same initiative counted "blocked" on /strategy and
// "planned" on /improvement, or stale on one page and fresh on the other. There
// is one counter and one staleness rule, and this is it.
//
// PURE by construction — no Nest, no Prisma, and CLOCK-FREE: `asOf` is a
// parameter, so the same rows at the same instant always roll up identically.
// Extracting it is a REFACTOR and nothing more; `phase-g-inert.spec.ts` holds the
// /strategy payload byte-identical across the move.
// ─────────────────────────────────────────────────────────────────────────────
import { STALE_INITIATIVE_DAYS } from './strategy.constants.js'
import type { InitiativeStatusCounts, StaleInitiativeView } from './strategy.types.js'

/** The only columns the rollup reads. Both callers project down to this. */
export interface InitiativeRow {
  id: string
  title: string
  status: string
  updatedAt: Date
  owner: { firstName: string | null; lastName: string | null; email: string } | null
}

export interface InitiativeRollup {
  initiativeStatusCounts: InitiativeStatusCounts
  /** RAW sums over the rows handed in; the caller decides whether to surface them. */
  linkedTaskCounts: { total: number; done: number }
  /** In row order. The CALLER owns the final sort (staleDays desc today). */
  stale: StaleInitiativeView[]
}

/** Human display name for an owner row (firstName lastName, else email). */
export function ownerName(
  u: { firstName: string | null; lastName: string | null; email: string } | null,
): string {
  if (!u) return ''
  const full = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
  return full || u.email
}

export const EMPTY_INITIATIVE_COUNTS = (): InitiativeStatusCounts => ({
  planned: 0,
  in_progress: 0,
  blocked: 0,
  done: 0,
  cancelled: 0,
})

/**
 * Count a set of initiatives by status, sum their linked-task counts, and name
 * the STALE ones.
 *
 * STALENESS IS GUARDED BY STATUS on purpose: only `planned` and `in_progress`
 * rows can go stale. A `done` or `cancelled` initiative that nobody has touched
 * in a year is not neglected work — it is finished work, and surfacing it as
 * "needs attention" is how an attention list stops being read.
 */
export function rollUpInitiatives(
  initiatives: readonly InitiativeRow[],
  tasksByInitiative: ReadonlyMap<string, { total: number; done: number }>,
  asOf: Date,
  staleAfterDays: number = STALE_INITIATIVE_DAYS,
): InitiativeRollup {
  const initiativeStatusCounts = EMPTY_INITIATIVE_COUNTS()
  let linkedTotal = 0
  let linkedDone = 0
  const stale: StaleInitiativeView[] = []

  for (const ini of initiatives) {
    const st = ini.status as keyof InitiativeStatusCounts
    if (st in initiativeStatusCounts) initiativeStatusCounts[st] += 1
    const t = tasksByInitiative.get(ini.id)
    if (t) {
      linkedTotal += t.total
      linkedDone += t.done
    }
    const staleDays = Math.floor((asOf.getTime() - ini.updatedAt.getTime()) / 86_400_000)
    if ((ini.status === 'planned' || ini.status === 'in_progress') && staleDays > staleAfterDays) {
      stale.push({
        title: ini.title,
        ownerName: ini.owner ? ownerName(ini.owner) : null,
        status: ini.status,
        staleDays,
      })
    }
  }

  return { initiativeStatusCounts, linkedTaskCounts: { total: linkedTotal, done: linkedDone }, stale }
}

// Closed vocabularies for the Strategic Planning module. Kept in ONE place so the
// DTO @IsIn arrays and the service normalizers can never drift, and the migration's
// TEXT + @default columns stay in lockstep (same pattern as accreditation ratings).

/** Plan lifecycle. adoptedAt is stamped by the service when status → 'adopted'. */
export const PLAN_STATUSES = ['draft', 'adopted', 'archived'] as const
export type PlanStatus = (typeof PLAN_STATUSES)[number]

/** How a goal's progress is measured. */
export const GOAL_TYPES = ['metric', 'milestone', 'task_rollup', 'manual'] as const
export type GoalType = (typeof GOAL_TYPES)[number]

/** Initiative execution status (rolls up into initiativeStatusCounts). */
export const INITIATIVE_STATUSES = [
  'planned',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
] as const
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number]

/** Metric keys that are a $-total-under-a-share-unit (donut) — cannot be a bound
 *  goal target (there is no single number to march toward). REJECTED at bind. */
export const MIX_METRIC_KEYS = ['revenue_mix', 'expense_mix'] as const

/** An initiative unchanged for at least this many days (and still open) is STALE. */
export const STALE_INITIATIVE_DAYS = 60

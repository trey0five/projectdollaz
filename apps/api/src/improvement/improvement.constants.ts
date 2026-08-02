// Closed vocabularies for the Continuous Improvement Manager, in ONE place so the
// DTO `@IsIn` arrays, the service normalizers and the migration's TEXT columns can
// never drift — the same pattern strategy.constants.ts sets.

/**
 * Where an initiative came from. `manual` is the DEFAULT and is the literal truth
 * about every row that existed before AIC Phase G: a person typed it in.
 * `draft` is a recommendation a school has started but not committed to.
 */
export const IMPROVEMENT_ORIGIN_TYPES = ['manual', 'gap', 'assurance', 'finding', 'draft'] as const
export type ImprovementOriginType = (typeof IMPROVEMENT_ORIGIN_TYPES)[number]

/**
 * How progress is MEASURED. Note what is NOT here: `null`, which is stored on
 * every legacy row and means "status only". It is deliberately not a value a
 * client can send — you cannot ASK for status-only, you simply have not bound a
 * source yet.
 */
export const IMPROVEMENT_PROGRESS_SOURCES = ['metric', 'milestone', 'task_rollup', 'manual'] as const
export type ImprovementProgressSource = (typeof IMPROVEMENT_PROGRESS_SOURCES)[number]

/** The HUMAN risk judgement. Distinct from the COMPUTED `riskSignal`, always. */
export const IMPROVEMENT_RISK_LEVELS = ['low', 'medium', 'high'] as const
export type ImprovementRiskLevel = (typeof IMPROVEMENT_RISK_LEVELS)[number]

/** The source of one recorded progress observation. */
export const PROGRESS_EVENT_SOURCES = IMPROVEMENT_PROGRESS_SOURCES
export type ProgressEventSource = ImprovementProgressSource

/**
 * The audit `targetType` for every initiative write, old and new.
 *
 * IT IS THE TABLE NAME AND THE TABLE WAS NOT RENAMED. Phase G renamed the Prisma
 * MODEL (StrategyInitiative → ImprovementInitiative) while `@@map` kept the table
 * as `strategy_initiatives`. Writing a second targetType here would orphan every
 * existing audit row from any query that filters on it.
 */
export const INITIATIVE_AUDIT_TARGET = 'strategy_initiatives'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase D — the FINDING VALUE VOCABULARIES.
//
// TEXT columns + `@IsIn` at every boundary is the house convention (Policy.status,
// AccreditationEvidence.kind, MaintenanceItem.priority all do exactly this): a
// Postgres enum makes every vocabulary change a migration, and this program will
// grow rule ids and severities faster than it will grow tables.
//
// Phase D WRITES these values through typed helpers and exposes no route at all.
// Phase E's DTOs must `@IsIn` each array below or the global forbidNonWhitelisted
// ValidationPipe (and the service-level value check) will 400.
//
// LEDGER ROW 36, MECHANISED: `FINDING_LIKELIHOODS` is an ORDINAL vocabulary of two
// WORDS. There is no outcome data anywhere in this program to calibrate a
// probability against, so no numeric probability is stored, derived, or emitted.
// A spec asserts every member is a non-numeric string — that assertion is the
// difference between a documented promise and an enforced one.
// ─────────────────────────────────────────────────────────────────────────────

export const FINDING_SEVERITIES = ['info', 'warn', 'critical'] as const
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number]

/**
 * Written ONLY by a human action. Reconciliation cannot name this column —
 * `ReconcileWrite` has no `status` field, which is what makes "findings never
 * auto-close" a compile error rather than a code-review comment.
 */
export const FINDING_STATUSES = [
  'open',
  'acknowledged',
  'muted',
  'resolved',
  'dismissed',
] as const
export type FindingStatus = (typeof FINDING_STATUSES)[number]

/** ORDINAL. NEVER numeric. See the file header. */
export const FINDING_LIKELIHOODS = ['possible', 'likely'] as const
export type FindingLikelihood = (typeof FINDING_LIKELIHOODS)[number]

/**
 * Reconciliation writes only 'improved' and 'stale_data'. 'dismissed' is a human
 * resolution and is never written by the nightly job.
 */
export const FINDING_RESOLUTIONS = ['improved', 'stale_data', 'dismissed'] as const
export type FindingResolutionKind = (typeof FINDING_RESOLUTIONS)[number]

/** Mirrors `HorizonKind` in @finrep/compliance; stored as TEXT. */
export const HORIZON_KINDS = ['by_date', 'periods_to_breach', 'none'] as const
export type FindingHorizonKind = (typeof HORIZON_KINDS)[number]

/**
 * The trend-signal ladder, reused VERBATIM as the finding confidence vocabulary.
 * Duplicated here as a runtime array (the pure package owns the type) so a DTO
 * can `@IsIn` it without importing a type-only symbol.
 */
export const FINDING_CONFIDENCES = [
  'insufficient',
  'observation',
  'directional',
  'trend',
] as const

/** Type guards — the service-side half of the TEXT + @IsIn discipline. */
export function isFindingSeverity(v: unknown): v is FindingSeverity {
  return typeof v === 'string' && (FINDING_SEVERITIES as readonly string[]).includes(v)
}
export function isFindingStatus(v: unknown): v is FindingStatus {
  return typeof v === 'string' && (FINDING_STATUSES as readonly string[]).includes(v)
}
export function isFindingLikelihood(v: unknown): v is FindingLikelihood {
  return typeof v === 'string' && (FINDING_LIKELIHOODS as readonly string[]).includes(v)
}
export function isFindingResolutionKind(v: unknown): v is FindingResolutionKind {
  return typeof v === 'string' && (FINDING_RESOLUTIONS as readonly string[]).includes(v)
}

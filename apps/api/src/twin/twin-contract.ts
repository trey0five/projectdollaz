import type { Prisma, ModuleKey } from '@finrep/db'
import type { MetricKey } from '@finrep/analytics'
import type { DomainKey, SmallCell, TrendConfidence, TrendSignal } from '@finrep/compliance'
import type {
  FindingLikelihood,
  FindingResolutionKind,
  FindingSeverity,
  FindingHorizonKind,
} from './finding-vocab.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase D — THE TWIN CONTRACT.
//
// Everything the signal catalog, the rule engine and the reconciliation agree on,
// in one file with no I/O and no Nest decorators, so a rule author in Phase E can
// read the whole surface in one sitting.
//
// THE ONE IDEA WORTH RE-READING: a signal is never OMITTED. `TwinSignalSet.signals`
// is ALWAYS the complete catalog, in catalog order, and a signal that cannot be
// read carries a reason for why. An omitted signal is an invisible hole; the whole
// point of the catalog is that the holes are countable.
//
// AND THE SECOND: `ReconcileWrite` (bottom of this file) is deliberately missing a
// `status` field. That absence is the mechanism behind "findings never auto-close"
// — the nightly job cannot name a column this interface does not have.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The catalog's key vocabulary. FROZEN ORDER — it is the render order, the
 * collection order and the order of `TwinSignalSet.signals`.
 *
 * Lives in the contract rather than the catalog so a Phase-E rule can declare
 * `requiredSignals` against the type without importing the catalog's data.
 */
export const TWIN_SIGNAL_KEYS = [
  'fin.operating_margin',
  'fin.days_cash_on_hand',
  'fin.months_operating_reserve',
  'fin.tuition_dependency',
  'fin.tuition_discount_rate',
  'fin.cost_per_pupil',
  'fin.net_tuition_per_student',
  'aid.pct_students_on_aid',
  'hr.student_teacher_ratio',
  'hr.teaching_staff_share',
  'hr.total_staff_fte',
  'enr.enrollment_vs_plan',
  'plan.plan_readiness',
  'fin.ar_aging',
  'fin.budget_present',
  'gov.minutes_lag',
  'gov.meeting_cadence',
  'gov.policy_review',
  'gov.board_terms',
  'gov.committee_chairs',
  'strat.plan_horizon',
  'fac.maintenance_backlog',
  'enr.headcount',
  'enr.feeder_grades',
  'svc.support_needs',
  'acc.evidence_currency',
  'acc.readiness_series',
  'acc.unscored_standards',
  'acc.unsupported_score',
  'hr.staff_evaluations',
  'fac.inspections',
  'hr.pd_participation',
  'safe.clearances',
  'acad.assessment_growth',
  'curr.doc_review',
  // AIC Phase F — APPENDED, never inserted. This list is the render order, the
  // collection order and the order of `TwinSignalSet.signals`; appending moves no
  // existing row, so the boot-time catalog/key assertion and every ordinal
  // expectation downstream are untouched.
  'acc.prior_visit_findings',
] as const

export type TwinSignalKey = (typeof TWIN_SIGNAL_KEYS)[number]

// ── AIC Phase F — the TWO OVERDUE PREDICATES, defined ONCE ───────────────────
//
// They live in the contract for the same reason everything else here does: two
// services read these registers for one school in one request (TwinSignalsService
// produces the SCALAR the rule gates on, TwinRegisterService produces the COUNT
// SUMMARY the rule's rationale renders), and a second copy of the arithmetic is
// exactly how a rationale ends up disagreeing with the number that fired it.
//
// Both are pure, both take `today` as a yyyy-mm-dd PARAMETER, and neither reads a
// clock. They name no person and no free text.

/** UTC calendar day of a Date as yyyy-mm-dd. */
function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * An evaluation is OVERDUE when it is past the date the school's own register set
 * for it and nothing says it happened.
 *
 * `completedDate !== null` WINS OVER ANY STATUS VALUE: an evaluation that has a
 * completion date happened, whatever the status column says. Reading the status
 * first would let a stale workflow field manufacture an overdue evaluation that the
 * school can see, in its own register, did not happen — a sentence out-running the
 * data.
 */
export function isEvaluationOverdue(
  row: { dueDate: Date; completedDate: Date | null; status: string },
  todayIso: string,
): boolean {
  if (row.completedDate !== null) return false
  if (row.status === 'completed' || row.status === 'waived') return false
  return utcDay(row.dueDate) < todayIso
}

/**
 * A compliance inspection is OVERDUE when the item DECLARES what kind of inspection
 * it is, is not resolved, and carries a target date now in the past.
 *
 * `complianceKind !== null` is the whole gate and it is never inferred from `title`
 * or `category`. An item with no target date is not overdue: we will not invent a
 * deadline the school never set.
 */
export function isInspectionOverdue(
  item: { status: string; targetDate: Date | null; complianceKind: string | null },
  todayIso: string,
): boolean {
  if (item.complianceKind === null) return false
  if (item.status === 'resolved') return false
  if (item.targetDate === null) return false
  return utcDay(item.targetDate) < todayIso
}

/**
 * The four ways a signal resolves. Resolution order is frozen and first-match-wins
 * (see TwinSignalsService §3.3):
 *   1. declaredNotTracked  -> 'not_tracked'  (collector NEVER invoked)
 *   2. module not licensed -> 'not_licensed' (query NEVER issued)
 *   3. collector returned nothing -> 'no_data'
 *   4. otherwise -> 'available'
 */
export type SignalAvailability = 'available' | 'not_licensed' | 'no_data' | 'not_tracked'

/**
 * F14. NOT a freshness ladder — a statement about whether new information ARRIVED.
 *
 * The misfire this type exists to prevent: "no update in N days is stale" would
 * have an annual artifact screaming for six months about a school doing nothing
 * wrong. `staleAfterDays` is derived from the signal's OWN expected cadence, so a
 * 200-day-old annual reading is `unchanged` and a 70-day-old AR aging is not.
 */
export type SignalChangeState = 'moved' | 'unchanged' | 'stale_data' | 'never_observed'

export type SignalKind = 'metric' | 'trend' | 'register' | 'evidence' | 'readiness' | 'roster'

/** Where a signal's number came from — carried into the finding's basis chain. */
export interface SignalSource {
  table: string
  field?: string
  metricKey?: MetricKey
  /** The phase that would light a declaredNotTracked signal. */
  phase?: 'F' | 'K' | 'deferred'
}

export interface TwinSignalDef {
  key: TwinSignalKey
  label: string
  kind: SignalKind
  /** Module that must be licensed to READ this signal. null = core, never gated. */
  moduleKey: ModuleKey | null
  /** Named for the lineage payload and for the not_tracked copy. */
  source: SignalSource
  /**
   * F14 — how often this signal is EXPECTED to move.
   *
   * TUNABLE SECTOR DEFAULT, documented as such exactly like DEFAULT_BANDS in
   * packages/analytics/src/health.ts. None of these is a hard truth: 400 is "an
   * annual artifact, plus slack for a late close"; 120 is "a term"; 90 a quarter;
   * 45 a monthly close plus slack; 7 a nightly capture plus a long weekend.
   */
  expectedCadenceDays: number
  /** True when the value derives from student rows -> small-cell suppression is MANDATORY. */
  ferpaSensitive: boolean
  domainKeys: DomainKey[]
  /** Declared 'not_tracked' at the catalog level: never queried, always a named hole. */
  declaredNotTracked?: { reason: string }
}

export interface SignalLineage {
  table: string
  field?: string
  metricKey?: string
}

export interface TwinSignal {
  key: TwinSignalKey
  label: string
  kind: SignalKind
  availability: SignalAvailability
  /** Non-null whenever availability !== 'available'. Rendered VERBATIM. */
  unavailableReason: string | null
  moduleKey: ModuleKey | null
  value: number | string | boolean | null
  /** Only for kind 'trend'. */
  trend: TrendSignal | null
  /** yyyy-mm-dd — the date the SOURCE ROW describes, not when we read it. */
  observedOn: string | null
  ageDays: number | null
  expectedCadenceDays: number
  staleAfterDays: number
  changeState: SignalChangeState
  ferpaSensitive: boolean
  /** Present and suppressed for every ferpaSensitive signal. */
  cells: SmallCell[] | null
  domainKeys: DomainKey[]
  lineage: SignalLineage | null
}

export interface TwinSignalSet {
  schoolId: string
  /** ISO instant this set was collected. */
  generatedAt: string
  /** ALWAYS the full catalog, in catalog order. A signal is never omitted. */
  signals: TwinSignal[]
  counts: Record<SignalAvailability, number>
  /** Inherited from the newest readiness snapshot's isDemo (Phase-A discipline). */
  demoData: boolean
  /**
   * yyyy-mm-dd of the newest AccreditationReadinessSnapshot, or null when the
   * school has none. Reconciliation stamps this onto every finding's basis so a
   * finding cites a reading that actually exists — never today's date, and never
   * a capture that did not land.
   *
   * DEVIATION FROM THE SPEC'S §3.7 LISTING, deliberate and additive: §5.2 requires
   * reconciliation to stamp `evidencePayload.snapshotAsOf` from the newest
   * snapshot. Carrying it on the set the collector already read costs nothing;
   * re-querying it in the reconciliation would be a second read of the same row
   * one hour later, which is exactly the kind of drift this program hunts.
   */
  snapshotAsOf: string | null
}

// ── The rule surface (Phase E populates it; Phase D ships it empty) ──────────

/**
 * What a rule emits when it fires. Note what is NOT here: `status`, `primaryDomainKey`
 * (resolved per factKey by fact-domains.ts, never by the rule), `firstSeenAt`
 * (owned by the ledger) and any numeric probability.
 */
export interface FiredFinding {
  ruleId: string
  /** 'school' | 'standard:<uuid>' | 'policy:<uuid>' | … */
  scopeKey: string
  /** F3 — the underlying FACT, e.g. 'metric:operating_margin@FY2026'. */
  factKey: string
  /** School standard CODES (or ids) this would be cited under. */
  standardTags: string[]
  /** Every domain the finding TOUCHES — for RENDERING. Counting uses primaryDomainKey. */
  domainKeys: DomainKey[]
  /** Used when standardTags resolve to no domain weight at all. */
  defaultDomainKey: DomainKey
  severity: FindingSeverity
  /** ORDINAL word or null. A percentage here would be invented. */
  likelihood: FindingLikelihood | null
  confidence: TrendConfidence
  horizonKind: FindingHorizonKind
  horizonDate: Date | null
  horizonPeriods: number | null
  horizonConfidence: TrendConfidence | null
  /** The BASIS CHAIN. A finding with an empty basis is a bug, not a prediction. */
  evidencePayload: Record<string, unknown>
}

export interface TwinRule {
  id: string
  /** Signals this rule cannot be evaluated without — drives `resolutionKind`. */
  requiredSignals: readonly TwinSignalKey[]
  evaluate(signals: TwinSignalSet, at: Date): FiredFinding[]
}

/**
 * The ONLY fields reconciliation may write to an existing finding.
 *
 * `status`, `mutedUntil`, `mutedReason`, `ackedUntil`, `initiativeId` and
 * `lastNotifiedAt` are DELIBERATELY ABSENT. TypeScript, not a code-review comment,
 * is what makes "findings never auto-close" true: a nightly job cannot name a
 * field this interface does not have.
 */
export interface ReconcileWrite {
  lastSeenAt: Date
  severity: FindingSeverity
  likelihood: FindingLikelihood | null
  confidence: TrendConfidence
  standardTags: string[]
  domainKeys: DomainKey[]
  primaryDomainKey: DomainKey
  horizonKind: FindingHorizonKind
  horizonDate: Date | null
  horizonPeriods: number | null
  horizonConfidence: TrendConfidence | null
  evidencePayload: Prisma.InputJsonValue
  payloadHash: string
  clearedAt: Date | null
  resolutionKind: FindingResolutionKind | null
  reopenCount?: number
  isDemo: boolean
  engineVersion: string
}

export interface ReconcileSummary {
  runId: string
  rules: number
  schoolsScanned: number
  schoolsSkipped: number
  signalsCollected: number
  counts: Record<SignalAvailability, number>
  created: number
  updated: number
  touched: number
  cleared: number
  reopened: number
  durationMs: number
}

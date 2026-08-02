// ─────────────────────────────────────────────────────────────
// @finrep/compliance — pure, deterministic Florida scholarship AUP readiness
// pre-flag engine. ZERO UI, ZERO I/O. Consumes @finrep/engine for TYPES ONLY, and
// @finrep/analytics for types plus ONE runtime value: `bandsFor`, the frozen band
// table (AIC Phase E). A metric's risk line has exactly one owner, and re-typing
// `3` for the reserve threshold here would create a second source of truth for a
// number analytics already publishes. The dependency stays one-directional —
// compliance depends on analytics, never the reverse.
//
// READINESS PRE-FLAG, NOT the official AUP and NOT legal/audit advice. Mirrors the
// Step Up For Students AUP template + the governing Florida statutes.
// ─────────────────────────────────────────────────────────────

// Types
export type {
  Program,
  Section,
  Severity,
  RuleKind,
  FindingStatus,
  ComplianceInputs,
  ComplianceFinancials,
  ComplianceFacts,
  RuleResult,
  Rule,
  Finding,
  ComplianceCounts,
  ComplianceSummary,
  RulesetDescriptor,
} from './types.js'

// Ruleset descriptor(s)
export { FL_SCHOLARSHIP_AUP, RULESETS } from './ruleset.js'

// Registry
export { RULE_REGISTRY, RULE_BY_ID } from './registry.js'

// Evaluate + grouping
export { evaluateCompliance, groupBySection, SECTION_ORDER } from './evaluate.js'

// Summarize
export { summarize } from './summarize.js'

// Version
export { COMPLIANCE_VERSION } from './version.js'

// Phase 2B — scholarship reconciliation (pure)
export type {
  ScholarshipProgram,
  Disbursement,
  ReconciliationInput,
  ProgramBreakdown,
  MonthBreakdown,
  ReconciliationStatus,
  AnomalyType,
  Anomaly,
  ReconciliationResult,
} from './reconcile.js'
export {
  reconcileScholarships,
  SCHOLARSHIP_PROGRAMS,
  DEFAULT_TOLERANCE_ABS,
  DEFAULT_TOLERANCE_PCT,
} from './reconcile.js'

// Phase 2D — Corrective Action Plan scaffold (pure)
export type { CapScaffoldEntry, CapTemplate, ScaffoldOptions } from './scaffold.js'
export {
  scaffoldCorrectiveActionPlan,
  CAP_TEMPLATES,
  GENERIC_TEMPLATE,
} from './scaffold.js'

// Phase 2C — Year-End Review Readiness checklist builder (pure)
export type {
  ChecklistItem,
  ChecklistGroup,
  ChecklistItemKind,
  ChecklistSection,
} from './checklist.js'
export { buildYearEndChecklist, SECTION_TITLES } from './checklist.js'

// Phase 3 Governance v1 — pure policy review-status (injectable now)
export type { ReviewStatus, PolicyReviewInput, PolicyReviewResult, Civil } from './review-status.js'
export {
  computeReviewStatus,
  DUE_SOON_DAYS,
  BADLY_OVERDUE_DAYS,
  // Phase 3 Workflow depth — civil date helpers reused by the recurrence math.
  addMonths,
  civilFromDays,
  civilToIso,
  // AIC Phase C — the API's currency translation layer does the same
  // month-end-safe date math as the pure engine, through the SAME helpers.
  toCivil,
  daysFromCivil,
} from './review-status.js'

// Phase 3 Governance depth — meetings/committees board signal (pure, injectable now)
export type {
  MeetingStatus,
  MinutesStatus,
  MeetingSignalInput,
  MeetingSignal,
  MeetingSummaryItem,
  MeetingsSummary,
} from './meeting-governance.js'
export {
  computeMeetingSignal,
  summarizeMeetings,
  AGENDA_DUE_SOON_DAYS,
  MINUTES_APPROVAL_SLA_DAYS,
  MINUTES_BADLY_OVERDUE_DAYS,
} from './meeting-governance.js'

// Phase 3 Workflow v1 — pure task urgency (injectable now)
export type { TaskUrgency, TaskUrgencyInput, TaskUrgencyResult, TaskRecurrence } from './task-urgency.js'
export {
  computeTaskUrgency,
  TASK_DUE_SOON_DAYS,
  // Phase 3 Workflow depth — recurring-task next-occurrence date math (pure).
  nextTaskOccurrence,
  TASK_RECURRENCES,
} from './task-urgency.js'

// Phase 4 Accreditation v1 — pure coverage + review-urgency (injectable now)
export type {
  CoverageStatus,
  StandardCoverageInput,
  StandardCoverage,
  SchoolCoverageSummary,
  // Phase 4 depth — per-standard rating rollup.
  StandardRating,
  RatingSummary,
} from './accreditation-coverage.js'
export {
  coverageForStandard,
  computeStandardCoverage,
  summarizeCoverage,
  ACCREDITATION_REVIEW_SOON_DAYS,
  // Phase 4 depth — per-standard rating rollup (evidence coverage unchanged).
  STANDARD_RATINGS,
  normalizeRating,
  summarizeRatings,
} from './accreditation-coverage.js'

// Accreditation Phase 3 — pure rubric-readiness engine (framework catalog / IEQ-style index)
export type {
  EvidenceTag,
  StatusBand,
  ReadinessFrameworkInput,
  ReadinessLeafInput,
  SchoolReadiness,
  ReadinessGap,
  TargetGap,
  AssuranceLeafInput,
  AssuranceStatus,
} from './accreditation-readiness.js'
export {
  RUBRIC_MIN,
  RUBRIC_MAX,
  RUBRIC_WEIGHT,
  EVIDENCE_WEIGHT,
  EVIDENCE_TAGS,
  BELOW_THRESHOLD_LABEL,
  normalizeRubricScore,
  standardReadiness,
  bandForIndex,
  schoolReadiness,
  computeGaps,
  computeTargetGap,
  computeAssurances,
} from './accreditation-readiness.js'

// Accreditation Intelligence Phase A — pure readiness HISTORY (observed change +
// the exact four-way delta decomposition). Never a forecast, never a projection.
export type {
  LeafScore,
  ReadinessPoint,
  SeriesBreakKind,
  SeriesBreak,
  ChangeConfidence,
  ChangeDirection,
  ObservedChange,
  ReadinessDecomposition,
  ReadinessDiff,
} from './readiness-history.js'
export {
  READINESS_HISTORY_VERSION,
  MIN_MATERIAL_DELTA_PCT,
  MIN_POINTS_FOR_DIRECTION,
  MIN_SPAN_DAYS_FOR_DIRECTION,
  selfScoredPct,
  verifiedPct,
  decomposeReadinessDelta,
  diffLeafScores,
  summarizeObservedChange,
  downsampleMonthly,
} from './readiness-history.js'

// Accreditation Intelligence Phase B — the domain map. The CLOSED ten-domain
// vocabulary + the fractional-weight math that re-expresses one framework's
// leaves as ten honest readings — or as an explicit refusal with a reason.
export type {
  DomainKey,
  DomainWeights,
  DomainMap,
  DomainReadinessOptions,
  DomainReadiness,
  DomainConfidence,
} from './accreditation-domains.js'
export {
  ACCREDITATION_DOMAINS_VERSION,
  DOMAIN_KEYS,
  DOMAIN_LABELS,
  DOMAIN_REASON_NOUN,
  MIN_DOMAIN_LEAVES,
  DOMAIN_WEIGHT_EPSILON,
  SIGNAL_ATTRIBUTION_MIN_WEIGHT,
  isDomainKey,
  normalizeDomainWeights,
  computeDomainReadiness,
  computeDomainConfidence,
} from './accreditation-domains.js'

// Accreditation Intelligence Phase C — evidence currency. "Does the required
// evidence exist, is it dated, and is it still current" — or an explicit,
// named refusal. `not_tracked` and `unknown` are first-class answers that sit in
// NEITHER side of every denominator; a date is never inferred.
export type {
  RequirementTag,
  SourceRegister,
  CurrencyState,
  DataAvailability,
  WindowKind,
  CurrencyBasis,
  EvidenceCycle,
  RequirementInput,
  ArtifactInput,
  CurrencyResult,
  RequirementCurrency,
  EvidenceHealth,
  CurrencyLeafInput,
} from './evidence-currency.js'
export {
  EVIDENCE_CURRENCY_VERSION,
  REQUIREMENT_EXTRA_TAGS,
  REQUIREMENT_TAGS,
  SOURCE_REGISTERS,
  EXPIRING_LEAD_CAP_DAYS,
  CURRENCY_RANK,
  CURRENCY_LABEL,
  NOT_TRACKED_LEAD,
  UNEARNED_REGISTER_LEAD,
  isRequirementTag,
  isSourceRegister,
  expiringLeadDaysFor,
  computeArtifactCurrency,
  computeRequirementCurrency,
  computeEvidenceHealth,
  verifiedPctCurrent,
} from './evidence-currency.js'

// Accreditation Intelligence Phase C — commendations. The one surface that says
// what a school can DEFEND: a strong self-score AND current evidence AND a
// favorable bound operating figure. All three, or it is not on the list.
export type {
  CommendationLeafInput,
  CommendationSignalInput,
  Commendation,
  CommendationExclusions,
  CommendationOptions,
} from './accreditation-commendations.js'
export {
  COMMENDATIONS_VERSION,
  COMMENDATION_MIN_RUBRIC,
  COMMENDATION_LIMIT,
  computeCommendations,
  computeCommendationExclusions,
} from './accreditation-commendations.js'

// Phase 4 Facilities v1 — pure deferred-maintenance backlog (injectable now)
export type {
  MaintenancePriority,
  MaintenanceStatus,
  MaintenanceUrgency,
  MaintenanceUrgencyInput,
  MaintenanceUrgencyResult,
  MaintenanceBacklogSummary,
  MaintenanceBacklogInput,
  MaintenanceRecurrence,
  MaintenanceDecisionInput,
  MaintenanceDecisionSummary,
} from './maintenance-backlog.js'
export {
  computeMaintenanceUrgency,
  summarizeBacklog,
  summarizeDecisions,
  MAINTENANCE_DUE_SOON_DAYS,
  // Facilities depth — recurring-item next-occurrence date math (pure).
  nextMaintenanceOccurrence,
  MAINTENANCE_RECURRENCES,
} from './maintenance-backlog.js'

// Phase 4 Advancement v1 — pure campaign giving-progress + giving summary (injectable now)
export type {
  CampaignStatus,
  CampaignUrgency,
  CampaignProgressInput,
  CampaignProgressResult,
  GivingSummaryInput,
  GivingSummary,
} from './advancement-giving.js'
export {
  computeCampaignProgress,
  summarizeGiving,
  ADVANCEMENT_CLOSING_SOON_DAYS,
  BEHIND_GOAL_THRESHOLD,
} from './advancement-giving.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase D — trend statistics (pure)
//
// The arithmetic that decides whether a number is allowed to be called a trend,
// and refuses in four named ways when it is not: the confidence ladder
// (insufficient -> observation -> directional -> trend), exact Mann-Kendall below
// n=9, the Theil-Sen slope, the per-metric materiality floor, the two
// independent granularity gates that refuse cumulative within-year rows, and
// small-cell suppression for every per-cohort count.
// ─────────────────────────────────────────────────────────────────────────────
export type {
  MoveFloor,
  MetricIneligibility,
  XY,
  TheilSenResult,
  MannKendallMethod,
  MannKendallResult,
  TrendConfidence,
  TrendDirection,
  TrendFavourability,
  TrendRefusal,
  TrendCapReason,
  TrendCap,
  TrendSignalOptions,
  TrendMateriality,
  TrendSignal,
  HorizonKind,
  Horizon,
} from './trend-signal.js'
export {
  TREND_SIGNAL_VERSION,
  DAYS_PER_YEAR,
  MK_ALPHA,
  MIN_N_FOR_TREND,
  MIN_N_FOR_NORMAL_APPROX,
  IRREGULAR_GAP_MULTIPLE,
  MONTH_ALIGNMENT_TOLERANCE_MONTHS,
  MAX_HORIZON_YEARS,
  TREND_EPSILON,
  MAX_INVERSIONS_AT_05,
  TREND_WORD,
  MIN_ANNUAL_MOVE,
  TrendGranularityError,
  medianOf,
  theilSen,
  mannKendallExact,
  fiscalYearOf,
  computeTrendSignal,
  estimateHorizon,
} from './trend-signal.js'

export type { SmallCell, SmallCellReason } from './small-cells.js'
export {
  SMALL_CELLS_VERSION,
  MIN_CELL,
  SMALL_CELL_BAND,
  ZERO_IS_PUBLISHABLE,
  suppressSmallCells,
  suppressSmallCellSet,
  isSuppressed,
} from './small-cells.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — the accreditation TWIN / early-warning rule engine (pure).
//
// The twenty-five rules that fire (AIC Phase F took it from twenty-two by adding
// HR-EVAL-OVERDUE, FAC-INSPECTION-DUE and ACC-PRIOR-FINDING-OPEN), the four that
// ship VISIBLE and cannot evaluate
// (with the intake that would close each), the 40·C + 40·T + 20·E per-standard
// risk with its mandatory drivers, and the ordinal domain bands counted over
// DISTINCT factKeys.
//
// The contract in one line: a rule fires only when every signal it declared is
// `available` and its predicate is true — otherwise it refuses, by name, into
// `notEvaluated[]`. Every numeral in a rationale comes from that finding's
// `evidence[]`; every finding carries a real school standard code; likelihood is
// two ordinal words and never a percentage.
// ─────────────────────────────────────────────────────────────────────────────
export type {
  TwinSignalAvailability,
  TwinSignalChangeState,
  TwinSignalLineage,
  TwinSignalView,
  TwinRequirementView,
  TwinStandardView,
  TwinEvidenceGroupView,
  TwinRegisterView,
  // AIC Phase F — the three register-axis views the new rules read.
  TwinPriorVisitCitationView,
  TwinStaffEvaluationSummaryView,
  TwinComplianceInspectionSummaryView,
  PriorFact,
  TwinSeverity,
  TwinLikelihood,
  TwinRiskBand,
  TwinEvidenceEntry,
  TwinFinding,
  NotEvaluatedReason,
  TwinNotEvaluated,
  TwinRiskDriver,
  TwinStandardRisk,
  TwinDomainBand,
  TwinCoverage,
  TwinResult,
  TwinRuleKind,
  TwinFrameworkCode,
  TwinRuleUnlock,
  TwinFindingDraft,
  RuleContext,
  TwinRuleDef,
  TwinRuleId,
} from './accreditation-twin.js'
export {
  ACCREDITATION_TWIN_VERSION,
  TWIN_RULE_IDS,
  TWIN_RULE_DEFS,
  TWIN_RULES_BY_ID,
  TWIN_THRESHOLDS,
  TWIN_SEVERITIES,
  TWIN_LIKELIHOODS,
  TWIN_FRAMEWORK_CODES,
  VISIBLE_HOLE_RULE_IDS,
  ENTRY_GRADE_KEYS,
  TWIN_NO_REASON_FALLBACK,
  FAC_BACKLOG_HONESTY_NOTE,
  TwinTemplateError,
  TwinUndeclaredSignalError,
  TwinCannotEvaluate,
  daysBetweenCivil,
  formatCivilDate,
  bandForRisk,
  bandForFacts,
  deriveTwin,
} from './accreditation-twin.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase G — the CONTINUOUS IMPROVEMENT MANAGER's recommendation templates
// (pure). Four deterministic templates that turn a readiness gap, an unmet
// assurance or an early warning into a piece of work with an owner role, a
// metric to bind and a target rubric level — and an `estimatedLift` that is
// either REAL index points copied from `computeGaps`, or null plus a literal
// reason. Evidence work and assurance gates NEVER quote an index gain, because
// neither moves the index.
//
// `composeFindingKey` is THE finding-key formula, shared with the API's
// early-warning persistence so the two can never fork.
// ─────────────────────────────────────────────────────────────────────────────
export type {
  ImprovementGapInput,
  ImprovementAssuranceInput,
  ImprovementFindingInput,
  RecommendationInput,
  RecommendationTemplateId,
  RecommendationOriginType,
  SuggestedOwnerRole,
  EstimatedLift,
  Recommendation,
} from './improvement-findings.js'
export {
  IMPROVEMENT_FINDINGS_VERSION,
  RECOMMENDATION_LIMIT,
  RECOMMENDATION_TEMPLATE_IDS,
  OWNER_ROLE_BY_DOMAIN,
  NO_INDEX_SCALE_REASON,
  EVIDENCE_NOT_INDEXED_REASON,
  ASSURANCE_NOT_INDEXED_REASON,
  FINDING_NOT_STANDARD_SCOPED_REASON,
  FINDING_STANDARD_NOT_A_GAP_REASON,
  ZERO_LIFT_REASON,
  composeFindingKey,
  computeRecommendations,
} from './improvement-findings.js'

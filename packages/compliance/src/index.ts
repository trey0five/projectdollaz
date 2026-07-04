// ─────────────────────────────────────────────────────────────
// @finrep/compliance — pure, deterministic Florida scholarship AUP readiness
// pre-flag engine. ZERO UI, ZERO I/O. Consumes engine + analytics for TYPES ONLY.
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
} from './accreditation-coverage.js'
export {
  coverageForStandard,
  computeStandardCoverage,
  summarizeCoverage,
  ACCREDITATION_REVIEW_SOON_DAYS,
} from './accreditation-coverage.js'

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
} from './maintenance-backlog.js'
export {
  computeMaintenanceUrgency,
  summarizeBacklog,
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

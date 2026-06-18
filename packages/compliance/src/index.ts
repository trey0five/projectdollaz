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

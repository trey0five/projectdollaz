// ─────────────────────────────────────────────────────────────
// @finrep/compliance — type vocabulary for the Florida scholarship AUP
// readiness pre-flag engine.
//
// PURE TypeScript. ZERO UI, ZERO I/O. The package consumes @finrep/engine and
// @finrep/analytics for TYPES ONLY (import type) and never reads the DB/files or
// re-derives statement math — the API passes already-computed financial facts +
// attestation inputs INTO it.
//
// FRAMING: this is a READINESS PRE-FLAG, NOT the official Agreed-Upon-Procedures
// report and NOT legal/audit advice. It mirrors the Step Up For Students (SUFS)
// AUP template + the governing Florida statutes so a school can self-check before
// its CPA engagement.
// ─────────────────────────────────────────────────────────────
import type { ExpenseLineKey } from '@finrep/analytics'

/** The three covered scholarship programs (tiers). */
export type Program = 'FTC' | 'FES_EO' | 'FES_UA'

/** The six AUP sections plus the standalone eligibility gate. */
export type Section = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'ELIGIBILITY'

/** The severity a rule carries WHEN IT FAILS (metadata, not the live status). */
export type Severity = 'reportable' | 'material' | 'gate' | 'info' | 'watch'

/**
 * How a rule is evaluated:
 *  - auto:      derivable from the financial facts we already compute.
 *  - intake:    needs a small attestation input collected from the school.
 *  - checklist: document-dependent — surfaces what the CPA will need, never a
 *               pass/fail (always `manual`).
 */
export type RuleKind = 'auto' | 'intake' | 'checklist'

/**
 * The LIVE status of a finding. Distinct from Severity (which is the fixed
 * metadata describing how bad a failure is). Never a false pass/fail: a missing
 * input always yields `needs_data`.
 */
export type FindingStatus =
  | 'pass'
  | 'reportable'
  | 'material'
  | 'needs_data'
  | 'manual'
  | 'not_applicable'
  // Prudential warning (red_flags only) — surfaced like a status but explicitly
  // NOT an AUP exception. UI maps it to the neutral/watch health palette.
  | 'watch'

/**
 * The short compliance intake — attestation inputs the API persists in
 * period_compliance_inputs and passes in. Every field is optional/nullable:
 * `undefined`/`null` means NOT ENTERED -> the dependent rule returns
 * `needs_data` (never a fabricated pass/fail).
 */
export interface ComplianceInputs {
  /** Aggregate scholarship dollars received this school year (drives the $250k AUP trigger + §V coverage). */
  scholarshipFundsReceived?: number | null
  /** Which program tiers the school participates in (scopes the FES-UA-only rules). */
  programs?: Program[]
  /** §III.A — funds held at a federally-insured (FDIC/NCUA) institution. */
  fundsAtInsuredInstitution?: boolean | null
  /** §III.A — average daily balance exceeds the $250k FDIC limit (triggers bank-rating review). */
  avgDailyBalanceOver250k?: boolean | null
  /** §III.A — annual review confirmed the bank's rating is in the top two (Bauer/Fitch/Moody's/S&P). */
  bankRatingReviewedTopTwo?: boolean | null
  /** §III.B — bank statements reconciled within 60 days of month-end. */
  reconciledWithin60Days?: boolean | null
  /** §III.B — reconciliations independently reviewed. */
  reconciliationIndependentlyReviewed?: boolean | null
  /** §I — DOE status shows "approved" (not suspended/revoked). */
  doeStatusApproved?: boolean | null
  /** Eligibility — number of school years in operation. */
  yearsInOperation?: number | null
  /** Eligibility — a surety bond / LOC = one quarter's scholarship funds has been posted. */
  suretyBondPosted?: boolean | null
  /** FES-UA only — any ESA account already exceeds the $50,000 balance cap. */
  fesuaAnyAccountOver50k?: boolean | null
}

/**
 * DERIVED financial facts the API projects from the period's statement snapshot
 * (engine ReportBundle) + analytics. The package NEVER recomputes statement math
 * — it reads these already-computed numbers. When the period has no snapshot,
 * `hasSnapshot:false` and the AUTO rules return `needs_data` (never a false fail).
 */
export interface ComplianceFinancials {
  /** §II — the engine already proves whether the trial balance balances (bundle.validation.balanced). */
  balanced: boolean
  /** Whether a current-year statement snapshot exists for this period. */
  hasSnapshot: boolean
  /** Total expenses (SOA totalExp). */
  totalExpenses: number
  /** Net assets (naWithout + naWith) when an SFP is present, else null. */
  netAssets: number | null
  /** Unrestricted operating cash (SFP), else null. */
  cash: number | null
  /** Days cash on hand, reused from the analytics metric value (null when unavailable). */
  daysCashOnHand: number | null
  /** Change in net assets / operating result (SOA netChange). */
  operatingResult: number
  /** Each expense rollup line, keyed exactly like the analytics EXPENSE_LINE_KEYS. */
  expenseLines: Record<ExpenseLineKey, number>
}

/** The complete fact bundle a rule evaluates against. `programs` is resolved (never undefined). */
export interface ComplianceFacts {
  inputs: ComplianceInputs
  financials: ComplianceFinancials
  programs: Program[]
}

/** The dynamic part of a rule's verdict (what `evaluate()` returns). */
export interface RuleResult {
  status: FindingStatus
  detail: string
  citation: string
}

/** A versioned, pure rule. `evaluate` NEVER throws and NEVER mutates `facts`. */
export interface Rule {
  id: string
  section: Section
  title: string
  citation: string
  severityOnFail: Severity
  kind: RuleKind
  /** 'all' or the program tiers this rule applies to (FES-UA rules: ['FES_UA']). */
  programs: Program[] | 'all'
  evaluate(facts: ComplianceFacts): RuleResult
}

/** A fully-resolved finding: the rule's static metadata + its live verdict. */
export interface Finding {
  id: string
  section: Section
  title: string
  kind: RuleKind
  severityOnFail: Severity
  programs: Program[] | 'all'
  status: FindingStatus
  detail: string
  citation: string
}

/** Status counts across all findings. */
export interface ComplianceCounts {
  pass: number
  reportable: number
  material: number
  needs_data: number
  manual: number
  not_applicable: number
  watch: number
}

/** The pure rollup of a set of findings. */
export interface ComplianceSummary {
  /** True when scholarshipFundsReceived > $250,000 (AUP required this year). */
  requiresAup: boolean
  counts: ComplianceCounts
  /** True when any finding is `material` (a Corrective Action Plan will be required). */
  hasMaterial: boolean
  rulesetVersion: string
  statuteYear: number
}

/** A ruleset descriptor — pinned to a statute year so versions never collide. */
export interface RulesetDescriptor {
  id: string
  version: string
  statuteYear: number
  label: string
  programs: readonly Program[]
}

// ─────────────────────────────────────────────────────────────
// Phase 2D — pure Corrective Action Plan (CAP) scaffold.
//
// A MATERIAL AUP exception REQUIRES a Corrective Action Plan submitted to /
// forwarded to DOE; a Material exception is the same/substantially-same Reportable
// exception in 3 consecutive years, and consecutive material exceptions let the
// Commissioner deem the school ineligible. The CAP is the remediation half of the
// detect -> remediate loop.
//
// This module turns the LIVE 2A findings (Finding[]) into a pre-filled, editable
// scaffold: one CapScaffoldEntry per finding whose STATUS is `material` (always) or
// `reportable` (when includeReportable). The suggested* guidance comes from a
// per-rule template library grounded in the AUP §I-VI procedures, with a generic
// fallback for any rule lacking a specific template.
//
// PURE / deterministic. ZERO UI, ZERO I/O. No clock, no random. Type-only imports
// + the SECTION_ORDER constant only — keeps the purity test green. Never throws and
// never mutates its inputs.
// ─────────────────────────────────────────────────────────────
import type { Finding, Section } from './types.js'
import { SECTION_ORDER } from './evaluate.js'

/** Static, per-rule corrective-action guidance (deterministic strings). */
export interface CapTemplate {
  rootCause: string
  correctiveAction: string
  responsibleParty: string
  timeframe: string
}

/** A scaffolded CAP entry: the finding's read-only context + the suggested defaults. */
export interface CapScaffoldEntry {
  ruleId: string
  section: Section
  title: string
  citation: string
  severity: 'material' | 'reportable'
  /** Copied verbatim from the finding's live verdict text (finding.detail). */
  observation: string
  suggestedRootCause: string
  suggestedCorrectiveAction: string
  suggestedResponsibleParty: string
  suggestedTimeframe: string
}

/** Options for the scaffold. `includeReportable` defaults to true. */
export interface ScaffoldOptions {
  includeReportable?: boolean
}

/**
 * Per-rule template library, keyed by the 13 real ruleIds. Material/reportable
 * rules carry real, AUP-grounded guidance; the rest still carry a template so a
 * future severity change is automatically covered. Any rule not present here
 * falls back to GENERIC_TEMPLATE.
 */
export const CAP_TEMPLATES: Record<string, CapTemplate> = {
  // §I — School eligibility / DOE approval
  doe_approved: {
    rootCause:
      'The school is not currently shown as DOE-approved (a suspension/revocation or unresolved condition exists).',
    correctiveAction:
      'Resolve the DOE approval status (cure suspension/revocation conditions) and retain the DOE compliance/approval letter showing "approved".',
    responsibleParty: 'Head of School',
    timeframe: 'Immediately',
  },
  // §II — Accounting system
  balanced_books: {
    rootCause:
      'The trial balance does not balance and/or the accounting system does not produce balanced statements and student subledgers.',
    correctiveAction:
      'Correct out-of-balance trial balance entries and adopt a self-balancing accounting system that produces a balanced trial balance, financial statements, and student subledgers.',
    responsibleParty: 'Accountant / Business Manager',
    timeframe: 'Immediately',
  },
  // §III.A — Financial controls: insured institution + bank rating
  fdic_insured: {
    rootCause:
      'Scholarship funds are not held at a federally-insured (FDIC/NCUA) depository institution.',
    correctiveAction:
      'Move scholarship funds to an FDIC/NCUA federally-insured depository institution and retain confirmation of insured status.',
    responsibleParty: 'Business Manager',
    timeframe: '30 days',
  },
  bank_rating: {
    rootCause:
      'The average daily balance exceeds the $250k FDIC limit but no annual top-two bank-rating review is documented.',
    correctiveAction:
      "Where average daily balance exceeds the $250k FDIC limit, perform and document an annual review confirming the institution's rating is in the top two (Bauer/Fitch/Moody's/S&P).",
    responsibleParty: 'Business Manager',
    timeframe: 'Annually / next review cycle',
  },
  // §III.B — 60-day reconciliation (the demo's MATERIAL finding)
  reconciliation_60day: {
    rootCause:
      'Bank reconciliations were not consistently completed within 60 days of month-end and/or were not independently reviewed.',
    correctiveAction:
      'Implement a documented monthly bank-reconciliation process completed within 60 days of month-end and independently reviewed by an administrator not involved in recording.',
    responsibleParty: 'Business Manager / Head of School',
    timeframe: 'Next reporting period',
  },
  // §IV — Deposit & classification
  deposit_tracing: {
    rootCause:
      'Documentation tracing sampled scholarship receipts to the bank deposit, the GL, and the student account is incomplete.',
    correctiveAction:
      'Maintain documentation tracing each sampled scholarship ACH to the bank deposit, the GL (tuition/books/fees), and the student account.',
    responsibleParty: 'Business Manager',
    timeframe: 'Ongoing',
  },
  // §V — Education-related expenses
  aup_trigger: {
    rootCause:
      'Scholarship funds received exceed the $250,000 AUP threshold for the reporting period.',
    correctiveAction:
      'Engage a CPA to perform the official Agreed-Upon-Procedures and retain the issued AUP report on file.',
    responsibleParty: 'Head of School',
    timeframe: 'Current reporting period',
  },
  expenses_ge_scholarships: {
    rootCause:
      'Scholarship funds received exceed documented education-related expenditures for the period.',
    correctiveAction:
      'Document, in a written letter retained on file, how scholarship funds in excess of education-related expenses were or will be spent on allowable education expenses.',
    responsibleParty: 'Head of School',
    timeframe: 'Current reporting period',
  },
  non_education_expenses: {
    rootCause:
      'Non-education expenditures (athletics, student activities, transportation, food service) were funded from scholarship coverage.',
    correctiveAction:
      'Reclassify non-education expenditures (athletics, student activities, transportation, food service) out of scholarship coverage and fund them from non-scholarship sources; document the funding sources.',
    responsibleParty: 'Business Manager / Accountant',
    timeframe: 'Before next disbursement cycle',
  },
  // §VI / prudential
  red_flags: {
    rootCause:
      'Prudential warning signs (operating deficit, negative net assets, or low days-cash) were identified.',
    correctiveAction:
      'Document a financial-stability plan addressing the identified prudential warning signs and review it with the governing board.',
    responsibleParty: 'Head of School / Board',
    timeframe: 'Next reporting period',
  },
  // Eligibility gate
  eligibility_3yr_or_bond: {
    rootCause:
      "The school has operated fewer than 3 school years and no surety bond / letter of credit equal to one quarter's scholarship funds is posted.",
    correctiveAction:
      "Post a surety bond or letter of credit equal to one quarter's scholarship funds (if operated < 3 school years) and retain proof.",
    responsibleParty: 'Head of School',
    timeframe: 'Before participation',
  },
  fesua_50k_cap: {
    rootCause:
      'A FES-UA ESA account balance exceeds the $50,000 statutory cap.',
    correctiveAction:
      'Bring each FES-UA ESA account balance within the $50,000 cap (spend down on allowable expenses or coordinate with the funding organization) and document the remediation.',
    responsibleParty: 'Business Manager',
    timeframe: 'Before next disbursement cycle',
  },
  fesua_dormancy: {
    rootCause:
      'FES-UA ESA dormancy controls were not evidenced for inactive accounts.',
    correctiveAction:
      'Establish a documented review of FES-UA ESA account activity and remediate any dormant accounts per the funding organization’s requirements.',
    responsibleParty: 'Business Manager',
    timeframe: 'Next reporting period',
  },
}

/** Fallback guidance for any rule lacking a specific template. */
export const GENERIC_TEMPLATE: CapTemplate = {
  rootCause: 'A control or documentation gap was identified for this AUP procedure.',
  correctiveAction:
    'Establish and document a control/process that satisfies this AUP requirement, retain supporting evidence, and have it independently reviewed.',
  responsibleParty: 'Head of School / Business Manager',
  timeframe: 'Next reporting period',
}

/** Section -> stable sort index (mirrors the canonical render order). */
function sectionIndex(section: Section): number {
  const i = SECTION_ORDER.indexOf(section)
  return i === -1 ? SECTION_ORDER.length : i
}

/**
 * Build the CAP scaffold from the live 2A findings.
 *
 * Selection keys off the LIVE finding.status (NOT severityOnFail): `material` is
 * always included; `reportable` is included when includeReportable (default true).
 * All other statuses (pass/needs_data/manual/not_applicable/watch) are excluded.
 *
 * For each selected finding: severity mirrors the live status; observation is the
 * finding's detail text; the four suggested* fields come from CAP_TEMPLATES[ruleId]
 * (else GENERIC_TEMPLATE). Ordering is deterministic: section order, then ruleId.
 *
 * PURE — never reads the clock/random, never mutates inputs, never throws.
 */
export function scaffoldCorrectiveActionPlan(
  findings: Finding[],
  opts: ScaffoldOptions = {},
): CapScaffoldEntry[] {
  const includeReportable = opts.includeReportable ?? true
  const list = Array.isArray(findings) ? findings : []

  const selected = list.filter((f) => {
    if (!f) return false
    if (f.status === 'material') return true
    if (f.status === 'reportable') return includeReportable
    return false
  })

  const entries: CapScaffoldEntry[] = selected.map((f) => {
    const tpl = CAP_TEMPLATES[f.id] ?? GENERIC_TEMPLATE
    return {
      ruleId: f.id,
      section: f.section,
      title: f.title,
      citation: f.citation,
      severity: f.status === 'material' ? 'material' : 'reportable',
      observation: f.detail,
      suggestedRootCause: tpl.rootCause,
      suggestedCorrectiveAction: tpl.correctiveAction,
      suggestedResponsibleParty: tpl.responsibleParty,
      suggestedTimeframe: tpl.timeframe,
    }
  })

  // Deterministic ordering: section order then ruleId (stable, no clock/random).
  return entries.sort((a, b) => {
    const s = sectionIndex(a.section) - sectionIndex(b.section)
    if (s !== 0) return s
    return a.ruleId.localeCompare(b.ruleId)
  })
}

// ─────────────────────────────────────────────────────────────
// Phase 2C — pure Year-End Review Readiness checklist builder.
//
// buildYearEndChecklist() derives ONE procedure ChecklistItem per RULE_REGISTRY
// rule (grouped by the six AUP sections + the ELIGIBILITY gate), each grounded in
// the rule's title/kind/citation and carrying its relatedRuleId, PLUS one fixed
// DOCUMENTS group of the standard evidence a reviewer/CPA requests. The checklist
// stays in lock-step with the registry — adding a rule auto-adds a procedure item.
//
// PURE / deterministic. ZERO UI, ZERO I/O. NO clock, NO random. Type-only imports
// + the SECTION_ORDER constant only — keeps the purity test green (the "June 30
// year-end" in the document guidance is a LITERAL string, never a derived date).
// Never throws, never mutates. Two calls return deep-equal results.
// ─────────────────────────────────────────────────────────────
import type { Section } from './types.js'
import { SECTION_ORDER } from './evaluate.js'
import { RULE_REGISTRY } from './registry.js'

/** A checklist item is either a derived AUP procedure or a document to gather. */
export type ChecklistItemKind = 'procedure' | 'document'

/** A checklist section is an AUP Section or the standalone DOCUMENTS bucket. */
export type ChecklistSection = Section | 'DOCUMENTS'

/** One actionable checklist item (state is layered on by the API, not here). */
export interface ChecklistItem {
  id: string
  section: ChecklistSection
  label: string
  guidance: string
  /** Set on EVERY procedure item (the rule it derives from); undefined for documents. */
  relatedRuleId?: string
  kind: ChecklistItemKind
}

/** A checklist group: a section header + its ordered items. */
export interface ChecklistGroup {
  section: ChecklistSection
  title: string
  items: ChecklistItem[]
}

/** Human-readable section titles (keyed by Section + the DOCUMENTS bucket). */
export const SECTION_TITLES: Record<ChecklistSection, string> = {
  I: 'School Eligibility',
  II: 'Accounting System',
  III: 'Financial Controls',
  IV: 'Deposit & Classification of Scholarship Funds',
  V: 'Education-Related Expenses',
  VI: 'Tuition, Operating Term & Attendance',
  ELIGIBILITY: 'Eligibility Gate',
  DOCUMENTS: 'Documents to Gather for the Reviewer',
}

/** Deterministic per-kind guidance fragment appended to each procedure item. */
const KIND_GUIDANCE: Record<'auto' | 'intake' | 'checklist', string> = {
  auto: 'Derived automatically from your statements — verify the underlying records.',
  intake: 'Provide the attestation input on the Compliance Intake.',
  checklist: 'Gather the supporting documents the CPA will sample.',
}

/** A standard reviewer-request document (stable id + fixed, deterministic guidance). */
interface DocumentSpec {
  id: string
  label: string
  guidance: string
}

/**
 * The fixed, ordered list of documents a reviewer/CPA requests, grounded in the
 * AUP research doc's "Inspects" column + the standard CPA request list. The
 * "June 30 year-end" reference is a LITERAL string (no date is computed here).
 */
const DOCUMENT_SPECS: readonly DocumentSpec[] = [
  {
    id: 'doc_bank_statements_reconciliations',
    label: 'Bank statements + monthly reconciliations (all months incl. June 30 year-end)',
    guidance:
      'Gather bank statements and the monthly bank reconciliations for every month of the fiscal year, including the June 30 fiscal year-end (SUFS AUP §III.B).',
  },
  {
    id: 'doc_doe_approval_letter',
    label: 'DOE compliance / approval letter',
    guidance:
      'Provide the DOE compliance/approval letter showing the school is currently "approved" (not suspended/revoked) (SUFS AUP §I; s.1002.395(2)(i)).',
  },
  {
    id: 'doc_scholarship_disbursement_records',
    label: 'Scholarship disbursement records from the funding organization',
    guidance:
      'Provide the scholarship disbursement records from the funding organization (Step Up For Students) for the reporting period (SUFS AUP §IV).',
  },
  {
    id: 'doc_student_subledgers',
    label: 'Student account subledgers showing scholarship postings',
    guidance:
      'Provide student account subledgers showing each scholarship posting (tuition/books/fees) per student (SUFS AUP §II/§IV).',
  },
  {
    id: 'doc_general_ledger_trial_balance',
    label: 'General ledger / trial balance',
    guidance:
      'Provide the general ledger and trial balance produced by the self-balancing accounting system (SUFS AUP §II).',
  },
  {
    id: 'doc_prior_year_aup_cap',
    label: 'Prior-year AUP report + any Corrective Action Plan',
    guidance:
      'Provide the prior-year AUP report and any prior Corrective Action Plan (needed for the 3-consecutive-year material-exception model).',
  },
  {
    id: 'doc_surety_bond_loc',
    label: 'Surety bond / letter of credit (if operating < 3 school years)',
    guidance:
      'If the school has operated fewer than 3 school years, provide the surety bond or letter of credit equal to one quarter’s scholarship funds (s.1002.421(1)(f)1.).',
  },
]

/**
 * Build the year-end readiness checklist: a procedure group per AUP section (in
 * SECTION_ORDER, with items in RULE_REGISTRY order) followed by the fixed
 * DOCUMENTS group. PURE / deterministic / never throws.
 */
export function buildYearEndChecklist(): ChecklistGroup[] {
  const groups: ChecklistGroup[] = []

  // PROCEDURE GROUPS — SECTION_ORDER then registry order within each section.
  for (const section of SECTION_ORDER) {
    const items: ChecklistItem[] = []
    for (const rule of RULE_REGISTRY) {
      if (rule.section !== section) continue
      items.push({
        id: `chk_${rule.id}`,
        section: rule.section,
        label: rule.title,
        guidance: `Confirm: ${rule.title}. ${KIND_GUIDANCE[rule.kind]} (${rule.citation})`,
        relatedRuleId: rule.id,
        kind: 'procedure',
      })
    }
    // Omit empty sections (mirror groupBySection) — none are empty today.
    if (items.length > 0) {
      groups.push({ section, title: SECTION_TITLES[section], items })
    }
  }

  // DOCUMENTS GROUP — fixed, last, in declared order.
  groups.push({
    section: 'DOCUMENTS',
    title: SECTION_TITLES.DOCUMENTS,
    items: DOCUMENT_SPECS.map((d) => ({
      id: d.id,
      section: 'DOCUMENTS' as const,
      label: d.label,
      guidance: d.guidance,
      kind: 'document' as const,
    })),
  })

  return groups
}

// ─────────────────────────────────────────────────────────────────────────────
// AIC PHASE J — NAMING THE KIND, NEVER THE FILE.
//
// When `suggest_evidence` finds nothing, it must say WHAT KIND of artifact the
// standard asks for and stop there. Naming a kind is a statement about our own
// catalog. Naming a file would be a statement about the school's drive, which we
// cannot see — and "upload your 2025 external audit report.pdf" is precisely the
// sentence a language model produces when handed an empty result and a helpful
// disposition.
//
// PROVENANCE ORDER, HIGHEST FIRST — the tool tries them in this order and stops:
//   1. `AccreditationCatalogRequirement.label` for that standard, which the schema
//      documents as the "client-facing artifact name, rendered VERBATIM". A seeded
//      server string is always better than a table typed here.
//   2. The table below, keyed by the FROZEN 12-member `EVIDENCE_TAGS` vocabulary
//      that catalog standards actually carry.
//   3. The raw tag. Ugly, but true.
//
// [DEVIATION, recorded.] The frozen contract said `requiredKind.label` "comes from
// the frozen tag vocabulary in evidence-tag-match.ts". That file holds
// KNOWLEDGE_TAG_PATTERNS — title-match PATTERNS for eight tags — and no label for
// any of the twelve. There was nothing there to read. Rather than edit a file this
// engineer does not own to add one, the table lives here, next to its only caller,
// and step 1 above means it is the fallback rather than the source whenever the
// catalog has seeded a requirement row.
// ─────────────────────────────────────────────────────────────────────────────

import { EVIDENCE_TAGS, type EvidenceTag } from '@finrep/compliance'

/** One client-facing artifact NAME per frozen evidence tag. No file names, ever. */
export const EVIDENCE_KIND_LABELS: Readonly<Record<EvidenceTag, string>> = {
  governance: 'a governance record (board roster, terms, or the governance report)',
  board_minutes: 'approved board meeting minutes',
  policy_manual: 'a board-adopted policy',
  financial_audit: 'an external financial audit',
  budget: 'an approved operating budget',
  strategic_plan: 'a strategic plan',
  enrollment_data: 'an enrollment record',
  staff_credentials: 'a staff credential or certification record',
  safety_plan: 'a safety or crisis-response plan',
  survey: 'a stakeholder survey result',
  fiscal_resources: 'a fiscal-resources record (budget or board financial report)',
  marketing: 'a marketing or communications artifact',
}

/** True when every frozen tag has a label — asserted by advisory-apply-chain.spec.ts
 *  (EK-1) so a tag added to the vocabulary cannot silently fall through to its raw key. */
export const EVIDENCE_KIND_LABEL_COVERAGE = EVIDENCE_TAGS.every(
  (t) => typeof EVIDENCE_KIND_LABELS[t] === 'string' && EVIDENCE_KIND_LABELS[t].length > 0,
)

/** The label for a tag, falling back to the raw tag rather than to an invention. */
export function evidenceKindLabel(tag: string): string {
  return (EVIDENCE_KIND_LABELS as Record<string, string | undefined>)[tag] ?? tag
}

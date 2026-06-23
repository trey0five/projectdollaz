// ─────────────────────────────────────────────────────────────
// Presentation copy for the three role slots in the intake grid.
// This is UI copy ONLY — it does not affect classification or role
// resolution (which live in @finrep/ingestion). The order here drives
// the slot grid order: Current Year → Prior Year → Audited FY End.
//
// Plain-language fields (plainLabel/blurb/source) exist so a non-accountant
// can tell what file belongs in each slot — the jargon `label` is kept for
// chips/aria where the short form reads better.
// ─────────────────────────────────────────────────────────────

/** Ordered roles that get a dedicated slot in the intake grid. */
export const SLOT_ROLES = ['cy', 'py', 'audit']

/** Per-role label, plain explanation, requirement, and what it unlocks. */
export const ROLE_META = {
  cy: {
    step: 1,
    label: 'Current Year',
    plainLabel: "This year's trial balance",
    blurb: 'The books for the year you’re reporting on now.',
    source: 'From your accounting system',
    required: true,
    requirementLabel: 'Required',
    unlock: 'Required to preview statements',
  },
  py: {
    step: 2,
    label: 'Prior Year',
    plainLabel: "Last year's trial balance",
    blurb: 'Last year’s books — adds this-year-vs-last-year columns.',
    source: 'From your accounting system',
    required: false,
    requirementLabel: 'Optional',
    unlock: 'Unlocks prior-year comparative columns',
  },
  audit: {
    step: 3,
    label: 'Audited FY End',
    plainLabel: "Last year's audited numbers",
    blurb: 'Last year’s audited figures — unlocks the cash-flow statement.',
    source: 'From your auditor',
    required: false,
    requirementLabel: 'Optional',
    unlock: 'Unlocks the Statement of Cash Flows',
  },
}

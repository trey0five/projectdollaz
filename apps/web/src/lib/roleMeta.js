// ─────────────────────────────────────────────────────────────
// Presentation copy for the three role slots in the intake grid.
// This is UI copy ONLY — it does not affect classification or role
// resolution (which live in @finrep/ingestion). The order here drives
// the slot grid order: Current Year → Prior Year → Audited FY End.
// ─────────────────────────────────────────────────────────────

/** Ordered roles that get a dedicated slot in the intake grid. */
export const SLOT_ROLES = ['cy', 'py', 'audit']

/** Per-role label, requirement, and what it unlocks. */
export const ROLE_META = {
  cy: {
    label: 'Current Year',
    required: true,
    requirementLabel: 'Required',
    unlock: 'Required to preview statements',
  },
  py: {
    label: 'Prior Year',
    required: false,
    requirementLabel: 'Optional',
    unlock: 'Unlocks prior-year comparative columns',
  },
  audit: {
    label: 'Audited FY End',
    required: false,
    requirementLabel: 'Optional',
    unlock: 'Unlocks the Statement of Cash Flows',
  },
}

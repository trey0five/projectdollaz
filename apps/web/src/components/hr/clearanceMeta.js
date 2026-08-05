// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase K — the WEB-side display authority for the two new HR registers.
//
// A documented hard copy of the DTO arrays, in the same place and for the same
// reason as staffEvaluationMeta.js: the browser needs labels the API has no
// business carrying, and a third copy elsewhere would be a third thing to keep
// in step. The KEYS must match apps/api/src/hr/dto/*.dto.ts exactly — the
// @IsIn there is the authority, and a drift here is a 400 at submit.
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors CLEARANCE_KINDS in apps/api/src/hr/dto/clearance.dto.ts. */
export const CLEARANCE_KINDS = [
  'background_check',
  'safe_environment_training',
  'fingerprinting',
  'mandated_reporter',
  'child_abuse_clearance',
  'other',
]

const CLEARANCE_KIND_LABELS = {
  background_check: 'Background check',
  safe_environment_training: 'Safe-environment training',
  fingerprinting: 'Fingerprinting',
  mandated_reporter: 'Mandated-reporter training',
  child_abuse_clearance: 'Child-abuse clearance',
  other: 'Other',
}

export function clearanceKindLabel(kind) {
  return CLEARANCE_KIND_LABELS[kind] ?? kind
}

/** Mirrors PD_CATEGORIES in apps/api/src/hr/dto/professional-development.dto.ts. */
export const PD_CATEGORIES = [
  'instructional',
  'catholic_identity',
  'leadership',
  'safety',
  'technology',
  'other',
]

const PD_CATEGORY_LABELS = {
  instructional: 'Instructional practice',
  catholic_identity: 'Catholic identity',
  leadership: 'Leadership',
  safety: 'Safety & compliance',
  technology: 'Technology',
  other: 'Other',
}

export function pdCategoryLabel(category) {
  return PD_CATEGORY_LABELS[category] ?? category
}

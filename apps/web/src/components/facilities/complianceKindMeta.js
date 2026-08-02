// ─────────────────────────────────────────────────────────────────────────────
// complianceKindMeta — AIC Phase F. The WEB-side display authority for
// MaintenanceItem.complianceKind: what kind of regulatory inspection an item is.
//
// MAINTENANCE_COMPLIANCE_KINDS is a HARD-COPIED mirror of the API DTO array
// (apps/api/src/facilities/dto/create-maintenance.dto.ts — the DTO is the
// authority; the COMMITTEE_KINDS / PERSON_GROUPS precedent). The API keeps its own
// label table for the Evidence Index artifact label; the two are allowed to differ
// in casing only.
//
// TWO PROMISES THIS FILE KEEPS:
//
//  1. NOTHING IS EVER INFERRED. `title`, `category` and `location` are free text
//     and no code here reads them. The Phase-C evidence seed published the promise
//     ("We will not guess it from free text") and the FAC-BACKLOG honesty note
//     repeats it. A NULL kind means "an ordinary maintenance item" and such an item
//     behaves EXACTLY as it did before this phase.
//  2. THERE IS NO CATCH-ALL. The vocabulary is closed and there is deliberately no
//     'other': a kind we did not model is recorded as NULL. "An inspection of an
//     unnamed kind is overdue" is a sentence this product will not say.
// ─────────────────────────────────────────────────────────────────────────────

// apps/api/src/facilities/dto/create-maintenance.dto.ts (MAINTENANCE_COMPLIANCE_KINDS)
export const MAINTENANCE_COMPLIANCE_KINDS = [
  'fire_life_safety',
  'boiler',
  'elevator',
  'asbestos',
  'health',
  'water_quality',
  'playground',
]

// apps/api/src/facilities/dto/create-maintenance.dto.ts (LIFE_SAFETY_COMPLIANCE_KINDS).
// Severity only — it darkens the chip; it never changes what is stored or sent.
export const LIFE_SAFETY_COMPLIANCE_KINDS = [
  'fire_life_safety',
  'boiler',
  'elevator',
  'asbestos',
]

// Kept byte-identical to INSPECTION_KIND_LABEL in
// apps/api/src/accreditation/evidence-anchors.ts, so the chip a school picks in
// Facilities and the artifact label it later reads in the Evidence Index are the
// same words. (The pure engine has its OWN lower-case humanisation for the
// FAC-INSPECTION-DUE rationale — that is a sentence fragment, not a label.)
const KIND_LABELS = {
  fire_life_safety: 'Fire / life-safety',
  boiler: 'Boiler',
  elevator: 'Elevator',
  asbestos: 'Asbestos',
  health: 'Health',
  water_quality: 'Water quality',
  playground: 'Playground',
}

export function complianceKindLabel(k) {
  return KIND_LABELS[k] ?? k
}

export function isLifeSafetyKind(k) {
  return LIFE_SAFETY_COMPLIANCE_KINDS.includes(k)
}

/** Select options in the frozen vocabulary order (blank = not an inspection). */
export const COMPLIANCE_KIND_OPTIONS = MAINTENANCE_COMPLIANCE_KINDS.map((k) => ({
  value: k,
  label: KIND_LABELS[k] ?? k,
}))

/**
 * THE FROZEN COPY under the select (spec §9.3), rendered verbatim. It is the whole
 * design intent in one sentence and it is why there is no 'other' option.
 */
export const COMPLIANCE_KIND_NOTE =
  'We only call something an inspection when you tell us it is one.'

/** Light-theme chip classes: life-safety kinds read hotter than the rest. */
export function complianceKindBadge(k) {
  if (!k) return null
  return {
    label: complianceKindLabel(k),
    cls: isLifeSafetyKind(k)
      ? 'border-danger/30 bg-danger/10 text-danger'
      : 'border-[#EA580C]/50 bg-[#EA580C]/10 text-[#9A3412]',
  }
}

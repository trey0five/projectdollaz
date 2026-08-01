import type {
  DataAvailability,
  RequirementTag,
  SourceRegister,
  WindowKind,
} from '@finrep/compliance'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase C — THE REQUIREMENT SEED (typed const data ONLY; the idempotent
// boot-time upsert lives in AccreditationCatalogService.seedFramework, pass 3).
//
// One row = "a visiting team would ask this standard for THIS artifact, and it
// stays current for THIS long". PLATFORM reference data: no schoolId, never
// client-writable, self-healing on every boot exactly like the Phase-B domain
// map.
//
// DELIBERATELY SPARSE, and that is the whole design. A catalog standard with
// ZERO requirement rows keeps today's binary evidence behaviour byte-for-byte;
// nothing about its readiness moves. We only seed a row when we can either
// EVALUATE it honestly today (dataAvailability 'platform', with a live resolver)
// or NAME the hole (everything else, which renders `not_tracked` and is excluded
// from every denominator). Inventing a requirement to fill a tidy grid would
// manufacture a gap the school does not have.
//
// dataAvailability is the most important field here:
//   platform    — KYRO owns the register today; a real currency state.
//   intake      — a register we have not built yet (staff evaluations,
//                 inspections, PD). Renders not_tracked; a later phase flips the
//                 value to 'platform', adds a resolver, and NOTHING ELSE in the
//                 engine changes. That forward-declaration is the payoff.
//   integration — a third-party system we are not connected to (LMS, VIRTUS).
//   external    — the accreditor's portal is the authoritative record.
//
// catalog-requirements-seed.spec.ts is the BOOT ASSERTION for all of it.
// ─────────────────────────────────────────────────────────────────────────────

/** Re-exported so callers get ONE definition of each (the pure package owns it). */
export type { DataAvailability, WindowKind }

export interface CatalogRequirementSeed {
  /** Catalog standard code the requirement hangs on. LEAF or ASSURANCE only. */
  standardCode: string
  tag: RequirementTag
  label: string
  /** REQUIRED iff windowKind === 'fixed'; MUST be omitted for 'source_interval'. */
  windowMonths?: number
  windowKind: WindowKind
  dataAvailability: DataAvailability
  sourceRegister: SourceRegister | null
  notTrackedReason?: string
}

/**
 * Frozen not-tracked sentences, reused across frameworks so the same hole reads
 * the same everywhere. Rendered VERBATIM after the NOT_TRACKED_LEAD sentence.
 *
 * Each one says what it would TAKE, never what it would say. None of them may
 * imply KYRO can see curriculum content, assessment growth, PD participation or
 * Safe-Environment status.
 */
const WHY = {
  evaluations:
    'A four-field staff-evaluation register unlocks this, and it is the highest-value item on the list.',
  inspections:
    'One field on a facilities item — what kind of inspection it is — unlocks this. We will not guess it from free text.',
  pd: 'A professional-development register unlocks this. We will not use PD spend as participation.',
  assessment:
    'This needs an LMS or assessment integration KYRO does not have. We will not proxy learning growth with anything else.',
  safeEnv:
    'This lives in VIRTUS / CMG Connect. A per-diocese CSV import comes first; a live connector later.',
  portal: "Your accreditor's portal remains the authoritative repository for this.",
} as const

// ── cognia_2022 — 20 rows ────────────────────────────────────────────────────
const COGNIA_REQUIREMENTS: CatalogRequirementSeed[] = [
  // COG-7 continuous improvement process
  { standardCode: 'COG-7', tag: 'strategic_plan', label: 'Current strategic / continuous-improvement plan', windowKind: 'source_interval', dataAvailability: 'platform', sourceRegister: 'strategic_plan' },
  { standardCode: 'COG-7', tag: 'self_study', label: 'Cognia self-assessment / self-study', windowKind: 'fixed', windowMonths: 60, dataAvailability: 'external', sourceRegister: 'portal', notTrackedReason: WHY.portal },
  // COG-8 governing authority
  { standardCode: 'COG-8', tag: 'board_minutes', label: 'Approved board minutes', windowKind: 'fixed', windowMonths: 6, dataAvailability: 'platform', sourceRegister: 'meeting' },
  { standardCode: 'COG-8', tag: 'policy_manual', label: 'Board policy manual', windowKind: 'source_interval', dataAvailability: 'platform', sourceRegister: 'policy' },
  // COG-10 recruiting / supervising / EVALUATING staff
  { standardCode: 'COG-10', tag: 'staff_evaluation', label: 'Staff evaluation cycle records', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'intake', sourceRegister: 'staff_evaluation_register', notTrackedReason: WHY.evaluations },
  // COG-12 curriculum & instruction aligned — THE DOCUMENTED CONVENTION: no
  // curriculum model and no curriculum code ship in this phase. A Policy row
  // whose category contains "curric" carries the review cycle, and
  // computeReviewStatus does the rest for free.
  { standardCode: 'COG-12', tag: 'curriculum_review', label: 'Curriculum review record', windowKind: 'source_interval', dataAvailability: 'platform', sourceRegister: 'policy' },
  // COG-15 equitable allocation of resources
  { standardCode: 'COG-15', tag: 'budget', label: 'Board-approved operating budget', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'platform', sourceRegister: 'period_budget' },
  { standardCode: 'COG-15', tag: 'financial_audit', label: 'Annual external financial audit', windowKind: 'fixed', windowMonths: 18, dataAvailability: 'platform', sourceRegister: 'knowledge_document' },
  // COG-24 leaders use data
  { standardCode: 'COG-24', tag: 'enrollment_data', label: 'Current enrollment record', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'platform', sourceRegister: 'enrollment_snapshot' },
  // COG-29 professional learning
  { standardCode: 'COG-29', tag: 'pd_records', label: 'Professional-development participation records', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'intake', sourceRegister: 'professional_development', notTrackedReason: WHY.pd },
  // COG-30 / COG-31 learning growth
  { standardCode: 'COG-30', tag: 'assessment_results', label: 'Balanced assessment results', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'integration', sourceRegister: 'lms', notTrackedReason: WHY.assessment },
  { standardCode: 'COG-31', tag: 'assessment_results', label: 'Measured growth in student learning', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'integration', sourceRegister: 'lms', notTrackedReason: WHY.assessment },
  // Assurances (binary gates — the highest-value currency surface in the catalog)
  { standardCode: 'COG-A1', tag: 'policy_manual', label: 'Written board policies', windowKind: 'source_interval', dataAvailability: 'platform', sourceRegister: 'policy' },
  { standardCode: 'COG-A1', tag: 'board_minutes', label: 'Approved board minutes', windowKind: 'fixed', windowMonths: 6, dataAvailability: 'platform', sourceRegister: 'meeting' },
  { standardCode: 'COG-A2', tag: 'financial_audit', label: 'Annual external financial audit', windowKind: 'fixed', windowMonths: 18, dataAvailability: 'platform', sourceRegister: 'knowledge_document' },
  { standardCode: 'COG-A3', tag: 'safety_plan', label: 'Safety and crisis plan', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'platform', sourceRegister: 'knowledge_document' },
  { standardCode: 'COG-A3', tag: 'inspection', label: 'Fire / life-safety inspection record', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'intake', sourceRegister: 'maintenance_item', notTrackedReason: WHY.inspections },
  { standardCode: 'COG-A4', tag: 'compliance_attestation', label: 'Legal-compliance attestation', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'external', sourceRegister: 'portal', notTrackedReason: WHY.portal },
  { standardCode: 'COG-A5', tag: 'marketing', label: 'Current marketing and admissions materials', windowKind: 'fixed', windowMonths: 24, dataAvailability: 'platform', sourceRegister: 'knowledge_document' },
  { standardCode: 'COG-A6', tag: 'accreditor_training', label: 'Required Cognia training completion', windowKind: 'fixed', windowMonths: 36, dataAvailability: 'external', sourceRegister: 'portal', notTrackedReason: WHY.portal },
]

// ── msa_cess_2022 — 11 rows ──────────────────────────────────────────────────
const MSA_REQUIREMENTS: CatalogRequirementSeed[] = [
  { standardCode: 'MSA-1', tag: 'strategic_plan', label: 'Current strategic plan', windowKind: 'source_interval', dataAvailability: 'platform', sourceRegister: 'strategic_plan' },
  { standardCode: 'MSA-1', tag: 'self_study', label: 'MSA self-study', windowKind: 'fixed', windowMonths: 84, dataAvailability: 'external', sourceRegister: 'portal', notTrackedReason: WHY.portal },
  { standardCode: 'MSA-2', tag: 'policy_manual', label: 'Board policy manual', windowKind: 'source_interval', dataAvailability: 'platform', sourceRegister: 'policy' },
  { standardCode: 'MSA-2', tag: 'board_minutes', label: 'Approved board minutes', windowKind: 'fixed', windowMonths: 6, dataAvailability: 'platform', sourceRegister: 'meeting' },
  { standardCode: 'MSA-3', tag: 'safety_plan', label: 'Safety and crisis plan', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'platform', sourceRegister: 'knowledge_document' },
  { standardCode: 'MSA-3', tag: 'safe_environment', label: 'Background-check / safe-environment clearances', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'integration', sourceRegister: 'clearance_register', notTrackedReason: WHY.safeEnv },
  { standardCode: 'MSA-4', tag: 'financial_audit', label: 'Annual external financial audit', windowKind: 'fixed', windowMonths: 18, dataAvailability: 'platform', sourceRegister: 'knowledge_document' },
  { standardCode: 'MSA-4', tag: 'budget', label: 'Board-approved operating budget', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'platform', sourceRegister: 'period_budget' },
  { standardCode: 'MSA-4', tag: 'staff_credentials', label: 'Staff credential / certification records', windowKind: 'fixed', windowMonths: 24, dataAvailability: 'platform', sourceRegister: 'knowledge_document' },
  { standardCode: 'MSA-5', tag: 'curriculum_review', label: 'Curriculum review record', windowKind: 'source_interval', dataAvailability: 'platform', sourceRegister: 'policy' },
  { standardCode: 'MSA-5', tag: 'assessment_results', label: 'Student assessment results', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'integration', sourceRegister: 'lms', notTrackedReason: WHY.assessment },
]

// ── nsbecs — 14 rows ─────────────────────────────────────────────────────────
// NSBECS-2/3/4 (religious studies, faith formation, adult faith formation) and
// NSBECS-9 carry ZERO requirement rows ON PURPOSE: we do not model Catholic
// identity from anything we hold, so we do not manufacture an artifact list for
// it. Those standards keep today's binary evidence behaviour.
const NSBECS_REQUIREMENTS: CatalogRequirementSeed[] = [
  { standardCode: 'NSBECS-1', tag: 'strategic_plan', label: 'Current strategic plan', windowKind: 'source_interval', dataAvailability: 'platform', sourceRegister: 'strategic_plan' },
  { standardCode: 'NSBECS-5', tag: 'policy_manual', label: 'Board policy manual', windowKind: 'source_interval', dataAvailability: 'platform', sourceRegister: 'policy' },
  { standardCode: 'NSBECS-5', tag: 'board_minutes', label: 'Approved board minutes', windowKind: 'fixed', windowMonths: 6, dataAvailability: 'platform', sourceRegister: 'meeting' },
  { standardCode: 'NSBECS-6', tag: 'staff_credentials', label: 'Leadership credential records', windowKind: 'fixed', windowMonths: 24, dataAvailability: 'platform', sourceRegister: 'knowledge_document' },
  { standardCode: 'NSBECS-7', tag: 'curriculum_review', label: 'Curriculum review record', windowKind: 'source_interval', dataAvailability: 'platform', sourceRegister: 'policy' },
  { standardCode: 'NSBECS-8', tag: 'assessment_results', label: 'School-wide assessment results', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'integration', sourceRegister: 'lms', notTrackedReason: WHY.assessment },
  { standardCode: 'NSBECS-10', tag: 'budget', label: 'Board-approved operating budget', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'platform', sourceRegister: 'period_budget' },
  { standardCode: 'NSBECS-10', tag: 'financial_audit', label: 'Annual external financial audit', windowKind: 'fixed', windowMonths: 18, dataAvailability: 'platform', sourceRegister: 'knowledge_document' },
  { standardCode: 'NSBECS-10', tag: 'strategic_plan', label: '3–5 year financial / strategic plan', windowKind: 'source_interval', dataAvailability: 'platform', sourceRegister: 'strategic_plan' },
  { standardCode: 'NSBECS-11', tag: 'policy_manual', label: 'Published HR / personnel policies', windowKind: 'source_interval', dataAvailability: 'platform', sourceRegister: 'policy' },
  { standardCode: 'NSBECS-12', tag: 'safety_plan', label: 'Facilities, equipment and technology plan', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'platform', sourceRegister: 'knowledge_document' },
  { standardCode: 'NSBECS-12', tag: 'inspection', label: 'Fire / life-safety inspection record', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'intake', sourceRegister: 'maintenance_item', notTrackedReason: WHY.inspections },
  { standardCode: 'NSBECS-13', tag: 'enrollment_data', label: 'Current enrollment record', windowKind: 'fixed', windowMonths: 12, dataAvailability: 'platform', sourceRegister: 'enrollment_snapshot' },
  { standardCode: 'NSBECS-13', tag: 'marketing', label: 'Advancement / communications materials', windowKind: 'fixed', windowMonths: 24, dataAvailability: 'platform', sourceRegister: 'knowledge_document' },
]

/** frameworkCode → its requirement rows. Frozen counts: 20 / 11 / 14 = 45. */
export const FRAMEWORK_REQUIREMENT_SEEDS: Record<string, CatalogRequirementSeed[]> = {
  cognia_2022: COGNIA_REQUIREMENTS,
  msa_cess_2022: MSA_REQUIREMENTS,
  nsbecs: NSBECS_REQUIREMENTS,
}

/** The seven source registers that have a LIVE resolver in Phase C. */
export const RESOLVED_SOURCE_REGISTERS: readonly SourceRegister[] = [
  'policy',
  'meeting',
  'strategic_plan',
  'period_budget',
  'enrollment_snapshot',
  'knowledge_document',
  'board_report',
]

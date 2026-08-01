import { FRAMEWORK_REQUIREMENT_SEEDS } from '../accreditation/catalog-requirements-seed.js'
import { TWIN_SIGNAL_KEYS, type TwinSignalDef, type TwinSignalKey } from './twin-contract.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase D — THE SIGNAL CATALOG.
//
// Every operational fact the twin can see about a school, and — for the five it
// cannot see — the sentence that says what it would take. Thirty-five rows, one
// of which is a hole with a name.
//
// TWO RULES GOVERN THIS TABLE:
//
//   1. A signal is NEVER dropped. `TwinSignalsService.collect` returns all 35 for
//      every school, always, in this order. `not_licensed` and `not_tracked` are
//      answers; an absent row is not.
//
//   2. `expectedCadenceDays` is a TUNABLE SECTOR DEFAULT, documented exactly like
//      DEFAULT_BANDS in packages/analytics/src/health.ts — not a frozen constant
//      and not a hard truth. It exists so "stale" means "this school skipped
//      something", not "the calendar moved". A 200-day-old annual reading is
//      `unchanged`; a 70-day-old AR aging is `stale_data`. That difference is F14.
//
// THE NOT-TRACKED SENTENCES ARE IMPORTED, NOT RETYPED. They are the same frozen
// `WHY.*` strings the Phase-C requirement seed already ships, reached here through
// the exported seed table by tag. One hole, one sentence, everywhere — a copy edit
// in the seed reaches this catalog with no second edit and no drift.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The frozen not-tracked sentence the Phase-C seed already publishes for a tag.
 * `WHY` itself is module-private in catalog-requirements-seed.ts (and that file is
 * Phase-C territory this phase may not edit), so we reach the identical string
 * through the exported seed rows. Throwing on a miss is deliberate: a silent
 * fallback sentence would be a second copy of the copy we came here to avoid.
 */
function notTrackedReasonForTag(tag: string): string {
  for (const seeds of Object.values(FRAMEWORK_REQUIREMENT_SEEDS)) {
    for (const s of seeds) {
      if (s.tag === tag && s.notTrackedReason) return s.notTrackedReason
    }
  }
  throw new Error(
    `twin-signal-catalog: no seeded notTrackedReason for tag '${tag}' — the Phase-C requirement seed is the one authority for this sentence.`,
  )
}

/**
 * Cadence defaults, named so a reviewer can argue with the number rather than
 * hunt for it. ALL TUNABLE.
 */
/** An annual artifact, plus slack for a late close. */
const CADENCE_ANNUAL = 400
/** A term. Enrollment and board rhythms move on this clock. */
const CADENCE_TERMLY = 120
/** A quarter — the facilities walk-round. */
const CADENCE_QUARTERLY = 90
/** A monthly close, plus slack. */
const CADENCE_MONTHLY = 45
/**
 * A nightly capture, plus a long weekend. CURRENTLY UNUSED, and deliberately so:
 * no signal in this catalog is sourced from something that genuinely writes every
 * night. Kept as part of the cadence vocabulary — the moment a truly nightly
 * source appears (a webhook-fed integration, say) this is the number it takes.
 * It is NOT the right cadence for a de-duped capture; see acc.readiness_series.
 */
const CADENCE_NIGHTLY = 7
void CADENCE_NIGHTLY

export const TWIN_SIGNAL_CATALOG: readonly TwinSignalDef[] = Object.freeze([
  // ── 1–12: metric TRENDS. One AnalyticsService.trends call each, and only when
  //         the owning module is licensed. The trend statistics themselves live
  //         in @finrep/compliance and are applied by the service.
  {
    key: 'fin.operating_margin',
    label: 'Operating margin',
    kind: 'trend',
    moduleKey: 'finance',
    source: { table: 'StatementSnapshot', metricKey: 'operating_margin' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['finance'],
  },
  {
    key: 'fin.days_cash_on_hand',
    label: 'Days cash on hand',
    kind: 'trend',
    moduleKey: 'finance',
    source: { table: 'StatementSnapshot', metricKey: 'days_cash_on_hand' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['finance'],
  },
  {
    key: 'fin.months_operating_reserve',
    label: 'Months of operating reserve',
    kind: 'trend',
    moduleKey: 'finance',
    source: { table: 'StatementSnapshot', metricKey: 'months_operating_reserve' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['finance'],
  },
  {
    key: 'fin.tuition_dependency',
    label: 'Tuition dependency',
    kind: 'trend',
    moduleKey: 'finance',
    source: { table: 'StatementSnapshot', metricKey: 'tuition_dependency' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['finance'],
  },
  {
    key: 'fin.tuition_discount_rate',
    label: 'Tuition discount rate',
    kind: 'trend',
    moduleKey: 'finance',
    source: { table: 'StatementSnapshot', metricKey: 'tuition_discount_rate' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['finance'],
  },
  {
    key: 'fin.cost_per_pupil',
    label: 'Cost per pupil',
    kind: 'trend',
    moduleKey: 'finance',
    source: { table: 'StatementSnapshot', metricKey: 'cost_per_pupil' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['finance'],
  },
  {
    key: 'fin.net_tuition_per_student',
    label: 'Net tuition per student',
    kind: 'trend',
    moduleKey: 'finance',
    source: { table: 'StatementSnapshot', metricKey: 'net_tuition_per_student' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['finance'],
  },
  {
    key: 'aid.pct_students_on_aid',
    label: 'Students receiving aid',
    kind: 'trend',
    moduleKey: 'finance',
    source: { table: 'PeriodOperationalData', metricKey: 'pct_students_on_aid' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['finance', 'student_services'],
  },
  {
    key: 'hr.student_teacher_ratio',
    label: 'Student-teacher ratio',
    kind: 'trend',
    moduleKey: 'hr',
    source: {
      table: 'PeriodOperationalData',
      field: 'teachingFte',
      metricKey: 'student_teacher_ratio',
    },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['hr'],
  },
  {
    key: 'hr.teaching_staff_share',
    label: 'Teaching share of staff',
    kind: 'trend',
    moduleKey: 'hr',
    source: {
      table: 'PeriodOperationalData',
      field: 'totalStaffFte',
      metricKey: 'teaching_staff_share',
    },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['hr'],
  },
  {
    key: 'hr.total_staff_fte',
    label: 'Total staff FTE',
    kind: 'trend',
    moduleKey: 'hr',
    source: {
      table: 'PeriodOperationalData',
      field: 'totalStaffFte',
      metricKey: 'total_staff_fte',
    },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['hr'],
  },
  {
    key: 'enr.enrollment_vs_plan',
    label: 'Enrollment against plan',
    kind: 'trend',
    moduleKey: 'enrollment',
    source: {
      table: 'PeriodOperationalData',
      field: 'plannedEnrollmentByGrade',
      metricKey: 'enrollment_vs_plan',
    },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['finance', 'leadership'],
  },

  // ── 13: a metric LEVEL, not a trend. plan_readiness is a four-level coverage
  //       counter; @finrep/compliance refuses to trend it, and this row is the
  //       reason that refusal never costs the twin the fact itself.
  {
    key: 'plan.plan_readiness',
    label: 'Planning readiness',
    kind: 'metric',
    moduleKey: 'planning',
    source: { table: 'PeriodBudget', metricKey: 'plan_readiness' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['continuous_improvement'],
  },

  // ── 14–23, 35: REGISTER facts. Each group is ONE schoolId-scoped query.
  {
    key: 'fin.ar_aging',
    label: 'Receivables over 90 days',
    kind: 'register',
    moduleKey: 'finance',
    source: { table: 'ArApAgingSnapshot', field: 'ar90Plus' },
    expectedCadenceDays: CADENCE_MONTHLY,
    ferpaSensitive: false,
    domainKeys: ['finance'],
  },
  {
    key: 'fin.budget_present',
    label: 'Budget on file for the current year',
    kind: 'register',
    moduleKey: 'finance',
    source: { table: 'PeriodBudget', field: 'id' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['finance'],
  },
  {
    key: 'gov.minutes_lag',
    label: 'Days from meeting to approved minutes',
    kind: 'register',
    moduleKey: 'governance',
    source: { table: 'Meeting', field: 'minutesApprovedAt' },
    expectedCadenceDays: CADENCE_TERMLY,
    ferpaSensitive: false,
    domainKeys: ['governance'],
  },
  {
    key: 'gov.meeting_cadence',
    label: 'Board meetings held in the last year',
    kind: 'register',
    moduleKey: 'governance',
    source: { table: 'Meeting', field: 'scheduledAt' },
    expectedCadenceDays: CADENCE_TERMLY,
    ferpaSensitive: false,
    domainKeys: ['governance'],
  },
  {
    key: 'gov.policy_review',
    label: 'Policies overdue for review',
    kind: 'register',
    moduleKey: 'governance',
    source: { table: 'Policy', field: 'lastReviewedDate' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['governance'],
  },
  {
    key: 'gov.board_terms',
    label: 'Board terms already expired',
    kind: 'register',
    moduleKey: 'governance',
    source: { table: 'GovernancePerson', field: 'termEnd' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['governance'],
  },
  {
    key: 'gov.committee_chairs',
    label: 'Active committees without a chair',
    kind: 'register',
    moduleKey: 'governance',
    source: { table: 'Committee', field: 'chair' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['governance'],
  },
  {
    key: 'strat.plan_horizon',
    label: 'Strategic plan horizon',
    kind: 'register',
    moduleKey: 'strategy',
    source: { table: 'StrategicPlan', field: 'endDate' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['continuous_improvement', 'leadership'],
  },
  {
    key: 'fac.maintenance_backlog',
    label: 'Open maintenance items',
    kind: 'register',
    moduleKey: 'facilities',
    source: { table: 'MaintenanceItem', field: 'status' },
    expectedCadenceDays: CADENCE_QUARTERLY,
    ferpaSensitive: false,
    domainKeys: ['facilities'],
  },
  {
    key: 'enr.headcount',
    label: 'Total enrollment',
    kind: 'register',
    moduleKey: 'enrollment',
    // SCHOOL TOTAL — explicitly carved OUT of small-cell suppression (§2). Masking
    // a 40-student school's own headcount protects nobody: it is on their website.
    source: { table: 'EnrollmentSnapshot', field: 'totalEnrolled' },
    expectedCadenceDays: CADENCE_TERMLY,
    ferpaSensitive: false,
    domainKeys: ['finance', 'leadership'],
  },
  {
    key: 'enr.feeder_grades',
    label: 'Enrollment by grade',
    kind: 'register',
    moduleKey: 'enrollment',
    source: { table: 'EnrollmentSnapshot', field: 'byGrade' },
    expectedCadenceDays: CADENCE_TERMLY,
    // PER-GRADE CELLS. F11's real leak vector is not a name in a payload — it is a
    // per-grade count of 3.
    ferpaSensitive: true,
    domainKeys: ['finance', 'leadership'],
  },

  // ── 25: the ONLY roster-derived signal. Reaches student data through
  //       StudentsService.aggregate — never a direct student-row query
  //       (acceptance 5).
  {
    key: 'svc.support_needs',
    label: 'Students with a recorded support need',
    kind: 'roster',
    moduleKey: 'enrollment',
    source: { table: 'StudentsService.aggregate', field: 'counts.flags' },
    expectedCadenceDays: CADENCE_TERMLY,
    ferpaSensitive: true,
    domainKeys: ['student_services'],
  },

  // ── 26–29: accreditation's own state, read through Phase A/C services.
  {
    key: 'acc.evidence_currency',
    label: 'Standards with out-of-date evidence',
    kind: 'evidence',
    moduleKey: 'accreditation',
    source: { table: 'AccreditationCatalogRequirement', field: 'tag' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    // Per REQUIREMENT tag in the payload; the catalog row carries the domains the
    // evidence half of readiness belongs to.
    domainKeys: ['continuous_improvement'],
  },
  {
    key: 'acc.readiness_series',
    label: 'Recorded readiness',
    kind: 'readiness',
    moduleKey: 'accreditation',
    source: { table: 'AccreditationReadinessSnapshot', field: 'readinessPct' },
    // NOT the nightly cadence, even though the CAPTURE runs nightly. The Phase-A
    // job deliberately DEDUPES: it skips the write when the payload hash is
    // unchanged and it is not the same day ("nothing about this series changed …
    // there is nothing new to record"). So the newest snapshotDate for a stable
    // school is the date readiness last MOVED, not last night. Against a 7-day
    // cadence (staleAfterDays 11) a school whose last accreditation edit was three
    // weeks ago reports `stale_data` — the exact F14 misfire acceptance 4 exists to
    // prevent, fired BECAUSE the Phase-A job worked correctly, and turned by
    // twin-reconciliation into resolutionKind 'stale_data' on a finding that
    // genuinely improved. Accreditation work moves on a term clock; the cadence is
    // the rhythm of the THING MEASURED, never of the job that records it.
    expectedCadenceDays: CADENCE_TERMLY,
    ferpaSensitive: false,
    domainKeys: ['continuous_improvement'],
  },
  {
    key: 'acc.unscored_standards',
    label: 'Standards with no rubric score',
    kind: 'readiness',
    moduleKey: 'accreditation',
    source: { table: 'AccreditationStandard', field: 'rubricScore' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['continuous_improvement'],
  },
  {
    key: 'acc.unsupported_score',
    label: 'High scores with no evidence attached',
    kind: 'readiness',
    moduleKey: 'accreditation',
    source: { table: 'AccreditationStandard', field: 'rubricScore' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['continuous_improvement'],
  },

  // ── 30–34: DECLARED NOT TRACKED. The collector is never invoked and no query is
  //          issued. These are the visible holes Phase E renders as
  //          `cannot_evaluate` and Phases F/K close by changing ONE field.
  {
    key: 'hr.staff_evaluations',
    label: 'Staff evaluation cycle',
    kind: 'register',
    moduleKey: 'hr',
    source: { table: 'StaffEvaluation', phase: 'F' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['hr'],
    declaredNotTracked: { reason: notTrackedReasonForTag('staff_evaluation') },
  },
  {
    key: 'fac.inspections',
    label: 'Life-safety inspections',
    kind: 'register',
    moduleKey: 'facilities',
    source: { table: 'MaintenanceItem', field: 'complianceKind', phase: 'F' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['facilities'],
    declaredNotTracked: { reason: notTrackedReasonForTag('inspection') },
  },
  {
    key: 'hr.pd_participation',
    label: 'Professional-development participation',
    kind: 'register',
    moduleKey: 'hr',
    source: { table: 'ProfessionalDevelopment', phase: 'K' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['hr'],
    declaredNotTracked: { reason: notTrackedReasonForTag('pd_records') },
  },
  {
    key: 'safe.clearances',
    label: 'Safe-environment clearances',
    kind: 'register',
    moduleKey: 'hr',
    source: { table: 'Clearance', phase: 'K' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['governance', 'student_services'],
    declaredNotTracked: { reason: notTrackedReasonForTag('safe_environment') },
  },
  {
    key: 'acad.assessment_growth',
    label: 'Measured growth in student learning',
    kind: 'register',
    // CORE-shaped (no module would light it) precisely because no module can:
    // this needs an LMS integration KYRO does not have.
    moduleKey: null,
    source: { table: 'LMS', phase: 'deferred' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['academic_excellence'],
    declaredNotTracked: { reason: notTrackedReasonForTag('assessment_results') },
  },

  // ── 35: the Phase-C documented convention — curriculum documents live in the
  //       policy register under category 'Curriculum'.
  {
    key: 'curr.doc_review',
    label: 'Curriculum documents overdue for review',
    kind: 'register',
    moduleKey: 'governance',
    source: { table: 'Policy', field: 'category' },
    expectedCadenceDays: CADENCE_ANNUAL,
    ferpaSensitive: false,
    domainKeys: ['academic_excellence'],
  },
] satisfies TwinSignalDef[])

/** key → def, for the collectors and for Phase E's rule authoring. */
export const TWIN_SIGNAL_BY_KEY: ReadonlyMap<TwinSignalKey, TwinSignalDef> = new Map(
  TWIN_SIGNAL_CATALOG.map((d): [TwinSignalKey, TwinSignalDef] => [d.key, d]),
)

/**
 * A build-time-ish assertion that the catalog and the frozen key vocabulary agree,
 * in both directions and in order. Cheap, runs once at import, and turns a
 * mistyped key into an immediate boot failure rather than a silently missing row.
 */
const catalogKeys = TWIN_SIGNAL_CATALOG.map((d) => d.key)
if (
  catalogKeys.length !== TWIN_SIGNAL_KEYS.length ||
  catalogKeys.some((k, i) => k !== TWIN_SIGNAL_KEYS[i])
) {
  throw new Error(
    'twin-signal-catalog: TWIN_SIGNAL_CATALOG must contain exactly TWIN_SIGNAL_KEYS, in the same order.',
  )
}

/** The catalog's own stale rule: 1.5x the expected cadence, rounded up. */
export function staleAfterDaysFor(def: Pick<TwinSignalDef, 'expectedCadenceDays'>): number {
  return Math.ceil(1.5 * def.expectedCadenceDays)
}

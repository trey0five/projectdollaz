// ─────────────────────────────────────────────────────────────────────────────
// AIC PHASE J — THE CAPABILITY REGISTRY.
//
// A FROZEN TABLE, NOT A HEURISTIC. Every row states one thing about THIS product's
// own schema: whether KYRO holds data on a topic, and — when it does not — what it
// would take to hold it. Nothing here reads a database, a clock, or a model.
//
// WHY THIS FILE EXISTS AT ALL. Penny is asked "how are teacher evaluations?" and
// "how are we doing on professional development?" in the same breath, and the two
// have opposite truthful answers. Left to a system-prompt paragraph, both answers
// are advice a model may decline to take: it can invent a professional-development
// figure, or — the failure this phase was written to prevent — it can DENY a
// register the product actually ships. A tool that returns the refusal payload
// hands the model nothing to improvise from, which is a guarantee rather than a
// request.
//
// THE §0 SUBSTITUTION, RECORDED HERE BECAUSE THIS IS WHERE IT BITES. The original
// plan froze "how are teacher evaluations?" as the REFUSAL case. Phase F shipped
// the StaffEvaluation register — `hr.staff_evaluations` is a live twin signal and
// HR-EVAL-OVERDUE is a firing rule — so refusing that question would be a lie in
// the opposite direction, with the identical failure mode: the user cannot tell
// from Penny's answer what the product actually knows. The refusal case keeps its
// SHAPE and changes its SUBJECT to two things that genuinely are not collected and
// are still absent from the schema: professional development (HR-PD-LOW) and
// safe-environment clearances (SAFE-ENV-GAP), both Phase K.
// ─────────────────────────────────────────────────────────────────────────────

import type { ModuleKey } from '@finrep/db'
// IMPORTED, NOT RETYPED. `wouldEnable` names a rule the twin ships as a VISIBLE hole.
// Typing the field against this list is what stops a Phase-K change that fills one of
// those holes from leaving Penny denying a register that now ships — the failure this
// whole file exists to prevent, aimed at itself. The ids were hardcoded as free
// strings and drifted silently by construction.
// `import type` so this file still emits NOTHING at runtime — it is a frozen table,
// and `typeof` over a type-only import is a compile-time constraint, which is the
// stronger of the two guards anyway: an id that leaves that list stops compiling.
import type { VISIBLE_HOLE_RULE_IDS } from '@finrep/compliance'

/**
 * Why a tool refused. The plan froze exactly one member (`not_collected`) with two
 * `wouldRequire` values; this is that shape WIDENED, and the frozen pair keeps its
 * exact meaning. A single-value enum would have forced eight other refusals to
 * masquerade as `not_collected`, which is itself a false statement about the
 * product — "we do not collect readiness history" is not what "you have only one
 * snapshot" means.
 */
/** The rule ids `wouldEnable` may name — @finrep/compliance's own, never a copy. */
export type VisibleHoleRuleId = (typeof VISIBLE_HOLE_RULE_IDS)[number]

export type RefusalReason =
  | 'not_collected' // KYRO has no register/field for this at all
  | 'not_licensed' // the module exists; this school has not licensed it
  | 'no_data' // the register exists and is licensed, and is empty
  | 'insufficient_history' // fewer than 2 comparable snapshots
  | 'insufficient_peers' // k < 3
  | 'not_org_scoped' // the caller oversees no organization
  | 'unknown_standard' // the code/id did not resolve in THIS school
  | 'no_matching_artifact' // suggest_evidence found nothing that EXISTS
  | 'unknown_school' // the school name did not resolve EXACTLY in this organization
  | 'not_a_kyro_question' // outcome prediction; we reframe, we do not answer

/** What it would take. `null` only where nothing would ever make it answerable. */
export type WouldRequire = 'intake' | 'integration' | 'module' | 'time' | 'peers' | 'org' | null

/** The eight registry topics. An argument outside this set is not an error — see
 *  {@link resolveCoverageTopic}. */
export const COVERAGE_TOPICS = [
  'teacher_evaluations',
  'facility_inspections',
  'professional_development',
  'safe_environment_clearances',
  'lms_assessment',
  'student_achievement',
  'test_scores',
  'accreditation_outcome',
] as const

export type CoverageTopic = (typeof COVERAGE_TOPICS)[number]

/** What a payload's `topic` may say. `'unknown'` is what the caller asked about
 *  something outside the registry — echoing back a registry key we did not match
 *  would be a small lie about the question that was asked. */
export type CoverageTopicKey = CoverageTopic | 'unknown'

/** A topic KYRO holds a register for. The COUNTS are read elsewhere (CoverageService);
 *  this row only says which register answers it and which licence it needs. */
export interface CollectedTopic {
  topic: CoverageTopic
  topicLabel: string
  collected: true
  moduleKey: ModuleKey
  /** Which counts reader answers it. Kept as a literal so the tool switch is total. */
  register: 'staff_evaluations' | 'compliance_inspections' | 'clearances' | 'professional_development'
}

/** A topic KYRO genuinely does NOT hold. Carries no counts and no findings: there
 *  is nothing here for a model to improvise from. */
export interface NotCollectedTopic {
  topic: CoverageTopicKey
  topicLabel: string
  collected: false
  reason: 'not_collected'
  wouldRequire: 'intake' | 'integration'
  /** The early-warning rule this data would light, or null when the question fell
   *  outside the registry entirely and no rule can be named for it. TYPED against
   *  @finrep/compliance's own list, so an id that stops being a visible hole stops
   *  compiling here. */
  wouldEnable: VisibleHoleRuleId | null
  message: string
}

/** The one topic that is not a question about our data at all. */
export interface NotAKyroQuestionTopic {
  topic: CoverageTopic
  topicLabel: string
  collected: false
  reason: 'not_a_kyro_question'
  wouldRequire: null
  message: string
  /** What Penny offers INSTEAD. Tool names, so the model cannot invent a capability. */
  offer: readonly string[]
}

export type CoverageTopicEntry = CollectedTopic | NotCollectedTopic | NotAKyroQuestionTopic

/**
 * "Will we pass?" — REFUSE AND REFRAME.
 *
 * NO PROBABILITY, NO PERCENTAGE, NO LIKELIHOOD WORD, NO "ON TRACK". There is no
 * accreditation-outcome data anywhere in this program, for any school, so there is
 * nothing to calibrate a number against — the same reason Phase E's findings carry
 * an ORDINAL likelihood and never a percentage.
 *
 * [DEVIATION, deliberate.] The frozen contract's draft of this sentence ended
 * "...what a visiting team would most likely ask for", and acceptance 1 of the same
 * contract forbids any likelihood word in this answer path. Those two cannot both
 * hold. The sentence keeps its meaning and drops the word.
 */
export const ACCREDITATION_OUTCOME_MESSAGE =
  'I can’t tell you whether you’ll pass — KYRO holds no accreditation outcome data for any ' +
  'school, so any number I gave you would be invented. What I can show you is where your ' +
  'readiness stands, what changed, and what a visiting team asks for first.'

/**
 * THE TABLE. Data only; the resolver below is a lookup, not a rule.
 *
 * `wouldEnable` names a rule id that exists in the frozen `TWIN_RULE_IDS` catalog
 * and is listed in `VISIBLE_HOLE_RULE_IDS` — these are published holes, not
 * aspirations invented for this sentence.
 */
export const COVERAGE_REGISTRY: Readonly<Record<CoverageTopic, CoverageTopicEntry>> = {
  teacher_evaluations: {
    topic: 'teacher_evaluations',
    topicLabel: 'teacher evaluations',
    collected: true,
    moduleKey: 'hr',
    register: 'staff_evaluations',
  },
  facility_inspections: {
    topic: 'facility_inspections',
    topicLabel: 'facility inspections',
    collected: true,
    moduleKey: 'facilities',
    register: 'compliance_inspections',
  },
  // ── AIC PHASE K FLIPPED BOTH OF THESE, and the build would not compile until it
  // did: `wouldEnable` is typed against VISIBLE_HOLE_RULE_IDS, so removing the two
  // rules from that list broke this file on purpose. That is the Phase-J design —
  // Penny must never deny a capability the product ships, and Phase F proved how
  // easily a stale refusal survives (its plan would have had Penny deny the
  // staff-evaluation register in the same phase that built it).
  professional_development: {
    topic: 'professional_development',
    topicLabel: 'professional development',
    collected: true,
    moduleKey: 'hr',
    register: 'professional_development',
  },
  safe_environment_clearances: {
    topic: 'safe_environment_clearances',
    topicLabel: 'safe-environment clearances',
    collected: true,
    moduleKey: 'hr',
    register: 'clearances',
  },
  lms_assessment: {
    topic: 'lms_assessment',
    topicLabel: 'learning-management and assessment data',
    collected: false,
    reason: 'not_collected',
    wouldRequire: 'integration',
    wouldEnable: 'ACAD-GROWTH-FLAT',
    message:
      'KYRO doesn’t hold learning-management or assessment data — nothing in this product reads ' +
      'your LMS. What we’d need is an integration with the system that already holds it; until ' +
      'then ACAD-GROWTH-FLAT is reported as not evaluated rather than as clear.',
  },
  student_achievement: {
    topic: 'student_achievement',
    topicLabel: 'student achievement',
    collected: false,
    reason: 'not_collected',
    wouldRequire: 'integration',
    wouldEnable: 'ACAD-GROWTH-FLAT',
    message:
      'KYRO doesn’t hold student achievement results — there is no academic-outcome data in this ' +
      'product for any school. What we’d need is an integration with the assessment system that ' +
      'already holds it; until then ACAD-GROWTH-FLAT is reported as not evaluated rather than as clear.',
  },
  test_scores: {
    topic: 'test_scores',
    topicLabel: 'test scores',
    collected: false,
    reason: 'not_collected',
    wouldRequire: 'integration',
    wouldEnable: 'ACAD-GROWTH-FLAT',
    message:
      'KYRO doesn’t hold test scores — no standardized-assessment results are stored in this ' +
      'product. What we’d need is an integration with the assessment system that already holds ' +
      'them; until then ACAD-GROWTH-FLAT is reported as not evaluated rather than as clear.',
  },
  accreditation_outcome: {
    topic: 'accreditation_outcome',
    topicLabel: 'the accreditation decision',
    collected: false,
    reason: 'not_a_kyro_question',
    wouldRequire: null,
    message: ACCREDITATION_OUTCOME_MESSAGE,
    offer: ['generate_readiness_narrative', 'explain_readiness_change', 'suggest_evidence'],
  },
}

/**
 * The DEFAULT answer for anything outside the registry.
 *
 * An unrecognised topic is NOT an error. "I do not have that" is the truthful
 * answer for everything this product has not built, and returning an error would
 * hand the model a blank where a refusal belongs — the one shape it reliably fills
 * with a guess.
 */
export const UNKNOWN_TOPIC_ENTRY: NotCollectedTopic = {
  topic: 'unknown',
  topicLabel: 'that',
  collected: false,
  reason: 'not_collected',
  wouldRequire: 'integration',
  wouldEnable: null,
  message:
    'KYRO doesn’t collect that — it isn’t in any register in this product, so I have nothing to ' +
    'read and I won’t guess. If you tell me which system already holds it, that is the integration ' +
    'we’d need to answer it here.',
}

/** Normalize free-text to a registry key: trim, lowercase, spaces/hyphens → underscore. */
function normalizeTopic(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

/**
 * Resolve an arbitrary topic argument to a registry row. A recognised topic returns
 * its row; ANYTHING else returns {@link UNKNOWN_TOPIC_ENTRY}. There is no throw and
 * no fuzzy match: an exact key after normalization, or the honest default.
 */
export function resolveCoverageTopic(raw: unknown): CoverageTopicEntry {
  if (typeof raw !== 'string') return UNKNOWN_TOPIC_ENTRY
  const key = normalizeTopic(raw)
  const hit = (COVERAGE_REGISTRY as Record<string, CoverageTopicEntry | undefined>)[key]
  return hit ?? UNKNOWN_TOPIC_ENTRY
}

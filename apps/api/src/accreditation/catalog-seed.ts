import type { DomainKey, EvidenceTag } from '@finrep/compliance'
import type { MetricKey } from '@finrep/analytics'

// ─────────────────────────────────────────────────────────────────────────────
// Accreditation Phase 3 — the FRAMEWORK CATALOG seed (typed const data ONLY; the
// idempotent boot-time upsert lives in AccreditationCatalogService). Verified
// against the primary sources: the official Cognia Performance Standards &
// Rubrics PDF (2022 framework incl. the Oct-2025 standard 31), the MSA-CESS 2022
// Standards for Accreditation, and the NSBECS (Catholic) 2012 standards.
// evidenceTags use the CLOSED @finrep/compliance vocabulary and drive the
// deterministic suggestion matcher. orderIndex = position in the arrays.
//
// AIC PHASE B adds two seed-only columns to every row:
//
//   domainKey / domainWeights — WHICH OF THE TEN DOMAINS this standard belongs
//   to. Every row carries a key (parents and assurance gates included, so Phase
//   C/H can group them), but only NON-ASSURANCE LEAVES reach the domain math.
//   domainWeights is present ONLY where the accreditor's own text names two
//   domains (MSA-4 "Resources" really is finance AND facilities AND HR); it is
//   authoritative when present and must sum to 1.0, and domainKey remains the
//   LEAD domain used for register grouping. Splits are used sparingly — a split
//   invented to be tidy would quietly halve a school's effective leaf count in
//   two domains and push both below the scoring threshold.
//
//   signalKeys — the @finrep/analytics metric keys whose REAL values belong
//   inside this standard ("you didn't enter these for accreditation"). An
//   UNBOUND standard is correct and common: COG-30/31 (learning growth) and
//   NSBECS-1..4 (Catholic identity) are deliberately unbound because KYRO has no
//   LMS/assessment integration and does not measure faith formation from a
//   general ledger. We will not proxy either — the Domains tab says so out loud.
//   Mix metrics (revenue_mix/expense_mix) are NEVER bound: they have no scalar
//   value or band, and the signal panel is a value+band surface.
//
// catalog-seed.spec.ts is the BOOT ASSERTION for all of the above (non-null
// valid domainKey on every row, weights that sum to 1, legal non-mix signal keys,
// ≤8 per standard, and the unchanged framework shapes).
// ─────────────────────────────────────────────────────────────────────────────

export interface CatalogStandardSeed {
  code: string
  title: string
  /** Domain parent's code; omitted = root-level node. */
  parentCode?: string
  description?: string
  evidenceTags?: EvidenceTag[]
  /** Cognia binary assurance gate (excluded from rubric/index math). */
  isAssurance?: boolean
  // ── Phase B ──
  /**
   * REQUIRED on every seeded row (asserted by catalog-seed.spec.ts) — the
   * compiler is the first line of the boot assertion, so a new standard cannot
   * be added without deciding which domain it belongs to.
   */
  domainKey: DomainKey
  /** Only when the standard genuinely straddles domains; values must sum to 1. */
  domainWeights?: Partial<Record<DomainKey, number>>
  /** @finrep/analytics metric keys; ≤8, no mixes, no duplicates. */
  signalKeys?: MetricKey[]
  // ── WS3 F3 — the authored PLAIN-LANGUAGE restatement ──
  /**
   * One product-voice sentence per standard: what a committee member is really
   * being asked. Authored ONCE for Cognia (shared by the 2022 and 2025 rows via
   * the shared-standards build); null/omitted on every framework not yet
   * authored — and the UI renders NOTHING when null. Never a paraphrase of the
   * statement; never a claim about what KYRO measures.
   */
  plainLanguage?: string
}

export interface FrameworkSeed {
  code: string
  accreditor: string
  name: string
  version: string
  description?: string
  /** array[4]: index i = label for rubric score i+1. */
  rubricLabels: string[]
  /** [{min,label}] ascending; [] = no index→status bands. */
  statusBands: { min: number; label: string }[]
  indexMin: number | null
  indexMax: number | null
  defaultTarget: number | null
  standards: CatalogStandardSeed[]
  // ── WS1/WS2 framework versioning (all optional; absent = cleared on boot) ──
  /** Searchable alternate names ("NCA CASI" must find the one Cognia framework). */
  aliases?: string[]
  /** Code of the framework that replaces this one for NEW adoptions. */
  supersededByCode?: string
  /** array[4]: the long-form rubric descriptor phrase for score i+1 (verbatim). */
  rubricDescriptors?: string[]
  /** An accreditor-published reference point on the index scale. Display-only. */
  indexReference?: { value: number; label: string }
  /** Recognition-body codes (RECOGNITION_CODES in recognitions.ts) — accreditor
   *  metadata, never adoptable. VERIFIED per body's live member list; [] means
   *  verified ABSENCE, not "unknown" (Cognia is genuinely on neither list). */
  recognitions?: string[]
  /** The accreditor's PUBLISHED term of accreditation in years — the Journey
   *  setup card's default and the cycle service's fallback when a school has
   *  not set its own. Display/default metadata only (no column); absent = 6.
   *  Set ONLY from the accreditor's own documents; where the term varies by
   *  school (MSA-CESS grants 5- or 10-year terms) it is left unset. */
  defaultTermYears?: number
}

/** The cycle-length default for a framework code (6 when unknown/unset). */
export const DEFAULT_TERM_YEARS = 6
export function defaultTermYearsFor(code: string | null | undefined): number {
  if (!code) return DEFAULT_TERM_YEARS
  return FRAMEWORK_SEEDS.find((f) => f.code === code)?.defaultTermYears ?? DEFAULT_TERM_YEARS
}

// ── COGNIA (2022, incl. 2025 update): 4 Key Characteristics + Assurances ─────
const COGNIA_STANDARDS: CatalogStandardSeed[] = [
  // Domain parents (Key Characteristics + the Assurances group). They carry a
  // domainKey for grouping but contribute NOTHING to domain math (they are not
  // leaves, so the engine never sees them).
  { code: 'COG-KC1', title: 'Culture of Learning', domainKey: 'mission_identity' },
  { code: 'COG-KC2', title: 'Leadership for Learning', domainKey: 'leadership' },
  { code: 'COG-KC3', title: 'Engagement of Learning', domainKey: 'academic_excellence' },
  { code: 'COG-KC4', title: 'Growth in Learning', domainKey: 'continuous_improvement' },
  { code: 'COG-ASR', title: 'Assurances', isAssurance: true, domainKey: 'governance' },

  // Culture of Learning (1–6)
  { code: 'COG-1', parentCode: 'COG-KC1', title: 'Leaders cultivate and sustain a culture of respect, fairness, equity, and inclusion, free from bias.', domainKey: 'mission_identity', domainWeights: { mission_identity: 0.5, leadership: 0.5 } },
  { code: 'COG-2', parentCode: 'COG-KC1', title: "Learners' well-being is at the heart of the institution's guiding principles (mission, purpose, beliefs).", evidenceTags: ['survey'], domainKey: 'mission_identity' },
  { code: 'COG-3', parentCode: 'COG-KC1', title: "Leaders actively engage stakeholders to support priorities promoting learners' academic growth and well-being.", evidenceTags: ['survey'], domainKey: 'leadership' },
  { code: 'COG-4', parentCode: 'COG-KC1', title: 'Learners benefit from a formal structure fostering positive relationships with peers and adults.', evidenceTags: ['survey'], domainKey: 'student_services' },
  { code: 'COG-5', parentCode: 'COG-KC1', title: 'Professional staff members embrace effective collegiality and collaboration in support of learners.', domainKey: 'hr' },
  { code: 'COG-6', parentCode: 'COG-KC1', title: 'Professional staff members receive the support they need to strengthen professional practice.', evidenceTags: ['staff_credentials'], domainKey: 'hr' },

  // Leadership for Learning (7–15)
  { code: 'COG-7', parentCode: 'COG-KC2', title: "Leaders guide professional staff in a continuous improvement process focused on learners' experiences and needs.", evidenceTags: ['strategic_plan'], domainKey: 'continuous_improvement', signalKeys: ['plan_readiness'] },
  { code: 'COG-8', parentCode: 'COG-KC2', title: 'The governing authority demonstrates commitment to learners by collaborating with leaders to uphold priorities and drive continuous improvement.', evidenceTags: ['governance', 'board_minutes', 'policy_manual'], domainKey: 'governance' },
  { code: 'COG-9', parentCode: 'COG-KC2', title: 'Leaders cultivate effective individual and collective leadership among stakeholders.', evidenceTags: ['governance'], domainKey: 'leadership' },
  { code: 'COG-10', parentCode: 'COG-KC2', title: 'Leaders demonstrate expertise in recruiting, supervising, and evaluating professional staff to optimize learning.', evidenceTags: ['staff_credentials'], domainKey: 'hr', signalKeys: ['total_staff_fte', 'fte_change_yoy'] },
  { code: 'COG-11', parentCode: 'COG-KC2', title: 'Leaders create and maintain institutional structures and processes supporting learners and staff in stable and changing environments.', evidenceTags: ['policy_manual'], domainKey: 'leadership' },
  { code: 'COG-12', parentCode: 'COG-KC2', title: 'Professional staff implement curriculum and instruction aligned for relevancy, inclusion, and effectiveness.', domainKey: 'academic_excellence' },
  { code: 'COG-13', parentCode: 'COG-KC2', title: "Qualified personnel instruct and assist learners and each other in support of the institution's mission, purpose, and beliefs.", evidenceTags: ['staff_credentials'], domainKey: 'hr', domainWeights: { hr: 0.5, academic_excellence: 0.5 }, signalKeys: ['student_teacher_ratio', 'teaching_staff_share'] },
  { code: 'COG-14', parentCode: 'COG-KC2', title: 'Curriculum and instruction are augmented by reliable information resources and materials that advance learning.', evidenceTags: ['fiscal_resources'], domainKey: 'academic_excellence', domainWeights: { academic_excellence: 0.5, technology: 0.5 } },
  {
    code: 'COG-15',
    parentCode: 'COG-KC2',
    title: "Learners' needs drive the equitable allocation and management of human, material, digital, and fiscal resources.",
    evidenceTags: ['fiscal_resources', 'budget', 'financial_audit'],
    domainKey: 'finance',
    // The flagship card of Phase B: Cognia's ONLY finance standard. It can never
    // carry a domain percentage (one leaf, threshold 3) yet it is the most
    // heavily instrumented standard in the whole catalog — no rubric number,
    // seven real operating figures.
    signalKeys: [
      'operating_margin',
      'days_cash_on_hand',
      'months_operating_reserve',
      'tuition_dependency',
      'cost_per_pupil',
      'student_teacher_ratio',
      'teaching_staff_share',
    ],
  },

  // Engagement of Learning (16–23)
  { code: 'COG-16', parentCode: 'COG-KC3', title: 'Learners experience curriculum and instruction that emphasize the value of diverse cultures, backgrounds, and abilities.', domainKey: 'academic_excellence' },
  { code: 'COG-17', parentCode: 'COG-KC3', title: 'Learners have equitable opportunities to realize their learning potential.', evidenceTags: ['enrollment_data'], domainKey: 'student_services', signalKeys: ['pct_students_on_aid'] },
  { code: 'COG-18', parentCode: 'COG-KC3', title: 'Learners are immersed in an environment fostering lifelong skills (creativity, curiosity, risk taking, collaboration, design thinking).', domainKey: 'academic_excellence' },
  { code: 'COG-19', parentCode: 'COG-KC3', title: 'Learners are immersed in an environment that promotes and respects student voice and responsibility for learning.', evidenceTags: ['survey'], domainKey: 'student_services' },
  { code: 'COG-20', parentCode: 'COG-KC3', title: 'Learners engage in experiences that promote and develop self-confidence and love of learning.', evidenceTags: ['survey'], domainKey: 'student_services' },
  { code: 'COG-21', parentCode: 'COG-KC3', title: 'Instruction is characterized by high expectations and learner-centered practices.', domainKey: 'academic_excellence' },
  { code: 'COG-22', parentCode: 'COG-KC3', title: "Instruction is monitored and adjusted to advance and deepen individual learners' knowledge and understanding of the curriculum.", domainKey: 'academic_excellence' },
  { code: 'COG-23', parentCode: 'COG-KC3', title: "Professional staff integrate digital resources that deepen learners' engagement with instruction and stimulate curiosity.", domainKey: 'technology' },

  // Growth in Learning (24–31; 31 is the Oct-2025 addition)
  { code: 'COG-24', parentCode: 'COG-KC4', title: "Leaders use data and input from a variety of sources to make decisions for learners' and staff members' growth and well-being.", evidenceTags: ['enrollment_data', 'survey'], domainKey: 'continuous_improvement', signalKeys: ['plan_readiness'] },
  { code: 'COG-25', parentCode: 'COG-KC4', title: 'Leaders promote action research by professional staff to improve their practice and advance learning.', domainKey: 'continuous_improvement' },
  { code: 'COG-26', parentCode: 'COG-KC4', title: 'Leaders regularly evaluate instructional programs and organizational conditions to improve instruction and advance learning.', evidenceTags: ['strategic_plan'], domainKey: 'continuous_improvement', signalKeys: ['forecast_vs_budget_net'] },
  { code: 'COG-27', parentCode: 'COG-KC4', title: "Learners' diverse academic and non-academic needs are identified and effectively addressed through appropriate interventions.", domainKey: 'student_services' },
  { code: 'COG-28', parentCode: 'COG-KC4', title: 'With support, learners pursue individual goals including academic and non-academic skills important for their futures and careers.', domainKey: 'student_services' },
  { code: 'COG-29', parentCode: 'COG-KC4', title: "Understanding learners' needs and interests drives the design, delivery, and evaluation of professional learning.", evidenceTags: ['staff_credentials'], domainKey: 'hr' },
  // COG-30/31 are deliberately UNBOUND: we have no LMS or assessment
  // integration and will not proxy learning growth with anything we do have.
  { code: 'COG-30', parentCode: 'COG-KC4', title: "Learners' progress is measured through a balanced system including assessment both for learning and of learning.", evidenceTags: ['enrollment_data'], domainKey: 'academic_excellence' },
  { code: 'COG-31', parentCode: 'COG-KC4', title: 'The institution demonstrates measurable growth in student learning over time.', description: '2025 addition to the Growth in Learning key characteristic.', evidenceTags: ['enrollment_data'], domainKey: 'academic_excellence' },

  // Assurances (binary, evidence-backed gates — excluded from rubric/index math
  // AND from all domain math; the keys are carried for Phase C/H grouping only)
  { code: 'COG-A1', parentCode: 'COG-ASR', title: 'Governing board maintains written policies and receives board training.', isAssurance: true, evidenceTags: ['policy_manual', 'governance', 'board_minutes'], domainKey: 'governance' },
  { code: 'COG-A2', parentCode: 'COG-ASR', title: 'Annual external financial audit is completed.', isAssurance: true, evidenceTags: ['financial_audit'], domainKey: 'finance' },
  { code: 'COG-A3', parentCode: 'COG-ASR', title: 'Safety and crisis plans are maintained and reviewed annually.', isAssurance: true, evidenceTags: ['safety_plan'], domainKey: 'facilities' },
  { code: 'COG-A4', parentCode: 'COG-ASR', title: 'Institution complies with applicable legal requirements.', isAssurance: true, evidenceTags: ['policy_manual'], domainKey: 'governance' },
  { code: 'COG-A5', parentCode: 'COG-ASR', title: 'Marketing and communications are truthful and ethical.', isAssurance: true, evidenceTags: ['marketing'], domainKey: 'leadership' },
  { code: 'COG-A6', parentCode: 'COG-ASR', title: 'Required Cognia training is completed by staff/leadership.', isAssurance: true, evidenceTags: ['staff_credentials'], domainKey: 'hr' },
]

// ─────────────────────────────────────────────────────────────────────────────
// WS3 F3 — the PLAIN-LANGUAGE layer for the 31 Cognia standards, authored ONCE
// and shared by BOTH Cognia editions (the codes are identical, and the plain
// question a committee member is being asked did not change between revs).
//
// VOICE RULES: one honest question (occasionally two clauses) per standard —
// what would you actually have to show a visitor? Never a paraphrase of the
// statement (that is what the statement is for), never a claim about what KYRO
// measures, never jargon. A standard with no entry renders NOTHING — a bad
// translation is worse than none.
// ─────────────────────────────────────────────────────────────────────────────
const COGNIA_PLAIN_LANGUAGE: Record<string, string> = {
  'COG-1': 'Does every learner get treated fairly here — and could you show a visitor how you make sure of it?',
  'COG-2': "Your mission should put learners' well-being first — can you point to where it says so, and how that shows up day to day?",
  'COG-3': 'Do families, staff, and the community actually get pulled into what the school is trying to do — not just told about it afterwards?',
  'COG-4': 'Is there a deliberate structure — advisory, house, mentoring — that makes sure every learner is known well by an adult and by peers?',
  'COG-5': 'Do your teachers genuinely work together on behalf of learners — shared planning, real collaboration — rather than teaching behind closed doors?',
  'COG-6': 'When a teacher needs help getting better at the job, does the school actually provide it — coaching, time, resources?',
  'COG-7': 'Is there a real improvement process running — led by leadership, focused on what learners experience — and could you walk a visitor through it?',
  'COG-8': "Does your governing authority genuinely work with school leadership to uphold the school's priorities and push improvement forward — with minutes to show it?",
  'COG-9': 'Are you growing leaders beyond the front office — teachers, parents, even students taking real responsibility for parts of the school?',
  'COG-10': 'Can you show how you hire well, supervise fairly, and evaluate staff on a real cycle — not just when something goes wrong?',
  'COG-11': 'When things change — enrollment, staffing, a crisis — do your structures hold up, and do learners and staff still get what they need?',
  'COG-12': 'Is what gets taught in each classroom actually the curriculum you adopted, and does it work for every learner — not just most of them?',
  'COG-13': 'Is every learner taught and supported by people qualified to do it, working in service of your mission?',
  'COG-14': 'Do teachers and learners have reliable, current materials — books, databases, digital resources — and do they actually advance learning?',
  'COG-15': "When you build the budget and assign people, can you show that learners' needs drove the decisions — not habit or history?",
  'COG-16': 'Does your curriculum show learners the wider world — different cultures, backgrounds, and abilities — as something of value?',
  'COG-17': 'Does every learner — not just the strongest — get the support and the chances they need to reach their potential?',
  'COG-18': 'Do learners get to create, take risks, collaborate, and design — or is the day all about receiving content?',
  'COG-19': 'Do learners have real say and real responsibility in their own learning — and does the school respect it when they use it?',
  'COG-20': 'Are learners building confidence and an actual love of learning here — and what experiences do you point to as proof?',
  'COG-21': 'Are expectations genuinely high in every classroom, with instruction built around learners rather than around the material?',
  'COG-22': "When a learner isn't getting it, does instruction actually change — and how would you show that adjustment happening?",
  'COG-23': 'Is technology in your classrooms deepening engagement and curiosity — or just digitizing worksheets?',
  'COG-24': 'When leaders decide something that affects learners or staff, can you show the data and the voices that informed it?',
  'COG-25': 'Do teachers get to study their own practice — try something, measure it, keep what works — with leadership backing them?',
  'COG-26': 'Do you regularly step back and ask whether your programs are working — and change them when the answer is no?',
  'COG-27': 'When a learner needs help — academic or not — does the school notice, intervene, and follow through?',
  'COG-28': "Does each learner have goals of their own — academic and beyond — that matter for where they're headed after your school?",
  'COG-29': "Is your staff's professional learning designed around what your learners need — and do you check whether it changed anything?",
  'COG-30': 'Do you assess to help learning along the way, not just to grade it at the end — and is the system deliberately balanced between the two?',
  'COG-31': 'Can you show, with assessments you trust, that your learners are actually growing year over year?',
}

// ─────────────────────────────────────────────────────────────────────────────
// WS2 — the COGNIA 2025 TITLE OVERRIDES, transcribed VERBATIM from the official
// Performance Standards PDF (Revised 03.05.2025). The seeded 2022 titles above
// are KYRO's condensed renderings and are kept byte-identical for the schools
// scored against them; the 2025 rows carry the accreditor's own full statements.
// A standard absent from this map has a seeded title that already matches the
// 2025 text verbatim (COG-5, 9, 13, 21, 22, 24, 26). NEVER paraphrase here —
// the seed file's own provenance section documents what paraphrasing cost.
// ─────────────────────────────────────────────────────────────────────────────
const COGNIA_2025_TITLE_OVERRIDES: Record<string, string> = {
  'COG-1': 'Leaders cultivate and sustain a culture that demonstrates respect and fairness for all learners and is free from bias.',
  'COG-2': "Learners' well-being is at the heart of the institution's guiding principles, such as mission, purpose, and beliefs.",
  'COG-3': "Leaders actively engage stakeholders to support the institution's priorities and guiding principles that promote learners' academic growth and well-being.",
  'COG-4': 'Learners benefit from a formal structure that fosters positive relationships with peers and adults.',
  'COG-6': 'Professional staff members receive the support they need to strengthen their professional practice.',
  'COG-7': "Leaders guide professional staff members in the continuous improvement process focused on learners' experiences and needs.",
  'COG-8': "The governing authority demonstrates a commitment to learners by collaborating with leaders to uphold the institution's priorities and to drive continuous improvement.",
  'COG-10': 'Leaders demonstrate expertise in recruiting, supervising, and evaluating professional staff members to optimize learning.',
  'COG-11': 'Leaders create and maintain institutional structures and processes that support learners and staff members in both stable and changing environments.',
  'COG-12': 'Professional staff members implement curriculum and instruction that are aligned for relevancy and effectiveness for each and every learner.',
  'COG-14': "Curriculum and instruction are augmented by reliable information resources and materials that advance learning and support learners' personal interests.",
  'COG-15': "Learners' needs drive the allocation and management of human, material, digital, and fiscal resources.",
  'COG-16': 'Learners experience curriculum and instruction that emphasize the value of different cultures, backgrounds, and abilities reflective of the global community.',
  'COG-17': 'Learners have the support and opportunities to realize their learning potential.',
  'COG-18': 'Learners are immersed in an environment that fosters lifelong skills including creativity, curiosity, risk taking, collaboration, and design thinking.',
  'COG-19': 'Learners are immersed in an environment that promotes and respects student agency and responsibility for their learning.',
  'COG-20': 'Learners engage in experiences that promote and develop their self-confidence and love of learning.',
  'COG-23': "Professional staff members integrate digital resources that deepen and advance learners' engagement with instruction and stimulate their curiosity.",
  'COG-25': 'Leaders promote action research by professional staff members to improve their practice and advance learning.',
  'COG-27': "Learners' academic and non-academic needs are identified and effectively addressed through appropriate interventions.",
  'COG-28': 'Learners pursue individual goals including the acquisition of academic and non-academic skills important for their educational futures and careers.',
  'COG-29': "Understanding learners' needs and interests drives the design, delivery, application, and evaluation of professional learning.",
  'COG-30': "Learners' progress is measured through a balanced system that includes assessment both for learning and of learning.",
  'COG-31': 'Learners demonstrate growth in their academic performance based on valid and reliable assessments.',
}

/**
 * The two Cognia editions are BUILT from ONE standards array, never duplicated:
 * the Phase-B domain map (domainKey/domainWeights/signalKeys), evidenceTags and
 * the plain-language layer are KYRO's product mapping and must stay in ONE
 * place so a correction reaches both versions. The crosswalk is a CODE IDENTITY
 * (same 42 codes, same tree, same assurances) — pinned by catalog-seed.spec,
 * and the fact the whole upgrade flow rests on.
 */
const COGNIA_2022_STANDARDS: CatalogStandardSeed[] = COGNIA_STANDARDS.map((s) => ({
  ...s,
  plainLanguage: COGNIA_PLAIN_LANGUAGE[s.code],
}))

const COGNIA_2025_STANDARDS: CatalogStandardSeed[] = COGNIA_STANDARDS.map((s) => ({
  ...s,
  title: COGNIA_2025_TITLE_OVERRIDES[s.code] ?? s.title,
  // COG-31's "2025 addition…" note is dropped on the 2025 row — it is not an
  // addition there; it is simply standard 31.
  description: s.code === 'COG-31' ? undefined : s.description,
  plainLanguage: COGNIA_PLAIN_LANGUAGE[s.code],
}))

/** Shared by BOTH Cognia rows: a school searching any of these must find its framework. */
const COGNIA_ALIASES = [
  'NCA CASI',
  'SACS CASI',
  'NWAC',
  'AdvancED',
  'North Central Association',
  'NCA',
  'SACS',
]

// ── MSA-CESS (2022): 5 root-level LEAF standards (no domain parents) ─────────
const MSA_STANDARDS: CatalogStandardSeed[] = [
  { code: 'MSA-1', title: 'Foundations (mission, vision, core values, strategic planning).', evidenceTags: ['strategic_plan'], domainKey: 'mission_identity', domainWeights: { mission_identity: 0.5, continuous_improvement: 0.5 }, signalKeys: ['plan_readiness'] },
  { code: 'MSA-2', title: 'Governance and Organization.', evidenceTags: ['governance', 'board_minutes', 'policy_manual'], domainKey: 'governance' },
  { code: 'MSA-3', title: 'Student Well-Being.', evidenceTags: ['safety_plan', 'survey'], domainKey: 'student_services' },
  {
    code: 'MSA-4',
    title: 'Resources (human, financial, physical).',
    evidenceTags: ['budget', 'financial_audit', 'fiscal_resources', 'staff_credentials'],
    domainKey: 'finance',
    // ½ finance, ¼ facilities, ¼ HR reflects the standard's own indicator density
    // and KYRO's signal density. A SEED CONSTANT, not a heuristic — never compute
    // it. The ¼ shares also sit BELOW the 0.5 signal-attribution floor, which is
    // exactly the point: these cash metrics are finance signals, not facilities
    // signals.
    domainWeights: { finance: 0.5, facilities: 0.25, hr: 0.25 },
    signalKeys: [
      'operating_margin',
      'days_cash_on_hand',
      'months_operating_reserve',
      'tuition_dependency',
      'cost_per_pupil',
      'student_teacher_ratio',
      'total_staff_fte',
      'forecast_vs_budget_net',
    ],
  },
  { code: 'MSA-5', title: 'Teaching and Learning.', evidenceTags: ['enrollment_data'], domainKey: 'academic_excellence', signalKeys: ['student_teacher_ratio'] },
]

// ── NSBECS (Catholic, 2012): 4 domain parents + 13 leaves ────────────────────
const NSBECS_STANDARDS: CatalogStandardSeed[] = [
  { code: 'NSBECS-D1', title: 'Mission & Catholic Identity', domainKey: 'mission_identity' },
  { code: 'NSBECS-D2', title: 'Governance & Leadership', domainKey: 'governance' },
  { code: 'NSBECS-D3', title: 'Academic Excellence', domainKey: 'academic_excellence' },
  { code: 'NSBECS-D4', title: 'Operational Vitality', domainKey: 'finance' },

  // NSBECS-1..4 are deliberately UNBOUND. We do not imply we measured Catholic
  // identity from a general ledger. This is the designed teaching moment on the
  // Domains tab: a MEASURED mission domain with ZERO operating signals, and a
  // card that says so in words.
  { code: 'NSBECS-1', parentCode: 'NSBECS-D1', title: 'Clearly communicated mission embracing Catholic identity, faith formation, academic excellence, and service.', evidenceTags: ['strategic_plan'], domainKey: 'mission_identity' },
  { code: 'NSBECS-2', parentCode: 'NSBECS-D1', title: 'Rigorous religious studies/catechesis within a curriculum integrating faith, culture, and life.', domainKey: 'mission_identity', domainWeights: { mission_identity: 0.5, academic_excellence: 0.5 } },
  { code: 'NSBECS-3', parentCode: 'NSBECS-D1', title: 'Opportunities beyond the classroom for student faith formation, prayer, and service.', domainKey: 'mission_identity' },
  { code: 'NSBECS-4', parentCode: 'NSBECS-D1', title: 'Opportunities for adult faith formation and action in service of social justice.', domainKey: 'mission_identity' },
  { code: 'NSBECS-5', parentCode: 'NSBECS-D2', title: 'Governing body exercises responsible decision-making in fidelity to mission, academic excellence, and operational vitality.', evidenceTags: ['governance', 'board_minutes', 'policy_manual'], domainKey: 'governance' },
  { code: 'NSBECS-6', parentCode: 'NSBECS-D2', title: 'Qualified leader/leadership team empowered to realize and implement mission and vision.', evidenceTags: ['staff_credentials'], domainKey: 'leadership', domainWeights: { leadership: 0.5, hr: 0.5 } },
  { code: 'NSBECS-7', parentCode: 'NSBECS-D3', title: 'Clearly articulated, rigorous curriculum aligned with standards and Gospel values, implemented through effective instruction.', domainKey: 'academic_excellence' },
  { code: 'NSBECS-8', parentCode: 'NSBECS-D3', title: 'School-wide assessment practices documenting student learning and informing curriculum/instruction improvement.', evidenceTags: ['enrollment_data'], domainKey: 'academic_excellence', domainWeights: { academic_excellence: 0.5, continuous_improvement: 0.5 } },
  { code: 'NSBECS-9', parentCode: 'NSBECS-D3', title: 'Programs and services aligned with mission enriching the academic program and supporting student/family life.', evidenceTags: ['survey'], domainKey: 'student_services', signalKeys: ['pct_students_on_aid', 'financial_aid_per_student'] },
  {
    code: 'NSBECS-10',
    parentCode: 'NSBECS-D4',
    title: 'Feasible 3–5 year financial plan with current and projected budgets, emphasizing stewardship.',
    evidenceTags: ['budget', 'strategic_plan', 'financial_audit'],
    domainKey: 'finance',
    signalKeys: [
      'operating_margin',
      'days_cash_on_hand',
      'months_operating_reserve',
      'tuition_dependency',
      'forecast_operating_margin',
      'forecast_vs_budget_net',
      'plan_readiness',
      'net_tuition_per_student',
    ],
  },
  { code: 'NSBECS-11', parentCode: 'NSBECS-D4', title: 'Published human-resource/personnel policies affecting all staff.', evidenceTags: ['staff_credentials', 'policy_manual'], domainKey: 'hr', signalKeys: ['total_staff_fte', 'teaching_staff_share', 'fte_change_yoy', 'student_teacher_ratio'] },
  { code: 'NSBECS-12', parentCode: 'NSBECS-D4', title: 'Facilities, equipment, and technology management plan supporting the educational mission.', evidenceTags: ['safety_plan'], domainKey: 'facilities', domainWeights: { facilities: 0.5, technology: 0.5 } },
  { code: 'NSBECS-13', parentCode: 'NSBECS-D4', title: 'Comprehensive institutional-advancement plan (communications, enrollment management, development).', evidenceTags: ['marketing', 'enrollment_data'], domainKey: 'finance', domainWeights: { finance: 0.5, leadership: 0.5 }, signalKeys: ['enrollment_change_yoy', 'enrollment_vs_plan', 'tuition_discount_rate', 'net_tuition_per_student', 'tuition_dependency'] },
]

// ─────────────────────────────────────────────────────────────────────────────
// THE FOUR ACCREDITORS SCHOOLS ACTUALLY PAIR WITH — FCIS, ACSI, ACS WASC, SAIS.
//
// PROVENANCE. These four shipped first as KYRO's own condensed summaries,
// authored from general knowledge, and checking them against the accreditors'
// published manuals found real errors — ACSI standard 7 was seeded as
// "facilities" when it is "Character, Values, and Spiritual Formation of
// Students", SAIS was missing "Stakeholder Communication & Relationships"
// entirely, and FCIS was a four-group invention where the manual is a flat list
// of eighteen. Every structure and title below is now the accreditor's own,
// transcribed from:
//
//   FCIS   — Manual for Evaluation and Accreditation, 2023 revised (18 standards)
//   ACSI   — REACH 2019 Edition Standards Manual (8 standards)
//   WASC   — Focus on Learning, ACS WASC (5 categories, A–E)
//   SAIS   — 2022 Accreditation Standards and Indicators (6 standards)
//
// WHAT IS OURS AND WHAT IS THEIRS. The codes, numbering and standard titles are
// the accreditors'. The `domainKey` / `domainWeights` / `signalKeys` mapping is
// KYRO's own product decision about which of our ten domains a standard belongs
// to and which operating figures belong inside it — it is not a claim about the
// accreditor's own structure.
//
// INDICATORS ARE NOT MODELLED. Every one of these frameworks hangs numbered
// indicators under each standard (FCIS 4.1–4.5, SAIS 1.a–1.d, and so on). Those
// are NOT seeded: a school self-scores at the standard level, and inventing an
// indicator tree would repeat exactly the mistake this rewrite corrects. The
// register is flat for all four, which the engine already supports — MSA-CESS
// ships the same way.
//
// CONDITIONAL STANDARDS ARE INCLUDED AND LABELLED. FCIS 8 and 13–18, and SAIS 6,
// apply only to schools running those programs. They are seeded because the
// register should be the accreditor's actual list, and their descriptions say
// when they apply — a school without a residential program removes that one row.
//
// ALL FOUR SHIP INDEX-LESS (`statusBands: []`, index fields null). None of these
// accreditors publishes a Cognia-style numeric index, and inventing one would be
// the single most misleading thing this file could do. Rubric-only is a path MSA
// and NSBECS already exercise, so this adds no new engine branch.
// ─────────────────────────────────────────────────────────────────────────────

// ── FCIS — Manual for Evaluation and Accreditation (2023 revised) ────────────
// The Florida half of the pairing that started this work: FCIS beside Cognia is
// the ordinary arrangement for a Florida independent school.
const FCIS_STANDARDS: CatalogStandardSeed[] = [
  { code: 'FCIS-1', title: 'Mission', evidenceTags: ['strategic_plan'], domainKey: 'mission_identity' },
  { code: 'FCIS-2', title: 'Governance', evidenceTags: ['governance', 'board_minutes', 'policy_manual'], domainKey: 'governance' },
  { code: 'FCIS-3', title: 'Strategic and Long Term Planning', evidenceTags: ['strategic_plan'], domainKey: 'continuous_improvement', signalKeys: ['plan_readiness'] },
  {
    code: 'FCIS-4',
    title: 'Finance',
    evidenceTags: ['budget', 'financial_audit', 'fiscal_resources'],
    domainKey: 'finance',
    signalKeys: [
      'operating_margin',
      'days_cash_on_hand',
      'months_operating_reserve',
      'tuition_dependency',
      'net_tuition_per_student',
      'cost_per_pupil',
      'forecast_vs_budget_net',
    ],
  },
  { code: 'FCIS-5', title: 'Advancement', evidenceTags: ['marketing'], domainKey: 'finance', domainWeights: { finance: 0.5, leadership: 0.5 }, signalKeys: ['tuition_dependency'] },
  { code: 'FCIS-6', title: 'Data and Research', evidenceTags: ['enrollment_data', 'survey'], domainKey: 'continuous_improvement' },
  { code: 'FCIS-7', title: 'Admissions', evidenceTags: ['enrollment_data', 'marketing'], domainKey: 'student_services', domainWeights: { student_services: 0.5, finance: 0.5 }, signalKeys: ['enrollment_change_yoy', 'enrollment_vs_plan', 'pct_students_on_aid', 'tuition_discount_rate'] },
  { code: 'FCIS-8', title: 'Early Childhood Programs', description: 'Applies only to schools operating an early childhood program.', domainKey: 'academic_excellence' },
  { code: 'FCIS-9', title: 'Academic Program', domainKey: 'academic_excellence' },
  { code: 'FCIS-10', title: 'Student Life', evidenceTags: ['survey'], domainKey: 'student_services' },
  { code: 'FCIS-11', title: 'Personnel', evidenceTags: ['staff_credentials', 'policy_manual'], domainKey: 'hr', signalKeys: ['student_teacher_ratio', 'teaching_staff_share', 'total_staff_fte', 'fte_change_yoy'] },
  { code: 'FCIS-12', title: 'Safety, Security and Risk Management', evidenceTags: ['safety_plan'], domainKey: 'facilities' },
  { code: 'FCIS-13', title: 'International Students', description: 'Applies only to schools enrolling international students.', domainKey: 'student_services' },
  { code: 'FCIS-14', title: 'Domestic and International Travel', description: 'Applies only to schools offering student travel.', domainKey: 'student_services' },
  { code: 'FCIS-15', title: 'Residential Life', description: 'Applies only to schools with a residential (boarding) program.', domainKey: 'student_services' },
  { code: 'FCIS-16', title: 'Proprietary Schools', description: 'Applies only to proprietary schools.', domainKey: 'governance' },
  { code: 'FCIS-17', title: 'Special Education', description: 'Applies only to schools operating a special education program.', domainKey: 'student_services' },
  { code: 'FCIS-18', title: 'Online and Blended Learning', description: 'Applies only to schools offering online or blended instruction.', domainKey: 'technology' },
]

// ── ACSI — REACH 2019 Edition ────────────────────────────────────────────────
// Pairs with Cognia the way NSBECS pairs with WCEA. Standard 7 is deliberately
// UNBOUND to any operating signal for the same reason NSBECS-1..4 are: KYRO does
// not measure spiritual formation from a general ledger and will not proxy it.
const ACSI_STANDARDS: CatalogStandardSeed[] = [
  { code: 'ACSI-1', title: 'Philosophy and Foundations', evidenceTags: ['strategic_plan'], domainKey: 'mission_identity' },
  {
    code: 'ACSI-2',
    title: 'Governance and Executive Leadership',
    evidenceTags: ['governance', 'board_minutes', 'policy_manual', 'financial_audit', 'budget'],
    domainKey: 'governance',
    // REACH has no standalone finance standard; financial oversight sits with the
    // board and head, so that is where the operating figures belong. A product
    // mapping decision, not a claim about ACSI's structure.
    domainWeights: { governance: 0.5, finance: 0.5 },
    signalKeys: [
      'operating_margin',
      'days_cash_on_hand',
      'months_operating_reserve',
      'tuition_dependency',
      'forecast_vs_budget_net',
    ],
  },
  { code: 'ACSI-3', title: 'Home and Community Relations and Student Services', evidenceTags: ['survey', 'marketing'], domainKey: 'student_services', domainWeights: { student_services: 0.5, leadership: 0.5 }, signalKeys: ['pct_students_on_aid'] },
  { code: 'ACSI-4', title: 'Personnel', evidenceTags: ['staff_credentials', 'policy_manual'], domainKey: 'hr', signalKeys: ['student_teacher_ratio', 'teaching_staff_share', 'total_staff_fte', 'fte_change_yoy'] },
  { code: 'ACSI-5', title: 'Instructional Program and Resources', evidenceTags: ['enrollment_data'], domainKey: 'academic_excellence' },
  { code: 'ACSI-6', title: 'Student Care', evidenceTags: ['safety_plan'], domainKey: 'facilities', domainWeights: { facilities: 0.5, student_services: 0.5 } },
  { code: 'ACSI-7', title: 'Character, Values, and Spiritual Formation of Students', domainKey: 'mission_identity' },
  { code: 'ACSI-8', title: 'Continuous School Improvement Plan', evidenceTags: ['strategic_plan'], domainKey: 'continuous_improvement', signalKeys: ['plan_readiness'] },
]

// ── ACS WASC — Focus on Learning ─────────────────────────────────────────────
// Five categories, A–E, in the accreditor's own lettering. Category A carries
// governance, leadership, staffing AND resources together, which is WASC's own
// grouping — so a WASC school's finance figures sit inside a standard that is
// three-quarters about other things. That is the framework's shape, not a gap
// in ours, and the weights say so.
const WASC_STANDARDS: CatalogStandardSeed[] = [
  {
    code: 'WASC-A',
    title: 'Organization: Vision and Purpose, Governance, Leadership, Staff, and Resources',
    evidenceTags: ['strategic_plan', 'governance', 'board_minutes', 'policy_manual', 'staff_credentials', 'budget', 'financial_audit'],
    domainKey: 'governance',
    domainWeights: { governance: 0.25, leadership: 0.25, hr: 0.25, finance: 0.25 },
    signalKeys: [
      'operating_margin',
      'days_cash_on_hand',
      'months_operating_reserve',
      'tuition_dependency',
      'student_teacher_ratio',
      'total_staff_fte',
    ],
  },
  { code: 'WASC-B', title: 'Curriculum', domainKey: 'academic_excellence' },
  { code: 'WASC-C', title: 'Learning and Teaching', domainKey: 'academic_excellence' },
  { code: 'WASC-D', title: 'Assessment and Accountability', evidenceTags: ['enrollment_data', 'strategic_plan'], domainKey: 'continuous_improvement', signalKeys: ['plan_readiness'] },
  {
    code: 'WASC-E',
    title:
      'School Culture and Support for Student Personal, Social-Emotional, and Academic Growth',
    evidenceTags: ['survey', 'safety_plan'],
    domainKey: 'student_services',
    signalKeys: ['pct_students_on_aid', 'financial_aid_per_student'],
  },
]

// ── SAIS — 2022 Accreditation Standards and Indicators ───────────────────────
// SAIS is the Southeast's independent-school accreditor and is very often paired
// with Cognia, which makes it the second framework a great many of these schools
// actually hold.
const SAIS_STANDARDS: CatalogStandardSeed[] = [
  { code: 'SAIS-1', title: 'Mission', evidenceTags: ['strategic_plan'], domainKey: 'mission_identity' },
  { code: 'SAIS-2', title: 'Governance & Leadership', evidenceTags: ['governance', 'board_minutes', 'policy_manual'], domainKey: 'governance', domainWeights: { governance: 0.5, leadership: 0.5 } },
  { code: 'SAIS-3', title: 'Teaching & Learning', evidenceTags: ['enrollment_data'], domainKey: 'academic_excellence' },
  { code: 'SAIS-4', title: 'Stakeholder Communication & Relationships', evidenceTags: ['survey', 'marketing'], domainKey: 'leadership' },
  {
    code: 'SAIS-5',
    title: 'Resources & Support Systems',
    evidenceTags: ['budget', 'financial_audit', 'fiscal_resources', 'staff_credentials', 'safety_plan'],
    domainKey: 'finance',
    domainWeights: { finance: 0.4, hr: 0.3, facilities: 0.3 },
    signalKeys: [
      'operating_margin',
      'days_cash_on_hand',
      'months_operating_reserve',
      'tuition_dependency',
      'net_tuition_per_student',
      'student_teacher_ratio',
      'total_staff_fte',
      'forecast_vs_budget_net',
    ],
  },
  { code: 'SAIS-6', title: 'Virtual Learning', description: 'Applies only to schools offering virtual or online instruction.', domainKey: 'technology' },
]

// ── NIPSA — Accreditation Criteria (Academic Accreditation) ──────────────────
// Transcribed VERBATIM from the live nipsa.org/accreditation/ page (2026-08-25):
// the criterion NAMES are the titles, the statements ride in `description`, and
// the page's own lead-in ("The school shall have…") explains the sentence
// fragments. FLAT — the live page publishes a flat list of twelve; inventing a
// domain tree would repeat the mistake the condensed-framework rewrite fixed.
// The situational criteria (Dormitories/boarding, Early Childhood, Special
// Needs) and the add-on programs (Therapeutic Certification, Autism
// Endorsement) are NOT seeded as standards — the framework description names
// them. The domainKey/evidenceTags/signalKeys mapping is KYRO's own product
// decision, as it is for every framework here.
const NIPSA_STANDARDS: CatalogStandardSeed[] = [
  { code: 'NIPSA-1', title: 'General Data', description: 'Current statistical information', evidenceTags: ['enrollment_data'], domainKey: 'continuous_improvement' },
  { code: 'NIPSA-2', title: 'Philosophy and Goals', description: 'A statement of philosophy by the governing body of the school. Goals and objectives consistent with that philosophy shall be systematically developed and reviewed by the administration and staff, and are to be shared often with the students and the parent community. There shall be a continual evaluation of progress toward these goals and objectives.', evidenceTags: ['strategic_plan'], domainKey: 'mission_identity', domainWeights: { mission_identity: 0.5, continuous_improvement: 0.5 }, signalKeys: ['plan_readiness'] },
  { code: 'NIPSA-3', title: 'Organization', description: 'A clearly defined and demonstrably workable organizational structure whereby these goals and objectives are carried out. This structure should specify the functions of the administration, staff and students, the administrative relationship among these groups, and the limits of authority and responsibility.', evidenceTags: ['governance', 'policy_manual'], domainKey: 'governance' },
  { code: 'NIPSA-4', title: 'Curriculum', description: "A curricular program with written course descriptions and objectives that provide all students with suitable courses of instruction consistent with the school's philosophy and goals, and the students' needs, abilities, and interests. There shall be adequate instructional resources to implement the curricular program. The curriculum should be the object of continual evaluation and development by the faculty, students, and administration.", domainKey: 'academic_excellence' },
  { code: 'NIPSA-5', title: 'Instruction and Learning', description: 'An instructional program that addresses the needs of all students, emphasizes active learning, and provides teachers and students with ample material.', domainKey: 'academic_excellence' },
  { code: 'NIPSA-6', title: 'Pupil Services', description: 'Pupil services that identify the needs, interests, aptitudes, and goals of all its students with adequate educational, personal, social, and career guidance.', evidenceTags: ['survey'], domainKey: 'student_services' },
  { code: 'NIPSA-7', title: 'Pupil Activities', description: "Appropriate student activity offerings that supplement the formal instruction of the school. These should be responsive to the students' needs and interests and shall draw upon special skills and enthusiasm among students and faculty.", domainKey: 'student_services' },
  { code: 'NIPSA-8', title: 'School Staff', description: 'A well-qualified staff that effectively fulfills its responsibilities.', evidenceTags: ['staff_credentials'], domainKey: 'hr', signalKeys: ['student_teacher_ratio', 'total_staff_fte', 'teaching_staff_share', 'fte_change_yoy'] },
  { code: 'NIPSA-9', title: 'Parent Community', description: 'A supportive parent community that is encouraged to share its ideas and recommendations and, when invited to, actively participate in prescribed areas of the school program.', evidenceTags: ['survey', 'marketing'], domainKey: 'mission_identity' },
  { code: 'NIPSA-10', title: 'School Plant', description: 'A school plant and physical facility that enables staff to implement effectively the school program.', evidenceTags: ['safety_plan'], domainKey: 'facilities' },
  {
    code: 'NIPSA-11',
    title: 'Finance',
    description: "Continuing financial support adequate to provide staff, physical facilities, instructional resources, and other support services necessary to operate effective educational programs. Budgetary planning should involve those who are responsible for implementing the school's programs and services.",
    evidenceTags: ['budget', 'financial_audit', 'fiscal_resources'],
    domainKey: 'finance',
    signalKeys: [
      'operating_margin',
      'days_cash_on_hand',
      'months_operating_reserve',
      'tuition_dependency',
      'cost_per_pupil',
      'forecast_vs_budget_net',
    ],
  },
  { code: 'NIPSA-12', title: 'School Improvement Plan', description: 'As part of the self-study the school will prepare a school improvement plan (SIP). The school improvement committee shall represent the school community and may employ a model that is appropriate for the school and its mission. The plan should analyze data from the self-study and other sources to determine the present state of the school and to develop objectives and action plans to improve student learning.', evidenceTags: ['strategic_plan'], domainKey: 'continuous_improvement', signalKeys: ['plan_readiness'] },
]

/**
 * The frozen framework rows. TWO Cognia editions (2022 superseded by rev. 2025)
 * share ONE standards build — identical codes, tree, tags, domain map and
 * plain language; only titles, rubric vocabulary and metadata differ.
 */
export const FRAMEWORK_SEEDS: FrameworkSeed[] = [
  {
    code: 'cognia_2022',
    accreditor: 'Cognia',
    // Six-year term: the Engagement Review cadence the cycle engine is built on.
    defaultTermYears: 6,
    name: 'Cognia Performance Standards (2022)',
    version: '2022',
    description:
      'Superseded by the rev. 2025 standards for new adoptions. Retains the legacy i3 rubric vocabulary this edition was scored under.',
    // ── WS2 R7: rubricLabels, statusBands and all 42 standards rows stay
    // BYTE-IDENTICAL (spec-pinned). These four words are the scale schools
    // already scored under; correcting them in place would misrepresent what a
    // historical 1–4 meant on the day it was asserted. Only name/description/
    // aliases/supersededByCode change on this row.
    rubricLabels: ['Insufficient', 'Initiating', 'Improving', 'Impacting'],
    statusBands: [
      { min: 240, label: 'Accredited Needing Improvement' },
      { min: 280, label: 'Accredited' },
      { min: 320, label: 'Accredited with Merit' },
      { min: 360, label: 'Accredited with Distinction' },
    ],
    indexMin: 100,
    indexMax: 400,
    defaultTarget: 280,
    aliases: COGNIA_ALIASES,
    supersededByCode: 'cognia_2025',
    standards: COGNIA_2022_STANDARDS,
  },
  {
    code: 'cognia_2025',
    defaultTermYears: 6,
    accreditor: 'Cognia',
    name: 'Cognia Performance Standards (rev. 2025)',
    version: '2025',
    description:
      'The 31 Cognia Performance Standards as revised 03.05.2025 (incl. Standard 31), with the current Level 1–4 rubric vocabulary and the 2025–26 status tiers. Statements are the accreditor’s own.',
    // Reviewer shorthand, L1→L4 (verbatim single words from the 2025 rubric).
    rubricLabels: ['Insufficient', 'Developing', 'Engaging', 'Demonstrating'],
    // The long-form rubric point-value definitions, VERBATIM from the official
    // Performance Standards and Rubrics PDF (L1→L4, positional like rubricLabels).
    rubricDescriptors: [
      'Reflecting areas with insufficient evidence and/or limited activity leading toward improvement',
      'Developing or improving practices that provide evidence that effort approaches desired level of effectiveness',
      'Engaging in practices that provide evidence of expected effectiveness that is reflected in the standard',
      'Demonstrating noteworthy practices producing clear results that positively impact learners',
    ],
    statusBands: [
      { min: 240, label: 'Accredited Needing Improvement' },
      { min: 280, label: 'Accredited' },
      { min: 320, label: 'Accredited with Merit' },
      { min: 360, label: 'Accredited with Distinction' },
    ],
    indexMin: 100,
    indexMax: 400,
    defaultTarget: 280,
    aliases: COGNIA_ALIASES,
    indexReference: { value: 296, label: 'Cognia network average IEQ (2024–25)' },
    standards: COGNIA_2025_STANDARDS,
  },
  {
    code: 'msa_cess_2022',
    accreditor: 'MSA-CESS',
    // NO defaultTermYears: msa-cess.org publishes 5- and 10-year terms per
    // school, so there is no one honest default — the school sets its own.
    // WS2 R10 — the seeded content IS the School Edition 2021 five-standard set;
    // only the name/version strings were misdated. `code` is an identity
    // (seriesKey history, profile rows, audit rows) and is never renamed.
    name: 'MSA-CESS Standards for Accreditation, School Edition (2021)',
    version: 'School Edition 2021',
    // NCPSA member (verified on the live ncpsa.org member list, 2026-08-25).
    recognitions: ['ncpsa'],
    rubricLabels: ['Not Evident', 'Emerging', 'Meets Expectations', 'Exceeds Expectations'],
    statusBands: [],
    indexMin: null,
    indexMax: null,
    defaultTarget: null,
    standards: MSA_STANDARDS,
  },
  {
    code: 'nsbecs',
    accreditor: 'NSBECS/WCEA',
    name: 'National Standards & Benchmarks for Effective Catholic Schools',
    version: '2012',
    rubricLabels: ['Does Not Meet', 'Partially Meets', 'Fully Meets', 'Exceeds'],
    statusBands: [],
    indexMin: null,
    indexMax: null,
    defaultTarget: null,
    standards: NSBECS_STANDARDS,
  },
  {
    // ── FCCAP — an ACCREDITOR whose standards are the NSBECS. Verified in a
    //    browser 2026-09-10 against the program's own site (eas-ed.org —
    //    fcconline.org is an unrelated Wisconsin agency), its Accreditrac
    //    portal login page, and two accredited schools' pages:
    //    · eas-ed.org: "Accrediting Catholic schools in Florida since 1969";
    //      "The current standards use The National Standards and Benchmarks
    //      for Effective Catholic and Secondary Schools, as well as Florida
    //      Department of Education and Florida Department of Children and
    //      Families requirements"; housed within the Florida Conference of
    //      Catholic Bishops, Tallahassee; "Accreditrac, LLC created a dynamic
    //      platform that is used by schools' faculty and staff,
    //      superintendents, visiting teams, and the FCC accreditation staff at
    //      every level of the process."
    //    · shcs.ptdiocese.org + stjcs.com (accredited schools): "approved for
    //      use in the Catholic schools by the Florida Bishops"; "Each school is
    //      accredited on a seven-year rotation"; a multi-year improvement plan
    //      approved by an FCC visiting team.
    //    SINGLE-SOURCE (eas-ed.org only, so kept OUT of the description): housed
    //    within the Florida Conference of Catholic Bishops (Tallahassee); FL DOE
    //    and DCF requirements layered on the NSBECS.
    //    NOT verified (and therefore NOT in the UI): the four-domain split of
    //    the FCC rubric, the "over 180 schools" count, and NCPSA membership —
    //    eas-ed.org links to ncpsa.org, but ncpsa.org publishes no member list
    //    we could read, so `recognitions` stays [] (a badge is never inferred).
    //    Standards are NSBECS_STANDARDS BY REFERENCE (the cognia_2025 trick,
    //    spec-pinned) — one catalog, never a duplicate; the FL DOE/DCF
    //    requirements FCC layers on top are not modelled.
    code: 'fccap',
    accreditor: 'Florida Catholic Conference',
    // "Each school is accredited on a seven-year rotation" (verified above).
    defaultTermYears: 7,
    name: 'Florida Catholic Conference Accreditation Program (NSBECS rubrics)',
    version: '7-year cycle',
    description:
      'The Florida Catholic Conference Accreditation Program has accredited Catholic schools in Florida since 1969. Its standards are based on the National Standards and Benchmarks for Effective Catholic Elementary and Secondary Schools, and each school is accredited on a seven-year rotation with a visiting team. The annual report, self-study, evidence and visitation are filed in the program\u2019s Accreditrac portal \u2014 KYRO organises what you will upload there; it does not submit on your behalf.',
    aliases: [
      'FCC',
      'FCCAP',
      'Florida Catholic Conference Accreditation Program',
      'Accreditrac',
    ],
    // eas-ed.org links to NCPSA but no member list could be read — an
    // UNVERIFIED membership is an empty array, never a badge.
    recognitions: [],
    rubricLabels: ['Does Not Meet', 'Partially Meets', 'Fully Meets', 'Exceeds'],
    statusBands: [],
    indexMin: null,
    indexMax: null,
    defaultTarget: null,
    standards: NSBECS_STANDARDS,
  },
  // ── The four below are KYRO CONDENSED SUMMARIES, not transcriptions. See the
  //    provenance note above their standards; the version string carries the same
  //    warning onto every screen a school reads them on.
  {
    code: 'fcis_2023',
    accreditor: 'FCIS',
    // FCIS Manual for Evaluation and Accreditation: periodic evaluation every five years.
    defaultTermYears: 5,
    name: 'Florida Council of Independent Schools Accreditation Standards',
    version: '2023 Manual',
    description:
      'The 18 standards of the FCIS Manual for Evaluation and Accreditation (2023 revised). Standard titles and numbering are the accreditor\u2019s; indicators are not modelled \u2014 score at the standard level. Standards 8 and 13\u201318 apply only to schools running those programs.',
    // ICAISA full member — NOT NCPSA (the NCPSA Florida member is AISF, a
    // DIFFERENT body; the two are the ones the market guesses wrong).
    recognitions: ['icaisa'],
    rubricLabels: ['Not Addressed', 'Developing', 'Meets Standard', 'Exceeds Standard'],
    statusBands: [],
    indexMin: null,
    indexMax: null,
    defaultTarget: null,
    standards: FCIS_STANDARDS,
  },
  {
    code: 'acsi_reach',
    accreditor: 'ACSI',
    // REACH Standards Manual: accreditation for a maximum of five years.
    defaultTermYears: 5,
    name: 'ACSI REACH Accreditation Standards',
    version: 'REACH 2019',
    description:
      'The 8 standards of the ACSI REACH 2019 Edition Standards Manual. Standard titles and numbering are the accreditor\u2019s; indicators are not modelled \u2014 score at the standard level.',
    // NCPSA full recognition, June 2024 (verified).
    recognitions: ['ncpsa'],
    rubricLabels: ['Not Met', 'Partially Met', 'Met', 'Exemplary'],
    statusBands: [],
    indexMin: null,
    indexMax: null,
    defaultTarget: null,
    standards: ACSI_STANDARDS,
  },
  {
    code: 'acs_wasc',
    accreditor: 'ACS WASC',
    // acswasc.org: "an ongoing six-year cycle of quality".
    defaultTermYears: 6,
    name: 'ACS WASC Focus on Learning Criteria',
    version: 'Focus on Learning',
    description:
      'The five Focus on Learning categories (A\u2013E) used by ACS WASC. Category letters and titles are the accreditor\u2019s; criteria and indicators are not modelled \u2014 score at the category level.',
    recognitions: ['ncpsa'],
    rubricLabels: ['Little Evidence', 'Some Evidence', 'Consistent Evidence', 'Highly Effective'],
    statusBands: [],
    indexMin: null,
    indexMax: null,
    defaultTarget: null,
    standards: WASC_STANDARDS,
  },
  {
    code: 'sais_2023',
    // sais.org Accreditation Policies: terms are generally for five years.
    defaultTermYears: 5,
    accreditor: 'SAIS',
    name: 'Southern Association of Independent Schools Accreditation Standards',
    version: '2022 Standards',
    description:
      'The 6 standards of the SAIS 2022 Accreditation Standards and Indicators. Standard titles and numbering are the accreditor\u2019s; indicators are not modelled \u2014 score at the standard level. Standard 6 applies only to schools offering virtual learning.',
    // On BOTH lists (TN policy names SAIS under ICAISA explicitly).
    recognitions: ['ncpsa', 'icaisa'],
    rubricLabels: ['Not Evident', 'Emerging', 'Meets Standard', 'Exceeds Standard'],
    statusBands: [],
    indexMin: null,
    indexMax: null,
    defaultTarget: null,
    standards: SAIS_STANDARDS,
  },
  {
    code: 'nipsa_academic',
    accreditor: 'NIPSA',
    // NIPSA accredits on a 7-year term (nipsa.org, transcribed in the description).
    defaultTermYears: 7,
    name: 'NIPSA Accreditation Criteria (Academic Accreditation)',
    version: 'Academic',
    description:
      'The twelve NIPSA accreditation criteria, transcribed verbatim from the live nipsa.org accreditation page. NIPSA accredits on a 7-year term (candidacy up to 3 years \u2192 self-study \u2192 site visit \u2192 board decision, with a year-3 recommendations report); decisions are provisional accreditation, accreditation, warning, or probation \u2014 NIPSA publishes no numeric index and no per-standard rubric levels, so the four-level scale here is KYRO\u2019s generic self-scoring aid, not NIPSA\u2019s. Situational criteria (boarding/dormitories, early childhood, special needs) and the Therapeutic Certification / Autism Endorsement programs exist beyond these twelve and are not modelled \u2014 score at the criterion level.',
    aliases: ['NIPSA', 'National Independent Private Schools Association'],
    // NCPSA member since 1994 (verified); LA R.S. 17:4021's approved list names NIPSA.
    recognitions: ['ncpsa'],
    // NIPSA publishes NO per-standard scale \u2014 this is the same generic
    // self-scoring vocabulary the other unscaled frameworks use, never
    // attributed to NIPSA (the description says so out loud).
    rubricLabels: ['Not Evident', 'Emerging', 'Meets Standard', 'Exceeds Standard'],
    statusBands: [],
    indexMin: null,
    indexMax: null,
    defaultTarget: null,
    standards: NIPSA_STANDARDS,
  },
]

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

/** The frozen framework rows. ONE Cognia framework contains all 31 standards. */
export const FRAMEWORK_SEEDS: FrameworkSeed[] = [
  {
    code: 'cognia_2022',
    accreditor: 'Cognia',
    name: 'Cognia Performance Standards (2022, incl. 2025 update)',
    version: '2022',
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
    standards: COGNIA_STANDARDS,
  },
  {
    code: 'msa_cess_2022',
    accreditor: 'MSA-CESS',
    name: 'MSA-CESS Standards for Accreditation (2022)',
    version: '2022',
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
]

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

// ─────────────────────────────────────────────────────────────────────────────
// THE FOUR ACCREDITORS SCHOOLS ACTUALLY PAIR WITH — FCIS, ACSI, ACS WASC, SAIS.
//
// PROVENANCE, STATED PLAINLY. The three frameworks above were transcribed from
// the accreditors' own published documents. THESE FOUR ARE NOT. Their structures
// and titles are KYRO's own condensed summaries, authored from general knowledge
// of each accreditor as of 2026 and NOT verified line-by-line against a current
// official protocol. That is why:
//
//   • every `version` string carries "(KYRO condensed)", which is what a school
//     sees on the adopt screen and on its readiness hero;
//   • the codes (FCIS-1, ACSI-3…) are OURS, not the accreditors' numbering, so a
//     school can never mistake one of our codes for a citation;
//   • the titles are paraphrases in our own words — the same choice made for MSA
//     and NSBECS above, and the opposite of Cognia's near-verbatim titles, which
//     remain the outlier rather than the precedent.
//
// A school self-scores its own register against its own accreditor's document.
// These seeds save it the typing; they are not a substitute for the protocol, and
// they must be checked against current official documents before any marketing
// claim of "supports FCIS/ACSI/WASC/SAIS accreditation" is made.
//
// ALL FOUR SHIP INDEX-LESS (`statusBands: []`, index fields null). None of these
// accreditors publishes a Cognia-style numeric index, and inventing one would be
// the single most misleading thing this file could do. Rubric-only is a path MSA
// and NSBECS already exercise end to end, so this adds no new engine branch.
// ─────────────────────────────────────────────────────────────────────────────

// ── FCIS (Florida Council of Independent Schools) ────────────────────────────
// The Florida half of the pairing that started this work: FCIS beside Cognia is
// the ordinary arrangement for a Florida independent school, and it is what made
// a single-framework read visibly wrong.
const FCIS_STANDARDS: CatalogStandardSeed[] = [
  { code: 'FCIS-S1', title: 'School Identity and Governance', domainKey: 'mission_identity' },
  { code: 'FCIS-S2', title: 'People', domainKey: 'hr' },
  { code: 'FCIS-S3', title: 'Program', domainKey: 'academic_excellence' },
  { code: 'FCIS-S4', title: 'Operations and Stewardship', domainKey: 'finance' },

  { code: 'FCIS-1', parentCode: 'FCIS-S1', title: 'A stated mission and philosophy that guides decisions and is reviewed periodically.', evidenceTags: ['strategic_plan'], domainKey: 'mission_identity' },
  { code: 'FCIS-2', parentCode: 'FCIS-S1', title: 'A governing body with defined authority, written policies, and a board that governs rather than manages.', evidenceTags: ['governance', 'board_minutes', 'policy_manual'], domainKey: 'governance' },
  { code: 'FCIS-3', parentCode: 'FCIS-S1', title: 'A head of school with clear authority for daily operation, evaluated against defined expectations.', evidenceTags: ['governance'], domainKey: 'leadership' },
  { code: 'FCIS-4', parentCode: 'FCIS-S1', title: 'Truthful publications, admissions materials and public representations of the school.', evidenceTags: ['marketing'], domainKey: 'leadership' },

  { code: 'FCIS-5', parentCode: 'FCIS-S2', title: 'Faculty qualified for the subjects and ages they teach, with credentials on file.', evidenceTags: ['staff_credentials'], domainKey: 'hr', signalKeys: ['student_teacher_ratio', 'teaching_staff_share'] },
  { code: 'FCIS-6', parentCode: 'FCIS-S2', title: 'Written personnel policies, contracts, evaluation and professional development for all staff.', evidenceTags: ['policy_manual', 'staff_credentials'], domainKey: 'hr', signalKeys: ['total_staff_fte', 'fte_change_yoy'] },

  { code: 'FCIS-7', parentCode: 'FCIS-S3', title: 'A documented curriculum appropriate to the school\u2019s mission and the students it enrolls.', domainKey: 'academic_excellence' },
  { code: 'FCIS-8', parentCode: 'FCIS-S3', title: 'Student records, transcripts and reporting maintained accurately and securely.', evidenceTags: ['enrollment_data'], domainKey: 'student_services' },
  { code: 'FCIS-9', parentCode: 'FCIS-S3', title: 'Student support, guidance and health services appropriate to the enrolled population.', evidenceTags: ['survey'], domainKey: 'student_services', signalKeys: ['pct_students_on_aid'] },

  {
    code: 'FCIS-10',
    parentCode: 'FCIS-S4',
    title: 'Sound financial management: an annual budget, an external audit or review, and reserves adequate to the school\u2019s obligations.',
    evidenceTags: ['budget', 'financial_audit', 'fiscal_resources'],
    domainKey: 'finance',
    signalKeys: [
      'operating_margin',
      'days_cash_on_hand',
      'months_operating_reserve',
      'tuition_dependency',
      'net_tuition_per_student',
      'tuition_discount_rate',
      'forecast_vs_budget_net',
    ],
  },
  { code: 'FCIS-11', parentCode: 'FCIS-S4', title: 'Facilities, grounds and transportation that are safe, licensed where required, and inspected on schedule.', evidenceTags: ['safety_plan'], domainKey: 'facilities', domainWeights: { facilities: 0.75, technology: 0.25 } },
  { code: 'FCIS-12', parentCode: 'FCIS-S4', title: 'Enrolment planning and advancement activity sufficient to sustain the school\u2019s program.', evidenceTags: ['enrollment_data', 'marketing'], domainKey: 'continuous_improvement', domainWeights: { continuous_improvement: 0.5, finance: 0.5 }, signalKeys: ['enrollment_change_yoy', 'enrollment_vs_plan', 'plan_readiness'] },
]

// ── ACSI (Association of Christian Schools International) ────────────────────
// Pairs with Cognia the way NSBECS pairs with WCEA. Standard 1 is deliberately
// UNBOUND for the same reason NSBECS-1..4 are: KYRO does not measure spiritual
// formation from a general ledger and will not proxy it with anything it has.
const ACSI_STANDARDS: CatalogStandardSeed[] = [
  { code: 'ACSI-1', title: 'Philosophy and foundations: a Christ-centred purpose expressed in the school\u2019s stated philosophy and lived program.', evidenceTags: ['strategic_plan'], domainKey: 'mission_identity' },
  { code: 'ACSI-2', title: 'Governance and executive leadership: a board governing by written policy and a qualified head with defined authority.', evidenceTags: ['governance', 'board_minutes', 'policy_manual'], domainKey: 'governance', domainWeights: { governance: 0.5, leadership: 0.5 } },
  { code: 'ACSI-3', title: 'Home, school and community relations: honest communication with families and the constituency the school serves.', evidenceTags: ['survey', 'marketing'], domainKey: 'leadership' },
  { code: 'ACSI-4', title: 'Personnel: qualified, credentialed staff supported by written policies, evaluation and professional growth.', evidenceTags: ['staff_credentials', 'policy_manual'], domainKey: 'hr', signalKeys: ['total_staff_fte', 'teaching_staff_share', 'student_teacher_ratio', 'fte_change_yoy'] },
  { code: 'ACSI-5', title: 'Instructional program: a written curriculum aligned to the school\u2019s philosophy, delivered and assessed effectively.', evidenceTags: ['enrollment_data'], domainKey: 'academic_excellence' },
  { code: 'ACSI-6', title: 'Student services: guidance, health, and support services appropriate to the students enrolled.', evidenceTags: ['survey'], domainKey: 'student_services', signalKeys: ['pct_students_on_aid', 'financial_aid_per_student'] },
  { code: 'ACSI-7', title: 'Facilities, environment and transportation: safe, maintained and adequate to the program offered.', evidenceTags: ['safety_plan'], domainKey: 'facilities', domainWeights: { facilities: 0.75, technology: 0.25 } },
  {
    code: 'ACSI-8',
    title: 'Continuous school improvement: a documented improvement plan supported by a sustainable financial model.',
    evidenceTags: ['strategic_plan', 'budget', 'financial_audit', 'fiscal_resources'],
    domainKey: 'continuous_improvement',
    domainWeights: { continuous_improvement: 0.5, finance: 0.5 },
    signalKeys: [
      'plan_readiness',
      'operating_margin',
      'days_cash_on_hand',
      'months_operating_reserve',
      'tuition_dependency',
      'forecast_operating_margin',
      'forecast_vs_budget_net',
    ],
  },
]

// ── ACS WASC (Focus on Learning) ─────────────────────────────────────────────
// Five categories, A\u2013E, in the accreditor's own lettering. The finance and
// facilities weight sits in Category A, which is where WASC puts resources \u2014
// so a WASC school's finance domain rests on a single leaf, exactly as Cognia's
// does. That is the framework's shape, not a gap in ours.
const WASC_STANDARDS: CatalogStandardSeed[] = [
  { code: 'WASC-A', title: 'Organization for Student Learning', domainKey: 'governance' },
  { code: 'WASC-B', title: 'Curriculum', domainKey: 'academic_excellence' },
  { code: 'WASC-C', title: 'Instruction', domainKey: 'academic_excellence' },
  { code: 'WASC-D', title: 'Assessment and Accountability', domainKey: 'continuous_improvement' },
  { code: 'WASC-E', title: 'School Culture and Support for Student Growth', domainKey: 'student_services' },

  { code: 'WASC-A1', parentCode: 'WASC-A', title: 'A vision, mission and schoolwide learner outcomes defined with the community and reviewed on a cycle.', evidenceTags: ['strategic_plan', 'survey'], domainKey: 'mission_identity' },
  { code: 'WASC-A2', parentCode: 'WASC-A', title: 'A governing body and leadership structure with defined roles, written policies and an evaluated head.', evidenceTags: ['governance', 'board_minutes', 'policy_manual'], domainKey: 'governance', domainWeights: { governance: 0.5, leadership: 0.5 } },
  { code: 'WASC-A3', parentCode: 'WASC-A', title: 'Qualified staff assigned and supported so that the instructional program can be delivered as designed.', evidenceTags: ['staff_credentials'], domainKey: 'hr', signalKeys: ['student_teacher_ratio', 'teaching_staff_share', 'total_staff_fte'] },
  {
    code: 'WASC-A4',
    parentCode: 'WASC-A',
    title: 'Financial, physical and technology resources allocated and monitored to support the schoolwide learner outcomes.',
    evidenceTags: ['budget', 'financial_audit', 'fiscal_resources', 'safety_plan'],
    domainKey: 'finance',
    domainWeights: { finance: 0.5, facilities: 0.25, technology: 0.25 },
    signalKeys: [
      'operating_margin',
      'days_cash_on_hand',
      'months_operating_reserve',
      'tuition_dependency',
      'cost_per_pupil',
      'forecast_vs_budget_net',
    ],
  },

  { code: 'WASC-B1', parentCode: 'WASC-B', title: 'A curriculum aligned to the schoolwide learner outcomes and accessible to every student enrolled.', domainKey: 'academic_excellence' },
  { code: 'WASC-B2', parentCode: 'WASC-B', title: 'Programs and pathways that prepare students for their stated post-school goals.', evidenceTags: ['enrollment_data'], domainKey: 'academic_excellence' },

  { code: 'WASC-C1', parentCode: 'WASC-C', title: 'Instruction that engages every student in the intended learning, differentiated where needed.', domainKey: 'academic_excellence' },
  { code: 'WASC-C2', parentCode: 'WASC-C', title: 'Teachers use current materials, digital resources and applied learning appropriate to the program.', domainKey: 'technology' },

  { code: 'WASC-D1', parentCode: 'WASC-D', title: 'An assessment system that reports student progress against the schoolwide learner outcomes.', evidenceTags: ['enrollment_data'], domainKey: 'continuous_improvement', domainWeights: { continuous_improvement: 0.5, academic_excellence: 0.5 } },
  { code: 'WASC-D2', parentCode: 'WASC-D', title: 'Assessment results drive the schoolwide action plan and the resources committed to it.', evidenceTags: ['strategic_plan'], domainKey: 'continuous_improvement', signalKeys: ['plan_readiness'] },

  { code: 'WASC-E1', parentCode: 'WASC-E', title: 'A safe, inclusive environment with health, safety and emergency procedures maintained and rehearsed.', evidenceTags: ['safety_plan'], domainKey: 'facilities' },
  { code: 'WASC-E2', parentCode: 'WASC-E', title: 'Personal, academic and career support services available and used by the students who need them.', evidenceTags: ['survey'], domainKey: 'student_services', signalKeys: ['pct_students_on_aid', 'financial_aid_per_student'] },
  { code: 'WASC-E3', parentCode: 'WASC-E', title: 'Families and the community are engaged as partners in student learning.', evidenceTags: ['survey', 'marketing'], domainKey: 'leadership' },
]

// ── SAIS (Southern Association of Independent Schools) ───────────────────────
// SAIS is the Southeast's independent-school accreditor and is very often paired
// with Cognia \u2014 a joint SAIS/Cognia protocol is the common arrangement, which
// makes it the second framework a great many of these schools actually hold.
const SAIS_STANDARDS: CatalogStandardSeed[] = [
  { code: 'SAIS-S1', title: 'Mission and Strategy', domainKey: 'mission_identity' },
  { code: 'SAIS-S2', title: 'Governance and Leadership', domainKey: 'governance' },
  { code: 'SAIS-S3', title: 'Teaching, Learning and Student Life', domainKey: 'academic_excellence' },
  { code: 'SAIS-S4', title: 'Resources and Sustainability', domainKey: 'finance' },
  { code: 'SAIS-S5', title: 'Continuous Improvement', domainKey: 'continuous_improvement' },

  { code: 'SAIS-1', parentCode: 'SAIS-S1', title: 'A clear mission, adopted by the board, that the school\u2019s program and decisions can be measured against.', evidenceTags: ['strategic_plan'], domainKey: 'mission_identity' },
  { code: 'SAIS-2', parentCode: 'SAIS-S1', title: 'A current strategic plan with named owners, resources and review points.', evidenceTags: ['strategic_plan'], domainKey: 'continuous_improvement', signalKeys: ['plan_readiness'] },

  { code: 'SAIS-3', parentCode: 'SAIS-S2', title: 'A board that governs by written policy, maintains its own succession and evaluates the head.', evidenceTags: ['governance', 'board_minutes', 'policy_manual'], domainKey: 'governance' },
  { code: 'SAIS-4', parentCode: 'SAIS-S2', title: 'A head and leadership team with the authority and support to run the school day to day.', evidenceTags: ['governance'], domainKey: 'leadership' },

  { code: 'SAIS-5', parentCode: 'SAIS-S3', title: 'A documented program appropriate to the mission, reviewed on a cycle and staffed by qualified faculty.', evidenceTags: ['staff_credentials'], domainKey: 'academic_excellence', domainWeights: { academic_excellence: 0.5, hr: 0.5 }, signalKeys: ['student_teacher_ratio', 'teaching_staff_share'] },
  { code: 'SAIS-6', parentCode: 'SAIS-S3', title: 'Student wellbeing, safety and support services appropriate to the students enrolled.', evidenceTags: ['safety_plan', 'survey'], domainKey: 'student_services' },
  { code: 'SAIS-7', parentCode: 'SAIS-S3', title: 'Written personnel policies, evaluation and professional growth for faculty and staff.', evidenceTags: ['policy_manual', 'staff_credentials'], domainKey: 'hr', signalKeys: ['total_staff_fte', 'fte_change_yoy'] },

  {
    code: 'SAIS-8',
    parentCode: 'SAIS-S4',
    title: 'A financial model that sustains the mission: budget, audit, reserves and a multi-year view of tuition and enrolment.',
    evidenceTags: ['budget', 'financial_audit', 'fiscal_resources'],
    domainKey: 'finance',
    signalKeys: [
      'operating_margin',
      'days_cash_on_hand',
      'months_operating_reserve',
      'tuition_dependency',
      'net_tuition_per_student',
      'tuition_discount_rate',
      'forecast_operating_margin',
      'forecast_vs_budget_net',
    ],
  },
  { code: 'SAIS-9', parentCode: 'SAIS-S4', title: 'Facilities and technology maintained, inspected and adequate to the program offered.', evidenceTags: ['safety_plan'], domainKey: 'facilities', domainWeights: { facilities: 0.5, technology: 0.5 } },
  { code: 'SAIS-10', parentCode: 'SAIS-S4', title: 'Enrolment management and advancement sufficient to sustain the school over the plan\u2019s horizon.', evidenceTags: ['enrollment_data', 'marketing'], domainKey: 'finance', domainWeights: { finance: 0.5, leadership: 0.5 }, signalKeys: ['enrollment_change_yoy', 'enrollment_vs_plan', 'pct_students_on_aid'] },

  { code: 'SAIS-11', parentCode: 'SAIS-S5', title: 'Evidence gathered on a schedule and used to change what the school does.', evidenceTags: ['survey', 'enrollment_data'], domainKey: 'continuous_improvement' },
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
  // ── The four below are KYRO CONDENSED SUMMARIES, not transcriptions. See the
  //    provenance note above their standards; the version string carries the same
  //    warning onto every screen a school reads them on.
  {
    code: 'fcis_2023',
    accreditor: 'FCIS',
    name: 'Florida Council of Independent Schools Accreditation Standards',
    version: '2023 (KYRO condensed)',
    description:
      'A condensed summary of the FCIS accreditation standards, written by KYRO. Codes and wording are ours, not the accreditor\u2019s \u2014 check against your current FCIS protocol.',
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
    name: 'ACSI REACH Accreditation Standards',
    version: '2023 (KYRO condensed)',
    description:
      'A condensed summary of the ACSI REACH standards, written by KYRO. Codes and wording are ours, not the accreditor\u2019s \u2014 check against your current ACSI protocol.',
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
    name: 'ACS WASC Focus on Learning Criteria',
    version: '2023 (KYRO condensed)',
    description:
      'A condensed summary of the ACS WASC Focus on Learning criteria, written by KYRO. Codes and wording are ours, not the accreditor\u2019s \u2014 check against your current WASC protocol.',
    rubricLabels: ['Little Evidence', 'Some Evidence', 'Consistent Evidence', 'Highly Effective'],
    statusBands: [],
    indexMin: null,
    indexMax: null,
    defaultTarget: null,
    standards: WASC_STANDARDS,
  },
  {
    code: 'sais_2023',
    accreditor: 'SAIS',
    name: 'Southern Association of Independent Schools Accreditation Standards',
    version: '2023 (KYRO condensed)',
    description:
      'A condensed summary of the SAIS accreditation standards, written by KYRO. Codes and wording are ours, not the accreditor\u2019s \u2014 check against your current SAIS protocol.',
    rubricLabels: ['Not Evident', 'Emerging', 'Meets Standard', 'Exceeds Standard'],
    statusBands: [],
    indexMin: null,
    indexMax: null,
    defaultTarget: null,
    standards: SAIS_STANDARDS,
  },
]

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
    version: '2023 Manual',
    description:
      'The 18 standards of the FCIS Manual for Evaluation and Accreditation (2023 revised). Standard titles and numbering are the accreditor\u2019s; indicators are not modelled \u2014 score at the standard level. Standards 8 and 13\u201318 apply only to schools running those programs.',
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
    version: 'REACH 2019',
    description:
      'The 8 standards of the ACSI REACH 2019 Edition Standards Manual. Standard titles and numbering are the accreditor\u2019s; indicators are not modelled \u2014 score at the standard level.',
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
    version: 'Focus on Learning',
    description:
      'The five Focus on Learning categories (A\u2013E) used by ACS WASC. Category letters and titles are the accreditor\u2019s; criteria and indicators are not modelled \u2014 score at the category level.',
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
    version: '2022 Standards',
    description:
      'The 6 standards of the SAIS 2022 Accreditation Standards and Indicators. Standard titles and numbering are the accreditor\u2019s; indicators are not modelled \u2014 score at the standard level. Standard 6 applies only to schools offering virtual learning.',
    rubricLabels: ['Not Evident', 'Emerging', 'Meets Standard', 'Exceeds Standard'],
    statusBands: [],
    indexMin: null,
    indexMax: null,
    defaultTarget: null,
    standards: SAIS_STANDARDS,
  },
]

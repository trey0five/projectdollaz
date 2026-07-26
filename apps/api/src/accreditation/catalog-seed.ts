import type { EvidenceTag } from '@finrep/compliance'

// ─────────────────────────────────────────────────────────────────────────────
// Accreditation Phase 3 — the FRAMEWORK CATALOG seed (typed const data ONLY; the
// idempotent boot-time upsert lives in AccreditationCatalogService). Verified
// against the primary sources: the official Cognia Performance Standards &
// Rubrics PDF (2022 framework incl. the Oct-2025 standard 31), the MSA-CESS 2022
// Standards for Accreditation, and the NSBECS (Catholic) 2012 standards.
// evidenceTags use the CLOSED @finrep/compliance vocabulary and drive the
// deterministic suggestion matcher. orderIndex = position in the arrays.
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
  // Domain parents (Key Characteristics + the Assurances group).
  { code: 'COG-KC1', title: 'Culture of Learning' },
  { code: 'COG-KC2', title: 'Leadership for Learning' },
  { code: 'COG-KC3', title: 'Engagement of Learning' },
  { code: 'COG-KC4', title: 'Growth in Learning' },
  { code: 'COG-ASR', title: 'Assurances', isAssurance: true },

  // Culture of Learning (1–6)
  { code: 'COG-1', parentCode: 'COG-KC1', title: 'Leaders cultivate and sustain a culture of respect, fairness, equity, and inclusion, free from bias.' },
  { code: 'COG-2', parentCode: 'COG-KC1', title: "Learners' well-being is at the heart of the institution's guiding principles (mission, purpose, beliefs).", evidenceTags: ['survey'] },
  { code: 'COG-3', parentCode: 'COG-KC1', title: "Leaders actively engage stakeholders to support priorities promoting learners' academic growth and well-being.", evidenceTags: ['survey'] },
  { code: 'COG-4', parentCode: 'COG-KC1', title: 'Learners benefit from a formal structure fostering positive relationships with peers and adults.', evidenceTags: ['survey'] },
  { code: 'COG-5', parentCode: 'COG-KC1', title: 'Professional staff members embrace effective collegiality and collaboration in support of learners.' },
  { code: 'COG-6', parentCode: 'COG-KC1', title: 'Professional staff members receive the support they need to strengthen professional practice.', evidenceTags: ['staff_credentials'] },

  // Leadership for Learning (7–15)
  { code: 'COG-7', parentCode: 'COG-KC2', title: "Leaders guide professional staff in a continuous improvement process focused on learners' experiences and needs.", evidenceTags: ['strategic_plan'] },
  { code: 'COG-8', parentCode: 'COG-KC2', title: 'The governing authority demonstrates commitment to learners by collaborating with leaders to uphold priorities and drive continuous improvement.', evidenceTags: ['governance', 'board_minutes', 'policy_manual'] },
  { code: 'COG-9', parentCode: 'COG-KC2', title: 'Leaders cultivate effective individual and collective leadership among stakeholders.', evidenceTags: ['governance'] },
  { code: 'COG-10', parentCode: 'COG-KC2', title: 'Leaders demonstrate expertise in recruiting, supervising, and evaluating professional staff to optimize learning.', evidenceTags: ['staff_credentials'] },
  { code: 'COG-11', parentCode: 'COG-KC2', title: 'Leaders create and maintain institutional structures and processes supporting learners and staff in stable and changing environments.', evidenceTags: ['policy_manual'] },
  { code: 'COG-12', parentCode: 'COG-KC2', title: 'Professional staff implement curriculum and instruction aligned for relevancy, inclusion, and effectiveness.' },
  { code: 'COG-13', parentCode: 'COG-KC2', title: "Qualified personnel instruct and assist learners and each other in support of the institution's mission, purpose, and beliefs.", evidenceTags: ['staff_credentials'] },
  { code: 'COG-14', parentCode: 'COG-KC2', title: 'Curriculum and instruction are augmented by reliable information resources and materials that advance learning.', evidenceTags: ['fiscal_resources'] },
  { code: 'COG-15', parentCode: 'COG-KC2', title: "Learners' needs drive the equitable allocation and management of human, material, digital, and fiscal resources.", evidenceTags: ['fiscal_resources', 'budget', 'financial_audit'] },

  // Engagement of Learning (16–23)
  { code: 'COG-16', parentCode: 'COG-KC3', title: 'Learners experience curriculum and instruction that emphasize the value of diverse cultures, backgrounds, and abilities.' },
  { code: 'COG-17', parentCode: 'COG-KC3', title: 'Learners have equitable opportunities to realize their learning potential.', evidenceTags: ['enrollment_data'] },
  { code: 'COG-18', parentCode: 'COG-KC3', title: 'Learners are immersed in an environment fostering lifelong skills (creativity, curiosity, risk taking, collaboration, design thinking).' },
  { code: 'COG-19', parentCode: 'COG-KC3', title: 'Learners are immersed in an environment that promotes and respects student voice and responsibility for learning.', evidenceTags: ['survey'] },
  { code: 'COG-20', parentCode: 'COG-KC3', title: 'Learners engage in experiences that promote and develop self-confidence and love of learning.', evidenceTags: ['survey'] },
  { code: 'COG-21', parentCode: 'COG-KC3', title: 'Instruction is characterized by high expectations and learner-centered practices.' },
  { code: 'COG-22', parentCode: 'COG-KC3', title: "Instruction is monitored and adjusted to advance and deepen individual learners' knowledge and understanding of the curriculum." },
  { code: 'COG-23', parentCode: 'COG-KC3', title: "Professional staff integrate digital resources that deepen learners' engagement with instruction and stimulate curiosity." },

  // Growth in Learning (24–31; 31 is the Oct-2025 addition)
  { code: 'COG-24', parentCode: 'COG-KC4', title: "Leaders use data and input from a variety of sources to make decisions for learners' and staff members' growth and well-being.", evidenceTags: ['enrollment_data', 'survey'] },
  { code: 'COG-25', parentCode: 'COG-KC4', title: 'Leaders promote action research by professional staff to improve their practice and advance learning.' },
  { code: 'COG-26', parentCode: 'COG-KC4', title: 'Leaders regularly evaluate instructional programs and organizational conditions to improve instruction and advance learning.', evidenceTags: ['strategic_plan'] },
  { code: 'COG-27', parentCode: 'COG-KC4', title: "Learners' diverse academic and non-academic needs are identified and effectively addressed through appropriate interventions." },
  { code: 'COG-28', parentCode: 'COG-KC4', title: 'With support, learners pursue individual goals including academic and non-academic skills important for their futures and careers.' },
  { code: 'COG-29', parentCode: 'COG-KC4', title: "Understanding learners' needs and interests drives the design, delivery, and evaluation of professional learning.", evidenceTags: ['staff_credentials'] },
  { code: 'COG-30', parentCode: 'COG-KC4', title: "Learners' progress is measured through a balanced system including assessment both for learning and of learning.", evidenceTags: ['enrollment_data'] },
  { code: 'COG-31', parentCode: 'COG-KC4', title: 'The institution demonstrates measurable growth in student learning over time.', description: '2025 addition to the Growth in Learning key characteristic.', evidenceTags: ['enrollment_data'] },

  // Assurances (binary, evidence-backed gates — excluded from rubric/index math)
  { code: 'COG-A1', parentCode: 'COG-ASR', title: 'Governing board maintains written policies and receives board training.', isAssurance: true, evidenceTags: ['policy_manual', 'governance', 'board_minutes'] },
  { code: 'COG-A2', parentCode: 'COG-ASR', title: 'Annual external financial audit is completed.', isAssurance: true, evidenceTags: ['financial_audit'] },
  { code: 'COG-A3', parentCode: 'COG-ASR', title: 'Safety and crisis plans are maintained and reviewed annually.', isAssurance: true, evidenceTags: ['safety_plan'] },
  { code: 'COG-A4', parentCode: 'COG-ASR', title: 'Institution complies with applicable legal requirements.', isAssurance: true, evidenceTags: ['policy_manual'] },
  { code: 'COG-A5', parentCode: 'COG-ASR', title: 'Marketing and communications are truthful and ethical.', isAssurance: true, evidenceTags: ['marketing'] },
  { code: 'COG-A6', parentCode: 'COG-ASR', title: 'Required Cognia training is completed by staff/leadership.', isAssurance: true, evidenceTags: ['staff_credentials'] },
]

// ── MSA-CESS (2022): 5 root-level LEAF standards (no domain parents) ─────────
const MSA_STANDARDS: CatalogStandardSeed[] = [
  { code: 'MSA-1', title: 'Foundations (mission, vision, core values, strategic planning).', evidenceTags: ['strategic_plan'] },
  { code: 'MSA-2', title: 'Governance and Organization.', evidenceTags: ['governance', 'board_minutes', 'policy_manual'] },
  { code: 'MSA-3', title: 'Student Well-Being.', evidenceTags: ['safety_plan', 'survey'] },
  { code: 'MSA-4', title: 'Resources (human, financial, physical).', evidenceTags: ['budget', 'financial_audit', 'fiscal_resources', 'staff_credentials'] },
  { code: 'MSA-5', title: 'Teaching and Learning.', evidenceTags: ['enrollment_data'] },
]

// ── NSBECS (Catholic, 2012): 4 domain parents + 13 leaves ────────────────────
const NSBECS_STANDARDS: CatalogStandardSeed[] = [
  { code: 'NSBECS-D1', title: 'Mission & Catholic Identity' },
  { code: 'NSBECS-D2', title: 'Governance & Leadership' },
  { code: 'NSBECS-D3', title: 'Academic Excellence' },
  { code: 'NSBECS-D4', title: 'Operational Vitality' },

  { code: 'NSBECS-1', parentCode: 'NSBECS-D1', title: 'Clearly communicated mission embracing Catholic identity, faith formation, academic excellence, and service.', evidenceTags: ['strategic_plan'] },
  { code: 'NSBECS-2', parentCode: 'NSBECS-D1', title: 'Rigorous religious studies/catechesis within a curriculum integrating faith, culture, and life.' },
  { code: 'NSBECS-3', parentCode: 'NSBECS-D1', title: 'Opportunities beyond the classroom for student faith formation, prayer, and service.' },
  { code: 'NSBECS-4', parentCode: 'NSBECS-D1', title: 'Opportunities for adult faith formation and action in service of social justice.' },
  { code: 'NSBECS-5', parentCode: 'NSBECS-D2', title: 'Governing body exercises responsible decision-making in fidelity to mission, academic excellence, and operational vitality.', evidenceTags: ['governance', 'board_minutes', 'policy_manual'] },
  { code: 'NSBECS-6', parentCode: 'NSBECS-D2', title: 'Qualified leader/leadership team empowered to realize and implement mission and vision.', evidenceTags: ['staff_credentials'] },
  { code: 'NSBECS-7', parentCode: 'NSBECS-D3', title: 'Clearly articulated, rigorous curriculum aligned with standards and Gospel values, implemented through effective instruction.' },
  { code: 'NSBECS-8', parentCode: 'NSBECS-D3', title: 'School-wide assessment practices documenting student learning and informing curriculum/instruction improvement.', evidenceTags: ['enrollment_data'] },
  { code: 'NSBECS-9', parentCode: 'NSBECS-D3', title: 'Programs and services aligned with mission enriching the academic program and supporting student/family life.', evidenceTags: ['survey'] },
  { code: 'NSBECS-10', parentCode: 'NSBECS-D4', title: 'Feasible 3–5 year financial plan with current and projected budgets, emphasizing stewardship.', evidenceTags: ['budget', 'strategic_plan', 'financial_audit'] },
  { code: 'NSBECS-11', parentCode: 'NSBECS-D4', title: 'Published human-resource/personnel policies affecting all staff.', evidenceTags: ['staff_credentials', 'policy_manual'] },
  { code: 'NSBECS-12', parentCode: 'NSBECS-D4', title: 'Facilities, equipment, and technology management plan supporting the educational mission.', evidenceTags: ['safety_plan'] },
  { code: 'NSBECS-13', parentCode: 'NSBECS-D4', title: 'Comprehensive institutional-advancement plan (communications, enrollment management, development).', evidenceTags: ['marketing', 'enrollment_data'] },
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

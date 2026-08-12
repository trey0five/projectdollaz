// ─────────────────────────────────────────────────────────────────────────────
// @finrep/db/academics — the ACADEMICS vocabularies, in one zero-dependency
// place so the API DTOs, the parsers and the web all validate against the same
// strings. Same shape and same reason as modules.ts: no Prisma import, no
// runtime deps, so any layer can pull it without dragging the client along.
//
// House convention (see the schema's TEXT + @IsIn columns): these are NOT
// Postgres enums. A new test type or lesson-plan status is a one-line change
// here plus a DTO that already reads from these arrays — never a migration.
// ─────────────────────────────────────────────────────────────────────────────

/** Standardized tests we ingest. `act`/`sat` are the scored exams the dashboards
 *  rank on; the practice/pre- tests are kept so a school can chart growth
 *  (PreACT→ACT, PSAT→SAT) once it has two years of both. */
export const TEST_TYPE_KEYS = [
  'act',
  'preact',
  'sat',
  'psat_nmsqt',
  'psat_10',
  'psat_89',
  // Norm-referenced tests — the elementary/middle side of the house. TerraNova is
  // the one this was built against; the others share its shape (a national
  // percentile per subject, plus an objective summary underneath).
  'terranova',
  'iowa',
  'map',
  'star',
  'state_assessment',
] as const
export type TestTypeKey = (typeof TEST_TYPE_KEYS)[number]

export const TEST_TYPE_LABELS: Record<TestTypeKey, string> = {
  act: 'ACT',
  preact: 'PreACT',
  sat: 'SAT',
  psat_nmsqt: 'PSAT/NMSQT',
  psat_10: 'PSAT 10',
  psat_89: 'PSAT 8/9',
  terranova: 'TerraNova',
  iowa: 'Iowa Assessments',
  map: 'NWEA MAP',
  star: 'STAR',
  state_assessment: 'State Assessment',
}

/** Which score family a test belongs to — decides the subject vocabulary, the
 *  score type, and whether college-readiness benchmarks even apply. 'nrt' =
 *  norm-referenced (percentile-scored, no benchmark table, has objectives). */
export type TestFamily = 'act' | 'sat' | 'nrt'

export const TEST_FAMILY: Record<TestTypeKey, TestFamily> = {
  act: 'act',
  preact: 'act',
  sat: 'sat',
  psat_nmsqt: 'sat',
  psat_10: 'sat',
  psat_89: 'sat',
  terranova: 'nrt',
  iowa: 'nrt',
  map: 'nrt',
  star: 'nrt',
  state_assessment: 'nrt',
}

/** Which grade band a test belongs to — drives WHICH assessments a school is
 *  even offered. A K-8 school should never be asked for ACT scores, and a high
 *  school shouldn't be nagged about TerraNova. */
export const TEST_BAND: Record<TestTypeKey, 'upper' | 'lower' | 'both'> = {
  act: 'upper',
  preact: 'upper',
  sat: 'upper',
  psat_nmsqt: 'upper',
  psat_10: 'upper',
  psat_89: 'both', // PSAT 8/9 straddles middle and high
  terranova: 'lower',
  iowa: 'lower',
  map: 'both',
  star: 'both',
  state_assessment: 'both',
}

export const ACT_SECTION_KEYS = ['english', 'math', 'reading', 'science'] as const
export const SAT_SECTION_KEYS = ['erw', 'math'] as const
/** Norm-referenced subject vocabulary (TerraNova's tested areas). */
export const NRT_SUBJECT_KEYS = ['reading', 'language', 'math', 'science', 'socialStudies'] as const
export type ActSectionKey = (typeof ACT_SECTION_KEYS)[number]
export type SatSectionKey = (typeof SAT_SECTION_KEYS)[number]
export type NrtSubjectKey = (typeof NRT_SUBJECT_KEYS)[number]

/** The subject list for a family — one lookup so every surface asks the same
 *  question the same way. */
export const SUBJECTS_FOR_FAMILY: Record<TestFamily, readonly string[]> = {
  act: ACT_SECTION_KEYS,
  sat: SAT_SECTION_KEYS,
  nrt: NRT_SUBJECT_KEYS,
}

/** How the numbers of a family are expressed. */
export const SCORE_TYPE_FOR_FAMILY: Record<TestFamily, ScoreTypeKey> = {
  act: 'scale',
  sat: 'scale',
  nrt: 'percentile',
}

export const SCORE_TYPE_KEYS = ['scale', 'percentile', 'nce'] as const
export type ScoreTypeKey = (typeof SCORE_TYPE_KEYS)[number]

export const SCORE_TYPE_LABELS: Record<ScoreTypeKey, string> = {
  scale: 'Scale score',
  percentile: 'National percentile',
  nce: 'Normal curve equivalent',
}

/** Achievement bands for distribution charts — quartiles of the national
 *  percentile, which is how norm-referenced results are read in practice. */
export const ACHIEVEMENT_BAND_KEYS = ['q1', 'q2', 'q3', 'q4'] as const
export type AchievementBandKey = (typeof ACHIEVEMENT_BAND_KEYS)[number]

export const ACHIEVEMENT_BAND_LABELS: Record<AchievementBandKey, string> = {
  q1: 'Bottom quarter (1–25)',
  q2: 'Lower middle (26–50)',
  q3: 'Upper middle (51–75)',
  q4: 'Top quarter (76–99)',
}

/** Objective mastery bands — the publisher's own three-way split. */
export const MASTERY_BAND_KEYS = ['mastery', 'partial', 'nonMastery'] as const
export type MasteryBandKey = (typeof MASTERY_BAND_KEYS)[number]

export const MASTERY_BAND_LABELS: Record<MasteryBandKey, string> = {
  mastery: 'Mastery',
  partial: 'Partial mastery',
  nonMastery: 'Non-mastery',
}

export const SECTION_LABELS: Record<string, string> = {
  english: 'English',
  math: 'Math',
  reading: 'Reading',
  science: 'Science',
  erw: 'Reading & Writing',
  language: 'Language',
  socialStudies: 'Social Studies',
}

/** Lesson-plan lifecycle. Deliberately short: a register a teacher keeps current
 *  beats a workflow nobody finishes. */
export const LESSON_PLAN_STATUS_KEYS = ['draft', 'planned', 'delivered', 'reviewed'] as const
export type LessonPlanStatusKey = (typeof LESSON_PLAN_STATUS_KEYS)[number]

export const LESSON_PLAN_STATUS_LABELS: Record<LessonPlanStatusKey, string> = {
  draft: 'Draft',
  planned: 'Planned',
  delivered: 'Delivered',
  reviewed: 'Reviewed',
}

/** How a score row found its student — or didn't. An `unmatched` row is a
 *  first-class citizen: it still counts toward the school aggregate, because a
 *  school that uploaded scores without a roster still deserves its dashboard. */
export const ASSESSMENT_MATCH_STATUS_KEYS = ['auto', 'manual', 'unmatched'] as const
export type AssessmentMatchStatusKey = (typeof ASSESSMENT_MATCH_STATUS_KEYS)[number]

/** Whether an aggregate row was ingested as-is (a school×year averages file) or
 *  computed from student rows. Both can coexist for the same school-year: the
 *  dashboard prefers `derived`, which carries the tester counts that make an
 *  honest diocesan average possible. */
export const AGGREGATE_DERIVATION_KEYS = ['ingested', 'derived'] as const
export type AggregateDerivationKey = (typeof AGGREGATE_DERIVATION_KEYS)[number]

/** Ingest provenance. `manual` is a hand-typed row from the record wizard. */
export const ACADEMIC_SOURCE_KEYS = ['upload', 'api', 'manual'] as const
export type AcademicSourceKey = (typeof ACADEMIC_SOURCE_KEYS)[number]

export const ASSESSMENT_IMPORT_SCOPE_KEYS = ['student', 'school_aggregate'] as const
export type AssessmentImportScopeKey = (typeof ASSESSMENT_IMPORT_SCOPE_KEYS)[number]

export const isTestTypeKey = (v: unknown): v is TestTypeKey =>
  typeof v === 'string' && (TEST_TYPE_KEYS as readonly string[]).includes(v)

export const isLessonPlanStatusKey = (v: unknown): v is LessonPlanStatusKey =>
  typeof v === 'string' && (LESSON_PLAN_STATUS_KEYS as readonly string[]).includes(v)

// ── School level: which assessments a school should even be asked for ─────────
//
// DERIVED, never stored twice: School already carries `schoolType` + `gradeLow`/
// `gradeHigh` for peer benchmarking, so academics reads those rather than adding
// a fourth field that could disagree with them.

export const SCHOOL_LEVEL_KEYS = ['elementary', 'middle', 'high', 'hybrid', 'unknown'] as const
export type SchoolLevelKey = (typeof SCHOOL_LEVEL_KEYS)[number]

export const SCHOOL_LEVEL_LABELS: Record<SchoolLevelKey, string> = {
  elementary: 'Elementary',
  middle: 'Middle',
  high: 'High school',
  hybrid: 'Combined (K–12)',
  unknown: 'Level not set',
}

/** Numeric rank of a GradeKey (PK3/PK4/K/1..12) so spans can be compared. */
export function gradeRank(grade: string | null | undefined): number | null {
  if (!grade) return null
  const g = String(grade).trim().toUpperCase()
  if (g === 'PK3') return -2
  if (g === 'PK4' || g === 'PK') return -1
  if (g === 'K') return 0
  const n = Number.parseInt(g, 10)
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null
}

/**
 * What KIND of school this is, from the peer profile it already has. The grade
 * span wins when present (it is a fact); schoolType is the fallback (it is a
 * label someone typed).
 */
export function schoolLevelFrom(profile: {
  schoolType?: string | null
  gradeLow?: string | null
  gradeHigh?: string | null
}): SchoolLevelKey {
  const lo = gradeRank(profile.gradeLow)
  const hi = gradeRank(profile.gradeHigh)
  if (lo !== null && hi !== null && hi >= lo) {
    const hasUpper = hi >= 9
    const hasLower = lo <= 5
    const hasMiddle = lo <= 8 && hi >= 6
    if (hasUpper && (hasLower || lo <= 8)) return 'hybrid'
    if (hasUpper) return 'high'
    if (hasMiddle && !hasLower) return 'middle'
    return 'elementary'
  }
  const t = (profile.schoolType ?? '').trim().toLowerCase()
  if (!t) return 'unknown'
  if (t === 'high') return 'high'
  if (t === 'middle') return 'middle'
  if (t === 'elementary') return 'elementary'
  if (t.includes('12')) return 'hybrid' // K-12, PK-12
  if (t === 'k-8') return 'elementary'
  return 'unknown'
}

/**
 * Which test types to OFFER a school. An unknown level offers everything rather
 * than nothing — a school that hasn't filled in its profile should still be able
 * to upload its scores.
 */
export function testTypesForLevel(level: SchoolLevelKey): TestTypeKey[] {
  const bands: Record<SchoolLevelKey, Array<'upper' | 'lower' | 'both'>> = {
    high: ['upper', 'both'],
    middle: ['lower', 'both'],
    elementary: ['lower', 'both'],
    hybrid: ['upper', 'lower', 'both'],
    unknown: ['upper', 'lower', 'both'],
  }
  const allowed = bands[level]
  return TEST_TYPE_KEYS.filter((k) => allowed.includes(TEST_BAND[k]))
}

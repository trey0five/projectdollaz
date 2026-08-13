import { describe, it, expect } from 'vitest'
import { parseAssessmentCsv, subjectFromHeader, TOTAL_KEY } from './assessment-file.parser.js'
import { parseGradebookCsv } from './gradebook-file.parser.js'

const enc = (s: string): Buffer => Buffer.from(s, 'utf-8')

/**
 * THE HEADER-COLLISION FAMILY.
 *
 * Both parsers match a header by leading or trailing word, which means a broad
 * vocabulary swallows a narrow one whenever it gets to look first. Five separate
 * bugs in this family reached the product, each one silently writing a real
 * number into the wrong column:
 *
 *   "Evidence-Based Reading and Writing" -> reading  (emptied SAT attainment)
 *   "Grade Level"                        -> the MARK (grade levels stored as marks)
 *   "Total Tested"                       -> the composite (headcount as a score)
 *   "Reading NPR"                        -> the composite (subject as a score)
 *   "Social Science"                     -> science (overwrote the real science)
 *
 * The rule that closes all five is one rule: claim columns MOST SPECIFIC FIRST,
 * one role per column, and let the vaguest field (the composite, the mark) take
 * whatever is left. These cases pin it, because the next publisher spelling will
 * be a sixth instance of exactly the same mistake.
 */
describe('header collisions — the specific must beat the general', () => {
  it('"Grade Level" is a grade level, and the mark comes from the mark column', () => {
    // Six letter grades that average 86.3; the grade LEVELS average 10.8. The
    // shipped parser stored 10.8 and the summary card reported it as fact.
    const csv = [
      'Gradebook Export — Spring Term',
      '',
      'First Name,Last Name,Grade Level,Course,Term,Letter Grade,School Year',
      'Maria,Martinez,11,Algebra II,Q3,A-,2026',
      'Aiden,Kelly,12,AP Literature,Q3,B+,2026',
      'Ryan,Adams,9,Biology,Q3,B,2026',
    ].join('\n')
    const parsed = parseGradebookCsv(enc(csv), {})
    expect(parsed.rows.map((r) => r.gradeLevel)).toEqual(['11', '12', '9'])
    expect(parsed.rows.map((r) => r.letterGrade)).toEqual(['A-', 'B+', 'B'])
    for (const r of parsed.rows) expect(r.numericGrade).toBeGreaterThan(60)
  })

  it('an explicit "Letter Grade" beats a bare "Grade" when a file has both', () => {
    const csv = [
      'First Name,Last Name,Grade,Course,Term,Letter Grade',
      'Maria,Martinez,11,Algebra II,Q3,A',
    ].join('\n')
    const parsed = parseGradebookCsv(enc(csv), { schoolYear: 2026 })
    expect(parsed.rows[0].letterGrade).toBe('A')
    expect(parsed.rows[0].numericGrade).toBeGreaterThan(90)
  })

  it('"Total Tested" is a headcount, not the school composite', () => {
    const csv = [
      'School,Grade,Total Tested,Total Battery',
      'St. Mary,5,42,68',
    ].join('\n')
    const parsed = parseAssessmentCsv(enc(csv), { defaultYear: 2026, testType: 'terranova' })
    const row = parsed.aggregates[0]
    expect(row.testedCount).toBe(42)
    // 68 is the score. 42 was being published as the score.
    expect(row.scores[TOTAL_KEY]).toBe(68)
    expect(Object.values(row.scores)).not.toContain(42)
  })

  it('"Reading NPR" is a subject, and the real Total Battery is the composite', () => {
    const csv = [
      'School,Grade,Reading NPR,Math NPR,Total Battery NPR,Tested',
      'St. Mary,5,61,57,59,42',
    ].join('\n')
    const parsed = parseAssessmentCsv(enc(csv), { defaultYear: 2026, testType: 'terranova' })
    const row = parsed.aggregates[0]
    expect(row.scores.reading).toBe(61)
    expect(row.scores.math).toBe(57)
    // The composite is 59 — not 61, the first subject that happened to end in NPR.
    expect(row.scores[TOTAL_KEY]).toBe(59)
  })

  it('"Social Science" is social studies, and does not eat the science column', () => {
    expect(subjectFromHeader('Social Science')).toBe('socialStudies')
    expect(subjectFromHeader('Science')).toBe('science')
    const csv = ['School,Grade,Science,Social Science,Tested', 'St. Mary,5,60,72,42'].join('\n')
    const row = parseAssessmentCsv(enc(csv), { defaultYear: 2026, testType: 'terranova' }).aggregates[0]
    expect(row.scores.science).toBe(60)
    expect(row.scores.socialStudies).toBe(72)
  })

  it('ERW is not reading — the SAT section set stays complete', () => {
    expect(subjectFromHeader('Evidence-Based Reading and Writing')).toBe('erw')
    expect(subjectFromHeader('EBRW')).toBe('erw')
    expect(subjectFromHeader('Reading')).toBe('reading')
  })

  it('two columns reading as ONE subject keep the first and SAY SO', () => {
    // Silently keeping the last is how a scale score ends up stored as a
    // percentile under the same key.
    const csv = ['School,Grade,Reading,Reading NPR,Tested', 'St. Mary,5,610,61,42'].join('\n')
    const parsed = parseAssessmentCsv(enc(csv), { defaultYear: 2026, testType: 'terranova' })
    expect(parsed.aggregates[0].scores.reading).toBe(610)
    expect(parsed.warnings.join(' ')).toMatch(/both read as reading/i)
  })

  it('no column that plainly is not a student flips a summary to student scope', () => {
    // Naming the six roles by hand left every one of these still able to do it —
    // each ends in a word ID_HEADERS or NAME_HEADERS matches.
    for (const decoy of ['District ID', 'Norm Group Name', 'Test Name', 'Form ID', 'Teacher Name']) {
      const csv = [`School,${decoy},Grade,Total Battery,Tested`, `St. Mary,X,5,68,42`].join('\n')
      const parsed = parseAssessmentCsv(enc(csv), { defaultYear: 2026, testType: 'terranova' })
      expect(parsed.scope, `"${decoy}" must not imply a student`).toBe('school_aggregate')
    }
  })

  it('"Student ID" does not take the role "Student Name" wanted', () => {
    const csv = ['Student ID,Student Name,Grade,Composite', 'S1,"Nguyen, Amy",11,27'].join('\n')
    const parsed = parseAssessmentCsv(enc(csv), { defaultYear: 2026, testType: 'act' })
    expect(parsed.scope).toBe('student')
    expect(parsed.students[0].externalId).toBe('S1')
    expect(parsed.students[0].lastName).toBe('Nguyen')
  })

  it('a DECORATED school-year span still resolves to the spring year', () => {
    // One label, dressed five ways by five publishers, must be one year.
    for (const cell of ['2025-26', 'SY 2025-26', '2025-26 School Year', 'AY 2025/26', '2025 - 26']) {
      const csv = [`School,Grade,Year,Total Battery,Tested`, `St. Mary,5,${cell},68,42`].join('\n')
      const parsed = parseAssessmentCsv(enc(csv), { testType: 'terranova' })
      expect(parsed.aggregates[0].schoolYear, `"${cell}" should be the spring year`).toBe(2026)
    }
  })

  it('"Teacher Name" does not supply the STUDENT name', () => {
    // It satisfies NAME_HEADERS via endsWith(' name'), and coming first it filed
    // a whole class under the teacher — who then matched no roster student.
    const csv = [
      'Teacher Name,Student Name,Course,Term,Letter Grade,School Year',
      'Ms. Alvarez,"Nguyen, Amy",Algebra II,Q3,A,2026',
    ].join('\n')
    const parsed = parseGradebookCsv(enc(csv), {})
    expect(parsed.rows[0].lastName).toBe('Nguyen')
    expect(parsed.rows[0].teacherName).toBe('Ms. Alvarez')
  })

  it('a wide column that holds no marks is not a course', () => {
    // parseMark's letter fallback reads "B wing" as a B, so an export carrying
    // Homeroom or Notes turned each into a course full of free text.
    const csv = [
      'Student Name,Homeroom,Algebra II,Biology',
      '"Nguyen, Amy",B wing,A-,B+',
      '"Adams, Ryan",C wing,B,A',
      '"Kelly, Aiden",A wing,C+,B-',
    ].join('\n')
    const parsed = parseGradebookCsv(enc(csv), { schoolYear: 2026 })
    const courses = new Set(parsed.rows.map((r) => r.courseName))
    expect(courses.has('Algebra II')).toBe(true)
    expect(courses.has('Biology')).toBe(true)
    expect(courses.has('Homeroom'), 'a room is not a course').toBe(false)
  })

  it('the wide shape reads its own Term column instead of stamping one term', () => {
    const csv = [
      'Student Name,Term,Algebra II',
      '"Nguyen, Amy",Q1,A-',
      '"Nguyen, Amy",Q2,B+',
    ].join('\n')
    const parsed = parseGradebookCsv(enc(csv), { schoolYear: 2026 })
    expect(new Set(parsed.rows.map((r) => r.term))).toEqual(new Set(['Q1', 'Q2']))
  })

  it('"School Name"/"School ID" do not make a summary file look student-level', () => {
    const csv = ['School Name,School ID,Grade,Total Battery,Tested', 'St. Mary,SCH-1,5,68,42'].join('\n')
    const parsed = parseAssessmentCsv(enc(csv), { defaultYear: 2026, testType: 'terranova' })
    expect(parsed.scope).toBe('school_aggregate')
    expect(parsed.students).toHaveLength(0)
  })
})

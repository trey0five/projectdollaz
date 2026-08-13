import { describe, it, expect } from 'vitest'
import { parseAssessmentCsv, subjectFromHeader, toGrade, looksLikeObjectiveFile } from './assessment-file.parser.js'
import { parseGradebookCsv } from './gradebook-file.parser.js'

const enc = (s: string) => Buffer.from(s, 'utf-8')

describe('scratch', () => {
  it('subject collisions', () => {
    for (const h of ['Mathematics Computation','Math Computation','Language Mechanics','Social Science','Related Arts','Science Total','Reading Comprehension','Vocabulary','Spelling','Word Analysis','Total Battery','Composite']) {
      console.log(JSON.stringify(h), '->', subjectFromHeader(h))
    }
  })
  it('grades', () => {
    for (const g of ['PK','TK','Kindergarten','Gr 5','5th','K-8','Grade 13','Ungraded','all','']) console.log(JSON.stringify(g),'->',toGrade(g))
  })
  it('agg file with District ID column', () => {
    const csv = [
      'School Name,District ID,Grade,Students Tested,Total Battery',
      'St. Mary,D-100,5,42,63',
      'St. Joseph,D-100,5,38,58',
    ].join('\n')
    const r = parseAssessmentCsv(enc(csv), { testType: 'terranova' })
    console.log('scope', r.scope, 'students', r.students.length, 'aggs', r.aggregates.length)
    console.log(JSON.stringify(r.students, null, 1))
  })
  it('agg file with Test Name column', () => {
    const csv = ['School,Test Name,Grade,Tested,Total Battery','St. Mary,TerraNova 3,5,42,63'].join('\n')
    const r = parseAssessmentCsv(enc(csv), { testType: 'terranova' })
    console.log('scope', r.scope, r.students.length, r.aggregates.length)
  })
  it('year span variants', () => {
    for (const y of ['2025-26','SY 2025-26','2025-2026','2025/26','Spring 2026','2025-26 School Year']) {
      const csv = `School,Year,Grade,Tested,Total Battery\nSt. Mary,${y},5,42,63`
      const r = parseAssessmentCsv(enc(csv), { testType: 'terranova' })
      console.log(JSON.stringify(y), '->', r.years)
    }
  })
  it('gradebook wide with absences', () => {
    const csv = ['Student Name,Grade Level,Math,English,Days Absent,Tardies','Doe John,5,92,88,12,3'].join('\n')
    const r = parseGradebookCsv(enc(csv), { schoolYear: 2026, term: 'S1' })
    console.log(r.shape, JSON.stringify(r.rows.map(x=>[x.courseName,x.numericGrade,x.gradeLevel])), r.courses)
  })
  it('gradebook long teacher-first', () => {
    const csv = ['Teacher Name,Student Name,Course,Term,Letter Grade','Smith Ann,Doe John,Algebra I,S1,B+'].join('\n')
    const r = parseGradebookCsv(enc(csv), { schoolYear: 2026 })
    console.log(JSON.stringify(r.rows, null, 1))
  })
  it('objective misroute', () => {
    const grid = [['Student Name','Grade','Standard Score','Mastery Level'],['Doe John','5','620','Proficient']]
    console.log('looksLikeObjective', looksLikeObjectiveFile(grid))
  })
  it('act file letters', () => {
    const csv = ['Student Name,Grade,English,Math,Reading,Science,Composite','"Walsh, Ryan",11,24,26,22,23,24'].join('\n')
    const r = parseAssessmentCsv(enc(csv), {})
    console.log(r.testType, r.scope, JSON.stringify(r.students))
  })
})

import { describe, it, expect } from 'vitest'
import { parseAssessmentCsv, TOTAL_KEY } from './assessment-file.parser.js'

const enc = (s: string): Buffer => Buffer.from(s, 'utf-8')

describe('probe2', () => {
  it('one row per subject (long format)', () => {
    const csv = [
      'School,Grade,Subject,NPR,Tested',
      'St. Mary,5,Reading,61,42',
      'St. Mary,5,Mathematics,57,42',
      'St. Mary,5,Language,64,42',
    ].join('\n')
    const out = parseAssessmentCsv(enc(csv), { testType: 'terranova', defaultYear: 2026 })
    console.log('LONG PROBE scope=', out.scope, JSON.stringify(out.aggregates), out.warnings)
  })

  it('one row per subject, header "Content Area" + "Mean NPR"', () => {
    const csv = [
      'School Name,Grade,Content Area,Mean NPR,Students Tested',
      'St. Mary,5,Reading,61,42',
      'St. Mary,5,Math,57,42',
    ].join('\n')
    const out = parseAssessmentCsv(enc(csv), { testType: 'terranova', defaultYear: 2026 })
    console.log('LONG2 PROBE scope=', out.scope, JSON.stringify(out.aggregates), out.warnings)
  })

  it('duplicate identical school+grade rows', () => {
    const csv = [
      'School,Grade,Total Battery,Tested',
      'St. Mary,5,68,42',
      'St. Mary,5,71,40',
    ].join('\n')
    const out = parseAssessmentCsv(enc(csv), { testType: 'terranova', defaultYear: 2026 })
    console.log('DUP PROBE', JSON.stringify(out.aggregates), out.warnings)
  })

  it('student file with a Form ID column before Student ID', () => {
    const csv = [
      'Form ID,Last Name,First Name,Grade,Composite',
      'F-1,Nguyen,Amy,11,27',
      'F-1,Adams,Ryan,11,22',
    ].join('\n')
    const out = parseAssessmentCsv(enc(csv), { testType: 'act', defaultYear: 2026 })
    console.log('FORMID PROBE scope=', out.scope, JSON.stringify(out.students))
  })
})

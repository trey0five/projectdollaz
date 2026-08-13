import { describe, it } from 'vitest'
import { parseAssessmentCsv } from './assessment-file.parser.js'
const enc = (s: string) => Buffer.from(s, 'utf-8')
describe('scratch2', () => {
  it('grade equivalent steals grade', () => {
    const csv = ['Student ID,Student Name,Grade Equivalent,Grade Level,Reading NPR,Total Battery',
      '1001,"Walsh, Ryan",8.2,5,71,63'].join('\n')
    const r = parseAssessmentCsv(enc(csv), { testType: 'terranova' })
    console.log(JSON.stringify(r.students), r.warnings)
  })
  it('spring column', () => {
    const csv = ['Student Name,Grade,Fall 2025,Spring 2026','"Walsh, Ryan",5,210,222'].join('\n')
    try { const r = parseAssessmentCsv(enc(csv), { testType: 'map' }); console.log(JSON.stringify(r.students), r.years, r.warnings) }
    catch (e) { console.log('THREW', (e as Error).message) }
  })
  it('duplicate id column named N', () => {
    const csv = ['School,Grade,N,Total Battery','St Mary,5,42,63'].join('\n')
    const r = parseAssessmentCsv(enc(csv), { testType: 'terranova' })
    console.log(r.scope, JSON.stringify(r.aggregates))
  })
})

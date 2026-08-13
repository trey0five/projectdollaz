import { describe, it, expect } from 'vitest'
import {
  TOTAL_KEY,
  detectHeaderRow,
  guessTestType,
  parseAssessmentCsv,
  splitName,
  subjectFromHeader,
  subjectsSeen,
  toGrade,
} from './assessment-file.parser.js'

const enc = (s: string): Buffer => Buffer.from(s, 'utf-8')

describe('assessment parser — messy real files', () => {
  it('finds the header under a title row, a subtitle and a blank line', () => {
    // Exactly the shape the diocesan exports arrive in.
    const csv = [
      'Diocese of Sample — TerraNova Results',
      'Spring 2026 · National Percentile Rank',
      '',
      'School,Grade,Total Battery,Reading,Math',
      'All Souls,3,72,74,70',
      'Holy Cross,3,65,66,64',
    ].join('\n')
    const out = parseAssessmentCsv(enc(csv), { defaultYear: 2026 })
    expect(out.scope).toBe('school_aggregate')
    expect(out.aggregates).toHaveLength(2)
    expect(out.aggregates[0].schoolName).toBe('All Souls')
    expect(out.aggregates[0].scores[TOTAL_KEY]).toBe(72)
    expect(out.aggregates[0].scores.reading).toBe(74)
    expect(out.warnings.some((w) => w.includes('above the header'))).toBe(true)
  })

  it('ignores "Unnamed: N" columns a spreadsheet round-trip leaves behind', () => {
    const csv = ['School,Unnamed: 1,Grade,Unnamed: 3,Composite', 'All Souls,,5,,21.4'].join('\n')
    const out = parseAssessmentCsv(enc(csv), { defaultYear: 2026, testType: 'act' })
    expect(out.aggregates[0].scores[TOTAL_KEY]).toBe(21.4)
    expect(out.aggregates[0].gradeLevel).toBe('5')
  })

  it('reads "forthcoming" as absent — never as a zero', () => {
    const csv = ['School,Grade,Total Battery', 'All Souls,8,forthcoming', 'Holy Cross,8,70'].join('\n')
    const out = parseAssessmentCsv(enc(csv), { defaultYear: 2026 })
    // The forthcoming row carries no score at all rather than a fabricated 0.
    expect(out.aggregates).toHaveLength(1)
    expect(out.aggregates[0].schoolName).toBe('Holy Cross')
    expect(out.skipped).toBe(1)
  })

  it('detects the STUDENT shape from an identity column and keeps the name', () => {
    const csv = [
      'Student ID,Last Name,First Name,Grade,Composite,English,Math,Reading,Science',
      '1001,Nguyen,Amy,11,27,26,28,27,27',
    ].join('\n')
    const out = parseAssessmentCsv(enc(csv), { testType: 'act', defaultYear: 2026 })
    expect(out.scope).toBe('student')
    expect(out.students[0].externalId).toBe('1001')
    expect(out.students[0].lastName).toBe('Nguyen')
    expect(out.students[0].composite).toBe(27)
    expect(out.students[0].sectionScores.math).toBe(28)
  })

  it('splits a single "Last, First" name column', () => {
    const csv = ['Name,Grade,Total', '"Nguyen, Amy",11,1290'].join('\n')
    const out = parseAssessmentCsv(enc(csv), { testType: 'sat', defaultYear: 2026 })
    expect(out.students[0].lastName).toBe('Nguyen')
    expect(out.students[0].firstName).toBe('Amy')
  })

  it('accepts a school year written as a span and resolves it to the spring year', () => {
    const csv = ['School,Year,Grade,Total Battery', 'All Souls,2025-26,4,68'].join('\n')
    const out = parseAssessmentCsv(enc(csv))
    expect(out.aggregates[0].schoolYear).toBe(2026)
    expect(out.years).toEqual([2026])
  })

  it('normalizes grade spellings including kindergarten and "all"', () => {
    expect(toGrade('Grade 5')).toBe('5')
    expect(toGrade('05')).toBe('5')
    expect(toGrade('K')).toBe('K')
    expect(toGrade('Kindergarten')).toBe('K')
    expect(toGrade('PK4')).toBe('PK4')
    expect(toGrade('All')).toBe('all')
    expect(toGrade('')).toBeNull()
  })

  it('maps publisher subject spellings onto one vocabulary', () => {
    expect(subjectFromHeader('Language Arts')).toBe('reading')
    expect(subjectFromHeader('Mathematics')).toBe('math')
    expect(subjectFromHeader('Social Studies')).toBe('socialStudies')
    expect(subjectFromHeader('EBRW')).toBe('erw')
    expect(subjectFromHeader('Tested')).toBeNull()
  })

  it('carries tested and eligible counts when the file has them', () => {
    const csv = ['School,Grade,Total Battery,Tested,Enrolled', 'All Souls,3,72,28,30'].join('\n')
    const out = parseAssessmentCsv(enc(csv), { defaultYear: 2026 })
    expect(out.aggregates[0].testedCount).toBe(28)
    expect(out.aggregates[0].eligibleCount).toBe(30)
  })

  it('throws only when the file is structurally unusable', () => {
    expect(() => parseAssessmentCsv(enc('just,some,words\nmore,random,text'))).toThrow(/No score columns|No header row/)
    expect(() => parseAssessmentCsv(enc(''))).toThrow()
  })

  it('guesses the test type from the file vocabulary but the caller always wins', () => {
    expect(guessTestType(['School', 'Total Battery', 'NPR'])).toBe('terranova')
    expect(guessTestType(['Composite', 'English', 'Science'])).toBe('act')
    expect(guessTestType(['EBRW', 'Math'])).toBe('sat')
    const csv = ['School,Grade,Total Battery', 'All Souls,3,72'].join('\n')
    expect(parseAssessmentCsv(enc(csv), { testType: 'iowa' }).testType).toBe('iowa')
  })

  it('reports the subjects actually present, in family order', () => {
    const csv = ['School,Grade,Math,Reading,Total Battery', 'All Souls,3,70,74,72'].join('\n')
    const out = parseAssessmentCsv(enc(csv), { defaultYear: 2026 })
    expect(subjectsSeen(out)).toEqual(['reading', 'math'])
  })

  it('a row of numbers is data, never mistaken for the header', () => {
    const grid = [
      ['2026', '3', '72'],
      ['School', 'Grade', 'Total Battery'],
      ['All Souls', '3', '72'],
    ]
    expect(detectHeaderRow(grid)).toBe(1)
  })

  it('splitName handles both orders and a single token', () => {
    expect(splitName('Nguyen, Amy')).toEqual({ first: 'Amy', last: 'Nguyen' })
    expect(splitName('Amy Nguyen')).toEqual({ first: 'Amy', last: 'Nguyen' })
    expect(splitName('Cher')).toEqual({ first: null, last: 'Cher' })
  })
})

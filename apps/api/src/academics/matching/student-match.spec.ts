import { describe, it, expect } from 'vitest'
import { indexRoster, matchAll, matchStudent, normalizeName, type RosterStudent } from './student-match.js'

const roster: RosterStudent[] = [
  { id: 's1', firstName: 'Amelia', lastName: "O'Brien", grade: '5', externalId: '1001' },
  { id: 's2', firstName: 'Ryan', lastName: 'Walsh', grade: '5', externalId: null },
  { id: 's3', firstName: 'Ryan', lastName: 'Walsh', grade: '7', externalId: null },
  { id: 's4', firstName: 'José', lastName: 'Núñez', grade: '3', externalId: null },
]

describe('student matching', () => {
  const idx = indexRoster(roster)

  it('matches on the SIS id first — exact and unambiguous', () => {
    const d = matchStudent({ externalId: '1001', firstName: null, lastName: null, gradeLevel: null }, idx)
    expect(d).toEqual({ studentId: 's1', status: 'auto', rule: 'externalId', ambiguous: false })
  })

  it('matches on last + first + grade when there is no id', () => {
    const d = matchStudent({ externalId: null, firstName: 'Ryan', lastName: 'Walsh', gradeLevel: '5' }, idx)
    expect(d.studentId).toBe('s2')
    expect(d.rule).toBe('nameGrade')
  })

  it('REFUSES to guess between two same-name students in the same grade', () => {
    const twinRoster: RosterStudent[] = [
      { id: 'a', firstName: 'Ryan', lastName: 'Walsh', grade: '5', externalId: null },
      { id: 'b', firstName: 'Ryan', lastName: 'Walsh', grade: '5', externalId: null },
    ]
    const d = matchStudent(
      { externalId: null, firstName: 'Ryan', lastName: 'Walsh', gradeLevel: '5' },
      indexRoster(twinRoster),
    )
    // A wrong attachment misfiles one child's scores under another's name.
    expect(d.studentId).toBeNull()
    expect(d.status).toBe('unmatched')
    expect(d.ambiguous).toBe(true)
  })

  it('falls back to name alone when the file omits grade', () => {
    const d = matchStudent({ externalId: null, firstName: 'Amelia', lastName: "O'Brien", gradeLevel: null }, idx)
    expect(d.studentId).toBe('s1')
    expect(d.rule).toBe('name')
  })

  it('does not fall back to name alone when that name repeats across grades', () => {
    const d = matchStudent({ externalId: null, firstName: 'Ryan', lastName: 'Walsh', gradeLevel: null }, idx)
    expect(d.studentId).toBeNull()
    expect(d.ambiguous).toBe(true)
  })

  it('matches a nickname by first initial + grade', () => {
    const d = matchStudent({ externalId: null, firstName: 'Amy', lastName: "O'Brien", gradeLevel: '5' }, idx)
    expect(d.studentId).toBe('s1')
    expect(d.rule).toBe('initialGrade')
  })

  it('folds accents and punctuation so the same child matches either spelling', () => {
    expect(normalizeName("O'Brien")).toBe('obrien')
    expect(normalizeName('Núñez')).toBe('nunez')
    const d = matchStudent({ externalId: null, firstName: 'Jose', lastName: 'Nunez', gradeLevel: '3' }, idx)
    expect(d.studentId).toBe('s4')
  })

  it('reports an unmatched row rather than dropping it', () => {
    const d = matchStudent({ externalId: null, firstName: 'Nobody', lastName: 'Here', gradeLevel: '5' }, idx)
    expect(d).toEqual({ studentId: null, status: 'unmatched', rule: 'none', ambiguous: false })
  })

  it('summarises a whole file for the review step', () => {
    const { summary } = matchAll(
      [
        { externalId: '1001', firstName: null, lastName: null, gradeLevel: null },
        { externalId: null, firstName: 'Ryan', lastName: 'Walsh', gradeLevel: '7' },
        { externalId: null, firstName: 'Nobody', lastName: 'Here', gradeLevel: '5' },
        { externalId: null, firstName: 'Ryan', lastName: 'Walsh', gradeLevel: null },
      ],
      roster,
    )
    expect(summary.matched).toBe(2)
    expect(summary.unmatched).toBe(2)
    expect(summary.ambiguous).toBe(1)
    expect(summary.byRule.externalId).toBe(1)
  })

  it('an empty roster leaves every row unmatched but never throws', () => {
    const { summary } = matchAll([{ externalId: '1', firstName: 'A', lastName: 'B', gradeLevel: '5' }], [])
    expect(summary.matched).toBe(0)
    expect(summary.unmatched).toBe(1)
  })
})

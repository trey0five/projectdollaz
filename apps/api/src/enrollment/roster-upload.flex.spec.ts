// #45 — the one-step upload takes ANY student list. A file that isn't a
// OneRoster users.csv is turned into one (toOneRosterBytes) so the frozen
// aggregate parser and the per-student reader run on it unchanged.
import { describe, expect, it } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import { parseOneRosterCsv, parseOneRosterStudents } from '@finrep/ingestion/oneroster'
import { toOneRosterBytes } from './roster-upload.service.js'
import { wrapCsvAsZip } from './enrollment.service.js'

const buf = (s: string) => Buffer.from(s, 'utf8')

describe('toOneRosterBytes', () => {
  it('passes a real OneRoster users.csv through untouched', () => {
    const csv = buf('sourcedId,status,role,givenName,familyName,grades\nu1,active,student,Ann,Smith,09\n')
    expect(toOneRosterBytes(csv)).toBe(csv)
  })

  it('turns "Student Name / Gr / ID" under a title row into a users.csv the OneRoster parsers read', () => {
    const out = toOneRosterBytes(
      buf('St. Aurelia Academy\n\nStudent Name,Gr,Student ID,Status\n"Smith, Ann",9th,S-1,Active\nBo Diaz,Kindergarten,S-2,Withdrawn\nCy Fox,Grade 9,,\n'),
    )
    const zip = wrapCsvAsZip(out)
    const snap = parseOneRosterCsv(zip)
    expect(snap.totalEnrolled).toBe(2)
    expect(snap.byGrade).toEqual({ '9': 2 })
    expect(parseOneRosterStudents(zip).map((r) => [r.givenName, r.familyName, r.grade, r.withdrawn, r.sourcedId])).toEqual([
      ['Ann', 'Smith', '9', false, 'S-1'],
      ['Bo', 'Diaz', 'K', true, 'S-2'],
      ['Cy', 'Fox', '9', false, null],
    ])
  })

  it('refuses, in plain words, a sheet with no name or no grade column', () => {
    expect(() => toOneRosterBytes(buf('Homeroom,Grade\nLee,9\n'))).toThrow(BadRequestException)
    expect(() => toOneRosterBytes(buf('Homeroom,Grade\nLee,9\n'))).toThrow(/Couldn’t find a student name column/)
    expect(() => toOneRosterBytes(buf('Student,Homeroom\nAnn Smith,Lee\n'))).toThrow(/Couldn’t find a grade column/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// #44 / #45 — the shared table reader + column matcher, and the roster schema
// on top of it. Customer 2026-10-24: an Excel roster was refused because its
// headers weren't spelled the way the parser expected.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  readTable,
  mainSheet,
  matchColumns,
  rosterFromSheet,
  splitFullName,
  gradeKeyFromText,
  toOneRosterUsersCsv,
} from '../src/index.js'
import { parseOneRosterCsv, parseOneRosterStudents } from '../src/oneroster/index.js'

function xlsx(sheets: Record<string, unknown[][]>): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}
const csv = (s: string) => Buffer.from(s, 'utf8')

describe('readTable', () => {
  it('reads a CSV and finds the header under a title and a blank line', () => {
    const t = readTable(csv('St. Aurelia Academy\n\nStudent Name,Gr,Homeroom\n"Smith, Ann",9,Lee\n"Diaz, Bo",10,Ng\n'))
    const s = mainSheet(t)!
    expect(t.kind).toBe('csv')
    expect(s.headerRow).toBe(2)
    expect(s.header).toEqual(['Student Name', 'Gr', 'Homeroom'])
    expect(s.rows).toEqual([['Smith, Ann', '9', 'Lee'], ['Diaz, Bo', '10', 'Ng']])
  })

  it('reads an .xlsx (every sheet) and picks the biggest as the main one', () => {
    const t = readTable(xlsx({ Notes: [['Exported 10/24/2026']], Roster: [['First', 'Last', 'Grade'], ['Ann', 'Smith', 9], ['Bo', 'Diaz', 'K']] }))
    expect(t.kind).toBe('xlsx')
    expect(mainSheet(t)!.name).toBe('Roster')
    expect(mainSheet(t)!.rows).toEqual([['Ann', 'Smith', '9'], ['Bo', 'Diaz', 'K']])
  })

  it('handles tab- and semicolon-separated text and a BOM', () => {
    expect(mainSheet(readTable(csv('﻿First\tLast\tGrade\nAnn\tSmith\t9\n')))!.header).toEqual(['First', 'Last', 'Grade'])
    expect(mainSheet(readTable(csv('First;Last;Grade\nAnn;Smith;9\n')))!.rows).toEqual([['Ann', 'Smith', '9']])
  })

  it('throws on an empty file, returns no sheets for a table with no header', () => {
    expect(() => readTable(new Uint8Array())).toThrow(/empty/)
    expect(readTable(csv('\n\n')).sheets).toEqual([])
  })
})

describe('matchColumns', () => {
  const fields = [
    { key: 'lastName', label: 'Last name', synonyms: ['surname'] },
    { key: 'firstName', label: 'First name', synonyms: ['first'] },
    { key: 'grade', label: 'Grade', synonyms: ['gr'], required: true },
    { key: 'id', label: 'Student ID', synonyms: ['id'] },
  ]
  it('matches by meaning: case, spaces, underscores, containment, typos', () => {
    const { mapping, matches, missing, unmapped } = matchColumns(['Student_First', 'SURNAME', 'Grd.', 'Paid', 'Grade Level'], fields)
    expect(mapping).toEqual({ lastName: 1, firstName: 0, grade: 4 })
    expect(matches.find((m) => m.key === 'grade')?.how).toBe('contains') // "Grade Level" ⊃ "grade"
    expect(matches.find((m) => m.key === 'firstName')?.how).toBe('contains')
    expect(missing).toEqual([])
    expect(unmapped).toEqual([2, 3]) // "Paid" never becomes "id"
  })
  it('reports a required field with no column', () => {
    const r = matchColumns(['Name', 'Homeroom'], fields)
    expect(r.missing.map((f) => f.key)).toEqual(['grade'])
  })
})

describe('splitFullName / gradeKeyFromText', () => {
  it('splits "Last, First", "First Last", suffixes and single names', () => {
    expect(splitFullName('Smith, Ann Marie')).toEqual({ firstName: 'Ann Marie', lastName: 'Smith' })
    expect(splitFullName('Ann Marie Smith')).toEqual({ firstName: 'Ann Marie', lastName: 'Smith' })
    expect(splitFullName('John Smith Jr.')).toEqual({ firstName: 'John', lastName: 'Smith Jr.' })
    expect(splitFullName('Cher')).toEqual({ firstName: 'Cher', lastName: '' })
  })
  it('reads grades the way schools write them', () => {
    for (const [raw, key] of [
      ['9', '9'], ['09', '9'], ['9th', '9'], ['Grade 9', '9'], ['Gr. 12', '12'], ['G7', '7'], ['12th grade', '12'],
      ['K', 'K'], ['Kindergarten', 'K'], ['KG', 'K'], ['Pre-K 4', 'PK4'], ['PK3', 'PK3'], ['Preschool', 'PK3'],
      ['Freshman', '9'], ['Senior', '12'], ['TK', 'PK4'],
    ]) expect(gradeKeyFromText(raw!), raw).toBe(key)
    expect(gradeKeyFromText('Staff')).toBeNull()
    expect(gradeKeyFromText('13')).toBeNull()
  })
})

describe('rosterFromSheet', () => {
  it('reads a roster with "Student Name" + "Gr" (the customer shape), splitting names', () => {
    const t = readTable(csv('Student Name,Gr,Student ID,Email\n"Smith, Ann",9th,S-100,a@x.org\nBo Diaz,K,,\n'))
    const r = rosterFromSheet(mainSheet(t)!)
    expect(r.problem).toBeNull()
    expect(r.records.map((x) => [x.firstName, x.lastName, x.grade, x.externalId, x.row])).toEqual([
      ['Ann', 'Smith', '9th', 'S-100', 2],
      ['Bo', 'Diaz', 'K', '', 3],
    ])
    expect(r.columns.mapping).toMatchObject({ fullName: 0, grade: 1, externalId: 2, email: 3 })
  })
  it('says plainly what is missing, naming the columns it saw', () => {
    const noName = rosterFromSheet(mainSheet(readTable(csv('Homeroom,Grade\nLee,9\n')))!)
    expect(noName.problem).toMatch(/Couldn’t find a student name column\. The columns in this file are “Homeroom”, “Grade”/)
    const noGrade = rosterFromSheet(mainSheet(readTable(csv('First,Last,Homeroom\nAnn,Smith,Lee\n')))!)
    expect(noGrade.problem).toMatch(/Couldn’t find a grade column/)
  })
})

describe('toOneRosterUsersCsv — the frozen aggregate parser reads the synthesized file', () => {
  it('counts headcount by grade, honours withdrawn, and yields per-student rows', () => {
    const t = readTable(csv('Name,Grade,Status,ID\n"Smith, Ann",9th,Active,1\nBo Diaz,Kindergarten,Withdrawn,2\nCy Fox,Grade 9,,\nDee Gee,Staff,,\n'))
    const text = toOneRosterUsersCsv(rosterFromSheet(mainSheet(t)!).records)
    expect(text.split('\n')[0]).toBe('sourcedId,status,role,givenName,familyName,grades,email')
    const zip = zipOf('users.csv', text)
    const snap = parseOneRosterCsv(zip)
    expect(snap.totalEnrolled).toBe(2)
    expect(snap.byGrade).toEqual({ '9': 2 })
    expect(snap.byStatus?.withdrawn).toBe(1)
    expect((snap.warnings ?? []).join(' ')).toMatch(/Staff/)
    const rows = parseOneRosterStudents(zip)
    expect(rows.map((r) => [r.givenName, r.familyName, r.grade, r.withdrawn, r.sourcedId])).toEqual([
      ['Ann', 'Smith', '9', false, '1'],
      ['Bo', 'Diaz', 'K', true, '2'],
      ['Cy', 'Fox', '9', false, null],
      ['Dee', 'Gee', null, false, null],
    ])
  })
})

/** A STORED (method 0) zip with one entry — enough for the OneRoster reader. */
function zipOf(name: string, text: string): Buffer {
  const data = Buffer.from(text, 'utf8')
  const nameBuf = Buffer.from(name, 'utf8')
  const crc = crc32(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8)
  local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8)
  central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0, 14); central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28)
  central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36)
  central.writeUInt32LE(0, 38); central.writeUInt32LE(0, 42)
  const cdOffset = local.length + nameBuf.length + data.length
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6); eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length + nameBuf.length, 12); eocd.writeUInt32LE(cdOffset, 16); eocd.writeUInt16LE(0, 20)
  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd])
}
function crc32(buf: Buffer): number {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

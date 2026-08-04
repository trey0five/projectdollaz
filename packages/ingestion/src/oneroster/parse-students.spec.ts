// ─────────────────────────────────────────────────────────────────────────────
// Per-student retention (`parseOneRosterStudents`) + the BYTE-IDENTITY guard on
// the aggregate parser it now shares a reader with.
//
// The aggregate `parseOneRosterCsv` is in production: it feeds the dashboard, the
// accreditation signals and every enrollment-dependent metric. Retaining rows for
// the roster importer must not move it by one byte, so this NEW file re-asserts
// the OLD output against the same fixture — parse.spec.ts stays untouched, and if
// the shared reader ever drifts, two suites fail instead of none.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseOneRosterCsv, parseOneRosterStudents } from './parse.js'
import type { OneRosterStudentRow } from './parse.js'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'oneroster-1.1.zip')
const zip = () => readFileSync(FIXTURE)

const byId = (rows: OneRosterStudentRow[], id: string): OneRosterStudentRow => {
  const row = rows.find((r) => r.sourcedId === id)
  if (!row) throw new Error(`fixture row ${id} not returned`)
  return row
}

describe('parseOneRosterStudents', () => {
  it('returns every student row in users.csv and drops the non-student', () => {
    const rows = parseOneRosterStudents(zip())
    // users.csv holds s1..s10 (9 active + s9 tobedeleted) plus teacher t1.
    // NOTE: this is 10, not the aggregate's totalEnrolled of 8 — the aggregate
    // drops s8 (unmapped grade 99) and s9 (withdrawn) from the HEADCOUNT, but the
    // roster importer must still see both rows and decide for itself.
    expect(rows).toHaveLength(10)
    expect(rows.map((r) => r.sourcedId)).toEqual([
      's1',
      's2',
      's3',
      's4',
      's5',
      's6',
      's7',
      's8',
      's9',
      's10',
    ])
    expect(rows.some((r) => r.sourcedId === 't1')).toBe(false)
  })

  it('carries names, the raw grade token and the canonical GradeKey', () => {
    const rows = parseOneRosterStudents(zip())
    expect(byId(rows, 's1')).toEqual({
      sourcedId: 's1',
      givenName: 'Ada',
      familyName: 'Pre',
      gradeRaw: 'PR',
      grade: 'PK3',
      withdrawn: false,
    })
    expect(byId(rows, 's4')).toMatchObject({ gradeRaw: '01', grade: '1' })
    expect(byId(rows, 's7')).toMatchObject({ givenName: 'Gus', gradeRaw: '12', grade: '12' })
  })

  it('keeps only the FIRST grades token of a multi-value cell', () => {
    // s6's grades cell is the quoted "09,10" — one student, grade 9.
    expect(byId(parseOneRosterStudents(zip()), 's6')).toMatchObject({
      gradeRaw: '09',
      grade: '9',
    })
  })

  it('preserves a CSV-quoted name containing a comma', () => {
    expect(byId(parseOneRosterStudents(zip()), 's10')).toMatchObject({
      givenName: 'Rob, Jr.',
      familyName: 'Roy',
      grade: '3',
    })
  })

  it('returns an unmapped grade code as grade:null with the raw token retained', () => {
    // The API layer skips these with an aggregate warning; the PARSER reports,
    // it does not filter for the caller.
    expect(byId(parseOneRosterStudents(zip()), 's8')).toMatchObject({
      givenName: 'Hana',
      gradeRaw: '99',
      grade: null,
      withdrawn: false,
    })
  })

  it('flags the tobedeleted student as withdrawn (still returned, with its grade)', () => {
    expect(byId(parseOneRosterStudents(zip()), 's9')).toMatchObject({
      givenName: 'Ivy',
      familyName: 'Gone',
      gradeRaw: '05',
      grade: '5',
      withdrawn: true,
    })
    // Exactly one withdrawn row — matches the aggregate's byStatus.withdrawn.
    expect(parseOneRosterStudents(zip()).filter((r) => r.withdrawn)).toHaveLength(1)
  })

  it('honors an explicit observedOn option without changing the rows', () => {
    // observedOn dates the SNAPSHOT, not a student; accepting it keeps the two
    // parsers callable with one options object at the call site.
    expect(parseOneRosterStudents(zip(), { observedOn: '2025-10-01' })).toEqual(
      parseOneRosterStudents(zip()),
    )
  })

  it('does NOT treat enabledUser=false as withdrawn — the two parsers must agree', () => {
    // `enabledUser` means "can this account sign in", not "is this pupil
    // enrolled": lower-school pupils with no portal login are routinely exported
    // false. This parser once withdrew them and the frozen aggregate did not, so
    // ONE file produced TWO headcounts — the roster-owned promote stored the
    // login-enabled subset while the same response reported the file's full
    // total. The rule below is the aggregate's rule, and this asserts they match.
    const zipBuf = buildTinyZip(
      'sourcedId,role,status,enabledUser,givenName,familyName,grades\n' +
        's1,student,active,true,Ada,Pre,01\n' +
        's2,student,active,false,Ben,Pek,02\n' +
        's3,student,tobedeleted,true,Cy,Gone,03\n',
    )
    const rows = parseOneRosterStudents(zipBuf)
    expect(rows.map((r) => r.withdrawn)).toEqual([false, false, true])

    // THE INVARIANT, not just the flag: the number of rows this parser calls
    // enrolled is the number the frozen aggregate counts.
    const snap = parseOneRosterCsv(zipBuf)
    expect(rows.filter((r) => !r.withdrawn && r.grade !== null)).toHaveLength(snap.totalEnrolled)
    expect(rows.filter((r) => r.withdrawn)).toHaveLength(snap.byStatus?.withdrawn ?? -1)
  })

  it('returns [] — no throw — when users.csv has NO per-student detail columns', () => {
    // Acceptance 4: a school whose export is counts-only keeps working exactly as
    // today. No names => no records, and emphatically no error.
    const countsOnly = buildTinyZip('sourcedId,role,status,grades\ns1,student,active,01\n')
    expect(parseOneRosterStudents(countsOnly)).toEqual([])
    // ...and the aggregate still counts that student.
    expect(parseOneRosterCsv(countsOnly).totalEnrolled).toBe(1)
  })

  it('returns rows with a BLANK name preserved rather than filtering them out', () => {
    const rows = parseOneRosterStudents(
      buildTinyZip('sourcedId,role,status,givenName,familyName,grades\ns1,student,active,,,01\n'),
    )
    expect(rows).toEqual([
      { sourcedId: 's1', givenName: '', familyName: '', gradeRaw: '01', grade: '1', withdrawn: false },
    ])
  })

  it('normalizes a blank sourcedId cell to null (the idempotency key is absent)', () => {
    const rows = parseOneRosterStudents(
      buildTinyZip('sourcedId,role,status,givenName,familyName,grades\n,student,active,Ada,Pre,01\n'),
    )
    expect(rows[0]!.sourcedId).toBeNull()
  })

  it('throws exactly where the aggregate parser throws — same messages', () => {
    expect(() => parseOneRosterStudents(Buffer.from('not a zip'))).toThrow(/valid ZIP/i)
    expect(() =>
      parseOneRosterStudents(buildTinyZip('sourcedId,role,status\ns1,student,active\n')),
    ).toThrow(/grades/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BYTE-IDENTITY GUARD — the frozen aggregate output, re-asserted from a second
// suite. parse.spec.ts must never need an edit for this change; if the extracted
// reader alters the counting loop's semantics, THIS fails.
// ─────────────────────────────────────────────────────────────────────────────
describe('parseOneRosterCsv output is frozen by the shared reader', () => {
  it('produces the identical snapshot it produced before rows were retained', () => {
    const snap = parseOneRosterCsv(zip())
    expect(snap.provider).toBe('oneroster_csv')
    expect(snap.observedOn).toBe('2026-06-15')
    expect(snap.totalEnrolled).toBe(8)
    expect(snap.byGrade).toEqual({ PK3: 1, PK4: 1, K: 1, '1': 1, '3': 1, '9': 2, '12': 1 })
    expect(snap.byStatus).toEqual({ enrolled: 8, withdrawn: 1 })
    expect(snap.fte).toBeNull()
    expect(snap.warnings).toEqual([
      'Unrecognized grade code(s) not counted in the headcount: 99.',
    ])
    expect(snap.raw).toEqual({
      rawGradeCounts: { PR: 1, PK: 1, KG: 1, '01': 1, '09': 2, '12': 1, '99': 1, '03': 1 },
      droppedRows: 1,
      header: [
        'sourcedId',
        'status',
        'dateLastModified',
        'enabledUser',
        'orgSourcedIds',
        'role',
        'username',
        'userIds',
        'givenName',
        'familyName',
        'middleName',
        'identifier',
        'email',
        'sms',
        'phone',
        'agentSourcedIds',
        'grades',
        'password',
      ],
    })
  })

  it('is unaffected by calling the student parser first (no shared mutable state)', () => {
    const before = parseOneRosterCsv(zip())
    parseOneRosterStudents(zip())
    expect(parseOneRosterCsv(zip())).toEqual(before)
  })
})

/** Minimal STORED-only ZIP with a single users.csv — enough to exercise the reader. */
function buildTinyZip(usersCsv: string): Buffer {
  const data = Buffer.from(usersCsv, 'utf8')
  const name = Buffer.from('users.csv', 'utf8')
  const lh = Buffer.alloc(30)
  lh.writeUInt32LE(0x04034b50, 0)
  lh.writeUInt16LE(20, 4)
  lh.writeUInt16LE(0, 8) // STORED
  lh.writeUInt32LE(0, 14) // crc (reader ignores)
  lh.writeUInt32LE(data.length, 18)
  lh.writeUInt32LE(data.length, 22)
  lh.writeUInt16LE(name.length, 26)
  const ch = Buffer.alloc(46)
  ch.writeUInt32LE(0x02014b50, 0)
  ch.writeUInt16LE(20, 4)
  ch.writeUInt16LE(20, 6)
  ch.writeUInt16LE(0, 10)
  ch.writeUInt32LE(0, 16)
  ch.writeUInt32LE(data.length, 20)
  ch.writeUInt32LE(data.length, 24)
  ch.writeUInt16LE(name.length, 28)
  ch.writeUInt32LE(0, 42) // local offset
  const local = Buffer.concat([lh, name, data])
  const central = Buffer.concat([ch, name])
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(central.length, 12)
  eocd.writeUInt32LE(local.length, 16)
  return Buffer.concat([local, central, eocd])
}

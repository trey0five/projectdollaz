import { describe, expect, it } from 'vitest'
import { normalizeGrade, parseStudentImport } from './student-import.parser.js'

// ─────────────────────────────────────────────────────────────────────────────
// parseStudentImport — PURE parser: shape auto-detection, the simple flat CSV,
// OneRoster users.csv (+ demographics.csv join), soft degradation (unmapped
// grades → skipped rows + warnings) and hard throws (unrecognizable headers).
// ─────────────────────────────────────────────────────────────────────────────

const buf = (s: string): Buffer => Buffer.from(s, 'utf8')

describe('parseStudentImport — simple flat CSV', () => {
  it('parses the full column set, coercing booleans and dates', () => {
    const csv = [
      'firstName,lastName,grade,gender,race,ethnicity,birthDate,status,enrolledOn,iep,504,ell,notes,externalId',
      'Ada,Lovelace,3,female,white,nonHispanic,2017-04-02,enrolled,2024-08-15,yes,0,x,Loves math,S-1',
      'Alan,Turing,K,male,,,2020-11-30,waitlist,,,,,,S-2',
    ].join('\n')
    const res = parseStudentImport(buf(csv))
    expect(res.shape).toBe('simple')
    expect(res.rows).toHaveLength(2)
    const [ada, alan] = res.rows
    expect(ada!.issues).toEqual([])
    expect(ada!.student).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
      grade: '3',
      gender: 'female',
      race: 'white',
      ethnicity: 'nonHispanic',
      birthDate: '2017-04-02',
      status: 'enrolled',
      enrolledOn: '2024-08-15',
      hasIep: true, // yes
      has504: false, // 0
      ell: true, // x
      notes: 'Loves math',
      externalId: 'S-1',
    })
    expect(alan!.student).toMatchObject({ grade: 'K', status: 'waitlist', gender: 'male', race: null, notes: null })
  })

  it('flags unmapped grades as issues + warnings (row is skippable, grade kept raw)', () => {
    const csv = ['firstName,lastName,grade', 'Kid,One,Kinder', 'Kid,Two,4'].join('\n')
    const res = parseStudentImport(buf(csv))
    expect(res.rows[0]!.issues.some((i) => i.includes("unmapped grade 'Kinder'"))).toBe(true)
    expect(res.rows[0]!.student.grade).toBe('Kinder') // raw, so the preview can show it
    expect(res.warnings.some((w) => w.includes('Kinder'))).toBe(true)
    expect(res.rows[1]!.issues).toEqual([])
  })

  it('accepts OneRoster grade codes and case-insensitive keys in the grade cell', () => {
    expect(normalizeGrade('09')).toBe('9')
    expect(normalizeGrade('KG')).toBe('K')
    expect(normalizeGrade('pk3')).toBe('PK3')
    expect(normalizeGrade('TK')).toBe('PK4')
    expect(normalizeGrade('10')).toBe('10')
    expect(normalizeGrade('Kinder')).toBeNull()
  })

  it('resolves verbose demographic labels via the canonical vocab', () => {
    const csv = ['firstName,lastName,grade,race,ethnicity', 'A,B,5,Black/African American,Hispanic'].join('\n')
    const res = parseStudentImport(buf(csv))
    expect(res.rows[0]!.student.race).toBe('black')
    expect(res.rows[0]!.student.ethnicity).toBe('hispanic')
  })

  it('a withdrawnOn date with a non-terminal status is fixed up to withdrawn', () => {
    const csv = ['firstName,lastName,grade,withdrawnOn', 'Gone,Kid,7,2026-01-15'].join('\n')
    const res = parseStudentImport(buf(csv))
    expect(res.rows[0]!.student.status).toBe('withdrawn')
    expect(res.rows[0]!.student.withdrawnOn).toBe('2026-01-15')
  })

  it('missing names and bad dates are row issues (not throws)', () => {
    const csv = ['firstName,lastName,grade,birthDate', ',Smith,2,2019-01-01', 'Ok,Kid,2,notadate'].join('\n')
    const res = parseStudentImport(buf(csv))
    expect(res.rows[0]!.issues.some((i) => i.includes('missing firstName/lastName'))).toBe(true)
    expect(res.rows[1]!.issues.some((i) => i.includes('invalid birthDate'))).toBe(true)
  })
})

describe('parseStudentImport — OneRoster users.csv (+ demographics.csv)', () => {
  const users = [
    'sourcedId,status,dateLastModified,enabledUser,orgSourcedIds,role,username,givenName,familyName,grades',
    'u1,active,,true,o1,student,ada,Ada,Lovelace,09',
    'u2,tobedeleted,,true,o1,student,gone,Gone,Kid,10',
    'u3,active,,false,o1,student,off,Disabled,Kid,11',
    'u4,active,,true,o1,teacher,t1,Teach,Er,',
    'u5,active,,true,o1,student,unk,Unknown,Grade,GRADX',
  ].join('\n')

  it('keeps role=student only, maps grades, and detects withdrawn (tobedeleted/disabled)', () => {
    const res = parseStudentImport(buf(users))
    expect(res.shape).toBe('oneroster')
    // The teacher row is silently dropped (not a skipped student row).
    expect(res.rows).toHaveLength(4)
    const byExt = new Map(res.rows.map((r) => [r.student.externalId, r]))
    expect(byExt.get('u1')!.student).toMatchObject({ firstName: 'Ada', grade: '9', status: 'enrolled' })
    expect(byExt.get('u2')!.student.status).toBe('withdrawn') // tobedeleted
    expect(byExt.get('u3')!.student.status).toBe('withdrawn') // enabledUser=false
    expect(byExt.get('u5')!.issues.some((i) => i.includes("unmapped grade 'GRADX'"))).toBe(true)
    expect(res.warnings.some((w) => w.includes('GRADX'))).toBe(true)
  })

  it('joins demographics.csv by sourcedId (birthDate, sex, race booleans, ethnicity)', () => {
    const demo = [
      'sourcedId,birthDate,sex,americanIndianOrAlaskaNative,asian,blackOrAfricanAmerican,nativeHawaiianOrOtherPacificIslander,white,demographicRaceTwoOrMoreRaces,hispanicOrLatinoEthnicity',
      'u1,2011-03-04,female,false,false,true,false,false,false,false',
      'u2,2010-07-08,male,false,true,false,false,true,false,true',
    ].join('\n')
    const res = parseStudentImport(buf(users), buf(demo))
    const byExt = new Map(res.rows.map((r) => [r.student.externalId, r]))
    expect(byExt.get('u1')!.student).toMatchObject({
      birthDate: '2011-03-04',
      gender: 'female',
      race: 'black',
      ethnicity: 'nonHispanic',
    })
    // Two race booleans true → twoOrMore; hispanic flag true → hispanic.
    expect(byExt.get('u2')!.student).toMatchObject({ gender: 'male', race: 'twoOrMore', ethnicity: 'hispanic' })
    // A student with no demographics row keeps nulls.
    expect(byExt.get('u3')!.student.birthDate).toBeNull()
  })

  it('a missing sourcedId column in demographics degrades to a warning, not a throw', () => {
    const demo = ['id,birthDate', 'u1,2011-03-04'].join('\n')
    const res = parseStudentImport(buf(users), buf(demo))
    expect(res.warnings.some((w) => w.includes('demographics.csv'))).toBe(true)
    expect(res.rows.find((r) => r.student.externalId === 'u1')!.student.birthDate).toBeNull()
  })
})

describe('parseStudentImport — hard failures', () => {
  it('throws on an unrecognizable header set', () => {
    expect(() => parseStudentImport(buf('foo,bar\n1,2'))).toThrow(/Unrecognized roster CSV/)
  })

  it('throws on an empty file', () => {
    expect(() => parseStudentImport(buf(''))).toThrow()
  })

  it('throws when the simple shape lacks the grade column', () => {
    expect(() => parseStudentImport(buf('firstName,lastName\nA,B'))).toThrow(/grade column/)
  })
})

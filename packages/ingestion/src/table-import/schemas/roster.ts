// ─────────────────────────────────────────────────────────────────────────────
// Roster schema — what a student list means, whatever the SIS called the columns.
// Feeds BOTH enrollment paths (one-step upload + import-with-review): records are
// raw strings; grade/status/dates are coerced by the API parser as before.
// Customer 2026-10-24: an Excel roster was refused for "missing expected columns"
// because the headers weren't spelled sourcedId / firstName / grade.
// ─────────────────────────────────────────────────────────────────────────────
import { cell, describeHeader, matchColumns, type ColumnMatches, type ColumnOverride, type FieldSpec } from '../match-columns.js'
import type { TableSheet } from '../read-table.js'

export const ROSTER_FIELDS: readonly FieldSpec[] = [
  { key: 'lastName', label: 'Last name', synonyms: ['last', 'surname', 'family name', 'familyname', 'student last name', 'last name of student', 'lname'] },
  { key: 'firstName', label: 'First name', synonyms: ['first', 'given name', 'givenname', 'student first name', 'first name of student', 'fname', 'preferred name'] },
  { key: 'middleName', label: 'Middle name', synonyms: ['middle', 'middle initial', 'mi'] },
  { key: 'fullName', label: 'Student name', synonyms: ['student', 'name', 'student full name', 'full name', 'pupil', 'child', 'child name', 'legal name', 'name of student'] },
  { key: 'grade', label: 'Grade', synonyms: ['grade level', 'gradelevel', 'gr', 'grd', 'year', 'year level', 'class', 'form', 'current grade', 'grade in', 'grades', 'level'] },
  { key: 'externalId', label: 'Student ID', synonyms: ['id', 'student id', 'studentid', 'sis id', 'sourcedid', 'external id', 'student number', 'student no', 'id number', 'local id', 'state id', 'pupil id'] },
  { key: 'status', label: 'Status', synonyms: ['enrollment status', 'enrolled status', 'active', 'enrollment'] },
  { key: 'gender', label: 'Gender', synonyms: ['sex'] },
  { key: 'race', label: 'Race', synonyms: ['race ethnicity', 'race/ethnicity'] },
  { key: 'ethnicity', label: 'Ethnicity', synonyms: ['hispanic', 'hispanic latino'] },
  { key: 'birthDate', label: 'Birth date', synonyms: ['dob', 'date of birth', 'birthdate', 'birthday', 'born'] },
  { key: 'enrolledOn', label: 'Enrolled on', synonyms: ['enrolled', 'enrollment date', 'entry date', 'start date', 'date enrolled', 'admit date'] },
  { key: 'withdrawnOn', label: 'Withdrawn on', synonyms: ['withdrawn', 'withdrawal date', 'exit date', 'end date', 'date withdrawn', 'leave date'] },
  { key: 'iep', label: 'IEP', synonyms: ['has iep', 'isp', 'has isp', 'iep/isp', 'special education', 'sped'] },
  { key: 'plan504', label: '504', synonyms: ['504 plan', 'has 504', 'plan 504', 'section 504'] },
  { key: 'ell', label: 'ELL', synonyms: ['english learner', 'el', 'esl', 'eld', 'english language learner'] },
  { key: 'email', label: 'Email', synonyms: ['student email', 'e-mail', 'email address'] },
  { key: 'homeroom', label: 'Homeroom', synonyms: ['home room', 'teacher', 'homeroom teacher', 'advisor', 'section'] },
  { key: 'notes', label: 'Notes', synonyms: ['note', 'comments', 'comment', 'remarks'] },
  { key: 'role', label: 'Role', synonyms: ['user role', 'type', 'person type'] },
]

export interface RosterRecord {
  /** 1-based row number in the sheet (header row counted), for messages. */
  row: number
  firstName: string
  lastName: string
  grade: string
  externalId: string
  status: string
  gender: string
  race: string
  ethnicity: string
  birthDate: string
  enrolledOn: string
  withdrawnOn: string
  iep: string
  plan504: string
  ell: string
  email: string
  notes: string
  role: string
}

export interface RosterRead {
  records: RosterRecord[]
  columns: ColumnMatches
  /** Plain-words reason the sheet can't be a roster, else null. */
  problem: string | null
}

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])

/** "Smith, John A." → John A. / Smith · "John A. Smith Jr." → John A. / Smith Jr. */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const s = full.replace(/\s+/g, ' ').trim()
  if (!s) return { firstName: '', lastName: '' }
  const comma = s.indexOf(',')
  if (comma > 0) {
    return { lastName: s.slice(0, comma).trim(), firstName: s.slice(comma + 1).trim() }
  }
  const parts = s.split(' ')
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '' }
  let suffix = ''
  const lastTok = parts[parts.length - 1]!.replace(/\./g, '').toLowerCase()
  if (parts.length > 2 && SUFFIXES.has(lastTok)) suffix = ` ${parts.pop()}`
  const lastName = parts.pop()! + suffix
  return { firstName: parts.join(' '), lastName }
}

const GRADE_WORDS: Record<string, string> = {
  k: 'K', kg: 'K', kinder: 'K', kindergarten: 'K', k5: 'K', 'k-5': 'K',
  pk: 'PK4', prek: 'PK4', 'pre-k': 'PK4', pk4: 'PK4', prek4: 'PK4', preschool4: 'PK4', vpk: 'PK4', tk: 'PK4', 'transitional kindergarten': 'PK4', k4: 'PK4',
  pk3: 'PK3', prek3: 'PK3', preschool: 'PK3', preschool3: 'PK3', nursery: 'PK3', pr: 'PK3', it: 'PK3', k3: 'PK3', toddler: 'PK3',
  freshman: '9', freshmen: '9', sophomore: '10', sophomores: '10', junior: '11', juniors: '11', senior: '12', seniors: '12',
}

/**
 * A grade as people and systems write it → the app's GradeKey (PK3/PK4/K/1-12),
 * or null. Accepts "9", "09", "9th", "Grade 9", "Gr. 9", "G9", "Kindergarten",
 * "Pre-K 4", "Freshman", and OneRoster codes.
 */
export function gradeKeyFromText(raw: string): string | null {
  const s = (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!s) return null
  const upper = s.toUpperCase()
  if (/^(PK3|PK4|K)$/.test(upper)) return upper
  if (GRADE_WORDS[s]) return GRADE_WORDS[s]!
  const squashed = s.replace(/[\s.\-_]/g, '')
  if (GRADE_WORDS[squashed]) return GRADE_WORDS[squashed]!
  if (/^(pre ?k|prek|pk)\s*-?\s*3/.test(s)) return 'PK3'
  if (/^(pre ?k|prek|pk)\s*-?\s*4/.test(s)) return 'PK4'
  const m = s.match(/^(?:grade|gr\.?|g|year|yr|class)?\s*0*(\d{1,2})(?:st|nd|rd|th)?(?:\s*grade)?$/)
  if (m) {
    const n = Number(m[1])
    if (n >= 1 && n <= 12) return String(n)
    if (n === 0) return 'K'
  }
  return null
}

/** GradeKey → the OneRoster code the aggregate parser's grade map understands. */
export function oneRosterCodeForGradeKey(key: string): string {
  if (key === 'PK3') return 'PR'
  if (key === 'PK4') return 'PK'
  if (key === 'K') return 'KG'
  return key.padStart(2, '0')
}

/**
 * Read a sheet as a roster. Never throws: `problem` says, in plain words, when
 * there's no way to get a name or a grade out of it — naming the columns we saw.
 */
export function rosterFromSheet(sheet: TableSheet, override?: ColumnOverride | null): RosterRead {
  const columns = matchColumns(sheet.header, ROSTER_FIELDS, override)
  const m = columns.mapping
  const hasSplitName = 'firstName' in m || 'lastName' in m
  const hasName = hasSplitName || 'fullName' in m
  const saw = describeHeader(sheet.header)
  if (!hasName) {
    return {
      records: [],
      columns,
      problem: `Couldn’t find a student name column. The columns in this file are ${saw}. Add a “Student” (or “First name” and “Last name”) column and try again.`,
    }
  }
  if (!('grade' in m)) {
    return {
      records: [],
      columns,
      problem: `Couldn’t find a grade column. The columns in this file are ${saw}. Add a “Grade” column (9, 9th, Grade 9 and K all work) and try again.`,
    }
  }
  const records: RosterRecord[] = sheet.rows.map((r, i) => {
    let firstName = cell(r, m, 'firstName')
    let lastName = cell(r, m, 'lastName')
    if (!firstName && !lastName && 'fullName' in m) {
      const split = splitFullName(cell(r, m, 'fullName'))
      firstName = split.firstName
      lastName = split.lastName
    } else if (hasSplitName && 'fullName' in m && (!firstName || !lastName)) {
      const split = splitFullName(cell(r, m, 'fullName'))
      firstName = firstName || split.firstName
      lastName = lastName || split.lastName
    }
    const middle = cell(r, m, 'middleName')
    if (middle && firstName && !/\s/.test(firstName)) firstName = `${firstName} ${middle}`
    return {
      row: sheet.headerRow + 2 + i,
      firstName,
      lastName,
      grade: cell(r, m, 'grade'),
      externalId: cell(r, m, 'externalId'),
      status: cell(r, m, 'status'),
      gender: cell(r, m, 'gender'),
      race: cell(r, m, 'race'),
      ethnicity: cell(r, m, 'ethnicity'),
      birthDate: cell(r, m, 'birthDate'),
      enrolledOn: cell(r, m, 'enrolledOn'),
      withdrawnOn: cell(r, m, 'withdrawnOn'),
      iep: cell(r, m, 'iep'),
      plan504: cell(r, m, 'plan504'),
      ell: cell(r, m, 'ell'),
      email: cell(r, m, 'email'),
      notes: cell(r, m, 'notes'),
      role: cell(r, m, 'role'),
    }
  })
  return { records, columns, problem: null }
}

const WITHDRAWN_WORDS = /^(withdrawn|withdrew|inactive|left|exited|transferred|graduated|tobedeleted|no|n|0|false)$/i

function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Records → a OneRoster users.csv so the frozen aggregate parser (headcount by
 * grade, warnings, snapshot) runs unchanged on a file that wasn't OneRoster.
 * Unknown grades are passed through verbatim so the parser counts and warns on
 * them exactly as it does for a real export. A student is withdrawn when the
 * status says so or a withdrawal date is filled.
 */
export function toOneRosterUsersCsv(records: readonly RosterRecord[]): string {
  const header = ['sourcedId', 'status', 'role', 'givenName', 'familyName', 'grades', 'email']
  const lines = [header.join(',')]
  for (const r of records) {
    const key = gradeKeyFromText(r.grade)
    const grades = key ? oneRosterCodeForGradeKey(key) : r.grade
    const withdrawn = WITHDRAWN_WORDS.test(r.status) || r.withdrawnOn !== ''
    const role = r.role && !/student|pupil/i.test(r.role) ? r.role.toLowerCase() : 'student'
    lines.push(
      [r.externalId, withdrawn ? 'tobedeleted' : 'active', role, r.firstName, r.lastName, grades, r.email]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\n')
}

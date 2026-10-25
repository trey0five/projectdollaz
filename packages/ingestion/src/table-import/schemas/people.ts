// ─────────────────────────────────────────────────────────────────────────────
// People schema — a board roster / finance-team list / staff list, whatever the
// columns were called (#46). Records are raw strings plus a resolved group;
// the API validates dates and writes.
// ─────────────────────────────────────────────────────────────────────────────
import { cell, describeHeader, matchColumns, type ColumnMatches, type FieldSpec } from '../match-columns.js'
import type { TableSheet } from '../read-table.js'
import { splitFullName } from './roster.js'

export const PERSON_GROUP_KEYS = ['board', 'finance_team', 'staff'] as const
export type PersonGroupKey = (typeof PERSON_GROUP_KEYS)[number]

export const PEOPLE_FIELDS: readonly FieldSpec[] = [
  { key: 'lastName', label: 'Last name', synonyms: ['last', 'surname', 'family name', 'lname'] },
  { key: 'firstName', label: 'First name', synonyms: ['first', 'given name', 'fname', 'preferred name'] },
  { key: 'name', label: 'Name', synonyms: ['full name', 'member', 'member name', 'trustee', 'person', 'board member', 'director', 'staff member', 'employee', 'name of member'] },
  { key: 'title', label: 'Title / role', synonyms: ['title', 'role', 'position', 'office', 'officer', 'board role', 'board position', 'job title', 'responsibility'] },
  { key: 'group', label: 'Group', synonyms: ['group', 'category', 'type', 'member type', 'classification', 'body', 'team'] },
  { key: 'termStart', label: 'Term start', synonyms: ['term start', 'start', 'start date', 'term begins', 'joined', 'date joined', 'elected', 'appointed', 'since', 'term from'] },
  { key: 'termEnd', label: 'Term end', synonyms: ['term end', 'end', 'end date', 'term ends', 'term expires', 'expires', 'expiration', 'term to', 'until', 'through'] },
  { key: 'email', label: 'Email', synonyms: ['e-mail', 'email address', 'contact email'] },
  { key: 'phone', label: 'Phone', synonyms: ['telephone', 'mobile', 'cell', 'phone number'] },
  { key: 'bio', label: 'Bio / notes', synonyms: ['bio', 'notes', 'note', 'qualifications', 'background', 'comments', 'affiliation', 'employer', 'occupation'] },
  { key: 'active', label: 'Active', synonyms: ['status', 'current', 'is active'] },
]

export interface PersonRecord {
  row: number
  name: string
  title: string
  /** Resolved from the group cell, then the title, then the caller's default. */
  group: PersonGroupKey
  termStart: string
  termEnd: string
  email: string
  bio: string
  active: boolean
}

export interface PeopleRead {
  records: PersonRecord[]
  columns: ColumnMatches
  problem: string | null
}

const FINANCE_WORDS = /\b(cfo|chief financial|business manager|business office|bookkeep|controller|comptroller|accountant|finance (director|manager|officer)|treasurer|director of finance)\b/i
const STAFF_WORDS = /\b(principal|head of school|headmaster|teacher|faculty|staff|admin(istrator)?|dean|counselor|coach|aide|secretary to|office manager|employee)\b/i
const BOARD_WORDS = /\b(trustee|board|director|chair|vice|president|governor|member|at[- ]large|emeritus)\b/i

/** A group cell or a title → the app's person group, or null when nothing says. */
export function groupFromText(groupCell: string, title: string): PersonGroupKey | null {
  const g = (groupCell || '').trim().toLowerCase()
  if (g) {
    if (/finance|business|treasur|cfo/.test(g)) return 'finance_team'
    if (/staff|faculty|employee|admin|teacher/.test(g)) return 'staff'
    if (/board|trustee|director|governor/.test(g)) return 'board'
  }
  const t = (title || '').trim()
  if (FINANCE_WORDS.test(t)) return 'finance_team'
  if (STAFF_WORDS.test(t)) return 'staff'
  if (BOARD_WORDS.test(t)) return 'board'
  return null
}

const INACTIVE = /^(no|n|false|0|inactive|former|past|retired|resigned|ended|emeritus)$/i

/** Read a sheet as a people list. `defaultGroup` is what the tile was for (a board roster → 'board'). */
export function peopleFromSheet(sheet: TableSheet, defaultGroup: PersonGroupKey = 'board'): PeopleRead {
  const columns = matchColumns(sheet.header, PEOPLE_FIELDS)
  const m = columns.mapping
  const hasName = 'name' in m || 'firstName' in m || 'lastName' in m
  if (!hasName) {
    return {
      records: [],
      columns,
      problem: `Couldn’t find a name column. The columns in this file are ${describeHeader(sheet.header)}. Add a “Name” (or “First name” and “Last name”) column and try again.`,
    }
  }
  const records: PersonRecord[] = []
  sheet.rows.forEach((r, i) => {
    let name = cell(r, m, 'name')
    const first = cell(r, m, 'firstName')
    const last = cell(r, m, 'lastName')
    if (!name && (first || last)) name = [first, last].filter(Boolean).join(' ')
    else if (name && name.includes(',')) {
      const split = splitFullName(name)
      name = [split.firstName, split.lastName].filter(Boolean).join(' ')
    }
    if (!name) return // a blank line in the list
    const title = cell(r, m, 'title')
    const activeCell = cell(r, m, 'active')
    records.push({
      row: sheet.headerRow + 2 + i,
      name,
      title,
      group: groupFromText(cell(r, m, 'group'), title) ?? defaultGroup,
      termStart: cell(r, m, 'termStart'),
      termEnd: cell(r, m, 'termEnd'),
      email: cell(r, m, 'email'),
      bio: cell(r, m, 'bio'),
      active: !(activeCell && INACTIVE.test(activeCell)),
    })
  })
  return { records, columns, problem: null }
}

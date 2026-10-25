// ─────────────────────────────────────────────────────────────────────────────
// Committees schema — committee membership as schools keep it (#46): one row per
// member ("Finance Committee | Ann Smith | Chair"), or one row per committee
// with a "Members" cell ("Ann Smith (Chair), Bo Diaz, Cy Fox"). Both become one
// record per (committee, member); a committee with no members is one record
// with member ''.
// ─────────────────────────────────────────────────────────────────────────────
import { cell, describeHeader, matchColumns, type ColumnMatches, type FieldSpec } from '../match-columns.js'
import type { TableSheet } from '../read-table.js'

export const MEMBER_ROLE_KEYS = ['chair', 'vice_chair', 'secretary', 'member'] as const
export type MemberRoleKey = (typeof MEMBER_ROLE_KEYS)[number]

export const COMMITTEE_FIELDS: readonly FieldSpec[] = [
  { key: 'committee', label: 'Committee', synonyms: ['committee name', 'name', 'group', 'body', 'board committee', 'subcommittee', 'task force'] },
  { key: 'members', label: 'Members', synonyms: ['member list', 'membership', 'committee members', 'who'] },
  { key: 'member', label: 'Member', synonyms: ['member name', 'person', 'trustee', 'name of member', 'participant', 'full name'] },
  { key: 'role', label: 'Role', synonyms: ['position', 'title', 'member role', 'officer', 'committee role'] },
  { key: 'chair', label: 'Chair', synonyms: ['chairperson', 'chaired by', 'committee chair', 'lead'] },
  { key: 'kind', label: 'Kind', synonyms: ['type', 'category', 'area', 'focus'] },
  { key: 'description', label: 'Description', synonyms: ['purpose', 'charge', 'notes', 'note', 'mandate', 'scope'] },
  { key: 'cadence', label: 'Meets', synonyms: ['meeting cadence', 'frequency', 'meeting frequency', 'schedule', 'meeting schedule'] },
  { key: 'email', label: 'Email', synonyms: ['member email', 'e-mail', 'email address'] },
]

export interface CommitteeMemberRecord {
  row: number
  committee: string
  member: string
  role: MemberRoleKey
  email: string
  kind: string
  description: string
}

export interface CommitteesRead {
  records: CommitteeMemberRecord[]
  columns: ColumnMatches
  problem: string | null
}

/** "Chair", "Chairperson", "Vice-Chair", "Secretary", "Member", "Trustee" → the app's role keys. */
export function memberRoleFromText(raw: string): MemberRoleKey {
  const s = (raw || '').trim().toLowerCase()
  if (/vice/.test(s)) return 'vice_chair'
  if (/chair|president|lead|head/.test(s)) return 'chair'
  if (/secretary|clerk|recorder/.test(s)) return 'secretary'
  return 'member'
}

const KIND_WORDS: Array<[RegExp, string]> = [
  [/finance|budget|audit|invest/i, 'finance'],
  [/governance|nominat|bylaw|trustee/i, 'governance'],
  [/advance|develop|fundrais|gala|annual fund|capital campaign/i, 'advancement'],
  [/academ|curricul|educat|instruction|student/i, 'academic'],
  [/^board$|executive|full board/i, 'board'],
]

/** The committee's kind from its name when the file doesn't say. */
export function committeeKindFromName(name: string, kindCell = ''): string {
  const k = (kindCell || '').trim().toLowerCase()
  if (k) {
    for (const [re, kind] of KIND_WORDS) if (re.test(k)) return kind
    return k.replace(/[^a-z]+/g, '_').slice(0, 40) || 'other'
  }
  for (const [re, kind] of KIND_WORDS) if (re.test(name)) return kind
  return 'other'
}

/** "Ann Smith (Chair); Bo Diaz, Cy Fox - secretary" → [{ member, role }]. */
export function splitMembersCell(cellText: string): Array<{ member: string; role: MemberRoleKey }> {
  return (cellText || '')
    .split(/[;\n]|,(?![^(]*\))/) // commas split members, but not inside "(Chair, 2026)"
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const paren = s.match(/^(.*?)\s*\(([^)]*)\)\s*$/)
      const dash = s.match(/^(.*?)\s*[-–—:]\s*(chair|vice[- ]?chair|secretary|member|president|clerk)\b.*$/i)
      if (paren) return { member: paren[1]!.trim(), role: memberRoleFromText(paren[2]!) }
      if (dash) return { member: dash[1]!.trim(), role: memberRoleFromText(dash[2]!) }
      return { member: s, role: 'member' as MemberRoleKey }
    })
    .filter((x) => x.member)
}

export function committeesFromSheet(sheet: TableSheet): CommitteesRead {
  const columns = matchColumns(sheet.header, COMMITTEE_FIELDS)
  const m = columns.mapping
  if (!('committee' in m)) {
    return {
      records: [],
      columns,
      problem: `Couldn’t find a committee column. The columns in this file are ${describeHeader(sheet.header)}. Add a “Committee” column and try again.`,
    }
  }
  const records: CommitteeMemberRecord[] = []
  let lastCommittee = ''
  sheet.rows.forEach((r, i) => {
    const row = sheet.headerRow + 2 + i
    // A member-per-row export often leaves the committee cell blank under its first row.
    const committee = cell(r, m, 'committee') || lastCommittee
    if (!committee) return
    lastCommittee = committee
    const kind = committeeKindFromName(committee, cell(r, m, 'kind'))
    const description = cell(r, m, 'description')
    const email = cell(r, m, 'email')
    const base = { row, committee, kind, description, email }
    const membersCell = cell(r, m, 'members')
    const member = cell(r, m, 'member')
    const chair = cell(r, m, 'chair')
    const pushed: CommitteeMemberRecord[] = []
    if (membersCell) {
      for (const x of splitMembersCell(membersCell)) pushed.push({ ...base, member: x.member, role: x.role })
    }
    if (member) pushed.push({ ...base, member, role: memberRoleFromText(cell(r, m, 'role')) })
    if (chair) {
      const existing = pushed.find((p) => p.member.toLowerCase() === chair.toLowerCase())
      if (existing) existing.role = 'chair'
      else pushed.push({ ...base, member: chair, role: 'chair', email: '' })
    }
    if (pushed.length === 0) pushed.push({ ...base, member: '', role: 'member' })
    records.push(...pushed)
  })
  return { records, columns, problem: null }
}

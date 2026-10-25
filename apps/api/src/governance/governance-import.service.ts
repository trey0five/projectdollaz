// ─────────────────────────────────────────────────────────────────────────────
// Governance imports (#46): a board roster / people list and a committee list,
// as files — preview (stateless) → commit (the reviewed rows, as JSON).
//
// Same shape as the student import: the file is read ONCE for the preview,
// which says how each column was read and what each row will do (new /
// update / skipped); the commit re-matches server-side and writes through the
// existing PeopleService / CommitteesService so every rule (dates, groups,
// 409s, audit rows) is the one the forms already enforce. Matching is by
// email, then by name (case/space-insensitive) — merge only, never a replace.
// ─────────────────────────────────────────────────────────────────────────────
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import {
  committeesFromSheet,
  mainSheet,
  peopleFromSheet,
  readTable,
  COMMITTEE_FIELDS,
  PEOPLE_FIELDS,
  type ColumnOverride,
  type PersonRecord,
  type CommitteeMemberRecord,
} from '@finrep/ingestion'
import { importTable, type ImportTable } from '../common/import-mapping.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeopleService } from './people.service.js'
import { CommitteesService } from './committees.service.js'
import type { CreatePersonDto, MemberRole, PersonGroup } from './dto/person.dto.js'
import type { CommitteeImportRowDto } from './dto/governance-import.dto.js'

export interface ImportColumn {
  field: string
  header: string
}

export interface PeoplePreviewRow {
  row: number
  action: 'new' | 'update' | 'skipped'
  existingId: string | null
  person: CreatePersonDto
  issues: string[]
}

export interface PeoplePreview {
  columns: ImportColumn[]
  summary: { new: number; update: number; skipped: number }
  warnings: string[]
  rows: PeoplePreviewRow[]
  table: ImportTable
  problem: string | null
}

export interface CommitteePreviewRow {
  row: number
  committee: string
  committeeAction: 'new' | 'existing'
  member: string | null
  role: MemberRole
  personAction: 'existing' | 'new' | 'none'
  entry: CommitteeImportRowDto
  issues: string[]
}

export interface CommitteesPreview {
  columns: ImportColumn[]
  summary: { committees: number; newCommittees: number; members: number; newPeople: number; skipped: number }
  warnings: string[]
  rows: CommitteePreviewRow[]
  table: ImportTable
  problem: string | null
}

const normName = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const normEmail = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/** "6/30/2026", "2026-06-30", "June 30, 2026" → ISO yyyy-mm-dd, or null (blank) / undefined (unreadable). */
export function isoDateFromText(raw: string): string | null | undefined {
  const s = (raw ?? '').trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, '0')}-${iso[3]!.padStart(2, '0')}`
  const us = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (us) {
    const y = us[3]!.length === 2 ? `20${us[3]}` : us[3]!
    return `${y}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`
  }
  if (/^\d{4}$/.test(s)) return `${s}-06-30` // "2027" alone = the term's fiscal year end
  const t = Date.parse(s)
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10)
  return undefined
}

@Injectable()
export class GovernanceImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly people: PeopleService,
    private readonly committees: CommitteesService,
  ) {}

  // ── People ──────────────────────────────────────────────────────────────────

  async previewPeople(
    schoolId: string,
    file: { buffer: Buffer; size?: number } | undefined,
    opts: { defaultGroup?: PersonGroup; mapping?: ColumnOverride | null } = {},
  ): Promise<PeoplePreview> {
    const { records, columns, warnings, table, problem } = this.readPeople(file, opts.defaultGroup ?? 'board', opts.mapping ?? null)
    if (problem) return { columns, summary: { new: 0, update: 0, skipped: 0 }, warnings, rows: [], table, problem }
    const existing = await this.prisma.governancePerson.findMany({
      where: { schoolId },
      select: { id: true, name: true, email: true },
    })
    const byEmail = new Map(existing.filter((p) => p.email).map((p) => [normEmail(p.email), p]))
    const byName = new Map(existing.map((p) => [normName(p.name), p]))
    const rows: PeoplePreviewRow[] = records.map((r) => {
      const { person, issues } = this.toPersonDto(r)
      const match = (person.email && byEmail.get(normEmail(person.email))) || byName.get(normName(person.name)) || null
      const action = issues.length ? 'skipped' : match ? 'update' : 'new'
      return { row: r.row, action, existingId: match?.id ?? null, person, issues }
    })
    return {
      columns,
      summary: {
        new: rows.filter((r) => r.action === 'new').length,
        update: rows.filter((r) => r.action === 'update').length,
        skipped: rows.filter((r) => r.action === 'skipped').length,
      },
      warnings,
      rows,
      table,
      problem: null,
    }
  }

  /** Merge: update a person we can match (by email, then name), create the rest. */
  async commitPeople(schoolId: string, rows: CreatePersonDto[], userId: string) {
    const existing = await this.prisma.governancePerson.findMany({
      where: { schoolId },
      select: { id: true, name: true, email: true },
    })
    const byEmail = new Map(existing.filter((p) => p.email).map((p) => [normEmail(p.email), p]))
    const byName = new Map(existing.map((p) => [normName(p.name), p]))
    let created = 0
    let updated = 0
    for (const dto of rows) {
      const match = (dto.email && byEmail.get(normEmail(dto.email))) || byName.get(normName(dto.name)) || null
      if (match) {
        // Only what the file knows — a blank cell never erases a hand-entered value.
        const patch: Record<string, unknown> = {}
        for (const k of ['name', 'title', 'groups', 'termStart', 'termEnd', 'email', 'bio', 'active'] as const) {
          const v = (dto as unknown as Record<string, unknown>)[k]
          if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)) patch[k] = v
        }
        await this.people.update(schoolId, match.id, patch, userId)
        updated += 1
      } else {
        const row = await this.people.create(schoolId, dto, userId)
        byName.set(normName(dto.name), { id: row.id, name: dto.name, email: dto.email ?? null })
        if (dto.email) byEmail.set(normEmail(dto.email), { id: row.id, name: dto.name, email: dto.email })
        created += 1
      }
    }
    return { created, updated, total: rows.length }
  }

  // ── Committees ──────────────────────────────────────────────────────────────

  async previewCommittees(
    schoolId: string,
    file: { buffer: Buffer; size?: number } | undefined,
    opts: { mapping?: ColumnOverride | null } = {},
  ): Promise<CommitteesPreview> {
    const { records, columns, warnings, table, problem } = this.readCommittees(file, opts.mapping ?? null)
    if (problem) {
      return { columns, summary: { committees: 0, newCommittees: 0, members: 0, newPeople: 0, skipped: 0 }, warnings, rows: [], table, problem }
    }
    const [committees, people] = await Promise.all([
      this.prisma.committee.findMany({ where: { schoolId }, select: { id: true, name: true } }),
      this.prisma.governancePerson.findMany({ where: { schoolId }, select: { id: true, name: true, email: true } }),
    ])
    const committeeByName = new Map(committees.map((c) => [normName(c.name), c]))
    const personByName = new Map(people.map((p) => [normName(p.name), p]))
    const personByEmail = new Map(people.filter((p) => p.email).map((p) => [normEmail(p.email), p]))
    const seenCommittees = new Set<string>()
    const newPeople = new Set<string>()
    const rows: CommitteePreviewRow[] = records.map((r) => {
      const issues: string[] = []
      const key = normName(r.committee)
      const committeeAction = committeeByName.has(key) ? 'existing' : 'new'
      seenCommittees.add(key)
      let personAction: CommitteePreviewRow['personAction'] = 'none'
      if (r.member) {
        const found = (r.email && personByEmail.get(normEmail(r.email))) || personByName.get(normName(r.member))
        personAction = found ? 'existing' : 'new'
        if (!found) newPeople.add(normName(r.member))
      }
      return {
        row: r.row,
        committee: r.committee,
        committeeAction,
        member: r.member || null,
        role: r.role,
        personAction,
        entry: this.toCommitteeDto(r),
        issues,
      }
    })
    return {
      columns,
      summary: {
        committees: seenCommittees.size,
        newCommittees: [...seenCommittees].filter((k) => !committeeByName.has(k)).length,
        members: rows.filter((r) => r.member).length,
        newPeople: newPeople.size,
        skipped: rows.filter((r) => r.issues.length).length,
      },
      warnings,
      rows,
      table,
      problem: null,
    }
  }

  /**
   * Merge: create committees we can't match by name, create people we can't
   * match (as board members — a committee roster is a board list), add each
   * membership (a repeat is "already a member", counted, never an error).
   */
  async commitCommittees(schoolId: string, rows: CommitteeImportRowDto[], userId: string) {
    const [committees, people] = await Promise.all([
      this.prisma.committee.findMany({ where: { schoolId }, select: { id: true, name: true } }),
      this.prisma.governancePerson.findMany({ where: { schoolId }, select: { id: true, name: true, email: true } }),
    ])
    const committeeByName = new Map(committees.map((c) => [normName(c.name), c.id]))
    const personByName = new Map(people.map((p) => [normName(p.name), p.id]))
    const personByEmail = new Map(people.filter((p) => p.email).map((p) => [normEmail(p.email), p.id]))
    let committeesCreated = 0
    let peopleCreated = 0
    let membershipsAdded = 0
    let alreadyMembers = 0
    for (const r of rows) {
      const ckey = normName(r.committee)
      let committeeId = committeeByName.get(ckey)
      if (!committeeId) {
        const c = await this.committees.create(
          schoolId,
          { name: r.committee.trim(), kind: r.kind ?? 'other', description: r.description ?? null },
          userId,
        )
        committeeId = c.id
        committeeByName.set(ckey, c.id)
        committeesCreated += 1
      }
      const member = (r.member ?? '').trim()
      if (!member) continue
      let personId = (r.email && personByEmail.get(normEmail(r.email))) || personByName.get(normName(member))
      if (!personId) {
        const p = await this.people.create(schoolId, { name: member, groups: ['board'], email: r.email || null }, userId)
        personId = p.id
        personByName.set(normName(member), p.id)
        if (r.email) personByEmail.set(normEmail(r.email), p.id)
        peopleCreated += 1
      }
      try {
        await this.people.addMember(schoolId, committeeId, { personId, role: r.role ?? 'member' }, userId)
        membershipsAdded += 1
      } catch (e) {
        if (e instanceof ConflictException) alreadyMembers += 1
        else throw e
      }
    }
    return { committeesCreated, peopleCreated, membershipsAdded, alreadyMembers, total: rows.length }
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private sheet(file: { buffer: Buffer; size?: number } | undefined) {
    if (!file?.buffer || file.buffer.length === 0) throw new BadRequestException('No file uploaded.')
    let read
    try {
      read = readTable(file.buffer)
    } catch (e) {
      throw new BadRequestException((e as Error).message)
    }
    const sheet = mainSheet(read)
    if (!sheet) throw new BadRequestException('The file is empty — no header row or rows were found.')
    const warnings: string[] = []
    if (read.sheets.length > 1 && sheet.name) {
      warnings.push(`This workbook has ${read.sheets.length} sheets — we read “${sheet.name}” (the one with the most rows).`)
    }
    return { sheet, warnings }
  }

  private readPeople(file: { buffer: Buffer; size?: number } | undefined, defaultGroup: PersonGroup, mapping: ColumnOverride | null) {
    const { sheet, warnings } = this.sheet(file)
    const read = peopleFromSheet(sheet, defaultGroup, mapping)
    const label = (key: string) => PEOPLE_FIELDS.find((f) => f.key === key)?.label ?? key
    const columns = read.columns.matches.map((m) => ({ field: label(m.key), header: m.header }))
    const table = importTable(sheet, PEOPLE_FIELDS, read.columns, 'a name (one “Name” column, or “First name” + “Last name”)')
    return { records: read.records, columns, warnings, table, problem: read.problem }
  }

  private readCommittees(file: { buffer: Buffer; size?: number } | undefined, mapping: ColumnOverride | null) {
    const { sheet, warnings } = this.sheet(file)
    const read = committeesFromSheet(sheet, mapping)
    const label = (key: string) => COMMITTEE_FIELDS.find((f) => f.key === key)?.label ?? key
    const columns = read.columns.matches.map((m) => ({ field: label(m.key), header: m.header }))
    const table = importTable(sheet, COMMITTEE_FIELDS, read.columns, 'a committee name column')
    return { records: read.records, columns, warnings, table, problem: read.problem }
  }

  private toPersonDto(r: PersonRecord): { person: CreatePersonDto; issues: string[] } {
    const issues: string[] = []
    const termStart = isoDateFromText(r.termStart)
    const termEnd = isoDateFromText(r.termEnd)
    if (termStart === undefined) issues.push(`row ${r.row}: couldn’t read the term start “${r.termStart}”`)
    if (termEnd === undefined) issues.push(`row ${r.row}: couldn’t read the term end “${r.termEnd}”`)
    if (termStart && termEnd && termEnd < termStart) issues.push(`row ${r.row}: the term ends before it starts`)
    const email = r.email.trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push(`row ${r.row}: “${email}” doesn’t look like an email`)
    return {
      person: {
        name: r.name,
        title: r.title || null,
        groups: [r.group],
        termStart: termStart ?? null,
        termEnd: termEnd ?? null,
        email: email || null,
        bio: r.bio || null,
        active: r.active,
      },
      issues,
    }
  }

  private toCommitteeDto(r: CommitteeMemberRecord): CommitteeImportRowDto {
    return {
      committee: r.committee,
      kind: r.kind,
      description: r.description || null,
      member: r.member || null,
      role: r.role,
      email: r.email || null,
    }
  }
}

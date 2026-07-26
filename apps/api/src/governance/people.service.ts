import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { CommitteeMembership, GovernancePerson } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { DocumentsService, type DocumentPublic } from '../knowledge/documents.service.js'
import {
  MEMBER_ROLES,
  type AddMemberDto,
  type CreatePersonDto,
  type ListPeopleQueryDto,
  type MemberRole,
  type UpdateMemberDto,
  type UpdatePersonDto,
} from './dto/person.dto.js'

/** One governance person as returned to the client (list + create/update). */
export interface PersonPublic {
  id: string
  schoolId: string
  name: string
  title: string | null
  groups: string[]
  termStart: string | null
  termEnd: string | null
  email: string | null
  bio: string | null
  active: boolean
  userId: string | null
  /** COUNT of committee memberships (grouped query — never N+1). */
  membershipCount: number
  /** COUNT of knowledge documents linked sourceType='governance_person'. */
  documentCount: number
  createdAt: string
  updatedAt: string
}

/** Person detail = PersonPublic + resolved memberships + linked documents. */
export interface PersonDetail extends PersonPublic {
  memberships: { id: string; committeeId: string; committeeName: string; role: string }[]
  documents: DocumentPublic[]
}

/** One committee membership as returned to the client (committee-centric routes). */
export interface MemberPublic {
  id: string
  committeeId: string
  personId: string
  role: string
  createdAt: string
  person: {
    id: string
    name: string
    title: string | null
    email: string | null
    groups: string[]
    active: boolean
  }
}

/** Deterministic member ordering: chair → vice_chair → secretary → member, then name. */
const ROLE_ORDER: Record<string, number> = { chair: 0, vice_chair: 1, secretary: 2, member: 3 }

/** Parse an incoming ISO date string to a UTC-midnight Date, or throw. Null passes. */
function parseIsoDate(s: string | null | undefined, field: string): Date | null | undefined {
  if (s === undefined) return undefined
  if (s === null) return null
  const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid ${field}: ${s}.`)
  return d
}

function normalizeRole(role: string | undefined): MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(role ?? '')
    ? (role as MemberRole)
    : 'member'
}

/**
 * Governance Phase 2 — the PEOPLE register service (people CRUD + ALL committee-
 * membership persistence, per the frozen spec). School-scoped, mirrors
 * CommitteesService: TENANT ISOLATION is enforced on EVERY query — reads filter
 * by `schoolId`, and every by-id op resolves `where { id, schoolId }` first, so a
 * cross-tenant personId/committeeId/membershipId is a 404, never a mutation.
 *
 * Credential documents live in the CORE knowledge store (sourceType
 * 'governance_person', sourceRef=personId) — this service only COUNTS/LISTS them
 * (via one grouped query / the existing DocumentsService), it never writes them.
 * Deleting a person cascades memberships (FK) but leaves documents untouched
 * (acceptable orphan — matches every other sourceRef delete).
 */
@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly documents: DocumentsService,
  ) {}

  private toPublic(
    row: GovernancePerson,
    membershipCount: number,
    documentCount: number,
  ): PersonPublic {
    return {
      id: row.id,
      schoolId: row.schoolId,
      name: row.name,
      title: row.title,
      groups: row.groups ?? [],
      termStart: row.termStart ? row.termStart.toISOString() : null,
      termEnd: row.termEnd ? row.termEnd.toISOString() : null,
      email: row.email,
      bio: row.bio,
      active: row.active,
      userId: row.userId,
      membershipCount,
      documentCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** Document counts for a set of people — ONE grouped query (no N+1). */
  private async documentCounts(
    schoolId: string,
    personIds: string[],
  ): Promise<Map<string, number>> {
    if (personIds.length === 0) return new Map()
    const grouped = await this.prisma.knowledgeDocument.groupBy({
      by: ['sourceRef'],
      where: { schoolId, sourceType: 'governance_person', sourceRef: { in: personIds } },
      _count: { _all: true },
    })
    return new Map(
      grouped
        .filter((g) => g.sourceRef !== null)
        .map((g) => [g.sourceRef as string, g._count._all]),
    )
  }

  /** List people for one school (optional group/active filters), active-first then name. */
  async list(schoolId: string, query: ListPeopleQueryDto): Promise<PersonPublic[]> {
    const rows = await this.prisma.governancePerson.findMany({
      where: {
        schoolId,
        ...(query.group ? { groups: { has: query.group } } : {}),
        ...(query.active !== undefined ? { active: query.active === 'true' } : {}),
      },
      include: { _count: { select: { memberships: true } } },
    })
    const docCounts = await this.documentCounts(schoolId, rows.map((r) => r.id))
    return rows
      .map((r) => this.toPublic(r, r._count.memberships, docCounts.get(r.id) ?? 0))
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1
        const n = a.name.localeCompare(b.name)
        return n !== 0 ? n : a.id.localeCompare(b.id)
      })
  }

  /** Service-side cross-field rule the DTO cannot express: termEnd >= termStart. */
  private assertTermOrder(termStart: Date | null, termEnd: Date | null): void {
    if (termStart && termEnd && termEnd.getTime() < termStart.getTime()) {
      throw new BadRequestException('termEnd must not be before termStart.')
    }
  }

  /**
   * A linked app user must be an ACTIVE MEMBER of this school (the house rule —
   * clone of StrategyService.assertOwnerIsMember / TasksService.assertAssigneeIsMember).
   * Prevents cross-tenant user linking and turns a would-be P2003 500 into a 400.
   */
  private async assertLinkedUserIsMember(schoolId: string, linkedUserId: string): Promise<void> {
    const m = await this.prisma.membership.findFirst({
      where: { schoolId, userId: linkedUserId, status: 'active' },
    })
    if (!m) throw new BadRequestException('Linked user must be an active member of this school.')
  }

  async create(schoolId: string, dto: CreatePersonDto, userId: string): Promise<PersonPublic> {
    const termStart = parseIsoDate(dto.termStart, 'termStart') ?? null
    const termEnd = parseIsoDate(dto.termEnd, 'termEnd') ?? null
    this.assertTermOrder(termStart, termEnd)
    if (dto.userId != null) await this.assertLinkedUserIsMember(schoolId, dto.userId)
    const row = await this.prisma.governancePerson.create({
      data: {
        schoolId,
        name: dto.name,
        title: dto.title ?? null,
        groups: dto.groups ?? [],
        termStart,
        termEnd,
        email: dto.email ?? null,
        bio: dto.bio ?? null,
        active: dto.active ?? true,
        userId: dto.userId ?? null,
        updatedByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'governance.person.created',
      targetType: 'governance_people',
      targetId: row.id,
    })
    return this.toPublic(row, 0, 0)
  }

  async update(
    schoolId: string,
    personId: string,
    dto: UpdatePersonDto,
    userId: string,
  ): Promise<PersonPublic> {
    // Tenant-safe ownership check: a foreign/unknown id is a 404, never a mutation.
    const existing = await this.prisma.governancePerson.findFirst({
      where: { id: personId, schoolId },
      include: { _count: { select: { memberships: true } } },
    })
    if (!existing) throw new NotFoundException('Person not found.')

    // Merge-pick: undefined = keep, explicit null = clear (for nullable fields).
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    const termStart = pick(parseIsoDate(dto.termStart, 'termStart'), existing.termStart)
    const termEnd = pick(parseIsoDate(dto.termEnd, 'termEnd'), existing.termEnd)
    this.assertTermOrder(termStart, termEnd)
    if (dto.userId != null) await this.assertLinkedUserIsMember(schoolId, dto.userId)

    const row = await this.prisma.governancePerson.update({
      where: { id: existing.id },
      data: {
        name: pick(dto.name, existing.name),
        title: pick(dto.title, existing.title),
        groups: pick(dto.groups, existing.groups),
        termStart,
        termEnd,
        email: pick(dto.email, existing.email),
        bio: pick(dto.bio, existing.bio),
        active: pick(dto.active, existing.active),
        userId: pick(dto.userId, existing.userId),
        updatedByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'governance.person.updated',
      targetType: 'governance_people',
      targetId: row.id,
    })
    const docCounts = await this.documentCounts(schoolId, [row.id])
    return this.toPublic(row, existing._count.memberships, docCounts.get(row.id) ?? 0)
  }

  async remove(schoolId: string, personId: string, userId: string): Promise<{ ok: true }> {
    const existing = await this.prisma.governancePerson.findFirst({
      where: { id: personId, schoolId },
    })
    if (!existing) throw new NotFoundException('Person not found.')
    // FK CASCADE removes memberships; linked knowledge documents are KEPT (frozen
    // decision — matches every other sourceRef delete; acceptable orphan).
    await this.prisma.governancePerson.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'governance.person.deleted',
      targetType: 'governance_people',
      targetId: existing.id,
    })
    return { ok: true }
  }

  /** Person detail — PersonPublic + memberships (with committee names) + documents. */
  async detail(schoolId: string, personId: string): Promise<PersonDetail> {
    const row = await this.prisma.governancePerson.findFirst({
      where: { id: personId, schoolId },
      include: {
        memberships: { include: { committee: { select: { name: true } } } },
      },
    })
    if (!row) throw new NotFoundException('Person not found.')
    // EXACT document objects the knowledge list returns (unchanged shape).
    const { documents } = await this.documents.listDocuments(schoolId, {
      sourceType: 'governance_person',
      sourceRef: personId,
    })
    const memberships = row.memberships
      .map((m) => ({
        id: m.id,
        committeeId: m.committeeId,
        committeeName: m.committee.name,
        role: m.role,
      }))
      .sort((a, b) => {
        const r = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
        return r !== 0 ? r : a.committeeName.localeCompare(b.committeeName)
      })
    return {
      ...this.toPublic(row, row.memberships.length, documents.length),
      memberships,
      documents,
    }
  }

  // ── Committee membership (committee-centric routes live on the committees
  //    controller; ALL persistence logic lives here — the frozen split) ─────────

  private toMember(
    m: CommitteeMembership & {
      person: Pick<GovernancePerson, 'id' | 'name' | 'title' | 'email' | 'groups' | 'active'>
    },
  ): MemberPublic {
    return {
      id: m.id,
      committeeId: m.committeeId,
      personId: m.personId,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
      person: {
        id: m.person.id,
        name: m.person.name,
        title: m.person.title,
        email: m.person.email,
        groups: m.person.groups ?? [],
        active: m.person.active,
      },
    }
  }

  private sortMembers(members: MemberPublic[]): MemberPublic[] {
    return members.sort((a, b) => {
      const r = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
      if (r !== 0) return r
      const n = a.person.name.localeCompare(b.person.name)
      return n !== 0 ? n : a.id.localeCompare(b.id)
    })
  }

  /** Resolve a committee ∈ the path school or 404 (mirror Meeting.committeeId check). */
  private async resolveCommittee(schoolId: string, committeeId: string): Promise<{ id: string }> {
    const committee = await this.prisma.committee.findFirst({
      where: { id: committeeId, schoolId },
      select: { id: true },
    })
    if (!committee) throw new NotFoundException('Committee not found.')
    return committee
  }

  /** List a committee's members: chair → vice_chair → secretary → member, then name. */
  async listMembers(schoolId: string, committeeId: string): Promise<MemberPublic[]> {
    await this.resolveCommittee(schoolId, committeeId)
    const rows = await this.prisma.committeeMembership.findMany({
      where: { schoolId, committeeId },
      include: {
        person: {
          select: { id: true, name: true, title: true, email: true, groups: true, active: true },
        },
      },
    })
    return this.sortMembers(rows.map((m) => this.toMember(m)))
  }

  async addMember(
    schoolId: string,
    committeeId: string,
    dto: AddMemberDto,
    userId: string,
  ): Promise<MemberPublic> {
    // BOTH the committee AND the person must belong to the path school (404 else).
    await this.resolveCommittee(schoolId, committeeId)
    const person = await this.prisma.governancePerson.findFirst({
      where: { id: dto.personId, schoolId },
      select: { id: true },
    })
    if (!person) throw new NotFoundException('Person not found.')

    // Explicit duplicate check → clean 409 (the DB unique index is the backstop).
    const dup = await this.prisma.committeeMembership.findUnique({
      where: { committeeId_personId: { committeeId, personId: dto.personId } },
    })
    if (dup) throw new ConflictException('This person is already a member of the committee.')

    let row
    try {
      row = await this.prisma.committeeMembership.create({
        data: {
          schoolId,
          committeeId,
          personId: dto.personId,
          role: normalizeRole(dto.role),
        },
        include: {
          person: {
            select: { id: true, name: true, title: true, email: true, groups: true, active: true },
          },
        },
      })
    } catch (err) {
      // Race backstop: the unique index fired between check and create → same 409.
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('This person is already a member of the committee.')
      }
      throw err
    }
    await this.audit.write({
      schoolId,
      userId,
      action: 'governance.committee_member.added',
      targetType: 'governance_committee_memberships',
      targetId: row.id,
    })
    return this.toMember(row)
  }

  async updateMemberRole(
    schoolId: string,
    committeeId: string,
    membershipId: string,
    dto: UpdateMemberDto,
    userId: string,
  ): Promise<MemberPublic> {
    const existing = await this.prisma.committeeMembership.findFirst({
      where: { id: membershipId, committeeId, schoolId },
    })
    if (!existing) throw new NotFoundException('Membership not found.')
    const row = await this.prisma.committeeMembership.update({
      where: { id: existing.id },
      data: { role: normalizeRole(dto.role) },
      include: {
        person: {
          select: { id: true, name: true, title: true, email: true, groups: true, active: true },
        },
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'governance.committee_member.role_changed',
      targetType: 'governance_committee_memberships',
      targetId: row.id,
    })
    return this.toMember(row)
  }

  async removeMember(
    schoolId: string,
    committeeId: string,
    membershipId: string,
    userId: string,
  ): Promise<{ ok: true }> {
    const existing = await this.prisma.committeeMembership.findFirst({
      where: { id: membershipId, committeeId, schoolId },
    })
    if (!existing) throw new NotFoundException('Membership not found.')
    await this.prisma.committeeMembership.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'governance.committee_member.removed',
      targetType: 'governance_committee_memberships',
      targetId: existing.id,
    })
    return { ok: true }
  }
}

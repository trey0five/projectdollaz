import { Injectable, NotFoundException } from '@nestjs/common'
import type { Committee } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { CreateCommitteeDto } from './dto/create-committee.dto.js'
import type { UpdateCommitteeDto } from './dto/update-committee.dto.js'

/** One committee as returned to the client. */
export interface CommitteePublic {
  id: string
  name: string
  kind: string
  description: string | null
  chair: string | null
  active: boolean
  createdAt: string
  updatedAt: string
  /**
   * Phase 2 ADDITIVE list-only fields (absent on create/update responses — the
   * pre-Phase-2 shapes stay byte-identical). chairPersonName = the chair-ROLE
   * membership's person name (the read-side effective chair; the legacy free-text
   * `chair` string above is still returned untouched).
   */
  memberCount?: number
  chairPersonName?: string | null
}

export interface CommitteeListResponse {
  committees: CommitteePublic[]
}

/**
 * Phase 3 Governance depth — the COMMITTEE register service. School-scoped, mirrors
 * PoliciesService: TENANT ISOLATION is enforced on EVERY query — reads filter by
 * `schoolId`, and update/delete first resolve the row `where { id, schoolId }`, so
 * a committeeId owned by another school resolves to null → NotFoundException and a
 * cross-tenant mutation is IMPOSSIBLE.
 */
@Injectable()
export class CommitteesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toPublic(row: Committee): CommitteePublic {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      description: row.description,
      chair: row.chair,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /**
   * List all committees for one school, deterministically ordered (active first).
   * Phase 2 ADDITIVE: each row gains memberCount + chairPersonName (name of the
   * chair-role member, if any) — everything else is byte-identical, and the
   * legacy `chair` string is still returned untouched.
   */
  async list(schoolId: string): Promise<CommitteeListResponse> {
    const rows = await this.prisma.committee.findMany({
      where: { schoolId },
      include: {
        _count: { select: { memberships: true } },
        memberships: {
          where: { role: 'chair' },
          // Deterministic when a committee has 2+ chair-role members: pick the
          // alphabetically-first name — the SAME tie-break the governance report
          // uses (role-then-name sort), so list and report never disagree.
          orderBy: { person: { name: 'asc' } },
          take: 1,
          include: { person: { select: { name: true } } },
        },
      },
    })
    const committees = rows
      .map((r) => ({
        ...this.toPublic(r),
        memberCount: r._count?.memberships ?? 0,
        chairPersonName: r.memberships?.[0]?.person.name ?? null,
      }))
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1
        const n = a.name.localeCompare(b.name)
        return n !== 0 ? n : a.id.localeCompare(b.id)
      })
    return { committees }
  }

  async create(
    schoolId: string,
    dto: CreateCommitteeDto,
    userId: string,
  ): Promise<CommitteePublic> {
    const row = await this.prisma.committee.create({
      data: {
        schoolId,
        name: dto.name,
        kind: dto.kind ?? 'other',
        description: dto.description ?? null,
        chair: dto.chair ?? null,
        active: dto.active ?? true,
        updatedByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'governance.committee.created',
      targetType: 'governance_committees',
      targetId: row.id,
    })
    return this.toPublic(row)
  }

  async update(
    schoolId: string,
    committeeId: string,
    dto: UpdateCommitteeDto,
    userId: string,
  ): Promise<CommitteePublic> {
    // Tenant-safe ownership check: a foreign/unknown id is a 404, never a mutation.
    const existing = await this.prisma.committee.findFirst({
      where: { id: committeeId, schoolId },
    })
    if (!existing) throw new NotFoundException('Committee not found.')

    // Merge-pick: undefined = keep, explicit null = clear (for nullable fields).
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    const row = await this.prisma.committee.update({
      where: { id: existing.id },
      data: {
        name: pick(dto.name, existing.name),
        kind: pick(dto.kind, existing.kind),
        description: pick(dto.description, existing.description),
        chair: pick(dto.chair, existing.chair),
        active: pick(dto.active, existing.active),
        updatedByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'governance.committee.updated',
      targetType: 'governance_committees',
      targetId: row.id,
    })
    return this.toPublic(row)
  }

  async remove(schoolId: string, committeeId: string, userId: string): Promise<{ id: string }> {
    const existing = await this.prisma.committee.findFirst({
      where: { id: committeeId, schoolId },
    })
    if (!existing) throw new NotFoundException('Committee not found.')
    // FK onDelete:SetNull nulls each meeting.committeeId — meeting history preserved.
    await this.prisma.committee.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'governance.committee.deleted',
      targetType: 'governance_committees',
      targetId: existing.id,
    })
    return { id: existing.id }
  }
}

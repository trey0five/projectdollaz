import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import {
  type CreateProfessionalDevelopmentDto,
  type ListProfessionalDevelopmentQueryDto,
  type UpdateProfessionalDevelopmentDto,
} from './dto/professional-development.dto.js'

/**
 * One PD record as returned on the REGISTER routes. Adult-staff PII (it names a
 * member of staff and what they attended) — owner/accountant only, viewer 403s.
 */
export interface ProfessionalDevelopmentPublic {
  id: string
  personId: string
  personName: string
  personTitle: string | null
  title: string
  /** yyyy-mm-dd. */
  activityDate: string
  hours: number | null
  category: string
  verified: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

/**
 * COUNTS ONLY — the `/summary` shape, and the only PD shape a viewer may read.
 *
 * PARTICIPATION IS PEOPLE, NOT RECORDS, and not money. `participants` counts
 * DISTINCT staff with at least one record in the look-back period: counting rows
 * would let one teacher with six workshops carry an entire faculty, which is the
 * same failure the register refuses in the other currency by having no cost
 * column at all.
 */
export interface PdSummary {
  /** Records in the look-back period. */
  total: number
  /** Active staff on the people register — the denominator. */
  staffCount: number
  /** DISTINCT staff with at least one record. */
  participants: number
  /** participants ÷ staffCount, or null when there are no staff to divide by. */
  participationRate: number | null
  byCategory: Record<string, number>
}

const iso = (d: Date): string => d.toISOString().slice(0, 10)

/** The participation look-back. One year, matching the twin signal's own period. */
const LOOKBACK_YEARS = 1

@Injectable()
export class ProfessionalDevelopmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(schoolId: string, query: ListProfessionalDevelopmentQueryDto) {
    const page = query.page ?? 1
    const pageSize = Math.min(query.pageSize ?? 50, 200)
    const where = {
      schoolId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.since ? { activityDate: { gte: new Date(query.since) } } : {}),
    }
    const [rows, total] = await Promise.all([
      this.prisma.professionalDevelopment.findMany({
        where,
        orderBy: [{ activityDate: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { person: { select: { name: true, title: true } } },
      }),
      this.prisma.professionalDevelopment.count({ where }),
    ])
    return { items: rows.map((r) => this.toPublic(r)), total, page, pageSize }
  }

  /** COUNTS ONLY. The one PD surface a viewer may read. */
  async summary(schoolId: string): Promise<PdSummary> {
    const since = new Date()
    since.setUTCFullYear(since.getUTCFullYear() - LOOKBACK_YEARS)
    const [staffCount, rows] = await Promise.all([
      this.prisma.governancePerson.count({
        where: { schoolId, active: true, groups: { has: 'staff' } },
      }),
      this.prisma.professionalDevelopment.findMany({
        where: { schoolId, activityDate: { gte: since } },
        select: { personId: true, category: true },
      }),
    ])
    const byCategory: Record<string, number> = {}
    for (const r of rows) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1
    const participants = new Set(rows.map((r) => r.personId)).size
    return {
      total: rows.length,
      staffCount,
      participants,
      // No staff on file ⇒ NO RATE. A share of nobody is not zero, and a zero here
      // would read as "nobody is being developed" for a school that has simply not
      // entered its staff yet.
      participationRate: staffCount > 0 ? participants / staffCount : null,
      byCategory,
    }
  }

  async get(schoolId: string, id: string): Promise<ProfessionalDevelopmentPublic> {
    const row = await this.prisma.professionalDevelopment.findFirst({
      where: { id, schoolId },
      include: { person: { select: { name: true, title: true } } },
    })
    if (!row) throw new NotFoundException('Professional-development record not found.')
    return this.toPublic(row)
  }

  async create(
    schoolId: string,
    dto: CreateProfessionalDevelopmentDto,
    userId: string,
  ): Promise<ProfessionalDevelopmentPublic> {
    await this.assertPerson(schoolId, dto.personId)
    const row = await this.prisma.professionalDevelopment.create({
      data: {
        schoolId,
        personId: dto.personId,
        title: dto.title,
        activityDate: new Date(dto.activityDate),
        hours: dto.hours ?? null,
        category: dto.category ?? 'other',
        verified: dto.verified ?? false,
        notes: dto.notes ?? null,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
      include: { person: { select: { name: true, title: true } } },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'hr.professional_development.created',
      targetType: 'professional_development',
      targetId: row.id,
      // Ids and a category. Never the person, never the activity title.
      metadata: { category: row.category },
    })
    return this.toPublic(row)
  }

  async update(
    schoolId: string,
    id: string,
    dto: UpdateProfessionalDevelopmentDto,
    userId: string,
  ): Promise<ProfessionalDevelopmentPublic> {
    const existing = await this.prisma.professionalDevelopment.findFirst({
      where: { id, schoolId },
      select: { id: true },
    })
    if (!existing) throw new NotFoundException('Professional-development record not found.')
    const row = await this.prisma.professionalDevelopment.update({
      where: { id: existing.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.activityDate !== undefined ? { activityDate: new Date(dto.activityDate) } : {}),
        ...(dto.hours !== undefined ? { hours: dto.hours } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.verified !== undefined ? { verified: dto.verified } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        updatedByUserId: userId,
      },
      include: { person: { select: { name: true, title: true } } },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'hr.professional_development.updated',
      targetType: 'professional_development',
      targetId: row.id,
      metadata: { category: row.category },
    })
    return this.toPublic(row)
  }

  async remove(schoolId: string, id: string, userId: string): Promise<{ deleted: boolean }> {
    const existing = await this.prisma.professionalDevelopment.findFirst({
      where: { id, schoolId },
      select: { id: true, category: true },
    })
    if (!existing) throw new NotFoundException('Professional-development record not found.')
    await this.prisma.professionalDevelopment.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'hr.professional_development.deleted',
      targetType: 'professional_development',
      targetId: id,
      metadata: { category: existing.category },
    })
    return { deleted: true }
  }

  private async assertPerson(schoolId: string, personId: string): Promise<void> {
    const person = await this.prisma.governancePerson.findFirst({
      where: { id: personId, schoolId },
      select: { id: true },
    })
    if (!person) throw new NotFoundException('That person is not on this school’s people register.')
  }

  private toPublic(row: {
    id: string
    personId: string
    title: string
    activityDate: Date
    hours: unknown
    category: string
    verified: boolean
    notes: string | null
    createdAt: Date
    updatedAt: Date
    person: { name: string; title: string | null }
  }): ProfessionalDevelopmentPublic {
    return {
      id: row.id,
      personId: row.personId,
      personName: row.person.name,
      personTitle: row.person.title,
      title: row.title,
      activityDate: iso(row.activityDate),
      hours: row.hours == null ? null : Number(row.hours),
      category: row.category,
      verified: row.verified,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}

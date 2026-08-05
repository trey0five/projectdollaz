import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import {
  CLEARANCE_IMPORT_MAX_ROWS,
  type ClearanceImportRowDto,
  type CreateClearanceDto,
  type ListClearancesQueryDto,
  type UpdateClearanceDto,
} from './dto/clearance.dto.js'

/**
 * One clearance row as returned on the REGISTER routes.
 *
 * THE MOST SENSITIVE SHAPE IN THE PRODUCT. `personName` says which adult a
 * background check belongs to, and this shape is reachable ONLY from the
 * owner/accountant routes — viewer gets 403, which is stricter than governance,
 * facilities or advancement, all of which let a viewer read.
 *
 * Nothing else in the platform sees it: the twin selects two date columns, the
 * rule's evidence is four counts, and the briefing, Penny, every export and every
 * alert render only that finding.
 */
export interface ClearancePublic {
  id: string
  personId: string
  /** JOINED from GovernancePerson. PII — owner/accountant routes only. */
  personName: string
  personTitle: string | null
  kind: string
  /** yyyy-mm-dd. */
  issuedOn: string
  /** yyyy-mm-dd, or null when this clearance does not expire. */
  expiresOn: string | null
  verifiedBy: string | null
  source: string
  externalRef: string | null
  notes: string | null
  /** COMPUTED against the server clock — never stored. */
  isLapsed: boolean
  /** Whole days past `expiresOn` when lapsed; null otherwise. */
  daysLapsed: number | null
  createdAt: string
  updatedAt: string
}

/**
 * COUNTS ONLY — the `/summary` shape, and the ONLY clearance shape a viewer may
 * read. No id, no personId, no name, and no per-kind breakdown of WHO: a board
 * viewer has a legitimate interest in "three clearances have lapsed" and none
 * whatsoever in which three people they belong to.
 */
export interface ClearanceSummary {
  total: number
  lapsed: number
  expiringSoon: number
  oldestLapsedDays: number
  byKind: Record<string, number>
}

const DAY_MS = 86_400_000
const iso = (d: Date): string => d.toISOString().slice(0, 10)

/** Days from `a` (yyyy-mm-dd) to `b`; positive when b is later. */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)
}

@Injectable()
export class ClearancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * `expiringSoon` uses the SAME look-ahead the twin rule quotes in its evidence.
   * Hard-coded here rather than imported from the compliance package on purpose:
   * this is the register's own convenience filter, and it is spec-pinned to the
   * frozen threshold so the two cannot silently disagree.
   */
  static readonly EXPIRING_SOON_DAYS = 60

  async list(schoolId: string, query: ListClearancesQueryDto) {
    const page = query.page ?? 1
    const pageSize = Math.min(query.pageSize ?? 50, 200)
    const today = iso(new Date())
    const where = {
      schoolId,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.lapsedOnly ? { expiresOn: { lt: new Date(`${today}T00:00:00Z`) } } : {}),
    }
    const [rows, total] = await Promise.all([
      this.prisma.clearance.findMany({
        where,
        orderBy: [{ expiresOn: 'asc' }, { issuedOn: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { person: { select: { name: true, title: true } } },
      }),
      this.prisma.clearance.count({ where }),
    ])
    return { items: rows.map((r) => this.toPublic(r, today)), total, page, pageSize }
  }

  /** COUNTS ONLY. The one clearance surface a viewer may read. */
  async summary(schoolId: string): Promise<ClearanceSummary> {
    const rows = await this.prisma.clearance.findMany({
      where: { schoolId },
      select: { kind: true, expiresOn: true },
    })
    const today = iso(new Date())
    const byKind: Record<string, number> = {}
    let lapsed = 0
    let expiringSoon = 0
    let oldest = 0
    for (const r of rows) {
      byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
      if (!r.expiresOn) continue
      const days = daysBetween(iso(r.expiresOn), today)
      if (days > 0) {
        lapsed++
        if (days > oldest) oldest = days
      } else if (-days <= ClearancesService.EXPIRING_SOON_DAYS) {
        expiringSoon++
      }
    }
    return { total: rows.length, lapsed, expiringSoon, oldestLapsedDays: oldest, byKind }
  }

  async get(schoolId: string, id: string): Promise<ClearancePublic> {
    const row = await this.prisma.clearance.findFirst({
      where: { id, schoolId },
      include: { person: { select: { name: true, title: true } } },
    })
    if (!row) throw new NotFoundException('Clearance not found.')
    return this.toPublic(row, iso(new Date()))
  }

  async create(schoolId: string, dto: CreateClearanceDto, userId: string): Promise<ClearancePublic> {
    await this.assertPerson(schoolId, dto.personId)
    this.assertDates(dto.issuedOn, dto.expiresOn ?? null)
    const row = await this.prisma.clearance
      .create({
        data: {
          schoolId,
          personId: dto.personId,
          kind: dto.kind,
          issuedOn: new Date(dto.issuedOn),
          expiresOn: dto.expiresOn ? new Date(dto.expiresOn) : null,
          verifiedBy: dto.verifiedBy ?? null,
          externalRef: dto.externalRef ?? null,
          notes: dto.notes ?? null,
          source: 'manual',
          createdByUserId: userId,
          updatedByUserId: userId,
        },
        include: { person: { select: { name: true, title: true } } },
      })
      .catch((e: unknown) => {
        throw this.mapUniqueError(e)
      })
    // FERPA-equivalent discipline for adult staff: ids and counts, never a name.
    await this.audit.write({
      schoolId,
      userId,
      action: 'hr.clearance.created',
      targetType: 'clearance',
      targetId: row.id,
      metadata: { kind: row.kind },
    })
    return this.toPublic(row, iso(new Date()))
  }

  async update(
    schoolId: string,
    id: string,
    dto: UpdateClearanceDto,
    userId: string,
  ): Promise<ClearancePublic> {
    const existing = await this.prisma.clearance.findFirst({ where: { id, schoolId } })
    if (!existing) throw new NotFoundException('Clearance not found.')
    const issuedOn = dto.issuedOn ?? iso(existing.issuedOn)
    const expiresOn =
      dto.expiresOn !== undefined
        ? dto.expiresOn
        : existing.expiresOn
          ? iso(existing.expiresOn)
          : null
    this.assertDates(issuedOn, expiresOn)
    const row = await this.prisma.clearance
      .update({
        where: { id: existing.id },
        data: {
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.issuedOn !== undefined ? { issuedOn: new Date(dto.issuedOn) } : {}),
          ...(dto.expiresOn !== undefined
            ? { expiresOn: dto.expiresOn ? new Date(dto.expiresOn) : null }
            : {}),
          ...(dto.verifiedBy !== undefined ? { verifiedBy: dto.verifiedBy } : {}),
          ...(dto.externalRef !== undefined ? { externalRef: dto.externalRef } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          updatedByUserId: userId,
        },
        include: { person: { select: { name: true, title: true } } },
      })
      .catch((e: unknown) => {
        throw this.mapUniqueError(e)
      })
    await this.audit.write({
      schoolId,
      userId,
      action: 'hr.clearance.updated',
      targetType: 'clearance',
      targetId: row.id,
      metadata: { kind: row.kind },
    })
    return this.toPublic(row, iso(new Date()))
  }

  async remove(schoolId: string, id: string, userId: string): Promise<{ deleted: boolean }> {
    const existing = await this.prisma.clearance.findFirst({ where: { id, schoolId } })
    if (!existing) throw new NotFoundException('Clearance not found.')
    await this.prisma.clearance.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'hr.clearance.deleted',
      targetType: 'clearance',
      targetId: id,
      metadata: { kind: existing.kind },
    })
    return { deleted: true }
  }

  /**
   * THE PER-DIOCESE IMPORT. Idempotent on re-upload by construction.
   *
   * The identity of a clearance is (school, person, kind, issuedOn) — a database
   * unique index, not a convention — so uploading the same diocesan file twice
   * updates rather than duplicates. A RENEWAL carries a different issuedOn and is
   * correctly a new row, which is what keeps the history a history rather than
   * overwriting last year's certificate with this year's.
   *
   * PEOPLE ARE MATCHED, NEVER CREATED. A diocesan export carries no KYRO person
   * id and never will, so rows are matched by name against active staff. An
   * unmatched row is REPORTED, not invented: creating a staff record from a
   * spreadsheet would turn one mistyped name into a second employee carrying a
   * clean clearance, which is the exact failure this register exists to prevent.
   */
  async importRows(
    schoolId: string,
    rows: ClearanceImportRowDto[],
    userId: string,
  ): Promise<{ created: number; updated: number; unmatched: string[]; skipped: number }> {
    if (rows.length === 0) throw new BadRequestException('No rows to import.')
    if (rows.length > CLEARANCE_IMPORT_MAX_ROWS) {
      throw new BadRequestException(
        `This file has ${rows.length} rows, above the ${CLEARANCE_IMPORT_MAX_ROWS}-row limit for one import. Split it and upload the parts one after another — the import merges.`,
      )
    }
    const people = await this.prisma.governancePerson.findMany({
      where: { schoolId, active: true, groups: { has: 'staff' } },
      select: { id: true, name: true },
    })
    const byName = new Map(people.map((p) => [p.name.trim().toLowerCase(), p.id]))

    let created = 0
    let updated = 0
    let skipped = 0
    const unmatched = new Set<string>()

    for (const r of rows) {
      const personId = byName.get(r.personName.trim().toLowerCase())
      if (!personId) {
        // The NAME is reported back so the person can fix the spelling or add the
        // member of staff. It is shown to the owner/accountant who uploaded the
        // file and goes nowhere else — no audit row, no briefing, no export.
        unmatched.add(r.personName.trim())
        continue
      }
      if (r.expiresOn && r.expiresOn < r.issuedOn) {
        skipped++
        continue
      }
      const data = {
        expiresOn: r.expiresOn ? new Date(r.expiresOn) : null,
        externalRef: r.externalRef ?? null,
        source: 'import',
        updatedByUserId: userId,
      }
      const res = await this.prisma.clearance.upsert({
        where: {
          clearance_identity: {
            schoolId,
            personId,
            kind: r.kind,
            issuedOn: new Date(r.issuedOn),
          },
        },
        create: {
          schoolId,
          personId,
          kind: r.kind,
          issuedOn: new Date(r.issuedOn),
          createdByUserId: userId,
          ...data,
        },
        update: data,
        select: { createdAt: true, updatedAt: true },
      })
      if (res.createdAt.getTime() === res.updatedAt.getTime()) created++
      else updated++
    }

    await this.audit.write({
      schoolId,
      userId,
      action: 'hr.clearance.imported',
      targetType: 'clearance',
      targetId: schoolId,
      // COUNTS ONLY in the audit row — the unmatched NAMES are returned to the
      // uploader in the response and are never written down anywhere.
      metadata: { rows: rows.length, created, updated, unmatched: unmatched.size, skipped },
    })
    return { created, updated, unmatched: [...unmatched].sort(), skipped }
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private assertDates(issuedOn: string, expiresOn: string | null): void {
    if (expiresOn && expiresOn < issuedOn) {
      throw new BadRequestException('A clearance cannot expire before it was issued.')
    }
  }

  private async assertPerson(schoolId: string, personId: string): Promise<void> {
    const person = await this.prisma.governancePerson.findFirst({
      where: { id: personId, schoolId },
      select: { id: true },
    })
    if (!person) throw new NotFoundException('That person is not on this school’s people register.')
  }

  private mapUniqueError(e: unknown): Error {
    const code = (e as { code?: string })?.code
    if (code === 'P2002') {
      return new BadRequestException(
        'That person already has a clearance of this kind issued on that date. A renewal has a different issue date.',
      )
    }
    return e as Error
  }

  private toPublic(
    row: {
      id: string
      personId: string
      kind: string
      issuedOn: Date
      expiresOn: Date | null
      verifiedBy: string | null
      source: string
      externalRef: string | null
      notes: string | null
      createdAt: Date
      updatedAt: Date
      person: { name: string; title: string | null }
    },
    today: string,
  ): ClearancePublic {
    const expiresOn = row.expiresOn ? iso(row.expiresOn) : null
    const days = expiresOn ? daysBetween(expiresOn, today) : 0
    const isLapsed = expiresOn !== null && days > 0
    return {
      id: row.id,
      personId: row.personId,
      personName: row.person.name,
      personTitle: row.person.title,
      kind: row.kind,
      issuedOn: iso(row.issuedOn),
      expiresOn,
      verifiedBy: row.verifiedBy,
      source: row.source,
      externalRef: row.externalRef,
      notes: row.notes,
      isLapsed,
      daysLapsed: isLapsed ? days : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}

import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@finrep/db'
import type { PeriodOperationalData } from '@finrep/db'
import type { PeriodOperational } from '@finrep/analytics'
import { GRADE_KEYS } from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { UpsertOperationalDto } from './dto/upsert-operational.dto.js'

/** Public, JSON-safe shape returned to the client (Decimal -> number). */
export interface OperationalPublic {
  enrollment: number | null
  enrollmentFte: number | null
  studentsOnAid: number | null
  financialAidTotal: number | null
  /** Phase 5 — actual STAFF FTEs (distinct from the student-side enrollmentFte). */
  teachingFte: number | null
  totalStaffFte: number | null
  notes: string | null
  /** Phase 2 — anticipated incoming feeder students by grade; null when none. */
  feederEnrollmentByGrade: Record<string, number> | null
  updatedAt: string | null
}

function dec(v: Prisma.Decimal | null): number | null {
  return v === null ? null : Number(v)
}

/**
 * Coerce the stored feeder JSON column into a clean per-grade number map, keeping
 * only the 14 known GRADE_KEYS with finite non-negative values. Returns null when
 * nothing usable remains (so the form/print show "none entered" rather than {}).
 */
function coerceFeeder(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const src = v as Record<string, unknown>
  const out: Record<string, number> = {}
  for (const g of GRADE_KEYS) {
    const n = src[g]
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[g] = n
  }
  return Object.keys(out).length ? out : null
}

@Injectable()
export class OperationalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly audit: AuditService,
  ) {}

  private toPublic(row: PeriodOperationalData | null): OperationalPublic {
    if (!row) {
      return {
        enrollment: null,
        enrollmentFte: null,
        studentsOnAid: null,
        financialAidTotal: null,
        teachingFte: null,
        totalStaffFte: null,
        notes: null,
        feederEnrollmentByGrade: null,
        updatedAt: null,
      }
    }
    return {
      enrollment: row.enrollment,
      enrollmentFte: dec(row.enrollmentFte),
      studentsOnAid: row.studentsOnAid,
      financialAidTotal: dec(row.financialAidTotal),
      teachingFte: dec(row.teachingFte),
      totalStaffFte: dec(row.totalStaffFte),
      notes: row.notes,
      feederEnrollmentByGrade: coerceFeeder(row.feederEnrollmentByGrade),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** The raw row for a period, or null. */
  private async findRow(
    schoolId: string,
    fiscalPeriodId: string,
  ): Promise<PeriodOperationalData | null> {
    return this.prisma.periodOperationalData.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId } },
    })
  }

  /**
   * Operational data for one period as the pure analytics shape (Decimal ->
   * number). Returns null when no row exists. Consumed by AnalyticsService to feed
   * the Tier-2 metrics. No tenant check here — the caller (AnalyticsService) has
   * already resolved the owned period.
   */
  async operationalFor(
    schoolId: string,
    fiscalPeriodId: string,
  ): Promise<PeriodOperational | null> {
    const row = await this.findRow(schoolId, fiscalPeriodId)
    if (!row) return null
    return {
      enrollment: row.enrollment,
      enrollmentFte: dec(row.enrollmentFte),
      studentsOnAid: row.studentsOnAid,
      financialAidTotal: dec(row.financialAidTotal),
      // Phase 4 HR — surface the already-captured staff FTEs to the pure compute
      // layer (feeds student_teacher_ratio). Same dec() as toPublic on these cols.
      teachingFte: dec(row.teachingFte),
      totalStaffFte: dec(row.totalStaffFte),
    }
  }

  /** GET — tenant-checked read; returns the row or an all-nulls public shape. */
  async get(schoolId: string, periodId: string): Promise<OperationalPublic> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const row = await this.findRow(schoolId, period.id)
    return this.toPublic(row)
  }

  /**
   * PUT — tenant-checked upsert. Merges the partial DTO over the existing row,
   * enforces students_on_aid <= enrollment on the RESULTING row (so a PUT that
   * only sets one of the two is validated against the stored value), then upserts
   * and audits. Returns the saved public row.
   */
  async upsert(
    schoolId: string,
    periodId: string,
    dto: UpsertOperationalDto,
    userId: string,
  ): Promise<OperationalPublic> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const existing = await this.findRow(schoolId, period.id)

    // Merge: a field present in the DTO (incl. explicit null) overrides; absent
    // keeps the stored value. `undefined` = not provided in this PUT.
    const pick = <T>(dtoVal: T | undefined, current: T): T =>
      dtoVal === undefined ? current : dtoVal

    const enrollment = pick(dto.enrollment, existing?.enrollment ?? null)
    const studentsOnAid = pick(dto.studentsOnAid, existing?.studentsOnAid ?? null)

    // Cross-field rule on the resulting row.
    if (enrollment !== null && studentsOnAid !== null && studentsOnAid > enrollment) {
      throw new BadRequestException(
        `students_on_aid (${studentsOnAid}) cannot exceed enrollment (${enrollment}).`,
      )
    }

    const enrollmentFte = pick(
      dto.enrollmentFte,
      existing ? dec(existing.enrollmentFte) : null,
    )
    const financialAidTotal = pick(
      dto.financialAidTotal,
      existing ? dec(existing.financialAidTotal) : null,
    )

    // Phase 5 — STAFF FTEs (distinct from enrollmentFte). Cross-field on the
    // RESULTING row, mirroring the students_on_aid <= enrollment rule above.
    const teachingFte = pick(dto.teachingFte, existing ? dec(existing.teachingFte) : null)
    const totalStaffFte = pick(
      dto.totalStaffFte,
      existing ? dec(existing.totalStaffFte) : null,
    )
    if (teachingFte !== null && totalStaffFte !== null && teachingFte > totalStaffFte) {
      throw new BadRequestException(
        `teaching_fte (${teachingFte}) cannot exceed total_staff_fte (${totalStaffFte}).`,
      )
    }

    const notes = pick(dto.notes, existing?.notes ?? null)

    // Feeder column: merge-pick (omitted keeps stored, explicit null clears).
    // Write Prisma.JsonNull when null else the object, like other JSON columns.
    const feederMerged = pick(
      dto.feederEnrollmentByGrade as Record<string, number> | null | undefined,
      (existing?.feederEnrollmentByGrade as Record<string, number> | null) ?? null,
    )
    const feederWrite =
      feederMerged === null || feederMerged === undefined
        ? Prisma.JsonNull
        : (feederMerged as Prisma.InputJsonValue)

    const data = {
      enrollment,
      enrollmentFte,
      studentsOnAid,
      financialAidTotal,
      teachingFte,
      totalStaffFte,
      notes,
      feederEnrollmentByGrade: feederWrite,
      updatedByUserId: userId,
    }

    const row = await this.prisma.periodOperationalData.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
      create: { schoolId, fiscalPeriodId: period.id, ...data },
      update: data,
    })

    await this.audit.write({
      schoolId,
      userId,
      action: 'operational.updated',
      targetType: 'period_operational_data',
      targetId: row.id,
      metadata: { fiscalPeriodId: period.id, fields: Object.keys(dto) },
    })

    return this.toPublic(row)
  }
}

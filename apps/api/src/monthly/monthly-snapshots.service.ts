import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { FiscalPeriod, MonthlySnapshot, Prisma, User } from '@finrep/db'
import {
  ENGINE_VERSION,
  generateReports,
  type NormalizedRow,
  type ReportBundle,
  type SchoolConfig,
} from '@finrep/engine'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { MappingService } from '../mapping/mapping.service.js'
import type { CreateMonthlySnapshotDto } from './dto/create-monthly-snapshot.dto.js'
import { fyElapsed, fiscalYearStartOf, fyStartYearForPeriodEnd } from './fy-elapsed.js'

/** POST 201 response — payload/sourceRows are NOT echoed (lightweight). */
export interface CreateMonthlySnapshotResponse {
  monthKey: string
  sourceName: string
  rowCount: number
  uploadedBy: string | null
  engineVersion: string
  mappingVersion: string
  standardChartVersion: string
  createdAt: string
  updatedAt: string
  /** true when an existing month was overwritten (upsert hit update). */
  replaced: boolean
}

/** GET list summary — no payload/sourceRows. */
export interface MonthlySnapshotSummary {
  monthKey: string
  sourceName: string
  rowCount: number
  uploadedBy: string | null
  updatedAt: string
}

export interface MonthlySnapshotListResponse {
  fiscalYearStart: string
  months: MonthlySnapshotSummary[]
}

/**
 * Per-month engine ingest for MONTHLY actuals. Mirrors statements.service's
 * generate (load mapping/chart, build SchoolConfig, run generateReports) but
 * CY-ONLY (pyData:[], auditData:[]) and upserts on (fiscalPeriodId, monthKey) so
 * re-uploading a month REPLACES it. Purely additive — never touches the annual
 * Import/StatementSnapshot path.
 */
@Injectable()
export class MonthlySnapshotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly periods: PeriodsService,
    private readonly mapping: MappingService,
  ) {}

  /**
   * Validate monthKey, run the engine CY-only, and upsert the month's snapshot.
   * monthKey must be 'YYYY-MM' (DTO-validated) AND fall inside the target
   * period's fiscal year (Jul–Jun derived from period.periodEndDate) — else 400.
   */
  async create(
    actor: User,
    schoolId: string,
    periodId: string,
    dto: CreateMonthlySnapshotDto,
  ): Promise<CreateMonthlySnapshotResponse> {
    const period: FiscalPeriod = await this.periods.getOwnedPeriod(schoolId, periodId)

    // monthKey must be inside the period's FY. A monthKey encodes its OWN FY; we
    // require that FY to equal the FY the period-end belongs to.
    const monthFyStart = fyElapsed(dto.monthKey).fyStartYear
    const periodFyStart = fyStartYearForPeriodEnd(period.periodEndDate)
    if (monthFyStart !== periodFyStart) {
      throw new BadRequestException(
        `monthKey ${dto.monthKey} is outside the period's fiscal year (starts ${periodFyStart}-07).`,
      )
    }

    const school = await this.prisma.school.findUnique({ where: { id: schoolId } })
    if (!school) throw new NotFoundException('School not found.')

    const { mapping, chartVersion, chart } = await this.mapping.ensureActive(schoolId)

    const schoolConfig: SchoolConfig = {
      netAssetsBegin: Number(school.netAssetsBegin),
      pyNetAssetsBegin: Number(school.pyNetAssetsBegin),
      auditNetAssetsBegin: Number(school.auditNetAssetsBegin),
    }

    // CY-only: a monthly TB is cumulative YTD; PY/audit comparatives deferred.
    const bundle = generateReports({
      cyData: dto.rows as unknown as NormalizedRow[],
      pyData: [],
      auditData: [],
      school: schoolConfig,
      chart,
    })

    // Was a row already present for (period, monthKey)? Drives the `replaced`
    // flag (the upsert itself doesn't report create-vs-update).
    const existing = await this.prisma.monthlySnapshot.findUnique({
      where: { fiscalPeriodId_monthKey: { fiscalPeriodId: period.id, monthKey: dto.monthKey } },
      select: { id: true },
    })
    const replaced = existing !== null

    const snapshot = await this.prisma.monthlySnapshot.upsert({
      where: { fiscalPeriodId_monthKey: { fiscalPeriodId: period.id, monthKey: dto.monthKey } },
      create: {
        schoolId,
        fiscalPeriodId: period.id,
        monthKey: dto.monthKey,
        sourceName: dto.sourceName,
        sourceRows: dto.rows as unknown as Prisma.InputJsonValue,
        rowCount: dto.rows.length,
        payload: bundle as unknown as Prisma.InputJsonValue,
        mappingVersion: mapping.version,
        standardChartVersion: chartVersion.version,
        engineVersion: ENGINE_VERSION,
        uploadedBy: actor.id,
      },
      update: {
        sourceName: dto.sourceName,
        sourceRows: dto.rows as unknown as Prisma.InputJsonValue,
        rowCount: dto.rows.length,
        payload: bundle as unknown as Prisma.InputJsonValue,
        mappingVersion: mapping.version,
        standardChartVersion: chartVersion.version,
        engineVersion: ENGINE_VERSION,
        uploadedBy: actor.id,
      },
    })

    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: replaced ? 'monthly_snapshot.replaced' : 'monthly_snapshot.saved',
      targetType: 'monthly_snapshot',
      targetId: snapshot.id,
      metadata: {
        periodId: period.id,
        monthKey: dto.monthKey,
        rowCount: snapshot.rowCount,
        sourceName: snapshot.sourceName,
        engineVersion: ENGINE_VERSION,
        mappingVersion: mapping.version,
        standardChartVersion: chartVersion.version,
      },
    })

    return this.toCreateResponse(snapshot, replaced)
  }

  private toCreateResponse(
    s: MonthlySnapshot,
    replaced: boolean,
  ): CreateMonthlySnapshotResponse {
    return {
      monthKey: s.monthKey,
      sourceName: s.sourceName,
      rowCount: s.rowCount,
      uploadedBy: s.uploadedBy,
      engineVersion: s.engineVersion,
      mappingVersion: s.mappingVersion,
      standardChartVersion: s.standardChartVersion,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      replaced,
    }
  }

  /**
   * Lightweight management list (NO payload/sourceRows), months ascending
   * Jul->Jun. fiscalYearStart derived from the period's FY. Empty period =>
   * { fiscalYearStart, months: [] }.
   */
  async list(schoolId: string, periodId: string): Promise<MonthlySnapshotListResponse> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)

    const rows = await this.prisma.monthlySnapshot.findMany({
      where: { schoolId, fiscalPeriodId: periodId },
      orderBy: { monthKey: 'asc' },
      select: {
        monthKey: true,
        sourceName: true,
        rowCount: true,
        uploadedBy: true,
        updatedAt: true,
      },
    })

    const fiscalYearStart = rows.length
      ? fiscalYearStartOf(rows[0].monthKey)
      : `${fyStartYearForPeriodEnd(period.periodEndDate)}-07`

    return {
      fiscalYearStart,
      months: rows.map((r) => ({
        monthKey: r.monthKey,
        sourceName: r.sourceName,
        rowCount: r.rowCount,
        uploadedBy: r.uploadedBy,
        updatedAt: r.updatedAt.toISOString(),
      })),
    }
  }

  /** Delete a month's snapshot; 404 when that month is not loaded. */
  async remove(
    actor: User,
    schoolId: string,
    periodId: string,
    monthKey: string,
  ): Promise<void> {
    await this.periods.getOwnedPeriod(schoolId, periodId)
    const { count } = await this.prisma.monthlySnapshot.deleteMany({
      where: { schoolId, fiscalPeriodId: periodId, monthKey },
    })
    if (count === 0) {
      throw new NotFoundException(`No monthly snapshot loaded for ${monthKey}.`)
    }
    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'monthly_snapshot.deleted',
      targetType: 'monthly_snapshot',
      metadata: { periodId, monthKey },
    })
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  FiscalPeriod,
  Import,
  ImportRole,
  Prisma,
  StatementSnapshot,
  User,
} from '@finrep/db'
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
import { ComplianceService } from '../compliance/compliance.service.js'
import { ReconciliationService } from '../compliance/reconciliation.service.js'
import {
  resolveComparatives,
  type ResolverPeriod,
} from './comparative-resolver.js'
import type { GenerateStatementDto } from './dto/generate-statement.dto.js'
import type { SnapshotTrigger } from './snapshot-trigger.js'

/**
 * Provenance stamp for a generated snapshot (audit trail / value-versioning). Written
 * by generate() into the snapshot's soft-ref columns. Omitted → treated as a human
 * 'manual' generate (no caller touched unless it knows the real trigger).
 */
export interface SnapshotProvenance {
  trigger: SnapshotTrigger
  sourceImportId?: string | null
}

export interface SnapshotPublic {
  id: string
  schoolId: string
  fiscalPeriodId: string
  mappingVersion: string
  standardChartVersion: string
  engineVersion: string
  payload: ReportBundle
  createdAt: string
  /** Phase 6 — exception/reconciliation scan run automatically on this import. */
  scanSummary?: { material: number; reportable: number; reconStatus: string | null } | null
}

@Injectable()
export class StatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly periods: PeriodsService,
    private readonly mapping: MappingService,
    private readonly compliance: ComplianceService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  /**
   * Phase 6 — auto-scan on import: after a snapshot is generated, run the exception
   * + reconciliation evaluators so issues surface immediately (not just on demand).
   * Best-effort: never fails the generate on a scan error.
   */
  private async autoScan(
    schoolId: string,
    periodId: string,
    userId: string,
  ): Promise<SnapshotPublic['scanSummary']> {
    try {
      const compliance = await this.compliance.evaluateForPeriod(schoolId, periodId)
      const material = compliance.summary?.counts?.material ?? 0
      const reportable = compliance.summary?.counts?.reportable ?? 0
      let reconStatus: string | null = null
      try {
        const recon = await this.reconciliation.reconcileForPeriod(schoolId, periodId)
        reconStatus = recon?.result?.status ?? null
      } catch {
        // reconciliation needs disbursement/recorded inputs — fine if absent.
      }
      await this.audit.write({
        schoolId,
        userId,
        action: 'import.scanned',
        targetType: 'statement_snapshot',
        metadata: { periodId, material, reportable, reconStatus },
      })
      return { material, reportable, reconStatus }
    } catch {
      return null
    }
  }

  private toPublic(s: StatementSnapshot): SnapshotPublic {
    return {
      id: s.id,
      schoolId: s.schoolId,
      fiscalPeriodId: s.fiscalPeriodId,
      mappingVersion: s.mappingVersion,
      standardChartVersion: s.standardChartVersion,
      engineVersion: s.engineVersion,
      payload: s.payload as unknown as ReportBundle,
      createdAt: s.createdAt.toISOString(),
    }
  }

  /** Build resolver input: every period + its active (latest) import per role. */
  private async buildResolverPeriods(schoolId: string): Promise<ResolverPeriod[]> {
    const periods = await this.prisma.fiscalPeriod.findMany({
      where: { schoolId },
      orderBy: { periodEndDate: 'desc' },
    })
    const imports = await this.prisma.import.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
    })
    const byPeriod = new Map<string, { cy: Import | null; py: Import | null; audit: Import | null }>()
    for (const p of periods) byPeriod.set(p.id, { cy: null, py: null, audit: null })
    for (const imp of imports) {
      const slot = byPeriod.get(imp.fiscalPeriodId)
      if (slot && slot[imp.role as ImportRole] === null) {
        slot[imp.role as ImportRole] = imp
      }
    }
    return periods.map((period) => ({
      period: { id: period.id, periodEndDate: period.periodEndDate },
      active: byPeriod.get(period.id) ?? { cy: null, py: null, audit: null },
    }))
  }

  private async loadOverrideImport(
    schoolId: string,
    importId: string | undefined,
    role: ImportRole,
  ): Promise<Import | null> {
    if (!importId) return null
    const imp = await this.prisma.import.findUnique({ where: { id: importId } })
    if (!imp || imp.schoolId !== schoolId) {
      throw new NotFoundException(`Override ${role} import not found.`)
    }
    return imp
  }

  /**
   * SERVER-SIDE CANONICAL generate: runs the PURE engine over the period's stored
   * imports (comparatives auto-resolved from history), stamps the active
   * mapping/chart/engine versions, persists a snapshot, audits, and returns it.
   */
  async generate(
    actor: User,
    schoolId: string,
    periodId: string,
    dto: GenerateStatementDto,
    prov?: SnapshotProvenance,
  ): Promise<SnapshotPublic> {
    const period: FiscalPeriod = await this.periods.getOwnedPeriod(schoolId, periodId)

    const school = await this.prisma.school.findUnique({ where: { id: schoolId } })
    if (!school) throw new NotFoundException('School not found.')

    const { mapping, chartVersion, chart } = await this.mapping.ensureActive(schoolId)
    const resolverPeriods = await this.buildResolverPeriods(schoolId)

    const [pyOverride, auditOverride] = await Promise.all([
      this.loadOverrideImport(schoolId, dto.pyImportId, 'py'),
      this.loadOverrideImport(schoolId, dto.auditImportId, 'audit'),
    ])

    const resolved = resolveComparatives({
      targetPeriodId: periodId,
      periods: resolverPeriods,
      override: { pyImport: pyOverride, auditImport: auditOverride },
    })

    if (resolved.resolved.cyImportId === null || resolved.cyData.length === 0) {
      throw new BadRequestException(
        'No current-year import stored for this period — upload a CY trial balance first.',
      )
    }

    const schoolConfig: SchoolConfig = {
      netAssetsBegin: Number(school.netAssetsBegin),
      pyNetAssetsBegin: Number(school.pyNetAssetsBegin),
      auditNetAssetsBegin: Number(school.auditNetAssetsBegin),
    }

    const bundle = generateReports({
      cyData: resolved.cyData as NormalizedRow[],
      pyData: resolved.pyData as NormalizedRow[],
      auditData: resolved.auditData as NormalizedRow[],
      school: schoolConfig,
      chart,
    })

    const snapshot = await this.prisma.statementSnapshot.create({
      data: {
        schoolId,
        fiscalPeriodId: period.id,
        mappingVersion: mapping.version,
        standardChartVersion: chartVersion.version,
        engineVersion: ENGINE_VERSION,
        payload: bundle as unknown as Prisma.InputJsonValue,
        // Provenance stamp — what caused this version + who acted. Legacy/omitted →
        // 'manual' (the human Generate button). actor is always the acting user.
        trigger: prov?.trigger ?? 'manual',
        sourceImportId: prov?.sourceImportId ?? null,
        triggeredByUserId: actor.id,
      },
    })

    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'snapshot.generated',
      targetType: 'statement_snapshot',
      targetId: snapshot.id,
      metadata: {
        periodId: period.id,
        engineVersion: ENGINE_VERSION,
        mappingVersion: mapping.version,
        standardChartVersion: chartVersion.version,
        resolved: resolved.resolved,
      },
    })

    const scanSummary = await this.autoScan(schoolId, period.id, actor.id)
    return { ...this.toPublic(snapshot), scanSummary }
  }

  /** Latest snapshot for a period (404 if none). Any active member. */
  async latest(schoolId: string, periodId: string): Promise<SnapshotPublic> {
    await this.periods.getOwnedPeriod(schoolId, periodId)
    const snapshot = await this.prisma.statementSnapshot.findFirst({
      where: { schoolId, fiscalPeriodId: periodId },
      orderBy: { createdAt: 'desc' },
    })
    if (!snapshot) throw new NotFoundException('No statement snapshot for this period yet.')
    return this.toPublic(snapshot)
  }

  /** All snapshots for a period (regeneration audit trail), newest-first. */
  async list(schoolId: string, periodId: string) {
    await this.periods.getOwnedPeriod(schoolId, periodId)
    const snapshots = await this.prisma.statementSnapshot.findMany({
      where: { schoolId, fiscalPeriodId: periodId },
      orderBy: { createdAt: 'desc' },
    })
    return snapshots.map((s) => ({
      id: s.id,
      mappingVersion: s.mappingVersion,
      standardChartVersion: s.standardChartVersion,
      engineVersion: s.engineVersion,
      createdAt: s.createdAt.toISOString(),
    }))
  }
}

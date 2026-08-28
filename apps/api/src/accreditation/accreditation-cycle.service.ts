import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import type { AccreditationFramework } from '@finrep/db'
import { composeCycle, type ComposedCycle } from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { AccreditationReadinessService } from './readiness.service.js'
import { AccreditationEvidenceReadinessService } from './evidence-readiness.service.js'
import { frameworkIdsIn, pickDominantFramework } from './framework-scope.js'
import type { SetCycleDto } from './dto/set-cycle.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// WS3 F1 — the CYCLE service: the Prisma/read wrapper around the pure
// @finrep/compliance cycle engine (the StrategyProgressService precedent).
//
// The anchor lives on the school's AccreditationFrameworkProfile row (the ONE
// per-(school, framework) metadata table — division, upgrade stamp and cycle
// anchor share it by design). The profile is OPTIONAL METADATA: reading or
// writing a cycle never makes a framework "adopted", and the engine only runs
// when a lastReviewDate has actually been entered — an unconfigured school gets
// `configured:false` plus a server-computed SUGGESTION (the prior-visit
// ledger's latest visit date), never a silently invented anchor.
// ─────────────────────────────────────────────────────────────────────────────

export interface CycleFrameworkPublic {
  id: string
  code: string
  name: string
}

export interface CycleSuggestion {
  lastReviewDate: string
  basis: 'prior_visit'
}

export interface CycleResponse extends ComposedCycle {
  configured: true
  framework: CycleFrameworkPublic
  suggestion: null
  targetIndex: number | null
}

export interface CycleUnconfiguredResponse {
  configured: false
  framework: CycleFrameworkPublic | null
  suggestion: CycleSuggestion | null
  /** The school's adopted frameworks, so the setup card can offer a choice. */
  frameworks: CycleFrameworkPublic[]
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

@Injectable()
export class AccreditationCycleService {
  private readonly logger = new Logger(AccreditationCycleService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly readiness: AccreditationReadinessService,
    private readonly evidenceReadiness: AccreditationEvidenceReadinessService,
  ) {}

  /**
   * The cycle payload for one framework (explicit id → dominant, the readiness
   * resolution rule). Every string and figure is server-authored; the engine is
   * pure and `now` is injected for determinism.
   */
  async getCycle(
    schoolId: string,
    opts: { frameworkId?: string } = {},
    now: Date = new Date(),
  ): Promise<CycleResponse | CycleUnconfiguredResponse> {
    const rows = await this.prisma.accreditationStandard.findMany({
      where: { schoolId },
      select: { frameworkId: true },
    })
    const framework = await this.resolveFramework(rows, opts.frameworkId)
    const adopted = await this.adoptedFrameworks(rows)

    if (!framework) {
      return { configured: false, framework: null, suggestion: await this.suggest(schoolId), frameworks: adopted }
    }

    const profile = await this.prisma.accreditationFrameworkProfile
      .findFirst({ where: { schoolId, frameworkId: framework.id } })
      .catch(() => null)

    if (!profile || profile.lastReviewDate === null) {
      return {
        configured: false,
        framework: { id: framework.id, code: framework.code, name: framework.name },
        suggestion: await this.suggest(schoolId, framework.id),
        frameworks: adopted,
      }
    }

    // ── The live register facts the engine measures milestones against. Each
    // read fail-softs to null — a milestone we cannot measure says so in words.
    const [readiness, evidence, priorFindings, alsoInPortalCount] = await Promise.all([
      this.readiness.getReadiness(schoolId, { frameworkId: framework.id }, now).catch(() => null),
      // Framework-scoped like every other read in this payload (A4): the
      // implementing / evidence_freeze measures must count THIS framework's
      // artifacts, not another adopted register's.
      this.evidenceReadiness
        .getEvidenceReadiness(schoolId, { frameworkId: framework.id }, now)
        .catch(() => null),
      this.prisma.priorVisitFinding
        .findMany({
          where: { schoolId, OR: [{ frameworkId: framework.id }, { frameworkId: null }] },
          select: { status: true },
        })
        .catch(() => null),
      this.prisma.accreditationEvidence
        .count({ where: { schoolId, alsoInPortal: true, standard: { frameworkId: framework.id } } })
        .catch(() => null),
    ])

    const assurances =
      readiness && readiness.assurances.length > 0
        ? {
            total: readiness.assurances.length,
            satisfied: readiness.assurances.filter((a) => a.satisfied).length,
          }
        : null

    const composed = composeCycle({
      now: isoDay(now),
      anchor: {
        lastReviewDate: isoDay(profile.lastReviewDate),
        nextReviewDate: profile.nextReviewDate ? isoDay(profile.nextReviewDate) : null,
        termYears: profile.termYears,
        source: 'manual',
      },
      priorFindings: priorFindings
        ? {
            total: priorFindings.length,
            closed: priorFindings.filter((f) => f.status === 'closed').length,
          }
        : null,
      readiness: readiness
        ? {
            leafCount: readiness.leafCount,
            scoredCount: readiness.scoredCount,
            selfScoredPct: readiness.selfScoredPct,
            verifiedPct: readiness.verifiedPct,
            projectedIndex: readiness.projectedIndex,
            band: readiness.band,
          }
        : null,
      evidenceHealth: evidence
        ? {
            evidenceHealthPct: evidence.health.evidenceHealthPct,
            rated: evidence.health.rated,
            current: evidence.health.current,
            expiring: evidence.health.expiring,
          }
        : null,
      assurances,
      alsoInPortalCount,
    })

    return {
      configured: true,
      framework: { id: framework.id, code: framework.code, name: framework.name },
      suggestion: null,
      ...composed,
      targetIndex: profile.targetIndex ?? framework.defaultTarget ?? null,
    }
  }

  /**
   * Write the cycle anchor (and/or the persisted hero target) onto the profile
   * row. Explicit nulls CLEAR; omitted keeps. targetIndex is validated against
   * the framework's own index scale — a target on an index-less framework is a
   * number its accreditor never awards.
   */
  async setCycle(schoolId: string, dto: SetCycleDto, userId: string): Promise<CycleResponse | CycleUnconfiguredResponse> {
    const framework = await this.prisma.accreditationFramework.findFirst({
      where: { id: dto.frameworkId, active: true },
    })
    if (!framework) throw new NotFoundException('Framework not found.')

    if (dto.targetIndex !== undefined && dto.targetIndex !== null) {
      if (framework.indexMax == null) {
        throw new BadRequestException('This framework has no index scale — a target index cannot be set.')
      }
      const lo = framework.indexMin ?? 0
      if (dto.targetIndex < lo || dto.targetIndex > framework.indexMax) {
        throw new BadRequestException(
          `targetIndex must be between ${lo} and ${framework.indexMax} for this framework.`,
        )
      }
    }
    if (dto.termYears !== undefined && dto.termYears !== null && (dto.termYears < 1 || dto.termYears > 10)) {
      throw new BadRequestException('termYears must be between 1 and 10.')
    }

    const existing = await this.prisma.accreditationFrameworkProfile.findFirst({
      where: { schoolId, frameworkId: framework.id },
    })
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    const parseDay = (s: string | null | undefined, field: string): Date | null | undefined => {
      if (s === undefined) return undefined
      if (s === null) return null
      const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`)
      if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid ${field}: ${s}.`)
      return d
    }
    const lastReviewDate = parseDay(dto.lastReviewDate, 'lastReviewDate')
    const nextReviewDate = parseDay(dto.nextReviewDate, 'nextReviewDate')

    const row = await this.prisma.accreditationFrameworkProfile.upsert({
      where: { schoolId_frameworkId: { schoolId, frameworkId: framework.id } },
      create: {
        schoolId,
        frameworkId: framework.id,
        lastReviewDate: lastReviewDate ?? null,
        nextReviewDate: nextReviewDate ?? null,
        termYears: dto.termYears ?? 6,
        targetIndex: dto.targetIndex ?? null,
        updatedByUserId: userId,
      },
      update: {
        lastReviewDate: pick(lastReviewDate, existing?.lastReviewDate ?? null),
        nextReviewDate: pick(nextReviewDate, existing?.nextReviewDate ?? null),
        termYears: pick(dto.termYears ?? undefined, existing?.termYears ?? 6) ?? 6,
        targetIndex: pick(dto.targetIndex, existing?.targetIndex ?? null),
        updatedByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'accreditation.cycle.updated',
      targetType: 'accreditation_framework_profiles',
      targetId: row.id,
    })
    return this.getCycle(schoolId, { frameworkId: framework.id })
  }

  /** The prior-visit ledger's latest visit date, offered — never adopted silently. */
  private async suggest(schoolId: string, frameworkId?: string): Promise<CycleSuggestion | null> {
    const latest = await this.prisma.priorVisitFinding
      .findFirst({
        where: frameworkId
          ? { schoolId, OR: [{ frameworkId }, { frameworkId: null }] }
          : { schoolId },
        orderBy: { visitDate: 'desc' },
        select: { visitDate: true },
      })
      .catch(() => null)
    if (!latest) return null
    return { lastReviewDate: isoDay(latest.visitDate), basis: 'prior_visit' }
  }

  private async adoptedFrameworks(
    rows: readonly { frameworkId: string | null }[],
  ): Promise<CycleFrameworkPublic[]> {
    const ids = frameworkIdsIn(rows)
    if (ids.length === 0) return []
    const frameworks = await this.prisma.accreditationFramework.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, name: true },
    })
    return frameworks
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((f) => ({ id: f.id, code: f.code, name: f.name }))
  }

  /** Explicit frameworkId → dominant (most linked rows; tie → code asc) → null. */
  private async resolveFramework(
    rows: readonly { frameworkId: string | null }[],
    explicitId?: string,
  ): Promise<AccreditationFramework | null> {
    if (explicitId) {
      return this.prisma.accreditationFramework.findFirst({ where: { id: explicitId } })
    }
    const ids = frameworkIdsIn(rows)
    if (ids.length === 0) return null
    const candidates = await this.prisma.accreditationFramework.findMany({
      where: { id: { in: ids } },
    })
    return pickDominantFramework(rows, candidates)
  }
}

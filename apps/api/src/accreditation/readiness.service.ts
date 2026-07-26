import { Injectable } from '@nestjs/common'
import type { AccreditationFramework, AccreditationStandard } from '@finrep/db'
import {
  bandForIndex,
  computeAssurances,
  computeGaps,
  computeTargetGap,
  schoolReadiness,
  type AssuranceStatus,
  type ReadinessGap,
  type ReadinessLeafInput,
  type StatusBand,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'

/** The framework facts echoed on the readiness payload (null = framework-less mode). */
export interface ReadinessFrameworkPublic {
  id: string
  code: string
  name: string
  rubricLabels: string[]
  statusBands: StatusBand[]
  indexMin: number | null
  indexMax: number | null
  defaultTarget: number | null
}

export interface ReadinessTargetPublic {
  index: number
  bandLabel: string
  pointGap: number
  stepsToTarget: number
}

export interface ReadinessResponse {
  framework: ReadinessFrameworkPublic | null
  readinessPct: number
  leafCount: number
  scoredCount: number
  coveredCount: number
  projectedIndex: number | null
  band: string | null
  target: ReadinessTargetPublic | null
  gaps: ReadinessGap[]
  assurances: AssuranceStatus[]
}

/**
 * Accreditation Phase 3 — the READINESS service wrapper (Prisma-only, the
 * StrategyProgressService precedent): same two queries as computeStandardsTree
 * (one standards findMany + one evidence groupBy) + the framework row, fed into
 * the PURE @finrep/compliance readiness engine. Legacy `rating`,
 * summarizeRatings, summarizeCoverage, and all briefing inputs are UNTOUCHED
 * siblings — rubric readiness is a parallel dimension, never a replacement.
 *
 * FRAMEWORK SELECTION: explicit frameworkId param → else the school's DOMINANT
 * frameworkId (most linked standards; tie → framework code asc) → else null =
 * framework-less mode (readiness + gaps over ALL leaves, no index/band/target,
 * no assurances). In framework mode the engine sees ONLY that framework's
 * leaves, split assurance/non-assurance via the catalog rows.
 */
@Injectable()
export class AccreditationReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async getReadiness(
    schoolId: string,
    opts: { target?: number; frameworkId?: string } = {},
  ): Promise<ReadinessResponse> {
    const rows = await this.prisma.accreditationStandard.findMany({ where: { schoolId } })
    const counts = await this.prisma.accreditationEvidence.groupBy({
      by: ['standardId'],
      where: { schoolId },
      _count: { _all: true },
    })
    const countBy = new Map<string, number>()
    for (const c of counts) countBy.set(c.standardId, c._count._all)

    const framework = await this.resolveFramework(rows, opts.frameworkId)

    // LEAF = a standard no other school standard points at as parent.
    const parentIds = new Set(rows.map((r) => r.parentId).filter(Boolean))
    const scoped = framework ? rows.filter((r) => r.frameworkId === framework.id) : rows
    const leaves = scoped.filter((r) => !parentIds.has(r.id))

    // Assurance split via the catalog rows (framework mode only; an uncataloged
    // row is never an assurance).
    const assuranceCatalogIds = await this.assuranceCatalogIds(framework, leaves)
    const isAssurance = (r: AccreditationStandard): boolean =>
      r.catalogStandardId != null && assuranceCatalogIds.has(r.catalogStandardId)

    const toLeafInput = (r: AccreditationStandard): ReadinessLeafInput => ({
      standardId: r.id,
      code: r.code,
      title: r.title,
      rubricScore: r.rubricScore ?? null,
      evidenceCount: countBy.get(r.id) ?? 0,
    })
    const scoredLeaves = leaves.filter((r) => !isAssurance(r)).map(toLeafInput)
    const assuranceLeaves = leaves.filter((r) => isAssurance(r)).map(toLeafInput)

    const fwInput = framework
      ? {
          indexMin: framework.indexMin,
          indexMax: framework.indexMax,
          statusBands: this.bandsOf(framework),
        }
      : null
    const summary = schoolReadiness(scoredLeaves, fwInput)
    const hasIndex = summary.projectedIndex != null
    const gaps = computeGaps(scoredLeaves, hasIndex)

    // Target math only exists on an index scale.
    let target: ReadinessTargetPublic | null = null
    if (framework && hasIndex && summary.projectedIndex != null) {
      const targetIndex = opts.target ?? framework.defaultTarget
      if (targetIndex != null) {
        const gap = computeTargetGap(scoredLeaves, summary.projectedIndex, targetIndex)
        target = {
          index: targetIndex,
          bandLabel: bandForIndex(this.bandsOf(framework), targetIndex),
          pointGap: gap.pointGap,
          stepsToTarget: gap.stepsToTarget,
        }
      }
    }

    return {
      framework: framework
        ? {
            id: framework.id,
            code: framework.code,
            name: framework.name,
            rubricLabels: (framework.rubricLabels as string[]) ?? [],
            statusBands: this.bandsOf(framework),
            indexMin: framework.indexMin,
            indexMax: framework.indexMax,
            defaultTarget: framework.defaultTarget,
          }
        : null,
      readinessPct: summary.readinessPct,
      leafCount: summary.leafCount,
      scoredCount: summary.scoredCount,
      coveredCount: summary.coveredCount,
      projectedIndex: summary.projectedIndex,
      band: summary.band,
      target,
      gaps,
      assurances: framework ? computeAssurances(assuranceLeaves) : [],
    }
  }

  private bandsOf(framework: AccreditationFramework): StatusBand[] {
    return (framework.statusBands as unknown as StatusBand[]) ?? []
  }

  /** Explicit frameworkId → dominant (most linked rows; tie → code asc) → null. */
  private async resolveFramework(
    rows: AccreditationStandard[],
    explicitId?: string,
  ): Promise<AccreditationFramework | null> {
    if (explicitId) {
      return this.prisma.accreditationFramework.findFirst({ where: { id: explicitId } })
    }
    const countByFw = new Map<string, number>()
    for (const r of rows) {
      if (r.frameworkId) countByFw.set(r.frameworkId, (countByFw.get(r.frameworkId) ?? 0) + 1)
    }
    if (countByFw.size === 0) return null
    const candidates = await this.prisma.accreditationFramework.findMany({
      where: { id: { in: [...countByFw.keys()] } },
    })
    candidates.sort((a, b) => {
      const c = (countByFw.get(b.id) ?? 0) - (countByFw.get(a.id) ?? 0)
      return c !== 0 ? c : a.code.localeCompare(b.code)
    })
    return candidates[0] ?? null
  }

  /** Catalog ids (within the leaves' links) flagged isAssurance. Skips the query
   *  entirely when nothing is cataloged (hand-made registers, mocks). */
  private async assuranceCatalogIds(
    framework: AccreditationFramework | null,
    leaves: AccreditationStandard[],
  ): Promise<Set<string>> {
    if (!framework) return new Set()
    const catalogIds = leaves.map((r) => r.catalogStandardId).filter((id): id is string => !!id)
    if (catalogIds.length === 0) return new Set()
    const rows = await this.prisma.accreditationCatalogStandard.findMany({
      where: { id: { in: catalogIds }, isAssurance: true },
      select: { id: true },
    })
    return new Set(rows.map((r) => r.id))
  }
}

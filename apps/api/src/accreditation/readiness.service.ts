import { Injectable, Logger } from '@nestjs/common'
import type { AccreditationFramework, AccreditationStandard } from '@finrep/db'
import {
  bandForIndex,
  computeAssurances,
  computeDomainConfidence,
  computeDomainReadiness,
  computeGaps,
  computeTargetGap,
  schoolReadiness,
  selfScoredPct,
  verifiedPct,
  type AssuranceStatus,
  type DomainConfidence,
  type DomainReadiness,
  type ReadinessGap,
  type ReadinessLeafInput,
  type StatusBand,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { isAssuranceLeaf, leavesOf } from './leaf-scope.js'
import {
  assuranceIdsFrom,
  buildDomainMap,
  readCatalogDomainRows,
  type CatalogDomainRow,
} from './domain-map.js'
import { frameworkIdsIn, pickDominantFramework } from './framework-scope.js'

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
  /**
   * Phase A — readiness is never ONE number. `selfScoredPct` is DOCUMENTED (the
   * rubric term alone) and `verifiedPct` is DEFENSIBLE (the evidence term
   * alone); the hero renders them as a pair. Both are computed live from the
   * SAME leaf set as `readinessPct`/`scoredCount`/`coveredCount` below, so the
   * pair and its caption always describe one instant — the recorded series is
   * for the history strip, never for the headline figures.
   */
  selfScoredPct: number
  verifiedPct: number
  leafCount: number
  scoredCount: number
  coveredCount: number
  projectedIndex: number | null
  band: string | null
  target: ReadinessTargetPublic | null
  gaps: ReadinessGap[]
  assurances: AssuranceStatus[]
  /**
   * Phase B — the SAME leaves, re-expressed as ten domain readings. Always
   * exactly ten entries in DOMAIN_KEYS order, including the domains this
   * school's framework does not cover: "your accreditor asks nothing here" is a
   * finding, not an omission. A domain that cannot be scored carries NULL
   * percentages and a `reason` sentence — never 0, which would read as "you
   * scored badly here".
   */
  domains: DomainReadiness[]
  /** Phase B — the published size of the hole in the domain grid. */
  confidence: DomainConfidence
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
  private readonly logger = new Logger(AccreditationReadinessService.name)

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

    // LEAF = a standard no other school standard points at as parent. The
    // definition lives in leaf-scope.ts so the RECORDED series (snapshot
    // service) scopes leaves identically — see the note there.
    const scoped = framework ? rows.filter((r) => r.frameworkId === framework.id) : rows
    const leaves = leavesOf(rows, scoped)

    // ONE catalog read now serves BOTH the assurance split and the Phase-B
    // domain map: same single findMany, wider select, assurance set derived in
    // memory. A second query would let the hero and the domain grid describe
    // catalog states read a millisecond apart.
    const catalogRows = await this.catalogRowsFor(framework, leaves)
    const assuranceCatalogIds = assuranceIdsFrom(catalogRows)
    const isAssurance = (r: AccreditationStandard): boolean =>
      isAssuranceLeaf(r, assuranceCatalogIds)

    const toLeafInput = (r: AccreditationStandard): ReadinessLeafInput => ({
      standardId: r.id,
      code: r.code,
      title: r.title,
      rubricScore: r.rubricScore ?? null,
      evidenceCount: countBy.get(r.id) ?? 0,
    })
    const scoredRows = leaves.filter((r) => !isAssurance(r))
    const scoredLeaves = scoredRows.map(toLeafInput)
    const assuranceLeaves = leaves.filter((r) => isAssurance(r)).map(toLeafInput)

    // THE DOMAIN GRID USES THE EXACT ARRAY THE HERO USES. Not a re-query, not a
    // re-filter — the same `scoredLeaves`, so a card can never describe a
    // different population than the headline figure above it.
    const { map, signalKeys, unmappedLeafCount } = buildDomainMap(scoredRows, catalogRows)
    const domains = computeDomainReadiness(scoredLeaves, map, { signalKeys })
    // `frameworkLinked` is the fact ONLY the API has. Without it the engine
    // cannot tell "no framework adopted" from "adopted, but this build has not
    // mapped its standards", and would tell a school sitting under a hero titled
    // with their framework to go and adopt one.
    const confidence = computeDomainConfidence(domains, {
      unmappedLeafCount,
      frameworkLinked: framework != null,
    })
    // A framework whose leaves are ALL unmapped means the catalog seed did not
    // complete (onModuleInit fail-softs per framework), so say so in the logs —
    // the school sees an honest sentence, we need the operational signal.
    if (framework && scoredRows.length > 0 && unmappedLeafCount === scoredRows.length) {
      this.logger.warn(
        `Framework ${framework.code} has no domain-mapped standards (${unmappedLeafCount} leaves) — catalog seed may not have completed.`,
      )
    }

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
      selfScoredPct: selfScoredPct(scoredLeaves),
      verifiedPct: verifiedPct(scoredLeaves),
      leafCount: summary.leafCount,
      scoredCount: summary.scoredCount,
      coveredCount: summary.coveredCount,
      projectedIndex: summary.projectedIndex,
      band: summary.band,
      target,
      gaps,
      assurances: framework ? computeAssurances(assuranceLeaves) : [],
      domains,
      confidence,
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
    const ids = frameworkIdsIn(rows)
    if (ids.length === 0) return null
    const candidates = await this.prisma.accreditationFramework.findMany({
      where: { id: { in: ids } },
    })
    // The dominance rule lives in framework-scope.ts so the SIGNAL panel resolves
    // the same framework this read grades — see the note there.
    return pickDominantFramework(rows, candidates)
  }

  /**
   * The catalog rows behind these leaves — assurance flag AND domain map AND
   * signal binding in ONE read. Skips the query entirely when nothing is
   * cataloged (hand-made registers, mocks) or in framework-LESS mode, which is
   * why a framework-less school reports ten uncovered domains rather than an
   * error: no catalog, no map, and the confidence caveat says exactly that.
   */
  private async catalogRowsFor(
    framework: AccreditationFramework | null,
    leaves: AccreditationStandard[],
  ): Promise<CatalogDomainRow[]> {
    if (!framework) return []
    const catalogIds = leaves.map((r) => r.catalogStandardId).filter((id): id is string => !!id)
    if (catalogIds.length === 0) return []
    // Deploy-order safe: a pre-migration image degrades the DOMAIN GRID, never
    // the hero (see readCatalogDomainRows).
    return readCatalogDomainRows(
      () =>
        this.prisma.accreditationCatalogStandard.findMany({
          where: { id: { in: catalogIds } },
          select: {
            id: true,
            isAssurance: true,
            domainKey: true,
            domainWeights: true,
            signalKeys: true,
          },
        }),
      () =>
        this.prisma.accreditationCatalogStandard.findMany({
          where: { id: { in: catalogIds } },
          select: { id: true, isAssurance: true },
        }),
    )
  }
}

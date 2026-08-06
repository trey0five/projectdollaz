import { Injectable } from '@nestjs/common'
import { METRIC_KEYS, formatMetricValue, type MetricUnit } from '@finrep/analytics'
import {
  computeCommendationExclusions,
  computeCommendations,
  type Commendation,
  type CommendationExclusions,
  type CommendationLeafInput,
  type CommendationSignalInput,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { AccreditationEvidenceReadinessService } from '../accreditation/evidence-readiness.service.js'
import { AccreditationSignalsService } from './signals.service.js'
import { assuranceIdsFrom, readCatalogDomainRows, type CatalogDomainRow } from '../accreditation/domain-map.js'
import { isAssuranceLeaf, leavesOf } from '../accreditation/leaf-scope.js'
import { frameworkIdsIn, pickDominantFramework } from '../accreditation/framework-scope.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase C — COMMENDATIONS.
//
// Every other accreditation surface tells a school what is missing. This one
// tells them what they can defend in front of a visiting team — and it is
// deliberately hard to earn: a strong self-score AND current evidence AND a
// favorable operating figure. Two of three is a claim plus a folder.
//
// DEGRADED BEHAVIOUR IS THE POINT. When the signal panel cannot value anything —
// no fiscal period, no saved statements, an unlicensed finance module — the
// answer is ZERO COMMENDATIONS PLUS THE REASON, never a rubric-only list. A
// "strength" backed by a self-score and nothing else is exactly the unverified
// claim this whole program exists to stop shipping. HTTP 200 in every case.
// ─────────────────────────────────────────────────────────────────────────────

export interface CommendationsResponse {
  commendations: Commendation[]
  exclusions: CommendationExclusions
  /** Frozen chip copy, rendered VERBATIM. */
  caveat: string
  /** Non-null when the signal panel could not value ANY figure. */
  signalsUnavailable: { reason: string; message: string } | null
  demoData: boolean
}

@Injectable()
export class AccreditationCommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signals: AccreditationSignalsService,
    private readonly currency: AccreditationEvidenceReadinessService,
  ) {}

  async getCommendations(
    schoolId: string,
    opts: { periodId?: string; frameworkId?: string } = {},
  ): Promise<CommendationsResponse> {
    const rows = await this.prisma.accreditationStandard.findMany({ where: { schoolId } })

    // ONE FRAMEWORK CHOICE, THREADED THROUGH BOTH READS. `gradedLeaves` below
    // has always accepted an explicit framework; it just had no way to be given
    // one, because the public surface stopped at periodId. A school holding two
    // accreditations therefore had its strengths drawn from whichever framework
    // happened to be dominant, with no way to look at the other.
    const [signals, currency] = await Promise.all([
      this.signals
        .getSignals(schoolId, { periodId: opts.periodId, frameworkId: opts.frameworkId })
        .catch(() => null),
      this.currency.getCurrencyByStandard(schoolId, { frameworkId: opts.frameworkId }),
    ])

    const framework = currency.framework
    const leaves = await this.gradedLeaves(rows, framework?.id ?? null)
    const rubricLabels = (framework?.rubricLabels as string[] | undefined) ?? undefined

    const leafInputs: CommendationLeafInput[] = leaves.map((r) => ({
      standardId: r.id,
      code: r.code,
      title: r.title,
      rubricScore: r.rubricScore ?? null,
      evidenceCount: 0, // not part of the rule; currency carries the evidence test
    }))

    const signalInputs = this.toSignalInputs(signals)
    const opts2 = rubricLabels ? { rubricLabels } : {}
    const commendations = computeCommendations(leafInputs, currency.byStandard, signalInputs, opts2)
    const exclusions = computeCommendationExclusions(
      leafInputs,
      currency.byStandard,
      signalInputs,
      opts2,
    )

    // The list is capped; the eligible count is not. Say so in the same sentence
    // rather than letting the header read "5 defensible" beside "8 qualify".
    const shown =
      exclusions.eligible > commendations.length
        ? ` Showing the strongest ${commendations.length}.`
        : ''

    return {
      commendations,
      exclusions,
      caveat:
        'Strengths we can defend: a strong self-score, current evidence, and a favorable operating figure — ' +
        `all three. ${exclusions.eligible} of ${leafInputs.length} standards qualify.${shown}`,
      signalsUnavailable: signals?.unavailable
        ? { reason: signals.unavailable.reason, message: signals.unavailable.message }
        : signals === null
          ? { reason: 'metrics_unavailable', message: 'Operating figures could not be read for this school.' }
          : null,
      demoData: currency.demoData,
    }
  }

  /**
   * Invert the signal panel's `byStandard` binding so each signal knows which
   * standards it speaks for. An UNLICENSED metric arrives here with
   * `available: false` and a nulled value, so it can never leak a number into a
   * commendation — the panel already made that guarantee and we do not re-derive it.
   */
  private toSignalInputs(
    signals: Awaited<ReturnType<AccreditationSignalsService['getSignals']>> | null,
  ): CommendationSignalInput[] {
    if (!signals) return []
    const standardsByKey = new Map<string, string[]>()
    for (const [standardId, keys] of Object.entries(signals.byStandard)) {
      for (const k of keys) standardsByKey.set(k, [...(standardsByKey.get(k) ?? []), standardId])
    }
    // Registry order, the same order every other metric surface uses.
    const order = new Map(METRIC_KEYS.map((k, i) => [k as string, i]))
    return [...signals.signals]
      .sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999))
      .map((s) => ({
        key: s.key,
        label: s.label,
        standardIds: standardsByKey.get(s.key) ?? [],
        available: s.available,
        status: s.status,
        // Formatted through the ONE canonical formatter, so a commendation
        // narrative and the signal panel never render one number two ways.
        formattedValue:
          s.available && s.value !== null ? formatMetricValue(s.value, s.unit as MetricUnit) : null,
        asOf: s.asOf,
      }))
  }

  /**
   * The GRADED population, resolved exactly as the readiness hero resolves it:
   * the dominant framework's leaves, minus the binary assurance gates. An
   * assurance gate is a checklist item, not a strength.
   */
  private async gradedLeaves(
    rows: Awaited<ReturnType<PrismaService['accreditationStandard']['findMany']>>,
    explicitFrameworkId: string | null,
  ) {
    const standards = rows as unknown as {
      id: string
      code: string
      title: string
      parentId: string | null
      catalogStandardId: string | null
      frameworkId: string | null
      rubricScore: number | null
    }[]
    let frameworkId = explicitFrameworkId
    if (frameworkId === null) {
      const ids = frameworkIdsIn(standards)
      if (ids.length > 0) {
        const candidates = await this.prisma.accreditationFramework.findMany({
          where: { id: { in: ids } },
          select: { id: true, code: true },
        })
        frameworkId = pickDominantFramework(standards, candidates)?.id ?? null
      }
    }
    const scoped = frameworkId ? standards.filter((s) => s.frameworkId === frameworkId) : standards
    const catalogIds = [
      ...new Set(standards.map((s) => s.catalogStandardId).filter((id): id is string => !!id)),
    ]
    const catalogRows: CatalogDomainRow[] =
      catalogIds.length === 0
        ? []
        : await readCatalogDomainRows(
            () =>
              this.prisma.accreditationCatalogStandard.findMany({
                where: { id: { in: catalogIds } },
                select: { id: true, isAssurance: true, domainKey: true, domainWeights: true, signalKeys: true },
              }),
            () =>
              this.prisma.accreditationCatalogStandard.findMany({
                where: { id: { in: catalogIds } },
                select: { id: true, isAssurance: true },
              }),
          )
    const assuranceCatalogIds = assuranceIdsFrom(catalogRows)
    return leavesOf(standards, scoped).filter((r) => !isAssuranceLeaf(r, assuranceCatalogIds))
  }
}

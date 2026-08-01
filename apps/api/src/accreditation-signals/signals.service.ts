import { Injectable } from '@nestjs/common'
import type { ModuleKey } from '@finrep/db'
import { MODULE_META } from '@finrep/db'
import {
  METRIC_KEYS,
  METRIC_META,
  type GoodDirection,
  type MetricDomain,
  type MetricResult,
  type MetricUnit,
  type TargetBands,
} from '@finrep/analytics'
import {
  DOMAIN_KEYS,
  SIGNAL_ATTRIBUTION_MIN_WEIGHT,
  DOMAIN_WEIGHT_EPSILON,
  type DomainKey,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { BillingService } from '../billing/billing.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AnalyticsService } from '../analytics/analytics.service.js'
import { entitledModulesForSchool, moduleForMetricKey } from '../analytics/metric-gating.js'
import {
  assuranceIdsFrom,
  buildDomainMap,
  readCatalogDomainRows,
  type CatalogDomainRow,
} from '../accreditation/domain-map.js'
import { isAssuranceLeaf, leavesOf } from '../accreditation/leaf-scope.js'
import { frameworkIdsIn, pickDominantFramework } from '../accreditation/framework-scope.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase B — THE SIGNAL PANEL.
//
// The point of this endpoint is one sentence a head of school says out loud when
// they first see it: "you didn't enter these for accreditation." A standard about
// the equitable allocation of fiscal resources is judged on a rubric score and a
// folder of PDFs everywhere else. Here it also carries the school's REAL
// operating margin, days cash on hand and cost per pupil, with the fiscal period
// they describe and the timestamp the underlying statements were generated.
//
// THE RULE THIS FILE ENFORCES: a signal shows a real value with an as-of date, or
// it names why it cannot. There is no third option. Concretely:
//
//   • this endpoint NEVER 4xx/5xx for missing data — no period, no snapshot, a
//     metrics compute that throws: all of them return 200 with a reason, because
//     a red error box teaches a school nothing and a 500 teaches them less;
//   • an UNLICENSED metric is still returned, with its value, bands, delta and
//     lineage ALL nulled and a "unlock the X module" message. The school must be
//     told why the panel is thin — but must never receive the number itself.
//     This is why we deliberately do NOT reuse filterMetricsByEntitlement: that
//     helper DROPS the row, and a dropped row cannot explain itself;
//   • attribution to an accreditation domain requires weight ≥ 0.5 on the
//     contributing standard, so MSA-4's cash metrics are never reported as
//     "facilities signals" on the strength of a quarter share;
//   • `byDomain` is computed over EXACTLY the population the readiness read
//     grades — the dominant framework's NON-ASSURANCE LEAVES — because the two
//     travel on one card. A school that has adopted two frameworks (which
//     `adoptFramework` fully permits) would otherwise get a Cognia Finance card
//     reading "N of 15 live" from every standard in the register, directly above
//     the readiness sentence "your framework has 1 finance standard". Same
//     population, or the card contradicts itself. `signals` and `byStandard`
//     stay REGISTER-WIDE on purpose: the standard drawer must still value a
//     second framework's standard when you open it.
//

// No server-side formatting: the web formats with lib/metricMeta.js, the same
// authority MetricDrawer uses, so one number never renders two ways.
// ─────────────────────────────────────────────────────────────────────────────

export type SignalUnavailableReason = 'module_not_licensed' | 'inputs_missing' | 'no_data'
export type PanelUnavailableReason = 'no_period' | 'no_snapshot' | 'metrics_unavailable'

export interface SignalLineage {
  periodId: string
  periodLabel: string
  periodEndDate: string
  /** Snapshot createdAt ISO — when the underlying statements were generated. */
  dataAsOf: string
  source: 'statement_snapshot'
}

export interface SignalPublic {
  key: string
  label: string
  unit: MetricUnit
  /** The METRIC's business domain — NOT an accreditation domain. */
  metricDomain: MetricDomain | null
  goodDirection: GoodDirection
  formula: string
  description: string
  available: boolean
  value: number | null
  status: 'good' | 'watch' | 'risk' | 'neutral'
  bands: TargetBands | null
  periodOverPeriodDelta: number | null
  /** yyyy-mm-dd fiscal period end this value describes. */
  asOf: string | null
  lineage: SignalLineage | null
  unavailable: {
    reason: SignalUnavailableReason
    message: string
    moduleKey?: ModuleKey
    inputsMissing?: string[]
  } | null
}

export interface DomainSignalCoverage {
  bound: number
  live: number
  unavailable: number
  /**
   * The DISTINCT metric keys behind `bound`, in registry order. The server owns
   * domain membership outright: a client that derives it from a second copy of
   * the ≥0.5 rule can (and did) disagree with these counts, rendering a card
   * that claims seven live signals and shows chips for none of them. Render from
   * this list; never re-derive it.
   */
  keys: string[]
}

export interface AccreditationSignalsResponse {
  period: { id: string; label: string; periodEndDate: string } | null
  /** ISO timestamp the underlying statements were generated. */
  asOf: string | null
  /** Set when NO signal could be valued at all. */
  unavailable: { reason: PanelUnavailableReason; message: string } | null
  signals: SignalPublic[]
  /** schoolStandardId → bound metric keys (only standards with ≥1 binding). */
  byStandard: Record<string, string[]>
  /** All ten accreditation domain keys, always present, zeros included. */
  byDomain: Record<DomainKey, DomainSignalCoverage>
}

/** The one sentence a school with no saved statements sees, everywhere. */
const NO_SNAPSHOT_MESSAGE =
  'No saved statements yet — import a trial balance to light these signals.'

/**
 * A period the CALLER named that this school does not own. Deliberately NOT the
 * no-snapshot sentence: telling a school with ten years of statements to "import
 * a trial balance" because a stale or foreign id came in on the query string
 * blames their data for a bad request.
 */
const NO_PERIOD_MESSAGE = "That fiscal period isn't available for this school."

/** Bindings exist and a period resolved, but not one signal could be valued. */
const NOTHING_VALUED_MESSAGE =
  'None of the signals bound to your standards could be valued for this period.'

@Injectable()
export class AccreditationSignalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly billing: BillingService,
    private readonly periods: PeriodsService,
  ) {}

  async getSignals(
    schoolId: string,
    opts: { periodId?: string } = {},
  ): Promise<AccreditationSignalsResponse> {
    // ── 1. What is bound? A school with no bindings costs one query and no
    //       metric compute at all.
    const rows = await this.prisma.accreditationStandard.findMany({
      where: { schoolId },
      select: { id: true, parentId: true, catalogStandardId: true, frameworkId: true },
    })
    // Normalized once: a row shape that leaf-scope/framework-scope can both read
    // without either caring where it came from.
    const standards = rows.map((s) => ({
      id: s.id,
      parentId: s.parentId ?? null,
      catalogStandardId: s.catalogStandardId ?? null,
      frameworkId: s.frameworkId ?? null,
    }))
    const catalogIds = [
      ...new Set(standards.map((s) => s.catalogStandardId).filter((id): id is string => !!id)),
    ]
    if (catalogIds.length === 0) return this.empty()

    const catalogRows: CatalogDomainRow[] = await readCatalogDomainRows(
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
    // REGISTER-WIDE: every standard's binding, for the drawer.
    const { signalKeys: byStandard } = buildDomainMap(standards, catalogRows)
    // GRADED POPULATION: the dominant framework's non-assurance leaves — exactly
    // what AccreditationReadinessService builds `domains[].signalCount` from.
    const graded = await this.gradedLeaves(standards, catalogRows)
    const { map, signalKeys: gradedKeys } = buildDomainMap(graded, catalogRows)

    // Distinct bound keys, in the registry's own order — the same order every
    // other metric surface uses, so the panel never looks re-sorted.
    const boundSet = new Set<string>()
    for (const keys of Object.values(byStandard)) for (const k of keys) boundSet.add(k)
    const boundKeys = METRIC_KEYS.filter((k) => boundSet.has(k)) as string[]
    // A key the registry no longer knows about is dropped rather than rendered
    // as a mystery row (the seed spec makes this unreachable in practice).
    if (boundKeys.length === 0) return this.empty(byStandard)

    // ── 2. Which period? Explicit (tenant-checked) → else the newest period that
    //       actually has saved statements.
    const resolved = await this.resolvePeriod(schoolId, opts.periodId)
    if (!resolved.period) {
      // A named-but-unresolvable period is a REQUEST problem; no period at all is
      // a DATA problem. They get different reasons and different sentences.
      const unavailable =
        resolved.reason === 'no_period'
          ? { reason: 'no_period' as const, message: NO_PERIOD_MESSAGE }
          : { reason: 'no_snapshot' as const, message: NO_SNAPSHOT_MESSAGE }
      return this.degraded(boundKeys, byStandard, map, gradedKeys, null, unavailable)
    }
    const period = resolved.period
    const periodPublic = {
      id: period.id,
      label: period.label,
      periodEndDate: period.periodEndDate.toISOString().slice(0, 10),
    }

    // ── 3. Compute. A throw (including computeMetricsResponse's own
    //       NotFoundException for a period with no snapshot) degrades to the
    //       same honest shape — this endpoint never fails a page.
    const metrics = await this.analytics
      .computeMetricsResponse(schoolId, period.id)
      .catch(() => null)
    if (!metrics) {
      return this.degraded(boundKeys, byStandard, map, gradedKeys, periodPublic, {
        reason: 'no_snapshot',
        message: NO_SNAPSHOT_MESSAGE,
      })
    }
    const resultBy = new Map<string, MetricResult>(metrics.metrics.map((m) => [m.key, m]))

    // ── 4. Entitlement. Resolved ONCE for the whole panel.
    const entitled = await entitledModulesForSchool(schoolId, this.billing)

    const signals = boundKeys.map((key) =>
      this.toSignal(key, resultBy.get(key), entitled, {
        periodId: metrics.periodId,
        periodLabel: metrics.label,
        periodEndDate: metrics.periodEndDate,
        dataAsOf: metrics.freshness.dataAsOf,
        source: 'statement_snapshot' as const,
      }),
    )

    // `unavailable` means what it says on the interface: NOTHING could be valued.
    // A finance-only school whose Cognia HR/enrollment bindings are ALL
    // module_not_licensed, or a period where every bound metric comes back
    // inputsMissing, is not a healthy panel and must not report itself as one.
    const nothingValued = signals.length > 0 && signals.every((s) => !s.available)

    return {
      period: {
        id: metrics.periodId,
        label: metrics.label,
        periodEndDate: metrics.periodEndDate,
      },
      asOf: metrics.freshness.dataAsOf,
      unavailable: nothingValued
        ? { reason: 'metrics_unavailable', message: NOTHING_VALUED_MESSAGE }
        : null,
      signals,
      byStandard,
      byDomain: this.coverage(signals, gradedKeys, map),
    }
  }

  /**
   * The population `domains[].signalCount` is built from, resolved the SAME way
   * AccreditationReadinessService resolves it: the dominant framework's leaves,
   * minus the binary assurance gates. Framework-less registers grade every leaf,
   * exactly as the readiness read does.
   */
  private async gradedLeaves<
    T extends { id: string; parentId: string | null; catalogStandardId: string | null; frameworkId: string | null },
  >(standards: readonly T[], catalogRows: readonly CatalogDomainRow[]): Promise<T[]> {
    const ids = frameworkIdsIn(standards)
    let frameworkId: string | null = null
    if (ids.length > 0) {
      const candidates = await this.prisma.accreditationFramework.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true },
      })
      frameworkId = pickDominantFramework(standards, candidates)?.id ?? null
    }
    const scoped = frameworkId ? standards.filter((s) => s.frameworkId === frameworkId) : standards
    const assuranceCatalogIds = assuranceIdsFrom(catalogRows)
    return leavesOf(standards, scoped).filter((r) => !isAssuranceLeaf(r, assuranceCatalogIds))
  }

  // ── Shapes ─────────────────────────────────────────────────────────────────

  /** Nothing is bound: an empty panel is a fact, not an error. */
  private empty(byStandard: Record<string, string[]> = {}): AccreditationSignalsResponse {
    return {
      period: null,
      asOf: null,
      unavailable: null,
      signals: [],
      byStandard,
      byDomain: this.zeroCoverage(),
    }
  }

  /** Bindings exist but nothing can be valued — every signal says why. */
  private degraded(
    boundKeys: string[],
    byStandard: Record<string, string[]>,
    map: Readonly<Record<string, Readonly<Partial<Record<DomainKey, number>>>>>,
    gradedKeys: Record<string, string[]>,
    period: { id: string; label: string; periodEndDate: string } | null,
    unavailable: { reason: PanelUnavailableReason; message: string },
  ): AccreditationSignalsResponse {
    const signals = boundKeys.map((key) => {
      const meta = METRIC_META.find((m) => m.key === key)
      // The per-row sentence is the PANEL's sentence: a row must not say
      // "import a trial balance" when the actual answer is "that period isn't
      // yours".
      return this.blank(key, meta, {
        reason: 'no_data' as const,
        message: unavailable.message,
      })
    })
    return {
      period,
      asOf: null,
      unavailable,
      signals,
      byStandard,
      byDomain: this.coverage(signals, gradedKeys, map),
    }
  }

  private zeroCoverage(): Record<DomainKey, DomainSignalCoverage> {
    return Object.fromEntries(
      DOMAIN_KEYS.map((k): [DomainKey, DomainSignalCoverage] => [
        k,
        { bound: 0, live: 0, unavailable: 0, keys: [] },
      ]),
    ) as Record<DomainKey, DomainSignalCoverage>
  }

  /**
   * Per-domain coverage over the DISTINCT keys attributed to that domain. A key
   * reaches a domain only through a GRADED standard (dominant framework,
   * non-assurance leaf) carrying ≥ 0.5 weight there — the same population AND
   * the same attribution floor the pure engine's `signalCount` uses, so the
   * Domains tab's "7 signals bound" and this panel's "5 of 7 live" always agree.
   */
  private coverage(
    signals: SignalPublic[],
    gradedKeys: Record<string, string[]>,
    map: Readonly<Record<string, Readonly<Partial<Record<DomainKey, number>>>>>,
  ): Record<DomainKey, DomainSignalCoverage> {
    const liveByKey = new Map(signals.map((s) => [s.key, s.available]))
    const keysByDomain = new Map<DomainKey, Set<string>>(DOMAIN_KEYS.map((k) => [k, new Set()]))
    for (const [standardId, keys] of Object.entries(gradedKeys)) {
      const weights = map[standardId]
      if (!weights) continue
      for (const d of DOMAIN_KEYS) {
        const w = weights[d] ?? 0
        if (w < SIGNAL_ATTRIBUTION_MIN_WEIGHT - DOMAIN_WEIGHT_EPSILON) continue
        const set = keysByDomain.get(d) as Set<string>
        for (const k of keys) if (liveByKey.has(k)) set.add(k)
      }
    }
    const out = this.zeroCoverage()
    for (const d of DOMAIN_KEYS) {
      const set = keysByDomain.get(d) as Set<string>
      // Registry order, the same order the signal list itself is sorted in.
      const keys = METRIC_KEYS.filter((k) => set.has(k)) as string[]
      let live = 0
      for (const k of keys) if (liveByKey.get(k) === true) live += 1
      out[d] = { bound: keys.length, live, unavailable: keys.length - live, keys }
    }
    return out
  }

  // ── One signal ─────────────────────────────────────────────────────────────

  private toSignal(
    key: string,
    result: MetricResult | undefined,
    entitled: Set<ModuleKey>,
    lineage: SignalLineage,
  ): SignalPublic {
    const meta = METRIC_META.find((m) => m.key === key)
    const moduleKey = moduleForMetricKey(key)

    // ENTITLEMENT FIRST, and every value field nulled BEFORE returning. The
    // school learns which module would light this row; it never learns the
    // number behind the module it has not licensed.
    if (!entitled.has(moduleKey)) {
      return this.blank(key, meta, {
        reason: 'module_not_licensed',
        moduleKey,
        message: `Unlock the ${MODULE_META[moduleKey]?.label ?? moduleKey} module to see ${meta?.label ?? key}.`,
      })
    }

    if (!result) {
      // Entitled, but the compute layer returned nothing for this key at all.
      return this.blank(key, meta, {
        reason: 'no_data',
        message: 'Not enough data for this period yet.',
      })
    }

    if (!result.available) {
      const missing = result.inputsMissing ?? []
      return {
        ...this.blank(key, meta, {
          reason: 'inputs_missing',
          inputsMissing: missing,
          message:
            missing.length > 0
              ? `We don't have ${missing.join(', ')} for this period yet.`
              : 'Not enough data for this period yet.',
        }),
        // An unavailable metric still describes a real period — saying WHICH
        // period we looked in is part of the answer.
        asOf: lineage.periodEndDate,
      }
    }

    return {
      key,
      label: result.label,
      unit: result.unit,
      metricDomain: meta?.domain ?? null,
      goodDirection: result.goodDirection,
      formula: result.formula,
      description: result.description,
      available: true,
      value: result.value,
      status: result.status,
      bands: result.bands ?? null,
      periodOverPeriodDelta: result.periodOverPeriodDelta,
      asOf: lineage.periodEndDate,
      lineage,
      unavailable: null,
    }
  }

  /** A signal with NO value of any kind — the only shape an unavailable row takes. */
  private blank(
    key: string,
    meta: (typeof METRIC_META)[number] | undefined,
    unavailable: NonNullable<SignalPublic['unavailable']>,
  ): SignalPublic {
    return {
      key,
      label: meta?.label ?? key,
      unit: meta?.unit ?? 'ratio',
      metricDomain: meta?.domain ?? null,
      goodDirection: meta?.goodDirection ?? 'neutral',
      formula: meta?.formula ?? '',
      description: meta?.description ?? '',
      available: false,
      value: null,
      status: 'neutral',
      bands: null,
      periodOverPeriodDelta: null,
      asOf: null,
      lineage: null,
      unavailable,
    }
  }

  // ── Period resolution ──────────────────────────────────────────────────────

  /**
   * Explicit periodId is tenant-checked (a foreign id resolves to nothing rather
   * than another school's statements); otherwise the newest period that actually
   * HAS saved statements — asking for signals from a period with no snapshot
   * would answer "no data" about a period the school never closed.
   *
   * The two misses are REPORTED SEPARATELY. A caller naming a period this school
   * does not own gets `no_period`; a school with no snapshot-bearing period gets
   * `no_snapshot`. Collapsing them told a school with years of statements to go
   * and import a trial balance because a stale id arrived on the query string.
   */
  private async resolvePeriod(
    schoolId: string,
    periodId?: string,
  ): Promise<{
    period: { id: string; label: string; periodEndDate: Date } | null
    reason: 'no_period' | 'no_snapshot' | null
  }> {
    if (periodId) {
      const owned = await this.periods.getOwnedPeriod(schoolId, periodId).catch(() => null)
      return owned
        ? {
            period: { id: owned.id, label: owned.label, periodEndDate: owned.periodEndDate },
            reason: null,
          }
        : { period: null, reason: 'no_period' }
    }
    const latest = await this.prisma.fiscalPeriod.findFirst({
      where: { schoolId, statementSnapshots: { some: {} } },
      orderBy: { periodEndDate: 'desc' },
      select: { id: true, label: true, periodEndDate: true },
    })
    return latest ? { period: latest, reason: null } : { period: null, reason: 'no_snapshot' }
  }
}

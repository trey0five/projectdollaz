import { Injectable, NotFoundException } from '@nestjs/common'
import type { AccreditationFramework, AccreditationReadinessSnapshot } from '@finrep/db'
import {
  MIN_POINTS_FOR_DIRECTION,
  READINESS_HISTORY_VERSION,
  decomposeReadinessDelta,
  diffLeafScores,
  downsampleMonthly,
  summarizeObservedChange,
  type LeafScore,
  type ObservedChange,
  type ReadinessDecomposition,
  type ReadinessDiff,
  type ReadinessPoint,
  type SeriesBreak,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { BillingService } from '../billing/billing.service.js'
import { NO_FRAMEWORK_SERIES_KEY } from './readiness-snapshot.service.js'
import type { ReadinessDiffQueryDto, ReadinessTrendQueryDto } from './dto/readiness-trend-query.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// Accreditation Intelligence Phase A — the READ side of the readiness series.
//
// Prisma-only. Every number this service returns was either recorded by the
// nightly capture or computed by the PURE @finrep/compliance history functions —
// it does no arithmetic of its own, so the API and the unit tests can never
// disagree about what a change means.
//
// The three honesty rules this file exists to enforce:
//   1. A window we cannot defend returns `insufficient_history` WITH A REASON,
//      never a plausible-looking number.
//   2. A comparability BREAK (scope changed, framework changed, engine changed)
//      is surfaced explicitly and forces the direction to insufficient_history;
//      the chart draws a gap rather than a line through it.
//   3. Every readiness figure travels as the DOCUMENTED / DEFENSIBLE pair.
// ─────────────────────────────────────────────────────────────────────────────

/** The standing disclaimer carried on every readiness-history payload. */
export const READINESS_DISCLAIMER =
  "Self-assessment produced by KYRO from school-entered and integrated data. Not an accreditation product; not affiliated with, endorsed by, or a submission to Cognia, MSA-CESS or WCEA. The accreditor's portal remains the authoritative repository."

const DEFAULT_WINDOW_DAYS = 365

export interface ReadinessSeriesEntry {
  seriesKey: string
  frameworkId: string | null
  code: string | null
  name: string
  accreditor: string | null
  leafCount: number
  pointCount: number
  firstPointAt: string | null
  lastPointAt: string | null
  indexComparable: boolean
}

export interface ReadinessSeriesResponse {
  seriesStartsAt: string | null
  requiresSelection: boolean
  defaultSeriesKey: string | null
  series: ReadinessSeriesEntry[]
  demoData: boolean
}

export interface BoardMarker {
  available: boolean
  since: string | null
  label: string | null
  deltaPct: number | null
  reason: string | null
}

export interface ReadinessTrendResponse {
  seriesKey: string | null
  requiresSelection: boolean
  framework: {
    id: string
    code: string
    name: string
    indexMin: number | null
    indexMax: number | null
    defaultTarget: number | null
  } | null
  seriesStartsAt: string | null
  granularity: 'day' | 'month'
  points: ReadinessPoint[]
  change: ObservedChange
  decomposition: ReadinessDecomposition | null
  breaks: SeriesBreak[]
  boardMarker: BoardMarker
  indexComparable: boolean
  engineVersion: string
  demoData: boolean
  disclaimer: string
}

export interface ReadinessDiffResponse extends ReadinessDiff {
  seriesKey: string
  from: string
  to: string
  fromDate: string
  toDate: string
  counts: Record<keyof ReadinessDiff, number>
  decomposition: ReadinessDecomposition
  demoData: boolean
}

/** Columns every read path needs; leafScores is fetched only where it is used. */
const POINT_SELECT = {
  snapshotDate: true,
  readinessPct: true,
  selfScoredPct: true,
  verifiedPct: true,
  projectedIndex: true,
  band: true,
  leafCount: true,
  scoredCount: true,
  coveredCount: true,
  engineVersion: true,
  frameworkId: true,
  isDemo: true,
  // AIC Phase C — the definition `verifiedPct` was recorded under. Already-
  // recorded rows carry the column default 'exists'; Phase C writes 'current'.
  verifiedBasis: true,
} as const

type PointRow = Pick<AccreditationReadinessSnapshot, keyof typeof POINT_SELECT>

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function toUtcDay(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`)
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d.getTime())
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

function asLeafScores(raw: unknown): LeafScore[] {
  return Array.isArray(raw) ? (raw as LeafScore[]) : []
}

@Injectable()
export class AccreditationReadinessHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  // ── /series ────────────────────────────────────────────────────────────────

  async getSeries(schoolId: string): Promise<ReadinessSeriesResponse> {
    const entries = await this.listSeries(schoolId)
    const starts = entries
      .map((e) => e.firstPointAt)
      .filter((d): d is string => d !== null)
      .sort()
    // DEMO-NESS IS A PROPERTY OF THE RECORD, NOT OF ITS NEWEST ROW. Any
    // fabricated reading anywhere in this school's history is enough to make
    // the whole payload demo data — a single genuine row appended on top must
    // never be able to strip the DEMO DATA chip off 36 invented months.
    const demoRow = await this.prisma.accreditationReadinessSnapshot.findFirst({
      where: { schoolId, isDemo: true },
      select: { isDemo: true },
    })

    return {
      seriesStartsAt: starts[0] ?? null,
      requiresSelection: entries.length > 1,
      defaultSeriesKey: this.defaultSeriesKey(entries),
      series: entries,
      demoData: demoRow !== null,
    }
  }

  // ── /trend ─────────────────────────────────────────────────────────────────

  async getTrend(schoolId: string, query: ReadinessTrendQueryDto): Promise<ReadinessTrendResponse> {
    const entries = await this.listSeries(schoolId)
    const seriesKey = query.seriesKey ?? this.defaultSeriesKey(entries)
    const granularity: 'day' | 'month' = query.granularity ?? 'day'
    const entry = entries.find((e) => e.seriesKey === seriesKey) ?? null

    const to = query.to ? toUtcDay(query.to) : toUtcDay(isoDay(new Date()))
    const from = query.from ? toUtcDay(query.from) : addDays(to, -DEFAULT_WINDOW_DAYS)

    const framework = await this.frameworkFor(entry)
    const empty = this.emptyTrend(seriesKey, entries, entry, framework, granularity)
    if (seriesKey === null) return empty

    // RAW daily rows in the window. Breaks are detected on these, never on the
    // downsampled series — a month rollup must not be able to hide a scope change.
    const rows = (await this.prisma.accreditationReadinessSnapshot.findMany({
      where: { schoolId, seriesKey, snapshotDate: { gte: from, lte: to } },
      orderBy: { snapshotDate: 'asc' },
      select: POINT_SELECT,
    })) as PointRow[]

    if (rows.length === 0) return empty

    const breaks = this.detectBreaks(rows)
    const rawPoints = rows.map((r) => this.toPoint(r))
    const points = granularity === 'month' ? downsampleMonthly(rawPoints) : rawPoints
    const change = summarizeObservedChange(points, breaks)

    const decomposition =
      points.length >= MIN_POINTS_FOR_DIRECTION
        ? await this.decomposeBetween(schoolId, seriesKey, points[0].date, points[points.length - 1].date)
        : null

    const boardMarker = await this.boardMarker(schoolId, seriesKey, rows[rows.length - 1])

    return {
      seriesKey,
      requiresSelection: entries.length > 1,
      framework: framework
        ? {
            id: framework.id,
            code: framework.code,
            name: framework.name,
            indexMin: framework.indexMin,
            indexMax: framework.indexMax,
            defaultTarget: framework.defaultTarget,
          }
        : null,
      seriesStartsAt: entry?.firstPointAt ?? null,
      granularity,
      points,
      change,
      decomposition,
      breaks,
      boardMarker,
      indexComparable: entry?.indexComparable ?? false,
      engineVersion: READINESS_HISTORY_VERSION,
      demoData: rows[rows.length - 1].isDemo,
      disclaimer: READINESS_DISCLAIMER,
    }
  }

  // ── /diff ──────────────────────────────────────────────────────────────────

  async getDiff(schoolId: string, query: ReadinessDiffQueryDto): Promise<ReadinessDiffResponse> {
    const entries = await this.listSeries(schoolId)
    const seriesKey = query.seriesKey ?? this.defaultSeriesKey(entries)
    if (seriesKey === null) throw this.noSnapshotBefore(query.from)

    const fromRow = await this.snapOnOrBefore(schoolId, seriesKey, query.from)
    if (fromRow === null) throw this.noSnapshotBefore(query.from)
    const toRow = await this.snapOnOrBefore(schoolId, seriesKey, query.to)
    if (toRow === null) throw this.noSnapshotBefore(query.to)

    const fromLeaves = asLeafScores(fromRow.leafScores)
    const toLeaves = asLeafScores(toRow.leafScores)
    const diff = diffLeafScores(fromLeaves, toLeaves)

    return {
      seriesKey,
      from: query.from,
      to: query.to,
      fromDate: isoDay(fromRow.snapshotDate),
      toDate: isoDay(toRow.snapshotDate),
      ...diff,
      counts: {
        improved: diff.improved.length,
        declined: diff.declined.length,
        newlyScored: diff.newlyScored.length,
        unscored: diff.unscored.length,
        evidenceGained: diff.evidenceGained.length,
        evidenceLost: diff.evidenceLost.length,
        scopeAdded: diff.scopeAdded.length,
        scopeRemoved: diff.scopeRemoved.length,
      },
      decomposition: decomposeReadinessDelta(fromLeaves, toLeaves),
      demoData: toRow.isDemo,
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private noSnapshotBefore(day: string): NotFoundException {
    return new NotFoundException({
      code: 'NO_SNAPSHOT_BEFORE',
      message: `No readiness reading was recorded on or before ${day} for this series.`,
    })
  }

  /** The newest recorded reading on or before `day`, within the series. */
  private async snapOnOrBefore(
    schoolId: string,
    seriesKey: string,
    day: string,
  ): Promise<{ snapshotDate: Date; leafScores: unknown; isDemo: boolean } | null> {
    return this.prisma.accreditationReadinessSnapshot.findFirst({
      where: { schoolId, seriesKey, snapshotDate: { lte: toUtcDay(day) } },
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true, leafScores: true, isDemo: true },
    })
  }

  /**
   * Every series this school has RECORDED history for, with its latest leaf
   * count. Note this is derived from the snapshots themselves, not from the live
   * register — a series that stopped being captured still has a readable past.
   */
  private async listSeries(schoolId: string): Promise<ReadinessSeriesEntry[]> {
    const groups = await this.prisma.accreditationReadinessSnapshot.groupBy({
      by: ['seriesKey'],
      where: { schoolId },
      _count: { _all: true },
      _min: { snapshotDate: true },
      _max: { snapshotDate: true },
    })
    if (groups.length === 0) return []

    const latestBySeries = await Promise.all(
      groups.map((g) =>
        this.prisma.accreditationReadinessSnapshot.findFirst({
          where: { schoolId, seriesKey: g.seriesKey },
          orderBy: { snapshotDate: 'desc' },
          select: { leafCount: true, frameworkId: true },
        }),
      ),
    )

    const frameworkIds = latestBySeries
      .map((r) => r?.frameworkId ?? null)
      .filter((id): id is string => id !== null)
    const frameworks =
      frameworkIds.length === 0
        ? []
        : await this.prisma.accreditationFramework.findMany({ where: { id: { in: frameworkIds } } })
    const fwById = new Map(frameworks.map((f) => [f.id, f]))

    const entries = groups.map((g, i) => {
      const latest = latestBySeries[i]
      const fw = latest?.frameworkId ? (fwById.get(latest.frameworkId) ?? null) : null
      return {
        seriesKey: g.seriesKey,
        frameworkId: fw?.id ?? null,
        code: fw?.code ?? null,
        name: fw?.name ?? 'Standards not linked to a framework',
        accreditor: fw?.accreditor ?? null,
        leafCount: latest?.leafCount ?? 0,
        pointCount: g._count._all,
        firstPointAt: g._min.snapshotDate ? isoDay(g._min.snapshotDate) : null,
        lastPointAt: g._max.snapshotDate ? isoDay(g._max.snapshotDate) : null,
        indexComparable: fw?.indexMax != null,
      }
    })
    entries.sort((a, b) => a.seriesKey.localeCompare(b.seriesKey))
    return entries
  }

  /** Most leaves wins; tie → seriesKey ascending. Never the dominant-framework heuristic. */
  private defaultSeriesKey(entries: readonly ReadinessSeriesEntry[]): string | null {
    if (entries.length === 0) return null
    const ranked = [...entries].sort(
      (a, b) => b.leafCount - a.leafCount || a.seriesKey.localeCompare(b.seriesKey),
    )
    return ranked[0].seriesKey
  }

  private async frameworkFor(
    entry: ReadinessSeriesEntry | null,
  ): Promise<AccreditationFramework | null> {
    if (!entry || entry.frameworkId === null) return null
    return this.prisma.accreditationFramework.findFirst({ where: { id: entry.frameworkId } })
  }

  private toPoint(r: PointRow): ReadinessPoint {
    return {
      date: isoDay(r.snapshotDate),
      readinessPct: r.readinessPct,
      selfScoredPct: r.selfScoredPct,
      verifiedPct: r.verifiedPct,
      projectedIndex: r.projectedIndex,
      band: r.band,
      leafCount: r.leafCount,
      scoredCount: r.scoredCount,
      coveredCount: r.coveredCount,
    }
  }

  /**
   * Comparability breaks between consecutive recorded readings. All FOUR kinds
   * now fire: Phase C landed the fourth, `verified_definition_changed`, on the
   * day `verifiedPct` stopped meaning "an artifact exists" and started meaning
   * "an artifact we cannot prove is out of date exists". The chart shows that as
   * a discontinuity rather than as a sudden decline, and `summarizeObservedChange`
   * refuses to report a direction across it.
   */
  private detectBreaks(rows: readonly PointRow[]): SeriesBreak[] {
    const out: SeriesBreak[] = []
    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1]
      const cur = rows[i]
      const date = isoDay(cur.snapshotDate)
      if (cur.leafCount !== prev.leafCount) {
        out.push({
          date,
          kind: 'leaf_count_changed',
          detail: `Standards in scope changed from ${prev.leafCount} to ${cur.leafCount}.`,
        })
      }
      if (cur.frameworkId !== prev.frameworkId) {
        out.push({
          date,
          kind: 'framework_changed',
          detail: 'The framework behind this series changed.',
        })
      }
      if (cur.engineVersion !== prev.engineVersion) {
        out.push({
          date,
          kind: 'engine_version_changed',
          detail: `The readiness engine changed from ${prev.engineVersion} to ${cur.engineVersion}.`,
        })
      }
      // AIC Phase C. A COLUMN, not a clock and not a version bump: the first
      // Phase-C capture flips 'exists' → 'current' exactly once, permanently
      // anchored to the real deploy date. READINESS_HISTORY_VERSION deliberately
      // stays '1.0.0' — bumping it would fire engine_version_changed on the same
      // day and double-report one event.
      if (cur.verifiedBasis !== prev.verifiedBasis) {
        out.push({
          date,
          kind: 'verified_definition_changed',
          detail:
            'Defensible readiness now counts only evidence that is not known to be out of date. ' +
            'Readings before this date counted any evidence that existed.',
        })
      }
    }
    return out
  }

  /** The four-way attribution between two recorded readings' stored leaf detail. */
  private async decomposeBetween(
    schoolId: string,
    seriesKey: string,
    fromDay: string,
    toDay: string,
  ): Promise<ReadinessDecomposition | null> {
    const [first, last] = await Promise.all([
      this.prisma.accreditationReadinessSnapshot.findFirst({
        where: { schoolId, seriesKey, snapshotDate: toUtcDay(fromDay) },
        select: { leafScores: true },
      }),
      this.prisma.accreditationReadinessSnapshot.findFirst({
        where: { schoolId, seriesKey, snapshotDate: toUtcDay(toDay) },
        select: { leafScores: true },
      }),
    ])
    if (!first || !last) return null
    return decomposeReadinessDelta(asLeafScores(first.leafScores), asLeafScores(last.leafScores))
  }

  /**
   * "What has moved since the board last met." FAIL-SOFT by contract: an
   * unlicensed governance module, no approved minutes, or no reading old enough
   * to compare against all return `available:false` with a machine-readable
   * reason — never a 402 and never a fabricated baseline.
   */
  private async boardMarker(
    schoolId: string,
    seriesKey: string,
    latest: PointRow,
  ): Promise<BoardMarker> {
    const unavailable = (reason: string): BoardMarker => ({
      available: false,
      since: null,
      label: null,
      deltaPct: null,
      reason,
    })

    const licensed = await this.billing
      .isEntitledForModule(schoolId, 'governance')
      .catch(() => false)
    if (!licensed) return unavailable('governance_not_licensed')

    const today = toUtcDay(isoDay(new Date()))
    const meeting = await this.prisma.meeting.findFirst({
      where: { schoolId, minutesStatus: 'approved', scheduledAt: { lt: today } },
      orderBy: { scheduledAt: 'desc' },
      select: { scheduledAt: true },
    })
    if (!meeting) return unavailable('no_approved_minutes')

    const since = isoDay(meeting.scheduledAt)
    const baseline = await this.prisma.accreditationReadinessSnapshot.findFirst({
      where: { schoolId, seriesKey, snapshotDate: { lte: meeting.scheduledAt } },
      orderBy: { snapshotDate: 'desc' },
      select: { readinessPct: true },
    })
    if (!baseline) return unavailable('no_reading_before_meeting')

    return {
      available: true,
      since,
      label: 'your last board meeting',
      deltaPct: latest.readinessPct - baseline.readinessPct,
      reason: null,
    }
  }

  /** The honest empty payload: points we do not have are absent, not zeroed. */
  private emptyTrend(
    seriesKey: string | null,
    entries: readonly ReadinessSeriesEntry[],
    entry: ReadinessSeriesEntry | null,
    framework: AccreditationFramework | null,
    granularity: 'day' | 'month',
  ): ReadinessTrendResponse {
    return {
      seriesKey,
      requiresSelection: entries.length > 1,
      framework: framework
        ? {
            id: framework.id,
            code: framework.code,
            name: framework.name,
            indexMin: framework.indexMin,
            indexMax: framework.indexMax,
            defaultTarget: framework.defaultTarget,
          }
        : null,
      seriesStartsAt: entry?.firstPointAt ?? null,
      granularity,
      points: [],
      change: summarizeObservedChange([], []),
      decomposition: null,
      breaks: [],
      boardMarker: {
        available: false,
        since: null,
        label: null,
        deltaPct: null,
        reason: 'no_readings',
      },
      indexComparable: entry?.indexComparable ?? false,
      engineVersion: READINESS_HISTORY_VERSION,
      demoData: false,
      disclaimer: READINESS_DISCLAIMER,
    }
  }
}

/** Re-exported for the seeder/tests so the 'none' key has one definition. */
export { NO_FRAMEWORK_SERIES_KEY }

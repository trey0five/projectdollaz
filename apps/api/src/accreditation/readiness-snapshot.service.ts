import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { createHash } from 'node:crypto'
import type { AccreditationStandard } from '@finrep/db'
import {
  READINESS_HISTORY_VERSION,
  computeDomainReadiness,
  schoolReadiness,
  selfScoredPct,
  verifiedPctCurrent,
  type DomainKey,
  type LeafScore,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { BillingService } from '../billing/billing.service.js'
import { isAssuranceLeaf, leavesOf } from './leaf-scope.js'
import {
  assuranceIdsFrom,
  buildDomainMap,
  readCatalogDomainRows,
  type CatalogDomainRow,
} from './domain-map.js'
import {
  computeEvidenceCounts,
  fixedWindowsFrom,
  type CurrencyCountsPrisma,
  type CurrencyEvidenceRow,
} from './evidence-anchors.js'

// ─────────────────────────────────────────────────────────────────────────────
// Accreditation Intelligence Phase A — the nightly READINESS CAPTURE.
//
// Readiness is computed live on every page load; nothing was ever RECORDED. That
// means the product could show "where you are" but could never answer "what
// changed since the board last met" without inventing history. This service is
// the fix: an append-only row per (school, series, day).
//
// THE SERIES KEY IS THE FRAMEWORK CODE — never the read-time "dominant
// framework" heuristic that AccreditationReadinessService uses. That heuristic
// re-resolves on every read and FLIPS the moment a school adopts a second
// framework; keying a time series on it would silently swap what the chart
// measures and present the swap as a change in performance. A school on two
// frameworks simply writes two independent series, plus a 'none' series for any
// standards linked to no framework at all.
//
// HONESTY: a snapshot records ONLY what the frozen engine computed from data
// that existed at capture time. Nothing is interpolated, back-filled or
// smoothed. A day with no capture stays a hole in the record, and the read side
// says so rather than drawing through it.
//
// Runs per instance. Under horizontal scaling it may run on >1 replica; the
// upsert + payload-hash dedupe make double-runs harmless (the same discipline as
// RetentionService, whose @Cron precedent this follows).
// ─────────────────────────────────────────────────────────────────────────────

/** The 'none' series: standards a school tracks that belong to no framework. */
export const NO_FRAMEWORK_SERIES_KEY = 'none'

/** Keep every daily row this long; older rows are thinned to one per month. */
export const DAILY_RETENTION_DAYS = 400

/** Rows read per prune page — the scan is cursor-paged, never loaded whole. */
const PRUNE_PAGE_SIZE = 1000

/** Max schools captured in parallel — a nightly job must not stampede the pool. */
const CAPTURE_CONCURRENCY = 4

/**
 * ONE domain's reading as the record stores it. `label` and `reason` are
 * deliberately NOT stored: they are presentation text, fully regenerable from
 * the key, and freezing a sentence into the historical record would mean a copy
 * edit rewrote history. `readinessPct` is NULL for an unmeasured domain — never
 * 0, in the record exactly as on the screen.
 */
export interface DomainScoreRecord {
  domainKey: DomainKey
  readinessPct: number | null
  selfScoredPct: number | null
  verifiedPct: number | null
  covered: boolean
  measured: boolean
  contributingLeafCount: number
  effectiveLeafWeight: number
  signalCount: number
}

/**
 * AIC Phase C — the stored per-leaf detail gains `currentEvidenceCount`
 * alongside the Phase-A `evidenceCount`. ADDITIVE: diffLeafScores still reads
 * only `evidenceCount`, so a pre/post-deploy diff can never report a phantom
 * `evidenceLost`, and historical rows are never rewritten.
 */
export interface LeafScoreRecord extends LeafScore {
  currentEvidenceCount: number
}

/** One series' worth of composed, ready-to-write numbers. */
interface ComposedSeries {
  seriesKey: string
  frameworkId: string | null
  catalogVersion: string | null
  readinessPct: number
  selfScoredPct: number
  verifiedPct: number
  projectedIndex: number | null
  band: string | null
  leafCount: number
  scoredCount: number
  coveredCount: number
  leafScores: LeafScoreRecord[]
  domainScores: DomainScoreRecord[]
  /** 'exists' (Phase A) | 'current' (Phase C). Phase C always writes 'current'. */
  verifiedBasis: string
  payloadHash: string
}

/**
 * The definition `verifiedPct` was recorded under. Phase C writes 'current'
 * forever; every already-recorded row carries the column default 'exists'. That
 * is what produces EXACTLY ONE `verified_definition_changed` break, permanently
 * anchored to the real deploy date — deterministic forever, and needing no clock.
 */
export const VERIFIED_BASIS_CURRENT = 'current'

/** Deterministic JSON: object keys sorted, so an unrelated key-order change can
 *  never look like a data change to the dedupe hash. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

/** UTC-midnight Date for the calendar day of `at` (the @db.Date discipline). */
function toUtcDay(at: Date): Date {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 0, 0, 0, 0),
  )
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

@Injectable()
export class AccreditationSnapshotService {
  private readonly logger = new Logger(AccreditationSnapshotService.name)

  /**
   * Event-capture debounce: `${schoolId}:${yyyy-mm-dd}`. A burst of rubric edits
   * must not fire a burst of captures — the first one that day wins and the
   * nightly run is authoritative. Cleared at the top of every nightly run.
   */
  private readonly eventDebounce = new Set<string>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async captureAll(): Promise<void> {
    this.eventDebounce.clear()
    const startedAt = Date.now()
    try {
      // Eligible = has a standards register at all. Entitlement is re-checked per
      // school below (a school that stopped paying stops accruing history).
      const withStandards = await this.prisma.accreditationStandard.groupBy({
        by: ['schoolId'],
        _count: { _all: true },
      })
      const schoolIds = withStandards.map((r) => r.schoolId)

      let written = 0
      let skipped = 0
      await this.mapWithConcurrency(schoolIds, CAPTURE_CONCURRENCY, async (schoolId) => {
        // READ-ONLY entitlement probe FIRST. BillingService.isEntitledForModule
        // goes through getOrCreateSubscription, which CREATES a fresh 14-day
        // trial row for any school that lacks one. A 3AM housekeeping job must
        // never grant a subscription as a side effect of looking, so a school
        // with no billing row is skipped outright rather than provisioned.
        const hasBilling = await this.prisma.subscription.findUnique({
          where: { schoolId },
          select: { id: true },
        })
        if (!hasBilling) {
          skipped += 1
          return
        }
        const licensed = await this.billing
          .isEntitledForModule(schoolId, 'accreditation')
          .catch(() => false)
        if (!licensed) {
          skipped += 1
          return
        }
        written += await this.captureForSchool(schoolId, 'nightly')
      })

      await this.prune()
      this.logger.log(
        `readiness capture: ${written} row(s) across ${schoolIds.length - skipped} school(s), ${skipped} unlicensed, ${Date.now() - startedAt}ms`,
      )
    } catch (err) {
      // A housekeeping job must never take the process down.
      this.logger.error(`readiness capture failed: ${(err as Error).message}`)
    }
  }

  /**
   * Capture every series for one school. Returns the number of rows written
   * (0 when nothing changed — see the hash dedupe below).
   *
   * NOTE ON COMPOSITION: this does the SAME two queries as
   * AccreditationReadinessService (one standards findMany + one evidence
   * groupBy) and feeds the SAME frozen pure engine (`schoolReadiness`). It does
   * not call getReadiness() per series because (a) getReadiness cannot return
   * the per-leaf detail a snapshot must store, and (b) one query set guarantees
   * every series in a night describes the same instant — N separate calls could
   * straddle a concurrent edit and record a school state that never existed.
   */
  async captureForSchool(
    schoolId: string,
    reason: 'nightly' | 'event' | 'demo_seed',
    at: Date = new Date(),
  ): Promise<number> {
    const snapshotDate = toUtcDay(at)
    // The capture's OWN instant, not the wall clock: a backfill or a demo_seed
    // run must record the Defensible figure as it stood on `snapshotDate`, or a
    // fully backfilled series would carry today's staleness at every point.
    const composed = await this.composeSeries(schoolId, at)
    if (composed.length === 0) return 0

    let written = 0
    for (const series of composed) {
      const newest = await this.prisma.accreditationReadinessSnapshot.findFirst({
        where: { schoolId, seriesKey: series.seriesKey },
        orderBy: { snapshotDate: 'desc' },
        select: { payloadHash: true, snapshotDate: true, isDemo: true },
      })

      // DEMO IS A PROPERTY OF THE SERIES, NOT OF ONE ROW. `demoData` is read off
      // the newest reading, so a real capture appended to a fabricated series
      // would flip the payload to demoData:false and launder 36 invented months
      // into "the school's record". Once a series contains demo history, every
      // later row in it inherits the flag and the DEMO DATA chip stays up.
      const isDemo = reason === 'demo_seed' || newest?.isDemo === true

      // DEDUPE: nothing about this series changed since the last recorded
      // reading, so there is nothing new to record. Writing an identical row
      // every night would inflate the record and make "42 readings" a lie about
      // how much we actually know. A same-day re-run still upserts (below), so
      // today's row is never left stale.
      const sameDay =
        newest !== null && isoDay(newest.snapshotDate) === isoDay(snapshotDate)
      if (newest !== null && newest.payloadHash === series.payloadHash && !sameDay) continue

      await this.prisma.accreditationReadinessSnapshot.upsert({
        where: {
          schoolId_seriesKey_snapshotDate: {
            schoolId,
            seriesKey: series.seriesKey,
            snapshotDate,
          },
        },
        create: {
          schoolId,
          frameworkId: series.frameworkId,
          seriesKey: series.seriesKey,
          snapshotDate,
          reason,
          readinessPct: series.readinessPct,
          selfScoredPct: series.selfScoredPct,
          verifiedPct: series.verifiedPct,
          projectedIndex: series.projectedIndex,
          band: series.band,
          leafCount: series.leafCount,
          scoredCount: series.scoredCount,
          coveredCount: series.coveredCount,
          // Phase B: the ten domain readings as of this capture — always ten
          // records, unmeasured domains storing null (never 0).
          domainScores: series.domainScores as unknown as object,
          leafScores: series.leafScores as unknown as object,
          engineVersion: READINESS_HISTORY_VERSION,
          catalogVersion: series.catalogVersion,
          verifiedBasis: series.verifiedBasis,
          payloadHash: series.payloadHash,
          isDemo,
        },
        update: {
          frameworkId: series.frameworkId,
          reason,
          readinessPct: series.readinessPct,
          selfScoredPct: series.selfScoredPct,
          verifiedPct: series.verifiedPct,
          projectedIndex: series.projectedIndex,
          band: series.band,
          leafCount: series.leafCount,
          scoredCount: series.scoredCount,
          coveredCount: series.coveredCount,
          domainScores: series.domainScores as unknown as object,
          leafScores: series.leafScores as unknown as object,
          engineVersion: READINESS_HISTORY_VERSION,
          catalogVersion: series.catalogVersion,
          verifiedBasis: series.verifiedBasis,
          payloadHash: series.payloadHash,
          // Re-asserted on every same-day overwrite: without it the flag would
          // be write-once and a re-run could leave a demo row unlabelled.
          isDemo,
        },
      })
      written += 1
    }
    return written
  }

  /**
   * Fire-and-forget capture after a write that can move readiness (rubric score,
   * evidence added/removed). Debounced to once per school per day: a write path
   * must NEVER be blocked or slowed by snapshotting, and the nightly run is the
   * authoritative record either way.
   */
  captureOnEvent(schoolId: string): void {
    const key = `${schoolId}:${isoDay(new Date())}`
    if (this.eventDebounce.has(key)) return
    this.eventDebounce.add(key)
    void this.captureForSchool(schoolId, 'event').catch((err: Error) => {
      this.eventDebounce.delete(key)
      this.logger.warn(`event readiness capture failed for ${schoolId}: ${err.message}`)
    })
  }

  /**
   * Retention: every daily row is kept for DAILY_RETENTION_DAYS; beyond that we
   * keep the LAST row of each calendar month per series. Thinning old detail is
   * honest (the kept row is a real reading, never an average); deleting the
   * series would not be.
   */
  async prune(at: Date = new Date()): Promise<number> {
    const cutoff = toUtcDay(at)
    cutoff.setUTCDate(cutoff.getUTCDate() - DAILY_RETENTION_DAYS)

    // CURSOR-PAGED, never a whole-table load. The aged-out set is cross-tenant
    // and grows monotonically with the platform's age — reading it all into the
    // API container's heap at 3AM, every night, for a delete set that is almost
    // always empty, is work that scales with history rather than with the month
    // that just aged out. Streaming keeps peak memory at one page plus the
    // keeper map (one entry per school × series × calendar month).
    //
    // Rows arrive oldest-first, so within any (school, series, month) bucket the
    // LAST row seen is that month's latest reading: the previous holder of the
    // bucket is retired as soon as a later one appears, and whatever holds each
    // bucket when the scan ends survives.
    const keeper = new Map<string, string>()
    let doomed: string[] = []
    let deleted = 0
    let cursorId: string | null = null

    const flush = async (force: boolean): Promise<void> => {
      while (doomed.length >= 500 || (force && doomed.length > 0)) {
        const chunk = doomed.slice(0, 500)
        doomed = doomed.slice(500)
        const res = await this.prisma.accreditationReadinessSnapshot.deleteMany({
          where: { id: { in: chunk } },
        })
        deleted += res.count
      }
    }

    for (;;) {
      const page: { id: string; schoolId: string; seriesKey: string; snapshotDate: Date }[] =
        await this.prisma.accreditationReadinessSnapshot.findMany({
          where: { snapshotDate: { lt: cutoff } },
          select: { id: true, schoolId: true, seriesKey: true, snapshotDate: true },
          orderBy: [{ snapshotDate: 'asc' }, { id: 'asc' }],
          take: PRUNE_PAGE_SIZE,
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        })
      if (page.length === 0) break

      for (const row of page) {
        const bucket = `${row.schoolId}:${row.seriesKey}:${isoDay(row.snapshotDate).slice(0, 7)}`
        const previous = keeper.get(bucket)
        if (previous) doomed.push(previous)
        keeper.set(bucket, row.id)
      }

      // The cursor row is always this page's LAST row, and a row is only ever
      // retired once a LATER one displaces it — so the cursor can never be in
      // the batch we are about to delete.
      cursorId = page[page.length - 1].id
      await flush(false)
      if (page.length < PRUNE_PAGE_SIZE) break
    }

    await flush(true)
    return deleted
  }

  // ── Composition ────────────────────────────────────────────────────────────

  /**
   * One series per adopted framework, plus 'none' when the school tracks any
   * standard linked to no framework. Mirrors AccreditationReadinessService's
   * scoping exactly: LEAF = a standard no other school standard parents, and
   * catalog assurance gates are excluded from the rubric/index math.
   */
  private async composeSeries(schoolId: string, at: Date = new Date()): Promise<ComposedSeries[]> {
    const rows = await this.prisma.accreditationStandard.findMany({ where: { schoolId } })
    if (rows.length === 0) return []

    // Phase C: the same SINGLE evidence read now also carries the four currency
    // columns, so the DEFENSIBLE half of every recorded series is computed from
    // exactly the data its readiness figure was computed from.
    const evidenceRows = await this.readEvidenceRows(schoolId)
    const countBy = new Map<string, number>()
    for (const e of evidenceRows) countBy.set(e.standardId, (countBy.get(e.standardId) ?? 0) + 1)

    // Leaf scoping is the SHARED definition (leaf-scope.ts) that
    // AccreditationReadinessService uses for the live number, so the recorded
    // series and the hero can never drift apart on "which standards count".
    const leaves = leavesOf(rows, rows)

    const frameworkIds = [
      ...new Set(leaves.map((r) => r.frameworkId).filter((id): id is string => id !== null)),
    ]
    const frameworks =
      frameworkIds.length === 0
        ? []
        : await this.prisma.accreditationFramework.findMany({ where: { id: { in: frameworkIds } } })

    // ONE catalog read for the assurance split AND the Phase-B domain map (same
    // findMany, wider select) — the recorded grid is built from exactly the
    // catalog state the recorded readiness figure was built from.
    const catalogRows = await this.catalogRowsFor(leaves)
    const assuranceCatalogIds = assuranceIdsFrom(catalogRows)

    // Phase C: the DEFENSIBLE count, computed ONCE for the whole school so every
    // series in a night describes the same instant.
    const requirementRows = await this.requirementRowsFor(leaves)
    const { currentEvidenceCount } = await computeEvidenceCounts(
      this.prisma as unknown as CurrencyCountsPrisma,
      schoolId,
      evidenceRows,
      new Map(leaves.map((r) => [r.id, r.catalogStandardId ?? null])),
      fixedWindowsFrom(requirementRows),
      at,
    )

    const out: ComposedSeries[] = []
    for (const fw of frameworks) {
      const scoped = leaves.filter((r) => r.frameworkId === fw.id)
      out.push(
        this.compose(
          fw.code,
          fw.id,
          fw.version,
          scoped,
          countBy,
          currentEvidenceCount,
          assuranceCatalogIds,
          catalogRows,
          { indexMin: fw.indexMin, indexMax: fw.indexMax, statusBands: this.bandsOf(fw.statusBands) },
        ),
      )
    }

    const unlinked = leaves.filter((r) => r.frameworkId === null)
    if (unlinked.length > 0) {
      out.push(
        this.compose(
          NO_FRAMEWORK_SERIES_KEY,
          null,
          null,
          unlinked,
          countBy,
          currentEvidenceCount,
          // Framework-LESS mode applies no assurance split — the live read
          // (AccreditationReadinessService.catalogRowsFor short-circuits to an
          // empty set when framework is null) does exactly this, and the
          // 'none' series must record the same number the hero shows.
          new Set<string>(),
          // No catalog rows either: a standard linked to no framework belongs to
          // no accreditor domain. The 'none' series records ten UNCOVERED
          // domains rather than guessing where the school's own codes belong.
          [],
          null,
        ),
      )
    }

    // Deterministic order so a capture log reads the same every night.
    out.sort((a, b) => a.seriesKey.localeCompare(b.seriesKey))
    return out
  }

  private compose(
    seriesKey: string,
    frameworkId: string | null,
    catalogVersion: string | null,
    scopedLeaves: AccreditationStandard[],
    countBy: Map<string, number>,
    currentBy: Map<string, number>,
    assuranceCatalogIds: Set<string>,
    catalogRows: readonly CatalogDomainRow[],
    framework: { indexMin: number | null; indexMax: number | null; statusBands: { min: number; label: string }[] } | null,
  ): ComposedSeries {
    // Assurance gates are binary checklist items, not rubric-scored standards —
    // the frozen engine excludes them and so must the recorded series.
    const scored = scopedLeaves.filter((r) => !isAssuranceLeaf(r, assuranceCatalogIds))
    const leafScores: LeafScoreRecord[] = scored
      .map((r) => ({
        standardId: r.id,
        code: r.code,
        rubricScore: r.rubricScore ?? null,
        evidenceCount: countBy.get(r.id) ?? 0,
        // Phase C, additive: what the DEFENSIBLE figure was actually built from.
        currentEvidenceCount: currentBy.get(r.id) ?? 0,
      }))
      .sort((a, b) => a.code.localeCompare(b.code) || a.standardId.localeCompare(b.standardId))

    const summary = schoolReadiness(
      leafScores.map((l) => ({ ...l, title: '' })),
      framework,
    )

    // Phase B — the ten domain readings over the SAME non-assurance leaves this
    // series' headline figures were computed from.
    const { map, signalKeys } = buildDomainMap(scored, catalogRows)
    const domainScores: DomainScoreRecord[] = computeDomainReadiness(
      leafScores.map((l) => ({ ...l, title: '' })),
      map,
      { signalKeys },
    ).map((d) => ({
      domainKey: d.domainKey,
      readinessPct: d.readinessPct,
      selfScoredPct: d.selfScoredPct,
      verifiedPct: d.verifiedPct,
      covered: d.covered,
      measured: d.measured,
      contributingLeafCount: d.contributingLeafCount,
      effectiveLeafWeight: d.effectiveLeafWeight,
      signalCount: d.signalCount,
    }))

    // domainScores JOINS THE DEDUPE HASH, alongside engineVersion/catalogVersion/
    // seriesKey/leafScores. A catalog map correction that leaves every rubric
    // score untouched IS new recorded information: without it the dedupe would
    // pin a stale grid in the record forever while the live page showed the
    // corrected one. The cost is honest and bounded — on the first nightly run
    // after a map change each series writes ONE row whose readiness figures are
    // identical to the previous row and whose domainScores are new. The trend
    // strip renders that as a flat point and readiness-history emits no break
    // (leaf count, framework and engine version are all unchanged).
    const payloadHash = createHash('sha256')
      .update(
        stableStringify({
          engineVersion: READINESS_HISTORY_VERSION,
          catalogVersion,
          seriesKey,
          leafScores,
          domainScores,
          // Phase C: verifiedBasis and the widened leafScores BOTH join the hash.
          // Consequence, stated plainly: on the first capture after deploy every
          // series' hash differs, so each series writes EXACTLY ONE row whose
          // readinessPct/selfScoredPct/leafCount/scoredCount/coveredCount are
          // identical to the previous row — only verifiedPct may move, only
          // downward, and only where an artifact is provably stale. The
          // verified_definition_changed break sits on the same date and explains
          // it. From the second night on, dedupe behaves exactly as in Phase A/B.
          verifiedBasis: VERIFIED_BASIS_CURRENT,
        }),
      )
      .digest('hex')

    return {
      seriesKey,
      frameworkId,
      catalogVersion,
      readinessPct: summary.readinessPct,
      selfScoredPct: selfScoredPct(leafScores),
      verifiedPct: verifiedPctCurrent(leafScores),
      projectedIndex: summary.projectedIndex,
      band: summary.band,
      leafCount: summary.leafCount,
      scoredCount: summary.scoredCount,
      coveredCount: summary.coveredCount,
      leafScores,
      domainScores,
      verifiedBasis: VERIFIED_BASIS_CURRENT,
      payloadHash,
    }
  }

  private bandsOf(raw: unknown): { min: number; label: string }[] {
    return Array.isArray(raw) ? (raw as { min: number; label: string }[]) : []
  }

  /**
   * The evidence rows behind BOTH counts (Phase C). Still ONE read — the Phase-A
   * groupBy became a findMany carrying the four currency columns.
   * DEPLOY-ORDER SAFE: a pre-migration image falls back to the count-only query
   * and records the Phase-A meaning rather than failing the nightly job.
   */
  private async readEvidenceRows(schoolId: string): Promise<CurrencyEvidenceRow[]> {
    try {
      return (await this.prisma.accreditationEvidence.findMany({
        where: { schoolId },
        select: {
          standardId: true,
          sourceType: true,
          sourceRef: true,
          tag: true,
          effectiveDate: true,
          expiresAt: true,
        },
      })) as unknown as CurrencyEvidenceRow[]
    } catch {
      const counts = await this.prisma.accreditationEvidence.groupBy({
        by: ['standardId'],
        where: { schoolId },
        _count: { _all: true },
      })
      return counts.flatMap((c) =>
        Array.from({ length: c._count._all }, () => ({
          standardId: c.standardId,
          sourceType: null,
          sourceRef: null,
          tag: null,
          effectiveDate: null,
          expiresAt: null,
        })),
      )
    }
  }

  /** The Phase-C requirement rows behind these leaves; [] when nothing is cataloged. */
  private async requirementRowsFor(
    leaves: AccreditationStandard[],
  ): Promise<
    {
      catalogStandardId: string
      tag: string
      windowKind: string
      windowMonths: number | null
      dataAvailability: string
    }[]
  > {
    const catalogIds = leaves.map((r) => r.catalogStandardId).filter((id): id is string => !!id)
    if (catalogIds.length === 0) return []
    try {
      // `dataAvailability` is selected because fixedWindowsFrom must SKIP every
      // non-platform row: a not-tracked ask can never deduct from verifiedPct.
      return (await this.prisma.accreditationCatalogRequirement.findMany({
        where: { catalogStandardId: { in: catalogIds } },
        select: {
          catalogStandardId: true,
          tag: true,
          windowKind: true,
          windowMonths: true,
          dataAvailability: true,
        },
      })) as unknown as {
        catalogStandardId: string
        tag: string
        windowKind: string
        windowMonths: number | null
        dataAvailability: string
      }[]
    } catch {
      return []
    }
  }

  /** The catalog rows behind these leaves — assurance flag + domain map + signal
   *  binding in ONE read. Skipped entirely for a fully hand-made register. */
  private async catalogRowsFor(leaves: AccreditationStandard[]): Promise<CatalogDomainRow[]> {
    const catalogIds = leaves.map((r) => r.catalogStandardId).filter((id): id is string => !!id)
    if (catalogIds.length === 0) return []
    // Deploy-order safe: a pre-migration image still captures the Phase-A
    // figures, recording ten uncovered domains rather than failing the job.
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

  /** Bounded-parallelism map. Deliberately NOT Promise.all over every school. */
  private async mapWithConcurrency<T>(
    items: readonly T[],
    limit: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let cursor = 0
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = cursor
        cursor += 1
        if (i >= items.length) return
        try {
          await worker(items[i])
        } catch (err) {
          this.logger.warn(`readiness capture failed for item ${i}: ${(err as Error).message}`)
        }
      }
    })
    await Promise.all(runners)
  }
}

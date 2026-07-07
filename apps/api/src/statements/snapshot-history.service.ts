// Audit trail / value-versioning — "how did this number change?".
//
// The companion to the QuickBooks transaction drill-down (what's IN a number). Reads
// the period's append-only StatementSnapshot chain oldest→newest, extracts one target
// value (a statement line OR a metric) from each STORED payload, diffs, collapses
// no-change versions, and attributes each surviving move to its trigger + actor.
//
// VALUE-SAFE by construction: every figure comes from a stored snapshot payload — this
// service NEVER recomputes against live QBO/TB data. Read-only; mirrors the tenant-
// scoped, server-authoritative posture of QboDrillService. Reads Prisma directly (no
// QboService / analytics-module dependency) so it introduces no module cycle.
import { BadRequestException, Injectable } from '@nestjs/common'
import type { ReportBundle } from '@finrep/engine'
import {
  computeMetricsForPeriod,
  getMetric,
  isMetricKey,
  resolveDisplayUnit,
  type MetricUnit,
} from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { lineageMapFor, type SnapshotLineage } from './snapshot-lineage.util.js'
import {
  SNAPSHOT_TRIGGER_LABELS,
  UNKNOWN_TRIGGER_LABEL,
  isSnapshotTrigger,
  type SnapshotTrigger,
} from './snapshot-trigger.js'

// ── Response contract (web + Penny build against this) ────────────────────────
export interface ValueHistorySource {
  trigger: SnapshotTrigger | 'unknown'
  label: string
  sourceName: string | null // import file name / "QuickBooks Online"
  actorName: string | null // display name only — never email (board-lens safe)
}
export interface ValueHistoryVersion {
  snapshotId: string
  at: string // ISO createdAt
  value: number | null
  absent: boolean // line/metric not present in this version
  delta: number | null // vs the previous KEPT (present) version
  deltaPct: number | null
  source: ValueHistorySource
}
export interface ValueHistoryResult {
  kind: 'line' | 'metric'
  label: string
  unit: MetricUnit
  latest: number | null
  first: number | null
  netChange: number | null // latest − first across kept present versions
  versions: ValueHistoryVersion[] // NEWEST → OLDEST (drawer reads top-down)
  sparkline: number[] // every snapshot value oldest→newest (nulls dropped, un-collapsed)
  collapsed: number // how many no-change versions were folded
}

export interface LineSelection {
  statement: string
  variant: 'cy' | 'py' | 'audit'
  lineKey: string
}
export interface HistorySelection {
  statement?: string
  variant?: 'cy' | 'py' | 'audit'
  lineKey?: string
  metricKey?: string
}

// ── Internal ──────────────────────────────────────────────────────────────────
interface RawVersion {
  snapshotId: string
  at: Date
  value: number | null
  absent: boolean
  trigger: string | null
  sourceImportId: string | null
  triggeredByUserId: string | null
}

/** Extract one target value from a stored payload (throws → snapshot skipped). */
type Extractor = (payload: ReportBundle) => { value: number | null; absent: boolean }

const MAX_CHAIN = 50 // periods hold 3–10 today; a guard, not a real limit
const CORRELATION_WINDOW_MS = 15 * 60 * 1000

// Legacy null-trigger correlation: infer the trigger from the nearest audit action.
const ACTION_TRIGGER: Record<string, SnapshotTrigger> = {
  'qbo.auto_sync.ran': 'scheduled_sync',
  'qbo.synced': 'quickbooks_sync',
  'qbo.org_synced': 'quickbooks_sync',
  'qbo.categories_reviewed': 'remap',
  'import.saved': 'upload',
}
// When several candidate actions fall in the window, the most specific wins.
const TRIGGER_PRIORITY: SnapshotTrigger[] = ['scheduled_sync', 'quickbooks_sync', 'remap', 'upload']

/** Per-unit rounding epsilon for the no-change collapse (kills float-noise versions). */
function epsFor(unit: MetricUnit): number {
  switch (unit) {
    case 'currency':
      return 0.005
    case 'percent':
    case 'share':
    case 'ratio':
      return 5e-5
    case 'days':
      return 0.5
    case 'months':
      return 0.05
    default:
      return 5e-5
  }
}

@Injectable()
export class SnapshotHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
  ) {}

  /** Controller/Penny entry — precedence metricKey → statement+lineKey → 400. */
  async valueHistory(
    schoolId: string,
    periodId: string,
    sel: HistorySelection,
  ): Promise<ValueHistoryResult> {
    if (sel.metricKey) {
      return this.metricHistory(schoolId, periodId, { metricKey: sel.metricKey })
    }
    if (sel.statement && sel.lineKey) {
      return this.lineHistory(schoolId, periodId, {
        statement: sel.statement,
        variant: sel.variant ?? 'cy',
        lineKey: sel.lineKey,
      })
    }
    throw new BadRequestException('Provide a metricKey, or a statement + lineKey.')
  }

  /** History of a single statement line across the period's snapshot chain. */
  async lineHistory(
    schoolId: string,
    periodId: string,
    sel: LineSelection,
  ): Promise<ValueHistoryResult> {
    const extract: Extractor = (payload) => {
      const lineage = (payload as unknown as { lineage?: SnapshotLineage })?.lineage
      if (!lineage) return { value: null, absent: true }
      const map = lineageMapFor(lineage, sel.statement, sel.variant)
      const entry = map?.[sel.lineKey]
      if (!entry) return { value: null, absent: true }
      return { value: typeof entry.value === 'number' ? entry.value : null, absent: false }
    }
    return this.build(schoolId, periodId, 'line', sel.lineKey, 'currency', extract)
  }

  /** History of a computed metric (works for ratios — the drill can't drill a ratio). */
  async metricHistory(
    schoolId: string,
    periodId: string,
    sel: { metricKey: string },
  ): Promise<ValueHistoryResult> {
    if (!isMetricKey(sel.metricKey)) {
      throw new BadRequestException(`Unknown metric "${sel.metricKey}".`)
    }
    const def = getMetric(sel.metricKey)
    const unit = resolveDisplayUnit(sel.metricKey, def.unit)
    const extract: Extractor = (payload) => {
      // Pure-financial compute per stored payload (no operational data threaded —
      // operational rows aren't versioned per snapshot). Operational-only metrics
      // resolve available:false → absent, exactly as the drawer already handles.
      const results = computeMetricsForPeriod({ current: payload })
      const r = results.find((m) => m.key === sel.metricKey)
      if (!r || !r.available || r.value == null) return { value: null, absent: true }
      return { value: r.value, absent: false }
    }
    return this.build(schoolId, periodId, 'metric', def.label, unit, extract)
  }

  // ── Shared skeleton ───────────────────────────────────────────────────────
  private async build(
    schoolId: string,
    periodId: string,
    kind: 'line' | 'metric',
    label: string,
    unit: MetricUnit,
    extract: Extractor,
  ): Promise<ValueHistoryResult> {
    // Tenant guard (throws NotFound like the drill).
    await this.periods.getOwnedPeriod(schoolId, periodId)

    const rows = await this.prisma.statementSnapshot.findMany({
      where: { schoolId, fiscalPeriodId: periodId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        payload: true,
        trigger: true,
        sourceImportId: true,
        triggeredByUserId: true,
      },
    })
    // Cap: keep the NEWEST MAX_CHAIN if a period ever exceeds it.
    const chain = rows.length > MAX_CHAIN ? rows.slice(rows.length - MAX_CHAIN) : rows

    // Extract each snapshot's value (try/catch — payload-drift version is SKIPPED,
    // never fabricated, never 500s).
    const raw: RawVersion[] = []
    for (const s of chain) {
      let ext: { value: number | null; absent: boolean }
      try {
        ext = extract(s.payload as unknown as ReportBundle)
      } catch {
        continue
      }
      raw.push({
        snapshotId: s.id,
        at: s.createdAt,
        value: ext.value,
        absent: ext.absent,
        trigger: s.trigger,
        sourceImportId: s.sourceImportId,
        triggeredByUserId: s.triggeredByUserId,
      })
    }

    const eps = epsFor(unit)
    const kept = this.collapse(raw, eps)
    const collapsed = raw.length - kept.length

    // Sparkline = every present raw value oldest→newest (nulls/absent dropped, un-collapsed).
    const sparkline = raw.filter((v) => !v.absent && v.value != null).map((v) => v.value as number)

    // Present kept values → first / latest / netChange.
    const presentKept = kept.filter((v) => !v.absent && v.value != null)
    const first = presentKept.length ? (presentKept[0].value as number) : null
    const latest = presentKept.length ? (presentKept[presentKept.length - 1].value as number) : null
    const netChange = first != null && latest != null ? latest - first : null

    // Attribution (stamped ‖ correlation), batched.
    const sources = await this.attribute(schoolId, kept)

    // Shape versions (compute delta vs previous KEPT present version), newest→oldest.
    const versions: ValueHistoryVersion[] = kept.map((v, i) => {
      const prev = i > 0 ? kept[i - 1] : null
      let delta: number | null = null
      let deltaPct: number | null = null
      if (!v.absent && v.value != null && prev && !prev.absent && prev.value != null) {
        delta = v.value - prev.value
        deltaPct = prev.value !== 0 ? delta / Math.abs(prev.value) : null
      }
      return {
        snapshotId: v.snapshotId,
        at: v.at.toISOString(),
        value: v.value,
        absent: v.absent,
        delta,
        deltaPct,
        source: sources.get(v.snapshotId) ?? {
          trigger: 'unknown',
          label: UNKNOWN_TRIGGER_LABEL,
          sourceName: null,
          actorName: null,
        },
      }
    })
    versions.reverse() // newest → oldest for display

    return { kind, label, unit, latest, first, netChange, versions, sparkline, collapsed }
  }

  /**
   * Collapse no-change versions: always keep the OLDEST as baseline, then keep a
   * version only when it differs from the last kept by more than eps — OR when it
   * crosses a present↔absent boundary (a line appearing/disappearing is a real move).
   * Consecutive same-value or consecutive-absent runs fold to one.
   */
  private collapse(raw: RawVersion[], eps: number): RawVersion[] {
    const kept: RawVersion[] = []
    let last: RawVersion | null = null
    for (const v of raw) {
      if (!last) {
        kept.push(v)
        last = v
        continue
      }
      if (v.absent) {
        // Keep only the transition present→absent; fold consecutive absents.
        if (!last.absent) {
          kept.push(v)
          last = v
        }
        continue
      }
      // v present.
      if (last.absent || last.value == null) {
        // Reappearance / first present after an absent baseline — a real move.
        kept.push(v)
        last = v
        continue
      }
      // Both present: keep only when it moved beyond eps.
      if (v.value != null && Math.abs(v.value - last.value) > eps) {
        kept.push(v)
        last = v
      }
    }
    return kept
  }

  /**
   * Resolve each kept version's attribution. Prefer the stamped columns; fall back to
   * correlation for legacy null-trigger rows (the snapshot.generated actor + the
   * nearest audit action within a small window). All lookups are batched (no N+1).
   */
  private async attribute(
    schoolId: string,
    kept: RawVersion[],
  ): Promise<Map<string, ValueHistorySource>> {
    const out = new Map<string, ValueHistorySource>()
    if (kept.length === 0) return out

    // Batch: import file names for any stamped sourceImportId.
    const importIds = [...new Set(kept.map((v) => v.sourceImportId).filter((x): x is string => !!x))]
    const importName = new Map<string, string | null>()
    if (importIds.length) {
      const imps = await this.prisma.import.findMany({
        where: { id: { in: importIds } },
        select: { id: true, sourceName: true },
      })
      for (const i of imps) importName.set(i.id, i.sourceName ?? null)
    }

    // Correlation inputs (only when some kept row is unstamped).
    const legacy = kept.filter((v) => !isSnapshotTrigger(v.trigger))
    const genActor = new Map<string, string | null>() // snapshotId → userId
    const correlatedTrigger = new Map<string, SnapshotTrigger>() // snapshotId → trigger
    if (legacy.length) {
      const ids = legacy.map((v) => v.snapshotId)
      const genRows = await this.prisma.auditLog.findMany({
        where: {
          schoolId,
          action: 'snapshot.generated',
          targetType: 'statement_snapshot',
          targetId: { in: ids },
        },
        select: { targetId: true, userId: true },
      })
      for (const g of genRows) if (g.targetId) genActor.set(g.targetId, g.userId ?? null)

      const times = legacy.map((v) => v.at.getTime())
      const lo = new Date(Math.min(...times) - CORRELATION_WINDOW_MS)
      const hi = new Date(Math.max(...times) + CORRELATION_WINDOW_MS)
      const triggerRows = await this.prisma.auditLog.findMany({
        where: {
          schoolId,
          action: { in: Object.keys(ACTION_TRIGGER) },
          createdAt: { gte: lo, lte: hi },
        },
        select: { action: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      })
      for (const v of legacy) {
        const t = v.at.getTime()
        const near = triggerRows.filter(
          (r) => Math.abs(r.createdAt.getTime() - t) <= CORRELATION_WINDOW_MS,
        )
        let best: SnapshotTrigger | null = null
        let bestRank = Infinity
        for (const r of near) {
          const trig = ACTION_TRIGGER[r.action]
          const rank = TRIGGER_PRIORITY.indexOf(trig)
          if (trig && rank !== -1 && rank < bestRank) {
            best = trig
            bestRank = rank
          }
        }
        if (best) correlatedTrigger.set(v.snapshotId, best)
      }
    }

    // Batch: actor display names (stamped copies + correlated ids).
    const userIds = [
      ...new Set(
        [
          ...kept.map((v) => v.triggeredByUserId),
          ...[...genActor.values()],
        ].filter((x): x is string => !!x),
      ),
    ]
    const userName = new Map<string, string | null>()
    if (userIds.length) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true },
      })
      for (const u of users) {
        const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
        userName.set(u.id, name || null)
      }
    }

    for (const v of kept) {
      const stamped = isSnapshotTrigger(v.trigger)
      const trigger: SnapshotTrigger | 'unknown' = stamped
        ? (v.trigger as SnapshotTrigger)
        : correlatedTrigger.get(v.snapshotId) ?? 'unknown'
      const label =
        trigger === 'unknown' ? UNKNOWN_TRIGGER_LABEL : SNAPSHOT_TRIGGER_LABELS[trigger]

      // Actor: stamped copy, else the snapshot.generated audit actor.
      const actorId = v.triggeredByUserId ?? genActor.get(v.snapshotId) ?? null
      const actorName = actorId ? userName.get(actorId) ?? null : null

      // Source name: the import file name if we have one, else "QuickBooks Online"
      // for a QBO-sourced trigger, else null.
      let sourceName: string | null = null
      if (v.sourceImportId && importName.has(v.sourceImportId)) {
        sourceName = importName.get(v.sourceImportId) ?? null
      } else if (trigger === 'quickbooks_sync' || trigger === 'scheduled_sync') {
        sourceName = 'QuickBooks Online'
      }

      out.set(v.snapshotId, { trigger, label, sourceName, actorName })
    }
    return out
  }
}

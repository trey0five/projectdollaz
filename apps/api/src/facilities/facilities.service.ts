import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { MaintenanceItem } from '@finrep/db'
import {
  computeMaintenanceUrgency,
  nextMaintenanceOccurrence,
  summarizeBacklog,
  MAINTENANCE_RECURRENCES,
  type MaintenanceBacklogSummary,
  type MaintenanceRecurrence,
  type MaintenanceUrgency,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { CreateMaintenanceDto } from './dto/create-maintenance.dto.js'
import type { UpdateMaintenanceDto } from './dto/update-maintenance.dto.js'

/** One maintenance item as returned to the client, with COMPUTED urgency. */
export interface MaintenanceItemPublic {
  id: string
  title: string
  location: string | null
  category: string | null
  priority: string
  status: string
  /** Prisma.Decimal → JS number (exact for DECIMAL(14,2) magnitudes); null passes. */
  estimatedCost: number | null
  /** Realized spend. Prisma.Decimal → JS number; null until closed out. */
  actualCost: number | null
  /** COMPUTED (never stored) — actualCost − estimatedCost when BOTH present, else null.
   *  Positive = over budget (a danger signal in the UI); negative = under budget. */
  variance: number | null
  /** Non-PII business/contractor name, or null. */
  vendor: string | null
  /** yyyy-mm-dd (@db.Date), or null. */
  targetDate: string | null
  /** Preventive-maintenance cadence: none|weekly|monthly|quarterly|annual. */
  recurrence: MaintenanceRecurrence
  /** yyyy-mm-dd series bound (null = open-ended, hard-capped in the service). */
  recurrenceUntil: string | null
  /** Links occurrences of one recurring series (null on a non-recurring item). */
  seriesId: string | null
  notes: string | null
  createdByUserId: string | null
  /** COMPUTED (never stored) — from @finrep/compliance. */
  urgency: MaintenanceUrgency
  daysUntilTarget: number | null
  createdAt: string
  updatedAt: string
}

export interface MaintenanceListResponse {
  items: MaintenanceItemPublic[]
  summary: MaintenanceBacklogSummary
}

/** Deterministic list order: open before resolved, then priority, urgency, target date. */
const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const URGENCY_RANK: Record<string, number> = {
  overdue: 0,
  'due-soon': 1,
  'on-track': 2,
  none: 3,
}

/** Serialize a DB @db.Date to yyyy-mm-dd with no timezone drift (UTC-midnight round-trip). */
function toIsoDate(d: Date | null): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

/** Parse an incoming ISO date string to a UTC-midnight Date, or throw. Null passes. */
function parseIsoDate(s: string | null | undefined, field: string): Date | null | undefined {
  if (s === undefined) return undefined
  if (s === null) return null
  const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid ${field}: ${s}.`)
  return d
}

/** Defend the READ against a stray recurrence value (recurrence is a free TEXT column,
 *  not a DB enum). Fallback 'none' → a one-off item. Mirrors TasksService. */
function normalizeRecurrence(s: string | null | undefined): MaintenanceRecurrence {
  return (MAINTENANCE_RECURRENCES as readonly string[]).includes(s ?? '')
    ? (s as MaintenanceRecurrence)
    : 'none'
}

/**
 * Phase 4 Facilities v1 — the deferred-maintenance register service. The THIRD
 * licensable module (after governance + accreditation). School-scoped (NOT
 * period-scoped). TENANT ISOLATION is enforced on EVERY query: reads filter by
 * `schoolId`, and every mutation first resolves the row `where { id, schoolId }` —
 * an itemId owned by another school resolves to null → NotFoundException, so a
 * cross-tenant mutation is IMPOSSIBLE (the foreign row never even loads).
 *
 * Every response is enriched with the pure computeMaintenanceUrgency (injectable
 * `now`) + summarizeBacklog, so the register list and the briefing 'facilities'
 * STEP share one source of truth. DECIMAL DISCIPLINE: estimatedCost (Prisma.Decimal)
 * is coerced to a JS number in toPublic BEFORE it reaches the pure summarizeBacklog
 * — the compliance package never imports Prisma.
 */
@Injectable()
export class FacilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toPublic(row: MaintenanceItem, now: Date): MaintenanceItemPublic {
    const u = computeMaintenanceUrgency({ status: row.status, targetDate: row.targetDate }, now)
    // Prisma.Decimal → number (exact for DECIMAL(14,2)); null passes untouched.
    const estimatedCost = row.estimatedCost === null ? null : Number(row.estimatedCost)
    const actualCost = row.actualCost === null ? null : Number(row.actualCost)
    // Variance only when BOTH are present (cents-rounded so 300.30 − 200.10 is exact).
    const variance =
      estimatedCost === null || actualCost === null
        ? null
        : Math.round((actualCost - estimatedCost) * 100) / 100
    return {
      id: row.id,
      title: row.title,
      location: row.location,
      category: row.category,
      priority: row.priority,
      status: row.status,
      estimatedCost,
      actualCost,
      variance,
      vendor: row.vendor,
      targetDate: toIsoDate(row.targetDate),
      recurrence: normalizeRecurrence(row.recurrence),
      recurrenceUntil: toIsoDate(row.recurrenceUntil),
      seriesId: row.seriesId,
      notes: row.notes,
      createdByUserId: row.createdByUserId,
      urgency: u.urgency,
      daysUntilTarget: u.daysUntilTarget,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /**
   * Resolve an item that belongs to the PATH school — the tenant + existence gate
   * in ONE query. A foreign/unknown itemId → null → 404.
   */
  private async resolveItem(schoolId: string, itemId: string): Promise<MaintenanceItem> {
    const item = await this.prisma.maintenanceItem.findFirst({ where: { id: itemId, schoolId } })
    if (!item) throw new NotFoundException('Maintenance item not found.')
    return item
  }

  /**
   * Preventive maintenance — SPAWN-ON-TRANSITION-TO-RESOLVED (no cron). MIRRORS
   * TasksService.spawnNextIfRecurring exactly.
   *
   * CONTRACT (double-spawn guards):
   *  • The CALLER passes the PRE-update `existing` row (still carrying the OLD status)
   *    and ONLY invokes this on the transition INTO 'resolved' (existing.status !==
   *    'resolved' && nextStatus === 'resolved'). Re-saving an already-resolved item has
   *    existing.status === 'resolved' → the caller never invokes this → NO re-spawn (no
   *    duplicate/runaway series). A spawned successor is born 'open', so it only ever
   *    spawns its OWN next occurrence when IT is later resolved — never on re-save.
   *  • Spawns AT MOST ONE next occurrence.
   *  • HARD SAFETY CAP: never spawn if the next target is not strictly AFTER the base
   *    (guards any degenerate cadence → no zero/negative-interval runaway series).
   *  • recurrenceUntil bounds the series (null = open-ended). Both yyyy-mm-dd → exact
   *    string compare.
   * The successor CLONES title/priority/category/vendor/estimatedCost/recurrence (the
   * durable definition), resets to status 'open' with actualCost cleared, and advances
   * the targetDate one cadence step; it is linked into the series via seriesId. `now` is
   * passed in so the spawned targetDate anchors to the same clock. Not fail-soft — the
   * spawn is a write the user expects.
   */
  private async spawnNextIfRecurring(
    existing: MaintenanceItem,
    schoolId: string,
    userId: string,
    now: Date,
  ): Promise<void> {
    const rec = normalizeRecurrence(existing.recurrence)
    if (rec === 'none') return
    // ANCHOR-ON-SCHEDULE (mirrors Task): the successor is one cadence step past the prior
    // TARGET date (not past `now`), so the series keeps its original phase. When there is
    // no prior target the pure helper anchors on `now`.
    const iso = nextMaintenanceOccurrence(existing.targetDate, rec, now)
    if (!iso) return
    // Cap #1 — the next target must be strictly after the base (prevTarget when set).
    const baseIso = toIsoDate(existing.targetDate)
    if (baseIso && iso <= baseIso) return
    // Bound #2 — honor recurrenceUntil (open-ended when null).
    const untilIso = toIsoDate(existing.recurrenceUntil)
    if (untilIso && iso > untilIso) return

    const nextTarget = parseIsoDate(iso, 'recurrence') as Date
    const created = await this.prisma.maintenanceItem.create({
      data: {
        schoolId: existing.schoolId,
        title: existing.title,
        location: existing.location,
        category: existing.category,
        priority: existing.priority,
        status: 'open', // FRESH open item
        // Prisma.Decimal round-trips back into the Decimal column unchanged.
        estimatedCost: existing.estimatedCost,
        actualCost: null, // realized spend clears on the new occurrence
        vendor: existing.vendor,
        targetDate: nextTarget,
        notes: existing.notes,
        recurrence: rec, // inherit the cadence
        recurrenceUntil: existing.recurrenceUntil,
        seriesId: existing.seriesId ?? existing.id, // first resolve seeds the series id
        createdByUserId: existing.createdByUserId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'facilities.recurrence_spawned',
      targetType: 'maintenance_items',
      targetId: created.id,
    })
  }

  /** List all items for one school, deterministically ordered + enriched, plus the summary. */
  async listMaintenance(schoolId: string, now = new Date()): Promise<MaintenanceListResponse> {
    const rows = await this.prisma.maintenanceItem.findMany({ where: { schoolId } })
    const items = rows
      .map((r) => this.toPublic(r, now))
      .sort((a, b) => {
        // open (non-resolved) before resolved.
        const ra = a.status === 'resolved' ? 1 : 0
        const rb = b.status === 'resolved' ? 1 : 0
        if (ra !== rb) return ra - rb
        const p = (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99)
        if (p !== 0) return p
        const u = (URGENCY_RANK[a.urgency] ?? 99) - (URGENCY_RANK[b.urgency] ?? 99)
        if (u !== 0) return u
        // targetDate asc, nulls last.
        const ta = a.targetDate ?? '9999-12-31'
        const tb = b.targetDate ?? '9999-12-31'
        if (ta !== tb) return ta.localeCompare(tb)
        const t = a.title.localeCompare(b.title)
        return t !== 0 ? t : a.id.localeCompare(b.id)
      })
    const summary = summarizeBacklog(
      items.map((i) => ({
        priority: i.priority,
        status: i.status,
        estimatedCost: i.estimatedCost,
        urgency: i.urgency,
      })),
    )
    return { items, summary }
  }

  async createMaintenance(
    schoolId: string,
    dto: CreateMaintenanceDto,
    userId: string,
  ): Promise<MaintenanceItemPublic> {
    const targetDate = parseIsoDate(dto.targetDate, 'targetDate') ?? null
    const recurrenceUntil = parseIsoDate(dto.recurrenceUntil, 'recurrenceUntil') ?? null
    const row = await this.prisma.maintenanceItem.create({
      data: {
        schoolId,
        title: dto.title,
        location: dto.location ?? null,
        category: dto.category ?? null,
        priority: dto.priority ?? 'medium',
        status: dto.status ?? 'open',
        estimatedCost: dto.estimatedCost ?? null,
        actualCost: dto.actualCost ?? null,
        vendor: dto.vendor ?? null,
        targetDate,
        // Recurrence is seed-only here; the successor spawns on transition-to-resolved.
        recurrence: normalizeRecurrence(dto.recurrence),
        recurrenceUntil,
        notes: dto.notes ?? null,
        createdByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'facilities.item.created',
      targetType: 'maintenance_items',
      targetId: row.id,
    })
    return this.toPublic(row, new Date())
  }

  async updateMaintenance(
    schoolId: string,
    itemId: string,
    dto: UpdateMaintenanceDto,
    userId: string,
  ): Promise<MaintenanceItemPublic> {
    const existing = await this.resolveItem(schoolId, itemId)
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    const now = new Date()
    const targetDate = parseIsoDate(dto.targetDate, 'targetDate')
    const recurrenceUntil = parseIsoDate(dto.recurrenceUntil, 'recurrenceUntil')
    // Coerce the stored Prisma.Decimal to a number so the pick() fallback unifies
    // with the DTO's `number | null` (Prisma accepts number for a Decimal column).
    const existingCost = existing.estimatedCost === null ? null : Number(existing.estimatedCost)
    const existingActual = existing.actualCost === null ? null : Number(existing.actualCost)

    // Detect the transition INTO 'resolved' from the PRE-update status (the spawn gate).
    const nextStatus = pick(dto.status, existing.status)
    const transitionsToResolved = nextStatus === 'resolved' && existing.status !== 'resolved'

    const row = await this.prisma.maintenanceItem.update({
      where: { id: existing.id },
      data: {
        title: pick(dto.title, existing.title),
        location: pick(dto.location, existing.location),
        category: pick(dto.category, existing.category),
        priority: pick(dto.priority, existing.priority),
        status: nextStatus,
        estimatedCost: pick(dto.estimatedCost, existingCost),
        actualCost: pick(dto.actualCost, existingActual),
        vendor: pick(dto.vendor, existing.vendor),
        targetDate: pick(targetDate, existing.targetDate),
        recurrence: pick(dto.recurrence, existing.recurrence),
        recurrenceUntil: pick(recurrenceUntil, existing.recurrenceUntil),
        notes: pick(dto.notes, existing.notes),
        // createdByUserId + seriesId are NEVER overwritten on update (provenance/series).
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'facilities.item.updated',
      targetType: 'maintenance_items',
      targetId: row.id,
    })
    // Resolving a recurring item advances the series (guarded on the OLD status so a
    // re-save of an already-resolved item never double-spawns).
    if (transitionsToResolved) await this.spawnNextIfRecurring(existing, schoolId, userId, now)
    return this.toPublic(row, now)
  }

  async removeMaintenance(
    schoolId: string,
    itemId: string,
    userId: string,
  ): Promise<{ id: string }> {
    const existing = await this.resolveItem(schoolId, itemId)
    await this.prisma.maintenanceItem.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'facilities.item.deleted',
      targetType: 'maintenance_items',
      targetId: existing.id,
    })
    return { id: existing.id }
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { MaintenanceBid, MaintenanceItem, Vendor } from '@finrep/db'
import {
  computeMaintenanceUrgency,
  nextMaintenanceOccurrence,
  summarizeBacklog,
  summarizeDecisions,
  MAINTENANCE_RECURRENCES,
  type MaintenanceBacklogSummary,
  type MaintenanceDecisionSummary,
  type MaintenanceRecurrence,
  type MaintenanceUrgency,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { CreateMaintenanceDto } from './dto/create-maintenance.dto.js'
import type { UpdateMaintenanceDto } from './dto/update-maintenance.dto.js'
import type { CreateVendorDto, UpdateVendorDto } from './dto/vendor.dto.js'
import type { CreateBidDto, UpdateBidDto } from './dto/bid.dto.js'

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
  /**
   * AIC Phase F — WHAT KIND of regulatory inspection this item is, or null for an
   * ordinary maintenance item. Closed vocabulary (MAINTENANCE_COMPLIANCE_KINDS),
   * declared by the school and NEVER inferred from title/category/location.
   */
  complianceKind: string | null
  createdByUserId: string | null
  /** COMPUTED (never stored) — from @finrep/compliance. */
  urgency: MaintenanceUrgency
  daysUntilTarget: number | null
  // ── Vendors/bids (additive) ─────────────────────────────────────────────────
  /** Structured vendor link (vendors register), or null. */
  vendorId: string | null
  /** RESOLVED display name: vendorRef.name ?? legacy free-text `vendor`. */
  vendorName: string | null
  /** Winning bid (soft ref), null until Leadership accepts. */
  selectedBidId: string | null
  /** Leadership decision stamp — mirrors Task approval naming. */
  decidedByUserId: string | null
  decidedAt: string | null
  decisionNote: string | null
  /** Stamped on the transition INTO 'resolved' (null on legacy resolved rows). */
  resolvedAt: string | null
  /** COUNT of this item's 'pending' bids (one groupBy on the list — no N+1). */
  pendingBidCount: number
  /** MIN/MAX pending-bid amount (spec §4.5 rail "bid amount range") — same single
   *  groupBy (_min/_max), still no N+1. Null when no pending bids or on the
   *  single-item CRUD responses (the rail is fed from the list). */
  pendingBidMin: number | null
  pendingBidMax: number | null
  createdAt: string
  updatedAt: string
}

export interface MaintenanceListResponse {
  items: MaintenanceItemPublic[]
  summary: MaintenanceBacklogSummary & MaintenanceDecisionSummary
}

/** One vendor row as returned to the client. */
export interface VendorPublic {
  id: string
  name: string
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  category: string | null
  notes: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

/** One bid row as returned to the client (vendorName RESOLVED server-side). */
export interface BidPublic {
  id: string
  itemId: string
  vendorId: string | null
  /** vendor row's name when linked, else the bid's free-text vendorName. */
  vendorName: string | null
  amount: number
  notes: string | null
  status: string
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
}

/** Accept/reopen response — the stamped item + the item's full bid list. */
export interface BidDecisionResponse {
  item: MaintenanceItemPublic
  bids: BidPublic[]
}

/** Item row possibly carrying the included vendorRef name (display resolution). */
type MaintenanceItemRow = MaintenanceItem & { vendorRef?: { name: string } | null }
type BidRow = MaintenanceBid & { vendor?: { name: string } | null }

/** The single include used everywhere an item row feeds toPublic. */
const ITEM_INCLUDE = { vendorRef: { select: { name: true } } } as const
const BID_INCLUDE = { vendor: { select: { name: true } } } as const

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

  private toPublic(
    row: MaintenanceItemRow,
    now: Date,
    pendingBidCount = 0,
    pendingBidRange: { min: number | null; max: number | null } = { min: null, max: null },
  ): MaintenanceItemPublic {
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
      // AIC Phase F — emitted verbatim. Never derived, never defaulted to a kind.
      complianceKind: row.complianceKind,
      createdByUserId: row.createdByUserId,
      urgency: u.urgency,
      daysUntilTarget: u.daysUntilTarget,
      vendorId: row.vendorId,
      // Display resolution: structured vendor name wins; legacy free text covers old rows.
      vendorName: row.vendorRef?.name ?? row.vendor,
      selectedBidId: row.selectedBidId,
      decidedByUserId: row.decidedByUserId,
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      decisionNote: row.decisionNote,
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      pendingBidCount,
      pendingBidMin: pendingBidRange.min,
      pendingBidMax: pendingBidRange.max,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toVendorPublic(row: Vendor): VendorPublic {
    return {
      id: row.id,
      name: row.name,
      contactName: row.contactName,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      category: row.category,
      notes: row.notes,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toBidPublic(row: BidRow): BidPublic {
    return {
      id: row.id,
      itemId: row.itemId,
      vendorId: row.vendorId,
      vendorName: row.vendor?.name ?? row.vendorName,
      amount: Number(row.amount),
      notes: row.notes,
      status: row.status,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** Validate a client-sent vendorId belongs to the path school (400 otherwise). */
  private async assertVendorInSchool(schoolId: string, vendorId: string): Promise<void> {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, schoolId },
      select: { id: true },
    })
    if (!vendor) throw new BadRequestException('Vendor not found for this school.')
  }

  /**
   * Resolve an item that belongs to the PATH school — the tenant + existence gate
   * in ONE query. A foreign/unknown itemId → null → 404.
   */
  private async resolveItem(schoolId: string, itemId: string): Promise<MaintenanceItemRow> {
    const item = await this.prisma.maintenanceItem.findFirst({
      where: { id: itemId, schoolId },
      include: ITEM_INCLUDE,
    })
    if (!item) throw new NotFoundException('Maintenance item not found.')
    return item
  }

  /** COUNT of one item's still-pending bids (single-item responses). */
  private pendingCountFor(schoolId: string, itemId: string): Promise<number> {
    return this.prisma.maintenanceBid.count({
      where: { schoolId, itemId, status: 'pending' },
    })
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
        // D9 copy-list: the DURABLE vendor definition carries over (structured link +
        // legacy free text), but decision/close-out state NEVER does — the successor is
        // born clean: selectedBidId/decidedByUserId/decidedAt/decisionNote/resolvedAt
        // are deliberately ABSENT from this create (→ null).
        vendor: existing.vendor,
        vendorId: existing.vendorId,
        targetDate: nextTarget,
        notes: existing.notes,
        recurrence: rec, // inherit the cadence
        recurrenceUntil: existing.recurrenceUntil,
        // AIC Phase F — the KIND is part of the durable definition, exactly like
        // title/category/recurrence, so it carries over. An annual fire-life-safety
        // inspection that lost its kind the moment it was first resolved would drop
        // silently out of fac.inspections and FAC-INSPECTION-DUE would stop seeing the
        // very series the register exists to track. NOT a behaviour change for any
        // existing school: every pre-Phase-F row has complianceKind = null and cloning
        // null is a no-op. (Deviation from spec §8.3's "recurrence … untouched" —
        // recorded in the phase report.)
        complianceKind: existing.complianceKind,
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
    const rows = await this.prisma.maintenanceItem.findMany({
      where: { schoolId },
      include: ITEM_INCLUDE,
    })
    // ONE groupBy for every item's pending-bid count + amount range (no per-item
    // N+1, no bid include) — _min/_max feed the rail's "bid amount range" chip.
    const pendingGroups = await this.prisma.maintenanceBid.groupBy({
      by: ['itemId'],
      where: { schoolId, status: 'pending' },
      _count: { _all: true },
      _min: { amount: true },
      _max: { amount: true },
    })
    const pendingByItem = new Map(pendingGroups.map((g) => [g.itemId, g]))
    const items = rows
      .map((r) => {
        const g = pendingByItem.get(r.id)
        return this.toPublic(r, now, g?._count._all ?? 0, {
          min: g?._min?.amount == null ? null : Number(g._min.amount),
          max: g?._max?.amount == null ? null : Number(g._max.amount),
        })
      })
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
    const summary = {
      ...summarizeBacklog(
        items.map((i) => ({
          priority: i.priority,
          status: i.status,
          estimatedCost: i.estimatedCost,
          urgency: i.urgency,
        })),
      ),
      // Needs-a-Leadership-decision rollup — same pure source as any future briefing line.
      ...summarizeDecisions(
        items.map((i) => ({
          status: i.status,
          urgency: i.urgency,
          pendingBidCount: i.pendingBidCount,
        })),
      ),
    }
    return { items, summary }
  }

  async createMaintenance(
    schoolId: string,
    dto: CreateMaintenanceDto,
    userId: string,
  ): Promise<MaintenanceItemPublic> {
    const targetDate = parseIsoDate(dto.targetDate, 'targetDate') ?? null
    const recurrenceUntil = parseIsoDate(dto.recurrenceUntil, 'recurrenceUntil') ?? null
    if (dto.vendorId) await this.assertVendorInSchool(schoolId, dto.vendorId)
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
        vendorId: dto.vendorId ?? null,
        targetDate,
        // Recurrence is seed-only here; the successor spawns on transition-to-resolved.
        recurrence: normalizeRecurrence(dto.recurrence),
        recurrenceUntil,
        notes: dto.notes ?? null,
        // AIC Phase F — stored EXACTLY as declared. Omitted ⇒ null ⇒ an ordinary
        // maintenance item. The DTO's @IsIn is the only vocabulary check; nothing
        // here reads title/category to guess a kind.
        complianceKind: dto.complianceKind ?? null,
        createdByUserId: userId,
      },
      include: ITEM_INCLUDE,
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

    if (dto.vendorId) await this.assertVendorInSchool(schoolId, dto.vendorId)

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
        vendorId: pick(dto.vendorId, existing.vendorId),
        targetDate: pick(targetDate, existing.targetDate),
        recurrence: pick(dto.recurrence, existing.recurrence),
        recurrenceUntil: pick(recurrenceUntil, existing.recurrenceUntil),
        notes: pick(dto.notes, existing.notes),
        // AIC Phase F — merge-pick like every other nullable column: an omitted key
        // keeps the current kind, an explicit `null` CLEARS it (the item becomes an
        // ordinary maintenance item again and drops straight out of fac.inspections).
        complianceKind: pick(dto.complianceKind, existing.complianceKind),
        // Stamp resolvedAt ONCE on the transition INTO 'resolved'; a re-save of an
        // already-resolved item keeps the original stamp (never re-stamped).
        resolvedAt: transitionsToResolved ? now : existing.resolvedAt,
        // createdByUserId + seriesId are NEVER overwritten on update (provenance/series).
        // selectedBidId/decidedBy*/decisionNote are ONLY writable via accept/reopen.
      },
      include: ITEM_INCLUDE,
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
    return this.toPublic(row, now, await this.pendingCountFor(schoolId, row.id))
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

  // ── Vendors — the school contractor register ────────────────────────────────

  async listVendors(schoolId: string): Promise<{ vendors: VendorPublic[] }> {
    const rows = await this.prisma.vendor.findMany({
      where: { schoolId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })
    return { vendors: rows.map((v) => this.toVendorPublic(v)) }
  }

  async createVendor(
    schoolId: string,
    dto: CreateVendorDto,
    userId: string,
  ): Promise<{ vendor: VendorPublic }> {
    const name = dto.name.trim()
    if (!name) throw new BadRequestException('Vendor name is required.')
    // ADVISORY dedupe (CREATE only — no DB unique): case-insensitive exact-name match.
    const dupe = await this.prisma.vendor.findFirst({
      where: { schoolId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true, name: true },
    })
    if (dupe) {
      throw new BadRequestException(
        `A vendor named "${dupe.name}" already exists for this school.`,
      )
    }
    const row = await this.prisma.vendor.create({
      data: {
        schoolId,
        name,
        contactName: dto.contactName ?? null,
        contactEmail: dto.contactEmail ?? null,
        contactPhone: dto.contactPhone ?? null,
        category: dto.category ?? null,
        notes: dto.notes ?? null,
        active: dto.active ?? true,
        createdByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'facilities.vendor.created',
      targetType: 'vendors',
      targetId: row.id,
    })
    return { vendor: this.toVendorPublic(row) }
  }

  private async resolveVendor(schoolId: string, vendorId: string): Promise<Vendor> {
    const vendor = await this.prisma.vendor.findFirst({ where: { id: vendorId, schoolId } })
    if (!vendor) throw new NotFoundException('Vendor not found.')
    return vendor
  }

  async updateVendor(
    schoolId: string,
    vendorId: string,
    dto: UpdateVendorDto,
    userId: string,
  ): Promise<{ vendor: VendorPublic }> {
    const existing = await this.resolveVendor(schoolId, vendorId)
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    // Mirror createVendor: a whitespace-only name trims to '' — reject it here too
    // so the two endpoints agree (no blank vendor rows in the register/Selects).
    const nextName = dto.name === undefined ? existing.name : dto.name.trim()
    if (!nextName) throw new BadRequestException('Vendor name is required.')
    const row = await this.prisma.vendor.update({
      where: { id: existing.id },
      data: {
        name: nextName,
        contactName: pick(dto.contactName, existing.contactName),
        contactEmail: pick(dto.contactEmail, existing.contactEmail),
        contactPhone: pick(dto.contactPhone, existing.contactPhone),
        category: pick(dto.category, existing.category),
        notes: pick(dto.notes, existing.notes),
        active: pick(dto.active, existing.active),
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'facilities.vendor.updated',
      targetType: 'vendors',
      targetId: row.id,
    })
    return { vendor: this.toVendorPublic(row) }
  }

  async removeVendor(schoolId: string, vendorId: string, userId: string): Promise<{ ok: true }> {
    const existing = await this.resolveVendor(schoolId, vendorId)
    // A referenced vendor is HISTORY — deactivate instead of delete (400).
    const [bidRefs, itemRefs] = await Promise.all([
      this.prisma.maintenanceBid.count({ where: { schoolId, vendorId: existing.id } }),
      this.prisma.maintenanceItem.count({ where: { schoolId, vendorId: existing.id } }),
    ])
    if (bidRefs > 0 || itemRefs > 0) {
      throw new BadRequestException(
        'This vendor is referenced by bids or maintenance items — deactivate it instead of deleting.',
      )
    }
    await this.prisma.vendor.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'facilities.vendor.deleted',
      targetType: 'vendors',
      targetId: existing.id,
    })
    return { ok: true }
  }

  // ── Bids — competing quotes on one item + the Leadership decision ───────────

  private async resolveBid(schoolId: string, itemId: string, bidId: string): Promise<BidRow> {
    const bid = await this.prisma.maintenanceBid.findFirst({
      where: { id: bidId, itemId, schoolId },
      include: BID_INCLUDE,
    })
    if (!bid) throw new NotFoundException('Bid not found.')
    return bid
  }

  /** All bids of one item, created asc (stable quote-comparison order). */
  async listBids(schoolId: string, itemId: string): Promise<{ bids: BidPublic[] }> {
    await this.resolveItem(schoolId, itemId) // 404 on a foreign/unknown item
    const rows = await this.prisma.maintenanceBid.findMany({
      where: { schoolId, itemId },
      include: BID_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    return { bids: rows.map((b) => this.toBidPublic(b)) }
  }

  async createBid(
    schoolId: string,
    itemId: string,
    dto: CreateBidDto,
    userId: string,
  ): Promise<{ bid: BidPublic }> {
    const item = await this.resolveItem(schoolId, itemId)
    if (item.status === 'resolved') {
      throw new BadRequestException('Cannot add a bid to a resolved item.')
    }
    if (!dto.vendorId && !(dto.vendorName ?? '').trim()) {
      throw new BadRequestException('A bid needs a vendor: pass vendorId or vendorName.')
    }
    if (dto.vendorId) await this.assertVendorInSchool(schoolId, dto.vendorId)
    const row = await this.prisma.maintenanceBid.create({
      data: {
        schoolId,
        itemId: item.id,
        vendorId: dto.vendorId ?? null,
        vendorName: dto.vendorName?.trim() || null,
        amount: dto.amount,
        notes: dto.notes ?? null,
        status: 'pending',
        createdByUserId: userId,
      },
      include: BID_INCLUDE,
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'facilities.bid.created',
      targetType: 'maintenance_bids',
      targetId: row.id,
    })
    return { bid: this.toBidPublic(row) }
  }

  async updateBid(
    schoolId: string,
    itemId: string,
    bidId: string,
    dto: UpdateBidDto,
    userId: string,
  ): Promise<{ bid: BidPublic }> {
    const existing = await this.resolveBid(schoolId, itemId, bidId)
    // Decided (accepted/rejected) bids are an immutable record.
    if (existing.status !== 'pending') {
      throw new BadRequestException('Only a pending bid can be edited.')
    }
    if (dto.vendorId) await this.assertVendorInSchool(schoolId, dto.vendorId)
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    // Re-check the create invariant on the MERGED result — a PATCH clearing both
    // vendorId and vendorName must not strip the bid's vendor identity entirely.
    const nextVendorId = pick(dto.vendorId, existing.vendorId)
    const nextVendorName =
      dto.vendorName === undefined ? existing.vendorName : dto.vendorName?.trim() || null
    if (!nextVendorId && !nextVendorName) {
      throw new BadRequestException('A bid needs a vendor: pass vendorId or vendorName.')
    }
    const row = await this.prisma.maintenanceBid.update({
      where: { id: existing.id },
      data: {
        vendorId: nextVendorId,
        vendorName: nextVendorName,
        amount: dto.amount === undefined ? Number(existing.amount) : dto.amount,
        notes: pick(dto.notes, existing.notes),
      },
      include: BID_INCLUDE,
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'facilities.bid.updated',
      targetType: 'maintenance_bids',
      targetId: row.id,
    })
    return { bid: this.toBidPublic(row) }
  }

  async removeBid(
    schoolId: string,
    itemId: string,
    bidId: string,
    userId: string,
  ): Promise<{ ok: true }> {
    const existing = await this.resolveBid(schoolId, itemId, bidId)
    if (existing.status !== 'pending') {
      throw new BadRequestException(
        'Only a pending bid can be deleted — decided bids are an immutable record.',
      )
    }
    await this.prisma.maintenanceBid.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'facilities.bid.deleted',
      targetType: 'maintenance_bids',
      targetId: existing.id,
    })
    return { ok: true }
  }

  /**
   * Leadership (owner-only route) ACCEPT — one atomic transaction:
   *  1. bid → 'accepted'; every pending sibling → 'rejected'.
   *  2. The ITEM is stamped: selectedBidId, vendorId, legacy `vendor` display name
   *     (vendor row name ?? bid free text — keeps every old display path working),
   *     estimatedCost = winning amount, decidedBy/At/Note (Task-approval naming),
   *     and open → scheduled (accepted bid = scheduled work; other statuses kept).
   * Guards: bid must be 'pending'; item must not be 'resolved'; both school-scoped
   * (404 on a foreign id — the row never loads).
   */
  async acceptBid(
    schoolId: string,
    itemId: string,
    bidId: string,
    note: string | null | undefined,
    userId: string,
  ): Promise<BidDecisionResponse> {
    const now = new Date()
    const updatedItem = await this.prisma.$transaction(async (tx) => {
      const bid = await tx.maintenanceBid.findFirst({
        where: { id: bidId, itemId, schoolId },
        include: BID_INCLUDE,
      })
      if (!bid) throw new NotFoundException('Bid not found.')
      const item = await tx.maintenanceItem.findFirst({ where: { id: itemId, schoolId } })
      if (!item) throw new NotFoundException('Maintenance item not found.')
      if (bid.status !== 'pending') {
        throw new BadRequestException('Only a pending bid can be accepted.')
      }
      if (item.status === 'resolved') {
        throw new BadRequestException('Cannot accept a bid on a resolved item.')
      }
      const resolvedVendorName = bid.vendor?.name ?? bid.vendorName ?? null
      // CONDITIONAL winner flip — closes the check-then-act race at READ COMMITTED:
      // two concurrent accepts can both read their bid as 'pending' before either
      // commits. The row lock makes the loser's predicate re-evaluate after the
      // winner commits (status is no longer 'pending' → 0 rows), so it 400s instead
      // of minting a second 'accepted' bid.
      const flipped = await tx.maintenanceBid.updateMany({
        where: { id: bid.id, status: 'pending' },
        data: { status: 'accepted' },
      })
      if (flipped.count !== 1) {
        throw new BadRequestException('Only a pending bid can be accepted.')
      }
      // Atomic sibling rejection — every OTHER still-pending bid on this item.
      await tx.maintenanceBid.updateMany({
        where: { schoolId, itemId, status: 'pending', id: { not: bid.id } },
        data: { status: 'rejected' },
      })
      return tx.maintenanceItem.update({
        where: { id: item.id },
        data: {
          selectedBidId: bid.id,
          vendorId: bid.vendorId,
          vendor: resolvedVendorName,
          estimatedCost: bid.amount,
          decidedByUserId: userId,
          decidedAt: now,
          decisionNote: note ?? null,
          status: item.status === 'open' ? 'scheduled' : item.status,
        },
        include: ITEM_INCLUDE,
      })
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'facilities.bid.accepted',
      targetType: 'maintenance_bids',
      targetId: bidId,
      metadata: { itemId },
    })
    const { bids } = await this.listBids(schoolId, itemId)
    const pendingAmounts = bids.filter((b) => b.status === 'pending').map((b) => b.amount)
    const pendingBidCount = pendingAmounts.length
    const range = pendingBidCount
      ? { min: Math.min(...pendingAmounts), max: Math.max(...pendingAmounts) }
      : { min: null, max: null }
    return { item: this.toPublic(updatedItem, now, pendingBidCount, range), bids }
  }

  /**
   * Leadership (owner-only route) REOPEN — the undo. Valid only when :bidId is the
   * item's CURRENT selectedBidId (400 otherwise). All the item's bids return to
   * 'pending'; the decision stamp clears. estimatedCost, vendorId, the legacy
   * `vendor` string and `status` are DELIBERATELY left as-is — they are visible,
   * user-editable values the accept merely prefilled.
   */
  async reopenBid(
    schoolId: string,
    itemId: string,
    bidId: string,
    userId: string,
  ): Promise<BidDecisionResponse> {
    const now = new Date()
    const updatedItem = await this.prisma.$transaction(async (tx) => {
      const bid = await tx.maintenanceBid.findFirst({ where: { id: bidId, itemId, schoolId } })
      if (!bid) throw new NotFoundException('Bid not found.')
      const item = await tx.maintenanceItem.findFirst({ where: { id: itemId, schoolId } })
      if (!item) throw new NotFoundException('Maintenance item not found.')
      if (item.selectedBidId !== bid.id) {
        throw new BadRequestException('Only the currently accepted bid can be reopened.')
      }
      await tx.maintenanceBid.updateMany({
        where: { schoolId, itemId },
        data: { status: 'pending' },
      })
      // CONDITIONAL stamp-clear (same race guard as acceptBid's winner flip): if a
      // concurrent accept/reopen moved selectedBidId after the read above, the
      // predicate matches 0 rows → 400 (and the tx rolls the bid reset back)
      // instead of silently clearing someone else's decision.
      const cleared = await tx.maintenanceItem.updateMany({
        where: { id: item.id, selectedBidId: bid.id },
        data: {
          selectedBidId: null,
          decidedByUserId: null,
          decidedAt: null,
          decisionNote: null,
        },
      })
      if (cleared.count !== 1) {
        throw new BadRequestException('Only the currently accepted bid can be reopened.')
      }
      const reopened = await tx.maintenanceItem.findFirst({
        where: { id: item.id },
        include: ITEM_INCLUDE,
      })
      if (!reopened) throw new NotFoundException('Maintenance item not found.')
      return reopened
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'facilities.bid.reopened',
      targetType: 'maintenance_bids',
      targetId: bidId,
      metadata: { itemId },
    })
    const { bids } = await this.listBids(schoolId, itemId)
    const pendingAmounts = bids.filter((b) => b.status === 'pending').map((b) => b.amount)
    const pendingBidCount = pendingAmounts.length
    const range = pendingBidCount
      ? { min: Math.min(...pendingAmounts), max: Math.max(...pendingAmounts) }
      : { min: null, max: null }
    return { item: this.toPublic(updatedItem, now, pendingBidCount, range), bids }
  }
}

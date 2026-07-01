import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { MaintenanceItem } from '@finrep/db'
import {
  computeMaintenanceUrgency,
  summarizeBacklog,
  type MaintenanceBacklogSummary,
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
  /** yyyy-mm-dd (@db.Date), or null. */
  targetDate: string | null
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
    return {
      id: row.id,
      title: row.title,
      location: row.location,
      category: row.category,
      priority: row.priority,
      status: row.status,
      // Prisma.Decimal → number (exact for DECIMAL(14,2)); null passes untouched.
      estimatedCost: row.estimatedCost === null ? null : Number(row.estimatedCost),
      targetDate: toIsoDate(row.targetDate),
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
    const row = await this.prisma.maintenanceItem.create({
      data: {
        schoolId,
        title: dto.title,
        location: dto.location ?? null,
        category: dto.category ?? null,
        priority: dto.priority ?? 'medium',
        status: dto.status ?? 'open',
        estimatedCost: dto.estimatedCost ?? null,
        targetDate,
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
    const targetDate = parseIsoDate(dto.targetDate, 'targetDate')
    // Coerce the stored Prisma.Decimal to a number so the pick() fallback unifies
    // with the DTO's `number | null` (Prisma accepts number for a Decimal column).
    const existingCost = existing.estimatedCost === null ? null : Number(existing.estimatedCost)

    const row = await this.prisma.maintenanceItem.update({
      where: { id: existing.id },
      data: {
        title: pick(dto.title, existing.title),
        location: pick(dto.location, existing.location),
        category: pick(dto.category, existing.category),
        priority: pick(dto.priority, existing.priority),
        status: pick(dto.status, existing.status),
        estimatedCost: pick(dto.estimatedCost, existingCost),
        targetDate: pick(targetDate, existing.targetDate),
        notes: pick(dto.notes, existing.notes),
        // createdByUserId is NEVER overwritten on update (audit-lite provenance).
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'facilities.item.updated',
      targetType: 'maintenance_items',
      targetId: row.id,
    })
    return this.toPublic(row, new Date())
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

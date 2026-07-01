import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { AdvancementCampaign } from '@finrep/db'
import {
  computeCampaignProgress,
  summarizeGiving,
  type CampaignUrgency,
  type GivingSummary,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { CreateCampaignDto } from './dto/create-campaign.dto.js'
import type { UpdateCampaignDto } from './dto/update-campaign.dto.js'

/** One campaign as returned to the client, with COMPUTED progress. */
export interface CampaignPublic {
  id: string
  name: string
  campaignType: string | null
  /** Prisma.Decimal → JS number (exact for DECIMAL(14,2)); null passes. */
  goalAmount: number | null
  /** Prisma.Decimal → JS number; null passes. */
  raisedAmount: number | null
  fiscalYear: number | null
  /** yyyy-mm-dd (@db.Date), or null. */
  startDate: string | null
  closeDate: string | null
  status: string
  notes: string | null
  createdByUserId: string | null
  /** COMPUTED (never stored) — from @finrep/compliance. */
  pctOfGoal: number | null
  gapToGoal: number | null
  urgency: CampaignUrgency
  daysUntilClose: number | null
  createdAt: string
  updatedAt: string
}

export interface CampaignListResponse {
  campaigns: CampaignPublic[]
  summary: GivingSummary
}

/** Deterministic list order: active first, then by urgency, then close date, name, id. */
const STATUS_RANK: Record<string, number> = { active: 0, planned: 1, closed: 2 }
const URGENCY_RANK: Record<string, number> = {
  overdue: 0,
  'closing-soon': 1,
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
 * Phase 4 Advancement v1 — the fundraising campaign register service. The FOURTH
 * licensable module (after governance + accreditation + facilities), completing all
 * 8 domains that feed the prioritised briefing. School-scoped (NOT period-scoped).
 * TENANT ISOLATION is enforced on EVERY query: reads filter by `schoolId`, and every
 * mutation first resolves the row `where { id, schoolId }` — a campaignId owned by
 * another school resolves to null → NotFoundException, so a cross-tenant mutation is
 * IMPOSSIBLE (the foreign row never even loads).
 *
 * Every response is enriched with the pure computeCampaignProgress (injectable `now`)
 * + summarizeGiving, so the register list and the briefing 'advancement' STEP share
 * one source of truth. DECIMAL DISCIPLINE: goalAmount/raisedAmount (Prisma.Decimal)
 * are coerced to JS numbers in toPublic BEFORE they reach the pure helpers — the
 * compliance package never imports Prisma.
 */
@Injectable()
export class AdvancementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toPublic(row: AdvancementCampaign, now: Date): CampaignPublic {
    // Prisma.Decimal → number (exact for DECIMAL(14,2)); null passes untouched.
    const goalAmount = row.goalAmount === null ? null : Number(row.goalAmount)
    const raisedAmount = row.raisedAmount === null ? null : Number(row.raisedAmount)
    const p = computeCampaignProgress(
      { status: row.status, goalAmount, raisedAmount, closeDate: row.closeDate },
      now,
    )
    return {
      id: row.id,
      name: row.name,
      campaignType: row.campaignType,
      goalAmount,
      raisedAmount,
      fiscalYear: row.fiscalYear,
      startDate: toIsoDate(row.startDate),
      closeDate: toIsoDate(row.closeDate),
      status: row.status,
      notes: row.notes,
      createdByUserId: row.createdByUserId,
      pctOfGoal: p.pctOfGoal,
      gapToGoal: p.gapToGoal,
      urgency: p.urgency,
      daysUntilClose: p.daysUntilClose,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /**
   * Resolve a campaign that belongs to the PATH school — the tenant + existence gate
   * in ONE query. A foreign/unknown campaignId → null → 404.
   */
  private async resolveCampaign(schoolId: string, campaignId: string): Promise<AdvancementCampaign> {
    const row = await this.prisma.advancementCampaign.findFirst({
      where: { id: campaignId, schoolId },
    })
    if (!row) throw new NotFoundException('Advancement campaign not found.')
    return row
  }

  /** List all campaigns for one school, deterministically ordered + enriched, plus the summary. */
  async listCampaigns(schoolId: string, now = new Date()): Promise<CampaignListResponse> {
    const rows = await this.prisma.advancementCampaign.findMany({ where: { schoolId } })
    const campaigns = rows
      .map((r) => this.toPublic(r, now))
      .sort((a, b) => {
        const s = (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99)
        if (s !== 0) return s
        const u = (URGENCY_RANK[a.urgency] ?? 99) - (URGENCY_RANK[b.urgency] ?? 99)
        if (u !== 0) return u
        // closeDate asc, nulls last.
        const ca = a.closeDate ?? '9999-12-31'
        const cb = b.closeDate ?? '9999-12-31'
        if (ca !== cb) return ca.localeCompare(cb)
        const n = a.name.localeCompare(b.name)
        return n !== 0 ? n : a.id.localeCompare(b.id)
      })
    const summary = summarizeGiving(
      campaigns.map((c) => ({
        status: c.status,
        goalAmount: c.goalAmount,
        raisedAmount: c.raisedAmount,
        pctOfGoal: c.pctOfGoal,
        urgency: c.urgency,
      })),
    )
    return { campaigns, summary }
  }

  async createCampaign(
    schoolId: string,
    dto: CreateCampaignDto,
    userId: string,
  ): Promise<CampaignPublic> {
    const startDate = parseIsoDate(dto.startDate, 'startDate') ?? null
    const closeDate = parseIsoDate(dto.closeDate, 'closeDate') ?? null
    const row = await this.prisma.advancementCampaign.create({
      data: {
        schoolId,
        name: dto.name,
        campaignType: dto.campaignType ?? null,
        goalAmount: dto.goalAmount ?? null,
        // raisedAmount is nullable in the schema (mirrors estimatedCost); default an
        // omitted create to 0 for a sensible "nothing raised yet" starting figure.
        raisedAmount: dto.raisedAmount ?? 0,
        fiscalYear: dto.fiscalYear ?? null,
        startDate,
        closeDate,
        status: dto.status ?? 'active',
        notes: dto.notes ?? null,
        createdByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'advancement.campaign.created',
      targetType: 'advancement_campaigns',
      targetId: row.id,
    })
    return this.toPublic(row, new Date())
  }

  async updateCampaign(
    schoolId: string,
    campaignId: string,
    dto: UpdateCampaignDto,
    userId: string,
  ): Promise<CampaignPublic> {
    const existing = await this.resolveCampaign(schoolId, campaignId)
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    const startDate = parseIsoDate(dto.startDate, 'startDate')
    const closeDate = parseIsoDate(dto.closeDate, 'closeDate')
    // Coerce the stored Prisma.Decimals to numbers so the pick() fallback unifies with
    // the DTO's `number | null` (Prisma accepts number for a Decimal column).
    const existingGoal = existing.goalAmount === null ? null : Number(existing.goalAmount)
    const existingRaised = existing.raisedAmount === null ? null : Number(existing.raisedAmount)

    const row = await this.prisma.advancementCampaign.update({
      where: { id: existing.id },
      data: {
        name: pick(dto.name, existing.name),
        campaignType: pick(dto.campaignType, existing.campaignType),
        goalAmount: pick(dto.goalAmount, existingGoal),
        raisedAmount: pick(dto.raisedAmount, existingRaised),
        fiscalYear: pick(dto.fiscalYear, existing.fiscalYear),
        startDate: pick(startDate, existing.startDate),
        closeDate: pick(closeDate, existing.closeDate),
        status: pick(dto.status, existing.status),
        notes: pick(dto.notes, existing.notes),
        // createdByUserId is NEVER overwritten on update (audit-lite provenance).
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'advancement.campaign.updated',
      targetType: 'advancement_campaigns',
      targetId: row.id,
    })
    return this.toPublic(row, new Date())
  }

  async removeCampaign(
    schoolId: string,
    campaignId: string,
    userId: string,
  ): Promise<{ id: string }> {
    const existing = await this.resolveCampaign(schoolId, campaignId)
    await this.prisma.advancementCampaign.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'advancement.campaign.deleted',
      targetType: 'advancement_campaigns',
      targetId: existing.id,
    })
    return { id: existing.id }
  }
}

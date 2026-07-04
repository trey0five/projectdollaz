import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { AdvancementCampaign, AdvancementGift } from '@finrep/db'
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
import type { CreateGiftDto } from './dto/create-gift.dto.js'
import type { UpdateGiftDto } from './dto/update-gift.dto.js'

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
  // ── Gift/pledge ROLLUP (computed from AdvancementGift children) ──────────────
  /** Σ (amount - receivedAmount) for kind='pledge' AND status != 'written_off'. */
  pledgedOutstanding: number
  /** raisedAmount (received) + pledgedOutstanding. */
  committedTotal: number
  /** Number of gift/pledge entries under this campaign (0 → raisedAmount is the manual figure). */
  giftCount: number
  createdAt: string
  updatedAt: string
}

export interface CampaignListResponse {
  campaigns: CampaignPublic[]
  summary: GivingSummary
}

/** One gift/pledge as returned to the client (AGGREGATE-ONLY, no donor PII). */
export interface GiftPublic {
  id: string
  campaignId: string
  kind: string
  /** Prisma.Decimal → JS number (exact for DECIMAL(14,2)). */
  amount: number
  receivedAmount: number
  status: string
  /** yyyy-mm-dd (@db.Date). */
  occurredOn: string | null
  label: string | null
  note: string | null
  source: string | null
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface GiftListResponse {
  gifts: GiftPublic[]
}

/** Per-campaign gift rollup accumulated from a school-wide aggregate (no N+1). */
interface GiftRollup {
  giftCount: number
  /** Σ receivedAmount across ALL gifts under the campaign. */
  received: number
  /** Σ (amount - receivedAmount) for kind='pledge' AND status != 'written_off'. */
  pledgedOutstanding: number
}

const cents = (n: number): number => Math.round(n * 100)

/**
 * Derive the persisted { receivedAmount, status } for a gift/pledge from its kind +
 * amount + inputs — the ONE place the "gift ⇒ received=amount/received" and
 * "pledge ⇒ status from received" invariants live (shared by create + update). Pure;
 * throws BadRequest on an out-of-range pledge received. `written_off` is an explicit
 * override (any other statusInput is ignored and re-derived from receivedAmount).
 */
function deriveGiftState(
  kind: string,
  amount: number,
  receivedInput: number | undefined,
  statusInput: string | undefined,
): { receivedAmount: number; status: string } {
  if (kind === 'gift') {
    // A gift is fully in on creation: received == amount. Only 'written_off' overrides.
    return { receivedAmount: amount, status: statusInput === 'written_off' ? 'written_off' : 'received' }
  }
  // pledge
  const received = receivedInput ?? 0
  if (received < 0 || cents(received) > cents(amount)) {
    throw new BadRequestException('receivedAmount must be between 0 and the pledged amount.')
  }
  if (statusInput === 'written_off') return { receivedAmount: received, status: 'written_off' }
  const rc = cents(received)
  const ac = cents(amount)
  const status = rc === 0 ? 'pledged' : rc >= ac ? 'received' : 'partial'
  return { receivedAmount: received, status }
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

  private toPublic(row: AdvancementCampaign, now: Date, rollup?: GiftRollup): CampaignPublic {
    // Prisma.Decimal → number (exact for DECIMAL(14,2)); null passes untouched.
    const goalAmount = row.goalAmount === null ? null : Number(row.goalAmount)
    const storedRaised = row.raisedAmount === null ? null : Number(row.raisedAmount)
    // BACKWARD-COMPATIBLE ROLLUP: once the campaign has ≥1 gift/pledge entry, `raised`
    // is the computed Σ receivedAmount; a campaign with NO entries keeps its hand-typed
    // raisedAmount (existing campaigns are untouched). The EFFECTIVE raised then feeds
    // computeCampaignProgress + summarizeGiving, so pct/urgency reflect the real money.
    const hasGifts = !!rollup && rollup.giftCount > 0
    const raisedAmount = hasGifts ? rollup!.received : storedRaised
    const pledgedOutstanding = rollup?.pledgedOutstanding ?? 0
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
      pledgedOutstanding,
      committedTotal: Math.round(((raisedAmount ?? 0) + pledgedOutstanding) * 100) / 100,
      giftCount: rollup?.giftCount ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** Prisma.Decimal → JS number; a null aggregate _sum → 0. */
  private static sumToNumber(v: unknown): number {
    return v === null || v === undefined ? 0 : Number(v)
  }

  private toGiftPublic(row: AdvancementGift): GiftPublic {
    return {
      id: row.id,
      campaignId: row.campaignId,
      kind: row.kind,
      amount: Number(row.amount),
      receivedAmount: Number(row.receivedAmount),
      status: row.status,
      occurredOn: toIsoDate(row.occurredOn),
      label: row.label,
      note: row.note,
      source: row.source,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /**
   * Compute per-campaign gift rollups for a school (or ONE campaign) via TWO groupBy
   * aggregates — NOT per-campaign queries (no N+1). Returns a Map keyed by campaignId.
   *   • received/giftCount: Σ receivedAmount + count over ALL gifts.
   *   • pledgedOutstanding: Σ (amount - receivedAmount) over pledges NOT written_off.
   */
  private async giftRollups(schoolId: string, campaignId?: string): Promise<Map<string, GiftRollup>> {
    const scope = { schoolId, ...(campaignId ? { campaignId } : {}) }
    const [received, pledged] = await Promise.all([
      this.prisma.advancementGift.groupBy({
        by: ['campaignId'],
        where: scope,
        _sum: { receivedAmount: true },
        _count: { _all: true },
      }),
      this.prisma.advancementGift.groupBy({
        by: ['campaignId'],
        where: { ...scope, kind: 'pledge', status: { not: 'written_off' } },
        _sum: { amount: true, receivedAmount: true },
      }),
    ])
    const map = new Map<string, GiftRollup>()
    for (const r of received) {
      map.set(r.campaignId, {
        giftCount: r._count._all,
        received: AdvancementService.sumToNumber(r._sum.receivedAmount),
        pledgedOutstanding: 0,
      })
    }
    for (const p of pledged) {
      const cur = map.get(p.campaignId) ?? { giftCount: 0, received: 0, pledgedOutstanding: 0 }
      const amt = AdvancementService.sumToNumber(p._sum.amount)
      const rec = AdvancementService.sumToNumber(p._sum.receivedAmount)
      cur.pledgedOutstanding = Math.max(0, Math.round((amt - rec) * 100) / 100)
      map.set(p.campaignId, cur)
    }
    return map
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
    const [rows, rollups] = await Promise.all([
      this.prisma.advancementCampaign.findMany({ where: { schoolId } }),
      this.giftRollups(schoolId),
    ])
    const campaigns = rows
      .map((r) => this.toPublic(r, now, rollups.get(r.id)))
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
    // Reflect the gift rollup in the returned campaign (a manual raisedAmount edit is
    // OVERRIDDEN by the computed Σ receivedAmount once entries exist).
    const rollups = await this.giftRollups(schoolId, campaignId)
    return this.toPublic(row, new Date(), rollups.get(row.id))
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

  // ── Gifts & Pledges (nested under a campaign) ───────────────────────────────
  // AGGREGATE-ONLY / NO per-donor PII: a gift row is amount/kind/status/date + an
  // OPTIONAL non-identifying label — there is no donor identity anywhere in this path.

  /** Resolve a gift owned by the PATH school — tenant + existence gate in ONE query. */
  private async resolveGift(schoolId: string, giftId: string): Promise<AdvancementGift> {
    const row = await this.prisma.advancementGift.findFirst({ where: { id: giftId, schoolId } })
    if (!row) throw new NotFoundException('Gift not found.')
    return row
  }

  /** List a campaign's gifts (newest first), tenant + campaign-ownership checked. */
  async listGifts(schoolId: string, campaignId: string): Promise<GiftListResponse> {
    await this.resolveCampaign(schoolId, campaignId) // 404 if foreign/cross-tenant
    const rows = await this.prisma.advancementGift.findMany({
      where: { campaignId, schoolId },
    })
    const gifts = rows
      .map((r) => this.toGiftPublic(r))
      .sort((a, b) => {
        // occurredOn desc (nulls last), then createdAt desc, then id.
        const oa = a.occurredOn ?? ''
        const ob = b.occurredOn ?? ''
        if (oa !== ob) return ob.localeCompare(oa)
        if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt)
        return a.id.localeCompare(b.id)
      })
    return { gifts }
  }

  async createGift(
    schoolId: string,
    campaignId: string,
    dto: CreateGiftDto,
    userId: string,
  ): Promise<GiftPublic> {
    // resolveCampaign FIRST — a foreign/unknown campaign 404s BEFORE any insert.
    const campaign = await this.resolveCampaign(schoolId, campaignId)
    const occurredOn = parseIsoDate(dto.occurredOn, 'occurredOn')
    if (!occurredOn) throw new BadRequestException('occurredOn is required.')
    // status is NEVER trusted from create — it is DERIVED from kind + amount + received.
    const { receivedAmount, status } = deriveGiftState(dto.kind, dto.amount, dto.receivedAmount, undefined)

    const row = await this.prisma.advancementGift.create({
      data: {
        // schoolId is COPIED from the resolved campaign — never trusted from the client.
        schoolId: campaign.schoolId,
        campaignId: campaign.id,
        kind: dto.kind,
        amount: dto.amount,
        receivedAmount,
        status,
        occurredOn,
        label: dto.label ?? null,
        note: dto.note ?? null,
        source: dto.source ?? null,
        createdByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'advancement.gift.created',
      targetType: 'advancement_gifts',
      targetId: row.id,
    })
    return this.toGiftPublic(row)
  }

  async updateGift(
    schoolId: string,
    giftId: string,
    dto: UpdateGiftDto,
    userId: string,
  ): Promise<GiftPublic> {
    const existing = await this.resolveGift(schoolId, giftId)
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    // occurredOn is a REQUIRED (non-null) column — an omitted patch keeps the current
    // date; the DTO can't send null (it's @IsDateString), so coerce nullish → undefined.
    const occurredOn = parseIsoDate(dto.occurredOn, 'occurredOn') ?? undefined

    // Merge the money-shape inputs, then RE-DERIVE receivedAmount + status (the common
    // "record a payment on a pledge" path re-runs the same invariant as create).
    const kind = pick(dto.kind, existing.kind)
    const amount = pick(dto.amount, Number(existing.amount))
    const receivedInput = pick(dto.receivedAmount, Number(existing.receivedAmount))
    // status from the DTO (explicit 'written_off' override), else the current status.
    const statusInput = pick(dto.status, existing.status)
    const { receivedAmount, status } = deriveGiftState(kind, amount, receivedInput, statusInput)

    const row = await this.prisma.advancementGift.update({
      where: { id: existing.id },
      data: {
        kind,
        amount,
        receivedAmount,
        status,
        occurredOn: pick(occurredOn, existing.occurredOn),
        label: pick(dto.label, existing.label),
        note: pick(dto.note, existing.note),
        source: pick(dto.source, existing.source),
        // createdByUserId is NEVER overwritten on update (audit-lite provenance).
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'advancement.gift.updated',
      targetType: 'advancement_gifts',
      targetId: row.id,
    })
    return this.toGiftPublic(row)
  }

  async removeGift(schoolId: string, giftId: string, userId: string): Promise<{ id: string }> {
    const existing = await this.resolveGift(schoolId, giftId)
    await this.prisma.advancementGift.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'advancement.gift.deleted',
      targetType: 'advancement_gifts',
      targetId: existing.id,
    })
    return { id: existing.id }
  }
}

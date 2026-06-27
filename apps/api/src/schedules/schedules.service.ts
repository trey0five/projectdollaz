import { Injectable } from '@nestjs/common'
import { Prisma } from '@finrep/db'
import type { CapitalSchedule, CashSchedule, CampaignSchedule } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { SaveCapitalScheduleDto } from './dto/save-capital-schedule.dto.js'
import type { SaveCashScheduleDto } from './dto/save-cash-schedule.dto.js'
import type { SaveCampaignScheduleDto } from './dto/save-campaign-schedule.dto.js'

// ── The stored row shapes (PUT validates + persists verbatim; GET returns raw) ──

export interface CapitalItem {
  id: string
  group: string
  label: string
  actual: number
  budget: number
  comment: string
}

export interface CashAccount {
  id: string
  restriction: string
  institution: string
  accountDescription: string
  vehicle: string
  maturity: string
  interestRate: number | null
  balance: number
  insuredPortion: number
  uninsuredPortion: number
  comment: string
}

export interface CampaignItem {
  id: string
  group: string
  label: string
  budget: number
  estimate: number
  comment: string
}

export interface CapitalScheduleResult {
  items: CapitalItem[]
  updatedAt: string | null
}

export interface CampaignScheduleResult {
  campaignName: string | null
  items: CampaignItem[]
  updatedAt: string | null
}

export interface CashScheduleResult {
  accounts: CashAccount[]
  updatedAt: string | null
}

/** Coerce to a finite number, defaulting to 0. Matches buildLines' defensiveness. */
function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Phase 3 — Capital Budget + Cash & Investments supporting schedules. Each is a
 * single JSON-array row per (school, period), bulk-replaced on PUT. Ownership is
 * enforced via getOwnedPeriod (404 cross-tenant). NEVER 404s on a missing row —
 * a never-saved period reads as an empty array. All over-under/subtotal math
 * lives in BoardReportService.assemble; this service only stores + reads raw.
 */
@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly audit: AuditService,
  ) {}

  // ── Capital ─────────────────────────────────────────────────────────────────

  async getCapitalSchedule(schoolId: string, periodId: string): Promise<CapitalScheduleResult> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const row = await this.prisma.capitalSchedule.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })
    return {
      items: this.normalizeItems(row?.items),
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    }
  }

  async saveCapitalSchedule(
    schoolId: string,
    periodId: string,
    dto: SaveCapitalScheduleDto,
    userId: string,
  ): Promise<CapitalScheduleResult> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const items = this.normalizeItems(dto.items)

    const data = {
      items: items as unknown as Prisma.InputJsonValue,
      updatedByUserId: userId,
    }
    const row = await this.prisma.capitalSchedule.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
      create: { schoolId, fiscalPeriodId: period.id, ...data },
      update: data,
    })

    await this.audit.write({
      schoolId,
      userId,
      action: 'capital_schedule.saved',
      targetType: 'capital_schedules',
      targetId: row.id,
      metadata: { fiscalPeriodId: period.id, count: items.length },
    })

    return {
      items: this.normalizeItems(row.items),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** Thin finder for BoardReportService.assemble — raw row or null, no audit/ownership write. */
  async getCapital(schoolId: string, periodId: string): Promise<CapitalSchedule | null> {
    return this.prisma.capitalSchedule.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: periodId } },
    })
  }

  private normalizeItems(raw: unknown): CapitalItem[] {
    if (!Array.isArray(raw)) return []
    return raw.map((r) => {
      const o = (r ?? {}) as Record<string, unknown>
      return {
        id: typeof o.id === 'string' && o.id.length > 0 ? o.id : randomId(),
        group: String(o.group ?? ''),
        label: String(o.label ?? ''),
        actual: num(o.actual),
        budget: num(o.budget),
        comment: typeof o.comment === 'string' ? o.comment : '',
      }
    })
  }

  // ── Cash ────────────────────────────────────────────────────────────────────

  async getCashSchedule(schoolId: string, periodId: string): Promise<CashScheduleResult> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const row = await this.prisma.cashSchedule.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })
    return {
      accounts: this.normalizeAccounts(row?.accounts),
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    }
  }

  async saveCashSchedule(
    schoolId: string,
    periodId: string,
    dto: SaveCashScheduleDto,
    userId: string,
  ): Promise<CashScheduleResult> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const accounts = this.normalizeAccounts(dto.accounts)

    const data = {
      accounts: accounts as unknown as Prisma.InputJsonValue,
      updatedByUserId: userId,
    }
    const row = await this.prisma.cashSchedule.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
      create: { schoolId, fiscalPeriodId: period.id, ...data },
      update: data,
    })

    await this.audit.write({
      schoolId,
      userId,
      action: 'cash_schedule.saved',
      targetType: 'cash_schedules',
      targetId: row.id,
      metadata: { fiscalPeriodId: period.id, count: accounts.length },
    })

    return {
      accounts: this.normalizeAccounts(row.accounts),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** Thin finder for BoardReportService.assemble — raw row or null. */
  async getCash(schoolId: string, periodId: string): Promise<CashSchedule | null> {
    return this.prisma.cashSchedule.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: periodId } },
    })
  }

  private normalizeAccounts(raw: unknown): CashAccount[] {
    if (!Array.isArray(raw)) return []
    return raw.map((r) => {
      const o = (r ?? {}) as Record<string, unknown>
      const rate =
        o.interestRate === undefined || o.interestRate === null || o.interestRate === ''
          ? null
          : num(o.interestRate)
      return {
        id: typeof o.id === 'string' && o.id.length > 0 ? o.id : randomId(),
        restriction: String(o.restriction ?? ''),
        institution: String(o.institution ?? ''),
        accountDescription: String(o.accountDescription ?? ''),
        vehicle: String(o.vehicle ?? ''),
        maturity: typeof o.maturity === 'string' ? o.maturity : '',
        interestRate: rate,
        balance: num(o.balance),
        insuredPortion: num(o.insuredPortion),
        uninsuredPortion: num(o.uninsuredPortion),
        comment: typeof o.comment === 'string' ? o.comment : '',
      }
    })
  }

  // ── Capital Campaign (Phase 6) ────────────────────────────────────────────────

  async getCampaignSchedule(
    schoolId: string,
    periodId: string,
  ): Promise<CampaignScheduleResult> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const row = await this.prisma.campaignSchedule.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })
    return {
      campaignName: row?.campaignName ?? null,
      items: this.normalizeCampaignItems(row?.items),
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    }
  }

  async saveCampaignSchedule(
    schoolId: string,
    periodId: string,
    dto: SaveCampaignScheduleDto,
    userId: string,
  ): Promise<CampaignScheduleResult> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const items = this.normalizeCampaignItems(dto.items)
    const campaignName = dto.campaignName?.trim() || null

    const data = {
      campaignName,
      items: items as unknown as Prisma.InputJsonValue,
      updatedByUserId: userId,
    }
    const row = await this.prisma.campaignSchedule.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
      create: { schoolId, fiscalPeriodId: period.id, ...data },
      update: data,
    })

    await this.audit.write({
      schoolId,
      userId,
      action: 'campaign_schedule.saved',
      targetType: 'campaign_schedules',
      targetId: row.id,
      metadata: { fiscalPeriodId: period.id, count: items.length },
    })

    return {
      campaignName: row.campaignName ?? null,
      items: this.normalizeCampaignItems(row.items),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** Thin finder for BoardReportService.assemble — raw row or null. */
  async getCampaign(schoolId: string, periodId: string): Promise<CampaignSchedule | null> {
    return this.prisma.campaignSchedule.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: periodId } },
    })
  }

  private normalizeCampaignItems(raw: unknown): CampaignItem[] {
    if (!Array.isArray(raw)) return []
    return raw.map((r) => {
      const o = (r ?? {}) as Record<string, unknown>
      return {
        id: typeof o.id === 'string' && o.id.length > 0 ? o.id : randomId(),
        // FREE-TEXT group — NO enum clamp. Trimmed so the web autosave baseline
        // (which also trims) round-trips byte-identically and OPENING writes nothing.
        group: String(o.group ?? '').trim(),
        label: String(o.label ?? ''),
        budget: num(o.budget),
        estimate: num(o.estimate),
        comment: typeof o.comment === 'string' ? o.comment : '',
      }
    })
  }
}

/** Server-side fallback id when the client omits one (kept stable thereafter). */
function randomId(): string {
  // crypto.randomUUID is available in Node 18+ (the API runtime).
  return globalThis.crypto?.randomUUID?.() ?? `s_${Math.random().toString(36).slice(2, 12)}`
}

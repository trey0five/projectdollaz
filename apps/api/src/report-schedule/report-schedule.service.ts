import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { ReportSchedule } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { InsightService } from '../analytics/insight.service.js'
import { MailerService } from '../auth/mailer.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { UpsertScheduleDto } from './dto/upsert-schedule.dto.js'

const CADENCES = ['weekly', 'monthly'] as const
type Cadence = (typeof CADENCES)[number]
const DUE_MS: Record<Cadence, number> = {
  weekly: 7 * 24 * 3600 * 1000,
  monthly: 30 * 24 * 3600 * 1000,
}
const CHECK_INTERVAL_MS = 30 * 60 * 1000 // re-check due schedules every 30 min

export interface SchedulePublic {
  cadence: string
  recipients: string
  enabled: boolean
  lastSentAt: string | null
}

/**
 * Phase 3 — recurring board-summary email delivery. Dependency-free: an interval
 * started in onModuleInit periodically sends any enabled schedule that is due
 * (cadence vs lastSentAt). The email is self-contained (the period's insight
 * summary) plus a link to the full board packet. Never throws to the loop.
 */
@Injectable()
export class ReportScheduleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportScheduleService.name)
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly insight: InsightService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.runDue(), CHECK_INTERVAL_MS)
    // A delayed first sweep so a just-booted container catches up.
    setTimeout(() => void this.runDue(), 60_000)
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private toPublic(row: ReportSchedule | null): SchedulePublic {
    return {
      cadence: row?.cadence ?? 'monthly',
      recipients: row?.recipients ?? '',
      enabled: row?.enabled ?? false,
      lastSentAt: row?.lastSentAt ? row.lastSentAt.toISOString() : null,
    }
  }

  async get(schoolId: string): Promise<SchedulePublic> {
    const row = await this.prisma.reportSchedule.findUnique({ where: { schoolId } })
    return this.toPublic(row)
  }

  async upsert(schoolId: string, dto: UpsertScheduleDto, userId: string): Promise<SchedulePublic> {
    const data = {
      ...(dto.cadence !== undefined ? { cadence: dto.cadence } : {}),
      ...(dto.recipients !== undefined ? { recipients: dto.recipients } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      updatedByUserId: userId,
    }
    const row = await this.prisma.reportSchedule.upsert({
      where: { schoolId },
      create: { schoolId, ...data },
      update: data,
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'report_schedule.updated',
      targetType: 'report_schedules',
      metadata: { enabled: row.enabled, cadence: row.cadence },
    })
    return this.toPublic(row)
  }

  /** Manual "send test now" — sends regardless of enabled/due, if recipients + a snapshot exist. */
  async sendNow(schoolId: string, userId: string): Promise<{ sent: number; message: string }> {
    const row = await this.prisma.reportSchedule.findUnique({ where: { schoolId } })
    if (!row) return { sent: 0, message: 'Configure recipients first.' }
    const sent = await this.sendFor(row, true)
    await this.audit.write({
      schoolId,
      userId,
      action: 'report_schedule.test_sent',
      targetType: 'report_schedules',
      metadata: { sent },
    })
    return {
      sent,
      message: sent > 0 ? `Sent to ${sent} recipient(s).` : 'Nothing sent — check recipients and that the period has a snapshot.',
    }
  }

  private parseRecipients(raw: string): string[] {
    return (raw ?? '')
      .split(/[,\n;]+/)
      .map((x) => x.trim())
      .filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))
  }

  private async runDue(): Promise<void> {
    try {
      const schedules = await this.prisma.reportSchedule.findMany({ where: { enabled: true } })
      const now = Date.now()
      for (const s of schedules) {
        const cadence: Cadence = (CADENCES as readonly string[]).includes(s.cadence)
          ? (s.cadence as Cadence)
          : 'monthly'
        const due = !s.lastSentAt || now - s.lastSentAt.getTime() >= DUE_MS[cadence]
        if (due) await this.sendFor(s)
      }
    } catch (e) {
      this.logger.warn(`runDue failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  private async sendFor(schedule: ReportSchedule, force = false): Promise<number> {
    if (!force && !schedule.enabled) return 0
    const recipients = this.parseRecipients(schedule.recipients)
    if (recipients.length === 0) return 0

    const school = await this.prisma.school.findUnique({ where: { id: schedule.schoolId } })
    if (!school) return 0

    const periods = await this.periods.listPeriods(schedule.schoolId)
    const current = periods.find((p) => p.hasSnapshot)
    if (!current) return 0

    let body = ''
    try {
      const insight = await this.insight.insightFor(schedule.schoolId, current.id)
      body = insight.text
    } catch {
      body = 'A new financial summary is available for this period.'
    }
    const webOrigin = this.config.get<string>('webOrigin') ?? 'http://localhost:5173'
    const link = `${webOrigin}/board-packet/print?period=${current.id}`

    for (const to of recipients) {
      try {
        await this.mailer.sendBoardSummary(to, {
          schoolName: school.name,
          periodLabel: current.label ?? null,
          body,
          link,
        })
      } catch (e) {
        this.logger.warn(`board summary to ${to} failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    await this.prisma.reportSchedule.update({
      where: { schoolId: schedule.schoolId },
      data: { lastSentAt: new Date() },
    })
    return recipients.length
  }
}

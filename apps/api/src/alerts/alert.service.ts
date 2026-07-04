import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Alert, User } from '@finrep/db'
import { formatMetricValueLong, resolveDisplayUnit } from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AnalyticsService } from '../analytics/analytics.service.js'
import { InsightService } from '../analytics/insight.service.js'
import { MailerService } from '../auth/mailer.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { CreateAlertDto } from './dto/create-alert.dto.js'
import type { UpdateAlertDto } from './dto/update-alert.dto.js'

const CHECK_INTERVAL_MS = 30 * 60 * 1000 // re-check due/edge alerts every 30 min

const CADENCES = ['daily', 'weekly', 'monthly'] as const
type Cadence = (typeof CADENCES)[number]
const DUE_MS: Record<Cadence, number> = {
  daily: 24 * 3600 * 1000,
  weekly: 7 * 24 * 3600 * 1000,
  monthly: 30 * 24 * 3600 * 1000,
}

/**
 * The scalar metrics a THRESHOLD alert may watch. Excludes the mix metrics
 * (revenue_mix/expense_mix) whose "value" is a component breakdown, not a single
 * comparable number. Shared with Penny's create_alert proposal validator (imported
 * there) so the tool and the service can never accept different keys.
 */
export const ALERT_METRIC_KEYS = new Set<string>([
  'operating_margin',
  'days_cash_on_hand',
  'months_operating_reserve',
  'tuition_dependency',
  'cost_per_pupil',
  'net_tuition_per_student',
  'financial_aid_per_student',
  'aid_per_aided_student',
  'tuition_discount_rate',
  'pct_students_on_aid',
  'enrollment_change_yoy',
  'student_teacher_ratio',
])

export interface AlertPublic {
  id: string
  type: string
  cadence: string | null
  metricKey: string | null
  operator: string | null
  threshold: number | null
  recipientEmail: string
  enabled: boolean
  label: string | null
  lastSentAt: string | null
  lastValue: number | null
  lastBreached: boolean
  createdAt: string
  updatedAt: string
}

/** Plain-language phrasing shared by emails + summaries. */
function opWord(operator: string | null | undefined): string {
  return operator === 'lt' ? 'below' : operator === 'gt' ? 'above' : 'crossing'
}

/**
 * Phase 4E — proactive alerts / standing requests. MIRRORS ReportScheduleService:
 * a dependency-free interval started in onModuleInit periodically sends any enabled
 * alert that is due. DIGEST alerts respect their cadence (lastSentAt); THRESHOLD
 * alerts are EDGE-TRIGGERED — they email only on a FRESH crossing (breached &&
 * !lastBreached) and re-arm when the metric recovers, so a metric that stays past
 * the line does not re-email every tick. runDue() never throws to the loop, and
 * each alert is wrapped so one failure never aborts the sweep. Emails go out via
 * MailerService.sendAlert (a [DEV MAIL] console stub without SMTP — still recorded
 * as sent). Not period-scoped; the current snapshot period is resolved per alert.
 */
@Injectable()
export class AlertService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertService.name)
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly analytics: AnalyticsService,
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

  private toPublic(row: Alert): AlertPublic {
    return {
      id: row.id,
      type: row.type,
      cadence: row.cadence,
      metricKey: row.metricKey,
      operator: row.operator,
      threshold: row.threshold,
      recipientEmail: row.recipientEmail,
      enabled: row.enabled,
      label: row.label,
      lastSentAt: row.lastSentAt ? row.lastSentAt.toISOString() : null,
      lastValue: row.lastValue,
      lastBreached: row.lastBreached,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  async list(schoolId: string): Promise<{ alerts: AlertPublic[] }> {
    const rows = await this.prisma.alert.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
    })
    return { alerts: rows.map((r) => this.toPublic(r)) }
  }

  /**
   * Create a standing alert. UNTRUSTED input (also reachable via Penny's /apply) —
   * re-validate every field by type. recipientEmail defaults to the creator's email.
   * Returns the created row so Penny's dispatchApply can capture its id for Undo.
   */
  async create(schoolId: string, dto: CreateAlertDto, userId: string): Promise<AlertPublic> {
    const type = dto.type === 'threshold' ? 'threshold' : dto.type === 'digest' ? 'digest' : ''
    if (!type) throw new BadRequestException('Alert type must be "digest" or "threshold".')

    // Resolve the default recipient (the creator) once.
    const rawEmail = typeof dto.recipientEmail === 'string' ? dto.recipientEmail.trim() : ''
    let recipientEmail = rawEmail
    if (!recipientEmail) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } })
      recipientEmail = user?.email ?? ''
    }
    if (!recipientEmail) {
      throw new BadRequestException('No recipient email — provide one or ensure the user has an email.')
    }

    const label =
      typeof dto.label === 'string' && dto.label.trim() ? dto.label.trim().slice(0, 200) : null
    const enabled = dto.enabled === undefined ? true : !!dto.enabled

    let cadence: string | null = null
    let metricKey: string | null = null
    let operator: string | null = null
    let threshold: number | null = null

    if (type === 'digest') {
      cadence = (CADENCES as readonly string[]).includes(dto.cadence ?? '')
        ? (dto.cadence as Cadence)
        : 'weekly'
    } else {
      metricKey = typeof dto.metricKey === 'string' ? dto.metricKey.trim() : ''
      if (!metricKey || !ALERT_METRIC_KEYS.has(metricKey)) {
        throw new BadRequestException('A threshold alert needs a valid metricKey.')
      }
      operator = dto.operator === 'lt' || dto.operator === 'gt' ? dto.operator : ''
      if (!operator) throw new BadRequestException('A threshold alert needs an operator (lt or gt).')
      if (typeof dto.threshold !== 'number' || !Number.isFinite(dto.threshold)) {
        throw new BadRequestException('A threshold alert needs a numeric threshold.')
      }
      threshold = dto.threshold
    }

    const row = await this.prisma.alert.create({
      data: {
        schoolId,
        createdByUserId: userId,
        type,
        cadence,
        metricKey,
        operator,
        threshold,
        recipientEmail,
        enabled,
        label,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'alert.created',
      targetType: 'alerts',
      targetId: row.id,
      metadata: { type, metricKey, cadence },
    })
    return this.toPublic(row)
  }

  async update(
    schoolId: string,
    alertId: string,
    dto: UpdateAlertDto,
    userId: string,
  ): Promise<AlertPublic> {
    const existing = await this.prisma.alert.findFirst({ where: { id: alertId, schoolId } })
    if (!existing) throw new NotFoundException('Alert not found.')

    const data: Record<string, unknown> = {}
    if (dto.cadence !== undefined) {
      data.cadence = (CADENCES as readonly string[]).includes(dto.cadence) ? dto.cadence : 'weekly'
    }
    if (dto.metricKey !== undefined) {
      const k = typeof dto.metricKey === 'string' ? dto.metricKey.trim() : ''
      if (!ALERT_METRIC_KEYS.has(k)) throw new BadRequestException('Unknown metricKey.')
      data.metricKey = k
    }
    if (dto.operator !== undefined) {
      if (dto.operator !== 'lt' && dto.operator !== 'gt') {
        throw new BadRequestException('operator must be lt or gt.')
      }
      data.operator = dto.operator
    }
    if (dto.threshold !== undefined) {
      if (typeof dto.threshold !== 'number' || !Number.isFinite(dto.threshold)) {
        throw new BadRequestException('threshold must be a number.')
      }
      data.threshold = dto.threshold
    }
    if (dto.recipientEmail !== undefined && typeof dto.recipientEmail === 'string') {
      data.recipientEmail = dto.recipientEmail.trim()
    }
    if (dto.label !== undefined) {
      data.label =
        typeof dto.label === 'string' && dto.label.trim() ? dto.label.trim().slice(0, 200) : null
    }
    if (dto.enabled !== undefined) {
      data.enabled = !!dto.enabled
      // Re-arm the edge trigger when an alert is re-enabled, so a stale lastBreached
      // from before it was disabled doesn't suppress the next real crossing.
      if (dto.enabled) data.lastBreached = false
    }

    const row = await this.prisma.alert.update({ where: { id: existing.id }, data })
    await this.audit.write({
      schoolId,
      userId,
      action: 'alert.updated',
      targetType: 'alerts',
      targetId: row.id,
    })
    return this.toPublic(row)
  }

  async remove(schoolId: string, alertId: string, userId: string): Promise<{ id: string }> {
    const existing = await this.prisma.alert.findFirst({ where: { id: alertId, schoolId } })
    if (!existing) throw new NotFoundException('Alert not found.')
    await this.prisma.alert.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'alert.deleted',
      targetType: 'alerts',
      targetId: existing.id,
    })
    return { id: existing.id }
  }

  /**
   * Run ONE alert immediately, bypassing the due/edge gating — used by the test-send
   * endpoint. Tenant-checked. A test never mutates the scheduler's edge/cadence state
   * (lastBreached/lastSentAt), so it can't accidentally arm or disarm a real alert.
   */
  async evaluateNow(
    schoolId: string,
    alertId: string,
    actor: User,
  ): Promise<{ sent: boolean; detail: string }> {
    const alert = await this.prisma.alert.findFirst({ where: { id: alertId, schoolId } })
    if (!alert) throw new NotFoundException('Alert not found.')
    return this.evaluateOne(alert, { force: true, actorId: actor.id })
  }

  /** The scheduler sweep. Loads enabled alerts and evaluates each with due/edge gating. */
  private async runDue(): Promise<void> {
    try {
      const alerts = await this.prisma.alert.findMany({ where: { enabled: true } })
      for (const a of alerts) {
        try {
          await this.evaluateOne(a, { force: false })
        } catch (e) {
          this.logger.warn(
            `alert ${a.id} evaluation failed: ${e instanceof Error ? e.message : String(e)}`,
          )
        }
      }
    } catch (e) {
      this.logger.warn(`runDue failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /**
   * Evaluate a single alert. `force` (test path) bypasses due/edge gating and does
   * NOT mutate scheduler state; the normal path edge-triggers thresholds and
   * cadence-gates digests. Returns whether an email was sent + a human detail line.
   */
  private async evaluateOne(
    alert: Alert,
    opts: { force: boolean; actorId?: string },
  ): Promise<{ sent: boolean; detail: string }> {
    const school = await this.prisma.school.findUnique({ where: { id: alert.schoolId } })
    if (!school) return { sent: false, detail: 'School not found.' }

    // Resolve the current snapshot period (computeMetricsResponse/insightFor throw
    // NotFound without one). Skip with NO email when there is nothing to report.
    let periodId: string | null = null
    let periodLabel: string | null = null
    try {
      const periods = await this.periods.listPeriods(alert.schoolId)
      const current = periods.find((p) => p.hasSnapshot)
      if (current) {
        periodId = current.id
        periodLabel = current.label ?? null
      }
    } catch {
      /* no periods */
    }
    if (!periodId) return { sent: false, detail: 'No period with a snapshot yet.' }

    const webOrigin = this.config.get<string>('webOrigin') ?? 'http://localhost:5173'
    const link = `${webOrigin}/analytics?period=${periodId}`

    if (alert.type === 'threshold') {
      return this.evaluateThreshold(alert, school.name, periodId, periodLabel, link, opts)
    }
    return this.evaluateDigest(alert, school.name, periodId, periodLabel, link, opts)
  }

  private async evaluateThreshold(
    alert: Alert,
    schoolName: string,
    periodId: string,
    periodLabel: string | null,
    link: string,
    opts: { force: boolean; actorId?: string },
  ): Promise<{ sent: boolean; detail: string }> {
    if (!alert.metricKey || !alert.operator || alert.threshold == null) {
      return { sent: false, detail: 'Alert is misconfigured (missing metric/operator/threshold).' }
    }
    let metrics
    try {
      ;({ metrics } = await this.analytics.computeMetricsResponse(alert.schoolId, periodId))
    } catch {
      return { sent: false, detail: 'No metrics available for this period.' }
    }
    const m = metrics.find((x) => x.key === alert.metricKey)
    const available = !!m && m.available && m.value != null
    const value = available ? (m!.value as number) : null
    const breached =
      available && value != null && (alert.operator === 'lt' ? value < alert.threshold : value > alert.threshold)

    // EDGE-TRIGGER: on the normal path, send only on a FRESH crossing and always
    // persist the new lastValue/lastBreached so the arm/re-arm cycle works. A test
    // (force) sends whenever the metric is readable and mutates NO state.
    const shouldSend = opts.force ? !!available : breached && !alert.lastBreached

    if (!opts.force) {
      await this.prisma.alert.update({
        where: { id: alert.id },
        data: {
          lastValue: value,
          lastBreached: breached,
          ...(shouldSend ? { lastSentAt: new Date() } : {}),
        },
      })
    }

    if (!shouldSend) {
      if (!available) return { sent: false, detail: 'The metric is not available for this period.' }
      if (breached) return { sent: false, detail: 'Already alerted for this breach (still breached).' }
      return { sent: false, detail: 'Within range — no alert.' }
    }

    const label = m?.label ?? alert.metricKey
    const unit = resolveDisplayUnit(alert.metricKey as never, (m?.unit ?? 'ratio') as never)
    const valueStr = value != null ? formatMetricValueLong(value, unit) : 'n/a'
    const thresholdStr = formatMetricValueLong(alert.threshold, unit)
    const subject = `${schoolName} — alert: ${label} ${opWord(alert.operator)} ${thresholdStr}`
    const statusLine = breached
      ? `This CROSSED your threshold (${opWord(alert.operator)} ${thresholdStr}).`
      : `Current status: within range (your alert fires when ${opWord(alert.operator)} ${thresholdStr}).`
    const text =
      `${schoolName}${periodLabel ? ` · ${periodLabel}` : ''}\n\n` +
      `${label} is now ${valueStr}.\n${statusLine}\n\n` +
      `View the analytics: ${link}\n`

    await this.mailer.sendAlert(alert.recipientEmail, subject, text)
    await this.audit.write({
      schoolId: alert.schoolId,
      userId: opts.actorId ?? alert.createdByUserId ?? null,
      action: 'alert.fired',
      targetType: 'alerts',
      targetId: alert.id,
      metadata: { type: 'threshold', metricKey: alert.metricKey, value, test: opts.force },
    })
    return {
      sent: true,
      detail: `Sent to ${alert.recipientEmail}: ${label} is ${valueStr}.`,
    }
  }

  private async evaluateDigest(
    alert: Alert,
    schoolName: string,
    periodId: string,
    periodLabel: string | null,
    link: string,
    opts: { force: boolean; actorId?: string },
  ): Promise<{ sent: boolean; detail: string }> {
    const cadence: Cadence = (CADENCES as readonly string[]).includes(alert.cadence ?? '')
      ? (alert.cadence as Cadence)
      : 'weekly'
    if (!opts.force) {
      const due = !alert.lastSentAt || Date.now() - alert.lastSentAt.getTime() >= DUE_MS[cadence]
      if (!due) return { sent: false, detail: `Not due yet (${cadence}).` }
    }

    let body = 'A new financial summary is available for this period.'
    try {
      const insight = await this.insight.insightFor(alert.schoolId, periodId)
      body = insight.text
    } catch {
      /* keep the fallback body */
    }

    const subject = `${schoolName} — ${cadence} financial summary${periodLabel ? ` (${periodLabel})` : ''}`
    const text =
      `${schoolName}${periodLabel ? ` · ${periodLabel}` : ''}\n\n${body}\n\n` +
      `View the analytics: ${link}\n`

    await this.mailer.sendAlert(alert.recipientEmail, subject, text)
    if (!opts.force) {
      await this.prisma.alert.update({ where: { id: alert.id }, data: { lastSentAt: new Date() } })
    }
    await this.audit.write({
      schoolId: alert.schoolId,
      userId: opts.actorId ?? alert.createdByUserId ?? null,
      action: 'alert.fired',
      targetType: 'alerts',
      targetId: alert.id,
      metadata: { type: 'digest', cadence, test: opts.force },
    })
    return { sent: true, detail: `Sent the ${cadence} digest to ${alert.recipientEmail}.` }
  }
}

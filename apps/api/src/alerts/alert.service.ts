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
import { BillingService } from '../billing/billing.service.js'
import { shouldNotify, notifySendData } from '../twin/notify-policy.js'
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
    // AIC Phase E — the accreditation gate for `warning_digest`, FAIL-CLOSED.
    // Appended LAST-optional so every existing positional-arg alert spec still
    // constructs; an absent BillingService means the licence cannot be proven,
    // and an unproven licence sends nothing. AlertModule already imports
    // BillingModule, so production always has it.
    private readonly billing?: BillingService,
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
    const type =
      dto.type === 'threshold'
        ? 'threshold'
        : dto.type === 'digest'
          ? 'digest'
          : dto.type === 'warning_digest'
            ? 'warning_digest'
            : ''
    if (!type) {
      throw new BadRequestException(
        'Alert type must be "digest", "threshold" or "warning_digest".',
      )
    }

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

    if (type === 'digest' || type === 'warning_digest') {
      cadence = (CADENCES as readonly string[]).includes(dto.cadence ?? '')
        ? (dto.cadence as Cadence)
        : 'weekly'
      // AIC Phase E — a warning digest watches THE FINDINGS LEDGER, not a metric.
      // Accepting a metricKey here would create an alert whose configuration
      // promises something it will never evaluate, which is worse than a 400.
      if (type === 'warning_digest' && (dto.metricKey || dto.operator || dto.threshold != null)) {
        throw new BadRequestException(
          'A warning digest watches your accreditation findings, not a metric — remove metricKey/operator/threshold.',
        )
      }
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

    // AIC Phase E — same rule on the patch path: a warning digest has no metric.
    if (
      existing.type === 'warning_digest' &&
      (dto.metricKey !== undefined || dto.operator !== undefined || dto.threshold !== undefined)
    ) {
      throw new BadRequestException(
        'A warning digest watches your accreditation findings, not a metric — remove metricKey/operator/threshold.',
      )
    }

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
    // AIC Phase E — one more branch on the SAME line, on the SAME scheduler, with
    // the SAME mailer method and the SAME audit action. There is no second
    // notification path in this product and this phase did not add one.
    //
    // IT IS DISPATCHED ABOVE THE FINANCE-PERIOD GATE, and deliberately. The two
    // metric types genuinely need a snapshot period — they report a metric AT one
    // and deep-link to it. The warning digest needs neither: it takes no
    // `periodId`, composes its own `/accreditation` link, and reads the findings
    // ledger. Below the gate, a school that has licensed accreditation, adopted a
    // framework, uploaded evidence and accumulated open findings but has not yet
    // uploaded a trial balance would silently never receive a digest — with a
    // detail line about periods that has nothing to do with accreditation.
    if (alert.type === 'warning_digest') {
      return this.evaluateWarningDigest(alert, school.name, opts)
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

  /**
   * AIC Phase E — the ACCREDITATION EARLY-WARNING digest.
   *
   * FOUR THINGS IT WILL NOT DO, each of which is the reason a line exists:
   *
   *   1. IT WILL NOT EMAIL A SCHOOL THAT HAS NOT LICENSED ACCREDITATION. The gate
   *      is fail-closed: a billing hiccup sends nothing rather than leaking the
   *      shape of a module the school has not bought.
   *
   *   2. IT WILL NOT SEND "NOTHING TO REPORT". A digest that arrives when there is
   *      nothing new trains people to ignore digests, and then the one that
   *      matters is ignored too. Zero candidates -> no email.
   *
   *   3. IT WILL NOT COMPOSE A SENTENCE ABOUT A NUMBER. Every line of the body is
   *      the pure engine's stored `title` / `rationale` / `consequence`, copied
   *      verbatim — server-composed and numerically validated where the numbers
   *      were checked.
   *
   *   4. IT WILL NOT RE-SEND. `shouldNotify` is the SINGLE definition (imported
   *      from the twin, shared with its own spec), and every send writes the three
   *      watermarks that close the clause that opened it. A de-escalation opens no
   *      clause at all.
   *
   * `force` (the test path) sends whenever there is anything to send and mutates
   * NO state — exactly like the other two types.
   */
  private async evaluateWarningDigest(
    alert: Alert,
    schoolName: string,
    opts: { force: boolean; actorId?: string },
  ): Promise<{ sent: boolean; detail: string }> {
    const licensed = await (this.billing?.isEntitledForModule(alert.schoolId, 'accreditation') ??
      Promise.resolve(false)
    ).catch(() => false)
    if (!licensed) {
      return { sent: false, detail: 'Accreditation is not licensed for this school.' }
    }

    const cadence: Cadence = (CADENCES as readonly string[]).includes(alert.cadence ?? '')
      ? (alert.cadence as Cadence)
      : 'weekly'
    if (!opts.force) {
      const due = !alert.lastSentAt || Date.now() - alert.lastSentAt.getTime() >= DUE_MS[cadence]
      if (!due) return { sent: false, detail: `Not due yet (${cadence}).` }
    }

    const now = new Date()
    const rows = await this.prisma.accreditationFinding
      .findMany({
        where: {
          schoolId: alert.schoolId,
          clearedAt: null,
          status: { notIn: ['resolved', 'dismissed'] },
          severity: { in: ['critical', 'warn'] },
        },
        orderBy: [{ severity: 'asc' }, { lastSeenAt: 'desc' }],
        take: 50,
      })
      .catch(() => [])

    // THE single predicate. Filtered in JS rather than in SQL because "exactly
    // once" is a comparison BETWEEN columns, and one function that both the
    // service and its spec call is worth more than a clever WHERE clause.
    const candidates = rows.filter((f) => shouldNotify(f, now))
    if (candidates.length === 0) {
      return { sent: false, detail: 'No new early warnings since the last digest.' }
    }

    const shown = candidates.slice(0, 10)
    const lines = shown.map((f) => {
      const payload = (f.evidencePayload ?? {}) as Record<string, unknown>
      const title = typeof payload.title === 'string' ? payload.title : f.ruleId
      const rationale = typeof payload.rationale === 'string' ? payload.rationale : ''
      const consequence = typeof payload.consequence === 'string' ? payload.consequence : ''
      const codes = f.standardTags.length > 0 ? ` [${f.standardTags.join(', ')}]` : ''
      return `• ${title}${codes}\n  ${rationale}\n  ${consequence}`.trimEnd()
    })
    const more =
      candidates.length > shown.length
        ? `\n…and ${candidates.length - shown.length} more in the Accreditation center.`
        : ''

    const n = candidates.length
    const subject = `${schoolName} — ${n} accreditation early warning${n === 1 ? '' : 's'}`
    const webOrigin = this.config.get<string>('webOrigin') ?? 'http://localhost:5173'
    const text =
      `${schoolName}\n\n` +
      `${lines.join('\n\n')}${more}\n\n` +
      `Open the Accreditation center: ${webOrigin}/accreditation\n`

    await this.mailer.sendAlert(alert.recipientEmail, subject, text)

    if (!opts.force) {
      await this.prisma.alert.update({ where: { id: alert.id }, data: { lastSentAt: now } })
      // Group by the watermark PAIR so one updateMany covers every finding that
      // shares it. Bounded at ten rows, so at most a handful of statements.
      const groups = new Map<string, string[]>()
      for (const f of shown) groups.set(`${f.reopenCount}|${f.severity}`, [
        ...(groups.get(`${f.reopenCount}|${f.severity}`) ?? []),
        f.id,
      ])
      for (const [key, ids] of groups) {
        const [reopenCount, severity] = key.split('|')
        await this.prisma.accreditationFinding.updateMany({
          // TENANCY rides on the WRITE, not only on the read that produced the ids.
          where: { schoolId: alert.schoolId, id: { in: ids } },
          data: notifySendData({ severity, reopenCount: Number(reopenCount) }, now),
        })
      }
    }

    await this.audit.write({
      schoolId: alert.schoolId,
      userId: opts.actorId ?? alert.createdByUserId ?? null,
      // The EXISTING action name, so the alert history renders with no UI change.
      action: 'alert.fired',
      targetType: 'alerts',
      targetId: alert.id,
      metadata: { type: 'warning_digest', cadence, findingCount: n, test: opts.force },
    })
    return {
      sent: true,
      detail: `Sent ${n} early warning${n === 1 ? '' : 's'} to ${alert.recipientEmail}.`,
    }
  }
}

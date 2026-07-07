import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { QboConnection } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { MailerService } from '../auth/mailer.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { QboService, type ScheduledSyncOutcome } from './qbo.service.js'

// ── Tuning constants ─────────────────────────────────────────────────────────
const CHECK_INTERVAL_MS = 30 * 60 * 1000 // house-standard 30-min sweep
const FRESH_WINDOW_MS = 20 * 3600 * 1000 // "already fresh / just acted" floor → skip
const STALE_CATCHUP_MS = 28 * 3600 * 1000 // scheduler hasn't acted this long → run ANY hour (self-heal)
const KEEPALIVE_MS = 80 * 24 * 3600 * 1000 // no real sync in 80d → force a token-refreshing run (rescue)
const INTER_CONN_DELAY_MS = 750 // gentle spacing between connections (Intuit load / token refresh)
const MAX_PER_SWEEP = 8 // cap actual syncs per 30-min tick; the band smears a big tenant
const MAX_DAILY_FAILURES = 3 // consecutive transient failures before deferring to tomorrow

/** Result of a single scheduled attempt, surfaced to the run-now endpoint. */
export interface RunOneResult {
  status: ScheduledSyncOutcome['status'] | 'skipped'
  rowCount?: number
  error?: string
  lastRunAt: string | null
}

/** Map the classified outcome status to the persisted last_scheduled_sync_status. */
function persistedStatus(status: ScheduledSyncOutcome['status']): string {
  return status === 'reauth' ? 'reauth_required' : status
}

/** Parse a 'startHour-endHour' window (server-local, inclusive). Falls back to 2–5. */
function parseWindow(raw: string | undefined): { start: number; end: number } {
  const m = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec((raw ?? '').trim())
  if (!m) return { start: 2, end: 5 }
  const start = Number(m[1])
  const end = Number(m[2])
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 23 || start > end) {
    return { start: 2, end: 5 }
  }
  return { start, end }
}

/**
 * PURE due-rule (no DB) so it is unit-testable in isolation. A connection is due
 * when it isn't in transient backoff, isn't already fresh (thrash guard, keyed on
 * the MOST RECENT activity — a manual sync OR any prior scheduler action), AND is
 * either inside the overnight window, or the scheduler hasn't acted in ≥28h
 * (self-heal a missed night), or no real sync has happened in ≥80d (token rescue —
 * fires any hour so token liveness never depends on the window being right).
 */
export function qboSyncDue(p: {
  now: number
  serverHour: number
  window: { start: number; end: number }
  /** Newest `qbo.synced` audit row time (a real token-refreshing sync). */
  lastSyncedAtMs: number | null
  /** `last_scheduled_sync_at` (any prior scheduler action, incl. not_entitled/error). */
  lastScheduledSyncAtMs: number | null
  autoSyncFailures: number
}): boolean {
  // Transient-failure backoff is DAY-SCOPED: MAX_DAILY_FAILURES consecutive fails
  // defer the school for the rest of that calendar day, but a NEW day lifts the gate
  // so a bad Intuit night self-heals without any user action (the "3/day" self-heal).
  // Keyed on lastScheduledSyncAt's local day — failures only accrue after an action
  // stamps it, so a null (never-acted) row never trips the gate.
  if (
    p.autoSyncFailures >= MAX_DAILY_FAILURES &&
    p.lastScheduledSyncAtMs != null &&
    new Date(p.lastScheduledSyncAtMs).toDateString() === new Date(p.now).toDateString()
  ) {
    return false
  }
  const syncedAge = p.lastSyncedAtMs == null ? Infinity : p.now - p.lastSyncedAtMs
  const actedAge = p.lastScheduledSyncAtMs == null ? Infinity : p.now - p.lastScheduledSyncAtMs
  // Thrash guard: skip if EITHER a real sync or a scheduler action happened recently.
  const activityAge = Math.min(syncedAge, actedAge)
  if (activityAge < FRESH_WINDOW_MS) return false
  const inWindow = p.serverHour >= p.window.start && p.serverHour <= p.window.end
  const staleCatchup = actedAge >= STALE_CATCHUP_MS
  const keepalive = syncedAge >= KEEPALIVE_MS
  return inWindow || staleCatchup || keepalive
}

/**
 * Automated / scheduled QuickBooks sync. Clones the house scheduler pattern
 * (ReportScheduleService / AlertService): a dependency-free setInterval started in
 * onModuleInit (30-min sweep) + a jittered startup kick, cleared in onModuleDestroy.
 * `runDue()` NEVER throws to the timer, and each connection is wrapped so one
 * failure never aborts the sweep. The sync logic itself is NOT reimplemented here —
 * this is a thin driver that calls QboService.runScheduledSync (which classifies
 * every outcome) and persists the result onto the connection row. ONLY sweeps the
 * per-school QboConnection this slice; OrgQboConnection is forward-compat only.
 *
 * One-directional dep (scheduler → QboService); plain constructor injection, no
 * ModuleRef / forwardRef — QboService does not depend on the scheduler.
 */
@Injectable()
export class QboSyncSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QboSyncSchedulerService.name)
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly qbo: QboService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.runDue(), CHECK_INTERVAL_MS)
    // Jittered startup kick so a just-booted (or many replicas of a) container don't
    // all sweep at the same instant; window-gating keeps a midday boot to no-op work.
    const jitter = 90_000 + Math.floor(Math.random() * 30_000)
    setTimeout(() => void this.runDue(), jitter)
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /** The newest `qbo.synced` audit row time for a school (the same freshness status() derives). */
  private async lastSyncedAt(schoolId: string): Promise<Date | null> {
    const row = await this.prisma.auditLog.findFirst({
      where: { schoolId, action: 'qbo.synced' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    return row?.createdAt ?? null
  }

  /** Evaluate the due-rule for a loaded connection (queries its sync freshness). */
  private async isConnDue(conn: QboConnection): Promise<boolean> {
    const synced = await this.lastSyncedAt(conn.schoolId)
    return qboSyncDue({
      now: Date.now(),
      serverHour: new Date().getHours(),
      window: parseWindow(this.config.get<string>('quickbooks.autoSyncWindow')),
      lastSyncedAtMs: synced ? synced.getTime() : null,
      lastScheduledSyncAtMs: conn.lastScheduledSyncAt ? conn.lastScheduledSyncAt.getTime() : null,
      autoSyncFailures: conn.autoSyncFailures,
    })
  }

  /**
   * The sweep. Loads enabled, not-dead connections (fair, non-starving order),
   * runs up to MAX_PER_SWEEP that are DUE, sequentially with gentle spacing. Never
   * throws; each connection is isolated so one failure never aborts the rest.
   */
  private async runDue(): Promise<void> {
    try {
      if (this.config.get<boolean>('quickbooks.autoSyncEnabled') === false) return // global kill-switch
      const candidates = await this.prisma.qboConnection.findMany({
        where: { autoSyncEnabled: true, needsReauth: false },
        orderBy: { lastScheduledSyncAt: { sort: 'asc', nulls: 'first' } },
      })
      let ran = 0
      for (const conn of candidates) {
        if (ran >= MAX_PER_SWEEP) break
        if (!(await this.isConnDue(conn))) continue
        ran++
        try {
          await this.runOne(conn, { force: false })
        } catch (e) {
          this.logger.warn(
            `auto-sync ${conn.schoolId} failed: ${e instanceof Error ? e.message : String(e)}`,
          )
        }
        await this.sleep(INTER_CONN_DELAY_MS)
      }
    } catch (e) {
      this.logger.warn(`runDue failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /**
   * Run ONE connection: (re-check due unless forced), call the classified
   * QboService.runScheduledSync, persist the outcome onto the connection row, and
   * on a fresh dead-token episode send exactly ONE reconnect email. `force` (the
   * run-now endpoint) bypasses freshness/window but still honours dead-token /
   * entitlement handling. Returns the outcome for the endpoint.
   */
  /**
   * The run-now hook (POST /auto-sync/run): load THIS school's connection and force
   * a run past the freshness/window gate (dead-token/entitlement still honoured).
   * 404-safe: returns an error result when the school has no connection.
   */
  async runNow(schoolId: string): Promise<RunOneResult> {
    const conn = await this.prisma.qboConnection.findUnique({ where: { schoolId } })
    if (!conn) {
      return { status: 'error', error: 'QuickBooks is not connected for this school.', lastRunAt: null }
    }
    return this.runOne(conn, { force: true })
  }

  async runOne(conn: QboConnection, opts: { force: boolean }): Promise<RunOneResult> {
    if (!opts.force && !(await this.isConnDue(conn))) {
      return {
        status: 'skipped',
        lastRunAt: conn.lastScheduledSyncAt ? conn.lastScheduledSyncAt.toISOString() : null,
      }
    }

    const outcome = await this.qbo.runScheduledSync(conn.schoolId)
    const now = new Date()
    const data: Record<string, unknown> = {
      lastScheduledSyncAt: now,
      lastScheduledSyncStatus: persistedStatus(outcome.status),
      lastScheduledSyncRowCount: outcome.rowCount ?? null,
      lastScheduledSyncError: outcome.error ?? null,
    }

    if (outcome.status === 'synced' || outcome.status === 'no_data' || outcome.status === 'not_entitled') {
      // A run that reached Intuit (token refreshed) — clear the transient backoff.
      data.autoSyncFailures = 0
    } else if (outcome.status === 'reauth') {
      // Dead token: stop the thrash (needsReauth removes it from the next sweep) and
      // send ONE reconnect email per episode (guarded by reauthNotifiedAt).
      data.needsReauth = true
      if (!conn.reauthNotifiedAt) {
        await this.notifyReauth(conn)
        data.reauthNotifiedAt = now
      }
    } else if (outcome.status === 'error') {
      // Transient: 30-min retry is natural backoff; defer after MAX_DAILY_FAILURES.
      data.autoSyncFailures = { increment: 1 }
    }
    // no_actor → just recorded; nothing to reset or notify.

    await this.prisma.qboConnection.update({ where: { schoolId: conn.schoolId }, data })

    // Distinguish scheduled from manual in the log; the underlying qbo.synced row is
    // still written by the sync path, so sync-history keeps working.
    await this.audit.write({
      schoolId: conn.schoolId,
      action: 'qbo.auto_sync.ran',
      targetType: 'qbo_connections',
      metadata: {
        status: persistedStatus(outcome.status),
        rowCount: outcome.rowCount ?? null,
        forced: opts.force,
      },
    })

    return {
      status: outcome.status,
      rowCount: outcome.rowCount,
      error: outcome.error,
      lastRunAt: now.toISOString(),
    }
  }

  /** Recipients for the reconnect email: the connector, else active owners. */
  private async reconnectRecipients(conn: QboConnection): Promise<string[]> {
    if (conn.connectedByUserId) {
      const u = await this.prisma.user.findUnique({
        where: { id: conn.connectedByUserId },
        select: { email: true },
      })
      if (u?.email) return [u.email]
    }
    const owners = await this.prisma.membership.findMany({
      where: { schoolId: conn.schoolId, role: 'owner', status: 'active' },
      include: { user: { select: { email: true } } },
    })
    return owners.map((m) => m.user.email).filter((e): e is string => !!e)
  }

  /** Send the ONE reconnect notice + audit the dead-token episode. Best-effort. */
  private async notifyReauth(conn: QboConnection): Promise<void> {
    const school = await this.prisma.school.findUnique({
      where: { id: conn.schoolId },
      select: { name: true },
    })
    const name = school?.name ?? 'your school'
    const webOrigin = this.config.get<string>('webOrigin') ?? 'http://localhost:5173'
    const link = `${webOrigin}/settings`
    const subject = `Reconnect QuickBooks for ${name}`
    const text =
      `QuickBooks automatic sync for ${name} has paused because the connection needs to be ` +
      `re-authorized (its access expired or was revoked).\n\n` +
      `Reconnect QuickBooks to resume nightly syncing:\n${link}\n`
    const recipients = await this.reconnectRecipients(conn)
    for (const to of recipients) {
      try {
        await this.mailer.sendAlert(to, subject, text)
      } catch (e) {
        this.logger.warn(
          `reconnect email to ${to} failed: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
    await this.audit.write({
      schoolId: conn.schoolId,
      userId: conn.connectedByUserId ?? null,
      action: 'qbo.auto_sync.reauth_required',
      targetType: 'qbo_connections',
      metadata: { notified: recipients.length },
    })
  }
}

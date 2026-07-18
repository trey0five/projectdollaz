import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// RetentionService — a nightly housekeeping purge of EXPIRED, non-business
// artifacts. It deliberately NEVER touches financial records (imports, snapshots)
// — those are retained per the reproducibility contract; erasure of real tenant
// data goes through the explicit delete-school / delete-org / delete-account
// endpoints, not a TTL.
//
// Purges: expired/old-revoked refresh tokens, expired unaccepted invitations,
// and expired reset/verification tokens (nulled). Optionally trims audit_log
// older than AUDIT_RETENTION_DAYS (0 = keep forever, the default).
//
// NOTE: runs per-instance. Under horizontal scaling it may run on >1 replica; the
// deletes are idempotent so double-runs are harmless (no leader election needed).
// ─────────────────────────────────────────────────────────────────────────────
const REVOKED_GRACE_MS = 1000 * 60 * 60 * 24 * 7 // keep revoked tokens 7 days for forensics

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purge(): Promise<void> {
    const now = new Date()
    try {
      const refreshTokens = await this.prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { revokedAt: { lt: new Date(now.getTime() - REVOKED_GRACE_MS) } },
          ],
        },
      })

      const invitations = await this.prisma.invitation.deleteMany({
        where: { expiresAt: { lt: now }, acceptedAt: null },
      })

      const resetCodes = await this.prisma.user.updateMany({
        where: { passwordResetExpiresAt: { lt: now }, passwordResetCode: { not: null } },
        data: { passwordResetCode: null, passwordResetExpiresAt: null },
      })

      const verifyTokens = await this.prisma.user.updateMany({
        where: {
          emailVerificationExpiresAt: { lt: now },
          emailVerificationToken: { not: null },
        },
        data: { emailVerificationToken: null, emailVerificationExpiresAt: null },
      })

      // Optional audit-log retention (0 = keep forever).
      const auditDays = this.config.get<number>('retention.auditDays') ?? 0
      let auditDeleted = 0
      if (auditDays > 0) {
        const cutoff = new Date(now.getTime() - auditDays * 24 * 60 * 60 * 1000)
        const res = await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
        auditDeleted = res.count
      }

      this.logger.log(
        `retention purge: refreshTokens=${refreshTokens.count} invitations=${invitations.count} ` +
          `resetCodes=${resetCodes.count} verifyTokens=${verifyTokens.count} auditRows=${auditDeleted}`,
      )
    } catch (err) {
      // Never crash the scheduler; the next run retries.
      this.logger.warn(`retention purge failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

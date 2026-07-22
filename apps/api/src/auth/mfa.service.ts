import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { randomBytes, randomInt } from 'node:crypto'
import type { User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { sha256hex, hashesEqual } from '../common/hash.js'
import { decryptSecret, encryptSecret, loadKeyFromEnv } from '../common/secret-crypto.js'
import { base32Encode, buildOtpauthUri, verifyTotp } from './totp.js'
import { PasswordService } from './password.service.js'
import { TokenService } from './token.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { toUserPublic, type UserPublic } from './user-public.js'
import { LOCK_MS, MAX_FAILED, RESET_ALPHABET } from './auth.service.js'
import type { MfaLoginDto } from './dto/mfa-login.dto.js'
import type { MfaSetupDto } from './dto/mfa-setup.dto.js'
import type { MfaEnableDto } from './dto/mfa-enable.dto.js'
import type { MfaDisableDto } from './dto/mfa-disable.dto.js'
import type { MfaRegenerateBackupCodesDto } from './dto/mfa-regenerate-backup-codes.dto.js'

const MFA_KEY_ENV = 'MFA_TOTP_KEY'
const PENDING_TTL_MS = 1000 * 60 * 15 // 15m to scan the QR + confirm a code
const BACKUP_CODE_COUNT = 10
const BACKUP_CODE_LENGTH = 10
const CHALLENGE_ATTEMPT_CAP = 5
// Expired/consumed challenge rows are deleted once they're > 24h old.
const SWEEP_MAX_AGE_MS = 1000 * 60 * 60 * 24
const SWEEP_INTERVAL_MS = 1000 * 60 * 60 * 24

// The two failure CLASSES of /auth/login/mfa — one message per class, never per
// method, so responses don't reveal whether a TOTP or a backup code was tried,
// nor why the challenge died.
const CHALLENGE_401 = 'Invalid or expired sign-in session. Sign in again.'
const CODE_401 = 'Invalid code.'
// Byte-identical to login's 423 body.
const LOCKED_MESSAGE = 'Account temporarily locked due to failed attempts. Try again later.'

/** AAD binds each encrypted TOTP seed to its owner — rows can't be moved between users. */
const aadFor = (userId: string) => `mfa-totp:${userId}`

export interface MfaStatus {
  mfa_enabled: boolean
  backup_codes_remaining: number
  enrolled_at: string | null
}

/**
 * TOTP MFA: enrollment (setup/enable), second-factor login (verifyChallenge),
 * disable/regenerate, status — plus the daily sweep of dead challenge rows.
 *
 * Security invariants (see the build spec; do not weaken):
 *   • FAIL-CLOSED key handling: no MFA_TOTP_KEY (32-byte base64) → setup 503s;
 *     secrets are never stored or read in plaintext.
 *   • Every single-use / replay guard is an updateMany COMPARE-AND-SET with
 *     `count === 0 ⇒ reject`: challenge consume, per-challenge attempt cap,
 *     TOTP step-claim, backup-code spend. Concurrent double-use of any of them
 *     yields exactly one success.
 *   • MFA code failures share login's failedLoginAttempts pool (6 ⇒ 30-min
 *     lock); challenge-class failures do NOT touch that pool.
 *   • Audit metadata never contains secrets or codes.
 */
@Injectable()
export class MfaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MfaService.name)
  private sweepTimer: NodeJS.Timeout | null = null
  private firstSweep: NodeJS.Timeout | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  // ── Challenge sweep (same self-interval pattern as ReportScheduleService) ──

  onModuleInit(): void {
    this.sweepTimer = setInterval(() => void this.sweepChallenges(), SWEEP_INTERVAL_MS)
    // Delayed first sweep so a just-booted container catches up.
    this.firstSweep = setTimeout(() => void this.sweepChallenges(), 90_000)
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer)
    if (this.firstSweep) clearTimeout(this.firstSweep)
  }

  /** Delete challenge rows older than 24h (expired 5m TTL long ago, or consumed). */
  async sweepChallenges(): Promise<void> {
    try {
      const { count } = await this.prisma.mfaChallenge.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - SWEEP_MAX_AGE_MS) } },
      })
      if (count > 0) this.logger.log(`Swept ${count} stale MFA challenge row(s).`)
    } catch (err) {
      this.logger.warn(`MFA challenge sweep failed: ${String(err)}`)
    }
  }

  // ── Login second step ──────────────────────────────────────────────────────

  /**
   * POST /auth/login/mfa — exchange a valid challenge + correct code for the
   * normal login token pair. Exactly two failure classes (see CHALLENGE_401 /
   * CODE_401); flow order is normative from the spec.
   */
  async verifyChallenge(
    dto: MfaLoginDto,
  ): Promise<{ access_token: string; refresh_token: string; user: UserPublic }> {
    // 1. JWT signature + expiry + type + jti (throws CHALLENGE_401).
    const { sub, jti } = this.tokens.verifyMfaChallenge(dto.mfa_token)

    // 2. Challenge row: must exist, be unconsumed, unexpired, and the PRESENTED
    //    token must hash-match the row (a re-signed token with a reused jti dies here).
    const challenge = await this.prisma.mfaChallenge.findUnique({ where: { jti } })
    if (
      !challenge ||
      challenge.userId !== sub ||
      challenge.consumedAt ||
      !hashesEqual(sha256hex(dto.mfa_token), challenge.tokenHash) ||
      challenge.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException(CHALLENGE_401)
    }

    const user = await this.prisma.user.findUnique({ where: { id: sub } })
    if (!user || !user.totpEnabled) {
      throw new UnauthorizedException(CHALLENGE_401)
    }

    // 3. Lockout gate — byte-identical to login's 423. Deliberately NOT audited
    //    per-request (same amplification rationale as login).
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new HttpException(LOCKED_MESSAGE, HttpStatus.LOCKED)
    }

    // 4. ATOMIC attempts bump: only an unconsumed challenge with < 5 attempts
    //    proceeds. count===0 ⇒ consume the row (best-effort) + challenge-class
    //    401 — the cap can never be raced past, and the shared login counter is
    //    NOT bumped beyond the cap.
    const bumped = await this.prisma.mfaChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, attempts: { lt: CHALLENGE_ATTEMPT_CAP } },
      data: { attempts: { increment: 1 } },
    })
    if (bumped.count === 0) {
      await this.prisma.mfaChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: new Date() },
      })
      throw new UnauthorizedException(CHALLENGE_401)
    }

    // 5. Classify by shape (DTO guarantees \d{6} or [A-Z2-9]{10}) and verify.
    const method: 'totp' | 'backup_code' = /^\d{6}$/.test(dto.code) ? 'totp' : 'backup_code'
    let ok = false
    let remaining: number | null = null

    if (method === 'totp') {
      const key = this.requireKey()
      if (user.totpSecretEnc) {
        const secret = decryptSecret(user.totpSecretEnc, key, aadFor(user.id))
        const res = verifyTotp(secret, dto.code)
        if (res.ok && res.step !== null) {
          // ATOMIC step-claim: the accepted step becomes the replay floor. A
          // replay (same step) or a concurrent double-verify loser sees
          // count===0 and fails code-class.
          const claimed = await this.prisma.user.updateMany({
            where: {
              id: user.id,
              OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: BigInt(res.step) } }],
            },
            data: { totpLastUsedStep: BigInt(res.step) },
          })
          ok = claimed.count === 1
        }
      }
    } else {
      ok = await this.spendBackupCode(user.id, dto.code)
      if (ok) {
        remaining = await this.prisma.mfaBackupCode.count({
          where: { userId: user.id, usedAt: null },
        })
      }
    }

    // 6. Code-class failure: login's EXACT lockout block (shared 6/30m pool),
    //    on a FRESH attempts read — several failures reuse one challenge and
    //    the in-memory `user` row would be stale.
    if (!ok) {
      const fresh = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { failedLoginAttempts: true },
      })
      const attempts = (fresh?.failedLoginAttempts ?? 0) + 1
      const lock = attempts >= MAX_FAILED ? new Date(Date.now() + LOCK_MS) : null
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: lock ? 0 : attempts, lockedUntil: lock },
      })
      await this.audit.write({
        userId: user.id,
        action: lock ? 'auth.login.locked' : 'auth.login.mfa_failed',
        targetType: 'user',
        targetId: user.id,
        // Transition-only `source` marks WHICH factor tripped the lock.
        metadata: lock ? { attempts, source: 'mfa' } : { attempts },
      })
      throw new UnauthorizedException(CODE_401)
    }

    // 7. ATOMIC challenge consume — of two concurrent successes, exactly one
    //    proceeds to tokens; the loser gets challenge-class 401.
    const consumed = await this.prisma.mfaChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    if (consumed.count === 0) {
      throw new UnauthorizedException(CHALLENGE_401)
    }

    // 8. Success: counters reset HERE (not at password stage), then the normal
    //    login tail — issueRefresh + signAccess unchanged.
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    })
    const { token: refresh_token, jti: sid } = await this.tokens.issueRefresh(user.id)
    const access_token = this.tokens.signAccess(user.id, sid)
    await this.audit.write({
      userId: user.id,
      action: 'auth.login.mfa',
      targetType: 'user',
      targetId: user.id,
      metadata: { method },
    })
    if (method === 'backup_code') {
      await this.audit.write({
        userId: user.id,
        action: 'mfa.backup_code.used',
        targetType: 'user',
        targetId: user.id,
        metadata: { remaining },
      })
    }
    return { access_token, refresh_token, user: toUserPublic(user) }
  }

  // ── Enrollment ─────────────────────────────────────────────────────────────

  /**
   * Start enrollment: generate a pending secret (stored encrypted, 15m TTL).
   * Repeat calls overwrite the pending secret; the ACTIVE secret and login flow
   * are untouched until `enable` verifies a code.
   */
  async setup(
    user: User,
    dto: MfaSetupDto,
  ): Promise<{ secret: string; otpauth_uri: string; expires_at: string }> {
    const key = this.requireKey()
    this.verifyPasswordOr401(user, dto.password)
    if (user.totpEnabled) {
      throw new BadRequestException({
        code: 'MFA_ALREADY_ENABLED',
        message: 'Two-factor authentication is already enabled. Disable it first.',
      })
    }
    const secret = base32Encode(randomBytes(20)) // RFC 4226-recommended 160-bit seed
    const expiresAt = new Date(Date.now() + PENDING_TTL_MS)
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpPendingSecretEnc: encryptSecret(secret, key, aadFor(user.id)),
        totpPendingExpiresAt: expiresAt,
      },
    })
    await this.audit.write({
      userId: user.id,
      action: 'mfa.setup.started',
      targetType: 'user',
      targetId: user.id,
    })
    return {
      secret,
      otpauth_uri: buildOtpauthUri(user.email, secret),
      expires_at: expiresAt.toISOString(),
    }
  }

  /**
   * Complete enrollment: a correct code from the pending secret promotes it to
   * active, seeds the replay floor with the matched step (the enrollment code
   * cannot be replayed at first login), issues 10 backup codes (returned in
   * plaintext exactly ONCE), and revokes every other session.
   */
  async enable(
    user: User,
    sid: string | undefined,
    dto: MfaEnableDto,
  ): Promise<{ message: string; backup_codes: string[] }> {
    const key = this.requireKey()
    if (
      user.totpEnabled ||
      !user.totpPendingSecretEnc ||
      !user.totpPendingExpiresAt ||
      user.totpPendingExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException({
        code: 'MFA_SETUP_EXPIRED',
        message: 'Setup expired. Start again.',
      })
    }
    const secret = decryptSecret(user.totpPendingSecretEnc, key, aadFor(user.id))
    const { ok, step } = verifyTotp(secret, dto.code)
    if (!ok || step === null) {
      // Pending secret stays intact — the user can just retry the code.
      throw new BadRequestException('Invalid code.')
    }

    const codes = this.generateBackupCodes()
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          totpEnabled: true,
          totpSecretEnc: user.totpPendingSecretEnc, // promote pending → active
          totpEnrolledAt: new Date(),
          totpPendingSecretEnc: null,
          totpPendingExpiresAt: null,
          totpLastUsedStep: BigInt(step), // enrollment code can't be replayed at first login
        },
      }),
      this.prisma.mfaBackupCode.deleteMany({ where: { userId: user.id } }),
      this.prisma.mfaBackupCode.createMany({
        data: codes.map((c) => ({ userId: user.id, codeHash: sha256hex(c) })), // hashes ONLY
      }),
    ])
    await this.tokens.revokeAllExcept(user.id, sid)
    await this.audit.write({
      userId: user.id,
      action: 'mfa.enabled',
      targetType: 'user',
      targetId: user.id,
    })
    return { message: 'Two-factor authentication enabled.', backup_codes: codes }
  }

  /**
   * Disable MFA. Requires password AND a current code (TOTP or backup) — a
   * stolen access token alone is insufficient. Clears all TOTP state, deletes
   * all backup codes, revokes every other session.
   */
  async disable(
    user: User,
    sid: string | undefined,
    dto: MfaDisableDto,
  ): Promise<{ message: string }> {
    this.requireEnabled(user)
    this.verifyPasswordOr401(user, dto.password)
    await this.verifySecondFactorOr401(user, dto.code)
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          totpEnabled: false,
          totpSecretEnc: null,
          totpPendingSecretEnc: null,
          totpPendingExpiresAt: null,
          totpEnrolledAt: null,
          totpLastUsedStep: null,
        },
      }),
      this.prisma.mfaBackupCode.deleteMany({ where: { userId: user.id } }),
    ])
    await this.tokens.revokeAllExcept(user.id, sid)
    await this.audit.write({
      userId: user.id,
      action: 'mfa.disabled',
      targetType: 'user',
      targetId: user.id,
    })
    return { message: 'Two-factor authentication disabled.' }
  }

  /** Replace ALL backup codes (password + code proof, same as disable). */
  async regenerateBackupCodes(
    user: User,
    dto: MfaRegenerateBackupCodesDto,
  ): Promise<{ message: string; backup_codes: string[] }> {
    this.requireEnabled(user)
    this.verifyPasswordOr401(user, dto.password)
    await this.verifySecondFactorOr401(user, dto.code)
    const codes = this.generateBackupCodes()
    await this.prisma.$transaction([
      this.prisma.mfaBackupCode.deleteMany({ where: { userId: user.id } }),
      this.prisma.mfaBackupCode.createMany({
        data: codes.map((c) => ({ userId: user.id, codeHash: sha256hex(c) })),
      }),
    ])
    await this.audit.write({
      userId: user.id,
      action: 'mfa.backup_codes.regenerated',
      targetType: 'user',
      targetId: user.id,
      metadata: { count: codes.length },
    })
    return {
      message: 'New backup codes generated. Previous codes no longer work.',
      backup_codes: codes,
    }
  }

  /** Counts only — never code material. */
  async status(user: User): Promise<MfaStatus> {
    const remaining = user.totpEnabled
      ? await this.prisma.mfaBackupCode.count({ where: { userId: user.id, usedAt: null } })
      : 0
    return {
      mfa_enabled: user.totpEnabled,
      backup_codes_remaining: remaining,
      enrolled_at: user.totpEnabled && user.totpEnrolledAt ? user.totpEnrolledAt.toISOString() : null,
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** FAIL-CLOSED: no valid MFA_TOTP_KEY → the whole capability is unavailable. */
  private requireKey(): Buffer {
    const key = loadKeyFromEnv(MFA_KEY_ENV)
    if (!key) {
      throw new ServiceUnavailableException({
        code: 'MFA_NOT_CONFIGURED',
        message: 'Two-factor authentication is not available.',
      })
    }
    return key
  }

  private requireEnabled(user: User): void {
    if (!user.totpEnabled) {
      throw new BadRequestException({
        code: 'MFA_NOT_ENABLED',
        message: 'Two-factor authentication is not enabled.',
      })
    }
  }

  private verifyPasswordOr401(user: User, password: string): void {
    const ok = this.passwords.verify(
      password,
      user.passwordAlgo,
      user.passwordIters,
      user.passwordSalt,
      user.passwordHash,
    )
    if (!ok) throw new UnauthorizedException('Current password is incorrect.')
  }

  /**
   * Second-factor proof for the AUTHED management routes (disable/regenerate):
   * same verification semantics as login — TOTP with atomic step-claim, or a
   * backup code spent atomically — one 401 message for every failure mode.
   */
  private async verifySecondFactorOr401(user: User, code: string): Promise<void> {
    let ok = false
    if (/^\d{6}$/.test(code)) {
      const key = this.requireKey()
      if (user.totpSecretEnc) {
        const secret = decryptSecret(user.totpSecretEnc, key, aadFor(user.id))
        const res = verifyTotp(secret, code)
        if (res.ok && res.step !== null) {
          const claimed = await this.prisma.user.updateMany({
            where: {
              id: user.id,
              OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: BigInt(res.step) } }],
            },
            data: { totpLastUsedStep: BigInt(res.step) },
          })
          ok = claimed.count === 1
        }
      }
    } else {
      ok = await this.spendBackupCode(user.id, code)
    }
    if (!ok) throw new UnauthorizedException(CODE_401)
  }

  /**
   * Constant-workload backup-code spend: hash the presented code once, compare
   * against EVERY unused row (no early exit — response time never reveals how
   * close a guess was), one dummy compare when there are zero rows, then an
   * ATOMIC single-use consume of the match.
   */
  private async spendBackupCode(userId: string, code: string): Promise<boolean> {
    const rows = await this.prisma.mfaBackupCode.findMany({
      where: { userId, usedAt: null },
      select: { id: true, codeHash: true },
    })
    const presentedHash = sha256hex(code)
    let matchId: string | null = null
    for (const row of rows) {
      // Deliberately NOT `if (match) break` — every row is always compared.
      if (hashesEqual(presentedHash, row.codeHash) && matchId === null) matchId = row.id
    }
    if (rows.length === 0) {
      // Timing parity: an account with no unused codes still does one compare.
      hashesEqual(presentedHash, sha256hex('mfa-backup-dummy'))
    }
    if (!matchId) return false
    const consumed = await this.prisma.mfaBackupCode.updateMany({
      where: { id: matchId, usedAt: null },
      data: { usedAt: new Date() },
    })
    return consumed.count === 1
  }

  /**
   * 10 codes × 10 chars from RESET_ALPHABET (31 unambiguous symbols, no
   * 0/1/I/L/O — disjoint from the 6-digit TOTP shape), each char via the
   * UNBIASED CSPRNG randomInt. ~7.8e14 per-code space. All-unique enforced.
   */
  generateBackupCodes(): string[] {
    const out = new Set<string>()
    while (out.size < BACKUP_CODE_COUNT) {
      let code = ''
      for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
        code += RESET_ALPHABET[randomInt(0, RESET_ALPHABET.length)]
      }
      out.add(code)
    }
    return [...out]
  }
}

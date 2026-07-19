import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomBytes, randomInt } from 'node:crypto'
import type { User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { sha256hex, hashesEqual } from '../common/hash.js'
import { PasswordService } from './password.service.js'
import { TokenService } from './token.service.js'
import { MailerService } from './mailer.service.js'
import { toUserPublic, type UserPublic } from './user-public.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { RegisterDto } from './dto/register.dto.js'
import type { LoginDto } from './dto/login.dto.js'
import type { ResetPasswordDto } from './dto/reset-password.dto.js'
import type { UpdateProfileDto } from './dto/update-profile.dto.js'
import type { ChangePasswordDto } from './dto/change-password.dto.js'

const MAX_FAILED = 6
const LOCK_MS = 1000 * 60 * 30 // 30 minutes
const VERIFY_TTL_MS = 1000 * 60 * 60 * 24 // 24h
const RESET_TTL_MS = 1000 * 60 * 15 // 15m

@Injectable()
export class AuthService {
  private readonly isProd: boolean
  private readonly requireEmailVerification: boolean

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.isProd = (config.get<string>('nodeEnv') ?? 'development') === 'production'
    this.requireEmailVerification =
      config.get<boolean>('auth.requireEmailVerification') ?? true
  }

  async register(dto: RegisterDto): Promise<{ message: string; user: UserPublic }> {
    const strengthError = this.passwords.validateStrength(dto.password)
    if (strengthError) throw new BadRequestException(strengthError)

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (existing) {
      throw new BadRequestException('An account with this email already exists.')
    }

    const { algo, iters, salt, hash } = this.passwords.hash(dto.password)
    const token = randomBytes(32).toString('hex')
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        firstName: dto.first_name,
        lastName: dto.last_name,
        passwordAlgo: algo,
        passwordIters: iters,
        passwordSalt: salt,
        passwordHash: hash,
        // When verification is disabled (email delivery unavailable), the account
        // is created already-verified so login isn't blocked; no token is stored.
        emailVerified: !this.requireEmailVerification,
        emailVerificationToken: this.requireEmailVerification ? sha256hex(token) : null, // store hash; email the plaintext
        emailVerificationExpiresAt: this.requireEmailVerification
          ? new Date(Date.now() + VERIFY_TTL_MS)
          : null,
      },
    })
    if (this.requireEmailVerification) {
      await this.mailer.sendVerificationEmail(user.email, token)
    }

    return {
      message: this.requireEmailVerification
        ? 'Account created. Check your email to verify your address.'
        : 'Account created. You can sign in now.',
      user: toUserPublic(user),
    }
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    // Look up by the token HASH (tokens are stored hashed at rest).
    const tokenHash = sha256hex(token)
    const user = await this.prisma.user.findFirst({
      where: { emailVerificationToken: tokenHash },
    })
    if (
      !user ||
      !user.emailVerificationToken ||
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt.getTime() < Date.now() ||
      !hashesEqual(tokenHash, user.emailVerificationToken)
    ) {
      throw new BadRequestException('Invalid or expired verification token.')
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      },
    })
    return { message: 'Email verified. You can now log in.' }
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const generic = { message: 'If that account exists and is unverified, a new link was sent.' }
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (user && !user.emailVerified) {
      const token = randomBytes(32).toString('hex')
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: sha256hex(token), // store hash; email the plaintext
          emailVerificationExpiresAt: new Date(Date.now() + VERIFY_TTL_MS),
        },
      })
      await this.mailer.sendVerificationEmail(user.email, token)
    }
    return generic
  }

  async login(
    dto: LoginDto,
  ): Promise<{ access_token: string; refresh_token: string; user: UserPublic }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!user) {
      // Equalize timing, then fail.
      this.passwords.dummyVerify(dto.password)
      throw new UnauthorizedException('Invalid email or password.')
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      // NOTE: deliberately NOT audited per-request — the `auth.login.locked`
      // event is written once at the lock transition below. Auditing every
      // request during the 30-min lock window would let an attacker amplify
      // unbounded AuditLog writes just by replaying a known email.
      throw new HttpException(
        'Account temporarily locked due to failed attempts. Try again later.',
        HttpStatus.LOCKED,
      )
    }

    const ok = this.passwords.verify(
      dto.password,
      user.passwordAlgo,
      user.passwordIters,
      user.passwordSalt,
      user.passwordHash,
    )

    // Unverified accounts never reveal whether the password was correct: we
    // return the SAME EMAIL_NOT_VERIFIED response on any login attempt for an
    // unverified user (after running the real verify above for timing parity).
    // This removes the password-confirmation oracle the reviewer flagged while
    // still requiring verification before issuing tokens.
    if (this.requireEmailVerification && !user.emailVerified) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before logging in.',
      })
    }

    if (!ok) {
      const attempts = user.failedLoginAttempts + 1
      const lock = attempts >= MAX_FAILED ? new Date(Date.now() + LOCK_MS) : null
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: lock ? 0 : attempts,
          lockedUntil: lock,
        },
      })
      await this.audit.write({
        userId: user.id,
        action: lock ? 'auth.login.locked' : 'auth.login.failed',
        targetType: 'user',
        targetId: user.id,
        metadata: { attempts },
      })
      throw new UnauthorizedException('Invalid email or password.')
    }

    if (user.failedLoginAttempts !== 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      })
    }

    const { token: refresh_token, jti } = await this.tokens.issueRefresh(user.id)
    const access_token = this.tokens.signAccess(user.id, jti)
    await this.audit.write({
      userId: user.id,
      action: 'auth.login',
      targetType: 'user',
      targetId: user.id,
    })
    return { access_token, refresh_token, user: toUserPublic(user) }
  }

  async refresh(token: string): Promise<{ access_token: string; refresh_token: string }> {
    const { access, refresh } = await this.tokens.rotateRefresh(token)
    return { access_token: access, refresh_token: refresh }
  }

  /**
   * Data-subject erasure: a user permanently deletes their OWN account. Password-
   * confirmed. Blocked if they are the sole active owner of any school (would
   * orphan it — delete/transfer those first). Deleting the User cascades their
   * memberships + refresh tokens; any surviving access token is rejected at the
   * next request (JwtAuthGuard loads the now-missing user). The deletion record
   * carries only the opaque user id (no PII).
   */
  async deleteAccount(user: User, password: string): Promise<{ deleted: true }> {
    // Re-auth with the password when one is set. A password-less account (no
    // password to verify) relies on the already-authenticated session as proof —
    // otherwise erasure would be impossible for such an account.
    if (user.passwordHash) {
      const ok = this.passwords.verify(
        password,
        user.passwordAlgo,
        user.passwordIters,
        user.passwordSalt,
        user.passwordHash,
      )
      if (!ok) throw new UnauthorizedException('Current password is incorrect.')
    }

    try {
      // SERIALIZABLE so the last-owner check + delete are atomic: two co-owners
      // deleting concurrently can't both pass and orphan the school — one aborts.
      await this.prisma.$transaction(
        async (tx) => {
          const ownerMemberships = await tx.membership.findMany({
            where: { userId: user.id, role: 'owner', status: 'active' },
            select: { schoolId: true },
          })
          for (const m of ownerMemberships) {
            const owners = await tx.membership.count({
              where: { schoolId: m.schoolId, role: 'owner', status: 'active' },
            })
            if (owners <= 1) {
              throw new BadRequestException(
                'You are the only owner of one or more schools. Delete those schools or add another owner before deleting your account.',
              )
            }
          }
          // Complete erasure: scrub the user's email from the two FK-less tables
          // (SetNull can't reach them) — pending invites to them + alert recipients.
          await tx.invitation.deleteMany({ where: { email: user.email } })
          await tx.alert.deleteMany({ where: { recipientEmail: user.email } })
          // Cascades memberships + refresh tokens; SetNulls authored rows.
          await tx.user.delete({ where: { id: user.id } })
          await tx.auditLog.create({
            data: { action: 'user.deleted', targetType: 'user', targetId: user.id },
          })
        },
        { isolationLevel: 'Serializable' },
      )
    } catch (e) {
      if (e instanceof BadRequestException) throw e
      if ((e as { code?: string }).code === 'P2034') {
        // Serialization conflict (a concurrent co-owner deletion) — safe to retry.
        throw new ConflictException('Please try again.')
      }
      throw e
    }
    return { deleted: true }
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.tokens.revokeAll(userId)
    await this.audit.write({
      userId,
      action: 'auth.logout',
      targetType: 'user',
      targetId: userId,
    })
    return { message: 'Logged out.' }
  }

  async me(user: User): Promise<{ user: UserPublic; memberships: unknown[] }> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, status: 'active' },
      include: { school: true },
    })
    return {
      user: toUserPublic(user),
      memberships: memberships.map((m) => ({
        school_id: m.schoolId,
        school_name: m.school.name,
        role: m.role,
      })),
    }
  }

  /** Self-service profile update (first/last name). Email stays read-only. */
  async updateProfile(user: User, dto: UpdateProfileDto): Promise<{ user: UserPublic }> {
    if (dto.first_name === undefined && dto.last_name === undefined) {
      throw new BadRequestException('No fields to update.')
    }
    const data: { firstName?: string; lastName?: string } = {}
    if (dto.first_name !== undefined) data.firstName = dto.first_name
    if (dto.last_name !== undefined) data.lastName = dto.last_name

    const updated = await this.prisma.user.update({ where: { id: user.id }, data })
    await this.audit.write({
      userId: user.id,
      action: 'profile.updated',
      targetType: 'user',
      targetId: user.id,
      metadata: { fields: Object.keys(data) },
    })
    return { user: toUserPublic(updated) }
  }

  /**
   * Change the caller's password: verify current (constant-time), enforce
   * strength on the new one, rehash, and revoke every OTHER refresh session
   * (keep the current one alive via `sid`). Never logs or returns secrets.
   */
  async changePassword(
    user: User,
    sid: string | undefined,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const ok = this.passwords.verify(
      dto.current_password,
      user.passwordAlgo,
      user.passwordIters,
      user.passwordSalt,
      user.passwordHash,
    )
    if (!ok) {
      throw new UnauthorizedException('Current password is incorrect.')
    }

    const strengthError = this.passwords.validateStrength(dto.new_password)
    if (strengthError) throw new BadRequestException(strengthError)

    const { algo, iters, salt, hash } = this.passwords.hash(dto.new_password)
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordAlgo: algo,
        passwordIters: iters,
        passwordSalt: salt,
        passwordHash: hash,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    })
    // Invalidate other sessions; keep the current one (falls back to revokeAll
    // when sid is absent on legacy access tokens).
    await this.tokens.revokeAllExcept(user.id, sid)
    await this.audit.write({
      userId: user.id,
      action: 'password.changed',
      targetType: 'user',
      targetId: user.id,
    })
    return { message: 'Password changed.' }
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const generic = { message: 'If that account exists, a reset code was sent.' }
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (user) {
      // High-entropy CSPRNG code (~8.5e11 space) — safe against brute force even
      // if the per-IP throttle is evaded. Stored hashed at rest; emailed in clear.
      const code = generateResetCode()
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetCode: sha256hex(code),
          passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      })
      await this.mailer.sendPasswordResetEmail(user.email, code)
    }
    return generic
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const strengthError = this.passwords.validateStrength(dto.new_password)
    if (strengthError) throw new BadRequestException(strengthError)

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (
      !user ||
      !user.passwordResetCode ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Invalid or expired reset code.')
    }
    if (!hashesEqual(sha256hex(dto.reset_code), user.passwordResetCode)) {
      throw new BadRequestException('Invalid or expired reset code.')
    }

    const { algo, iters, salt, hash } = this.passwords.hash(dto.new_password)
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordAlgo: algo,
        passwordIters: iters,
        passwordSalt: salt,
        passwordHash: hash,
        passwordResetCode: null,
        passwordResetExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    })
    await this.tokens.revokeAll(user.id)
    return { message: 'Password reset. You can now log in.' }
  }
}

// Readable, high-entropy reset code. 8 chars from a 31-symbol unambiguous alphabet
// (no I/L/O/0/1) ≈ 8.5e11 — copy-pasteable from email, infeasible to brute force.
// Each char drawn with an UNBIASED CSPRNG (randomInt), never modulo-reduced bytes.
const RESET_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function generateResetCode(): string {
  let out = ''
  for (let i = 0; i < 8; i++) out += RESET_ALPHABET[randomInt(0, RESET_ALPHABET.length)]
  return out
}

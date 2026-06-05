import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { PasswordService } from './password.service.js'
import { TokenService } from './token.service.js'
import { MailerService } from './mailer.service.js'
import { toUserPublic, type UserPublic } from './user-public.js'
import type { RegisterDto } from './dto/register.dto.js'
import type { LoginDto } from './dto/login.dto.js'
import type { ResetPasswordDto } from './dto/reset-password.dto.js'

const MAX_FAILED = 6
const LOCK_MS = 1000 * 60 * 30 // 30 minutes
const VERIFY_TTL_MS = 1000 * 60 * 60 * 24 // 24h
const RESET_TTL_MS = 1000 * 60 * 15 // 15m

@Injectable()
export class AuthService {
  private readonly isProd: boolean

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly mailer: MailerService,
    config: ConfigService,
  ) {
    this.isProd = (config.get<string>('nodeEnv') ?? 'development') === 'production'
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
        emailVerified: false,
        emailVerificationToken: token,
        emailVerificationExpiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      },
    })
    await this.mailer.sendVerificationEmail(user.email, token)

    return {
      message: 'Account created. Check your email to verify your address.',
      user: toUserPublic(user),
    }
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({
      where: { emailVerificationToken: token },
    })
    if (
      !user ||
      !user.emailVerificationToken ||
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Invalid or expired verification token.')
    }
    // Constant-time compare on the matched row.
    const a = Buffer.from(token)
    const b = Buffer.from(user.emailVerificationToken)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
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
          emailVerificationToken: token,
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
    if (!user.emailVerified) {
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
    return { access_token, refresh_token, user: toUserPublic(user) }
  }

  async refresh(token: string): Promise<{ access_token: string; refresh_token: string }> {
    const { access, refresh } = await this.tokens.rotateRefresh(token)
    return { access_token: access, refresh_token: refresh }
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.tokens.revokeAll(userId)
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

  async forgotPassword(email: string): Promise<{ message: string }> {
    const generic = { message: 'If that account exists, a reset code was sent.' }
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (user) {
      const code = String(Math.floor(100000 + Math.random() * 900000))
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetCode: code,
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
    const a = Buffer.from(dto.reset_code)
    const b = Buffer.from(user.passwordResetCode)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
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

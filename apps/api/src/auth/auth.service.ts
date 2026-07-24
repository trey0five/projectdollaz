import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
  type OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomBytes, randomInt } from 'node:crypto'
import { createRequire } from 'node:module'
import type { User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { sha256hex, hashesEqual } from '../common/hash.js'
import { PasswordService } from './password.service.js'
import { TokenService } from './token.service.js'
import { MailerService } from './mailer.service.js'
import { toUserPublic, type UserPublic } from './user-public.js'
import { AuditService } from '../common/audit/audit.service.js'
import { computeIsEffectiveAdmin, computeIsSuperadmin } from '../common/admin-access.js'
import type { RegisterDto } from './dto/register.dto.js'
import type { LoginDto } from './dto/login.dto.js'
import type { ResetPasswordDto } from './dto/reset-password.dto.js'
import type { UpdateProfileDto } from './dto/update-profile.dto.js'
import type { ChangePasswordDto } from './dto/change-password.dto.js'

// Exported: MfaService's code-failure path replays login's EXACT lockout block —
// password failures and MFA-code failures share one 6-strikes/30-min pool.
export const MAX_FAILED = 6
export const LOCK_MS = 1000 * 60 * 30 // 30 minutes
const MFA_CHALLENGE_TTL_MS = 1000 * 60 * 5 // 5m — matches TokenService's '300s' JWT TTL
const VERIFY_TTL_MS = 1000 * 60 * 60 * 24 // 24h
const RESET_TTL_MS = 1000 * 60 * 15 // 15m

// ── Offline geolocation (geoip-lite) ──────────────────────────────────────────
// geoip-lite is CJS and bundles offline MaxMind GeoLite2 data (no network / key).
// Load via createRequire to sidestep ESM default-interop quirks under NodeNext. A
// load failure leaves capture a no-op — login is NEVER affected.
interface GeoLookup {
  country?: string
  region?: string
  city?: string
  ll?: [number, number]
}
interface GeoipLite {
  lookup(ip: string): GeoLookup | null
}
let geoip: GeoipLite | null = null
try {
  geoip = createRequire(import.meta.url)('geoip-lite') as GeoipLite
} catch {
  geoip = null
}

/** Non-routable / loopback / unspecified IPs geoip can never resolve. */
function isPrivateIp(ip: string): boolean {
  const raw = ip.trim().toLowerCase()
  if (!raw) return true
  // Strip an IPv4-mapped-IPv6 prefix (::ffff:10.0.0.1) down to the v4 tail.
  const addr = raw.startsWith('::ffff:') ? raw.slice('::ffff:'.length) : raw
  if (addr === '::1' || addr === '::' || addr === '0.0.0.0') return true
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true // fc00::/7 ULA
  if (addr.startsWith('fe80')) return true // link-local
  const m = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  if (a === 10) return true // 10.0.0.0/8
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local
  return false
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name)
  private readonly isProd: boolean
  private readonly requireEmailVerification: boolean
  private readonly adminEmails: string[]
  private readonly superadminUsername: string | null
  private readonly superadminPassword: string | null

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
    this.adminEmails = config.get<string[]>('admin.emails') ?? []
    this.superadminUsername = config.get<string | null>('admin.superadminUsername') ?? null
    this.superadminPassword = config.get<string | null>('admin.superadminPassword') ?? null
  }

  // Boot-time: provision the bootstrap super-admin from env (idempotent). Runs in
  // dev and prod alike; does nothing if the username/password aren't configured or
  // the account already exists (never overwrites a live account).
  async onModuleInit(): Promise<void> {
    try {
      await this.ensureSuperadmin()
    } catch (e) {
      this.logger.warn(`Super-admin bootstrap skipped: ${(e as Error).message}`)
    }
  }

  private async ensureSuperadmin(): Promise<void> {
    const uname = this.superadminUsername
    const pw = this.superadminPassword
    if (!uname || !pw) return
    const existing = await this.prisma.user.findUnique({ where: { email: uname } })
    if (existing) return
    const { algo, iters, salt, hash } = this.passwords.hash(pw)
    await this.prisma.user.create({
      data: {
        email: uname,
        firstName: 'Platform',
        lastName: 'Admin',
        passwordAlgo: algo,
        passwordIters: iters,
        passwordSalt: salt,
        passwordHash: hash,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    })
    this.logger.log(`Bootstrapped super-admin '${uname}'.`)
  }

  // Hidden super-admin login (username-based). Only usernames in the ADMIN_EMAILS
  // allowlist may authenticate here — everyone else gets a generic, timing-equalized
  // 401 so this endpoint can't be used to probe accounts. Reuses login()'s lockout,
  // password verify, token issuance, and best-effort geo capture.
  async adminLogin(
    username: string,
    password: string,
    clientIp?: string,
  ): Promise<{ access_token: string; refresh_token: string; user: UserPublic }> {
    const uname = username.trim().toLowerCase()
    if (!this.adminEmails.includes(uname)) {
      this.passwords.dummyVerify(password)
      throw new UnauthorizedException('Invalid credentials.')
    }
    const result = await this.login({ email: uname, password } as LoginDto, clientIp)
    if ('mfa_required' in result) {
      // The bootstrap super-admin has no MFA; surface a clear error if one is set
      // so the console doesn't silently drop the challenge.
      throw new UnauthorizedException('Multi-factor is not supported on the admin console.')
    }
    return result
  }

  async register(dto: RegisterDto): Promise<{ message: string; user: UserPublic }> {
    const strengthError = this.passwords.validateStrength(dto.password)
    if (strengthError) throw new BadRequestException(strengthError)

    // Reserve the bootstrap super-admin email from the public self-registration
    // path. The super-admin is provisioned ONLY from env (ensureSuperadmin); if
    // SUPERADMIN_USERNAME is set but SUPERADMIN_PASSWORD is not, no account holds
    // that email — without this guard a self-registered user could claim it and
    // inherit super-admin (SuperadminGuard is email-derived). Same generic message
    // as the collision case so the reserved slot isn't disclosed.
    if (computeIsSuperadmin(dto.email, this.superadminUsername)) {
      throw new BadRequestException('An account with this email already exists.')
    }

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
        emailVerifiedAt: new Date(),
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
    clientIp?: string,
  ): Promise<
    | { access_token: string; refresh_token: string; user: UserPublic }
    | { mfa_required: true; mfa_token: string; methods: ['totp', 'backup_code'] }
  > {
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

    if (user.totpEnabled) {
      // MFA branch (password correct, code pending). Deliberately does NOT
      // reset failedLoginAttempts: password failures and MFA-code failures
      // share ONE 6-strikes/30-min pool, so a password-holding attacker can't
      // refill their code-guess budget by re-entering the known password.
      // No tokens and no user object leave the server until the code verifies.
      const jti = randomBytes(24).toString('hex')
      const mfa_token = this.tokens.signMfaChallenge(user.id, jti)
      await this.prisma.mfaChallenge.create({
        data: {
          userId: user.id,
          jti,
          tokenHash: sha256hex(mfa_token), // hash at rest — a DB read never yields a usable token
          expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS),
        },
      })
      await this.audit.write({
        userId: user.id,
        action: 'auth.login.mfa_challenge',
        targetType: 'user',
        targetId: user.id,
      })
      return { mfa_required: true, mfa_token, methods: ['totp', 'backup_code'] }
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
    // Best-effort geolocation capture: fired AFTER tokens are issued, never
    // awaited, never throws — a geoip miss / private IP / DB hiccup can neither
    // block nor slow login.
    void this.captureLoginGeo(user.id, clientIp).catch(() => undefined)
    return { access_token, refresh_token, user: toUserPublic(user) }
  }

  /**
   * Best-effort last-login geolocation. Wrapped end-to-end in try/catch and
   * fire-and-forget by the caller. With no/private IP it records only the login
   * TIME + raw IP (geo stays null — truthful). Otherwise it offline-resolves the
   * IP with geoip-lite and denormalizes the geo onto the User plus appends a
   * UserLoginEvent row. Stores ONLY country/region/city/lat/lon/ip — never any
   * geoip DB internals.
   */
  async captureLoginGeo(userId: string, ip?: string): Promise<void> {
    try {
      if (!ip || isPrivateIp(ip)) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { lastLoginAt: new Date(), lastLoginIp: ip ?? null },
        })
        return
      }
      const geo = geoip ? geoip.lookup(ip) : null
      const lat = geo?.ll?.[0] ?? null
      const lon = geo?.ll?.[1] ?? null
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          lastLoginAt: new Date(),
          lastLoginIp: ip,
          lastLoginCountry: geo?.country ?? null,
          lastLoginRegion: geo?.region ?? null,
          lastLoginCity: geo?.city ?? null,
          lastLoginLat: lat,
          lastLoginLon: lon,
        },
      })
      if (geo) {
        await this.prisma.userLoginEvent.create({
          data: {
            userId,
            ip,
            country: geo.country ?? null,
            region: geo.region ?? null,
            city: geo.city ?? null,
            lat,
            lon,
          },
        })
      }
    } catch {
      // Best-effort only — never surface a geo/DB error to the login path.
    }
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

  async me(
    user: User,
  ): Promise<{
    user: UserPublic
    memberships: unknown[]
    isAdmin: boolean
    isSuperadmin: boolean
  }> {
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
      // Additive top-level fields — computed server-side from the JWT-loaded DB
      // user (never a client field). `isAdmin` is BROADENED to honor the DB flag
      // in addition to the env allowlist + super-admin. Existing .user/.memberships
      // consumers are untouched.
      isAdmin: computeIsEffectiveAdmin(
        { email: user.email, isAdmin: user.isAdmin },
        this.adminEmails,
        this.superadminUsername,
      ),
      isSuperadmin: computeIsSuperadmin(user.email, this.superadminUsername),
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
// Exported: MfaService draws its 10-char backup codes from the SAME alphabet
// (disjoint shape from 6-digit TOTP codes, so /auth/login/mfa can route by shape).
export const RESET_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function generateResetCode(): string {
  let out = ''
  for (let i = 0; i < 8; i++) out += RESET_ALPHABET[randomInt(0, RESET_ALPHABET.length)]
  return out
}

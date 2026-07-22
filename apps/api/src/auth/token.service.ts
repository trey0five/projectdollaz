import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service.js'
import { sha256hex, hashesEqual } from '../common/hash.js'

export interface AccessPayload {
  sub: string
  type: 'access'
  // Session id: the jti of the refresh token this access token was issued
  // alongside. Lets activity-touch target the correct session in multi-session
  // scenarios. Optional for backward compatibility with older tokens.
  sid?: string
}

interface RefreshPayload {
  sub: string
  type: 'refresh'
  jti: string
}

// Short-lived MFA challenge token: proves "password OK, code pending" between
// POST /auth/login and POST /auth/login/mfa. INERT everywhere else: verifyAccess
// rejects type !== 'access' and rotateRefresh rejects type !== 'refresh', so an
// mfa token can never authenticate a request or mint tokens by itself. The jti
// keys a DB-backed mfa_challenges row (single-use + attempt-capped).
interface MfaChallengePayload {
  sub: string
  type: 'mfa'
  jti: string
}

const MFA_CHALLENGE_TTL = '300s' // 5 minutes to enter the code

// Challenge-class 401 — same body (message + structured `code`) as the
// challenge-class failures in MfaService, so the web treats a dead/garbled
// mfa_token identically to a consumed/expired challenge row.
const mfaChallenge401 = () =>
  new UnauthorizedException({
    statusCode: 401,
    message: 'Invalid or expired sign-in session. Sign in again.',
    error: 'Unauthorized',
    code: 'MFA_CHALLENGE_INVALID',
  })

/**
 * Access (~15m) + refresh (~30d) JWTs. Refresh tokens are persisted in the
 * refresh_tokens table and ROTATED on use (old revoked, new issued), with an
 * inactivity window (ported from smartbot) and revoke-all on logout/reset.
 */
@Injectable()
export class TokenService {
  private readonly accessTtl: string
  private readonly refreshTtl: string
  // Inactivity timeout: a refresh token unused for this long is rejected.
  private readonly inactivityMs = 1000 * 60 * 60 * 24 * 7 // 7 days

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.accessTtl = config.get<string>('jwt.accessTtl') ?? '900s'
    this.refreshTtl = config.get<string>('jwt.refreshTtl') ?? '30d'
  }

  signAccess(userId: string, sid?: string): string {
    const payload: AccessPayload = { sub: userId, type: 'access', ...(sid ? { sid } : {}) }
    // `expiresIn` accepts a vercel/ms string (e.g. '900s', '30d') at runtime;
    // the jsonwebtoken types model it as a narrow `StringValue`, so cast.
    return this.jwt.sign(payload, { expiresIn: this.accessTtl as unknown as number })
  }

  verifyAccess(token: string): AccessPayload {
    let payload: AccessPayload
    try {
      payload = this.jwt.verify<AccessPayload>(token)
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.')
    }
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Wrong token type.')
    }
    return payload
  }

  /** Sign a 5-minute MFA challenge token (payload `{ sub, type: 'mfa', jti }`). */
  signMfaChallenge(userId: string, jti: string): string {
    const payload: MfaChallengePayload = { sub: userId, type: 'mfa', jti }
    return this.jwt.sign(payload, { expiresIn: MFA_CHALLENGE_TTL as unknown as number })
  }

  /** Verify an MFA challenge token. Throws on bad signature/expiry/wrong type/no jti. */
  verifyMfaChallenge(token: string): { sub: string; jti: string } {
    let payload: MfaChallengePayload
    try {
      payload = this.jwt.verify<MfaChallengePayload>(token)
    } catch {
      throw mfaChallenge401()
    }
    if (payload.type !== 'mfa' || !payload.jti || !payload.sub) {
      throw mfaChallenge401()
    }
    return { sub: payload.sub, jti: payload.jti }
  }

  /** Issue a fresh refresh token row + signed JWT. Returns the token and its jti. */
  async issueRefresh(userId: string): Promise<{ token: string; jti: string }> {
    const jti = randomBytes(24).toString('hex')
    const payload: RefreshPayload = { sub: userId, type: 'refresh', jti }
    const token = this.jwt.sign(payload, {
      expiresIn: this.refreshTtl as unknown as number,
    })
    const expiresAt = this.decodeExpiry(token)
    // Store only a HASH of the token — a DB read never yields a usable refresh
    // token. Lookups on rotate are by `jti` (from the verified JWT), then the
    // presented token's hash is compared against this.
    await this.prisma.refreshToken.create({
      data: { userId, token: sha256hex(token), jti, expiresAt, lastActivityAt: new Date() },
    })
    return { token, jti }
  }

  /**
   * Validate + ROTATE a refresh token. Returns a new {access, refresh} pair.
   * Rejects if: bad JWT, wrong type, DB row missing/revoked/expired, or the
   * token has been inactive beyond the inactivity window.
   */
  async rotateRefresh(token: string): Promise<{ access: string; refresh: string }> {
    let payload: RefreshPayload
    try {
      payload = this.jwt.verify<RefreshPayload>(token)
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.')
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Wrong token type.')
    }
    // Guard a legacy/malformed token with no jti → a clean 401, not a
    // findUnique({jti: undefined}) 500.
    if (!payload.jti) {
      throw new UnauthorizedException('Invalid or expired refresh token.')
    }

    // Look up by jti (unique, from the verified payload), then constant-time
    // compare the presented token's hash against the stored hash.
    const row = await this.prisma.refreshToken.findUnique({ where: { jti: payload.jti } })
    if (!row || row.revokedAt || !hashesEqual(sha256hex(token), row.token)) {
      throw new UnauthorizedException('Refresh token revoked.')
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired.')
    }
    const last = row.lastActivityAt?.getTime() ?? row.createdAt.getTime()
    if (Date.now() - last > this.inactivityMs) {
      throw new UnauthorizedException('Session expired due to inactivity.')
    }

    // Rotate: revoke the old row, issue a new one.
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    })
    const { token: refresh, jti } = await this.issueRefresh(payload.sub)
    const access = this.signAccess(payload.sub, jti)
    return { access, refresh }
  }

  /**
   * Bump last activity. If the access token carried a session id (`sid` = the
   * paired refresh token's jti), touch THAT specific session's row; otherwise
   * fall back to the user's most-recent active refresh token (legacy tokens).
   */
  async touchActivity(userId: string, sid?: string): Promise<void> {
    if (sid) {
      const updated = await this.prisma.refreshToken.updateMany({
        where: { userId, jti: sid, revokedAt: null },
        data: { lastActivityAt: new Date() },
      })
      if (updated.count > 0) return
    }
    const row = await this.prisma.refreshToken.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    if (row) {
      await this.prisma.refreshToken.update({
        where: { id: row.id },
        data: { lastActivityAt: new Date() },
      })
    }
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  /**
   * Revoke all of a user's active refresh tokens EXCEPT the one identified by
   * `keepJti` (the caller's current session). Used after a password change so
   * other sessions are invalidated while the current one survives. If `keepJti`
   * is undefined (legacy token without `sid`), falls back to revoking ALL.
   */
  async revokeAllExcept(userId: string, keepJti?: string): Promise<void> {
    if (!keepJti) {
      await this.revokeAll(userId)
      return
    }
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, jti: { not: keepJti } },
      data: { revokedAt: new Date() },
    })
  }

  private decodeExpiry(token: string): Date {
    const decoded = this.jwt.decode(token) as { exp?: number } | null
    if (decoded?.exp) return new Date(decoded.exp * 1000)
    // Fallback: 30 days out.
    return new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
  }
}

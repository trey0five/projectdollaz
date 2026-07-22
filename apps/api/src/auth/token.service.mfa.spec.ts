import { describe, expect, it } from 'vitest'
import { JwtService } from '@nestjs/jwt'
import { TokenService } from './token.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// TokenService — the MFA challenge token and its TYPE FIREWALL, with a REAL
// JwtService (actual sign/verify) and prisma stubbed (never reached: every
// rejection here happens before any DB call).
//   • signMfaChallenge → verifyMfaChallenge round-trip carries { sub, jti }
//   • an 'mfa' token is INERT elsewhere: verifyAccess rejects it (so
//     JwtAuthGuard rejects it on any authed route) and rotateRefresh rejects it
//     (so /auth/refresh can't mint tokens from it) — zero guard changes needed
//   • access/refresh tokens are equally inert at verifyMfaChallenge
// ─────────────────────────────────────────────────────────────────────────────

function makeService() {
  const jwt = new JwtService({ secret: 'spec-secret-0123456789abcdef0123456789abcdef' })
  const prisma = {} // never reached in these tests
  const config = { get: () => undefined }
  return new TokenService(jwt, prisma as never, config as never)
}

describe('TokenService — MFA challenge token', () => {
  it('round-trips { sub, jti } through sign + verify', () => {
    const svc = makeService()
    const token = svc.signMfaChallenge('user-1', 'a'.repeat(48))
    expect(svc.verifyMfaChallenge(token)).toEqual({ sub: 'user-1', jti: 'a'.repeat(48) })
  })

  it('verifyMfaChallenge rejects garbage and wrong-type tokens', () => {
    const svc = makeService()
    expect(() => svc.verifyMfaChallenge('garbage')).toThrow(
      'Invalid or expired sign-in session. Sign in again.',
    )
    // An ACCESS token is not an MFA challenge.
    const access = svc.signAccess('user-1', 'sid-1')
    expect(() => svc.verifyMfaChallenge(access)).toThrow(
      'Invalid or expired sign-in session. Sign in again.',
    )
  })

  it("TYPE FIREWALL: an 'mfa' token is rejected by verifyAccess (JwtAuthGuard path)", () => {
    const svc = makeService()
    const mfaToken = svc.signMfaChallenge('user-1', 'b'.repeat(48))
    expect(() => svc.verifyAccess(mfaToken)).toThrow('Wrong token type.')
  })

  it("TYPE FIREWALL: an 'mfa' token is rejected by rotateRefresh (/auth/refresh path)", async () => {
    const svc = makeService()
    const mfaToken = svc.signMfaChallenge('user-1', 'c'.repeat(48))
    await expect(svc.rotateRefresh(mfaToken)).rejects.toThrow('Wrong token type.')
  })

  it('expiry is ~300s', () => {
    const svc = makeService()
    const token = svc.signMfaChallenge('user-1', 'd'.repeat(48))
    const jwt = new JwtService({ secret: 'spec-secret-0123456789abcdef0123456789abcdef' })
    const decoded = jwt.decode(token) as { exp: number; iat: number; type: string }
    expect(decoded.type).toBe('mfa')
    expect(decoded.exp - decoded.iat).toBe(300)
  })
})

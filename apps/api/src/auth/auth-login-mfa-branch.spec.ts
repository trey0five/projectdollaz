import { describe, expect, it, vi } from 'vitest'
import type { User } from '@finrep/db'
import { AuthService } from './auth.service.js'
import { sha256hex } from '../common/hash.js'

// ─────────────────────────────────────────────────────────────────────────────
// AuthService.login() — the ~12-line MFA branch, WITHOUT booting Nest.
// Verifies: an MFA user gets { mfa_required, mfa_token, methods } with NO
// access_token/refresh_token/user keys, counters are NOT reset, the challenge
// row stores sha256hex(token); a non-MFA user's login is shaped as before
// (plus the additive user.mfa_enabled=false).
// ─────────────────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'user@school.org',
    firstName: 'U',
    lastName: 'One',
    passwordAlgo: 'pbkdf2_sha256',
    passwordIters: 1,
    passwordSalt: Buffer.from('s'),
    passwordHash: Buffer.from('h'),
    emailVerified: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    totpEnabled: false,
    totpSecretEnc: null,
    totpPendingSecretEnc: null,
    totpPendingExpiresAt: null,
    totpEnrolledAt: null,
    totpLastUsedStep: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as User
}

function makeService(user: User) {
  const challengeCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'ch1',
    ...data,
  }))
  const userUpdate = vi.fn(async () => user)
  const prisma = {
    user: { findUnique: vi.fn(async () => ({ ...user })), update: userUpdate },
    mfaChallenge: { create: challengeCreate },
  }
  const passwords = {
    verify: vi.fn((password: string) => password === 'correct-pw'),
    dummyVerify: vi.fn(),
  }
  const tokens = {
    signMfaChallenge: vi.fn(() => 'signed-mfa-token'),
    issueRefresh: vi.fn(async () => ({ token: 'rt', jti: 'sid1' })),
    signAccess: vi.fn(() => 'at'),
  }
  const audit = { write: vi.fn(async () => {}) }
  const mailer = {}
  const config = { get: vi.fn(() => false) } // requireEmailVerification=false, nodeEnv dev
  const service = new AuthService(
    prisma as never,
    passwords as never,
    tokens as never,
    mailer as never,
    audit as never,
    config as never,
  )
  return { service, prisma, tokens, audit, challengeCreate, userUpdate }
}

describe('login() MFA branch', () => {
  it('MFA user + correct password → { mfa_required, mfa_token, methods } and NOTHING else', async () => {
    const m = makeService(makeUser({ totpEnabled: true, failedLoginAttempts: 2 }))
    const res = await m.service.login({ email: 'user@school.org', password: 'correct-pw' })
    expect(res).toEqual({
      mfa_required: true,
      mfa_token: 'signed-mfa-token',
      methods: ['totp', 'backup_code'],
    })
    // Explicitly: no tokens, no user object in the body.
    expect(Object.keys(res).sort()).toEqual(['methods', 'mfa_required', 'mfa_token'])
    expect(m.tokens.issueRefresh).not.toHaveBeenCalled()
    expect(m.tokens.signAccess).not.toHaveBeenCalled()
    // Counters NOT reset at the password stage (attempts=2 would otherwise be zeroed).
    expect(m.userUpdate).not.toHaveBeenCalled()
    // Challenge row: hash-at-rest of the signed token, ~5m expiry.
    const row = m.challengeCreate.mock.calls[0][0].data as {
      userId: string
      jti: string
      tokenHash: string
      expiresAt: Date
    }
    expect(row.userId).toBe('u1')
    expect(row.jti).toMatch(/^[0-9a-f]{48}$/)
    expect(row.tokenHash).toBe(sha256hex('signed-mfa-token'))
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 4 * 60 * 1000)
    expect(m.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login.mfa_challenge' }),
    )
  })

  it('MFA user + wrong password → normal 401 path (branch sits after password verify)', async () => {
    const m = makeService(makeUser({ totpEnabled: true }))
    await expect(
      m.service.login({ email: 'user@school.org', password: 'wrong' }),
    ).rejects.toThrow('Invalid email or password.')
    expect(m.challengeCreate).not.toHaveBeenCalled()
  })

  it('non-MFA user: byte-identical login shape as before + additive user.mfa_enabled=false', async () => {
    const m = makeService(makeUser({ totpEnabled: false }))
    const res = await m.service.login({ email: 'user@school.org', password: 'correct-pw' })
    expect(Object.keys(res).sort()).toEqual(['access_token', 'refresh_token', 'user'])
    if (!('user' in res)) throw new Error('unreachable')
    expect(res.access_token).toBe('at')
    expect(res.refresh_token).toBe('rt')
    expect(res.user).toEqual({
      id: 'u1',
      email: 'user@school.org',
      first_name: 'U',
      last_name: 'One',
      email_verified: true,
      mfa_enabled: false,
      created_at: '2026-01-01T00:00:00.000Z',
    })
  })
})

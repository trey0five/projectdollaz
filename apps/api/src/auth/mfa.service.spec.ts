import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { User } from '@finrep/db'
import { MfaService } from './mfa.service.js'
import { encryptSecret } from '../common/secret-crypto.js'
import { sha256hex } from '../common/hash.js'
import { generateTotp, TOTP_STEP_SECONDS } from './totp.js'

// ─────────────────────────────────────────────────────────────────────────────
// MfaService — WITHOUT booting Nest: hand-mocked TokenService/PasswordService/
// AuditService + a stateful in-memory Prisma fake that faithfully implements the
// COMPARE-AND-SET updateMany semantics the service's replay guards rely on.
// Covers: challenge-class vs code-class 401s, TOTP replay (step-claim), backup
// consume-once, shared lockout pool, per-challenge attempt cap, setup/enable/
// disable/regenerate lifecycle, backup-code generation, status.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = Buffer.alloc(32, 9)
const SECRET_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
const CHALLENGE_MSG = 'Invalid or expired sign-in session. Sign in again.'

const nowStep = () => Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS)
const codeNow = () => generateTotp(SECRET_B32, nowStep())

interface ChallengeRow {
  id: string
  userId: string
  jti: string
  tokenHash: string
  attempts: number
  expiresAt: Date
  consumedAt: Date | null
  createdAt: Date
}
interface BackupRow {
  id: string
  userId: string
  codeHash: string
  usedAt: Date | null
}

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
    totpEnabled: true,
    totpSecretEnc: encryptSecret(SECRET_B32, KEY, 'mfa-totp:u1'),
    totpPendingSecretEnc: null,
    totpPendingExpiresAt: null,
    totpEnrolledAt: new Date('2026-07-01T00:00:00Z'),
    totpLastUsedStep: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as User
}

function makeHarness(user: User) {
  const state = {
    user: { ...user } as User & Record<string, unknown>,
    challenges: [] as ChallengeRow[],
    backupCodes: [] as BackupRow[],
  }

  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === state.user.id ? { ...state.user } : null,
      ),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state.user, data)
        return { ...state.user }
      }),
      // The step-claim: id + (totpLastUsedStep null OR < S) → set S.
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; OR?: Array<{ totpLastUsedStep: null | { lt: bigint } }> }
          data: { totpLastUsedStep: bigint }
        }) => {
          if (where.id !== state.user.id) return { count: 0 }
          const cur = state.user.totpLastUsedStep as bigint | null
          const second = where.OR?.[1]?.totpLastUsedStep
          const lt = second && typeof second === 'object' ? second.lt : BigInt(-1)
          const okNull = cur === null || cur === undefined
          const okLt = typeof cur === 'bigint' && cur < lt
          if (!(okNull || okLt)) return { count: 0 }
          state.user.totpLastUsedStep = data.totpLastUsedStep
          return { count: 1 }
        },
      ),
    },
    mfaChallenge: {
      findUnique: vi.fn(async ({ where }: { where: { jti: string } }) => {
        const row = state.challenges.find((c) => c.jti === where.jti)
        return row ? { ...row } : null
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; consumedAt?: null; attempts?: { lt: number } }
          data: { attempts?: { increment: number }; consumedAt?: Date }
        }) => {
          const row = state.challenges.find((c) => c.id === where.id)
          if (!row) return { count: 0 }
          if ('consumedAt' in where && where.consumedAt === null && row.consumedAt !== null)
            return { count: 0 }
          if (where.attempts?.lt !== undefined && !(row.attempts < where.attempts.lt))
            return { count: 0 }
          if (data.attempts?.increment) row.attempts += data.attempts.increment
          if (data.consumedAt) row.consumedAt = data.consumedAt
          return { count: 1 }
        },
      ),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    mfaBackupCode: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        state.backupCodes
          .filter((b) => b.userId === where.userId && b.usedAt === null)
          .map((b) => ({ ...b })),
      ),
      count: vi.fn(
        async ({ where }: { where: { userId: string } }) =>
          state.backupCodes.filter((b) => b.userId === where.userId && b.usedAt === null).length,
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; usedAt: null }
          data: { usedAt: Date }
        }) => {
          const row = state.backupCodes.find((b) => b.id === where.id)
          if (!row || row.usedAt !== null) return { count: 0 }
          row.usedAt = data.usedAt
          return { count: 1 }
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
        const before = state.backupCodes.length
        state.backupCodes = state.backupCodes.filter((b) => b.userId !== where.userId)
        return { count: before - state.backupCodes.length }
      }),
      createMany: vi.fn(async ({ data }: { data: Array<{ userId: string; codeHash: string }> }) => {
        for (const d of data)
          state.backupCodes.push({ id: randomUUID(), usedAt: null, ...d })
        return { count: data.length }
      }),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  }

  const tokens = {
    verifyMfaChallenge: vi.fn((token: string) => {
      // Mirror the real semantics: our fake tokens are `mfa:<sub>:<jti>`.
      const [type, sub, jti] = token.split(':')
      if (type !== 'mfa' || !sub || !jti) {
        const err = new Error(CHALLENGE_MSG) as Error & { status: number }
        err.status = 401
        throw Object.assign(err, { name: 'UnauthorizedException' })
      }
      return { sub, jti }
    }),
    issueRefresh: vi.fn(async () => ({ token: 'new-refresh', jti: 'new-sid' })),
    signAccess: vi.fn(() => 'new-access'),
    revokeAllExcept: vi.fn(async () => {}),
  }

  const passwords = {
    verify: vi.fn((password: string) => password === 'correct-pw'),
  }

  const audit = { write: vi.fn(async () => {}) }

  const service = new MfaService(
    prisma as never,
    passwords as never,
    tokens as never,
    audit as never,
  )

  /** Seed a live challenge row + its matching fake token. */
  function seedChallenge(overrides: Partial<ChallengeRow> = {}): { token: string; row: ChallengeRow } {
    const jti = overrides.jti ?? randomUUID().replaceAll('-', '')
    const token = `mfa:${state.user.id}:${jti}`
    const row: ChallengeRow = {
      id: randomUUID(),
      userId: state.user.id,
      jti,
      tokenHash: sha256hex(token),
      attempts: 0,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
      createdAt: new Date(),
      ...overrides,
    }
    state.challenges.push(row)
    return { token, row }
  }

  function seedBackupCodes(codes: string[]): void {
    for (const c of codes)
      state.backupCodes.push({ id: randomUUID(), userId: state.user.id, codeHash: sha256hex(c), usedAt: null })
  }

  return { service, state, prisma, tokens, passwords, audit, seedChallenge, seedBackupCodes }
}

beforeEach(() => {
  process.env.MFA_TOTP_KEY = KEY.toString('base64')
})
afterEach(() => {
  delete process.env.MFA_TOTP_KEY
})

// ── verifyChallenge — success paths ──────────────────────────────────────────

describe('verifyChallenge — success', () => {
  it('TOTP: correct code → token pair + user, counters reset, challenge consumed, step claimed', async () => {
    const h = makeHarness(makeUser({ failedLoginAttempts: 3 }))
    const { token, row } = h.seedChallenge()
    const before = nowStep()
    const res = await h.service.verifyChallenge({ mfa_token: token, code: codeNow() })
    expect(res.access_token).toBe('new-access')
    expect(res.refresh_token).toBe('new-refresh')
    expect(res.user.mfa_enabled).toBe(true)
    expect((res.user as unknown as Record<string, unknown>).totpSecretEnc).toBeUndefined()
    expect(h.state.user.failedLoginAttempts).toBe(0)
    expect(h.state.challenges.find((c) => c.id === row.id)?.consumedAt).not.toBeNull()
    // Step-claim seeded with the matched step (± the 30s boundary the test may cross).
    expect(h.state.user.totpLastUsedStep).toBeGreaterThanOrEqual(BigInt(before - 1))
    expect(h.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login.mfa', metadata: { method: 'totp' } }),
    )
  })

  it('backup code: spends the code once and audits remaining count', async () => {
    const h = makeHarness(makeUser())
    h.seedBackupCodes(['AAAAAAAAAA', 'BBBBBBBBBB', 'CCCCCCCCCC'])
    const { token } = h.seedChallenge()
    const res = await h.service.verifyChallenge({ mfa_token: token, code: 'BBBBBBBBBB' })
    expect(res.access_token).toBe('new-access')
    expect(h.state.backupCodes.filter((b) => b.usedAt === null)).toHaveLength(2)
    expect(h.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'mfa.backup_code.used', metadata: { remaining: 2 } }),
    )
  })
})

// ── verifyChallenge — challenge class ────────────────────────────────────────

describe('verifyChallenge — challenge-class 401 (failedLoginAttempts untouched)', () => {
  it('garbage token', async () => {
    const h = makeHarness(makeUser({ failedLoginAttempts: 2 }))
    await expect(
      h.service.verifyChallenge({ mfa_token: 'garbage', code: codeNow() }),
    ).rejects.toThrow(CHALLENGE_MSG)
    expect(h.state.user.failedLoginAttempts).toBe(2)
  })

  it('no row for jti / consumed / expired / tokenHash mismatch', async () => {
    const h = makeHarness(makeUser({ failedLoginAttempts: 2 }))
    // No row at all
    await expect(
      h.service.verifyChallenge({ mfa_token: 'mfa:u1:unknownjti', code: codeNow() }),
    ).rejects.toThrow(CHALLENGE_MSG)
    // Consumed
    const consumed = h.seedChallenge({ consumedAt: new Date() })
    await expect(
      h.service.verifyChallenge({ mfa_token: consumed.token, code: codeNow() }),
    ).rejects.toThrow(CHALLENGE_MSG)
    // Expired
    const expired = h.seedChallenge({ expiresAt: new Date(Date.now() - 1000) })
    await expect(
      h.service.verifyChallenge({ mfa_token: expired.token, code: codeNow() }),
    ).rejects.toThrow(CHALLENGE_MSG)
    // tokenHash mismatch (re-signed token reusing a live jti)
    const live = h.seedChallenge({ tokenHash: sha256hex('a-different-signing') })
    await expect(
      h.service.verifyChallenge({ mfa_token: live.token, code: codeNow() }),
    ).rejects.toThrow(CHALLENGE_MSG)
    expect(h.state.user.failedLoginAttempts).toBe(2) // never bumped by this class
  })

  it('per-challenge cap: 5 wrong codes bump the shared counter; the 6th is challenge-class with NO further bump', async () => {
    const h = makeHarness(makeUser())
    const { token, row } = h.seedChallenge()
    for (let i = 0; i < 5; i++) {
      await expect(
        h.service.verifyChallenge({ mfa_token: token, code: '000000' }),
      ).rejects.toThrow('Invalid code.')
    }
    expect(h.state.user.failedLoginAttempts).toBe(5)
    await expect(
      h.service.verifyChallenge({ mfa_token: token, code: codeNow() }), // even the RIGHT code
    ).rejects.toThrow(CHALLENGE_MSG)
    expect(h.state.user.failedLoginAttempts).toBe(5) // no bump beyond the cap
    expect(h.state.challenges.find((c) => c.id === row.id)?.consumedAt).not.toBeNull()
  })
})

// ── verifyChallenge — code class ─────────────────────────────────────────────

describe('verifyChallenge — code-class 401 (shared lockout pool)', () => {
  it('wrong TOTP and wrong backup code produce IDENTICAL messages and each bump the counter', async () => {
    const h = makeHarness(makeUser())
    h.seedBackupCodes(['AAAAAAAAAA'])
    const c1 = h.seedChallenge()
    await expect(
      h.service.verifyChallenge({ mfa_token: c1.token, code: '000000' }),
    ).rejects.toThrow('Invalid code.')
    await expect(
      h.service.verifyChallenge({ mfa_token: c1.token, code: 'ZZZZZZZZZZ' }),
    ).rejects.toThrow('Invalid code.')
    expect(h.state.user.failedLoginAttempts).toBe(2)
    expect(h.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login.mfa_failed', metadata: { attempts: 1 } }),
    )
  })

  it('shared pool: 3 pre-existing password failures + 3 MFA failures ⇒ 30-min lock, transition-only audit with source', async () => {
    const h = makeHarness(makeUser({ failedLoginAttempts: 3 }))
    const { token } = h.seedChallenge()
    for (let i = 0; i < 3; i++) {
      await expect(
        h.service.verifyChallenge({ mfa_token: token, code: '000000' }),
      ).rejects.toThrow('Invalid code.')
    }
    expect(h.state.user.lockedUntil).not.toBeNull()
    expect(h.state.user.failedLoginAttempts).toBe(0) // reset at the lock transition, like login
    expect(h.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.login.locked',
        metadata: { attempts: 6, source: 'mfa' },
      }),
    )
    // While locked: 423 with login's exact string, not audited per-request.
    const auditCalls = h.audit.write.mock.calls.length
    const c2 = h.seedChallenge()
    await expect(
      h.service.verifyChallenge({ mfa_token: c2.token, code: codeNow() }),
    ).rejects.toThrow('Account temporarily locked due to failed attempts. Try again later.')
    expect(h.audit.write.mock.calls.length).toBe(auditCalls)
  })

  it('TOTP replay: the same code is rejected the second time (step-claim), counter bumped', async () => {
    const h = makeHarness(makeUser())
    const code = codeNow()
    const c1 = h.seedChallenge()
    await h.service.verifyChallenge({ mfa_token: c1.token, code })
    const c2 = h.seedChallenge()
    await expect(h.service.verifyChallenge({ mfa_token: c2.token, code })).rejects.toThrow(
      'Invalid code.',
    )
    expect(h.state.user.failedLoginAttempts).toBe(1)
  })

  it('backup code single-use: works once, then fails on a fresh challenge', async () => {
    const h = makeHarness(makeUser())
    h.seedBackupCodes(['AAAAAAAAAA'])
    const c1 = h.seedChallenge()
    await h.service.verifyChallenge({ mfa_token: c1.token, code: 'AAAAAAAAAA' })
    const c2 = h.seedChallenge()
    await expect(
      h.service.verifyChallenge({ mfa_token: c2.token, code: 'AAAAAAAAAA' }),
    ).rejects.toThrow('Invalid code.')
  })

  it('backup verify with ZERO unused rows fails code-class (dummy-compare path)', async () => {
    const h = makeHarness(makeUser())
    const { token } = h.seedChallenge()
    await expect(
      h.service.verifyChallenge({ mfa_token: token, code: 'AAAAAAAAAA' }),
    ).rejects.toThrow('Invalid code.')
  })

  it('concurrent double-verify of one TOTP code: exactly one success (step-claim race)', async () => {
    const h = makeHarness(makeUser())
    const code = codeNow()
    const c1 = h.seedChallenge()
    const c2 = h.seedChallenge()
    const results = await Promise.allSettled([
      h.service.verifyChallenge({ mfa_token: c1.token, code }),
      h.service.verifyChallenge({ mfa_token: c2.token, code }),
    ])
    const ok = results.filter((r) => r.status === 'fulfilled')
    expect(ok).toHaveLength(1)
  })

  it('concurrent double-spend of one backup code: exactly one success (consume race)', async () => {
    const h = makeHarness(makeUser())
    h.seedBackupCodes(['AAAAAAAAAA'])
    const c1 = h.seedChallenge()
    const c2 = h.seedChallenge()
    const results = await Promise.allSettled([
      h.service.verifyChallenge({ mfa_token: c1.token, code: 'AAAAAAAAAA' }),
      h.service.verifyChallenge({ mfa_token: c2.token, code: 'AAAAAAAAAA' }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  })

  it('concurrent double-verify on ONE challenge: the consume race admits exactly one', async () => {
    const h = makeHarness(makeUser())
    h.seedBackupCodes(['AAAAAAAAAA', 'BBBBBBBBBB'])
    const { token } = h.seedChallenge()
    const results = await Promise.allSettled([
      h.service.verifyChallenge({ mfa_token: token, code: 'AAAAAAAAAA' }),
      h.service.verifyChallenge({ mfa_token: token, code: 'BBBBBBBBBB' }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  })
})

// ── setup / enable lifecycle ─────────────────────────────────────────────────

describe('setup', () => {
  it('503 MFA_NOT_CONFIGURED when MFA_TOTP_KEY is unset (fail-closed)', async () => {
    delete process.env.MFA_TOTP_KEY
    const h = makeHarness(makeUser({ totpEnabled: false, totpSecretEnc: null }))
    await expect(h.service.setup(h.state.user, { password: 'correct-pw' })).rejects.toMatchObject({
      response: { code: 'MFA_NOT_CONFIGURED' },
    })
  })

  it('401 on wrong password; 400 MFA_ALREADY_ENABLED when enabled', async () => {
    const h = makeHarness(makeUser({ totpEnabled: false, totpSecretEnc: null }))
    await expect(h.service.setup(h.state.user, { password: 'nope' })).rejects.toThrow(
      'Current password is incorrect.',
    )
    const h2 = makeHarness(makeUser()) // enabled
    await expect(h2.service.setup(h2.state.user, { password: 'correct-pw' })).rejects.toMatchObject(
      { response: { code: 'MFA_ALREADY_ENABLED' } },
    )
  })

  it('stores ONLY an encrypted pending secret (+15m) and returns secret/otpauth_uri/expires_at; repeat overwrites', async () => {
    const h = makeHarness(makeUser({ totpEnabled: false, totpSecretEnc: null }))
    const res = await h.service.setup(h.state.user, { password: 'correct-pw' })
    expect(res.secret).toMatch(/^[A-Z2-7]{32}$/) // 20 bytes → 32 base32 chars
    expect(res.otpauth_uri).toContain(`secret=${res.secret}`)
    expect(res.otpauth_uri).toContain('issuer=KYRO')
    expect(new Date(res.expires_at).getTime()).toBeGreaterThan(Date.now())
    expect(h.state.user.totpPendingSecretEnc).toMatch(/^v1:/)
    expect(h.state.user.totpPendingSecretEnc).not.toContain(res.secret)
    expect(h.state.user.totpEnabled).toBe(false)
    expect(h.state.user.totpSecretEnc).toBeNull() // active secret untouched
    const res2 = await h.service.setup(h.state.user, { password: 'correct-pw' })
    expect(res2.secret).not.toBe(res.secret) // repeat call overwrites
    expect(h.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'mfa.setup.started' }),
    )
  })
})

describe('enable', () => {
  function pendingUser(expiresInMs = 15 * 60 * 1000) {
    return makeUser({
      totpEnabled: false,
      totpSecretEnc: null,
      totpEnrolledAt: null,
      totpPendingSecretEnc: encryptSecret(SECRET_B32, KEY, 'mfa-totp:u1'),
      totpPendingExpiresAt: new Date(Date.now() + expiresInMs),
    })
  }

  it('MFA_SETUP_EXPIRED on missing or expired pending', async () => {
    const h1 = makeHarness(makeUser({ totpEnabled: false, totpSecretEnc: null }))
    await expect(h1.service.enable(h1.state.user, 'sid', { code: codeNow() })).rejects.toMatchObject(
      { response: { code: 'MFA_SETUP_EXPIRED' } },
    )
    const h2 = makeHarness(pendingUser(-1000))
    await expect(h2.service.enable(h2.state.user, 'sid', { code: codeNow() })).rejects.toMatchObject(
      { response: { code: 'MFA_SETUP_EXPIRED' } },
    )
  })

  it('wrong code → 400 Invalid code., pending intact', async () => {
    const h = makeHarness(pendingUser())
    await expect(h.service.enable(h.state.user, 'sid', { code: '000000' })).rejects.toThrow(
      'Invalid code.',
    )
    expect(h.state.user.totpPendingSecretEnc).not.toBeNull()
    expect(h.state.user.totpEnabled).toBe(false)
  })

  it('success: promotes pending, seeds the replay floor, returns 10 codes (hashes stored), revokes other sessions', async () => {
    const h = makeHarness(pendingUser())
    const res = await h.service.enable(h.state.user, 'my-sid', { code: codeNow() })
    expect(res.backup_codes).toHaveLength(10)
    for (const c of res.backup_codes) expect(c).toMatch(/^[A-HJ-KM-NP-Z2-9]{10}$/)
    expect(new Set(res.backup_codes).size).toBe(10)
    expect(h.state.user.totpEnabled).toBe(true)
    expect(h.state.user.totpSecretEnc).toMatch(/^v1:/)
    expect(h.state.user.totpPendingSecretEnc).toBeNull()
    expect(h.state.user.totpLastUsedStep).not.toBeNull() // enrollment code unreplayable
    expect(h.state.backupCodes).toHaveLength(10)
    for (const row of h.state.backupCodes) {
      expect(res.backup_codes).not.toContain(row.codeHash) // hashes only at rest
      expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/)
    }
    expect(h.tokens.revokeAllExcept).toHaveBeenCalledWith('u1', 'my-sid')
    expect(h.audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'mfa.enabled' }))
    // The enrollment code cannot be replayed at first login (same step).
    const { token } = h.seedChallenge()
    await expect(
      h.service.verifyChallenge({
        mfa_token: token,
        code: generateTotp(SECRET_B32, Number(h.state.user.totpLastUsedStep)),
      }),
    ).rejects.toThrow('Invalid code.')
  })
})

// ── disable / regenerate / status ────────────────────────────────────────────

describe('disable / regenerateBackupCodes', () => {
  it('400 MFA_NOT_ENABLED when disabled', async () => {
    const h = makeHarness(makeUser({ totpEnabled: false, totpSecretEnc: null }))
    await expect(
      h.service.disable(h.state.user, 'sid', { password: 'correct-pw', code: '000000' }),
    ).rejects.toMatchObject({ response: { code: 'MFA_NOT_ENABLED' } })
    await expect(
      h.service.regenerateBackupCodes(h.state.user, { password: 'correct-pw', code: '000000' }),
    ).rejects.toMatchObject({ response: { code: 'MFA_NOT_ENABLED' } })
  })

  it('requires password AND code — a stolen access token alone is insufficient', async () => {
    const h = makeHarness(makeUser())
    await expect(
      h.service.disable(h.state.user, 'sid', { password: 'stolen-token-no-pw', code: codeNow() }),
    ).rejects.toThrow('Current password is incorrect.')
    await expect(
      h.service.disable(h.state.user, 'sid', { password: 'correct-pw', code: '000000' }),
    ).rejects.toThrow('Invalid code.')
    expect(h.state.user.totpEnabled).toBe(true) // untouched
  })

  it('disable clears ALL TOTP state + codes and revokes other sessions', async () => {
    const h = makeHarness(makeUser())
    h.seedBackupCodes(['AAAAAAAAAA'])
    const res = await h.service.disable(h.state.user, 'keep-sid', {
      password: 'correct-pw',
      code: codeNow(),
    })
    expect(res.message).toBe('Two-factor authentication disabled.')
    expect(h.state.user.totpEnabled).toBe(false)
    expect(h.state.user.totpSecretEnc).toBeNull()
    expect(h.state.user.totpLastUsedStep).toBeNull()
    expect(h.state.user.totpEnrolledAt).toBeNull()
    expect(h.state.backupCodes).toHaveLength(0)
    expect(h.tokens.revokeAllExcept).toHaveBeenCalledWith('u1', 'keep-sid')
    expect(h.audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'mfa.disabled' }))
  })

  it('disable accepts a backup code as the second factor', async () => {
    const h = makeHarness(makeUser())
    h.seedBackupCodes(['AAAAAAAAAA'])
    await h.service.disable(h.state.user, 'sid', { password: 'correct-pw', code: 'AAAAAAAAAA' })
    expect(h.state.user.totpEnabled).toBe(false)
  })

  it('regenerate replaces all codes (old ones dead) and audits count', async () => {
    const h = makeHarness(makeUser())
    h.seedBackupCodes(['AAAAAAAAAA', 'BBBBBBBBBB'])
    const res = await h.service.regenerateBackupCodes(h.state.user, {
      password: 'correct-pw',
      code: codeNow(),
    })
    expect(res.backup_codes).toHaveLength(10)
    expect(h.state.backupCodes).toHaveLength(10)
    expect(
      h.state.backupCodes.some((b) => b.codeHash === sha256hex('AAAAAAAAAA')),
    ).toBe(false)
    expect(h.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'mfa.backup_codes.regenerated', metadata: { count: 10 } }),
    )
  })
})

describe('status + backup-code generation', () => {
  it('status: enabled shape with remaining count; disabled shape zeroed/nulled', async () => {
    const h = makeHarness(makeUser())
    h.seedBackupCodes(['AAAAAAAAAA', 'BBBBBBBBBB', 'CCCCCCCCCC'])
    h.state.backupCodes[0].usedAt = new Date()
    expect(await h.service.status(h.state.user)).toEqual({
      mfa_enabled: true,
      backup_codes_remaining: 2,
      enrolled_at: '2026-07-01T00:00:00.000Z',
    })
    const h2 = makeHarness(makeUser({ totpEnabled: false }))
    expect(await h2.service.status(h2.state.user)).toEqual({
      mfa_enabled: false,
      backup_codes_remaining: 0,
      enrolled_at: null,
    })
  })

  it('generateBackupCodes: 10 unique 10-char codes from the unambiguous alphabet', () => {
    const h = makeHarness(makeUser())
    const codes = h.service.generateBackupCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const c of codes) {
      expect(c).toHaveLength(10)
      expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/)
      expect(c).toMatch(/^[A-Z2-9]{10}$/) // matches the DTO's backup-code shape
    }
  })
})

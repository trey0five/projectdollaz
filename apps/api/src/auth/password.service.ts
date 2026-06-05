import { Injectable } from '@nestjs/common'
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'

// PBKDF2-HMAC-SHA256 / 600k iterations — matches smartbot + packages/db seed.mjs.
// If you change these, update packages/db/prisma/seed.mjs in lockstep.
const ALGO = 'pbkdf2_sha256'
const ITERS = 600000
const SALT_LEN = 16
const KEY_LEN = 64

export interface PasswordHash {
  algo: string
  iters: number
  salt: Buffer
  hash: Buffer
}

@Injectable()
export class PasswordService {
  hash(password: string): PasswordHash {
    const salt = randomBytes(SALT_LEN)
    const hash = pbkdf2Sync(password, salt, ITERS, KEY_LEN, 'sha256')
    return { algo: ALGO, iters: ITERS, salt, hash }
  }

  /**
   * Constant-time verify against stored material. Length-guards before
   * timingSafeEqual (which throws on length mismatch).
   */
  verify(
    password: string,
    algo: string | null,
    iters: number | null,
    salt: Buffer | Uint8Array | null,
    storedHash: Buffer | Uint8Array | null,
  ): boolean {
    if (!algo || !iters || !salt || !storedHash) return false
    if (algo !== ALGO) return false
    const saltBuf = Buffer.from(salt)
    const stored = Buffer.from(storedHash)
    const derived = pbkdf2Sync(password, saltBuf, iters, stored.length, 'sha256')
    if (derived.length !== stored.length) return false
    return timingSafeEqual(derived, stored)
  }

  /** Equalize timing when a user does not exist (anti-enumeration). */
  dummyVerify(password: string): void {
    const salt = randomBytes(SALT_LEN)
    pbkdf2Sync(password, salt, ITERS, KEY_LEN, 'sha256')
  }

  /**
   * Server-side strength rules mirroring the frontend live rules:
   * >=10 chars, one uppercase, one number, one special, <=128.
   * Returns an error message or null if valid.
   */
  validateStrength(password: string): string | null {
    if (typeof password !== 'string') return 'Password is required.'
    if (password.length < 10) return 'Password must be at least 10 characters.'
    if (password.length > 128) return 'Password must be at most 128 characters.'
    if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter.'
    if (!/[0-9]/.test(password)) return 'Password must contain a number.'
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      return 'Password must contain a special character.'
    }
    return null
  }
}

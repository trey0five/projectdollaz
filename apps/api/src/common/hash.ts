import { createHash, timingSafeEqual } from 'node:crypto'

// SHA-256 (hex) for HIGH-ENTROPY secrets stored at rest — refresh-token strings,
// email-verification tokens, password-reset codes. These are random tokens, not
// user-chosen passwords, so a fast hash is appropriate (passwords still use
// PBKDF2 in PasswordService). Storing the hash means a DB read never yields a
// usable token.
export function sha256hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Constant-time compare of two hex-hash strings (equal length). */
export function hashesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

// House TOTP (RFC 6238 over RFC 4226 HOTP) — node:crypto only, ZERO deps.
// Deliberate: no `otpauth`/`otplib` in the API image (Dockerfile-prune risk,
// supply-chain surface). Params are FIXED and must never widen: SHA-1, 6 digits,
// 30s step, verify window ±1 step.
//
// Timing invariants (mirror PasswordService.dummyVerify's discipline):
//   • verifyTotp computes the code for ALL THREE window steps and compares each
//     with timingSafeEqual — NO EARLY EXIT — so response time never reveals
//     which step (or whether any step) matched.
//   • Comparison inputs are fixed-length (6 ASCII digits) by construction.
import { createHmac, timingSafeEqual } from 'node:crypto'

export const TOTP_STEP_SECONDS = 30
export const TOTP_DIGITS = 6
export const TOTP_WINDOW = 1 // ±1 step — never widen

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** RFC 4648 base32 encode (uppercase, unpadded — the otpauth convention). */
export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

/** RFC 4648 base32 decode (case-insensitive, ignores padding). Throws on other chars. */
export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error('Invalid base32 character.')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/**
 * HOTP dynamic truncation (RFC 4226 §5.3) for one time-step. `secret` is the
 * base32-encoded seed; `step` is floor(unixSeconds / 30).
 */
export function generateTotp(secret: string, step: number): string {
  const key = base32Decode(secret)
  const counter = Buffer.alloc(8)
  // 8-byte big-endian counter. Steps fit in 2^53 comfortably (year ~4e8).
  counter.writeBigUInt64BE(BigInt(step))
  const hmac = createHmac('sha1', key).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0')
}

/**
 * Verify a 6-digit code against the ±1-step window around `now`.
 * Returns the MATCHED step so callers can atomically claim it as the replay
 * floor (`totpLastUsedStep`); { ok: false, step: null } otherwise.
 *
 * TIMING: all 3 window codes are always computed and always compared
 * (timingSafeEqual, fixed 6-byte inputs); the match flag is folded in with
 * bitwise ops — no data-dependent branch, no early exit.
 */
export function verifyTotp(
  secret: string,
  code: string,
  now: Date = new Date(),
): { ok: boolean; step: number | null } {
  const current = Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS)
  const presented = Buffer.from(code, 'utf8')
  let matchedStep: number | null = null
  let anyMatch = 0
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset++) {
    const step = current + offset
    const expected = Buffer.from(generateTotp(secret, step), 'utf8')
    // Length check first (timingSafeEqual throws on unequal length); a
    // non-6-char presented code fails every window uniformly.
    const eq =
      presented.length === expected.length && timingSafeEqual(presented, expected) ? 1 : 0
    // Fold — deliberately NOT `if (eq) return`, so all 3 windows always run.
    if (eq === 1 && matchedStep === null) matchedStep = step
    anyMatch |= eq
  }
  return anyMatch === 1 ? { ok: true, step: matchedStep } : { ok: false, step: null }
}

/**
 * otpauth:// provisioning URI for authenticator apps. Issuer is in BOTH the
 * label prefix and the `issuer` param (Google Authenticator wants the former,
 * the spec the latter).
 */
export function buildOtpauthUri(email: string, base32Secret: string): string {
  const issuer = 'KYRO'
  return `otpauth://totp/${issuer}:${encodeURIComponent(email)}?secret=${base32Secret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`
}

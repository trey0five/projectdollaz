// AES-256-GCM encryption-at-rest for AUTH-CRITICAL secrets (TOTP seeds).
//
// Same `v1:<ivB64>:<tagB64>:<ctB64>` wire format as integrations/qbo-crypto.ts,
// but with the OPPOSITE availability posture — FAIL-CLOSED everywhere:
//   • No plaintext fallback: encryptSecret always requires a key; decryptSecret
//     refuses anything that is not a well-formed v1 envelope. A TOTP seed must
//     never be stored or read in the clear (qbo-crypto's dormant/plaintext
//     passthrough is a migration affordance that does NOT apply here).
//   • AAD is MANDATORY (setAAD on both sides): each ciphertext is bound to its
//     context (e.g. `mfa-totp:<userId>`), so a row copied between users fails
//     authentication instead of decrypting.
//   • The key must be EXACTLY 32 bytes of base64 — anything else is "no key",
//     and callers must treat "no key" as feature-unavailable (503), never as
//     "skip encryption".
// Do NOT modify qbo-crypto.ts to share this; its backward-compat contract is
// deliberately different.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const PREFIX = 'v1:'

/**
 * Load a 32-byte AES-256 key from a base64 env var. Returns null when unset or
 * not exactly 32 bytes (callers fail closed on null — no derived/weak keys).
 */
export function loadKeyFromEnv(name: string): Buffer | null {
  const raw = process.env[name]
  if (!raw) return null
  const buf = Buffer.from(raw, 'base64')
  return buf.length === 32 ? buf : null
}

/** Encrypt `plain` under `key`, authenticated against `aad`. Throws without a key. */
export function encryptSecret(plain: string, key: Buffer, aad: string): string {
  if (!key || key.length !== 32) {
    throw new Error('secret-crypto: a 32-byte key is required to encrypt.')
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

/**
 * Decrypt a stored `v1:` envelope. FAIL-CLOSED: throws on a missing/short key,
 * a malformed envelope, a wrong AAD, or a tampered tag/ciphertext. There is no
 * plaintext passthrough — a value that is not an envelope is an error.
 */
export function decryptSecret(stored: string, key: Buffer, aad: string): string {
  if (!key || key.length !== 32) {
    throw new Error('secret-crypto: a 32-byte key is required to decrypt.')
  }
  if (!stored || !stored.startsWith(PREFIX)) {
    throw new Error('secret-crypto: malformed encrypted secret (no v1 envelope).')
  }
  const [, ivB64, tagB64, ctB64] = stored.split(':')
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error('secret-crypto: malformed encrypted secret.')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

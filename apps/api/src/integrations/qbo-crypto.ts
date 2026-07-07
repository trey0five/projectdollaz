// QuickBooks OAuth token encryption at rest (AES-256-GCM).
//
// KEY-GATED + BACKWARD-COMPATIBLE by design, so turning it on can't break the live
// connection:
//   • No QBO_TOKEN_KEY set  → encToken is a NO-OP (stores plaintext) and decToken
//     passes through — byte-identical to the pre-encryption behavior. The capability
//     ships dormant until a key is provisioned in the gitignored .env.
//   • Key set               → new writes are encrypted as `v1:<iv>:<tag>:<ct>`;
//     existing PLAINTEXT rows still read fine (decToken passes through anything
//     without the `v1:` prefix) and get upgraded on their next refresh-persist.
//     No data migration, no schema change (same String columns).
// decToken fails CLOSED: an encrypted value with no/invalid key throws rather than
// leak or mis-handle. QBO rotates the refresh token on every refresh, so enc/dec sit
// only at the persistence boundary — the rotation flow itself is untouched.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const PREFIX = 'v1:'

/** The 32-byte AES-256 key from QBO_TOKEN_KEY (base64), or null when unset/invalid. */
function loadKey(): Buffer | null {
  const raw = process.env.QBO_TOKEN_KEY
  if (!raw) return null
  const buf = Buffer.from(raw, 'base64')
  return buf.length === 32 ? buf : null
}

/** Encrypt a token for storage. No key → returns the plaintext unchanged (dormant). */
export function encToken(plain: string): string {
  const key = loadKey()
  if (!key || !plain) return plain
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

/** Decrypt a stored token. A value without the `v1:` prefix is legacy plaintext and
 *  is returned verbatim (so encToken/decToken are idempotent on plaintext). An
 *  encrypted value with no valid key throws (fail-closed). */
export function decToken(stored: string): string {
  if (!stored || !stored.startsWith(PREFIX)) return stored
  const key = loadKey()
  if (!key) {
    throw new Error('QBO_TOKEN_KEY is required to read an encrypted QuickBooks token.')
  }
  const [, ivB64, tagB64, ctB64] = stored.split(':')
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error('Malformed encrypted QuickBooks token.')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
}

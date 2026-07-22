import { afterEach, describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, loadKeyFromEnv } from './secret-crypto.js'

const KEY = Buffer.alloc(32, 5)
const OTHER_KEY = Buffer.alloc(32, 6)
const ENV = 'SECRET_CRYPTO_SPEC_KEY'

afterEach(() => {
  delete process.env[ENV]
})

describe('secret-crypto — fail-closed AES-256-GCM with mandatory AAD', () => {
  it('round-trips under the same key + AAD; stored form is a v1 envelope, not the plaintext', () => {
    const stored = encryptSecret('JBSWY3DPEHPK3PXP', KEY, 'mfa-totp:u1')
    expect(stored.startsWith('v1:')).toBe(true)
    expect(stored).not.toContain('JBSWY3DPEHPK3PXP')
    expect(decryptSecret(stored, KEY, 'mfa-totp:u1')).toBe('JBSWY3DPEHPK3PXP')
  })

  it('AAD mismatch throws (a row copied to another user id cannot decrypt)', () => {
    const stored = encryptSecret('seed', KEY, 'mfa-totp:u1')
    expect(() => decryptSecret(stored, KEY, 'mfa-totp:u2')).toThrow()
  })

  it('wrong key throws', () => {
    const stored = encryptSecret('seed', KEY, 'mfa-totp:u1')
    expect(() => decryptSecret(stored, OTHER_KEY, 'mfa-totp:u1')).toThrow()
  })

  it('tampered tag or ciphertext throws', () => {
    const stored = encryptSecret('seed', KEY, 'mfa-totp:u1')
    const [v, iv, tag, ct] = stored.split(':')
    const flip = (b64: string) => {
      const buf = Buffer.from(b64, 'base64')
      buf[0] ^= 0xff
      return buf.toString('base64')
    }
    expect(() => decryptSecret([v, iv, flip(tag), ct].join(':'), KEY, 'mfa-totp:u1')).toThrow()
    expect(() => decryptSecret([v, iv, tag, flip(ct)].join(':'), KEY, 'mfa-totp:u1')).toThrow()
  })

  it('malformed stored values fail closed — NO plaintext passthrough', () => {
    expect(() => decryptSecret('plaintext-not-envelope', KEY, 'a')).toThrow()
    expect(() => decryptSecret('', KEY, 'a')).toThrow()
    expect(() => decryptSecret('v1:only-one-part', KEY, 'a')).toThrow()
  })

  it('encrypt/decrypt refuse a missing or short key', () => {
    expect(() => encryptSecret('s', Buffer.alloc(16, 1), 'a')).toThrow()
    expect(() =>
      decryptSecret(encryptSecret('s', KEY, 'a'), Buffer.alloc(16, 1), 'a'),
    ).toThrow()
  })

  it('loadKeyFromEnv: null when unset, null when not 32 bytes, Buffer when valid', () => {
    expect(loadKeyFromEnv(ENV)).toBeNull()
    process.env[ENV] = Buffer.alloc(16, 1).toString('base64')
    expect(loadKeyFromEnv(ENV)).toBeNull()
    process.env[ENV] = 'not-base64-!!!'
    expect(loadKeyFromEnv(ENV)).toBeNull()
    process.env[ENV] = KEY.toString('base64')
    expect(loadKeyFromEnv(ENV)?.equals(KEY)).toBe(true)
  })
})

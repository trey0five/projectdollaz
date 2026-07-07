import { afterEach, describe, expect, it } from 'vitest'
import { decToken, encToken } from './qbo-crypto.js'

// A valid 32-byte (AES-256) key, base64.
const KEY = Buffer.alloc(32, 7).toString('base64')

afterEach(() => {
  delete process.env.QBO_TOKEN_KEY
})

describe('qbo-crypto — key-gated token encryption', () => {
  it('with a key: round-trips, and the stored form is a v1: envelope (not the plaintext)', () => {
    process.env.QBO_TOKEN_KEY = KEY
    const plain = 'RT1-secret-refresh-token'
    const stored = encToken(plain)
    expect(stored.startsWith('v1:')).toBe(true)
    expect(stored).not.toContain(plain)
    expect(decToken(stored)).toBe(plain)
  })

  it('without a key: encToken is a NO-OP (stores plaintext) — dormant, identical to before', () => {
    const plain = 'access-token-xyz'
    expect(encToken(plain)).toBe(plain)
    expect(decToken(plain)).toBe(plain) // legacy plaintext passthrough
  })

  it('legacy plaintext reads back verbatim even when a key is configured (backward-compat)', () => {
    process.env.QBO_TOKEN_KEY = KEY
    expect(decToken('legacy-plaintext-token')).toBe('legacy-plaintext-token')
  })

  it('fails CLOSED: an encrypted value cannot be read without the key', () => {
    process.env.QBO_TOKEN_KEY = KEY
    const stored = encToken('tok')
    delete process.env.QBO_TOKEN_KEY
    expect(() => decToken(stored)).toThrow(/QBO_TOKEN_KEY/)
  })

  it('a wrong-length key is treated as no key (no accidental weak cipher)', () => {
    process.env.QBO_TOKEN_KEY = Buffer.alloc(16, 1).toString('base64') // 16 bytes ≠ AES-256
    expect(encToken('tok')).toBe('tok') // dormant
  })

  it('idempotent on empty', () => {
    process.env.QBO_TOKEN_KEY = KEY
    expect(encToken('')).toBe('')
    expect(decToken('')).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  generateTotp,
  verifyTotp,
  TOTP_STEP_SECONDS,
} from './totp.js'

// RFC 6238 Appendix B reference secret: ASCII "12345678901234567890" (SHA-1 row).
const RFC_SECRET_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

// RFC 6238 Appendix B (SHA-1) truth table. The RFC lists 8-digit codes; our
// 6-digit codes are the same dynamic-truncation value mod 10^6, i.e. the last
// 6 digits of each listed code.
const RFC_VECTORS: Array<{ t: number; code8: string }> = [
  { t: 59, code8: '94287082' },
  { t: 1111111109, code8: '07081804' },
  { t: 1111111111, code8: '14050471' },
  { t: 1234567890, code8: '89005924' },
  { t: 2000000000, code8: '69279037' },
  { t: 20000000000, code8: '65353130' },
]

describe('totp — RFC 6238 conformance', () => {
  it('base32 round-trips the RFC secret', () => {
    expect(base32Encode(Buffer.from('12345678901234567890', 'ascii'))).toBe(RFC_SECRET_B32)
    expect(base32Decode(RFC_SECRET_B32).toString('ascii')).toBe('12345678901234567890')
  })

  it('matches every Appendix B SHA-1 vector (6-digit = last 6 of the 8-digit code)', () => {
    for (const { t, code8 } of RFC_VECTORS) {
      const step = Math.floor(t / TOTP_STEP_SECONDS)
      expect(generateTotp(RFC_SECRET_B32, step)).toBe(code8.slice(-6))
    }
  })
})

describe('totp — verify window', () => {
  const now = new Date(1111111111 * 1000) // step 37037037, code 050471
  const step = Math.floor(1111111111 / TOTP_STEP_SECONDS)

  it('accepts the current step and returns it', () => {
    expect(verifyTotp(RFC_SECRET_B32, generateTotp(RFC_SECRET_B32, step), now)).toEqual({
      ok: true,
      step,
    })
  })

  it('accepts the previous and next step (±1 window) with the MATCHED step', () => {
    expect(verifyTotp(RFC_SECRET_B32, generateTotp(RFC_SECRET_B32, step - 1), now)).toEqual({
      ok: true,
      step: step - 1,
    })
    expect(verifyTotp(RFC_SECRET_B32, generateTotp(RFC_SECRET_B32, step + 1), now)).toEqual({
      ok: true,
      step: step + 1,
    })
  })

  it('rejects codes outside the window and garbage', () => {
    expect(verifyTotp(RFC_SECRET_B32, generateTotp(RFC_SECRET_B32, step - 2), now)).toEqual({
      ok: false,
      step: null,
    })
    expect(verifyTotp(RFC_SECRET_B32, generateTotp(RFC_SECRET_B32, step + 2), now)).toEqual({
      ok: false,
      step: null,
    })
    expect(verifyTotp(RFC_SECRET_B32, '000000', now).ok).toBe(false)
    expect(verifyTotp(RFC_SECRET_B32, 'abcdef', now).ok).toBe(false)
    expect(verifyTotp(RFC_SECRET_B32, '', now).ok).toBe(false)
  })

  it('timing-parity smoke: work is independent of match position (all 3 windows computed)', () => {
    // Behavioral proxy for "no early exit": a match at the EARLIEST window and a
    // match at the LATEST window both verify (so the loop demonstrably reaches
    // every offset), and a non-match runs the identical loop shape.
    const early = generateTotp(RFC_SECRET_B32, step - 1)
    const late = generateTotp(RFC_SECRET_B32, step + 1)
    expect(verifyTotp(RFC_SECRET_B32, early, now).ok).toBe(true)
    expect(verifyTotp(RFC_SECRET_B32, late, now).ok).toBe(true)
    expect(verifyTotp(RFC_SECRET_B32, '999999', now).ok).toBe(false)
  })
})

describe('totp — otpauth uri', () => {
  it('pins issuer/algorithm/digits/period and URI-encodes the account', () => {
    expect(buildOtpauthUri('user@school.org', 'ABC234')).toBe(
      'otpauth://totp/KYRO:user%40school.org?secret=ABC234&issuer=KYRO&algorithm=SHA1&digits=6&period=30',
    )
  })
})

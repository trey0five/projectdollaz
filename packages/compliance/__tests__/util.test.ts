// Locks the pure usd() formatter to byte-identical output (no toLocaleString /
// ICU dependence). Guards the determinism-hardening from the Phase 2A review.
import { describe, it, expect } from 'vitest'
import { usd } from '../src/rules/util.js'

describe('usd formatter (pure, ICU-independent)', () => {
  it('groups thousands with commas and a leading $', () => {
    expect(usd(0)).toBe('$0')
    expect(usd(5)).toBe('$5')
    expect(usd(100)).toBe('$100')
    expect(usd(1000)).toBe('$1,000')
    expect(usd(210000)).toBe('$210,000')
    expect(usd(10420000)).toBe('$10,420,000')
    expect(usd(1234567890)).toBe('$1,234,567,890')
  })

  it('rounds to whole dollars (half-up on magnitude)', () => {
    expect(usd(1234.49)).toBe('$1,234')
    expect(usd(1234.5)).toBe('$1,235')
  })

  it('preserves sign for negative (contra/correction) balances', () => {
    expect(usd(-160000)).toBe('-$160,000')
    expect(usd(-0.4)).toBe('$0')
  })
})

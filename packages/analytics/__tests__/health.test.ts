// ─────────────────────────────────────────────────────────────
// Phase 4D — target bands + healthStatus() boundary tests.
//
// Every banded metric is tested at each boundary (exactly == good, == risk,
// just-inside watch, beyond risk) for both directions; contextual metrics resolve
// neutral; unavailable / null resolve neutral.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { DEFAULT_BANDS, bandsFor, healthStatus } from '../src/health.js'
import { METRIC_KEYS } from '../src/registry.js'
import type { MetricKey } from '../src/types.js'

const h = (v: number | null, k: MetricKey, avail = true) =>
  healthStatus(v, bandsFor(k), avail)

describe('healthStatus — neutral fallbacks', () => {
  it('no bands => neutral', () => {
    expect(healthStatus(123, undefined, true)).toBe('neutral')
  })
  it('unavailable => neutral even with a band', () => {
    expect(h(0.5, 'operating_margin', false)).toBe('neutral')
  })
  it('null value => neutral', () => {
    expect(h(null, 'operating_margin', true)).toBe('neutral')
  })
})

describe('operating_margin (higher: good>=0.03, risk<0)', () => {
  it('exactly 0.03 => good (inclusive)', () => expect(h(0.03, 'operating_margin')).toBe('good'))
  it('above good => good', () => expect(h(0.08, 'operating_margin')).toBe('good'))
  it('just below good => watch', () => expect(h(0.029, 'operating_margin')).toBe('watch'))
  it('exactly 0 (risk boundary) => watch (inclusive of watch)', () =>
    expect(h(0, 'operating_margin')).toBe('watch'))
  it('below 0 => risk', () => expect(h(-0.0001, 'operating_margin')).toBe('risk'))
})

describe('days_cash_on_hand (higher: good>=60, risk<30)', () => {
  it('exactly 60 => good', () => expect(h(60, 'days_cash_on_hand')).toBe('good'))
  it('59.9 => watch', () => expect(h(59.9, 'days_cash_on_hand')).toBe('watch'))
  it('exactly 30 => watch (risk boundary inclusive of watch)', () =>
    expect(h(30, 'days_cash_on_hand')).toBe('watch'))
  it('29.9 => risk', () => expect(h(29.9, 'days_cash_on_hand')).toBe('risk'))
})

describe('months_operating_reserve (higher: good>=6, risk<3)', () => {
  it('exactly 6 => good', () => expect(h(6, 'months_operating_reserve')).toBe('good'))
  it('5.9 => watch', () => expect(h(5.9, 'months_operating_reserve')).toBe('watch'))
  it('exactly 3 => watch', () => expect(h(3, 'months_operating_reserve')).toBe('watch'))
  it('2.9 => risk', () => expect(h(2.9, 'months_operating_reserve')).toBe('risk'))
})

describe('tuition_dependency (lower: good<=0.70, risk>0.85)', () => {
  it('exactly 0.70 => good (inclusive)', () => expect(h(0.7, 'tuition_dependency')).toBe('good'))
  it('0.71 => watch', () => expect(h(0.71, 'tuition_dependency')).toBe('watch'))
  it('exactly 0.85 => watch (risk frontier inclusive of watch)', () =>
    expect(h(0.85, 'tuition_dependency')).toBe('watch'))
  it('0.851 => risk', () => expect(h(0.851, 'tuition_dependency')).toBe('risk'))
  it('0.87 (demo value) => risk', () => expect(h(0.87, 'tuition_dependency')).toBe('risk'))
})

describe('tuition_discount_rate (lower: good<=0.20, risk>0.35)', () => {
  it('exactly 0.20 => good', () => expect(h(0.2, 'tuition_discount_rate')).toBe('good'))
  it('0.21 => watch', () => expect(h(0.21, 'tuition_discount_rate')).toBe('watch'))
  it('exactly 0.35 => watch', () => expect(h(0.35, 'tuition_discount_rate')).toBe('watch'))
  it('0.36 => risk', () => expect(h(0.36, 'tuition_discount_rate')).toBe('risk'))
})

describe('contextual metrics are NEUTRAL (no band)', () => {
  const banded = new Set(Object.keys(DEFAULT_BANDS))
  const contextual = METRIC_KEYS.filter((k) => !banded.has(k))
  it('exactly the 6 banded metrics have bands', () => {
    expect([...banded].sort()).toEqual(
      [
        'days_cash_on_hand',
        'months_operating_reserve',
        'operating_margin',
        'tuition_dependency',
        'tuition_discount_rate',
        // Thin wedge: enrollment is the first non-finance banded metric.
        'enrollment_change_yoy',
      ].sort(),
    )
  })
  it('all contextual metrics resolve neutral for any value', () => {
    for (const k of contextual) {
      expect(h(0.5, k)).toBe('neutral')
      expect(h(12345, k)).toBe('neutral')
    }
  })
})

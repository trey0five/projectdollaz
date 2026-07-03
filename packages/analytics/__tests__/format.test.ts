// ─────────────────────────────────────────────────────────────
// Canonical formatters — the single source of truth for value/delta strings.
// Locks each formatter's output BYTE-FOR-BYTE to what shipped from its origin
// call site (web metricMeta.js + api briefing.service.ts), so consolidating them
// here caused zero visible regressions. Table-driven, one representative value
// per unit. The `days` branch differs on purpose between the bare and long forms
// (bare: localized integer with commas; long: Math.round + " day"/" days", no
// commas) — both are asserted.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import {
  MIX_METRIC_KEYS,
  resolveDisplayUnit,
  formatMetricValue,
  formatMetricDelta,
  formatMetricValueLong,
  describeLineage,
} from '../src/index.js'
import type { MetricUnit } from '../src/index.js'

describe('formatMetricValue — bare dashboard/board form', () => {
  const cases: Array<[MetricUnit, number, string]> = [
    ['percent', -0.02, '-2.0%'],
    ['percent', 0.1, '10.0%'],
    ['share', 0.4, '40.0%'],
    ['days', 45, '45'],
    ['days', 45.3, '45'],
    ['months', 6, '6.0'],
    ['currency', 1234, '$1,234'],
    ['currency', 1234567, '$1,234,567'],
    ['ratio', 1.5, '1.50'],
    ['ratio', 12.5, '12.50'],
  ]
  it.each(cases)('%s %d -> %s', (unit, value, expected) => {
    expect(formatMetricValue(value, unit)).toBe(expected)
  })
  it('null/NaN -> em dash (never a fabricated 0)', () => {
    expect(formatMetricValue(null, 'currency')).toBe('—')
    expect(formatMetricValue(Number.NaN, 'percent')).toBe('—')
  })
  it('a real 0 renders as a number, not a dash', () => {
    expect(formatMetricValue(0, 'percent')).toBe('0.0%')
  })
})

describe('formatMetricValueLong — prose briefing form', () => {
  const cases: Array<[MetricUnit, number, string]> = [
    ['percent', -0.02, '-2.0%'],
    ['share', 0.4, '40.0%'],
    ['days', 45, '45 days'],
    ['days', 1, '1 day'],
    ['days', 45.3, '45 days'],
    ['months', 6, '6.0 months'],
    ['currency', 1234, '$1,234'],
    ['ratio', 1.5, '1.50'],
    ['ratio', 12.5, '12.50'],
  ]
  it.each(cases)('%s %d -> %s', (unit, value, expected) => {
    expect(formatMetricValueLong(value, unit)).toBe(expected)
  })
  it('null/non-finite -> "unavailable"', () => {
    expect(formatMetricValueLong(null, 'days')).toBe('unavailable')
    expect(formatMetricValueLong(Number.POSITIVE_INFINITY, 'currency')).toBe('unavailable')
  })
})

describe('formatMetricDelta — signed period-over-period form', () => {
  // Sign uses the UNICODE minus (−, U+2212), not an ASCII hyphen.
  const cases: Array<[MetricUnit, number, string]> = [
    ['percent', 0.02, '+2.0 pts'],
    ['percent', -0.02, '−2.0 pts'],
    ['share', -0.02, '−2.0 pts'],
    ['days', 3, '+3'],
    ['days', -3, '−3'],
    ['months', 1.5, '+1.5'],
    ['currency', 1234, '+$1,234'],
    ['currency', -1234, '−$1,234'],
    ['ratio', 1.5, '+1.50'],
    ['ratio', 0, '0.00'],
  ]
  it.each(cases)('%s %d -> %s', (unit, delta, expected) => {
    expect(formatMetricDelta(delta, unit)).toBe(expected)
  })
  it('null/NaN delta -> null (caller renders its own placeholder)', () => {
    expect(formatMetricDelta(null, 'percent')).toBeNull()
    expect(formatMetricDelta(Number.NaN, 'days')).toBeNull()
  })
})

describe('resolveDisplayUnit — mix→currency override', () => {
  it('mix metrics carry share but format as a currency total', () => {
    expect(MIX_METRIC_KEYS).toEqual(['revenue_mix', 'expense_mix'])
    expect(resolveDisplayUnit('revenue_mix', 'share')).toBe('currency')
    expect(resolveDisplayUnit('expense_mix', 'share')).toBe('currency')
  })
  it('every non-mix metric passes its own unit through', () => {
    expect(resolveDisplayUnit('operating_margin', 'percent')).toBe('percent')
    expect(resolveDisplayUnit('days_cash_on_hand', 'days')).toBe('days')
    expect(resolveDisplayUnit('net_tuition_per_student', 'currency')).toBe('currency')
  })
})

describe('describeLineage — traceability breadcrumb', () => {
  it('names the formula + each operand with its source', () => {
    const s = describeLineage({
      formula: 'Cash ÷ (Total expenses ÷ 365)',
      inputs: [
        { key: 'cash', label: 'Unrestricted cash', value: 1800, unit: 'currency', source: 'financials' },
        { key: 'totalExp', label: 'Total expenses', value: 900, unit: 'currency', source: 'financials' },
      ],
    })
    expect(s).toBe(
      'Derived from Cash ÷ (Total expenses ÷ 365) — Unrestricted cash [financials] = 1800; Total expenses [financials] = 900',
    )
  })
  it('flags a missing operand and falls back to the formula alone when no inputs', () => {
    expect(
      describeLineage({ formula: 'x ÷ y', inputs: [{ key: 'y', label: 'Y', value: null, unit: 'ratio' }] }),
    ).toBe('Derived from x ÷ y — Y = missing')
    expect(describeLineage({ formula: 'x ÷ y', inputs: [] })).toBe('Derived from x ÷ y')
  })
})

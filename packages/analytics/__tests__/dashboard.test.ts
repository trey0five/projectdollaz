// ─────────────────────────────────────────────────────────────
// Phase 4C — dashboard layout helpers (whitelist + default + strict validator).
// These are the SINGLE source of layout truth shared by the API, so they carry
// dedicated unit coverage (DoD: new whitelist/validation helper is unit-tested).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import {
  defaultDashboardLayout,
  validateDashboardLayout,
  CHART_VARIANTS,
  SPANS,
} from '../src/index.js'
import { METRIC_KEYS } from '../src/registry.js'

describe('defaultDashboardLayout', () => {
  it('contains every registry metric in canonical order, all visible', () => {
    const layout = defaultDashboardLayout()
    expect(layout.map((i) => i.metricKey)).toEqual(METRIC_KEYS)
    expect(layout).toHaveLength(METRIC_KEYS.length)
    for (const item of layout) {
      expect(item.visible).toBe(true)
      expect(item.chart).toBe('auto')
      expect(item.span).toBe(1)
    }
  })

  it('returns a fresh array each call (no shared mutable state)', () => {
    const a = defaultDashboardLayout()
    const b = defaultDashboardLayout()
    expect(a).not.toBe(b)
    a[0].visible = false
    expect(b[0].visible).toBe(true)
  })
})

describe('validateDashboardLayout', () => {
  it('accepts a good layout and normalizes defaults', () => {
    const res = validateDashboardLayout([
      { metricKey: 'operating_margin', visible: true },
      { metricKey: 'days_cash_on_hand', visible: false, chart: 'trend', span: 2 },
    ])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value).toEqual([
      { metricKey: 'operating_margin', visible: true, chart: 'auto', span: 1 },
      { metricKey: 'days_cash_on_hand', visible: false, chart: 'trend', span: 2 },
    ])
  })

  it('drops unknown extra keys on normalize', () => {
    const res = validateDashboardLayout([
      { metricKey: 'operating_margin', visible: true, bogus: 'x', order: 5 },
    ])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value[0]).toEqual({
      metricKey: 'operating_margin',
      visible: true,
      chart: 'auto',
      span: 1,
    })
  })

  it('accepts the default layout round-trip', () => {
    const res = validateDashboardLayout(defaultDashboardLayout())
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value).toHaveLength(METRIC_KEYS.length)
  })

  it('rejects a non-array', () => {
    expect(validateDashboardLayout({}).ok).toBe(false)
    expect(validateDashboardLayout(null).ok).toBe(false)
    expect(validateDashboardLayout('nope').ok).toBe(false)
  })

  it('rejects an empty array', () => {
    expect(validateDashboardLayout([]).ok).toBe(false)
  })

  it('rejects a non-object item', () => {
    expect(validateDashboardLayout(['operating_margin']).ok).toBe(false)
  })

  it('rejects an unknown metricKey', () => {
    const res = validateDashboardLayout([{ metricKey: 'not_a_metric', visible: true }])
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toMatch(/not a known metric/)
  })

  it('rejects a duplicate metricKey', () => {
    const res = validateDashboardLayout([
      { metricKey: 'operating_margin', visible: true },
      { metricKey: 'operating_margin', visible: false },
    ])
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toMatch(/duplicate/)
  })

  it('rejects a non-boolean visible', () => {
    expect(validateDashboardLayout([{ metricKey: 'operating_margin', visible: 'yes' }]).ok).toBe(
      false,
    )
    expect(validateDashboardLayout([{ metricKey: 'operating_margin' }]).ok).toBe(false)
  })

  it('rejects a bad chart variant', () => {
    expect(
      validateDashboardLayout([{ metricKey: 'operating_margin', visible: true, chart: 'pie' }]).ok,
    ).toBe(false)
  })

  it('rejects a bad span', () => {
    expect(
      validateDashboardLayout([{ metricKey: 'operating_margin', visible: true, span: 3 }]).ok,
    ).toBe(false)
  })

  it('exposes the enum constants', () => {
    expect(CHART_VARIANTS).toContain('auto')
    expect(SPANS).toEqual([1, 2])
  })
})

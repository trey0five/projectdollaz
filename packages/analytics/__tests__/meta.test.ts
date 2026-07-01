// ─────────────────────────────────────────────────────────────
// Phase 4D — metric metadata (formula + description) well-formedness.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { ALL_METRICS, METRIC_META, METRIC_KEYS } from '../src/registry.js'
import { DEFAULT_BANDS } from '../src/health.js'
import { computeMetricsRecord } from '../src/compute.js'
import { FULL_BUNDLE } from './fixtures.js'

describe('metric metadata', () => {
  it('every metric def has a non-empty formula + description', () => {
    for (const def of ALL_METRICS) {
      expect(typeof def.formula).toBe('string')
      expect(def.formula.length).toBeGreaterThan(0)
      expect(typeof def.description).toBe('string')
      expect(def.description.length).toBeGreaterThan(0)
    }
  })

  it('METRIC_META covers every metric in canonical order', () => {
    expect(METRIC_META.map((m) => m.key)).toEqual(METRIC_KEYS)
  })

  it('METRIC_META carries bands only for banded metrics', () => {
    for (const m of METRIC_META) {
      if (DEFAULT_BANDS[m.key]) {
        expect(m.bands).toEqual(DEFAULT_BANDS[m.key])
      } else {
        expect(m.bands).toBeUndefined()
      }
    }
  })

  it('METRIC_META entries are well-formed', () => {
    for (const m of METRIC_META) {
      expect(typeof m.label).toBe('string')
      expect(typeof m.unit).toBe('string')
      expect(typeof m.category).toBe('string')
      expect(['higher', 'lower', 'neutral']).toContain(m.goodDirection)
      expect(m.formula.length).toBeGreaterThan(0)
      expect(m.description.length).toBeGreaterThan(0)
    }
  })

  // ── Canonical semantic layer v1 — additive metadata integrity ───────────────
  const SCOPE_RULES = [
    'recompute-from-components',
    'weighted-by-components',
    'sum',
    'not-aggregatable',
  ]

  it('every metric declares a domain + a valid scopeAggregation', () => {
    for (const def of ALL_METRICS) {
      expect(def.domain).toBeDefined()
      expect(['finance', 'operations', 'aid', 'enrollment']).toContain(def.domain)
      expect(def.scopeAggregation).toBeDefined()
      expect(SCOPE_RULES).toContain(def.scopeAggregation)
    }
  })

  it('METRIC_META surfaces domain + an explicit (defaulted) scopeAggregation', () => {
    for (const m of METRIC_META) {
      expect(SCOPE_RULES).toContain(m.scopeAggregation)
      expect(m.domain).toBeDefined()
    }
  })

  it('declared input keys all appear in the metric runtime inputs[] (no drift)', () => {
    // Build each metric's runtime inputs once (full bundle + operational so every
    // operand is reported even when the metric is available).
    const operational = { enrollment: 100, enrollmentFte: null, studentsOnAid: 40, financialAidTotal: 50000 }
    const r = computeMetricsRecord({ current: FULL_BUNDLE, currentOperational: operational })
    for (const def of ALL_METRICS) {
      if (!def.inputs) continue
      const runtimeKeys = new Set(r[def.key].inputs.map((i) => i.key))
      for (const spec of def.inputs) {
        expect(runtimeKeys.has(spec.key)).toBe(true)
        expect(['financials', 'operational']).toContain(spec.source)
      }
    }
  })
})

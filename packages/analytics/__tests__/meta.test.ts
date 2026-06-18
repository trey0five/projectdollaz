// ─────────────────────────────────────────────────────────────
// Phase 4D — metric metadata (formula + description) well-formedness.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { ALL_METRICS, METRIC_META, METRIC_KEYS } from '../src/registry.js'
import { DEFAULT_BANDS } from '../src/health.js'

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
})

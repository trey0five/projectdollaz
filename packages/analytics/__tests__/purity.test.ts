// ─────────────────────────────────────────────────────────────
// Purity guard (mirrors the engine's): analytics src must not import
// React/DOM/fs/xlsx/fetch, must not read the clock/random, and metric compute
// functions must not mutate their inputs.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { ALL_METRICS, computeMetricsForPeriod } from '../src/index.js'
import { FULL_BUNDLE } from './fixtures.js'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..', 'src')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

const FORBIDDEN = [
  /from\s+['"]react['"]/,
  /from\s+['"]react-dom/,
  /from\s+['"]node:fs['"]/,
  /from\s+['"]fs['"]/,
  /from\s+['"]xlsx['"]/,
  /\bfetch\s*\(/,
  /\bdocument\s*\./,
  /\bwindow\s*\./,
  /\bDate\s*\./,
  /\bnew\s+Date\b/,
  /\bMath\.random\b/,
]

describe('analytics purity', () => {
  it('no UI/IO/clock/random in analytics src', () => {
    const files = walk(srcDir)
    const offenders: string[] = []
    for (const f of files) {
      const text = readFileSync(f, 'utf-8')
      for (const re of FORBIDDEN) {
        if (re.test(text)) offenders.push(`${f}: ${re}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('compute does not mutate its inputs (deep-frozen fixture survives)', () => {
    const frozen = structuredClone(FULL_BUNDLE)
    deepFreeze(frozen)
    expect(() => computeMetricsForPeriod({ current: frozen, prior: frozen })).not.toThrow()
  })

  it('every metric def exposes the required metadata', () => {
    for (const def of ALL_METRICS) {
      expect(typeof def.key).toBe('string')
      expect(typeof def.label).toBe('string')
      expect(typeof def.unit).toBe('string')
      expect(typeof def.category).toBe('string')
      expect(['higher', 'lower', 'neutral']).toContain(def.goodDirection)
      expect(typeof def.compute).toBe('function')
    }
  })
})

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) deepFreeze(v)
    Object.freeze(obj)
  }
  return obj
}

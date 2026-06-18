// Purity guard (mirrors analytics'): compliance src must not import React/DOM/
// fs/xlsx/fetch, must not read the clock/random, evaluate() must not mutate its
// inputs, and every rule must expose the required metadata.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { evaluateCompliance } from '../src/evaluate.js'
import { RULE_REGISTRY } from '../src/registry.js'
import { buildFacts, fullPassInputs, nonEducationFinancials } from './fixtures.js'

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

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) deepFreeze(v)
    Object.freeze(obj)
  }
  return obj
}

describe('compliance purity', () => {
  it('no UI/IO/clock/random in compliance src', () => {
    const offenders: string[] = []
    for (const f of walk(srcDir)) {
      const text = readFileSync(f, 'utf-8')
      for (const re of FORBIDDEN) {
        if (re.test(text)) offenders.push(`${f}: ${re}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('evaluateCompliance does not mutate a deep-frozen facts fixture', () => {
    const facts = buildFacts(fullPassInputs, nonEducationFinancials)
    deepFreeze(facts)
    expect(() => evaluateCompliance(facts)).not.toThrow()
  })

  it('every rule exposes the required metadata', () => {
    for (const rule of RULE_REGISTRY) {
      expect(typeof rule.id).toBe('string')
      expect(typeof rule.section).toBe('string')
      expect(['auto', 'intake', 'checklist']).toContain(rule.kind)
      expect(['reportable', 'material', 'gate', 'info', 'watch']).toContain(rule.severityOnFail)
      expect(typeof rule.evaluate).toBe('function')
    }
  })
})

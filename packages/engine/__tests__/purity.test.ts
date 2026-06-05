// ─────────────────────────────────────────────────────────────
// Purity guard: engine source must not import React/DOM/fs/xlsx/fetch.
// (Conceptual enforcement: the package has zero runtime deps and the
// tsconfig lib excludes DOM. This scans src for forbidden imports.)
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

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

// Import/global-access forms only, so legitimate identifiers like a local
// `documentDate` or `windowSize` do not false-positive. The no-DOM tsconfig
// lib (["ES2022"], no "DOM") is the primary enforcement; this scan is a
// secondary guard against forbidden imports / DOM-global usage.
const FORBIDDEN = [
  /from\s+['"]react['"]/,
  /from\s+['"]react-dom/,
  /from\s+['"]node:fs['"]/,
  /from\s+['"]fs['"]/,
  /from\s+['"]xlsx['"]/,
  /\bfetch\s*\(/,
  /\bdocument\s*\./,
  /\bwindow\s*\./,
]

describe('engine purity', () => {
  it('no UI/IO imports in engine src', () => {
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
})

/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// A COLOUR UTILITY THAT COMPILES TO NOTHING.
//
// tailwind.config.js maps several brand colours to a FLAT string —
// `coral: 'rgb(var(--c-coral) / <alpha-value>)'`. A flat value REPLACES that
// colour's whole scale rather than extending it, so `text-coral-600` is not an
// error, not a warning, and not a style: it emits no CSS at all and the element
// renders unstyled.
//
// That is a uniquely nasty failure because it looks like working code. It shipped
// in eleven places under `sky` — a peer-view chip rendering dark text on a navy
// band, plus dead classes across enrollment, HR, facilities and knowledge — and
// nothing caught it until somebody looked at the screen.
//
// `sky` was fixed by giving it back a real scale with DEFAULT on the token, which
// is the right fix when a brand colour genuinely wants shades. This test is the
// general form: for every colour still defined as a flat string, no `-<number>`
// utility may reference it. Add a shade to the config or use the flat class —
// but do not write a class that silently does nothing.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const SRC = resolve(process.cwd(), 'src')
const CONFIG = resolve(process.cwd(), 'tailwind.config.js')

/** Colour keys defined as a FLAT string — the ones with no scale to index into. */
function flatColorKeys() {
  const cfg = readFileSync(CONFIG, 'utf8')
  const keys = []
  // `name: 'rgb(var(--c-name) / <alpha-value>)',` at any indent. An object-valued
  // colour (which HAS a scale) never matches, which is exactly the distinction.
  for (const m of cfg.matchAll(/^\s{6,}([a-zA-Z][\w]*):\s*'rgb\(var\(--[^']+'\s*,/gm)) {
    keys.push(m[1])
  }
  return keys
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(jsx?|tsx?)$/.test(name) && !/\.spec\./.test(name)) out.push(full)
  }
  return out
}

describe('no utility class references a shade that does not exist', () => {
  const keys = flatColorKeys()

  it('finds the flat colour keys in the config at all', () => {
    // If the config's shape changes and this regex stops matching, the test below
    // would pass vacuously — green while the bug it guards walks back in.
    expect(keys.length).toBeGreaterThan(3)
    expect(keys).toContain('coral')
    // sky was FIXED by being given a real scale, so it must no longer be flat.
    expect(keys).not.toContain('sky')
  })

  it('no source file uses <flat-colour>-<number>', () => {
    const files = walk(SRC)
    const offenders = []
    for (const key of keys) {
      // Built at runtime so this file never contains a literal example of the
      // pattern it bans — the note explaining the trap must not be its first breach.
      const re = new RegExp(`\\b(?:bg|text|border|from|via|to|ring|fill|stroke|divide|outline|shadow|accent|caret|decoration|placeholder)-${key}-\\d`)
      for (const f of files) {
        const src = readFileSync(f, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/[^\n]*/g, '')
        if (re.test(src)) offenders.push(`${key} in ${f.slice(SRC.length + 1)}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

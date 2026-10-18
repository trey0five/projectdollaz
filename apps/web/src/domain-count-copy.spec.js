/* global process */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// KYRO COVERS NINE AREAS OF THE SCHOOL — the copy may not say eight.
//
// Academics joined as the ninth domain (finance, governance, enrollment, HR,
// facilities, advancement, accreditation, strategy, academics). The landing
// orbit was updated, but the Studio "Catch me up" tile still said "across all
// 8 areas of the school" on camera. This sweep makes the stale count
// unshippable in any user-facing string under src/ (and index.html), with
// whitespace collapsed so a line-wrap cannot hide it. Comments are skipped —
// they describe history ("completing all 8 domains") rather than make a claim.
// ─────────────────────────────────────────────────────────────────────────────

const SRC = resolve(process.cwd(), 'src')
const INDEX_HTML = resolve(process.cwd(), 'index.html')
const STALE = /\b(all\s+)?(8|eight)\s+(areas|domains|modules)\b/i

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|html)$/.test(name) && !/\.spec\./.test(name)) out.push(p)
  }
  return out
}

// Drop // line comments and /* */ blocks so historical notes are not flagged.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

describe('domain-count copy', () => {
  it('no user-facing string says eight areas / domains / modules', () => {
    const offenders = []
    for (const f of [...walk(SRC), INDEX_HTML]) {
      const text = stripComments(readFileSync(f, 'utf8')).replace(/\s+/g, ' ')
      const m = text.match(STALE)
      if (m) offenders.push(`${relative(process.cwd(), f)}: "${m[0]}"`)
    }
    expect(offenders).toEqual([])
  })

  it('the Studio "Catch me up" tile says nine', async () => {
    const { STUDIO_TILES } = await import('./components/penny/studio/studioTiles.js')
    const tile = STUDIO_TILES.find((t) => t.id === 'catch-up')
    expect(tile.blurb).toMatch(/\bnine areas of the school\b/)
  })
})

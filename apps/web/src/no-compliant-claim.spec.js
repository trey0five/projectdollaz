/* global process */
// `process` is declared explicitly rather than disabling no-undef: apps/web's
// eslint config is browser-scoped, and this spec reads its subjects off disk in
// the node-side vitest context (same pattern as no-ghost-hub.spec.js).
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// THE WORD "COMPLIANT" IS NOT A CLAIM WE MAKE.
//
// There is no government FERPA certification, and COPPA keys to personal
// information collected online FROM a child — KYRO has no student-facing
// surface, so the Rule does not apply at all. Saying "FERPA-compliant" or
// "COPPA-compliant" would therefore be an overclaim (the highest-stakes privacy
// bug under FTC Act §5 is a doc that overclaims), and the approved language is
// fixed (docs/FERPA_Compliance_Overview.md §2–3):
//   · "built to FERPA standards" / "FERPA-aligned by contract"
//   · "no student-facing surfaces, so COPPA does not apply"
//
// This guard makes the banned phrasing unshippable, source-reading style: no
// file under src/ (and not index.html) may contain FERPA/COPPA + "compliant",
// with the whitespace collapsed first so a Prettier line-wrap cannot hide it
// (the no-ghost-hub lesson). Comments are NOT stripped: the phrase is banned
// even as a comment, so nobody copies it into copy later.
// ─────────────────────────────────────────────────────────────────────────────

const SRC = resolve(process.cwd(), 'src')
const INDEX_HTML = resolve(process.cwd(), 'index.html')
const BANNED = /(FERPA|COPPA)[- ]compliant/i

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(jsx?|tsx?|html|md|json|css)$/.test(name)) out.push(full)
  }
  return out
}

describe('no "FERPA-compliant" / "COPPA-compliant" claim anywhere in the web app', () => {
  it('the guard itself sees the phrase (proves the regex is live)', () => {
    expect(BANNED.test('we are FERPA compliant')).toBe(true)
    expect(BANNED.test('COPPA-Compliant')).toBe(true)
    // …and the approved language passes.
    expect(BANNED.test('Built to FERPA standards — FERPA-aligned by contract')).toBe(false)
    expect(BANNED.test('no student-facing surfaces, so COPPA does not apply')).toBe(false)
  })

  it('src/** and index.html carry no banned claim', () => {
    const offenders = []
    const files = [...walk(SRC), INDEX_HTML]
    for (const file of files) {
      // This spec quotes the banned phrase to test the regex; it is the one
      // permitted subject.
      if (file.endsWith('no-compliant-claim.spec.js')) continue
      const text = readFileSync(file, 'utf8').replace(/\s+/g, ' ')
      if (BANNED.test(text)) offenders.push(relative(process.cwd(), file))
    }
    expect(offenders).toEqual([])
  })

  it('the landing TRUST block and the privacy page carry the approved statement', async () => {
    const { TRUST, HERO } = await import('./pages/landing/landingContent.js')
    expect(TRUST.sub).toMatch(/Built to FERPA standards/)
    expect(TRUST.sub).toMatch(/FERPA-aligned by contract/)
    expect(TRUST.sub).toMatch(/no student-facing surfaces, so COPPA does not apply/)
    expect(TRUST.items.map((i) => i.label)).toEqual([
      'Built to FERPA standards',
      'Encrypted in transit & at rest',
      'Hosted on AWS · US',
      'AI: no training · zero retention',
    ])
    expect(HERO.trustLine).toMatch(/Built to FERPA standards/)
    // The hero no longer counts to a hundred.
    expect(HERO.h1Line1).toBe('Many moving parts.')
    const privacy = readFileSync(resolve(SRC, 'pages/legal/PrivacyPage.jsx'), 'utf8').replace(/\s+/g, ' ')
    expect(privacy).toMatch(/data-testid="privacy-at-a-glance"/)
    expect(privacy).toMatch(/Built to FERPA standards/)
    expect(privacy).toMatch(/COPPA does not apply/)
    expect(privacy).toMatch(/Hosted on Amazon Web Services in the United States/)
  })
})

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase I — SPEC API-10. THE EXISTING CLIFF IS FIXED IN THIS SAME CHANGE.
//
// Phase I's headline is "never fan out live computation across an organization".
// It would be absurd to bound the NEW endpoint and leave the heaviest existing one
// unbounded, so the retrofit to OrgBriefingService is part of the phase — and this
// is the guard that says it is still there.
//
// It reads SOURCE TEXT rather than behaviour on purpose. The failure it guards is
// "somebody reverted one line during a merge", which no functional test of
// getOrgBriefing can see: the response is byte-identical either way. That is the
// entire point of the retrofit and also the reason it is invisible to every other
// spec in this directory.
//
// RED PROOF (run): restoring
//   `const settled = await Promise.allSettled(reported.map((r) => …))`
// turns the first three assertions red (no mapWithConcurrency, no
// ORG_FANOUT_CONCURRENCY, and a bare Promise.allSettled over `reported`).
// ─────────────────────────────────────────────────────────────────────────────

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

/** Source with comments stripped — a comment ABOUT allSettled is not a call. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('OrgBriefingService — the org fan-out is BOUNDED', () => {
  const src = read('./org-briefing.service.ts')
  const body = code(src)

  it('imports the shared limiter and its frozen bound', () => {
    expect(body).toMatch(/import\s*\{[^}]*mapWithConcurrency[^}]*\}\s*from\s*'\.\.\/common\/concurrency\.js'/)
    expect(body).toMatch(/ORG_FANOUT_CONCURRENCY/)
  })

  it('fans out through mapWithConcurrency at the frozen bound', () => {
    expect(body).toMatch(/mapWithConcurrency\(\s*reported\s*,\s*ORG_FANOUT_CONCURRENCY\s*,/)
  })

  it('contains NO bare Promise.allSettled over the reported schools', () => {
    // The specific regression: any allSettled at all in this file is the old
    // unbounded shape coming back. There is no legitimate second use here.
    expect(body).not.toMatch(/Promise\.allSettled\s*\(/)
  })

  it('does not fall back to Promise.all over the schools either', () => {
    // Promise.all would be WORSE than what shipped: unbounded AND all-or-nothing.
    expect(body).not.toMatch(/Promise\.all\s*\(\s*reported/)
  })

  it('still indexes settled results against the input array — the order contract', () => {
    // mapWithConcurrency guarantees INPUT order; this line is what depends on it,
    // and it is why the retrofit is a one-line change rather than a rewrite.
    expect(body).toMatch(/settled\.forEach\(\s*\(res,\s*i\)\s*=>/)
    expect(body).toMatch(/const r = reported\[i\]/)
  })
})

describe('the org lens ceiling has exactly ONE definition', () => {
  const lens = code(read('./briefing-lens.ts'))
  const orgBriefing = code(read('./org-briefing.service.ts'))
  const portfolio = code(read('../portfolio/portfolio.service.ts'))

  it('briefing-lens.ts owns ORG_ROLE_RANK and widestOrgRole', () => {
    expect(lens).toMatch(/export const ORG_ROLE_RANK/)
    expect(lens).toMatch(/export function widestOrgRole/)
  })

  it('org-briefing.service.ts no longer declares its own copy', () => {
    expect(orgBriefing).not.toMatch(/const ORG_ROLE_RANK/)
    expect(orgBriefing).toMatch(/widestOrgRole\(/)
  })

  it('PortfolioService derives the ceiling from the SAME function', () => {
    // Two org surfaces disagreeing about what a caller may see is the failure
    // this move exists to prevent.
    expect(portfolio).toMatch(/widestOrgRole\(/)
    expect(portfolio).not.toMatch(/const ORG_ROLE_RANK/)
  })
})

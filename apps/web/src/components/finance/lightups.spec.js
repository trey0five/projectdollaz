/* global process */
// What the celebration is ALLOWED to say. Each case here is a claim that was
// wrong to make before the gate existed — the cash-flow statement in particular,
// which the intake's own copy promises only in exchange for the audited file.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveLightUps, revealSubtitle } from './lightUps.js'

const FY26 = { label: 'FY 2026', roles: { cy: true, py: false, audit: false } }
const key = (tiles) => tiles.map((t) => t.key)
const find = (tiles, k) => tiles.find((t) => t.key === k)

describe('resolveLightUps', () => {
  it('returns nothing without a saved period', () => {
    expect(resolveLightUps({ period: null })).toEqual([])
    expect(resolveLightUps()).toEqual([])
  })

  it('does NOT promise cash flows without the audited file', () => {
    const t = find(resolveLightUps({ period: FY26 }), 'statements')
    expect(t.fact).not.toMatch(/cash flow/i)
    expect(t.fact).toMatch(/FY 2026/)
  })

  it('promises all four statements once the audited file is in', () => {
    const period = { ...FY26, roles: { cy: true, py: false, audit: true } }
    const t = find(resolveLightUps({ period }), 'statements')
    expect(t.fact).toMatch(/four statements/i)
    expect(t.fact).toMatch(/cash flows/i)
  })

  it('omits comparatives with no prior year at all', () => {
    expect(key(resolveLightUps({ period: FY26 }))).not.toContain('comparatives')
  })

  it('offers comparatives from a Prior-Year FILE', () => {
    const period = { ...FY26, roles: { cy: true, py: true, audit: false } }
    expect(key(resolveLightUps({ period }))).toContain('comparatives')
  })

  it('offers comparatives from an earlier SAVED period, with its label', () => {
    const t = find(
      resolveLightUps({ period: FY26, priorPeriodLabel: 'FY 2025' }),
      'comparatives',
    )
    expect(t).toBeTruthy()
    expect(t.fact).toMatch(/FY 2025/)
  })

  it('invites a budget instead of claiming variance when none exists', () => {
    const t = find(resolveLightUps({ period: FY26, hasBudget: false }), 'budget')
    expect(t.title).toMatch(/set up/i)
    expect(t.fact).not.toMatch(/variance against/i)
  })

  it('claims variance only with a budget', () => {
    const t = find(resolveLightUps({ period: FY26, hasBudget: true }), 'budget')
    expect(t.title).toMatch(/vs\. actual/i)
    expect(t.fact).toMatch(/FY 2026 budget/)
  })

  it('hides readiness unless accreditation is licensed', () => {
    expect(key(resolveLightUps({ period: FY26 }))).not.toContain('readiness')
    expect(
      key(resolveLightUps({ period: FY26, accreditationLicensed: true })),
    ).toContain('readiness')
  })

  it('does not state a vitals count it was not given', () => {
    const t = find(resolveLightUps({ period: FY26, vitalsScored: 0 }), 'analytics')
    expect(t.fact).not.toMatch(/\d/)
    const t2 = find(resolveLightUps({ period: FY26, vitalsScored: 12 }), 'analytics')
    expect(t2.fact).toMatch(/12 vitals/)
  })

  it('singularises one vital', () => {
    const t = find(resolveLightUps({ period: FY26, vitalsScored: 1 }), 'analytics')
    expect(t.fact).toMatch(/1 vital scored/)
    expect(t.fact).not.toMatch(/1 vitals/)
  })

  it('sends every tile to a REAL route', () => {
    const routes = new Set([
      '/statements',
      '/analytics',
      '/budget',
      '/reports',
      '/accreditation',
    ])
    const tiles = resolveLightUps({
      period: { ...FY26, roles: { cy: true, py: true, audit: true } },
      accreditationLicensed: true,
      hasBudget: true,
    })
    expect(tiles.length).toBeGreaterThan(4)
    for (const t of tiles) expect(routes.has(t.to)).toBe(true)
  })

  it('never routes through /data — the redirect strips query strings', () => {
    const tiles = resolveLightUps({
      period: FY26,
      accreditationLicensed: true,
      priorPeriodLabel: 'FY 2025',
    })
    for (const t of tiles) expect(t.to.startsWith('/data')).toBe(false)
  })
})

describe('revealSubtitle', () => {
  it('names the account count when there is one', () => {
    expect(revealSubtitle({ schoolName: 'Sample High', period: FY26, accounts: 55 })).toBe(
      'Sample High — 55 accounts read from FY 2026.',
    )
  })
  it('drops the count rather than printing a zero', () => {
    const s = revealSubtitle({ schoolName: 'Sample High', period: FY26, accounts: 0 })
    expect(s).not.toMatch(/0 accounts/)
    expect(s).toMatch(/FY 2026 is saved/)
  })
  it('singularises one account', () => {
    expect(revealSubtitle({ period: FY26, accounts: 1 })).toMatch(/1 account read/)
  })
})

// The reveal is loud, so it is exactly the surface where a fabricated number
// would be most convincing. Pin the honesty rules at the source.
describe('LightUpReveal makes no claim of its own', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/components/finance/LightUpReveal.jsx'),
    'utf8',
  )

  it('takes its statement count from the audited role, not a constant 4', () => {
    expect(src).toMatch(/roles\?\.audit \? 4 : 3/)
  })

  it('counts only metrics the API marked available', () => {
    expect(src).toMatch(/vitals\.filter\(\(v\) => v\.available\)/)
  })

  it('suppresses the zero pips rather than printing "0"', () => {
    expect(src).toMatch(/accounts > 0 &&/)
    expect(src).toMatch(/scored\.length > 0 &&/)
  })
})

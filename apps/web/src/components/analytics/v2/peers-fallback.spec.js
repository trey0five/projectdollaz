/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// THE SINGLE-SCHOOL PEERS DEAD END IS A COMPARISON NOW (decided: sector-band
// fallback). What these pin is mostly HONESTY, because the feature is one
// framing mistake away from lying: a sector default rendered like a peer group
// would claim knowledge of other schools the product does not have.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')
const peers = read('components/analytics/v2/PeersView.jsx')
const shell = read('components/analytics/v2/AnalyticsV2.jsx')
const nav = read('components/analytics/v2/useAnalyticsNav.js')

describe('the fallback says what it is, everywhere', () => {
  it('the chip and the copy both refuse the word "peer" for the bands', () => {
    expect(peers).toMatch(/Sector default — not a peer group/)
    expect(peers).toMatch(/not your peers&apos; numbers/)
  })

  it('cost_per_pupil renders its bandlessness as a decision, not a gap', () => {
    expect(peers).toMatch(/No sector band — deliberately/)
  })

  it('the fallback renders ONLY for single_school with a benchmark payload', () => {
    expect(peers).toMatch(
      /const bands = single && Array\.isArray\(data\.benchmark\) && data\.benchmark\.length > 0/,
    )
  })

  it('reuses TargetBandBar — one band renderer, not a second drawing of the same axis', () => {
    expect(peers).toMatch(/import \{ TargetBandBar \} from '\.\.\/MetricDrawer\.jsx'/)
  })
})

describe('the tab reaches a single-school user without breaking the old clamp', () => {
  it('scopes: single-school WITH an org gets school+peers; org-less stays school-only', () => {
    expect(shell).toMatch(/\? \['school', 'peers'\]\s*\n\s*: \['school'\]/)
    // compare/org remain multi-school-only.
    expect(shell).toMatch(/isMultiSchool\s*\n?\s*\? \['school', 'compare', 'org', 'peers'\]/)
  })

  it('the nav clamp keeps every OTHER scope pinned to school for single-school', () => {
    // The invariant that had tests-by-convention: !isMultiSchool ⇒ 'school' —
    // now with exactly one carve-out, and only when allowed.
    const clamps = nav.match(/allowPeers && (?:scope|nextScope|next\.scope) === 'peers'/g) ?? []
    expect(clamps.length).toBe(3)
  })
})

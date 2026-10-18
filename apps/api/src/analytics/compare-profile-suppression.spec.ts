import { describe, expect, it } from 'vitest'
import { diversityIndex, toShares } from '@finrep/analytics'
import { OrgMetricsService, buildCompareProfile } from './org-metrics.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// ORG COMPARE (GET /organizations/:orgId/metrics/by-school) — any org member.
//
// Review finding: profile.demographicMix was raw toShares() beside
// profile.enrollment, so share × enrollment gave every small cell straight back
// (St. Aurelia's snapshot: MENA 3 of 204 → 0.0147 × 204 = 3). The plain
// diversity index beside them was a second equation on the hidden cells. The
// profile now makes the same partition decision as the analytics card and KYRO.
// ─────────────────────────────────────────────────────────────────────────────
const RAW = { county: 'C', district: 'D', schoolType: 'Catholic', gradeLow: '9', gradeHigh: '12' }
const RACE = { white: 120, hispanic: 52, black: 22, asian: 7, mena: 3 }
const ENROLLMENT = 204

function profile() {
  return buildCompareProfile(RAW, ENROLLMENT, {
    byDemographics: { race: RACE, gender: { female: 104, male: 100 }, ethnicity: { hispanic: 52, not_hispanic: 152 } },
  })
}

describe('org compare profile — demographic mix is small-cell suppressed', () => {
  it('a small cell has no share, so share × enrollment cannot rebuild it', () => {
    const race = profile().demographicMix.race
    expect(race.mena).toBeUndefined()
    for (const share of Object.values(race)) {
      expect(Math.round(share * ENROLLMENT)).not.toBe(3)
    }
  })

  it('the complement attack fails: total − visible leaves a SUM of ≥ 2 hidden cells', () => {
    const race = profile().demographicMix.race
    const hidden = Object.keys(RACE).filter((k) => !(k in race))
    expect(hidden.length).toBeGreaterThanOrEqual(2)
    const total = Object.values(RACE).reduce((a, b) => a + b, 0)
    const visibleSum = Object.values(race).reduce((s, p) => s + p * total, 0)
    // What a reader can derive is the hidden SUM, which is not the small cell.
    expect(Math.round(total - visibleSum)).not.toBe(RACE.mena)
    expect(Math.round(total - visibleSum)).toBeGreaterThanOrEqual(5)
  })

  it('the diversity index is pooled over the hidden cells, not the plain index', () => {
    const p = profile()
    expect(p.diversityIndex).not.toBeCloseTo(diversityIndex(RACE), 6)
    expect(p.diversityIndex).toBeGreaterThan(0)
    expect(p.diversityIndex).toBeLessThan(1)
  })

  it('a dimension with no small cell is unchanged', () => {
    const p = profile()
    expect(p.demographicMix.gender).toEqual(toShares({ female: 104, male: 100 }))
    expect(p.demographicMix.ethnicity).toEqual(toShares({ hispanic: 52, not_hispanic: 152 }))
  })

  it('no snapshot → empty mix and a null index, as before', () => {
    const p = buildCompareProfile(RAW, null)
    expect(p.demographicMix).toEqual({ gender: {}, ethnicity: {}, race: {} })
    expect(p.diversityIndex).toBeNull()
  })
})

// Privacy review round 6 — ONE POPULATION. For the current school year a school
// with a roster is profiled from its Student rows (the population every other
// demographic surface counts), not from a snapshot a few students apart.
describe('org compare profile — the current year counts the roster', () => {
  const svcWith = (rows: unknown[]) =>
    new OrgMetricsService(
      { student: { findMany: async () => rows } } as never,
      {} as never,
      {} as never,
    ) as unknown as { rosterMixFor: (id: string) => Promise<unknown> }

  it('★ enrolled students only, the same rollup /enrollment/demographics uses', async () => {
    const mix = await svcWith([
      { status: 'enrolled', grade: 'K', gender: 'female', race: 'white', ethnicity: 'nonHispanic' },
      { status: 'enrolled', grade: 'K', gender: 'male', race: 'asian', ethnicity: null },
      { status: 'withdrawn', grade: '1', gender: 'male', race: 'black', ethnicity: null },
    ]).rosterMixFor('s1')
    expect(mix).toEqual({
      byGrade: { K: 2 },
      byDemographics: {
        gender: { female: 1, male: 1 },
        race: { white: 1, asian: 1 },
        ethnicity: { nonHispanic: 1 },
      },
    })
  })

  it('no Student rows ⇒ null (the snapshot answers)', async () => {
    expect(await svcWith([]).rosterMixFor('s1')).toBeNull()
  })
})

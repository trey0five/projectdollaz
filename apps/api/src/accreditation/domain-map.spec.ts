import { describe, expect, it } from 'vitest'
import { assuranceIdsFrom, buildDomainMap, readCatalogDomainRows } from './domain-map.js'

// ─────────────────────────────────────────────────────────────────────────────
// The catalog-rows → domain-map translation. Small surface, high blast radius:
// it is the ONE place where "this school's standard belongs to that domain" is
// decided for readiness, snapshots and the signal panel alike.
// ─────────────────────────────────────────────────────────────────────────────

const std = (id: string, catalogStandardId: string | null) => ({ id, catalogStandardId })

describe('assuranceIdsFrom', () => {
  it('picks out ONLY rows explicitly flagged, never a missing/null flag', () => {
    const ids = assuranceIdsFrom([
      { id: 'a', isAssurance: true },
      { id: 'b', isAssurance: false },
      { id: 'c', isAssurance: null },
      { id: 'd' },
    ])
    expect([...ids]).toEqual(['a'])
  })
})

describe('buildDomainMap', () => {
  it('resolves the lead key, the fractional split, and the signal binding', () => {
    const res = buildDomainMap(
      [std('s1', 'c1'), std('s2', 'c2')],
      [
        { id: 'c1', domainKey: 'finance', domainWeights: null, signalKeys: ['operating_margin'] },
        {
          id: 'c2',
          domainKey: 'finance',
          domainWeights: { finance: 0.5, facilities: 0.25, hr: 0.25 },
          signalKeys: [],
        },
      ],
    )
    expect(res.map).toEqual({
      s1: { finance: 1 },
      s2: { finance: 0.5, facilities: 0.25, hr: 0.25 },
    })
    // Keyed by the SCHOOL standard id (not the catalog id) — the signal panel
    // hands these straight to a client that only knows its own rows.
    expect(res.signalKeys).toEqual({ s1: ['operating_margin'] })
    expect(res.unmappedLeafCount).toBe(0)
  })

  it('counts an unmapped standard instead of guessing a domain for it', () => {
    const res = buildDomainMap(
      [std('s1', 'c1'), std('s2', null), std('s3', 'missing')],
      [{ id: 'c1', domainKey: null, domainWeights: null, signalKeys: [] }],
    )
    // A catalog row with no domain, a hand-made row, and a dangling link: all
    // three are unmapped, none is invented into a domain.
    expect(res.map).toEqual({})
    expect(res.unmappedLeafCount).toBe(3)
    expect(res.signalKeys).toEqual({})
  })

  it('never mutates the caller’s catalog rows', () => {
    const rows = [{ id: 'c1', domainKey: 'hr', domainWeights: null, signalKeys: ['total_staff_fte'] }]
    const before = JSON.stringify(rows)
    const res = buildDomainMap([std('s1', 'c1')], rows)
    res.signalKeys.s1.push('mutated')
    expect(JSON.stringify(rows)).toBe(before)
  })
})

describe('readCatalogDomainRows — an image that starts before the migration', () => {
  const WIDE = [{ id: 'c1', isAssurance: true, domainKey: 'finance', domainWeights: null, signalKeys: ['operating_margin'] }]

  it('returns the wide read untouched when the columns exist', async () => {
    const rows = await readCatalogDomainRows(
      async () => WIDE,
      async () => {
        throw new Error('narrow read must not run')
      },
    )
    expect(rows).toEqual(WIDE)
  })

  it('degrades a MISSING COLUMN to the assurance-only read, keeping the register alive', async () => {
    // The whole point: the STANDARDS REGISTER predates this phase and must not
    // 500 because a rolling deploy put the image ahead of the migration.
    for (const err of [
      Object.assign(new Error('column does not exist'), { code: 'P2022' }),
      Object.assign(new Error('…code: "42703"…'), { code: undefined }),
    ]) {
      const rows = await readCatalogDomainRows(
        async () => {
          throw err
        },
        async () => [{ id: 'c1', isAssurance: true }],
      )
      // Assurance still resolves; the domain map is honestly empty until the
      // migration lands, so the grid reports ten uncovered domains, not a guess.
      expect(rows).toEqual([
        { id: 'c1', isAssurance: true, domainKey: null, domainWeights: null, signalKeys: [] },
      ])
      expect(assuranceIdsFrom(rows).has('c1')).toBe(true)
    }
  })

  it('RETHROWS anything that is not a missing column — a real failure is not masked', async () => {
    await expect(
      readCatalogDomainRows(
        async () => {
          throw Object.assign(new Error('connection terminated'), { code: 'P1017' })
        },
        async () => [{ id: 'c1', isAssurance: false }],
      ),
    ).rejects.toThrow('connection terminated')
  })
})

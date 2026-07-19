import { describe, expect, it } from 'vitest'
import {
  MATCH,
  matchSchoolName,
  normalizeSchoolName,
  scoreNameMatch,
  type MatchCandidate,
} from '../src/index.js'

describe('normalizeSchoolName', () => {
  it('strips diacritics, punctuation and generic tokens', () => {
    const { normalized, tokens } = normalizeSchoolName('St. José Catholic School')
    // saint→st (dropped), catholic/school dropped, diacritic stripped.
    expect(tokens).toContain('jose')
    expect(normalized).toBe('jose')
  })

  it('expands & → and and saint → st', () => {
    expect(normalizeSchoolName('Saints Peter & Paul').tokens.sort()).toEqual(['paul', 'peter', 'saints'])
  })

  it('sorts residual tokens so word order does not matter', () => {
    expect(normalizeSchoolName('Sacred Heart School').normalized).toBe(
      normalizeSchoolName('School of the Sacred Heart').normalized,
    )
  })

  it('canonicalizes PreK variants to a single distinctive pk token', () => {
    for (const v of ['Pre-K', 'PreK', 'PK', 'Pre K', 'Prekindergarten']) {
      expect(normalizeSchoolName(`Annunciation ${v}`).tokens).toContain('pk')
    }
  })
})

describe('scoreNameMatch — the Annunciation trap [LOCKED must-pass]', () => {
  it('caps Academy vs Pre-K at ≤0.60 with distinctiveConflict', () => {
    const s = scoreNameMatch('Annunciation Catholic Academy', 'Annunciation Pre-K')
    expect(s.signals.distinctiveConflict).toBe(true)
    expect(s.score).toBeLessThanOrEqual(0.6)
  })
})

describe('scoreNameMatch — expected similarities', () => {
  it('exact normalized ("St. Rose of Lima Catholic School" vs "St Rose of Lima") ~1.0', () => {
    const s = scoreNameMatch('St. Rose of Lima Catholic School', 'St Rose of Lima')
    expect(s.signals.exact).toBe(true)
    expect(s.score).toBe(1)
  })

  it('generic-token stripping ("The Academy of Holy Names" ↔ "Holy Names Academy")', () => {
    const s = scoreNameMatch('The Academy of Holy Names', 'Holy Names Academy')
    expect(s.score).toBe(1)
  })

  it('token reorder ("Sacred Heart School" vs "School of the Sacred Heart") is high', () => {
    const s = scoreNameMatch('Sacred Heart School', 'School of the Sacred Heart')
    expect(s.score).toBe(1)
  })

  it('typo ("Guardian Angles" → "Guardian Angels") is at least review-worthy', () => {
    const s = scoreNameMatch('Guardian Angles', 'Guardian Angels')
    expect(s.score).toBeGreaterThanOrEqual(MATCH.REVIEW)
  })
})

describe('matchSchoolName — tiers', () => {
  const schools: MatchCandidate[] = [
    { schoolId: 'aca', name: 'Annunciation Catholic Academy' },
    { schoolId: 'prek', name: 'Annunciation Pre-K' },
    { schoolId: 'rose', name: 'St Rose of Lima' },
    { schoolId: 'mary-1', name: 'St Mary School' },
    { schoolId: 'mary-2', name: 'St Mary Parish' },
  ]

  it('the two Annunciation schools each win their OWN exact row, never mis-route', () => {
    const aca = matchSchoolName('Annunciation Catholic Academy', schools)
    expect(aca.best?.schoolId).toBe('aca')
    expect(['exact', 'high']).toContain(aca.tier)

    const prek = matchSchoolName('Annunciation Pre-K', schools)
    expect(prek.best?.schoolId).toBe('prek')
    expect(['exact', 'high']).toContain(prek.tier)
  })

  it('an Annunciation source with NO exact twin never auto-applies onto the other', () => {
    const onlyAcademy: MatchCandidate[] = [{ schoolId: 'aca', name: 'Annunciation Catholic Academy' }]
    const r = matchSchoolName('Annunciation Pre-K', onlyAcademy)
    expect(r.tier).not.toBe('high')
    expect(r.tier).not.toBe('exact')
    expect(['review', 'none']).toContain(r.tier)
  })

  it('exact normalized → tier exact, confidence ~1.0', () => {
    const r = matchSchoolName('St. Rose of Lima Catholic School', schools)
    expect(r.best?.schoolId).toBe('rose')
    expect(r.tier).toBe('exact')
    expect(r.best?.confidence).toBe(1)
  })

  it('thin-margin ambiguity (two St Mary schools) → review, both ranked', () => {
    const r = matchSchoolName('St Mary', schools)
    expect(r.tier).toBe('review')
    const ids = r.ranked.slice(0, 2).map((c) => c.schoolId).sort()
    expect(ids).toEqual(['mary-1', 'mary-2'])
  })

  it('alias short-circuit → tier alias, confidence 1.0, bypasses fuzzy', () => {
    const r = matchSchoolName('The Annunciation School', schools, {
      schoolId: 'aca',
      name: 'Annunciation Catholic Academy',
    })
    expect(r.tier).toBe('alias')
    expect(r.best).toEqual({
      schoolId: 'aca',
      name: 'Annunciation Catholic Academy',
      confidence: 1,
      viaAlias: true,
    })
  })

  it('unmatched (< REVIEW) → none, best null', () => {
    const r = matchSchoolName('Completely Different Name', [{ schoolId: 'rose', name: 'St Rose of Lima' }])
    expect(r.tier).toBe('none')
    expect(r.best).toBeNull()
  })
})

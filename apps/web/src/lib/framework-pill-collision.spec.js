// ─────────────────────────────────────────────────────────────────────────────
// THE PILL COLLISION FIX (WS2).
//
// frameworkPillLabel strips the trailing edition year — right for the ordinary
// case (a switcher chooses an ACCREDITOR, not a revision) and wrong for exactly
// one: a school holding BOTH Cognia editions mid-upgrade would read two
// identical COGNIA pills naming two different registers. frameworkPillLabels
// brings the year back ONLY on collision. These tests pin both halves: the
// disambiguation when it must happen, and the untouched plain label everywhere
// else — a fix that year-suffixed every framework would spend pill width on the
// half that is the same for both, which is the original function's whole point.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { frameworkPillLabel, frameworkPillLabels } from './frameworkLabels.js'

const C22 = { id: 'fw-c22', code: 'cognia_2022' }
const C25 = { id: 'fw-c25', code: 'cognia_2025' }
const MSA = { id: 'fw-msa', code: 'msa_cess_2022' }
const FCIS = { id: 'fw-fcis', code: 'fcis_2023' }

describe('collision-only disambiguation', () => {
  it('both Cognia editions in one set → the year comes back on BOTH', () => {
    const m = frameworkPillLabels([C22, C25, MSA])
    expect(m.get('fw-c22')).toBe('COGNIA 2022')
    expect(m.get('fw-c25')).toBe('COGNIA 2025')
  })

  it('a single Cognia still renders the plain accreditor pill', () => {
    const m = frameworkPillLabels([C22, MSA])
    expect(m.get('fw-c22')).toBe('COGNIA')
  })

  it('non-colliding frameworks are untouched even when a collision exists elsewhere', () => {
    const m = frameworkPillLabels([C22, C25, MSA, FCIS])
    expect(m.get('fw-msa')).toBe('MSA CESS')
    expect(m.get('fw-fcis')).toBe('FCIS')
  })

  it('agrees with frameworkPillLabel for every non-colliding entry', () => {
    const m = frameworkPillLabels([MSA, FCIS])
    expect(m.get('fw-msa')).toBe(frameworkPillLabel(MSA))
    expect(m.get('fw-fcis')).toBe(frameworkPillLabel(FCIS))
  })

  it('a colliding code with NO trailing year keeps the bare label — nothing invented', () => {
    // Two rows collapsing to one label where neither code carries a year: there
    // is no honest suffix to append, so none is.
    const A = { id: 'a', code: 'acs_wasc' }
    const B = { id: 'b', code: 'acs_wasc' } // pathological duplicate
    const m = frameworkPillLabels([A, B])
    expect(m.get('a')).toBe('ACS WASC')
    expect(m.get('b')).toBe('ACS WASC')
  })

  it('survives null / empty input', () => {
    expect(frameworkPillLabels(null).size).toBe(0)
    expect(frameworkPillLabels([]).size).toBe(0)
  })
})

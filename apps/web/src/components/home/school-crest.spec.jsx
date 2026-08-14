import { describe, it, expect } from 'vitest'
import { monogramOf } from './SchoolCrest.jsx'

/**
 * Most schools have never uploaded a logo, so the monogram IS the mark for
 * nearly every row in a diocese. It has one job: tell two schools apart at a
 * glance. That fails in two specific ways, and both are tested here.
 */
describe('school monogram', () => {
  it('drops the words every school in a diocese shares', () => {
    // STACS would be the naive answer, and "Catholic School" distinguishes
    // nothing when half the network carries it.
    expect(monogramOf('St Thomas Aquinas Catholic School')).toBe('STA')
    expect(monogramOf('Our Lady of Perpetual Help Academy')).toBe('OLP')
    expect(monogramOf('Msgr Edward Pace High School')).toBe('MEP')
  })

  it('splits hyphenated names, which a space split treats as one word', () => {
    // The bug this was written for: a lone "C" for a school whose two halves
    // are the whole of what identifies it.
    expect(monogramOf('Chaminade-Madonna College Prep')).toBe('CM')
  })

  it('does not split on an apostrophe — O’Brien is one name', () => {
    expect(monogramOf("O'Brien Catholic School")).toBe('O')
  })

  it('caps at three letters, so the tile never overflows', () => {
    expect(monogramOf('Archbishop Curley Notre Dame Jesuit Preparatory')).toBe('ACN')
  })

  it('falls back to the generic words rather than rendering nothing', () => {
    // A name made ENTIRELY of noise words still has to produce a mark.
    expect(monogramOf('High School')).toBe('HS')
    expect(monogramOf('The Academy')).toBe('TA')
  })

  it('survives an empty or missing name without throwing', () => {
    expect(monogramOf('')).toBe('·')
    expect(monogramOf(null)).toBe('·')
    expect(monogramOf(undefined)).toBe('·')
  })

  it('ignores punctuation and extra whitespace', () => {
    expect(monogramOf('  St.  Brendan   Parish  School ')).toBe('SB')
  })
})

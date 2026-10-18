import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import EnrollmentHero from './EnrollmentHero.jsx'
import { EnrollmentSupportNeedsCard } from './EnrollmentMixCards.jsx'
import { cellTitle, cellToken, isComplementary } from './enrollmentAnalyticsKit.jsx'
import { formatMinCell, isComplementaryCell } from '../../lib/demographicVocab.js'
import { facetsFromAggregate } from './studentFilters.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// The support-flag complement leak (demo pre-production, scenes e1 + e6). The
// SERVER now withholds "Any support flag" (and the "Support flags" KPI) whenever
// one flag is under the floor, marking it `reason: 'complementary'`. The web's
// job is to tell the truth about that: a complementary figure is NOT small, so it
// prints "withheld" — never "<5" over 25 students — and the small flag keeps its
// honest "<5".
// ─────────────────────────────────────────────────────────────────────────────
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
afterEach(cleanup)

const SMALL = { value: null, suppressed: true }
const COMP = { value: null, suppressed: true, reason: 'complementary' }

describe('the cell vocabulary', () => {
  it('small → "<5"; complementary → "withheld" with its own reason; a figure stays a figure', () => {
    expect(cellToken(SMALL)).toBe('<5')
    expect(cellToken(COMP)).toBe('withheld')
    expect(isComplementary(COMP)).toBe(true)
    expect(isComplementary(SMALL)).toBe(false)
    expect(cellTitle(COMP)).toMatch(/worked out by subtraction/)
    expect(cellTitle(COMP)).not.toMatch(/fewer than 5 students, who/)
    expect(cellToken({ value: 25, suppressed: false })).toBe('25')
    // The register-route marker shape (no value key at all).
    expect(formatMinCell({ suppressed: true })).toBe('<5')
    expect(formatMinCell({ suppressed: true, reason: 'complementary' })).toBe('withheld')
    expect(isComplementaryCell({ suppressed: true, reason: 'complementary' })).toBe(true)
    expect(formatMinCell(14)).toBe('14')
  })
})

describe('e6 — the support-needs card with the on-camera counts', () => {
  const mix = {
    status: { enrolled: 204, waitlist: 6, withdrawn: 5, graduated: 18 },
    flags: { iep: { value: 14, suppressed: false }, plan504: SMALL, ell: { value: 9, suppressed: false }, any: COMP },
    datedCoverage: { withStartDate: 204, total: 204, complete: true },
    newThisYear: { value: 23, suppressed: false },
  }

  it('prints 14 and 9, "<5" for the 504, and "withheld" — not 25, not "<5" — for Any support flag', () => {
    const { container } = render(<EnrollmentSupportNeedsCard mix={mix} />)
    const text = container.textContent
    expect(text).toContain('fewer than 5 — withheld') // the 504's honest note
    expect(text).toContain('withheld so a small group can’t be worked out')
    expect(text).not.toMatch(/\b25\b/)
    const stats = [...container.querySelectorAll('[title], .stat, div')].map((n) => n.textContent)
    expect(stats.some((t) => /Any support flag\s*withheld/.test(t))).toBe(true)
    expect(stats.some((t) => /Any support flag\s*<5/.test(t))).toBe(false)
  })

  it('unsuppressed counts are unchanged', () => {
    const clean = {
      ...mix,
      flags: {
        iep: { value: 14, suppressed: false },
        plan504: { value: 6, suppressed: false },
        ell: { value: 9, suppressed: false },
        any: { value: 27, suppressed: false },
      },
    }
    const { container } = render(<EnrollmentSupportNeedsCard mix={clean} />)
    expect(container.textContent).toMatch(/27/)
    expect(container.textContent).not.toMatch(/withheld so a small group/)
    expect(container.textContent).not.toContain('<5')
  })
})

describe('e6 — the register status pills print the SERVER’s decision (review round 4)', () => {
  it('a small status prints "<5", its companion "withheld", and the raw 2 appears nowhere', () => {
    const mix = {
      status: {
        enrolled: { value: 204, suppressed: false },
        waitlist: COMP,
        withdrawn: SMALL,
        graduated: { value: 18, suppressed: false },
      },
      flags: { iep: { value: 14, suppressed: false }, plan504: SMALL, ell: { value: 9, suppressed: false }, any: COMP },
      datedCoverage: { withStartDate: 204, total: 204, complete: true },
      newThisYear: { value: 23, suppressed: false },
    }
    const { container } = render(<EnrollmentSupportNeedsCard mix={mix} />)
    const pills = [...container.querySelectorAll('.pill')].map((n) => n.textContent)
    expect(pills).toContain('Withdrawn<5')
    expect(pills).toContain('Waitlistwithheld')
    expect(pills).toContain('Enrolled204')
    expect(container.textContent).not.toMatch(/Withdrawn\s*2\b/)
  })

  it('an older payload with bare numbers still renders them', () => {
    const { container } = render(
      <EnrollmentSupportNeedsCard
        mix={{
          status: { enrolled: 204, waitlist: 6, withdrawn: 5, graduated: 18 },
          flags: { iep: { value: 14, suppressed: false }, plan504: SMALL, ell: { value: 9, suppressed: false }, any: COMP },
          datedCoverage: { withStartDate: 204, total: 204, complete: true },
          newThisYear: { value: 23, suppressed: false },
        }}
      />,
    )
    expect([...container.querySelectorAll('.pill')].map((n) => n.textContent)).toContain('Withdrawn5')
  })
})

describe('the filter pickers read presence-only facets', () => {
  it('server `facets` become presence (no count); an older payload falls back to counts', () => {
    expect(facetsFromAggregate({ facets: { race: ['asian', 'mena'] }, counts: { race: { asian: 16 } } })).toEqual({
      race: { asian: true, mena: true },
    })
    expect(facetsFromAggregate({ counts: { grade: { K: 3 } } })).toEqual({ grade: { K: 3 } })
    expect(facetsFromAggregate(null)).toBeNull()
  })
})

describe('e1 — the overview "Support flags" chip', () => {
  const hero = (kpis) =>
    render(
      <MemoryRouter>
        <EnrollmentHero total={204} byGrade={{ K: 22, 1: 19, 2: 163 }} asOf="2026-10-17" kpis={kpis} withdrawn={5} />
      </MemoryRouter>,
    )

  it('a complementary flagged KPI reads "withheld" with its reason — never "<5"', () => {
    const { container } = hero({ waitlist: 6, newThisYear: 23, flagged: { suppressed: true, reason: 'complementary' } })
    const t = container.textContent
    expect(t).toMatch(/Support flags\s*withheld/)
    expect(t).toContain('Withheld to protect a small group')
    expect(t).not.toMatch(/Support flags\s*<5/)
  })

  it('a genuinely small flagged KPI still reads "<5"; a clean one prints its number', () => {
    expect(hero({ waitlist: 6, newThisYear: 23, flagged: { suppressed: true } }).container.textContent).toMatch(
      /Support flags\s*<5/,
    )
    cleanup()
    expect(hero({ waitlist: 6, newThisYear: 23, flagged: 22 }).container.textContent).toMatch(/Support flags\s*22/)
  })
})

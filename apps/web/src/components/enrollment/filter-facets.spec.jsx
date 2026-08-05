/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// "the roster didn't have ethnicity, but it did have grade and the filter isn't
// working for it."
//
// The filters were working. They were offering the wrong things, which from the
// user's side is the same experience and a worse one — a control that answers
// "nothing" to a reasonable question is indistinguishable from a broken control.
//
// Every picker rendered its ENTIRE vocabulary regardless of the data, so a 9–12
// high school was invited to filter by PK3 and Grade 3, and a roster imported
// from a OneRoster users.csv — which carries no demographics at all — offered
// fully populated Race, Gender and Ethnicity menus. Verified against the real
// register: grade {9,10,11,12}, and gender/race/ethnicity all {}.
//
// The API was never at fault: grade=12 returned 102 of 444 on the first try.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')
const bar = read('components/enrollment/studentFilters.jsx')
const register = read('components/enrollment/StudentRegister.jsx')
const analytics = read('components/enrollment/RosterAnalyticsSection.jsx')

describe('a picker offers only what the roster holds', () => {
  it('keeps a value only when its count is above zero', () => {
    expect(bar).toMatch(/return dim\.keys\.filter\(\(k\) => Number\(counts\[k\] \?\? 0\) > 0\)/)
  })

  it('shows the count next to each value', () => {
    // The count tells you the answer before you ask, so an empty result is never
    // a surprise — which is the whole failure being fixed.
    expect(bar).toMatch(/facets\?\.\[d\.key\]\?\.\[k\] != null \? ` \(\$\{facets\[d\.key\]\[k\]\}\)` : ''/)
  })

  it('disables a dimension the roster carries no data for, and says why', () => {
    expect(bar).toMatch(/const empty = facets != null && keys\.length === 0/)
    expect(bar).toMatch(/disabled=\{empty\}/)
    expect(bar).toMatch(/not in your roster data/)
  })
})

describe('NOT KNOWING is not the same as NOTHING', () => {
  it('null facets fall back to the full vocabulary', () => {
    // Rendering "unknown" as "empty" would disable every picker on a transient
    // network error — turning a blip into a product that looks broken.
    expect(bar).toMatch(/if \(!facets\) return dim\.keys/)
  })

  it('a facet fetch failure sets null, never an empty object', () => {
    expect(register).toMatch(/setFacets\(null\)/)
    expect(analytics).toMatch(/setFacets\(null\)/)
  })

  it('the disabled state requires facets to be KNOWN', () => {
    // `facets != null &&` is the half that keeps a loading bar from flashing
    // every dimension as "none".
    expect(bar).toMatch(/facets != null && keys\.length === 0/)
  })
})

describe('the vocabulary comes from an UNFILTERED read', () => {
  it('the register fetches facets without the active filters', () => {
    // Feeding the filtered aggregate to the bar would delete each option the
    // moment it was selected: narrowing to Grade 12 would leave Grade 12 as the
    // only grade on offer, with no way back to the others.
    expect(register).toMatch(/aggregate\(schoolId\)\s*\n\s*\.then\(\(res\) => \{\s*\n\s*if \(!cancelled\) setFacets/)
  })

  it('roster analytics keeps its FILTERED read for charts and an unfiltered one for the bar', () => {
    expect(analytics).toMatch(/\.aggregate\(schoolId, params\)/)
    expect(analytics).toMatch(/\.aggregate\(schoolId\)\s*\n\s*\.then\(\(res\) => \{\s*\n\s*if \(!cancelled\) setFacets/)
  })

  it('both surfaces actually pass facets to the bar', () => {
    expect(register).toMatch(/<StudentFilterBar[^>]*facets=\{facets\}/)
    expect(analytics).toMatch(/<StudentFilterBar[^>]*facets=\{facets\}/)
  })
})

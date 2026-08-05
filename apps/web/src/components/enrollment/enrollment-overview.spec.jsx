/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// THE ENROLLMENT OVERVIEW REDESIGN — what must not quietly un-happen.
//
// The pins here are the redesign's load-bearing decisions, each of which was a
// live defect before it: the module never re-hued (the ONLY page missing
// ModuleAccent), the grade distribution rendered three times in two colour
// systems, the flat trend line was three coincident same-day points on an
// index-spaced axis, and the API's source/provider/withdrawn fields were
// fetched and rendered nowhere.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')
const page = read('pages/EnrollmentPage.jsx')
const hero = read('components/enrollment/EnrollmentHero.jsx')
const section = read('components/enrollment/RosterAnalyticsSection.jsx')
const trend = read('components/enrollment/EnrollmentTrend.jsx')
const spark = read('components/analytics/charts/Sparkline.jsx')

describe('B0 — the module re-hues like every other module', () => {
  it('the v2 branch wraps ModuleAccent', () => {
    expect(page).toMatch(/<ModuleAccent moduleKey="enrollment">/)
    expect(page).toMatch(/<\/ModuleAccent>/)
  })

  it('no component hand-paints the hue any more — moduleHue is the authority', () => {
    for (const [name, src] of [
      ['hero', hero],
      ['section', section],
      ['trend', trend],
    ]) {
      expect(src, name).toMatch(/moduleHue\('enrollment'\)/)
      expect(src, name).not.toMatch(/ENROLL_HUE = '#0EA5E9'/)
    }
  })
})

describe('B1 — the hero ring: one grade, one colour, everywhere', () => {
  it('ring segments take their colour from demographicColor — the register pills’ own hues', () => {
    expect(hero).toMatch(/demographicColor\('grade', g\)/)
  })

  it('renders the source chip the API has carried since Phase 2', () => {
    expect(hero).toMatch(/Live from your roster/)
    expect(hero).toMatch(/PROVIDER_LABELS/)
  })

  it('no plan ⇒ the honest door, never a fabricated fraction', () => {
    expect(hero).toMatch(/No plan set —/)
    expect(hero).toMatch(/set one in Planning/)
    // The ring is composition, not progress: nothing computes total/planTotal
    // as an arc fraction.
    expect(hero).not.toMatch(/total\s*\/\s*(?:vsPlan|plan)\.planTotal/)
  })

  it('the absorbed KPI pips keep the old row’s honesty: no roster ⇒ em-dash + why', () => {
    expect(hero).toMatch(/needs the student roster/)
    // And a value only renders through CountUp when it exists.
    expect(hero).toMatch(/value == null \?/)
  })

  it('Withdrawn is rendered — counts.status finally has a reader', () => {
    expect(page).toMatch(/withdrawn=\{rosterMode \? \(agg\?\.counts\?\.status\?\.withdrawn \?\? null\) : null\}/)
  })
})

describe('B2 — one grade chart, not three', () => {
  it('the page no longer imports ByGradeChart or GradeMixCard', () => {
    expect(page).not.toMatch(/ByGradeChart/)
    expect(page).not.toMatch(/GradeMixCard/)
  })

  it('the analytics grade rows wear the same golden-angle hues', () => {
    expect(section).toMatch(/dimColor\('grade', GRADE_KEYS\)/)
  })

  it('every demographic dimension is coloured by CANONICAL position, not presence', () => {
    for (const dim of ['race', 'gender', 'ethnicity', 'ageBand']) {
      expect(section, dim).toMatch(new RegExp(`dimColor\\('${dim}'`))
    }
  })
})

describe('B4 — honest emptiness + intact masking', () => {
  it('an all-empty dimension collapses to one sentence, not a near-empty chart', () => {
    expect(section).toMatch(/Not in your roster data\./)
  })

  it('the <5 masking pipeline is untouched', () => {
    expect(section).toMatch(/formatted: formatMinCell\(n\)/)
    // Masked rows still drop the share gutter so the pair can't be re-derived.
    expect(section).toMatch(/share: !masked && total > 0/)
    expect(section).toMatch(/Aggregate counts only — cells under 5 show as &lt;5\./)
  })
})

describe('B6 — the trend is honest about time', () => {
  it('dedupes to the LATEST reading per day — the flat line’s actual cause', () => {
    expect(trend).toMatch(/if \(!byDay\.has\(day\)/)
  })

  it('X is date-scaled, not index-spaced', () => {
    expect(trend).toMatch(/\(t - t0\) \/ Math\.max\(1, t1 - t0\)/)
  })

  it('one distinct day is a sentence, not a chart', () => {
    expect(trend).toMatch(/The trend starts with your next change\./)
  })

  it('the plan line renders only when a plan exists, and is labelled', () => {
    expect(trend).toMatch(/planTotal != null \?/)
    expect(trend).toMatch(/plan \{planTotal\.toLocaleString/)
  })

  it('Sparkline’s zero-span series centres for every caller — never the bottom edge', () => {
    expect(spark).toMatch(/flat \? h \/ 2 :/)
  })
})

describe('the vs-plan tiles earn their space', () => {
  it('VsPlanKpi renders only when a plan exists (the hero carries the no-plan door)', () => {
    const matches = page.match(/summary\?\.vsPlan \? <VsPlanKpi summary=\{summary\} \/> : null/g) ?? []
    expect(matches.length).toBe(2)
  })
})

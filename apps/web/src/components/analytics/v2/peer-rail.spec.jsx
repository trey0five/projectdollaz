/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// THE PEER VIEW SAYS ONLY WHAT IS TRUE, AND SHOWS IT ON A SCALE.
//
// Before: each metric was two unlabelled rows — a name, a hairline, a dot, a
// number — with "you 88 · 100th pctile" above them. The picture carried no
// information (a dot's position means nothing without a domain) and the words
// carried a false one: at one peer the percentile can only be 1 or 0, so "100th
// pctile" meant "you won" and "Top quartile on days cash on hand" was a
// statistical claim about a group of two. Meanwhile "Months of Operating
// Reserve: you −0.5" never mentioned that −0.5 is alarming.
//
// The caption logic is pure, so most of this is behavioural rather than
// source-pinned.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { peerCaption, bandVerdict } from './peerCaption.js'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')

const DCOH_BANDS = { good: 60, risk: 30, goodDirection: 'higher' }
const pt = (id, name, value, formatted, isFocus = false) => ({ id, name, value, formatted, isFocus })

// The screenshot's actual numbers.
const FOCUS = pt('f', 'South Plantation High School', 88, '88', true)
const PEER = pt('p', 'North Miami Beach Sr High', 63, '63')

const headToHead = (over = {}) => ({
  rank: 1,
  count: 2,
  percentile: null, // withheld at 1 peer
  median: 75.5,
  medianFormatted: '76',
  focusValue: 88,
  goodDirection: 'higher',
  ...over,
})

describe('one peer is a comparison, not a distribution', () => {
  it('names the GAP and the school, never a percentile', () => {
    const c = peerCaption({
      stat: headToHead(),
      points: [FOCUS, PEER],
      metricKey: 'days_cash_on_hand',
      unit: 'days',
      bands: DCOH_BANDS,
    })
    expect(c).toContain('25 ahead of North Miami Beach Sr High')
    expect(c).not.toMatch(/percentile|pctile|quartile/i)
  })

  it('says "behind" when the school is behind, direction-aware', () => {
    const c = peerCaption({
      stat: headToHead({ rank: 2, focusValue: 40 }),
      points: [pt('f', 'Us', 40, '40', true), PEER],
      metricKey: 'days_cash_on_hand',
      unit: 'days',
      bands: DCOH_BANDS,
    })
    expect(c).toContain('23 behind North Miami Beach Sr High')
  })

  it('…and inverts for a lower-is-better metric', () => {
    // Cost per pupil: spending LESS is ahead. A naive "focus > peer ⇒ ahead"
    // would congratulate a school for costing more.
    const c = peerCaption({
      stat: headToHead({ goodDirection: 'lower', focusValue: 15000 }),
      points: [pt('f', 'Us', 15000, '$15,000', true), pt('p', 'Them', 19172, '$19,172')],
      metricKey: 'cost_per_pupil',
      unit: 'currency',
      bands: null,
    })
    expect(c).toMatch(/ahead of Them/)
  })

  it('handles a dead heat without claiming an edge', () => {
    const c = peerCaption({
      stat: headToHead({ focusValue: 63 }),
      points: [pt('f', 'Us', 63, '63', true), PEER],
      metricKey: 'days_cash_on_hand',
      unit: 'days',
      bands: DCOH_BANDS,
    })
    expect(c).toContain('Level with North Miami Beach Sr High')
  })
})

describe('the caption says whether the number is any GOOD', () => {
  it('a healthy value is called healthy', () => {
    const c = peerCaption({
      stat: headToHead(),
      points: [FOCUS, PEER],
      metricKey: 'days_cash_on_hand',
      unit: 'days',
      bands: DCOH_BANDS,
    })
    expect(c).toContain('inside the healthy range')
  })

  it('WINNING AND FAILING AT ONCE is stated plainly', () => {
    // The screenshot's worst case: −0.5 months of operating reserve beat the
    // peer's 0.3 on one metric and the view called it 0th percentile. Beating
    // somebody is not the same as being solvent, and both halves must be said.
    const c = peerCaption({
      stat: headToHead({ focusValue: 0.4, rank: 1 }),
      points: [pt('f', 'Us', 0.4, '0.4', true), pt('p', 'Them', -0.5, '-0.5')],
      metricKey: 'months_operating_reserve',
      unit: 'months',
      bands: { good: 3, risk: 1, goodDirection: 'higher' },
    })
    expect(c).toMatch(/ahead of Them/)
    expect(c).toContain('well below the healthy range')
  })

  it('a metric with NO agreed band gets no verdict invented', () => {
    // Cost per pupil deliberately has no sector band — spending follows mission.
    expect(bandVerdict(19172, null)).toBeNull()
    const c = peerCaption({
      stat: headToHead({ goodDirection: 'lower' }),
      points: [pt('f', 'Us', 15000, '$15,000', true), pt('p', 'Them', 19172, '$19,172')],
      metricKey: 'cost_per_pupil',
      unit: 'currency',
      bands: null,
    })
    expect(c).not.toMatch(/healthy range/)
  })
})

describe('a real group gets rank, and eventually a percentile', () => {
  const many = [
    FOCUS,
    pt('a', 'Alpha', 63, '63'),
    pt('b', 'Bravo', 40, '40'),
    pt('c', 'Charlie', 20, '20'),
  ]

  it('reports rank and median, still no percentile at three peers', () => {
    const c = peerCaption({
      stat: headToHead({ rank: 1, count: 4, percentile: null }),
      points: many,
      metricKey: 'days_cash_on_hand',
      unit: 'days',
      bands: DCOH_BANDS,
    })
    expect(c).toContain('1st of 4')
    expect(c).toContain('median 76')
    expect(c).not.toMatch(/percentile/i)
  })

  it('adds the percentile once the server is willing to supply one', () => {
    const c = peerCaption({
      stat: headToHead({ rank: 1, count: 5, percentile: 1 }),
      points: many,
      metricKey: 'days_cash_on_hand',
      unit: 'days',
      bands: DCOH_BANDS,
    })
    expect(c).toContain('100th percentile')
  })
})

describe('a metric you have not reported', () => {
  it('says so, instead of ranking you bottom of the group', () => {
    // Was "Cost per Pupil: you — · 0th pctile".
    const c = peerCaption({
      stat: headToHead({ focusValue: null, percentile: null }),
      points: [pt('p', 'North Miami Beach Sr High', 19172, '$19,172')],
      metricKey: 'cost_per_pupil',
      unit: 'currency',
      bands: null,
    })
    expect(c).toContain('You haven’t reported this yet')
    expect(c).toContain('$19,172')
    expect(c).not.toMatch(/percentile|pctile|0th/i)
  })
})

describe('the invisible-class trap', () => {
  // tailwind.config.js maps `sky` to a FLAT rgb(var(--c-sky)) string, which
  // REPLACES Tailwind's entire sky scale. Every `sky-<number>` utility therefore
  // compiles to nothing at all — no error, no warning, just an element with no
  // styling. That is exactly how the peer hero's explanatory chip came to render
  // as dark text on a navy band: present in the DOM, unreadable on screen.
  //
  // Scoped to the analytics tree — the same dead classes exist elsewhere in the
  // app and are reported separately rather than silently swept into this file.
  const SKY_N = new RegExp(['sky', '-', '\\d'].join(''))

  it('no analytics file styles anything with a sky-<number> utility', () => {
    const files = [
      'components/analytics/v2/PeersView.jsx',
      'components/analytics/v2/ChartsView.jsx',
      'components/analytics/v2/OverviewView.jsx',
      'components/analytics/charts/HealthRail.jsx',
    ]
    const offenders = []
    for (const f of files) {
      // Strip comments: the note explaining the ban must not be its first breach.
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      if (SKY_N.test(src)) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })
})

describe('an unavailable metric is not a zero', () => {
  it('metricPoints drops a value the school could not compute', () => {
    // Live-caught: cost per pupil arrives available:false with value 0 when a
    // school has no enrolment on file, and the rail plotted a dot at $0 —
    // a school shown as educating children for nothing.
    const view = read('components/analytics/v2/PeersView.jsx')
    expect(view).toMatch(/m\.available !== false/)
    expect(view).toMatch(/function pointValue/)
  })
})

describe('the rail draws a scale, not a bare dot', () => {
  const rail = read('components/analytics/charts/HealthRail.jsx')

  it('anchors the scale on this school and its healthy band', () => {
    // A school far below the risk threshold has to be visible on the same rail
    // as the band it is failing, so both are anchors of the domain.
    expect(rail).toMatch(/if \(bands\?\.good != null\) bandVals\.push\(bands\.good\)/)
    expect(rail).toMatch(/if \(bands\?\.risk != null\) bandVals\.push\(bands\.risk\)/)
    expect(rail).toMatch(/const scale = \[\.\.\.\(keep\.length \? keep : all\), \.\.\.bandVals\]/)
  })

  it('does NOT assume the domain starts at zero', () => {
    // Months of operating reserve goes negative; a rail clamped at 0 would put
    // a real deficit at the left edge and call that the floor.
    expect(rail).not.toMatch(/Math\.max\(0, *Math\.min\(/)
    expect(rail).toMatch(/const rawLo = Math\.min\(\.\.\.scale\)/)
  })

  it('ONE ABSURD SCHOOL cannot flatten the chart', () => {
    // Live-caught: a school whose expenses parsed near zero reported 14,108
    // MONTHS of operating reserve. The rail stretched to fit it, and this
    // school's 0.3 — plus the entire healthy band — collapsed into the first
    // pixel. The reader learned nothing, from a chart that looked fine.
    expect(rail).toMatch(/const OUTLIER_RATIO = \d+/)
    expect(rail).toMatch(/Math\.abs\(v\) > ref \* OUTLIER_RATIO/)
  })

  it('…but EXCELLENT is not absurd — a strong value stays on the scale', () => {
    // The first cut measured against the BAND width and threw a 19.2% operating
    // margin off the rail, because that band is 0–3% wide. The test is relative
    // to the other schools, not to the band.
    expect(rail).toMatch(/const others = \[\.\.\.all\.filter\(\(o\) => o !== v\), \.\.\.bandVals\]\.map\(Math\.abs\)/)
  })

  it('…and the outlier is SAID, not silently dropped', () => {
    // Clipping a school off the chart with no trace would be its own small lie.
    expect(rail).toMatch(/const off = p\.value < lo \|\| p\.value > hi/)
    expect(rail).toMatch(/\$\{p\.formatted\} ›/)
  })

  it('renders no zones for a metric with no bands', () => {
    expect(rail).toMatch(/if \(!bands \|\| bands\.good == null \|\| bands\.risk == null\) return \[\]/)
  })

  it('never plots a missing value as a zero', () => {
    expect(rail).toMatch(/points\.filter\(\(p\) => p && p\.value != null && Number\.isFinite\(p\.value\)\)/)
  })

  it('matches TargetBandBar’s direction-aware zone order', () => {
    // Same maths as MetricDrawer's bar: the two must never disagree about where
    // the healthy range starts.
    expect(rail).toMatch(/bands\.goodDirection === 'lower'/)
    expect(rail).toContain("{ tone: 'good', from: lo, to: bands.good }")
    expect(rail).toContain("{ tone: 'risk', from: lo, to: bands.risk }")
  })
})

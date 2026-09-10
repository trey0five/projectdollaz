/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// THE ANALYTICS LEGIBILITY PASS — three user complaints, pinned so they cannot
// quietly un-happen.
//
//   1. "make the analytics more accessible from the overview" — the Overview's
//      door is LIVE preview tiles now, each deep-linking to its analytics view,
//      not one thin line of grey text.
//   2. "no graphs figures overlapping" — the right edge of the headcount trend
//      printed the endpoint callout and the plan label through each other
//      whenever the school sat near its plan. Labels now pass through ONE shared
//      1-D separation (kit.separateLabels), tested here as geometry.
//   3. "display this data in the most intuitive way" — the per-chart explainer
//      paragraphs live behind an ⓘ popover with a one-line caption in view, and
//      the "what to know" bullet wall is a collapsed disclosure. NOTHING was
//      deleted: the honesty sentences must still be present in the source,
//      merely behind disclosure — the deletion of any of them is a regression
//      this file exists to catch.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { separateLabels } from './enrollmentAnalyticsKit.jsx'

// The diverged-tile mount (§5 below) swaps the analytics hook per fixture.
const hookMock = vi.hoisted(() => ({ useEnrollmentAnalytics: vi.fn() }))
vi.mock('../../hooks/useEnrollmentAnalytics.js', () => ({
  useEnrollmentAnalytics: (...a) => hookMock.useEnrollmentAnalytics(...a),
}))

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')
const page = read('pages/EnrollmentPage.jsx')
const preview = read('components/enrollment/EnrollmentAnalyticsPreview.jsx')
const trendChart = read('components/enrollment/EnrollmentHeadcountTrend.jsx')
const analytics = read('components/enrollment/EnrollmentAnalytics.jsx')
const honesty = read('components/enrollment/EnrollmentHonesty.jsx')
const chartCard = read('components/analytics/v2/ChartCard.jsx')
const infoPopover = read('components/ui/InfoPopover.jsx')

// ── 1 · The Overview door is a live preview, not a footnote ──────────────────

describe('the Overview opens into Analytics through live tiles', () => {
  it('the page renders the preview strip where the text pointer stood', () => {
    expect(page).toMatch(/<EnrollmentAnalyticsPreview schoolId=\{activeId\} periodId=\{periodId\} \/>/)
  })

  it('every tile deep-links to a real analytics view via the ?view= URL model', () => {
    for (const view of ['trend', 'grades', 'cohorts']) {
      expect(preview).toMatch(new RegExp(`/enrollment\\?tab=analytics&view=${view}`))
    }
  })

  it('the preview reads the SAME payload as the tab — one hook, no client math', () => {
    expect(preview).toMatch(/useEnrollmentAnalytics\(schoolId, periodId\)/)
    // The cohort chips tally the server's verdicts, never re-decide from a sign.
    expect(preview).toMatch(/c\.direction === d/)
    expect(preview).not.toMatch(/netChange\s*[<>]/)
  })

  it('a failed or empty read degrades to the plain pointer — the door never vanishes', () => {
    expect(preview).toMatch(/PointerFallback/)
    expect(preview).toMatch(/Trends, grade mix and cohorts/)
  })
})

// ── 2 · Label collision is solved as geometry, in one shared place ───────────

describe('separateLabels — the shared 1-D label separation', () => {
  it('leaves non-colliding labels exactly where they asked to be', () => {
    const out = separateLabels(
      [
        { key: 'a', y: 20 },
        { key: 'b', y: 80 },
      ],
      { gap: 14 },
    )
    expect(out.get('a')).toBe(20)
    expect(out.get('b')).toBe(80)
  })

  it('pushes colliding labels at least a gap apart', () => {
    const out = separateLabels(
      [
        { key: 'end', y: 100 },
        { key: 'plan', y: 104 },
      ],
      { gap: 15 },
    )
    expect(Math.abs(out.get('plan') - out.get('end'))).toBeGreaterThanOrEqual(15)
  })

  it('never lets labels swap vertical order — leader lines cannot cross', () => {
    const out = separateLabels(
      [
        { key: 'top', y: 50 },
        { key: 'bottom', y: 51 },
      ],
      { gap: 14 },
    )
    expect(out.get('top')).toBeLessThan(out.get('bottom'))
  })

  it('keeps the stack inside the plot band', () => {
    const out = separateLabels(
      [
        { key: 'a', y: 198 },
        { key: 'b', y: 199 },
      ],
      { gap: 14, lo: 20, hi: 200 },
    )
    expect(out.get('b')).toBeLessThanOrEqual(200)
    expect(out.get('a')).toBeLessThanOrEqual(200 - 14)
    expect(out.get('a')).toBeGreaterThanOrEqual(20)
  })

  it('clamps an off-the-top label back down into the band', () => {
    const out = separateLabels([{ key: 'a', y: 2 }], { gap: 14, lo: 21, hi: 176 })
    expect(out.get('a')).toBe(21)
  })

  it('handles three-deep pileups without losing anyone', () => {
    const out = separateLabels(
      [
        { key: 'a', y: 100 },
        { key: 'b', y: 101 },
        { key: 'c', y: 102 },
      ],
      { gap: 14, lo: 0, hi: 300 },
    )
    const ys = [out.get('a'), out.get('b'), out.get('c')]
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(14)
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(14)
  })
})

describe('the headcount trend uses the shared separation on its right edge', () => {
  it('the endpoint callout and the plan label go through separateLabels', () => {
    expect(trendChart).toMatch(/separateLabels\(/)
    expect(trendChart).toMatch(/key: 'end', y: Y\(latest\.total\)/)
    expect(trendChart).toMatch(/key: 'plan', y: Y\(planTotal\)/)
  })

  it('a label that moved is tethered to its datum with a leader line', () => {
    expect(trendChart).toMatch(/movedFrom\(Y\(latest\.total\), yEndLabel\)/)
    expect(trendChart).toMatch(/movedFrom\(Y\(planTotal\), yPlanLabel\)/)
  })

  it('a plan label too wide for the gutter moves inside the plot, never clips', () => {
    expect(trendChart).toMatch(/planFitsRight/)
    // The left-end fallback exists: label drawn at the line's left end.
    expect(trendChart).toMatch(/x=\{PAD\.l \+ 4\}/)
  })
})

// ── 3 · Prose became progressive disclosure — and NOTHING was deleted ────────

describe('explainers: one caption in view, the full text behind the ⓘ', () => {
  it('ChartCard grew an additive info popover slot', () => {
    expect(chartCard).toMatch(/info && <InfoPopover/)
  })

  it('the popover is a keyboard-honest disclosure', () => {
    expect(infoPopover).toMatch(/aria-expanded=\{open\}/)
    expect(infoPopover).toMatch(/aria-controls=\{panelId\}/)
    expect(infoPopover).toMatch(/e\.key === 'Escape'/)
  })

  it('every enrollment chart card leads with a one-line ChartCaption', () => {
    const captions = analytics.match(/<ChartCaption/g) ?? []
    expect(captions.length).toBe(6) // E1, E4, E2, E3, E5, E7
  })

  it('every chart card hands its full WhatThisMeasures to the popover', () => {
    const infos = analytics.match(/info=\{\s*<WhatThisMeasures/g) ?? []
    expect(infos.length).toBe(6)
  })

  it('the honesty sentences SURVIVED the move — behind disclosure, not deleted', () => {
    // E1: the anti-truncation claim.
    expect(analytics).toMatch(/The vertical axis starts at zero and is not truncated/)
    // E4: colour sits on the gap, not the bar.
    expect(analytics).toMatch(/a grade under plan is not a red grade/)
    // E3: size, not retention.
    expect(analytics).toMatch(/This is class SIZE, not retention\./)
    // E5: masked categories are listed, never drawn.
    expect(analytics).toMatch(/would put the withheld count back on the page as geometry/)
    // E7: the minCell identification rationale.
    expect(analytics).toMatch(/a flag identifies a child by name/)
  })

  it('the tab sublabels the user likes are untouched', () => {
    const tabs = read('components/enrollment/EnrollmentAnalyticsTabs.jsx')
    for (const caption of ['how it moved', 'where the miss is', 'following a class', 'the mix']) {
      expect(tabs).toContain(`caption: '${caption}'`)
    }
  })
})

describe('"what to know" is a collapsed disclosure, bullets verbatim', () => {
  it('EnrollmentNotes renders a native <details> with a summary trigger', () => {
    expect(honesty).toMatch(/<details className="group">/)
    expect(honesty).toMatch(/About these figures/)
  })

  it('the server-authored notes still print verbatim inside the fold', () => {
    expect(honesty).toMatch(/\{notes\.map\(\(n\) => \(/)
    expect(honesty).toMatch(/<span>\{n\}<\/span>/)
  })
})

// ── 4 · Degenerate band: compress, never escape past hi ──────────────────────

describe('separateLabels — a band too small for the stack COMPRESSES, never escapes', () => {
  it('a tiny band keeps every label inside [lo, hi], in order', () => {
    const out = separateLabels(
      [
        { key: 'a', y: 10 },
        { key: 'b', y: 11 },
        { key: 'c', y: 12 },
      ],
      { gap: 14, lo: 0, hi: 20 }, // room for 20px, stack wants 28px of gap
    )
    const ys = ['a', 'b', 'c'].map((k) => out.get(k))
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(20)
    }
    // Order survives the compression (leader lines still cannot cross).
    expect(ys[0]).toBeLessThanOrEqual(ys[1])
    expect(ys[1]).toBeLessThanOrEqual(ys[2])
  })

  it('a band with generous room is untouched by the compression branch', () => {
    const out = separateLabels(
      [
        { key: 'a', y: 40 },
        { key: 'b', y: 160 },
      ],
      { gap: 14, lo: 0, hi: 200 },
    )
    expect(out.get('a')).toBe(40)
    expect(out.get('b')).toBe(160)
  })
})

// ── 5 · The Overview vs-plan tile is honest about divergence ─────────────────
//
// The server can say the vs-plan totals and the promoted headline headcount are
// two DIFFERENT observations (totals.agreesWithTile === false). The full chart
// already prints an amber note; the Overview's preview tile used to print
// totals.gapPct with no note — two different percentages on one screen, no
// explanation. Rendered here against a diverged fixture.

describe('the Overview preview tile names a diverged vs-plan figure', () => {
  it('renders the divergence note when agreesWithTile === false, and not otherwise (source pin)', () => {
    // The tile must read agreesWithTile and carry the honest one-liner…
    expect(preview).toMatch(/agreesWithTile === false/)
    expect(preview).toMatch(/differs from the headline figure — see Analytics/)
    // …and must never average the two figures into a third number.
    expect(preview).not.toMatch(/\(totals\.gapPct \+/)
  })

  it('mounted against a diverged fixture, the note is visible; agreeing fixture hides it', async () => {
    // framer-motion's whileInView needs an IntersectionObserver jsdom lacks.
    globalThis.IntersectionObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    const { render, screen, cleanup } = await import('@testing-library/react')
    const { MemoryRouter } = await import('react-router-dom')
    const React = (await import('react')).default
    const { default: Preview } = await import('./EnrollmentAnalyticsPreview.jsx')

    const fixture = (agrees) => ({
      data: {
        trend: { points: [{ total: 430 }, { total: 436 }], planTotal: 450 },
        vsPlan: {
          totals: { actual: 420, plan: 450, gap: -30, gapPct: -0.066, agreesWithTile: agrees, tileGapPct: -0.031 },
        },
        gradeByYear: { grades: [], years: [] },
        cohortSize: { cohorts: [] },
      },
      loading: false,
      error: null,
      notLicensed: false,
      notEntitled: false,
    })

    hookMock.useEnrollmentAnalytics.mockReturnValue(fixture(false))
    render(
      React.createElement(MemoryRouter, null, React.createElement(Preview, { schoolId: 's1', periodId: 'p1' })),
    )
    expect(screen.getByText(/differs from the headline figure — see Analytics/)).toBeTruthy()
    cleanup()

    hookMock.useEnrollmentAnalytics.mockReturnValue(fixture(true))
    render(
      React.createElement(MemoryRouter, null, React.createElement(Preview, { schoolId: 's1', periodId: 'p1' })),
    )
    expect(screen.queryByText(/differs from the headline figure/)).toBeNull()
    cleanup()
  })
})

// ── 6 · The grade × year heat map reads on the shared stepped scale ──────────
//
// "take a look at the heat map as well": the continuous alpha ramp flipped its
// ink at t≈0.55 where neither ink cleared 3:1, cells were separated by a 3px
// gap instead of the 2px surface gap, and per-cell whileInView left the rows
// below the fold unpainted in a full-page capture. Pinned as source shape.

describe('the grade × year heat map is one stepped, legend-stated scale', () => {
  const heat = read('components/enrollment/EnrollmentGradeHeatmap.jsx')

  it('renders the shared HeatCell primitive with the shared sequential scale and legend', () => {
    expect(heat).toMatch(/import HeatCell, \{ HeatScaleLegend, HeatStateKeys \} from '\.\.\/analytics\/charts\/HeatCell\.jsx'/)
    expect(heat).toMatch(/sequentialScale\(max\)/)
    expect(heat).toMatch(/<HeatScaleLegend/)
  })

  it('separates cells with a 2px surface gap, never a ring or a 3px gutter', () => {
    expect(heat).toMatch(/borderSpacing: '2px'/)
    expect(heat).not.toMatch(/borderSpacing: '3px'/)
    expect(heat).not.toMatch(/boxShadow: 'inset 0 0 0 1px/)
  })

  it('reveals once — no per-cell whileInView, no native title tooltips', () => {
    expect(heat).not.toMatch(/whileInView/)
    expect(heat).not.toMatch(/\btitle=\{/)
  })

  it('states that shade is size, not change', () => {
    expect(heat).toMatch(/Shade is size, not change/)
  })
})

describe('rampFill / rampInk are STEPPED, and agree with each other', () => {
  it('two values inside one step share a fill, and the ink is the step\'s own', async () => {
    const { rampFill, rampInk } = await import('./enrollmentAnalyticsKit.jsx')
    const { SEQUENTIAL_STEPS } = await import('../analytics/charts/heatScales.js')
    expect(rampFill(0.05)).toBe(rampFill(0.15))
    expect(rampFill(0)).toBe(SEQUENTIAL_STEPS[0].fill)
    expect(rampFill(1)).toBe(SEQUENTIAL_STEPS[SEQUENTIAL_STEPS.length - 1].fill)
    for (const t of [0, 0.2, 0.4, 0.55, 0.6, 0.8, 1]) {
      const step = SEQUENTIAL_STEPS.find((s) => s.fill === rampFill(t))
      expect(step).toBeTruthy()
      expect(rampInk(t)).toBe(step.ink)
    }
  })
})

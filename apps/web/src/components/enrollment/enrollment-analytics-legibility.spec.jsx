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
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { separateLabels } from './enrollmentAnalyticsKit.jsx'

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

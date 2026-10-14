/* global process */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import DomainKpiCard from './DomainKpiCard.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// KPI NO-CLIP INVARIANTS — the finance-flow redesign's card contract (§5),
// re-pinned for the Premium UI P3 shape: the domain KPI is a `Stat` in a
// `StatStrip` (no box), but the thing that clipped text is unchanged — a
// `truncate` on a label, a value that cannot wrap, a column too narrow for a
// word. jsdom does no layout, so we pin the invariant at the mechanism level:
// the classes that CAUSE clipping (`truncate`, `leading-none` on a wrapping
// value) must be absent, and the classes that PREVENT it (`min-w-0` on the
// strip child so it can shrink, `break-words` on the sub line, `.stat-text` on
// the root so a TEXT value wraps where a figure would never break) must be
// present. Every domain command center (governance, facilities, advancement,
// accreditation, hr, planning, tasks, knowledge, cash, strategy) renders this
// one Stat, so this is the single place the guarantee lives.
//
// House rule: a spec that passes with the bug present is worthless. The
// original ran RED against the pre-fix card (truncate on the sub line, a
// leading-none value, no min-w-0); this version was checked against a Stat
// without `.stat-text`, where a long text value stays `white-space: nowrap`.
// ─────────────────────────────────────────────────────────────────────────────

// `globals: false` — register testing-library cleanup explicitly (house pattern).
afterEach(cleanup)

const LONG_LABEL = 'Deferred maintenance backlog as a share of replacement value'
const LONG_VALUE = '$1,234,567,890.12 (unrestricted)'
const LONG_SUB = 'vs. an inflation-adjusted rolling three-year benchmark of $987,654,321'

function renderLongCard() {
  return render(
    <DomainKpiCard label={LONG_LABEL} value={LONG_VALUE} sub={{ text: LONG_SUB, tone: 'neutral' }} status="watch" />,
  )
}

describe('DomainKpiCard never clips its text (card contract §5)', () => {
  it('no element in the stat carries `truncate` — long text wraps, it is not cut off', () => {
    const { container } = renderLongCard()
    expect(container.querySelector('.truncate')).toBeNull()
  })

  it('the sub line can shrink and wrap (min-w-0 + break-words), so a long benchmark is fully readable', () => {
    const { container } = renderLongCard()
    const sub = [...container.querySelectorAll('span')].find((el) => el.textContent === LONG_SUB)
    expect(sub).toBeTruthy()
    expect(sub.classList.contains('min-w-0')).toBe(true)
    expect(sub.classList.contains('break-words')).toBe(true)
  })

  it('the value is a wrapping text Stat (.stat-text on the root), never leading-none', () => {
    const { container } = renderLongCard()
    const value = container.querySelector('.stat-value')
    expect(value).toBeTruthy()
    expect(value.textContent).toBe(LONG_VALUE)
    // leading-none on a wrapping value stacks lines on top of each other — the
    // exact "cut off" artifact the user reported.
    expect(value.classList.contains('leading-none')).toBe(false)
    // A plain .stat-value is `white-space: nowrap` (a figure never breaks);
    // a domain KPI can be a sentence, so the root opts into wrapping.
    expect(container.firstElementChild.classList.contains('stat-text')).toBe(true)
  })

  it('the root is a shrinkable strip child (min-w-0), so a long value can never widen its column', () => {
    const { container } = renderLongCard()
    const root = container.firstElementChild
    expect(root.classList.contains('stat')).toBe(true)
    expect(root.classList.contains('min-w-0')).toBe(true)
  })

  it('the label is the Stat label (wraps by the primitive\'s overflow-wrap), next to no dot', () => {
    const { container } = renderLongCard()
    const label = container.querySelector('.stat-label')
    expect(label).toBeTruthy()
    expect(label.textContent).toBe(LONG_LABEL)
  })

  it('wears no box: the KPI is a Stat on the ground, not a card (no kpi-3d / card-soft / panel)', () => {
    const { container } = renderLongCard()
    const root = container.firstElementChild
    for (const cls of ['kpi-3d', 'card-soft', 'card-vital', 'panel']) expect(root.classList.contains(cls)).toBe(false)
  })

  it('a forced break hyphenates rather than shattering a word (hyphens-auto on the sub line)', () => {
    const { container } = renderLongCard()
    const sub = [...container.querySelectorAll('span')].find((el) => el.textContent === LONG_SUB)
    // break-words alone splits ordinary English at an arbitrary letter
    // ("None sched|uled"); paired with hyphens-auto the browser prefers a
    // syllable boundary. The value gets the same pair from `.stat-text`.
    expect(sub.classList.contains('hyphens-auto')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE REAL CAUSE OF THE MID-WORD SPLIT WAS THE COLUMN, NOT THE CARD.
//
// jsdom does no layout, so no render assertion can catch "the word broke at
// 1280px". The arithmetic, however, is fixed and checkable in source: the app
// shell reserves a 256px sidebar (lg:pl-64), the page shell adds 2×40px gutters
// (sm:px-10) and a Stat adds 20px of right padding + 20px left on every stat
// after the first (the vertical-rule gutter). At a 1280px viewport a SIX-column
// strip therefore leaves
//     (1280 − 256 − 80) ÷ 6 − 40  ≈  117px
// of content for a 26px value — narrower than a word like "scheduled", which
// is why /governance rendered "None sched|uled" and /hr "instructio|nal
// staff". Four columns at the same width leave ~196px, and three at 1024 leave
// ~189px.
//
// So the invariant is: a dense KPI strip must NEVER go 6-up at or below the lg
// breakpoint. Proven RED against the pre-fix source, which read
// `kpis.length >= 6 ? 'sm:grid-cols-3 lg:grid-cols-6'`.
// ─────────────────────────────────────────────────────────────────────────────
const CENTER_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/domain/DomainCommandCenter.jsx'),
  'utf8',
)

/** Minimum content px for one column, given a viewport and a column count. */
const contentPx = (viewport, cols) =>
  (viewport - 256 /* sidebar */ - 80 /* gutters */) / cols - 40 /* stat padding + rule gutter */

describe('DomainCommandCenter gives KPI words room (the no-clip contract, §5.3)', () => {
  it('never offers a 6-up or 5-up KPI strip at the lg breakpoint', () => {
    expect(
      CENTER_SRC,
      'lg:grid-cols-6 leaves ~117px of content at 1280px — ordinary words break mid-word',
    ).not.toMatch(/lg:grid-cols-6/)
    expect(
      CENTER_SRC,
      'lg:grid-cols-5 leaves ~148px of content at 1280px — same failure, one column later',
    ).not.toMatch(/lg:grid-cols-5/)
  })

  it('the densest strip still clears ~170px of content at 1280px and 1500px', () => {
    // The >=6 arm tops out at xl:grid-cols-4.
    expect(CENTER_SRC).toMatch(/xl:grid-cols-4/)
    expect(contentPx(1280, 4)).toBeGreaterThan(170)
    expect(contentPx(1500, 4)).toBeGreaterThan(170)
    // …and at the lg step (1024) it is only 3-up.
    expect(contentPx(1024, 3)).toBeGreaterThan(170)
    // Sanity on the arithmetic itself: the shipped-and-broken 6-up really is
    // the sub-120px case this guard exists to ban.
    expect(contentPx(1280, 6)).toBeLessThan(120)
  })

  it('the KPI row is a StatStrip, not a grid of cards', () => {
    expect(CENTER_SRC).toMatch(/<StatStrip/)
    expect(CENTER_SRC).not.toMatch(/kpi-3d|card-soft/)
  })
})

/* global process */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import DomainKpiCard from './DomainKpiCard.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// CARD NO-CLIP INVARIANTS — the finance-flow redesign's card contract (§5).
//
// The user has seen cut-off text on KPI tiles. jsdom does no layout, so we pin
// the invariant at the mechanism level: the classes that CAUSE clipping
// (`truncate`, `leading-none` on a wrapping value) must be absent, and the
// classes that PREVENT it (`min-w-0` on the grid child so the card can shrink,
// `break-words` on the value so a long figure wraps instead of escaping the
// box) must be present. Every domain command center (governance, facilities,
// advancement, accreditation, hr, planning, tasks, knowledge, cash, strategy)
// renders this one tile, so this is the single place the guarantee lives.
//
// House rule: a spec that passes with the bug present is worthless. This one
// was run against the pre-fix DomainKpiCard and failed on all three counts
// (truncate present on the sub line; value styled leading-none without
// break-words; no min-w-0 on the root).
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
  it('no element in the card carries `truncate` — long text wraps, it is not cut off', () => {
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

  it('the value wraps instead of overlapping: break-words present, leading-none gone', () => {
    const { container } = renderLongCard()
    const value = [...container.querySelectorAll('div')].find((el) => el.textContent === LONG_VALUE)
    expect(value).toBeTruthy()
    expect(value.classList.contains('break-words')).toBe(true)
    // leading-none on a now-wrapping serif value stacks lines on top of each
    // other — the exact "cut off" artifact the user reported.
    expect(value.classList.contains('leading-none')).toBe(false)
  })

  it('the card root is a shrinkable grid child (min-w-0), so a long value can never widen its column', () => {
    const { container } = renderLongCard()
    const root = container.firstElementChild
    expect(root.classList.contains('kpi-3d')).toBe(true)
    expect(root.classList.contains('min-w-0')).toBe(true)
  })

  it('the label heading is a shrinkable flex child (min-w-0) next to the status dot', () => {
    const { container } = renderLongCard()
    const label = [...container.querySelectorAll('h3')].find((el) => el.textContent === LONG_LABEL)
    expect(label).toBeTruthy()
    expect(label.classList.contains('min-w-0')).toBe(true)
  })

  it('keeps the cushion: body padding is the p-5/sm:p-6 content scale, not the old p-4', () => {
    const { container } = renderLongCard()
    const body = container.querySelector('.flex.flex-col.gap-3')
    expect(body).toBeTruthy()
    expect(body.classList.contains('p-5')).toBe(true)
    expect(body.classList.contains('p-4')).toBe(false)
  })

  it('a forced break hyphenates rather than shattering a word (hyphens-auto on value + sub)', () => {
    const { container } = renderLongCard()
    const value = [...container.querySelectorAll('div')].find((el) => el.textContent === LONG_VALUE)
    const sub = [...container.querySelectorAll('span')].find((el) => el.textContent === LONG_SUB)
    // break-words alone splits ordinary English at an arbitrary letter
    // ("None sched|uled"); paired with hyphens-auto the browser prefers a
    // syllable boundary. Both must stay together.
    expect(value.classList.contains('hyphens-auto')).toBe(true)
    expect(sub.classList.contains('hyphens-auto')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE REAL CAUSE OF THE MID-WORD SPLIT WAS THE COLUMN, NOT THE CARD.
//
// jsdom does no layout, so no render assertion can catch "the word broke at
// 1280px". The arithmetic, however, is fixed and checkable in source: the app
// shell reserves a 256px sidebar (lg:pl-64), the page shell adds 2×40px gutters
// (sm:px-10) and DomainKpiCard adds 2×24px of cushion (sm:p-6). At a 1280px
// viewport a SIX-column row therefore leaves
//     (1280 − 256 − 80 − 5×16) ÷ 6 − 48  ≈  96px
// of content for a 30px serif value — narrower than a word like "scheduled",
// which is why /governance rendered "None sched|uled" and /hr "instructio|nal
// staff". Four columns at the same width leave ~176px, and three at 1024 leave
// ~170px.
//
// So the invariant is: a dense KPI row must NEVER go 6-up at or below the lg
// breakpoint. Proven RED against the pre-fix source, which read
// `kpis.length >= 6 ? 'sm:grid-cols-3 lg:grid-cols-6'`.
// ─────────────────────────────────────────────────────────────────────────────
const CENTER_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/domain/DomainCommandCenter.jsx'),
  'utf8',
)

/** Minimum content px for one column, given a viewport and a column count. */
const contentPx = (viewport, cols) =>
  (viewport - 256 /* sidebar */ - 80 /* gutters */ - (cols - 1) * 16 /* gap-4 */) / cols -
  48 /* sm:p-6 cushion */

describe('DomainCommandCenter gives KPI words room (the no-clip contract, §5.3)', () => {
  it('never offers a 6-up or 5-up KPI grid at the lg breakpoint (~96px of content)', () => {
    expect(
      CENTER_SRC,
      'lg:grid-cols-6 leaves ~96px of content at 1280px — ordinary words break mid-word',
    ).not.toMatch(/lg:grid-cols-6/)
    expect(
      CENTER_SRC,
      'lg:grid-cols-5 leaves ~117px of content at 1280px — same failure, one column later',
    ).not.toMatch(/lg:grid-cols-5/)
  })

  it('the densest row still clears ~170px of content at 1280px and 1500px', () => {
    // The >=6 arm tops out at xl:grid-cols-4.
    expect(CENTER_SRC).toMatch(/xl:grid-cols-4/)
    expect(contentPx(1280, 4)).toBeGreaterThan(170)
    expect(contentPx(1500, 4)).toBeGreaterThan(170)
    // …and at the lg step (1024) it is only 3-up.
    expect(contentPx(1024, 3)).toBeGreaterThan(170)
    // Sanity on the arithmetic itself: the shipped-and-broken 6-up really is
    // the sub-100px case this guard exists to ban.
    expect(contentPx(1280, 6)).toBeLessThan(100)
  })
})

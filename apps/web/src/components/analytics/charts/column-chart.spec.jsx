// ─────────────────────────────────────────────────────────────────────────────
// ColumnChart invariants — the contract every flipped surface codes against.
//   • label mode switches at a 56px band (wrapped above, rotated below)
//   • reference rules outside lo..hi are dropped
//   • the zoomed-axis note + axis-break glyph appear ONLY when lo > range.min
//   • every row is a keyboard-focusable role="img" with the FULL name in aria
//   • a legend renders for ≥2 series, never for one
//   • counts keep a zero baseline (includeZero default) — no zoomed magnitudes
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import ColumnChart, { fitDomain, niceTicks, twoLineLabel, wrapLabel } from './ColumnChart.jsx'

const SCHOOLS = [
  'North Miami Beach Sr High',
  'Nativity Catholic School',
  'St Brendan Parish School',
  'Msgr Edward Pace High School',
  'Our Lady of Perpetual Help Academy',
  'Cardinal Gibbons Preparatory',
  'Sample High School',
  'Chaminade-Madonna College Prep',
  'Blessed Sacrament Academy',
  'St Gregory the Great School',
  'South Plantation High School',
  'Immaculate Conception School',
  'Holy Cross Regional School',
  'St Thomas Aquinas Catholic School',
  'St Bonaventure Elementary',
  'Archbishop Curley Notre Dame',
]
const rows16 = SCHOOLS.map((name, i) => ({ id: `s${i}`, label: name, value: 76 - i * 2, emphasis: i === 0 }))
const PCT = { min: 1, max: 99 }
const UNIT = { label: 'national percentile', decimals: 0, span: '1–99', gap: 5, points: 'percentile points' }

describe('label strategy', () => {
  it('wraps labels into tspans when the band is at least 56px', () => {
    const { container } = render(<ColumnChart rows={rows16} width={16 * 70 + 60} fit={{ range: PCT, includeZero: false }} />)
    expect(container.querySelector('.fr-col').dataset.labelMode).toBe('wrap')
    const groups = container.querySelectorAll('g[role="img"]')
    expect(groups.length).toBe(16)
    const first = groups[0].querySelectorAll('tspan')
    expect(first.length).toBeGreaterThanOrEqual(1)
  })

  it('rotates a single line when the band is under 56px, and still scrolls rather than squeezes', () => {
    const { container } = render(<ColumnChart rows={rows16} width={400} minBand={48} />)
    expect(container.querySelector('.fr-col').dataset.labelMode).toBe('rotate')
    const svg = container.querySelector('svg')
    // 16 × 48px minimum band + paddings is wider than the 400px host → scroll.
    expect(Number(svg.getAttribute('width'))).toBeGreaterThan(400)
    const rotated = container.querySelector('g[role="img"] text[transform^="rotate(-32"]')
    expect(rotated).not.toBeNull()
  })

  it('always carries the full name in the aria-label and <title>', () => {
    const { container } = render(<ColumnChart rows={rows16} width={400} />)
    const g = container.querySelectorAll('g[role="img"]')[4]
    expect(g.getAttribute('aria-label')).toContain('Our Lady of Perpetual Help Academy')
    expect(g.querySelector('title').textContent).toContain('Our Lady of Perpetual Help Academy')
    expect(g.getAttribute('tabindex')).toBe('0')
  })

  it('twoLineLabel splits on a word and ellipsises the tail', () => {
    expect(twoLineLabel('Our Lady of Perpetual Help Academy', 11)).toEqual(['Our Lady of', 'Perpetual…'])
    expect(twoLineLabel('Archbishop Curley Notre Dame', 12)).toEqual(['Archbishop', 'Curley Notr…'])
    expect(twoLineLabel('Grade 9', 12)).toEqual(['Grade 9'])
  })

  it('wrapLabel takes a third line before it ellipsises, and breaks hyphenated tokens', () => {
    // Slack is spent only when it saves a fourth line…
    expect(wrapLabel('Our Lady of Perpetual Help Academy', 10)).toEqual(['Our Lady of', 'Perpetual', 'Help'])
    // …never when the name already fits the cap (neighbours must not touch).
    expect(wrapLabel('Archbishop Curley Notre Dame', 10)).toEqual(['Archbishop', 'Curley', 'Notre Dame'])
    expect(wrapLabel('Chaminade-Madonna College Prep', 10)).toEqual(['Chaminade-', 'Madonna', 'College P…'])
    expect(wrapLabel('St Bonaventure Elementary', 10)).toEqual(['St', 'Bonaventure', 'Elementary'])
    expect(wrapLabel('Grade 9', 10)).toEqual(['Grade 9'])
  })
})

describe('reference rules', () => {
  it('drops refs outside an explicit lo..hi and keeps the ones inside', () => {
    const { container } = render(
      <ColumnChart
        rows={rows16}
        width={1200}
        domain={{ lo: 40, hi: 80 }}
        refs={[
          { value: 50, label: 'National 50', color: '#E11D48' },
          { value: 61.4, label: 'Network 61.4', color: '#2563EB' },
          { value: 5, label: 'Way below', color: '#000' },
        ]}
      />,
    )
    const refs = [...container.querySelectorAll('g[data-ref]')].map((g) => g.dataset.ref)
    expect(refs).toEqual(expect.arrayContaining(['National 50', 'Network 61.4']))
    expect(refs).not.toContain('Way below')
  })

  it('a fitted domain stretches to include a reference line', () => {
    const d = fitDomain([70, 76, 50], { range: PCT, includeZero: false })
    expect(d.lo).toBeLessThan(50)
  })
})

describe('zoomed axis disclosure', () => {
  it('shows the note + axis break when lo > range.min', () => {
    const { container } = render(<ColumnChart rows={rows16} width={1200} fit={{ range: PCT, includeZero: false }} unit={UNIT} />)
    const note = container.querySelector('.fr-col-note')
    expect(note.dataset.zoomed).toBe('true')
    expect(note.textContent).toMatch(/zoomed to the range in play/)
    expect(note.textContent).toMatch(/read column heights/)
    expect(container.querySelector('[data-axis-break]')).not.toBeNull()
  })

  it('shows neither when the domain is the full scale', () => {
    const { container } = render(
      <ColumnChart rows={rows16} width={1200} domain={{ lo: 1, hi: 99 }} fit={{ range: PCT }} unit={UNIT} />,
    )
    const note = container.querySelector('.fr-col-note')
    expect(note.dataset.zoomed).toBe('false')
    expect(note.textContent).toMatch(/spans the full 1–99/)
    expect(container.querySelector('[data-axis-break]')).toBeNull()
  })
})

describe('series + legend', () => {
  const grades = [
    { id: '9', label: 'Grade 9', vals: [104, 112] },
    { id: '10', label: 'Grade 10', vals: [102, 108] },
  ]
  const series = [
    { id: 'actual', label: 'Actual', color: '#0EA5E9' },
    { id: 'plan', label: 'Plan', color: '#B45309', style: 'dashed' },
  ]
  it('renders a legend for two series and dashes the plan column', () => {
    const { container } = render(<ColumnChart rows={grades} series={series} width={600} />)
    expect(container.querySelector('.fr-col-legend')).not.toBeNull()
    expect(container.querySelectorAll('.fr-col-legend-item').length).toBe(2)
    const dashed = container.querySelector('g[role="img"] path[stroke-dasharray]')
    expect(dashed).not.toBeNull()
  })
  it('renders NO legend for a single series', () => {
    const { container } = render(<ColumnChart rows={[{ id: 'a', label: 'A', value: 3 }]} width={300} />)
    expect(container.querySelector('.fr-col-legend')).toBeNull()
  })
})

describe('spotlight + edge padding', () => {
  it('dims every column but the spotlit one', () => {
    const rows = [{ id: 'a', label: 'A', value: 3 }, { id: 'b', label: 'B', value: 5 }]
    const { container } = render(<ColumnChart rows={rows} width={300} spotlightId="b" />)
    const paths = [...container.querySelectorAll('g[role="img"] > g > path')]
    expect(paths[0].getAttribute('opacity')).toBe('0.25')
    expect(paths[1].getAttribute('opacity')).toBe('1')
  })
  it('reserves room on the left for the first rotated label when the chart scrolls anyway', () => {
    const { container } = render(<ColumnChart rows={rows16} width={400} minBand={48} />)
    const first = container.querySelector('g[role="img"] > rect')
    // The hit rect starts at PAD_L; the overhang past the tick gutter is reserved.
    expect(Number(first.getAttribute('x'))).toBeGreaterThan(36)
  })
  it('shortens rotated labels instead of forcing a scroll in a panel that fits', () => {
    const five = rows16.slice(0, 5)
    const { container } = render(<ColumnChart rows={five} width={260} minBand={40} />)
    expect(container.querySelector('.fr-col').dataset.labelMode).toBe('rotate')
    expect(Number(container.querySelector('svg').getAttribute('width'))).toBe(260)
    const txt = container.querySelector('g[role="img"] text[transform^="rotate(-32"]').textContent
    expect(txt.length).toBeLessThanOrEqual(15)
  })
})

describe('short labels wrap before they rotate', () => {
  it('"Grade N" at a ~45px band wraps into two clean lines with no scroll', () => {
    const grades = Array.from({ length: 10 }, (_, i) => ({ id: `g${i + 3}`, label: `Grade ${i + 3}`, value: 60 + (i % 3) }))
    const { container } = render(<ColumnChart rows={grades} width={490} minBand={48} />)
    expect(container.querySelector('.fr-col').dataset.labelMode).toBe('wrap')
    expect(Number(container.querySelector('svg').getAttribute('width'))).toBe(490)
    expect([...container.querySelectorAll('tspan')].some((el) => el.textContent.endsWith('…'))).toBe(false)
  })
  it('the svg is a group so each column keeps its own role=img for AT', () => {
    const { container } = render(<ColumnChart rows={[{ id: 'a', label: 'A', value: 1 }]} width={300} />)
    expect(container.querySelector('svg').getAttribute('role')).toBe('group')
  })
  it('the tooltip swatch is the DRAWN fill: a peer column reports peer grey, not the chart hue', () => {
    // Exercised through the aria contract: fillFor feeds both; assert the peer path fill itself.
    const rows = [{ id: 'a', label: 'A', value: 5, emphasis: true }, { id: 'b', label: 'B', value: 3 }]
    const { container } = render(<ColumnChart rows={rows} width={300} color="#0D9488" />)
    const peer = container.querySelectorAll('g[role="img"] > g > path')[1]
    expect(peer.getAttribute('fill')).toMatch(/rgba\(148,163,184/)
  })
})

describe('domains', () => {
  it('counts keep a zero baseline by default', () => {
    expect(fitDomain([104, 139, 79]).lo).toBe(0)
  })
  it('percentile scores may zoom, clamped to the family range', () => {
    const d = fitDomain([46, 76], { range: PCT, includeZero: false })
    expect(d.lo).toBeGreaterThan(PCT.min)
    expect(d.lo).toBeLessThan(46)
    expect(d.hi).toBeGreaterThan(76)
    expect(d.hi).toBeLessThanOrEqual(PCT.max)
  })
  it('nice ticks are clean numbers', () => {
    expect(niceTicks(0, 150, 4)).toEqual([0, 50, 100, 150])
  })
  it('a suppressed row draws a hatched stub, never a zero column', () => {
    const { container } = render(
      <ColumnChart rows={[{ id: 'a', label: 'A', value: 12 }, { id: 'b', label: 'B', value: 0, suppressed: true }]} width={300} />,
    )
    const stub = container.querySelectorAll('g[role="img"]')[1].querySelector('path[fill^="url(#"]')
    expect(stub.getAttribute('fill')).toMatch(/hatch-amber/)
    expect(container.querySelectorAll('g[role="img"]')[1].getAttribute('aria-label')).toContain('<5')
  })
  it('diverging columns grow below the baseline for negatives', () => {
    const { container } = render(
      <ColumnChart diverging rows={[{ id: 'a', label: 'Math', value: 8 }, { id: 'b', label: 'Science', value: -4 }]} width={300} />,
    )
    expect(container.querySelector('.fr-col-grow-down')).not.toBeNull()
  })
})

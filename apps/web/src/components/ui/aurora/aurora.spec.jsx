/* global process */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Wallet } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// AURORA PRIMITIVES — render + class contract + the verdict vocabulary.
//
// jsdom does no layout, so (as with the surface primitives) the contract is
// pinned on the classes each primitive emits — aurora.css is the only place
// they are styled — plus the behaviour that is logic, not CSS: the verdict
// pill mapping (a figure with no band gets NO judgement word), the reduced-
// motion path, the stretched-link tile, and the hue registry hand-off.
// ─────────────────────────────────────────────────────────────────────────────
const motionState = vi.hoisted(() => ({ reduce: false }))
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useReducedMotion: () => motionState.reduce }
})

import {
  AuroraHero,
  AuroraKpi,
  AuroraSection,
  AuroraTile,
  AuroraTileGrid,
  AuroraCard,
  AuroraEmpty,
  HowThisWorks,
  VerdictPill,
  AuroraPeriodSwitch,
  toVerdict,
  verdictCountLabel,
  initialsOf,
} from './index.js'
import { moduleAccentVars, moduleAuroraVars, moduleHue } from '../../module/moduleAnatomy.js'
import { financeVerdict, splitSignal, kpiCaption, metricVerdict, warningTiles } from '../../finance/financeAurora.js'

afterEach(() => {
  cleanup()
  motionState.reduce = false
})

const withRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('VerdictPill — Good / Watch / At risk, word + icon + colour', () => {
  it.each([
    ['good', 'Good', 'good'],
    ['watch', 'Watch', 'watch'],
    ['risk', 'At risk', 'risk'],
    ['bad', 'At risk', 'risk'],
    ['strength', 'Good', 'good'],
    ['warn', 'Watch', 'watch'],
  ])('%s → "%s"', (status, word, cls) => {
    const { container } = render(<VerdictPill verdict={status} />)
    const pill = container.querySelector('.au-pill')
    expect(pill.textContent).toBe(word)
    expect(pill.classList.contains(`au-pill-${cls}`)).toBe(true)
    // never colour alone: an icon well is always present
    expect(pill.querySelector('.au-pill-i svg')).toBeTruthy()
  })

  it('a figure with no band gets NO judgement word (never invent a target)', () => {
    for (const s of ['neutral', null, undefined, 'contextual']) {
      const { container } = render(<VerdictPill verdict={s} />)
      expect(container.querySelector('.au-pill')).toBeNull()
      cleanup()
    }
  })

  it('…but a caller-supplied label renders as a grey neutral pill', () => {
    const { container } = render(<VerdictPill verdict={null} label="FY 2026" />)
    const pill = container.querySelector('.au-pill')
    expect(pill.classList.contains('au-pill-neutral')).toBe(true)
    expect(pill.textContent).toBe('FY 2026')
  })

  it('toVerdict + verdictCountLabel speak the same vocabulary', () => {
    expect(toVerdict('critical')).toBe('risk')
    expect(toVerdict('neutral')).toBeNull()
    expect(verdictCountLabel(['risk', 'risk', 'watch', 'good', 'neutral'])).toBe('2 at risk · 1 watch · 1 good')
    expect(verdictCountLabel([])).toBe('')
  })
})

describe('AuroraHero — the band', () => {
  const kpis = [
    { label: 'Days of cash', value: '43', unit: 'days', caption: 'On Jun 30, 2026', verdict: 'watch', icon: Wallet },
    { label: 'Reserve', value: null, unit: 'months' },
  ]

  it('renders chip, eyebrow, serif title, ONE verdict sentence, actions and glass KPIs', () => {
    const { container } = withRouter(
      <AuroraHero
        moduleKey="finance"
        school="Sample 01 High School"
        eyebrow="Year ended Jun 30, 2026"
        title="Finance"
        verdict="FY 2026 closed $430,000 ahead."
        actions={<button type="button">Add data</button>}
        kpis={kpis}
      />,
    )
    const band = container.querySelector('section.au-hero')
    expect(band).toBeTruthy()
    expect(band.querySelector('.au-chip').textContent).toBe('Sample 01 High School')
    expect(band.querySelector('h1.au-title').textContent).toBe('Finance')
    expect(band.querySelectorAll('.au-verdict')).toHaveLength(1)
    expect(band.querySelector('.au-actions button').textContent).toBe('Add data')
    expect(band.querySelectorAll('.au-kpis .au-kpi')).toHaveLength(2)
    // the band is painted from the ONE registry hue
    expect(band.style.getPropertyValue('--au-h')).toBe(moduleHue('finance').toLowerCase())
    // the monogram defaults to the school's initials
    expect(band.querySelector('.au-monogram').textContent).toBe('S0')
  })

  it('a missing figure is a dash, never a zero — and its unit is not shown', () => {
    const { container } = withRouter(<AuroraHero title="Finance" kpis={kpis} />)
    const cards = container.querySelectorAll('.au-kpi')
    expect(cards[1].querySelector('.au-kpi-val').textContent).toBe('—')
    expect(cards[1].querySelector('.au-kpi-unit')).toBeNull()
    // no band → no judgement word; only an invisible, unannounced spacer keeps
    // the cards in one row aligned
    expect(cards[1].querySelector('.au-pill:not(.au-pill-ghost)')).toBeNull()
    expect(cards[1].querySelector('.au-pill-ghost').textContent).toBe('')
    expect(cards[1].querySelector('.au-pill-ghost').getAttribute('aria-hidden')).toBe('true')
    expect(cards[0].querySelector('.au-pill').textContent).toBe('Watch')
  })

  it('kpis carrying a React `key` render without the key-spread error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    withRouter(
      <AuroraHero
        title="Finance"
        kpis={[
          { key: 'operating_margin', label: 'Margin', value: '4.0%', verdict: 'good' },
          { key: 'budget', label: 'Against budget', value: '+$12K' },
        ]}
      />,
    )
    expect(err).not.toHaveBeenCalled()
  })

  it('shows at most 4 glass cards; the rest become a "more figures" chip row', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ label: `K${i}`, value: String(i), verdict: i === 5 ? 'risk' : null }))
    const { container } = withRouter(<AuroraHero title="Governance" kpis={many} />)
    expect(container.querySelectorAll('.au-kpis .au-kpi')).toHaveLength(4)
    const chips = container.querySelectorAll('.au-kchips .au-kchip')
    expect(chips).toHaveLength(2)
    expect(chips[0].textContent).toContain('K4')
    // a chip keeps the verdict as a word, never colour alone
    expect(chips[1].querySelector('.au-pill').textContent).toBe('At risk')
  })

  it('secondary controls go in their own wrapping tools row, not the button row', () => {
    const { container } = withRouter(
      <AuroraHero
        title="Accreditation"
        actions={<button type="button">Add data</button>}
        tools={
          <label>
            Division: <select className="sel" />
          </label>
        }
      />,
    )
    const rows = container.querySelectorAll('.au-actions')
    expect(rows).toHaveLength(2)
    expect(rows[1].classList.contains('au-tools')).toBe(true)
    expect(rows[0].querySelector('select')).toBeNull()
  })

  it('drifts by default; reduced motion renders a static band (au-still)', () => {
    const { container } = withRouter(<AuroraHero title="Finance" />)
    const band = container.querySelector('.au-hero')
    expect(band.classList.contains('au-still')).toBe(false)
    expect(band.dataset.motion).toBe('drift')
    cleanup()
    motionState.reduce = true
    const r = withRouter(<AuroraHero title="Finance" />)
    const still = r.container.querySelector('.au-hero')
    expect(still.classList.contains('au-still')).toBe(true)
    expect(still.dataset.motion).toBe('static')
  })

  it('initialsOf takes the first letter of the first two words', () => {
    expect(initialsOf('All Souls Catholic School')).toBe('AS')
    expect(initialsOf('')).toBe('')
  })
})

describe('AuroraKpi', () => {
  it('becomes a link when given `to`', () => {
    const { container } = withRouter(<AuroraKpi label="Margin" value="4.0%" to="/analytics" />)
    expect(container.querySelector('a.au-kpi').getAttribute('href')).toBe('/analytics')
  })
})

describe('AuroraSection — the heading strip', () => {
  it('medallion, serif h2, subtitle, count pill and the ornament', () => {
    const { container } = render(
      <AuroraSection icon={Wallet} title="Warnings" subtitle="What KYRO spotted" count="2 at risk" tone="risk">
        <p>body</p>
      </AuroraSection>,
    )
    const sec = container.querySelector('section.au-sec')
    expect(sec.querySelector('.au-medal svg')).toBeTruthy()
    expect(sec.querySelector('h2.au-ribbon-title').textContent).toBe('Warnings')
    expect(sec.querySelector('.au-ribbon-sub').textContent).toBe('What KYRO spotted')
    expect(sec.querySelector('.au-count').textContent).toBe('2 at risk')
    expect(sec.querySelector('.au-orn')).toBeTruthy()
    expect(sec.style.getPropertyValue('--sh')).toBe('#e11d48')
    expect(sec.textContent).toContain('body')
  })

  it('compact puts the count under the words and drops the ornament', () => {
    const { container } = render(<AuroraSection compact title="Needs attention" count="1 at risk" />)
    expect(container.querySelector('.au-ribbon-text .au-count').textContent).toBe('1 at risk')
    expect(container.querySelector('.au-orn')).toBeNull()
  })
})

describe('AuroraTile — the colourful tile', () => {
  it('a tile that goes somewhere is live: stretched link on the title + the arrow', () => {
    const { container } = withRouter(
      <AuroraTileGrid cols={3}>
        <AuroraTile to="/statements" icon={Wallet} title="Statements" desc="Every saved year." verdict="good" />
      </AuroraTileGrid>,
    )
    expect(container.querySelector('.au-tiles.au-t3')).toBeTruthy()
    const tile = container.querySelector('.au-tile')
    expect(tile.classList.contains('au-tile-live')).toBe(true)
    expect(tile.querySelector('a.au-tile-hit').getAttribute('href')).toBe('/statements')
    expect(tile.querySelector('.au-go')).toBeTruthy()
    expect(tile.querySelector('.au-art svg')).toBeTruthy()
    expect(tile.querySelector('.au-pill').textContent).toBe('Good')
  })

  it('a tile with nowhere to go has no flood and no arrow; foot controls sit above the hit area', () => {
    const { container } = withRouter(
      <AuroraTile icon={Wallet} title="Print documents" foot={<button type="button">Board packet</button>} />,
    )
    const tile = container.querySelector('.au-tile')
    expect(tile.classList.contains('au-tile-live')).toBe(false)
    expect(tile.querySelector('.au-go')).toBeNull()
    expect(tile.querySelector('.au-tile-lift button').textContent).toBe('Board packet')
  })

  it('onClick tiles use a real button as the hit area', () => {
    const fn = vi.fn()
    const { container } = withRouter(<AuroraTile title="Open" onClick={fn} />)
    container.querySelector('button.au-tile-hit').click()
    expect(fn).toHaveBeenCalledOnce()
  })
})

describe('AuroraCard / AuroraEmpty / HowThisWorks / AuroraPeriodSwitch', () => {
  it('card carries title, pill and the one-line answer', () => {
    const { container } = render(
      <AuroraCard title="Money in vs. money out" verdict="good" verdictLabel="Ahead" big="+$430,000 left over" bigTone="good" />,
    )
    expect(container.querySelector('.au-card-title').textContent).toBe('Money in vs. money out')
    expect(container.querySelector('.au-pill').textContent).toBe('Ahead')
    expect(container.querySelector('.au-big.au-big-good').textContent).toBe('+$430,000 left over')
  })

  it('empty state is one line + one action', () => {
    const { container } = render(<AuroraEmpty text="No budget yet." action={<button type="button">Set up</button>} />)
    expect(container.querySelector('.au-empty-text').textContent).toBe('No budget yet.')
    expect(container.querySelectorAll('button')).toHaveLength(1)
  })

  it('How this works is a closed native disclosure', () => {
    const { container } = render(<HowThisWorks>Method.</HowThisWorks>)
    const d = container.querySelector('details.au-how')
    expect(d.open).toBe(false)
    expect(d.querySelector('summary').textContent).toContain('How this works')
  })

  it('the period switch marks the active period and records it for the assistant', () => {
    const onSelect = vi.fn()
    const periods = [
      { id: 'a', label: 'FY 2026', periodEndDate: '2026-06-30' },
      { id: 'b', label: 'FY 2025', periodEndDate: '2025-06-30' },
    ]
    const { container } = render(<AuroraPeriodSwitch periods={periods} activeId="a" onSelect={onSelect} />)
    const btns = container.querySelectorAll('.au-switch-btn')
    expect(btns[0].getAttribute('aria-pressed')).toBe('true')
    btns[1].click()
    expect(onSelect).toHaveBeenCalledWith('b')
    expect(localStorage.getItem('finrep_active_period')).toBe('b')
  })

  it('a single period is nothing to switch to — no lone pill — and labels read "FY 2026"', () => {
    const one = render(<AuroraPeriodSwitch periods={[{ id: 'a', label: 'FY26' }]} activeId="a" />)
    expect(one.container.querySelector('.au-switch')).toBeNull()
    cleanup()
    const { container } = render(
      <AuroraPeriodSwitch periods={[{ id: 'a', label: 'FY26' }, { id: 'b', label: 'FY2025' }]} activeId="a" />,
    )
    expect([...container.querySelectorAll('.au-switch-btn')].map((b) => b.textContent)).toEqual(['FY 2026', 'FY 2025'])
  })
})

describe('the hue comes from the ONE registry', () => {
  it('moduleAuroraVars derives every band colour from the locked module hue', () => {
    for (const key of ['finance', 'enrollment', 'accreditation', 'governance']) {
      const v = moduleAuroraVars(key)
      expect(v['--au-h']).toBe(moduleHue(key).toLowerCase())
      for (const k of ['--au-h2', '--au-h3', '--au-d0', '--au-d1', '--au-d2', '--au-deep']) {
        expect(v[k]).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('moduleAccentVars hands the Aurora vars to every module page root', () => {
    expect(moduleAccentVars('facilities')['--au-h']).toBe(moduleHue('facilities').toLowerCase())
  })
})

describe('Finance band words (financeAurora)', () => {
  const m = (key, status, extra = {}) => ({ key, label: key, status, available: true, value: 1, ...extra })

  it('says "closed" only of a year that has ended', () => {
    const today = new Date('2026-10-15')
    const closed = financeVerdict({ periodLabel: 'FY 2026', periodEndDate: '2026-06-30', change: 430000, today })
    expect(`${closed.lead} ${closed.em}`).toBe('FY 2026 closed $430,000 ahead')
    const open = financeVerdict({ periodLabel: 'FY 2027', periodEndDate: '2027-06-30', change: -1200, today })
    expect(`${open.lead} ${open.em}`).toBe('FY 2027 is running $1,200 behind')
    expect(open.emTone).toBe('risk')
  })

  it('names the worst banded number; ignores unbanded ones', () => {
    const v = financeVerdict({
      change: null,
      metrics: [m('operating_margin', 'good'), m('days_cash_on_hand', 'watch'), m('x', 'neutral')],
    })
    expect(v.lead).toBeNull()
    expect(v.tail).toBe('Cash is the one to watch.')
    expect(financeVerdict({ metrics: [m('x', 'neutral')] }).tail).toBeNull()
    expect(financeVerdict({ metrics: [m('operating_margin', 'good')] }).tail).toBe('Every key number looks healthy.')
    expect(metricVerdict(m('x', 'neutral'))).toBeNull()
    expect(metricVerdict({ ...m('x', 'risk'), available: false })).toBeNull()
  })

  it('cuts an insight line into a short title + one line', () => {
    expect(splitSignal('Enrollment declined 11% year-over-year; monitor pipeline and retention.')).toEqual({
      title: 'Enrollment declined 11% year-over-year',
      desc: 'Monitor pipeline and retention.',
    })
    // A linking verb splits the FIGURE (title) from the reading (one line), so a
    // KYRO insight never becomes a four-line tile title.
    expect(splitSignal('Operating reserve of 7.7 months provides solid financial cushion.')).toEqual({
      title: 'Operating reserve of 7.7 months',
      desc: 'Provides solid financial cushion.',
    })
    expect(splitSignal('Tuition dependency at 87% leaves minimal revenue diversification buffer')).toEqual({
      title: 'Tuition dependency at 87%',
      desc: 'Leaves minimal revenue diversification buffer.',
    })
    // No figure before the verb → no split (the verb is not a break on its own).
    expect(splitSignal('The board provides oversight.').desc).toBeNull()
    const tiles = warningTiles([
      { category: 'strength', text: 'Reserve is solid.' },
      { category: 'risk', text: 'Cash is low; plan ahead.' },
    ])
    expect(tiles.map((t) => t.verdict)).toEqual(['risk', 'good'])
  })

  it('captions the change on last year, or the date', () => {
    expect(kpiCaption({ available: true, periodOverPeriodDelta: 0 }, 'percent', 'Jun 30, 2026')).toBe('Same as last year')
    expect(kpiCaption({ available: true, periodOverPeriodDelta: 0.004 }, 'percent', null)).toBe('Up 0.4 pts on last year')
    expect(kpiCaption({ available: true, periodOverPeriodDelta: -3 }, 'days', null)).toBe('Down 3 on last year')
    expect(kpiCaption({ available: true, periodOverPeriodDelta: null }, 'days', 'Jun 30, 2026')).toBe('On Jun 30, 2026')
  })
})

describe('aurora.css styles every emitted class and keeps the system rules', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/aurora.css'), 'utf8')
  const index = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

  it('is imported exactly once', () => {
    expect(index.match(/@import '\.\/styles\/aurora\.css';/g)).toHaveLength(1)
  })

  it.each([
    'au-hero', 'au-fx', 'au-blob', 'au-veil', 'au-grain', 'au-ribbonart', 'au-hero-top', 'au-eyebrow', 'au-chip',
    'au-title', 'au-verdict', 'au-em', 'au-aside', 'au-monogram', 'au-actions', 'au-btn', 'au-switch', 'au-switch-btn',
    'au-kpis', 'au-kpi', 'au-kpi-lab', 'au-kpi-ic', 'au-kpi-val', 'au-kpi-unit', 'au-kpi-cap', 'au-pill', 'au-pill-i',
    'au-sec', 'au-ribbon', 'au-medal', 'au-ribbon-title', 'au-ribbon-sub', 'au-ribbon-rr', 'au-count', 'au-orn',
    'au-tiles', 'au-tile', 'au-tile-live', 'au-tile-hit', 'au-tile-lift', 'au-well', 'au-tile-title', 'au-tile-desc',
    'au-tile-foot', 'au-go', 'au-art', 'au-lbtn', 'au-card', 'au-card-head', 'au-big', 'au-cols2', 'au-chart',
    'au-tabs', 'au-tab', 'au-how', 'au-empty', 'au-empty-text', 'au-register', 'au-still',
  ])('.%s is styled', (cls) => {
    expect(css).toMatch(new RegExp(`\\.${cls}(?![\\w-])`))
  })

  it('is screen-only (a print block flattens it) and honours reduced motion', () => {
    expect(css).toMatch(/@media print \{/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    expect(css).toMatch(/\.au-hero\.au-still \.au-blob \{\s*animation: none;/)
  })
})

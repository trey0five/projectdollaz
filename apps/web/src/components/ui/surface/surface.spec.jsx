/* global process */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE PRIMITIVES — render + class contract (docs/Premium_UI_Plan.md §2.4).
//
// jsdom does no layout, so the contract is pinned on the CLASSES each primitive
// emits (surface.css is the only place those classes are styled) plus the two
// behaviours that are logic rather than CSS: DataTable sorting / empty state and
// the reduced-motion path (every primitive must render a static DOM when the
// reader asked for less motion). `useReducedMotion` is mocked with a switch so
// both paths run in one file (framer caches the media query per module).
// ─────────────────────────────────────────────────────────────────────────────
const motionState = vi.hoisted(() => ({ reduce: false }))
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useReducedMotion: () => motionState.reduce }
})

import { Page, PageHeader, StatStrip, Stat, Section, Panel, DataTable, Pill, Toolbar, Tile, Button, sortRows, REVEAL_CAP } from './index.js'

afterEach(() => {
  cleanup()
  motionState.reduce = false
})

const withRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('Page — the document shell', () => {
  it('renders `.pg` as <main> and wraps each child in a stagger item', () => {
    const { container } = render(
      <Page>
        <div>a</div>
        <div>b</div>
      </Page>,
    )
    const main = container.querySelector('main.pg')
    expect(main).toBeTruthy()
    expect(main.dataset.motion).toBe('stagger')
    expect(main.querySelectorAll(':scope > .pg-item')).toHaveLength(2)
  })

  it('reduced motion: no stagger wrappers, identical content, static marker', () => {
    motionState.reduce = true
    const { container } = render(
      <Page className="x">
        <div>a</div>
        <div>b</div>
      </Page>,
    )
    const main = container.querySelector('main.pg.x')
    expect(main.dataset.motion).toBe('static')
    expect(main.querySelector('.pg-item')).toBeNull()
    expect(main.textContent).toBe('ab')
  })
})

describe('PageHeader — eyebrow / title / meta / actions on a hairline', () => {
  it('emits the class contract and the module-hue rule', () => {
    const { container } = render(
      <PageHeader eyebrow="Finance · NMB" title="Finance" meta="Updated 2 h ago" actions={<button>Add data</button>} hue="37 99 235" />,
    )
    const head = container.querySelector('header.pg-head')
    expect(head).toBeTruthy()
    expect(head.style.getPropertyValue('--c-module')).toBe('37 99 235')
    expect(head.querySelector('.pg-head-rule')).toBeTruthy()
    expect(head.querySelector('p.pg-eyebrow').textContent).toBe('Finance · NMB')
    expect(head.querySelector('h1.pg-title').textContent).toBe('Finance')
    expect(head.querySelector('p.pg-meta').textContent).toBe('Updated 2 h ago')
    expect(head.querySelector('.pg-actions button').textContent).toBe('Add data')
  })

  it('reduced motion: the rule is a plain span (no scaleX draw)', () => {
    motionState.reduce = true
    const { container } = render(<PageHeader title="T" />)
    const rule = container.querySelector('.pg-head-rule')
    expect(rule.tagName).toBe('SPAN')
    expect(rule.getAttribute('style')).toBeNull()
  })
})

describe('StatStrip + Stat — numbers on the ground, rules between them', () => {
  it('StatStrip sets the column count from its children', () => {
    const { container } = render(
      <StatStrip>
        <Stat label="A" value={1} />
        <Stat label="B" value={2} />
        <Stat label="C" value={3} />
      </StatStrip>,
    )
    const strip = container.querySelector('.stats')
    expect(strip.style.getPropertyValue('--stats-cols')).toBe('3')
    expect(strip.querySelectorAll('.stat')).toHaveLength(3)
  })

  it('Stat: label (caps), tabular value, 2px status mark, delta pill', () => {
    motionState.reduce = true // CountUp renders the final value instantly
    const { container } = render(<Stat label="Days cash" value={112} unit="d" status="good" delta={{ text: '+3.2%', tone: 'good' }} note="vs FY26" />)
    const stat = container.querySelector('.stat')
    expect(stat.querySelector('.stat-label').textContent).toBe('Days cash')
    const value = stat.querySelector('.stat-value')
    expect(value.classList.contains('num')).toBe(true)
    expect(value.textContent).toBe('112d')
    expect(stat.querySelector('.stat-mark.tone-good')).toBeTruthy()
    expect(stat.querySelector('.stat-foot .pill.pill-status.tone-good').textContent).toBe('+3.2%')
    expect(stat.querySelector('.stat-foot').textContent).toContain('vs FY26')
  })

  it('Stat counts up from 0 when motion is allowed (one-shot CountUp)', () => {
    const { container } = render(<Stat label="Students" value={836} />)
    // First paint is the count-up's origin, not the final figure.
    expect(container.querySelector('.stat-value').textContent).toBe('0')
  })

  it('Stat: a formatted numeric uses AnimatedMetricValue; a string renders as-is; null → em dash', () => {
    motionState.reduce = true
    // The canonical formatter takes a FRACTION for percent (0.046 → "4.6%").
    const { container, rerender } = render(<Stat label="Margin" value={0.046} format="percent" />)
    expect(container.querySelector('.stat-value').textContent).toBe('4.6%')
    rerender(<Stat label="Margin" value="$6,511,719" />)
    expect(container.querySelector('.stat-value').textContent).toBe('$6,511,719')
    rerender(<Stat label="Margin" value={null} />)
    expect(container.querySelector('.stat-value').textContent).toBe('—')
  })

  it('Stat ignores an unknown status (no coloured mark for a typo)', () => {
    const { container } = render(<Stat label="x" value="1" status="purple" />)
    expect(container.querySelector('.stat-mark')).toBeNull()
  })

  // P2: HomeVitalsStrip's stats navigate to the metric drawer, so a Stat may be
  // a Link — same geometry, `.stat-link` added, children (a sparkline) under the foot.
  it('Stat with `to` is a Link wearing `.stat.stat-link`; children render after the foot', () => {
    motionState.reduce = true
    const { container } = withRouter(
      <Stat label="Margin" value="4.6%" to="/analytics?metric=operating_margin" note="vs FY26">
        <svg data-testid="spark" />
      </Stat>,
    )
    const stat = container.querySelector('a.stat.stat-link')
    expect(stat.getAttribute('href')).toBe('/analytics?metric=operating_margin')
    expect(stat.querySelector('.stat-foot').textContent).toContain('vs FY26')
    expect(stat.querySelector('.stat-foot + [data-testid="spark"]')).toBeTruthy()
  })
})

describe('Section — label + hairline + aside, no box', () => {
  it('emits the label row and the rule', () => {
    const { container } = render(
      <Section label="What needs a decision" aside={<a href="#b">view briefing</a>}>
        <p>body</p>
      </Section>,
    )
    const sec = container.querySelector('section.sec')
    expect(sec.querySelector('.sec-head h2.sec-label').textContent).toBe('What needs a decision')
    expect(sec.querySelector('.sec-head .sec-rule')).toBeTruthy()
    expect(sec.querySelector('.sec-aside a').textContent).toBe('view briefing')
    expect(sec.textContent).toContain('body')
  })

  it('omits the head entirely without a label or aside', () => {
    const { container } = render(<Section>x</Section>)
    expect(container.querySelector('.sec-head')).toBeNull()
  })
})

describe('Panel — the one raised surface', () => {
  it('is `.panel` with a padded body; tone="attention" adds the 2px mark', () => {
    const { container } = render(
      <Panel title="Upload" actions={<button>x</button>} footer={<button>Save</button>}>
        form
      </Panel>,
    )
    const panel = container.querySelector('.panel')
    expect(panel.classList.contains('panel-attention')).toBe(false)
    expect(panel.querySelector('.panel-head .panel-title').textContent).toBe('Upload')
    expect(panel.querySelector('.panel-body').textContent).toBe('form')
    expect(panel.querySelector('.panel-foot button').textContent).toBe('Save')
    const { container: c2 } = render(<Panel tone="attention" padded={false}>raw</Panel>)
    const p2 = c2.querySelector('.panel')
    expect(p2.classList.contains('panel-attention')).toBe(true)
    expect(p2.querySelector('.panel-body')).toBeNull()
  })
})

const COLS = [
  { key: 'name', header: 'School', sortable: true },
  { key: 'students', header: 'Students', num: true, sortable: true },
  { key: 'fy', header: 'FY' },
]
const ROWS = [
  { id: 1, name: 'St. Cecilia', students: 412, fy: 'FY26' },
  { id: 2, name: 'Holy Trinity', students: 836, fy: 'FY25' },
  { id: 3, name: 'Archbishop', students: 120, fy: 'FY26' },
]
const cellText = (container, col) => [...container.querySelectorAll(`tbody tr td:nth-child(${col})`)].map((td) => td.textContent)

describe('DataTable — sticky head, 36px hairline rows, right-aligned numerics', () => {
  it('emits `.dt` with scope=col headers, `.dt-num` on numeric header + cells, and a 2px mark column', () => {
    const { container } = render(<DataTable columns={COLS} rows={ROWS} markOf={(r) => (r.students > 400 ? 'good' : 'watch')} />)
    const table = container.querySelector('.dt-wrap > table.dt')
    expect(table).toBeTruthy()
    const ths = [...table.querySelectorAll('thead th')]
    expect(ths).toHaveLength(4)
    expect(ths[0].classList.contains('dt-mark')).toBe(true)
    expect(ths.slice(1).every((th) => th.getAttribute('scope') === 'col')).toBe(true)
    expect(ths[2].classList.contains('dt-num')).toBe(true)
    expect(ths[1].classList.contains('dt-num')).toBe(false)
    const firstRow = table.querySelector('tbody tr')
    expect(firstRow.children[0].classList.contains('dt-mark')).toBe(true)
    expect(firstRow.children[0].querySelector('i.tone-good')).toBeTruthy()
    expect(firstRow.children[2].classList.contains('dt-num')).toBe(true)
    expect(table.querySelectorAll('tbody tr')).toHaveLength(3)
  })

  it('sorts by a column on header click (asc → desc), with chevron state + aria-sort', () => {
    const { container } = render(<DataTable columns={COLS} rows={ROWS} />)
    const btn = screen.getByRole('button', { name: /students/i })
    fireEvent.click(btn)
    expect(cellText(container, 2)).toEqual(['120', '412', '836'])
    const th = btn.closest('th')
    expect(th.classList.contains('dt-sort-active')).toBe(true)
    expect(th.getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(btn)
    expect(cellText(container, 2)).toEqual(['836', '412', '120'])
    expect(th.classList.contains('dt-sort-desc')).toBe(true)
    expect(th.getAttribute('aria-sort')).toBe('descending')
  })

  it('a non-sortable column renders plain header text (no button)', () => {
    render(<DataTable columns={COLS} rows={ROWS} />)
    expect(screen.queryByRole('button', { name: /^FY$/ })).toBeNull()
  })

  it('controlled sort: `sort` wins and `onSort` reports the next state', () => {
    const onSort = vi.fn()
    const { container } = render(<DataTable columns={COLS} rows={ROWS} sort={{ key: 'name', dir: 'desc' }} onSort={onSort} />)
    expect(cellText(container, 1)).toEqual(['St. Cecilia', 'Holy Trinity', 'Archbishop'])
    fireEvent.click(screen.getByRole('button', { name: /school/i }))
    expect(onSort).toHaveBeenCalledWith({ key: 'name', dir: 'asc' })
    // still controlled: the order did not flip by itself
    expect(cellText(container, 1)).toEqual(['St. Cecilia', 'Holy Trinity', 'Archbishop'])
  })

  it('empty state is ONE ruled row spanning every column, not a dashed card', () => {
    const { container } = render(<DataTable columns={COLS} rows={[]} markOf={() => null} empty="No schools yet." />)
    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0].classList.contains('dt-empty')).toBe(true)
    const td = rows[0].querySelector('td')
    expect(td.getAttribute('colspan')).toBe('4')
    expect(td.textContent).toBe('No schools yet.')
  })

  it('row click makes rows links (`.dt-row-link`) and calls back with the row', () => {
    const onRowClick = vi.fn()
    const { container } = render(<DataTable columns={COLS} rows={ROWS} onRowClick={onRowClick} />)
    const row = container.querySelector('tbody tr')
    expect(row.classList.contains('dt-row-link')).toBe(true)
    fireEvent.click(row)
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0])
  })

  it('reduced motion: rows are plain <tr> with no inline opacity', () => {
    motionState.reduce = true
    const { container } = render(<DataTable columns={COLS} rows={ROWS} />)
    const row = container.querySelector('tbody tr')
    expect(row.getAttribute('style')).toBeNull()
  })

  it('sortRows: stable, null-last, numeric-aware, and the reveal stagger caps at 20', () => {
    const rows = [
      { id: 'a', v: 10 },
      { id: 'b', v: null },
      { id: 'c', v: 2 },
      { id: 'd', v: 2 },
    ]
    const cols = [{ key: 'v' }]
    expect(sortRows(rows, cols, { key: 'v', dir: 'asc' }).map((r) => r.id)).toEqual(['c', 'd', 'a', 'b'])
    expect(sortRows(rows, cols, { key: 'v', dir: 'desc' }).map((r) => r.id)).toEqual(['a', 'c', 'd', 'b'])
    expect(sortRows(rows, cols, null)).toBe(rows)
    expect(REVEAL_CAP).toBe(20)
  })
})

describe('Pill — one shape for every meaning', () => {
  it('default / status / count variants', () => {
    const { container } = render(
      <>
        <Pill>FY26</Pill>
        <Pill variant="status" tone="risk">
          7 need attention
        </Pill>
        <Pill variant="count">12</Pill>
      </>,
    )
    const pills = container.querySelectorAll('.pill')
    expect(pills).toHaveLength(3)
    expect(pills[0].querySelector('.pill-mark')).toBeNull()
    expect(pills[1].classList.contains('pill-status')).toBe(true)
    expect(pills[1].classList.contains('tone-risk')).toBe(true)
    expect(pills[1].querySelector('i.pill-mark')).toBeTruthy()
    expect(pills[2].classList.contains('pill-count')).toBe(true)
  })
})

describe('Toolbar — a 40px row on the ground', () => {
  it('is role=toolbar with an aside slot', () => {
    const { container } = render(
      <Toolbar aside={<button>Compare</button>}>
        <input aria-label="search" />
      </Toolbar>,
    )
    const bar = container.querySelector('.toolbar')
    expect(bar.getAttribute('role')).toBe('toolbar')
    expect(bar.querySelector('.toolbar-aside button').textContent).toBe('Compare')
  })
})

describe('Tile — the one card family that stays', () => {
  it('renders as a Link with hue rule, icon, title, body, foot and arrow', () => {
    const { container } = withRouter(
      <Tile to="/finance" hue="37 99 235" icon={<svg data-testid="ic" />} title="Finance" body="Statements and cash" foot={<Pill>4 signals</Pill>} />,
    )
    const tile = container.querySelector('a.tile')
    expect(tile.getAttribute('href')).toBe('/finance')
    expect(tile.style.getPropertyValue('--c-module')).toBe('37 99 235')
    expect(tile.querySelector('.tile-head .tile-icon [data-testid="ic"]')).toBeTruthy()
    expect(tile.querySelector('h3.tile-title').textContent).toBe('Finance')
    expect(tile.querySelector('p.tile-body').textContent).toBe('Statements and cash')
    expect(tile.querySelector('.tile-foot .pill').textContent).toBe('4 signals')
    expect(tile.querySelector('.tile-arrow svg')).toBeTruthy()
  })

  it('onClick → a <div> tile covered by a stretched .tile-hit <button>; no arrow when arrow={false}', () => {
    const onClick = vi.fn()
    const { container } = render(<Tile onClick={onClick} title="Pick" arrow={false} aria-label="Pick one" />)
    const tile = container.querySelector('div.tile')
    const hit = tile.querySelector('button.tile-hit')
    expect(hit.getAttribute('type')).toBe('button')
    expect(hit.getAttribute('aria-label')).toBe('Pick one')
    expect(tile.querySelector('.tile-arrow')).toBeNull()
    fireEvent.click(hit)
    expect(onClick).toHaveBeenCalled()
  })

  // P2: the home tile registry keeps hues as hex; a Tile converts them to the
  // channel triple --c-module expects, and `locked` dims the tile (no flood).
  it('accepts a hex hue, and `locked` adds `.tile-locked`', () => {
    const { container } = render(<Tile id="tile-finance" hue="#2563EB" title="Finance" locked arrow={false} />)
    const tile = container.querySelector('div.tile.tile-locked')
    expect(tile.id).toBe('tile-finance')
    expect(tile.style.getPropertyValue('--c-module')).toBe('37 99 235')
  })
})

describe('Button — flat, 36px, no bevel', () => {
  it('variants map to the class contract; default is secondary and type=button', () => {
    const { container } = render(
      <>
        <Button>Cancel</Button>
        <Button variant="primary">Save</Button>
        <Button variant="quiet" size="sm">
          More
        </Button>
      </>,
    )
    const [a, b, c] = container.querySelectorAll('button.btn')
    expect(a.classList.contains('btn-secondary')).toBe(true)
    expect(a.getAttribute('type')).toBe('button')
    expect(b.classList.contains('btn-primary')).toBe(true)
    expect(c.classList.contains('btn-quiet')).toBe(true)
    expect(c.classList.contains('btn-sm')).toBe(true)
  })

  it('`to` renders a router Link, `href` an anchor, submit stays a submit', () => {
    const { container } = withRouter(
      <>
        <Button to="/app">Home</Button>
        <Button href="https://example.com">Docs</Button>
        <Button type="submit" variant="primary">
          Go
        </Button>
      </>,
    )
    const links = container.querySelectorAll('a.btn')
    expect(links[0].getAttribute('href')).toBe('/app')
    expect(links[1].getAttribute('href')).toBe('https://example.com')
    expect(container.querySelector('button.btn').getAttribute('type')).toBe('submit')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The stylesheet contract: every class the primitives emit is styled in
// surface.css (a class nobody styles is an invisible-class trap, the same bug
// that once killed every `sky-*` utility), and the system's two non-negotiables
// — no infinite loop, no purple — hold in the file itself.
// ─────────────────────────────────────────────────────────────────────────────
describe('surface.css styles every emitted class and keeps the system rules', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/surface.css'), 'utf8')
  const EMITTED = [
    'pg', 'pg-item', 'pg-head', 'pg-head-rule', 'pg-head-main', 'pg-eyebrow', 'pg-title', 'pg-meta', 'pg-actions',
    'stats', 'stat', 'stat-label', 'stat-value', 'stat-unit', 'stat-mark', 'stat-foot',
    'sec', 'sec-head', 'sec-label', 'sec-rule', 'sec-aside',
    'panel', 'panel-attention', 'panel-body', 'panel-head', 'panel-title', 'panel-foot',
    'dt-wrap', 'dt', 'dt-num', 'dt-mark', 'dt-sort', 'dt-sort-btn', 'dt-sort-active', 'dt-sort-desc', 'dt-chev', 'dt-row-link', 'dt-empty', 'dt-actions',
    'pill', 'pill-mark', 'pill-count', 'pill-status',
    'toolbar', 'toolbar-aside',
    'tile', 'tile-head', 'tile-icon', 'tile-title', 'tile-body', 'tile-foot', 'tile-arrow',
    'btn', 'btn-primary', 'btn-secondary', 'btn-quiet', 'btn-sm',
    'tone-good', 'tone-watch', 'tone-risk', 'tone-neutral', 'tone-hue',
  ]
  for (const cls of EMITTED) {
    if (cls === 'pg-item') continue // the stagger wrapper is a plain block on purpose
    it(`.${cls} is styled`, () => {
      expect(css, `.${cls} is emitted by a primitive but surface.css never styles it`).toMatch(new RegExp(`\\.${cls}(?![\\w-])`))
    })
  }

  it('no infinite animation, no purple, glass nowhere (the top strip owns it in P2)', () => {
    expect(css).not.toMatch(/infinite/)
    expect(css).not.toMatch(/#8b5cf6|#a855f7|#7c3aed|purple|violet/i)
    expect(css).not.toMatch(/backdrop-filter/)
  })

  it('radius + elevation come from the tokens, never literals ≥ 12px', () => {
    expect(css).toMatch(/border-radius: var\(--r-panel\)/)
    expect(css).toMatch(/box-shadow: var\(--sh-panel\)/)
    expect(css).not.toMatch(/border-radius:\s*(1[2-9]|2\d)px/)
  })

  it('tabular numerals + balanced headings are screen-only and skip .ui-v1 (print is sacred)', () => {
    expect(css).toMatch(/@media screen \{[\s\S]*tabular-nums[\s\S]*text-wrap: balance/)
    expect(css).toMatch(/:where\(table, \.stat, \.num\):where\(:not\(\.ui-v1 \*\)\)/)
    expect(css).toMatch(/:where\(h1, h2, h3\):where\(:not\(\.ui-v1 \*\)\)/)
  })
})

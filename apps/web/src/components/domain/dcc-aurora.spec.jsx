import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DomainCommandCenter, { registerNoun, trimEyebrow, DomainStatePanel } from './DomainCommandCenter.jsx'
import NeedsAttentionPanel, { firstSentence } from './NeedsAttentionPanel.jsx'
import RegisterEmpty from '../module/RegisterEmpty.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// DomainCommandCenter on the Aurora band — the review fixes of 2026-10-15,
// pinned on behaviour (jsdom does no layout):
//   • at most FOUR glass KPI cards; the rest become "more figures" chips
//   • secondary header controls live in their own wrapping tools row (they
//     overlapped the buttons at 390px when they shared it)
//   • a page with no Add-data CTA still gets ONE white primary: its own New
//   • a wide register puts what needs a decision ABOVE the register
//   • the attention count says the overflow, and the strip tone is the worst
//   • an empty register offers its own New action as the one button
// ─────────────────────────────────────────────────────────────────────────────
afterEach(cleanup)

const kpi = (label, status = 'neutral') => ({ label, value: '3', status, sub: { text: 'x', tone: 'neutral' } })
const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('DomainCommandCenter — the band', () => {
  it('renders four glass cards and the rest as chips (Governance has seven)', () => {
    const { container } = wrap(
      <DomainCommandCenter
        title="Governance"
        kpis={['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((l, i) => kpi(l, i === 6 ? 'risk' : 'neutral'))}
        registerTable={<p>table</p>}
      />,
    )
    expect(container.querySelectorAll('.au-kpis .au-kpi')).toHaveLength(4)
    const chips = container.querySelectorAll('.au-kchip')
    expect(chips).toHaveLength(3)
    expect(chips[2].querySelector('.au-pill').textContent).toBe('At risk')
  })

  it('headerAside goes to the tools row, never the button row', () => {
    const { container } = wrap(
      <DomainCommandCenter
        title="Accreditation"
        onNew={() => {}}
        headerAside={
          <label>
            Division: <select className="sel" />
          </label>
        }
        registerTable={<p>t</p>}
      />,
    )
    const [main, tools] = container.querySelectorAll('.au-hero .au-actions')
    expect(main.querySelector('select')).toBeNull()
    expect(tools.classList.contains('au-tools')).toBe(true)
    expect(tools.querySelector('select')).toBeTruthy()
  })

  it('promotes the register New action to the white band button when there is no Add-data CTA', () => {
    let clicked = 0
    const { container } = wrap(
      <DomainCommandCenter
        title="Tasks"
        tabs={[
          { key: 'all', label: 'All tasks' },
          { key: 'mine', label: 'My tasks' },
        ]}
        onNew={() => (clicked += 1)}
        registerTable={<p>t</p>}
      />,
    )
    const primary = container.querySelector('.au-hero .au-actions .au-btn-primary')
    expect(primary.textContent).toBe('New task')
    fireEvent.click(primary)
    expect(clicked).toBe(1)
  })

  it('a viewer (no onNew) gets no promoted button', () => {
    const { container } = wrap(<DomainCommandCenter title="Tasks" registerTable={<p>t</p>} />)
    expect(container.querySelector('.au-hero .au-btn-primary')).toBeNull()
  })

  it('drops the module and school from a legacy "Module · School" eyebrow', () => {
    expect(trimEyebrow('Governance · Sample 01 High School', { title: 'Governance', school: 'Sample 01 High School' })).toBeNull()
    expect(trimEyebrow('Finance · Cash & Collections · live from QuickBooks', { title: 'Cash & Collections', school: null })).toBe(
      'Finance · live from QuickBooks',
    )
    expect(registerNoun('Initiatives')).toBe('initiative')
    expect(registerNoun('Documents')).toBe('document')
    expect(registerNoun('Policies')).toBe('policy')
  })

  it('shows the chip the caller passes', () => {
    const { container } = wrap(<DomainCommandCenter title="Facilities" school="All Souls" registerTable={<p>t</p>} />)
    expect(container.querySelector('.au-chip').textContent).toBe('All Souls')
  })

  it('a wide register puts Needs attention ABOVE the register, one row of three', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: String(i), tone: 'risk', title: `Item ${i}`, why: 'Why.' }))
    const { container } = wrap(
      <DomainCommandCenter title="Accreditation" wideRegister attentionItems={items} registerTable={<p>t</p>} />,
    )
    const sections = [...container.querySelectorAll('section.au-sec')]
    const titles = sections.map((s) => s.querySelector('h2')?.textContent)
    expect(titles.indexOf('Needs attention')).toBeLessThan(titles.indexOf('Records'))
    expect(container.querySelectorAll('.au-tile')).toHaveLength(3)
  })

  it('on a phone the rail jumps above the register only when it has items (empty rail stays below)', () => {
    const railOf = (c) => c.querySelector('[data-rail-order]')
    const empty = wrap(<DomainCommandCenter title="Tasks" registerTable={<p>t</p>} />)
    expect(railOf(empty.container).dataset.railOrder).toBe('natural')
    expect(railOf(empty.container).className).not.toMatch(/order-first/)
    cleanup()
    const items = [{ id: '1', tone: 'risk', title: 'Overdue', why: 'Why.' }]
    const full = wrap(<DomainCommandCenter title="Tasks" attentionItems={items} registerTable={<p>t</p>} />)
    expect(railOf(full.container).dataset.railOrder).toBe('first')
    expect(railOf(full.container).className).toMatch(/\border-first\b/)
    expect(railOf(full.container).className).toMatch(/lg:order-none/)
  })
})

describe('NeedsAttentionPanel — counts and words', () => {
  it('the count pill includes the overflow, and the strip wears the worst tone', () => {
    const { container } = render(
      <NeedsAttentionPanel
        items={[
          { id: 'a', tone: 'watch', title: 'A', why: 'x' },
          { id: 'b', tone: 'watch', title: 'B', why: 'x' },
        ]}
        moreCount={4}
      />,
    )
    expect(container.querySelector('.au-count').textContent).toBe('2 watch · 4 more')
    // all watch → the amber strip, not the rose "risk" one
    expect(container.querySelector('section').style.getPropertyValue('--sh')).toBe('#d97706')
  })

  it('a tile shows only the first sentence of the why; the full text is the tooltip', () => {
    const why = 'Evidence is missing for 3 standards. Upload proof before the visit. It takes ten minutes.'
    const { container } = render(<NeedsAttentionPanel items={[{ id: 'a', tone: 'risk', title: 'A', why }]} />)
    const desc = container.querySelector('.au-tile-desc')
    expect(desc.textContent).toBe('Evidence is missing for 3 standards.')
    expect(desc.getAttribute('title')).toBe(why)
    expect(firstSentence('Costs $1.2M this year. Plan now.')).toBe('Costs $1.2M this year.')
  })

  it('a capped list says how many more and opens them in place', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: String(i), tone: 'risk', title: `T${i}`, why: 'w' }))
    const { container, getByText } = render(<NeedsAttentionPanel items={items} wide limit={3} />)
    expect(container.querySelectorAll('.au-tile')).toHaveLength(3)
    fireEvent.click(getByText(/and 2 more/))
    expect(container.querySelectorAll('.au-tile')).toHaveLength(5)
  })
})

describe('designed empty states', () => {
  it("an empty register's one button is the register's own New action", () => {
    let n = 0
    const { getByText } = wrap(
      <DomainCommandCenter
        title="Advancement"
        onNew={() => (n += 1)}
        registerTitle="Campaigns"
        registerTable={<RegisterEmpty text="No campaigns yet." actionLabel="Add a campaign" />}
      />,
    )
    fireEvent.click(getByText('Add a campaign'))
    expect(n).toBe(1)
  })

  it('a viewer sees the line with no dead button', () => {
    const { container } = wrap(
      <DomainCommandCenter title="Knowledge" registerTable={<RegisterEmpty text="No documents yet." actionLabel="Upload a file" />} />,
    )
    expect(container.querySelector('.au-empty').textContent).toContain('No documents yet.')
    expect(container.querySelector('.au-empty button')).toBeNull()
  })

  it('DomainStatePanel is a band + one line + one button (the not-connected screen)', () => {
    const { container } = wrap(
      <DomainStatePanel
        title="Cash & Collections"
        verdict="Connect QuickBooks to see who owes the school and what it owes."
        primaryAction={<button type="button">Connect QuickBooks</button>}
        text="Not connected to QuickBooks yet."
        action={<button type="button">Connect</button>}
      />,
    )
    expect(container.querySelector('.au-hero h1').textContent).toBe('Cash & Collections')
    expect(container.querySelectorAll('.au-verdict')).toHaveLength(1)
    expect(container.querySelector('.au-empty-text').textContent).toBe('Not connected to QuickBooks yet.')
    expect(container.querySelectorAll('.au-empty button')).toHaveLength(1)
  })
})

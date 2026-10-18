import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { render, cleanup, screen, within } from '@testing-library/react'

// ─────────────────────────────────────────────────────────────────────────────
// The restored LIVE bento ("Everything on board — live.", #platform). It came
// back from the pre-redesign landing (74caaba) with every micro-demo redrawn to
// look like TODAY's app. These pin what the restore must keep true:
//   · no product screenshot plates (they showed the retired owl and a real
//     school's name) and no real school named anywhere in the section;
//   · the SIS claim names only the connectors that exist;
//   · nine domains, Academics included;
//   · the mascot is the Scholar (PennyAvatar), driven by real moods;
//   · decorative demos are aria-hidden, every cell has a heading and its
//     meaning in text, and verdicts are word + colour (never colour alone);
//   · reduced motion shows the finished still (all briefing items, final
//     counts), never a blank or half-drawn demo.
// ─────────────────────────────────────────────────────────────────────────────

const env = vi.hoisted(() => ({ reduce: false, owl: [] }))

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion')
  return { ...actual, useReducedMotion: () => env.reduce }
})
vi.mock('../../components/penny/PennyAvatar.jsx', () => ({
  default: (props) => {
    env.owl.push(props)
    return <span data-testid="scholar" />
  },
}))

beforeAll(() => {
  // jsdom has no IntersectionObserver; framer's whileInView/useInView need one.
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
})

afterEach(() => {
  cleanup()
  env.reduce = false
  env.owl = []
})

async function renderWall() {
  const { default: BentoWall, BRIEF_LINES, DOMAIN_TILES } = await import('./BentoWall.jsx')
  const utils = render(<BentoWall />)
  return { ...utils, BRIEF_LINES, DOMAIN_TILES }
}

describe('BentoWall — the live bento, depicting today’s app', () => {
  it('is the #platform section with the restored heading', async () => {
    const { container } = await renderWall()
    const section = container.querySelector('section#platform')
    expect(section).not.toBeNull()
    expect(section.getAttribute('aria-labelledby')).toBe('bento-h2')
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Everything on board — live.')
  })

  it('shows no screenshot plates and names no real school', async () => {
    const { container } = await renderWall()
    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(container.innerHTML).not.toMatch(/landing\/shots\//)
    expect(container.textContent).not.toMatch(/Sample\s*(0?1\s*)?High School/i)
    expect(container.textContent).not.toMatch(/Good morning, Jon/)
  })

  it('claims only the SIS connectors that exist', async () => {
    const { container } = await renderWall()
    const text = container.textContent
    expect(text).toMatch(/Blackbaud SKY, or a OneRoster roster file/)
    expect(text).not.toMatch(/FACTS|Veracross/)
    expect(text).not.toMatch(/(FERPA|COPPA)[- ]compliant/i)
  })

  it('shows all nine domains, Academics included, each with a status word', async () => {
    const { DOMAIN_TILES } = await renderWall()
    expect(DOMAIN_TILES.map((d) => d.label)).toEqual([
      'Finance',
      'Enrollment',
      'Academics',
      'Governance',
      'Accreditation',
      'Facilities',
      'Advancement',
      'Strategy',
      'HR',
    ])
    const heading = screen.getByRole('heading', { name: /Nine domains · one home/i })
    const tiles = within(heading.parentElement).getAllByRole('listitem')
    expect(tiles).toHaveLength(9)
    for (const t of tiles) expect(t.textContent).toMatch(/(Good|Watch|At risk)$/)
    expect(screen.getByText(/Prioritized across all nine domains/)).toBeTruthy()
  })

  it('gives every cell a heading and hides the decorative demos', async () => {
    const { container } = await renderWall()
    const cells = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent.trim())
    expect(cells).toEqual([
      'Daily briefing',
      'Analytics · peer benchmarked',
      'QuickBooks sync',
      'Ask KYRO',
      'Tasks',
      'Enrollment intelligence',
      'Board reports',
      'Strategic planning',
      'Diocese & networks',
      'Knowledge',
      'Nine domains · one home',
    ])
    // Every svg in the wall is decoration.
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.closest('[aria-hidden="true"]')).not.toBeNull()
    }
    expect(screen.getByText(/QuickBooks reports sort themselves/)).toBeTruthy()
  })

  it('briefing items carry a verdict WORD (not colour alone) and their module', async () => {
    const { BRIEF_LINES } = await renderWall()
    const items = within(screen.getByRole('heading', { name: 'Daily briefing' }).parentElement).getAllByRole('listitem')
    expect(items).toHaveLength(BRIEF_LINES.length)
    expect(items.map((li) => li.querySelector('[data-verdict]')?.textContent)).toEqual(['At risk', 'Watch', 'Good'])
    expect(items[0].textContent).toMatch(/^Finance:/)
  })

  it('the briefing banner’s counts agree with the pills it introduces', async () => {
    const { BRIEF_LINES } = await renderWall()
    const card = screen.getByRole('heading', { name: 'Daily briefing' }).parentElement
    const banner = card.querySelector('.bwr-band').textContent
    const risks = BRIEF_LINES.filter((l) => l.verdict === 'risk').length
    expect(banner).toMatch(new RegExp(`${BRIEF_LINES.length} things to know`))
    expect(banner).toMatch(new RegExp(`${risks} at risk`))
    // A "Good" item must not wear the rose/red module dot (reads as a risk).
    for (const l of BRIEF_LINES.filter((x) => x.verdict === 'good')) expect(l.hue).not.toBe('#E11D48')
  })

  it('Ask KYRO is the Scholar, listening first (the loop then thinks and talks)', async () => {
    await renderWall()
    const last = env.owl.at(-1)
    expect(last.listening).toBe(true)
    expect(last.thinking).toBe(false)
    expect(last.speaking).toBe(false)
    expect(last.thinkingDots).toBe(false)
  })

  it('reduced motion: every briefing item shows, counts are final, the owl talks still', async () => {
    env.reduce = true
    const { container } = await renderWall()
    const items = within(screen.getByRole('heading', { name: 'Daily briefing' }).parentElement).getAllByRole('listitem')
    for (const li of items) expect(li.style.opacity).toBe('1')
    expect(container.textContent).toMatch(/412/)
    expect(container.textContent).toMatch(/4\.0%/)
    expect(env.owl.at(-1).speaking).toBe(true)
  })
})

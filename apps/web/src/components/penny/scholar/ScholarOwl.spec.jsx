import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// framer-motion's useReducedMotion, switchable per test.
const motionPref = vi.hoisted(() => ({ reduce: false }))
vi.mock('framer-motion', () => ({ useReducedMotion: () => motionPref.reduce }))

import ScholarOwl, { useScholarGeometry } from './ScholarOwl.jsx'
import { scholarTicker, createScholarTicker } from './core/scholarTicker.js'
import { ASPECT } from './core/scholarGeometry.js'
import { PARTS } from './core/scholarArt.js'

// ─────────────────────────────────────────────────────────────────────────────
// <ScholarOwl>: the box rule, accessibility, unique ids, the one shared loop and
// when it stays out of it, mirroring only in the air, the dark tone on the bird
// only — and the September rule: NOTHING round behind the bird, in any state.
// The only ellipse below the bird is its ground shadow, under the feet.
// ─────────────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup()
  motionPref.reduce = false
})

const host = (c) => c.querySelector('[data-scholar-variant]')

describe('box + accessibility', () => {
  it('is a decorative box sized by height, width = 0.727 × height, honouring --kyro-size', () => {
    const { container } = render(<ScholarOwl size={72} />)
    const el = host(container)
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(el.style.getPropertyValue('--kyro-h')).toBe('var(--kyro-size, 72px)')
    expect(el.style.height).toBe('var(--kyro-h)')
    const m = /calc\(var\(--kyro-h\) \* ([\d.]+)\)/.exec(el.style.width)
    expect(Number(m[1])).toBeCloseTo(ASPECT, 3)
    expect(el.querySelector('svg').getAttribute('aria-hidden')).toBe('true')
  })

  it('re-rendering with new props keeps the same SVG (the loop never writes to orphans)', () => {
    const r = render(<ScholarOwl size={72} />)
    const root = r.container.querySelector('[data-p="root"]')
    r.rerender(<ScholarOwl size={72} speaking />)
    r.rerender(<ScholarOwl size={72} thinking facing="left" />)
    expect(r.container.querySelector('[data-p="root"]')).toBe(root)
    expect(root.isConnected).toBe(true)
  })

  it('renders every animated part', () => {
    const { container } = render(<ScholarOwl size={96} />)
    for (const k of PARTS) expect(container.querySelector(`[data-p="${k}"]`), k).toBeTruthy()
    expect(container.querySelector('[data-p="tassel"]')).toBeTruthy()
  })

  it('gives each owl unique, url()-safe ids', () => {
    const { container } = render(
      <>
        <ScholarOwl size={56} tone="dark" />
        <ScholarOwl size={56} tone="dark" />
      </>,
    )
    const ids = [...container.querySelectorAll('[id]')].map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
    // every url(#…) points at an id inside the SAME owl
    for (const owl of container.querySelectorAll('[data-scholar-variant]')) {
      const own = new Set([...owl.querySelectorAll('[id]')].map((n) => n.id))
      for (const n of owl.querySelectorAll('[clip-path],[filter]')) {
        const ref = /url\(#([^)]+)\)/.exec(n.getAttribute('clip-path') || n.getAttribute('filter'))[1]
        expect(own.has(ref)).toBe(true)
      }
    }
  })

  it('accepts every legacy KyroDove prop', () => {
    expect(() =>
      render(
        <ScholarOwl size={44} state="perched" facing="left" glance={1} blink active speaking listening celebrate paused perch={false} className="x" style={{ margin: 1 }} />,
      ),
    ).not.toThrow()
  })

  it('the flight engine reads a constant geometry with the old shape', () => {
    let g
    function Probe() {
      g = useScholarGeometry()
      return null
    }
    render(<Probe />)
    expect(g.aspect).toBeCloseTo(ASPECT, 9)
    expect(g).toHaveProperty('ax')
    expect(g).toHaveProperty('feet')
  })
})

describe('nothing round behind the bird', () => {
  const STATE_PROPS = [
    {},
    { speaking: true },
    { listening: true },
    { thinking: true },
    { oops: true },
    { mood: 'hello' },
    { celebrate: true },
    { state: 'flying', facing: 'left' },
    { state: 'gliding' },
  ]
  for (const tone of ['light', 'dark']) {
    for (const props of STATE_PROPS) {
      it(`${tone} ${JSON.stringify(props)}`, () => {
        const { container } = render(<ScholarOwl size={128} tone={tone} {...props} />)
        // no CSS disc/ring spans anywhere (the old KyroDove rule)
        for (const n of container.querySelectorAll('span')) expect(n.style.borderRadius).not.toBe('50%')
        const svg = container.querySelector('svg')
        // every circle/ellipse belongs to the bird, the thought cloud (top-right,
        // beside the bird), or is THE ground shadow
        for (const n of svg.querySelectorAll('circle, ellipse')) {
          const ok = n.closest('[data-p="root"]') || n.closest('[data-p="dots"]') || n.hasAttribute('data-shadow')
          expect(ok, n.outerHTML).toBeTruthy()
        }
        expect(svg.querySelectorAll('[data-shadow]')).toHaveLength(1)
        // the shadow sits under the feet: centred on the bird, at the feet line, flat
        const sh = svg.querySelector('[data-shadow]')
        expect(Number(sh.getAttribute('cy'))).toBeGreaterThanOrEqual(285)
        expect(Number(sh.getAttribute('ry'))).toBeLessThan(10)
        // nothing at all is painted between the shadow and the bird
        const flip = svg.querySelector('[data-p="flip"]')
        expect([...flip.children].map((c) => c.getAttribute('data-p'))).toEqual(['shadow', 'tone', 'dots'])
        // the thought cloud stays above-right of the head, never behind the body
        for (const c of svg.querySelectorAll('[data-p="dots"] circle')) {
          expect(Number(c.getAttribute('cx'))).toBeGreaterThan(210)
          expect(Number(c.getAttribute('cy'))).toBeLessThan(60)
        }
        // no stroke-only ring (the mock's listening rings) anywhere
        for (const n of svg.querySelectorAll('circle')) {
          const ring = n.getAttribute('fill') === 'none' && Number(n.getAttribute('r')) > 40
          expect(ring).toBe(false)
        }
      })
    }
  }
})

describe('tone, size variants, extras', () => {
  it('dark tone filters the BIRD only — never the shadow', () => {
    const { container } = render(<ScholarOwl size={54} tone="dark" />)
    const svg = container.querySelector('svg')
    const tone = svg.querySelector('[data-p="tone"]')
    expect(tone.getAttribute('filter')).toMatch(/^url\(#/)
    expect(tone.querySelector('[data-p="root"]')).toBeTruthy()
    expect(tone.querySelector('[data-shadow]')).toBeNull()
    expect(svg.querySelectorAll('[filter]')).toHaveLength(1)
    const light = render(<ScholarOwl size={54} />).container
    expect(light.querySelectorAll('[filter]')).toHaveLength(0)
  })

  it('≤36px draws the tiny owl: thicker spectacles, no belly chevrons', () => {
    const tiny = host(render(<ScholarOwl size={30} />).container)
    const full = host(render(<ScholarOwl size={40} />).container)
    expect(tiny.getAttribute('data-scholar-variant')).toBe('tiny')
    expect(full.getAttribute('data-scholar-variant')).toBe('full')
    const lens = (el) => Number(el.querySelector('[data-p="glasses"] circle').getAttribute('stroke-width'))
    expect(lens(tiny)).toBeGreaterThan(lens(full))
    expect(tiny.querySelector('path[d^="M108 204"]')).toBeNull()
    expect(full.querySelector('path[d^="M108 204"]')).toBeTruthy()
  })

  it('confetti only on owls ≥96px, and can be turned off', () => {
    expect(render(<ScholarOwl size={72} />).container.querySelectorAll('[data-cf]')).toHaveLength(0)
    expect(render(<ScholarOwl size={128} />).container.querySelectorAll('[data-cf]').length).toBeGreaterThan(0)
    expect(render(<ScholarOwl size={128} confetti={false} />).container.querySelectorAll('[data-cf]')).toHaveLength(0)
  })

  it('perch={false} hides the ground shadow; thinkingDots={false} hides the cloud', () => {
    const { container } = render(<ScholarOwl size={96} perch={false} thinking thinkingDots={false} paused />)
    expect(container.querySelector('[data-p="shadow"]').getAttribute('opacity')).toBe('0')
    expect(container.querySelector('[data-p="dots"]').getAttribute('opacity')).toBe('0')
  })

  it('perched never mirrors, whatever `facing` says', () => {
    const { container } = render(<ScholarOwl size={72} facing="left" paused />)
    expect(container.querySelector('[data-p="flip"]').getAttribute('transform')).toBeNull()
    expect(host(container).getAttribute('data-kyro-facing')).toBe('left')
  })
})

describe('the one shared loop', () => {
  it('every owl joins ONE ticker, and leaves it on unmount', () => {
    const before = scholarTicker().size
    const r = render(
      <>
        <ScholarOwl size={40} />
        <ScholarOwl size={56} speaking />
        <ScholarOwl size={72} thinking />
      </>,
    )
    expect(scholarTicker().size).toBe(before + 3)
    r.unmount()
    expect(scholarTicker().size).toBe(before)
  })

  it('reduced motion: never joins, paints the still owl once', () => {
    motionPref.reduce = true
    const before = scholarTicker().size
    const { container } = render(<ScholarOwl size={72} state="flying" facing="left" speaking celebrate />)
    expect(scholarTicker().size).toBe(before)
    const el = host(container)
    expect(el.getAttribute('data-scholar-state')).toBe('still')
    expect(el.getAttribute('data-kyro-state')).toBe('perched')
    expect(container.querySelector('[data-p="flip"]').getAttribute('transform')).toBeNull()
    expect(container.querySelector('[data-p="wingR"]').getAttribute('transform')).toBeNull()
  })

  it('paused owls do not keep the loop running', () => {
    const raf = vi.fn(() => 1)
    const t = createScholarTicker({ raf, caf: vi.fn(), isHidden: () => false, onVisibility: () => () => {}, makeObserver: () => null })
    const e = { write: vi.fn(), paused: true }
    t.add(e)
    expect(raf).not.toHaveBeenCalled()
    t.set(e, { paused: false })
    expect(raf).toHaveBeenCalledTimes(1)
  })
})

describe('createScholarTicker', () => {
  const env = () => {
    const q = []
    let hidden = false
    let vis = () => {}
    let io = null
    const ticker = createScholarTicker({
      raf: (cb) => {
        q.push(cb)
        return q.length
      },
      caf: () => {
        q.length = 0
      },
      isHidden: () => hidden,
      onVisibility: (fn) => {
        vis = fn
        return () => {}
      },
      makeObserver: (cb) => {
        io = { cb, observe() {}, unobserve() {}, disconnect() {} }
        return io
      },
    })
    const flush = (ts) => {
      const cbs = q.splice(0)
      cbs.forEach((cb) => cb(ts))
    }
    return { ticker, q, flush, setHidden: (h) => ((hidden = h), vis()), intersect: (el, v) => io.cb([{ target: el, isIntersecting: v }]) }
  }

  it('reads every owl before writing any (no layout thrash)', () => {
    const { ticker, flush } = env()
    const log = []
    for (const n of ['a', 'b']) ticker.add({ read: () => log.push(`r${n}`), write: () => log.push(`w${n}`) })
    flush(16)
    expect(log).toEqual(['ra', 'rb', 'wa', 'wb'])
  })

  it('stops when the tab is hidden and resumes when shown', () => {
    const { ticker, q, flush, setHidden } = env()
    ticker.add({ write: () => {} })
    expect(q).toHaveLength(1)
    setHidden(true)
    expect(ticker.running).toBe(false)
    flush(16)
    expect(q).toHaveLength(0)
    setHidden(false)
    expect(ticker.running).toBe(true)
  })

  it('stops when every owl is off-screen', () => {
    const { ticker, intersect } = env()
    const el = {}
    const write = vi.fn()
    ticker.add({ el, write })
    intersect(el, false)
    expect(ticker.running).toBe(false)
    intersect(el, true)
    expect(ticker.running).toBe(true)
  })
})

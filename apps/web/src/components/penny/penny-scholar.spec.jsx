import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// `process` is imported (not a global) — the lint runs under the browser env.
import process from 'node:process'

// ─────────────────────────────────────────────────────────────────────────────
// The flying guide (Penny.jsx) wired to the Scholar: the box it measures, the
// sizes, mirroring only in the air, the gaze at rest, and the story hooks —
// hello on a new guide step (after the landing), talking while the brief is
// read, thinking while KYRO AI works, a one-shot cap toss on 'penny:mood' — and
// the finish bar that sends it. PennyAvatar is stubbed so each test reads the
// exact props the owl is given.
// ─────────────────────────────────────────────────────────────────────────────

const env = vi.hoisted(() => ({ reduce: false, guide: null, chatOpen: false, pathname: '/app', onBusy: null }))

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion')
  return { ...actual, useReducedMotion: () => env.reduce }
})
vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: env.pathname }) }))
vi.mock('../../context/PennyContext.jsx', () => ({
  usePenny: () => ({
    chatOpen: env.chatOpen,
    toggleChat: () => {},
    closeChat: () => {},
    guide: env.guide,
    advance: () => {},
    dismissGuide: () => {},
  }),
}))
vi.mock('./PennyChat.jsx', () => ({
  default: ({ onBusyChange }) => {
    env.onBusy = onBusyChange
    return null
  },
}))
// The brief's voice transport: a segment that never finishes (still being read).
vi.mock('./hooks/useTextToSpeech.js', () => {
  const stop = () => {}
  const speakSegment = () => new Promise(() => {})
  return { useTextToSpeech: () => ({ stop, speakSegment, supported: true }) }
})
vi.mock('./PennyAvatar.jsx', () => ({
  default: (p) => (
    <span
      data-testid="owl-props"
      data-size={p.size}
      data-state={p.state}
      data-facing={p.facing ?? 'front'}
      data-speaking={String(!!p.speaking)}
      data-thinking={String(!!p.thinking)}
      data-dots={String(p.thinkingDots !== false)}
      data-mood={p.mood ?? ''}
      data-mood-key={p.moodKey ?? ''}
    />
  ),
}))

import Penny from './Penny.jsx'
import { SCHOLAR_GEOMETRY } from './scholar/core/scholarGeometry.js'
import { STATES } from './scholar/core/scholarTracks.js'
import { createScholarAnimator } from './scholar/core/scholarEval.js'
import IntakeFinishBar, { celebrateFinish } from '../intake/IntakeFinishBar.jsx'
import { useNarrationPlayer } from './hooks/useNarrationPlayer.js'

const owl = () => screen.getByTestId('owl-props')
const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')

beforeEach(() => {
  window.matchMedia =
    window.matchMedia ||
    ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Object.assign(env, { reduce: false, guide: null, chatOpen: false, pathname: '/app', onBusy: null })
  for (const id of ['target-card', 'late-card', 'side-wall']) document.getElementById(id)?.remove()
})

const card = (id, rect) => {
  const el = document.createElement('div')
  el.id = id
  el.getBoundingClientRect = () => ({ ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top })
  el.scrollIntoView = () => {}
  document.body.appendChild(el)
  return el
}
const desktop = () => {
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
}
const SEGS = [{ kind: 'intro', text: 'Good morning.' }, { kind: 'item', itemId: 'a', text: 'Cash is low.' }]
function BriefPlayer({ onReady, segs = SEGS }) {
  const player = useNarrationPlayer(segs, 's1')
  onReady(player)
  return null
}

describe('the flying guide flies the Scholar', () => {
  it('72px on desktop, front-facing at home, the owl button keeps its test id', () => {
    render(<Penny />)
    expect(owl().dataset.size).toBe('72')
    expect(owl().dataset.state).toBe('perched')
    expect(owl().dataset.facing).toBe('front')
    expect(screen.getByTestId('kyro-dove').getAttribute('aria-label')).toBe('Open KYRO AI')
  })

  it('52px on a phone', () => {
    const mm = window.matchMedia
    window.matchMedia = (q) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })
    render(<Penny />)
    expect(owl().dataset.size).toBe('52')
    window.matchMedia = mm
  })

  it('the box is the Scholar’s: width = round(H × 0.727) — no sprite manifest', () => {
    expect(SCHOLAR_GEOMETRY.aspect).toBeCloseTo(0.727, 2)
    const src = read('components/penny/Penny.jsx')
    expect(src).toMatch(/useScholarGeometry\(\)/)
    expect(src).not.toMatch(/KyroDove|kyro-settle|useKyroGeometry/)
    // no random head-bob; the parked bob is 3px
    expect(src).not.toMatch(/Math\.random/)
    expect(src).toMatch(/\{ y: \[0, -3, 0\] \}/)
  })
})

describe('story hooks', () => {
  it('talks while the brief is read aloud (penny:narrate-active)', () => {
    render(<Penny />)
    act(() => {
      window.dispatchEvent(new CustomEvent('penny:narrate-active', { detail: { itemId: null, playing: true } }))
    })
    expect(owl().dataset.speaking).toBe('true')
    act(() => {
      window.dispatchEvent(new CustomEvent('penny:narrate-active', { detail: { itemId: 'x', playing: true } }))
    })
    expect(owl().dataset.speaking).toBe('true')
    act(() => {
      window.dispatchEvent(new CustomEvent('penny:narrate-active', { detail: { itemId: null, playing: false } }))
    })
    expect(owl().dataset.speaking).toBe('false')
  })

  it('stops talking when the brief unmounts mid-read (navigating away, switching school)', async () => {
    let player = null
    render(<Penny />)
    const brief = render(<BriefPlayer onReady={(p) => (player = p)} />)
    await act(async () => player.play())
    expect(owl().dataset.speaking).toBe('true')
    brief.unmount() // the page with the brief is gone; the segment never finished
    expect(owl().dataset.speaking).toBe('false')
  })

  it('stops talking when the brief’s segments change mid-read', async () => {
    let player = null
    render(<Penny />)
    const onReady = (p) => (player = p)
    const r = render(<BriefPlayer onReady={onReady} />)
    await act(async () => player.play())
    expect(owl().dataset.speaking).toBe('true')
    await act(async () => r.rerender(<BriefPlayer onReady={onReady} segs={[...SEGS]} />))
    expect(owl().dataset.speaking).toBe('false')
  })

  it('thinks while KYRO AI works', () => {
    render(<Penny />)
    expect(owl().dataset.thinking).toBe('false')
    act(() => env.onBusy(true))
    expect(owl().dataset.thinking).toBe('true')
    act(() => env.onBusy(false))
    expect(owl().dataset.thinking).toBe('false')
  })

  it('one-shot moods on penny:mood (each event replays); unknown moods are ignored', () => {
    render(<Penny />)
    act(() => {
      window.dispatchEvent(new CustomEvent('penny:mood', { detail: { mood: 'celebrate' } }))
    })
    expect(owl().dataset.mood).toBe('celebrate')
    const k1 = owl().dataset.moodKey
    act(() => {
      window.dispatchEvent(new CustomEvent('penny:mood', { detail: { mood: 'celebrate' } }))
    })
    expect(owl().dataset.moodKey).not.toBe(k1)
    act(() => {
      window.dispatchEvent(new CustomEvent('penny:mood', { detail: { mood: 'explode' } }))
    })
    expect(owl().dataset.mood).toBe('celebrate')
  })

  it('a guide step: flies (mirroring), lands, THEN says hello; dots hide under the bubble', () => {
    vi.useFakeTimers()
    const el = document.createElement('div')
    el.id = 'target-card'
    el.getBoundingClientRect = () => ({ top: 300, left: 400, right: 700, bottom: 400, width: 300, height: 100 })
    document.body.appendChild(el)
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
    env.guide = { steps: [{ targetId: 'target-card', message: 'Start here' }], index: 0 }
    render(<Penny />)
    expect(owl().dataset.dots).toBe('false') // a bubble shows
    act(() => vi.advanceTimersByTime(80)) // first measure pass
    expect(owl().dataset.state).toBe('flying')
    expect(owl().dataset.facing).toBe('left') // home is bottom-right → flies left
    expect(owl().dataset.mood).toBe('') // no hello mid-air
    act(() => vi.advanceTimersByTime(1500)) // flight over (≤1.4s)
    expect(owl().dataset.state).toBe('perched')
    expect(owl().dataset.facing).toBe('right') // beside the card's left edge → gaze at it
    expect(owl().dataset.mood).toBe('') // the landing plays first
    act(() => vi.advanceTimersByTime(STATES.landing.dur + 100))
    expect(owl().dataset.mood).toBe('hello')
  })

  it('a second step says hello only after landing beside ITS target (not at the old spot)', () => {
    vi.useFakeTimers()
    desktop()
    card('target-card', { top: 300, left: 400, right: 700, bottom: 400 })
    const steps = [
      { targetId: 'target-card', message: 'Start here' },
      { targetId: 'late-card', message: 'Then here' },
    ]
    env.guide = { steps, index: 0 }
    const r = render(<Penny />)
    act(() => vi.advanceTimersByTime(80))
    act(() => vi.advanceTimersByTime(1500))
    act(() => vi.advanceTimersByTime(STATES.landing.dur + 100))
    expect(owl().dataset.moodKey).toBe('0-target-card')
    // step 2's target mounts late (an agent walkthrough changing page)
    env.guide = { steps, index: 1 }
    r.rerender(<Penny />)
    act(() => vi.advanceTimersByTime(150))
    expect(owl().dataset.moodKey).toBe('0-target-card') // no hello at the old spot
    card('late-card', { top: 700, left: 900, right: 1200, bottom: 800 })
    act(() => vi.advanceTimersByTime(100)) // the 220ms measure pass finds it
    expect(owl().dataset.state).toBe('flying')
    expect(owl().dataset.moodKey).toBe('0-target-card')
    act(() => vi.advanceTimersByTime(1500))
    expect(owl().dataset.state).toBe('perched')
    expect(owl().dataset.moodKey).toBe('0-target-card') // the landing first
    act(() => vi.advanceTimersByTime(STATES.landing.dur + 100))
    expect(owl().dataset.mood).toBe('hello')
    expect(owl().dataset.moodKey).toBe('1-late-card')
  })

  it('never perches on the sidebar beside a first-column card: it takes the card’s right', () => {
    vi.useFakeTimers()
    desktop()
    const wall = card('side-wall', { top: 0, left: 0, right: 256, bottom: 900 })
    wall.setAttribute('data-kyro-wall', '')
    card('target-card', { top: 300, left: 296, right: 700, bottom: 400 })
    env.guide = { steps: [{ targetId: 'target-card', message: 'Add data' }], index: 0 }
    render(<Penny />)
    act(() => vi.advanceTimersByTime(80))
    act(() => vi.advanceTimersByTime(1500))
    expect(owl().dataset.state).toBe('perched')
    expect(owl().dataset.facing).toBe('left') // perched on the card's RIGHT, looking back at it
    const src = read('components/nav/AppShell.jsx')
    expect(src.match(/<aside data-kyro-wall /g)).toHaveLength(2)
  })

  it('reduced motion: placed instantly, perched, no hello', () => {
    vi.useFakeTimers()
    env.reduce = true
    const el = document.createElement('div')
    el.id = 'target-card'
    el.getBoundingClientRect = () => ({ top: 300, left: 400, right: 700, bottom: 400, width: 300, height: 100 })
    el.scrollIntoView = () => {}
    document.body.appendChild(el)
    env.guide = { steps: [{ targetId: 'target-card', message: 'Start here' }], index: 0 }
    render(<Penny />)
    act(() => vi.advanceTimersByTime(3000))
    expect(owl().dataset.state).toBe('perched')
    expect(owl().dataset.mood).toBe('')
  })
})

describe('the finish bar sends the cap toss', () => {
  const moods = []
  const onMood = (e) => moods.push(e.detail.mood)
  beforeEach(() => {
    moods.length = 0
    window.addEventListener('penny:mood', onMood)
  })
  afterEach(() => window.removeEventListener('penny:mood', onMood))
  const flush = () => act(async () => {})

  it('ready → "Done — show my numbers" → one celebrate', async () => {
    render(<IntakeFinishBar state="ready" onFinish={() => undefined} />)
    fireEvent.click(screen.getByTestId('finish-button'))
    await flush()
    expect(moods).toEqual(['celebrate'])
  })

  it('a finish that reports an error, or a non-ready finish, never celebrates', async () => {
    render(<IntakeFinishBar state="ready" onFinish={async () => 'We could not save that file.'} />)
    fireEvent.click(screen.getByTestId('finish-button'))
    cleanup()
    render(<IntakeFinishBar state="review" reviewCount={3} onFinish={() => {}} />)
    fireEvent.click(screen.getByTestId('finish-button'))
    await flush()
    celebrateFinish(Promise.reject(new Error('x')))
    celebrateFinish(false)
    await flush()
    expect(moods).toEqual([])
  })
})

describe('a scripted blink is a real blink', () => {
  it('blinkStart shuts the eyes for a beat, then they open', () => {
    const a = createScholarAnimator({ seed: 3 })
    // find a moment the seeded blink leaves the eyes open
    let t = 1000
    while (a.update(t, {}).pose.parts.eyeOpenL.sy < 0.99 && t < 20000) t += 50
    const shut = a.update(t + 80, { blinkStart: t }).pose.parts.eyeOpenL.sy
    expect(shut).toBeLessThan(0.3)
    const open = a.update(t + 400, { blinkStart: t }).pose.parts.eyeOpenL.sy
    expect(open).toBeGreaterThan(0.95)
  })
})

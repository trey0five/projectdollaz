// The orbit's Scholar choreography is a pure function of scroll progress, so it
// replays (and reverses) exactly: no timers, no stored story state.
import { describe, expect, it } from 'vitest'
import {
  FLIGHT,
  TURN_HYSTERESIS,
  beatOwl,
  flightPhase,
  flightPoint,
  flightProgress,
  orbitBeat,
  settleDuration,
  settleTarget,
  travelDir,
} from './orbitOwl.js'

// Orbit progress v for dock coordinate x (dock k is docked around x = k).
const vAt = (x) => 0.1 + 0.8 * ((x + 0.3) / 7.6)

describe('the fly-in (approach progress)', () => {
  it('is hidden before the flight starts and perched once the stage pins', () => {
    expect(flightProgress(0)).toBe(0)
    expect(flightPoint(0).o).toBe(0)
    expect(flightProgress(FLIGHT.end)).toBe(1)
    expect(flightProgress(1)).toBe(1)
    expect(flightPhase(1, 1)).toBe('perched')
    expect(flightPhase(1, -1)).toBe('perched')
  })

  it('starts fully past the left edge of the viewport and lands exactly on the core', () => {
    const env = { vw: 390, vh: 844, owlW: 76 }
    const start = flightPoint(0, env)
    expect(start.x + env.vw / 2 + env.owlW / 2).toBeLessThan(-env.owlW / 2)
    const end = flightPoint(1, env)
    expect(end.x).toBeCloseTo(0, 6)
    expect(end.y).toBeCloseTo(0, 6)
  })

  it('flies, then glides the last stretch scrolling down; scrolling up it only flies', () => {
    expect(flightPhase(0.3, 1)).toBe('flying')
    expect(flightPhase(0.9, 1)).toBe('gliding')
    expect(flightPhase(0.9, -1)).toBe('flying')
  })

  it('swoops UNDER the copy: never higher than 8% of the viewport above the core on desktop', () => {
    const env = { vw: 1440, vh: 900, owlW: 102 }
    for (let f = 0; f <= 1.0001; f += 0.02) expect(flightPoint(Math.min(1, f), env).y).toBeGreaterThan(-0.08 * env.vh)
  })

  it('a flight left hanging finishes by itself: lands scrolling down, flies out scrolling up', () => {
    expect(settleTarget(0.28, 1)).toBe(1)
    expect(settleTarget(0.28, -1)).toBe(0)
    expect(settleTarget(0, 1)).toBeNull() // not started
    expect(settleTarget(1, -1)).toBeNull() // landed
    expect(settleDuration(0.28, 1)).toBeLessThan(0.7)
    expect(settleDuration(0.95, 1)).toBeGreaterThan(0.3)
  })

  it('moves monotonically toward the core (no snap at the glide switch)', () => {
    const env = { vw: 1440, vh: 900, owlW: 102 }
    let prev = flightPoint(0, env).x
    for (let f = 0.01; f <= 1.0001; f += 0.01) {
      const x = flightPoint(Math.min(1, f), env).x
      expect(x).toBeGreaterThanOrEqual(prev - 1e-9)
      expect(x - prev).toBeLessThan(40)
      prev = x
    }
  })
})

describe('which way it faces in the air', () => {
  it('turns only after a real scroll the other way (layout jitter never flips it)', () => {
    let t = { dir: 1, anchor: 0.5 }
    t = travelDir(t, 0.6)
    expect(t.dir).toBe(1)
    t = travelDir(t, 0.6 - TURN_HYSTERESIS / 2) // a one-pixel relayout
    expect(t.dir).toBe(1)
    t = travelDir(t, 0.62)
    expect(t).toEqual({ dir: 1, anchor: 0.62 })
    t = travelDir(t, 0.6) // scrolled back up for real
    expect(t.dir).toBe(-1)
    t = travelDir(t, 0.6 + TURN_HYSTERESIS / 2)
    expect(t.dir).toBe(-1)
    t = travelDir(t, 0.7)
    expect(t.dir).toBe(1)
  })
})

describe('the beats (orbit progress)', () => {
  it('arrives, waves, then listens / talks / thinks per dock, and celebrates at the end', () => {
    expect(orbitBeat(0)).toBe('arrive')
    expect(orbitBeat(0.06)).toBe('hello')
    expect(orbitBeat(0.1)).toBe('listen-0')
    expect(orbitBeat(vAt(0.2))).toBe('talk-0')
    expect(orbitBeat(vAt(0.5))).toBe('think-0')
    expect(orbitBeat(vAt(0.9))).toBe('listen-1')
    expect(orbitBeat(vAt(6.9))).toBe('listen-7')
    expect(orbitBeat(vAt(7.2))).toBe('talk-7') // the last dock talks too
    expect(orbitBeat(0.8999)).toBe('talk-7')
    expect(orbitBeat(0.9)).toBe('celebrate')
    expect(orbitBeat(1)).toBe('celebrate')
  })

  it('keeps one key across the transit (no flip at the dock hand-off)', () => {
    const mid = vAt(2.5)
    expect(orbitBeat(mid - 0.001)).toBe('think-2')
    expect(orbitBeat(mid + 0.001)).toBe('think-2')
  })

  it('is the same beat for the same progress, whichever way you scrolled', () => {
    const vs = Array.from({ length: 201 }, (_, i) => i / 200)
    const down = vs.map(orbitBeat)
    const up = [...vs].reverse().map(orbitBeat).reverse()
    expect(up).toEqual(down)
    // and every dock gets all three beats on the way through — listen and
    // talk on every one of the eight, the first and last included
    for (let k = 0; k < 8; k++) {
      expect(down).toContain(`listen-${k}`)
      expect(down).toContain(`talk-${k}`)
      if (k < 7) expect(down).toContain(`think-${k}`)
    }
    // symmetric: the first dock listens as long as the last one talks
    const span = (key) => down.filter((b) => b === key).length
    expect(Math.abs(span('listen-0') - span('listen-3'))).toBeLessThanOrEqual(1)
    expect(Math.abs(span('talk-7') - span('talk-3'))).toBeLessThanOrEqual(1)
  })

  it('maps beats to owl props (HELD moods only on hello / celebrate)', () => {
    expect(beatOwl('listen-3')).toMatchObject({ listening: true, speaking: false, thinking: false, mood: null })
    expect(beatOwl('talk-3', { wide: true })).toMatchObject({ speaking: true, facing: 'right' })
    expect(beatOwl('talk-3')).toMatchObject({ speaking: true, facing: undefined })
    expect(beatOwl('think-3')).toMatchObject({ thinking: true })
    expect(beatOwl('hello')).toMatchObject({ mood: 'hello', moodHold: true })
    expect(beatOwl('celebrate')).toMatchObject({ mood: 'celebrate', moodHold: true })
    expect(beatOwl('listen-0')).toMatchObject({ mood: null, moodHold: true })
    expect(beatOwl('arrive')).toMatchObject({ speaking: false, listening: false, thinking: false, mood: null })
  })
})

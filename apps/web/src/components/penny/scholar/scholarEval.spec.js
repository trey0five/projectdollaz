import { describe, it, expect, vi } from 'vitest'
import {
  poseAt,
  evalTrack,
  ease,
  timelinePose,
  blendPose,
  enterWeights,
  resolveState,
  blinkAt,
  confettiAt,
  createScholarAnimator,
  idleLoop,
  hash01,
  CONFETTI_MS,
  FIDGET_ODDS,
  turnScale,
  MIN_TURN_SCALE,
  MIRROR_MS,
} from './core/scholarEval.js'
import { STATES, POSES, MOODS, tr } from './core/scholarTracks.js'
import { PARTS, transformAttr } from './core/scholarArt.js'
import { ASPECT, CENTER, FEET, VIEWBOX } from './core/scholarGeometry.js'

// ─────────────────────────────────────────────────────────────────────────────
// The Scholar's engine: poses are a pure function of (state, time), the state
// precedence holds, and the flight cuts never pop. The film rig seeks frames in
// any order, so determinism here is a contract, not a nicety.
// ─────────────────────────────────────────────────────────────────────────────

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

describe('poseAt is pure and deterministic', () => {
  it('returns the same pose for the same (state, t), and never touches Math.random', () => {
    const spy = vi.spyOn(Math, 'random')
    for (const s of Object.keys(STATES)) {
      for (const t of [0, 137, 999, 2400, 7777]) expect(poseAt(s, t)).toEqual(poseAt(s, t))
    }
    expect(spy).not.toHaveBeenCalled()
  })

  it('every track drives a real part (no leftover listening rings)', () => {
    for (const [name, st] of Object.entries(STATES)) {
      for (const tk of st.tracks) expect(PARTS, `${name} → ${tk.p}`).toContain(tk.p)
      for (const k of Object.keys(st.base || {})) expect(PARTS).toContain(k)
    }
    expect(PARTS).not.toContain('pulseA')
    expect(PARTS).not.toContain('pulseB')
  })

  it('matches the held keyframes of the mock', () => {
    // hello: the cap tip holds tr(6,-22,16) from .66 to .78 of 3700ms.
    const cap = poseAt('hello', 0.7 * 3700).parts.cap
    expect([cap.x, cap.y, cap.r]).toEqual([6, -22, 16])
    // listening settles on the mock's To() targets (its base pose).
    const l = poseAt('listening', 400 + 520) // inside the loop's hold segment
    expect(l.parts.root).toMatchObject(tr(0, 5, -3, 1.045))
    expect(l.parts.tuftL).toMatchObject(tr(0, -3, -12))
    // thinking shows the cloud once it has popped in, and keeps it.
    expect(poseAt('thinking', 2000).parts.dots.o).toBe(1)
    expect(poseAt('thinking', 0).parts.dots.o).toBe(0)
    // the reduced-motion owl is the neutral owl.
    const still = poseAt('still', 5000)
    for (const k of ['root', 'head', 'wingL', 'wingR', 'cap']) expect(transformAttr(k, still.parts[k])).toBe('')
  })

  it('eases each segment with the easing of the keyframe that starts it', () => {
    const tk = { p: 'head', d: 1000, k: [[0, tr(0, 0, 0), 'EIN'], [0.5, tr(0, 0, 10)], [1, tr(0, 0, 10)]] }
    expect(close(evalTrack(tk, 250).r, 10 * ease('EIN', 0.5))).toBe(true)
    // the second segment has no easing → linear, and holds.
    expect(evalTrack(tk, 750).r).toBe(10)
    // a one-shot holds its last value after it ends; a loop wraps.
    expect(evalTrack(tk, 5000).r).toBe(10)
    expect(close(evalTrack({ ...tk, loop: true }, 1250).r, evalTrack(tk, 250).r)).toBe(true)
    // inactive before its delay.
    expect(evalTrack({ ...tk, delay: 300 }, 100)).toBeUndefined()
  })
})

describe('state precedence', () => {
  const base = { reduced: false, phase: 'perched', landing: false, mood: null, oops: false, talking: false, listening: false, thinking: false }
  it('reduced motion > flying > gliding > landing > mood > oops > talking > listening > thinking > idle', () => {
    const all = { ...base, reduced: true, phase: 'flying', landing: true, mood: 'hello', oops: true, talking: true, listening: true, thinking: true }
    expect(resolveState(all)).toBe('still')
    expect(resolveState({ ...all, reduced: false })).toBe('flying')
    expect(resolveState({ ...all, reduced: false, phase: 'gliding' })).toBe('gliding')
    expect(resolveState({ ...all, reduced: false, phase: 'perched' })).toBe('landing')
    expect(resolveState({ ...all, reduced: false, phase: 'perched', landing: false })).toBe('hello')
    expect(resolveState({ ...base, oops: true, talking: true, listening: true, thinking: true })).toBe('oops')
    expect(resolveState({ ...base, talking: true, listening: true, thinking: true })).toBe('talking')
    expect(resolveState({ ...base, listening: true, thinking: true })).toBe('listening')
    expect(resolveState({ ...base, thinking: true })).toBe('thinking')
    expect(resolveState(base)).toBe('idle')
  })
  it('every mood is a real state', () => {
    for (const m of MOODS) expect(STATES[m]).toBeTruthy()
    expect(Object.keys(POSES)).toEqual(expect.arrayContaining(['wink', 'whoa', 'hello', 'oops']))
  })
})

describe('timeline + blends', () => {
  it('a switch starts from exactly the pose the owl had (no pop)', () => {
    const ev = [{ t: 0, state: 'talking' }, { t: 1234, state: 'thinking' }]
    const before = timelinePose(ev.slice(0, 1), 1234)
    const at = timelinePose(ev, 1234)
    for (const k of PARTS) {
      expect(close(at.parts[k].x, before.parts[k].x, 1e-9)).toBe(true)
      expect(close(at.parts[k].r, before.parts[k].r, 1e-9)).toBe(true)
    }
  })

  it('is seekable in any order', () => {
    const ev = [{ t: 0, state: 'idle' }, { t: 900, state: 'hello' }, { t: 2000, state: 'celebrate' }, { t: 2100, state: 'idle' }]
    const ts = [2150, 50, 1990, 905, 2400]
    const a = ts.map((t) => timelinePose(ev, t))
    const b = [...ts].reverse().map((t) => timelinePose(ev, t)).reverse()
    expect(a).toEqual(b)
  })

  it('unwinds the cap toss so a blend never spins the cap backwards', () => {
    const from = poseAt('celebrate', 2500) // cap at 360°
    expect(from.parts.cap.r).toBe(360)
    const to = poseAt('idle', 0)
    const mid = blendPose(from, to, enterWeights('idle', 130))
    expect(Math.abs(mid.parts.cap.r)).toBeLessThan(5)
  })

  it('the flight cuts keep the body still (≤1px at 72px)', () => {
    const pxPerUnit = 72 / VIEWBOX.h
    // flying → gliding → landing, cut at a few phases of the wingbeat
    for (const t0 of [0, 70, 150, 220]) {
      const ev = [
        { t: 0, state: 'idle' },
        { t: 1000, state: 'flying' },
        { t: 1800 + t0, state: 'gliding' },
        { t: 2000 + t0, state: 'landing' },
      ]
      for (const cut of [1800 + t0, 2000 + t0]) {
        const a = timelinePose(ev, cut - 0.0001)
        const b = timelinePose(ev, cut)
        for (const k of ['root', 'squash', 'breath']) {
          const dy = Math.abs(a.parts[k].y - b.parts[k].y) * pxPerUnit
          const dr = Math.abs(a.parts[k].r - b.parts[k].r)
          expect(dy, `${k} @${cut}`).toBeLessThan(1)
          expect(dr, `${k} @${cut}`).toBeLessThan(1)
        }
      }
    }
  })
})

describe('geometry', () => {
  it('the box is the idle silhouette: aspect ≈ 0.727, symmetric about the centre, feet on the bottom edge', () => {
    expect(ASPECT).toBeGreaterThan(0.72)
    expect(ASPECT).toBeLessThan(0.735)
    expect(close(CENTER.x, ASPECT / 2, 0.002)).toBe(true)
    expect(close(FEET.y, 1, 1e-9)).toBe(true)
  })
})

describe('seeded blink and confetti', () => {
  it('blink is deterministic, mostly open, and shuts briefly about once every few seconds', () => {
    const samples = []
    for (let t = 0; t < 60000; t += 10) samples.push(blinkAt(t, 42))
    expect(samples).toEqual(Array.from({ length: 6000 }, (_, i) => blinkAt(i * 10, 42)))
    const shut = samples.filter((v) => v < 0.5).length / samples.length
    expect(shut).toBeGreaterThan(0.005)
    expect(shut).toBeLessThan(0.05)
    expect(Math.min(...samples)).toBeLessThan(0.15)
    // two owls on one page do not blink in step
    let same = 0
    for (let t = 0; t < 60000; t += 10) if (blinkAt(t, 1) < 0.5 && blinkAt(t, 2) < 0.5) same++
    expect(same).toBeLessThan(20)
  })

  it('confetti is closed-form: same seed → same burst; gone after the burst', () => {
    expect(confettiAt(600, 9)).toEqual(confettiAt(600, 9))
    expect(confettiAt(600, 9)).not.toEqual(confettiAt(600, 10))
    expect(confettiAt(CONFETTI_MS + 1, 9).every((c) => c.o === 0)).toBe(true)
    expect(confettiAt(300, 9).some((c) => c.o > 0.5)).toBe(true)
  })
})

describe('the live driver', () => {
  const run = (a, from, to, inputs, step = 16) => {
    let out
    for (let t = from; t <= to; t += step) out = a.update(t, typeof inputs === 'function' ? inputs(t) : inputs)
    return out
  }

  it('a flight ending plays the landing, then idles', () => {
    const a = createScholarAnimator({ seed: 3 })
    run(a, 0, 500, { phase: 'perched' })
    expect(run(a, 516, 1200, { phase: 'flying', facing: 1 }).state).toBe('flying')
    expect(run(a, 1216, 1400, { phase: 'gliding', facing: 1 }).state).toBe('gliding')
    expect(run(a, 1416, 1500, { phase: 'perched' }).state).toBe('landing')
    expect(run(a, 1516, 3400, { phase: 'perched' }).state).toBe('idle')
  })

  it('mirrors only in the air', () => {
    const a = createScholarAnimator()
    const airborne = run(a, 0, 600, { phase: 'flying', facing: -1 })
    expect(airborne.pose.parts.flip.sx).toBe(-1)
    const landed = run(a, 616, 1200, { phase: 'perched', facing: -1 })
    expect(landed.pose.parts.flip.sx).toBe(1)
    // perched, facing turns the eyes instead: same timeline facing front differs only by the gaze
    const b = createScholarAnimator()
    run(b, 0, 600, { phase: 'flying', facing: -1 })
    const front = run(b, 616, 1200, { phase: 'perched', facing: 0 })
    expect(landed.pose.parts.pupilL.x - front.pose.parts.pupilL.x).toBeCloseTo(-4.5, 5)
    expect(front.pose.parts.flip.sx).toBe(1)
  })

  it('moods are one-shots that restart on a new key and report their end', () => {
    const a = createScholarAnimator()
    let ended = null
    const step = (t, mood) => {
      const r = a.update(t, { phase: 'perched', mood })
      if (r.moodEnded) ended = r.moodEnded
      return r
    }
    expect(step(0, { name: 'hello', key: 1 }).state).toBe('hello')
    for (let t = 16; t < 3700; t += 16) step(t, { name: 'hello', key: 1 })
    expect(step(3720, { name: 'hello', key: 1 }).state).toBe('idle')
    expect(ended).toBe('hello')
    expect(step(3740, { name: 'hello', key: 2 }).state).toBe('hello')
    expect(a.events.at(-1)).toEqual({ t: 3740, state: 'hello' })
  })

  it('a held mood (moodHold) ends the moment its caller clears it', () => {
    const a = createScholarAnimator()
    let ended = null
    const step = (t, inp) => {
      const r = a.update(t, { phase: 'perched', moodHold: true, ...inp })
      if (r.moodEnded) ended = r.moodEnded
      return r
    }
    expect(step(0, { mood: { name: 'hello', key: 1 } }).state).toBe('hello')
    step(400, { mood: { name: 'hello', key: 1 }, listening: true })
    // the scroll beat moved on (well inside hello's 3.7s): listening at once
    expect(step(416, { mood: null, listening: true }).state).toBe('listening')
    expect(ended).toBe('hello')
    // without the hold the same clear lets hello play out (other callers)
    const b = createScholarAnimator()
    b.update(0, { phase: 'perched', mood: { name: 'hello', key: 1 } })
    expect(b.update(416, { phase: 'perched', mood: null, listening: true }).state).toBe('hello')
  })

  it('a held mood cuts a landing short after its touchdown', () => {
    const a = createScholarAnimator()
    run(a, 0, 400, { phase: 'flying' })
    expect(a.update(416, { phase: 'perched' }).state).toBe('landing')
    expect(a.update(432, { phase: 'perched', moodHold: true, mood: { name: 'hello', key: 1 } }).state).toBe('landing')
    expect(a.update(700, { phase: 'perched', moodHold: true, mood: { name: 'hello', key: 1 } }).state).toBe('hello')
  })

  it('the app idle is calm: seeded phase, a fidget about one loop in three, never in unison', () => {
    const D = STATES.idle.dur
    const loops = 300
    // never the loop it enters part-way through; about FIDGET_ODDS of the rest
    const idle = { phase: 1234, seed: 7, fidget: 'some' }
    expect(idleLoop(0, idle)).toMatchObject({ index: 0, fidget: false })
    let n = 0
    for (let i = 1; i <= loops; i++) if (idleLoop(i * D - 1234 + 10, idle).fidget) n++
    expect(n / loops).toBeGreaterThan(FIDGET_ODDS - 0.12)
    expect(n / loops).toBeLessThan(FIDGET_ODDS + 0.12)
    // a calm loop only breathes (no glasses push-up), a fidget loop is the mock's
    const at = 0.86 * D // mid push-up in the mock
    const calmLoop = Array.from({ length: 50 }, (_, i) => i + 1).find((i) => hash01(7 + 101, i) >= FIDGET_ODDS)
    const fidgetLoop = Array.from({ length: 50 }, (_, i) => i + 1).find((i) => hash01(7 + 101, i) < FIDGET_ODDS)
    const t = (i) => i * D + at - 1234
    expect(poseAt('idle', t(calmLoop), idle).parts.wingR.r).toBe(0)
    expect(poseAt('idle', t(fidgetLoop), idle).parts.wingR.r).toBeCloseTo(poseAt('idle', at).parts.wingR.r, 6)
    // 'every' is the mock's loop from t = 0 (the film)
    expect(poseAt('idle', at, { fidget: 'every' })).toEqual(poseAt('idle', at))
    // two owls on one page: different seeds → different idle phases
    const wing = (seed) => {
      const o = createScholarAnimator({ seed })
      const out = []
      for (let t2 = 0; t2 < 40 * D; t2 += 100) out.push(o.update(t2, { phase: 'perched' }).pose.parts.wingR.r)
      return out
    }
    const w1 = wing(11)
    const w2 = wing(12)
    const both = w1.filter((r, i) => Math.abs(r) > 60 && Math.abs(w2[i]) > 60).length
    expect(both).toBe(0)
    expect(w1.some((r) => Math.abs(r) > 60)).toBe(true)
  })

  it('reduced motion is the still owl whatever the props say', () => {
    const a = createScholarAnimator()
    const r = run(a, 0, 400, { reduced: true, phase: 'flying', talking: true, mood: { name: 'celebrate', key: 1 }, confetti: true })
    expect(r.state).toBe('still')
    expect(r.pose.parts.flip.sx).toBe(1)
    expect(r.pose.confetti).toBeNull()
    expect(r.pose.parts.eyeOpenL.sy).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE TURN NEVER COLLAPSES TO A SLIVER.
//
// The mirror was a scaleX tween straight through 0, so landing after a flight
// LEFT showed one frame of a paper-thin owl (film rig, z2_end frame 49). The
// turn now narrows to MIN_TURN_SCALE, snaps the mirror at its midpoint and widens
// back — pinned here on the real animator at every sampling the rig and the app
// use, including a turn reversed halfway through.
// ─────────────────────────────────────────────────────────────────────────────
describe('the turn (mirror) never collapses below ~35% width', () => {
  const FLOOR = 0.35

  it('turnScale is pure, full width at rest, and never narrower than the floor', () => {
    expect(MIN_TURN_SCALE).toBeGreaterThanOrEqual(FLOOR)
    expect(turnScale(1)).toBe(1)
    expect(turnScale(-1)).toBe(-1)
    for (let i = 0; i <= 2000; i++) {
      const m = -1 + i / 1000
      const v = turnScale(m, 1)
      expect(Math.abs(v)).toBeGreaterThanOrEqual(MIN_TURN_SCALE - 1e-12)
      expect(Math.abs(v)).toBeLessThanOrEqual(1)
      expect(turnScale(m, 1)).toBe(v) // same m → same scale
    }
    // the midpoint takes the side it is turning toward
    expect(turnScale(0, 1)).toBeCloseTo(MIN_TURN_SCALE, 12)
    expect(turnScale(0, -1)).toBeCloseTo(-MIN_TURN_SCALE, 12)
  })

  // Fly left, land (the turn to face forward), sampled on a grid of `stepMs`.
  const landAfterLeft = (stepMs, offsetMs = 0) => {
    const a = createScholarAnimator({ seed: 11, fidget: 'every' })
    const land = 1000 + offsetMs
    const scales = []
    for (let t = 0; t <= land + MIRROR_MS + 200; t += stepMs) {
      const air = t < land
      const r = a.update(t, { phase: air ? 'flying' : 'perched', facing: air ? -1 : 0 })
      if (t >= land - stepMs) scales.push(r.pose.parts.flip.sx) // the last airborne frame, the turn, and after
    }
    return scales
  }

  it.each([
    ['the film rig 120 Hz grid', 1000 / 120],
    ['30 fps', 1000 / 30],
    ['60 fps', 1000 / 60],
    ['1 ms', 1],
  ])('landing after flying left, sampled at %s: |scaleX| ≥ floor on every frame', (_label, step) => {
    for (const offset of [0, 3, 7, 11, 16, 29]) {
      const scales = landAfterLeft(step, offset)
      expect(scales.some((v) => v < 0)).toBe(true) // it really was facing left
      expect(scales[scales.length - 1]).toBe(1) // and ends facing forward at full width
      const narrowest = Math.min(...scales.map(Math.abs))
      expect(narrowest).toBeGreaterThanOrEqual(FLOOR)
    }
  })

  it('a turn reversed mid-way (left → right → left) never slivers either', () => {
    const a = createScholarAnimator({ seed: 5 })
    let narrowest = 1
    for (let t = 0; t <= 2000; t += 1) {
      const facing = t < 600 ? -1 : t < 680 ? 1 : -1 // flips back 80 ms into the turn
      const r = a.update(t, { phase: 'flying', facing })
      narrowest = Math.min(narrowest, Math.abs(r.pose.parts.flip.sx))
    }
    expect(narrowest).toBeGreaterThanOrEqual(FLOOR)
  })

  it('stays deterministic: two animators on the same inputs produce identical turns', () => {
    expect(landAfterLeft(1000 / 120)).toEqual(landAfterLeft(1000 / 120))
  })
})

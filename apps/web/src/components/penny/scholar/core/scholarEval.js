// ─────────────────────────────────────────────────────────────────────────────
// scholarEval — turns the Scholar's tracks into a pose for any moment.
//
// PURE where it matters: poseAt(state, t) and timelinePose(events, t) are plain
// functions of their arguments (no clock, no Math.random, no DOM), so the film
// rig can seek to any frame in any order and get the same owl the app shows.
// blinkAt / confettiAt are seeded and closed-form for the same reason.
//
// createScholarAnimator() is the small stateful driver the live <ScholarOwl>
// uses: it turns props over time (phase changes, one-shot moods, facing) into a
// timeline of state switches, then asks timelinePose for the pose. The film rig
// can build the same timeline itself.
//
// State precedence (PLAN §2.1): reduced motion > flying > gliding > landing >
// one-shot mood > oops > talking > listening > thinking > idle.
// ─────────────────────────────────────────────────────────────────────────────
import { STATES, BLEND_MS, BLEND_EASE, AIRBORNE } from './scholarTracks.js'
import { PARTS, HIDDEN_PARTS, CONFETTI_COUNT } from './scholarArt.js'
import { createTassel, stepTassel, hangAngle, capFrame } from './scholarTassel.js'

// ── easing ─────────────────────────────────────────────────────────────────

/** CSS cubic-bezier(x1,y1,x2,y2) as a function of progress 0..1. */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sx = (t) => ((ax * t + bx) * t + cx) * t
  const sy = (t) => ((ay * t + by) * t + cy) * t
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx
  return (p) => {
    if (p <= 0) return 0
    if (p >= 1) return 1
    // Newton, then bisection as a fallback (x(t) is monotonic for 0≤x1,x2≤1).
    let t = p
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - p
      if (Math.abs(e) < 1e-6) return sy(t)
      const d = dx(t)
      if (Math.abs(d) < 1e-6) break
      t -= e / d
    }
    let lo = 0
    let hi = 1
    t = p
    for (let i = 0; i < 30; i++) {
      const x = sx(t)
      if (Math.abs(x - p) < 1e-6) break
      if (x < p) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return sy(t)
  }
}

/** The mock's named curves. */
export const EASINGS = Object.freeze({
  EB: [0.34, 1.56, 0.64, 1],
  EB2: [0.3, 1.8, 0.5, 1],
  EIO: [0.45, 0, 0.55, 1],
  EOUT: [0.22, 1, 0.36, 1],
  EIN: [0.55, 0, 1, 0.45],
})
const EASE_FN = { linear: (p) => p }
for (const [k, v] of Object.entries(EASINGS)) EASE_FN[k] = cubicBezier(...v)
export const ease = (name, p) => (EASE_FN[name] || EASE_FN.linear)(p)

// ── tracks ─────────────────────────────────────────────────────────────────

const lerp = (a, b, k) => a + (b - a) * k
const lerpT = (a, b, k) => ({
  x: lerp(a.x, b.x, k),
  y: lerp(a.y, b.y, k),
  r: lerp(a.r, b.r, k),
  sx: lerp(a.sx, b.sx, k),
  sy: lerp(a.sy, b.sy, k),
})

/**
 * One track's value at state-local time t (ms), or undefined while it is not
 * active (before its delay). Loops wrap; one-shots hold their last keyframe.
 */
export function evalTrack(track, t) {
  let local = t - (track.delay || 0)
  if (local < 0) return undefined
  const k = track.k
  if (track.loop) local %= track.d
  else if (local >= track.d) return k[k.length - 1][1]
  const p = local / track.d
  let i = 0
  while (i < k.length - 2 && p >= k[i + 1][0]) i++
  const [o0, v0, e] = k[i]
  const [o1, v1] = k[i + 1]
  const span = o1 - o0
  const q = span > 0 ? Math.min(1, Math.max(0, (p - o0) / span)) : 1
  const w = ease(e || 'linear', q)
  return typeof v0 === 'number' ? lerp(v0, v1, w) : lerpT(v0, v1, w)
}

const IDENT = Object.freeze({ x: 0, y: 0, r: 0, sx: 1, sy: 1 })

/** The neutral owl: every part at rest, the hidden parts hidden. */
export function neutralPose() {
  const parts = {}
  for (const k of PARTS) parts[k] = { ...IDENT, o: HIDDEN_PARTS.includes(k) ? 0 : 1 }
  return { parts, breeze: 1, tassel: 0, confetti: null }
}

/** The idle loop's parts that keep moving on a CALM loop (see idleLoop). */
const CALM_PARTS = new Set(['breath'])
/** Share of idle loops that fidget (glasses push-up + glance) in the app. */
export const FIDGET_ODDS = 0.35

/**
 * Which idle loop `t` (state-local ms) falls in, and whether that loop
 * fidgets. `idle` = { phase, seed, fidget: 'some'|'every' }:
 *   phase   ms the owl's idle clock is offset by (seeded per owl, so two owls
 *           on one page never breathe or fidget in unison);
 *   fidget  'every' → the mock's every-loop glasses push-up and glance (the
 *           film); 'some' → about one loop in three (FIDGET_ODDS, seeded per
 *           loop) and never the loop the owl enters idle part-way through —
 *           the other loops only breathe and blink.
 * Pure: the same (t, idle) always gives the same answer.
 */
export function idleLoop(t, idle = {}) {
  const D = STATES.idle.dur
  const phase = idle.phase || 0
  const tt = t + phase
  const index = Math.floor(tt / D)
  if (idle.fidget !== 'some') return { t: tt, index, fidget: true }
  const fidget = !(index === 0 && phase > 0) && hash01((idle.seed ?? 1) + 101, index) < FIDGET_ODDS
  return { t: tt, index, fidget }
}

/**
 * The pose of `state` at state-local time t (ms since the owl entered it).
 * Pure and deterministic: the same (state, t, idle) always gives the same pose.
 * `idle` (optional, see idleLoop) only changes the idle state: its phase and
 * which of its loops fidget. Left out, idle is the mock's loop from t = 0.
 */
export function poseAt(state, t = 0, idle) {
  const st = STATES[state] || STATES.idle
  const pose = neutralPose()
  pose.breeze = st.breeze ?? 1
  pose.state = state
  if (st.base) for (const [k, v] of Object.entries(st.base)) Object.assign(pose.parts[k], v)
  if (st.opacity) for (const [k, v] of Object.entries(st.opacity)) pose.parts[k].o = v
  if (st.still) return pose
  let calm = false
  if (idle && st === STATES.idle) {
    const lp = idleLoop(t, idle)
    t = lp.t
    calm = !lp.fidget
  }
  for (const tk of st.tracks) {
    if (calm && !CALM_PARTS.has(tk.p)) continue
    const v = evalTrack(tk, t)
    if (v === undefined) continue
    const part = pose.parts[tk.p]
    if (!part) continue
    if (tk.a === 'o') part.o = v
    else Object.assign(part, v)
  }
  return pose
}

const wrapDeg = (r) => (Math.abs(r) > 180 ? ((((r + 180) % 360) + 360) % 360) - 180 : r)

/** Per-part blend weights for entering `state`, `t` ms after the switch. */
export function enterWeights(state, t) {
  const st = STATES[state] || STATES.idle
  const out = {}
  for (const k of PARTS) {
    const [d, e, delay = 0] = (st.enter && st.enter[k]) || [BLEND_MS, BLEND_EASE]
    out[k] = d <= 0 ? 1 : ease(e, Math.min(1, Math.max(0, (t - delay) / d)))
  }
  return out
}

/** How long after a switch the previous pose still matters. */
export function enterWindow(state) {
  const st = STATES[state] || STATES.idle
  let m = BLEND_MS
  if (st.enter) for (const [d, , delay = 0] of Object.values(st.enter)) m = Math.max(m, d + delay)
  return m
}

/**
 * Blend `from` toward `to` per part (weights may overshoot 1 for the springy
 * curves — the mock's EB entries). A full turn left over in `from` (the cap's
 * 360° toss) is unwound first so a blend never spins a part backwards.
 */
export function blendPose(from, to, weights) {
  const out = { ...to, parts: {} }
  for (const k of PARTS) {
    const a = from.parts[k]
    const b = to.parts[k]
    const w = weights[k] ?? 1
    if (w >= 1 && w <= 1 + 1e-9) {
      out.parts[k] = { ...b }
      continue
    }
    const aa = { ...a, r: wrapDeg(a.r) }
    out.parts[k] = { ...lerpT(aa, b, w), o: lerp(a.o, b.o, Math.min(1, Math.max(0, w))) }
  }
  out.breeze = lerp(from.breeze ?? 1, to.breeze ?? 1, 0.5)
  return out
}

/**
 * The pose at absolute time t for a timeline of state switches
 * events = [{ t, state }, …] (ascending). Each switch blends from the pose the
 * owl had at that instant — itself a timelinePose — so any frame can be
 * computed on its own (seekable, order-independent).
 */
export function timelinePose(events, t, idle) {
  if (!events || !events.length) return poseAt('idle', t, idle)
  let i = events.length - 1
  while (i > 0 && events[i].t > t) i--
  return poseFromEvent(events, i, Math.max(t, events[0].t), idle)
}

function poseFromEvent(events, i, t, idle) {
  const ev = events[i]
  const local = t - ev.t
  const live = poseAt(ev.state, local, idle)
  if (i === 0 || local >= enterWindow(ev.state)) return live
  const from = poseFromEvent(events, i - 1, ev.t, idle)
  return blendPose(from, live, enterWeights(ev.state, local))
}

// ── precedence ─────────────────────────────────────────────────────────────

/**
 * Which state wins. Inputs: { reduced, phase: 'perched'|'flying'|'gliding',
 * landing, mood, oops, talking, listening, thinking }.
 */
export function resolveState(i = {}) {
  if (i.reduced) return 'still'
  if (i.phase === 'flying') return 'flying'
  if (i.phase === 'gliding') return 'gliding'
  if (i.landing) return 'landing'
  if (i.mood && STATES[i.mood]) return i.mood
  if (i.oops) return 'oops'
  if (i.talking) return 'talking'
  if (i.listening) return 'listening'
  if (i.thinking) return 'thinking'
  return 'idle'
}

// ── seeded randomness ──────────────────────────────────────────────────────

/** A stable 32-bit hash of an integer pair → [0, 1). */
export function hash01(a, b = 0) {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967296
}

/** A string → 32-bit seed (useId → per-owl blink rhythm). */
export function seedFrom(str) {
  let h = 2166136261
  for (let i = 0; i < String(str).length; i++) h = Math.imul(h ^ String(str).charCodeAt(i), 16777619)
  return h >>> 0
}

// ── blink ──────────────────────────────────────────────────────────────────
// The mock blinked every 2.2–5s (sometimes twice). Closed form: time is cut into
// 3.8s slots; each slot holds one blink at a seeded offset, 22% of them doubled.
const BLINK_SLOT = 3800
const FORCED_BLINK_MS = 170
const blinkShape = (p) => {
  const q = ease('EIO', p)
  return q < 0.45 ? lerp(1, 0.08, q / 0.45) : lerp(0.08, 1, (q - 0.45) / 0.55)
}

/** Eye-open vertical scale (1 = open, 0.08 = shut) at absolute time t (ms). */
export function blinkAt(t, seed = 1) {
  if (t < 0) return 1
  const slot = Math.floor(t / BLINK_SLOT)
  const at = slot * BLINK_SLOT + 300 + hash01(seed, slot) * (BLINK_SLOT - 900)
  const d1 = t - at
  if (d1 >= 0 && d1 < 170) return blinkShape(d1 / 170)
  if (hash01(seed + 7, slot) < 0.22) {
    const d2 = t - (at + 260)
    if (d2 >= 0 && d2 < 160) return blinkShape(d2 / 160)
  }
  return 1
}

// ── confetti ───────────────────────────────────────────────────────────────
// The mock's burst, in owl units (its stage drew ~1.06px per unit), launched
// from 36% down the mock's frame. Closed form in time since the burst.
const CF_ORIGIN = { x: 130, y: -20 + 320 * 0.36 }
const PX = 1.0625
const CF_EASE = cubicBezier(0.15, 0.8, 0.3, 1)
const CF_SEG = cubicBezier(0.4, 0, 0.9, 0.6)
export const CONFETTI_MS = 2200

/** Every confetti piece at `t` ms after the burst: [{x, y, r, w, h, o}] (owl units). */
export function confettiAt(t, seed = 1) {
  const out = []
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const R = (j) => hash01(seed + i * 31, j)
    const w = (6 + R(1) * 6) / PX
    const square = R(2) < 0.3
    const h = square ? w : w * 1.6
    const ang = -Math.PI / 2 + (R(3) - 0.5) * 2.4
    const sp = (170 + R(4) * 190) / PX
    const dx = Math.cos(ang) * sp
    const dy = Math.sin(ang) * sp
    const rot = (R(5) - 0.5) * 900
    const fall = (230 + R(6) * 140) / PX
    const dur = 1500 + R(7) * 700
    if (t < 0 || t >= dur) {
      out.push({ x: CF_ORIGIN.x, y: CF_ORIGIN.y, r: 0, w, h, o: 0 })
      continue
    }
    const p = CF_EASE(t / dur)
    let x, y, r, s, o
    if (p < 0.32) {
      const q = p / 0.32
      x = CF_ORIGIN.x + dx * q
      y = CF_ORIGIN.y + dy * q
      r = rot * 0.4 * q
      s = lerp(0.4, 1, q)
      o = 1
    } else {
      const q = CF_SEG((p - 0.32) / 0.68)
      x = CF_ORIGIN.x + lerp(dx, dx * 1.35, q)
      y = CF_ORIGIN.y + lerp(dy, dy + fall, q)
      r = lerp(rot * 0.4, rot, q)
      s = lerp(1, 0.9, q)
      o = 1 - q
    }
    out.push({ x, y, r, w: w * s, h: h * s, o })
  }
  return out
}

// ── the live driver ────────────────────────────────────────────────────────

const LANDING_MS = STATES.landing.dur
const MIRROR_MS = 160
const GAZE_MS = 380
const MAX_EVENTS = 6
const HELD_LANDING_MS = 240

/**
 * Stateful driver for a live owl. Call update(now, inputs) once per frame.
 *
 * inputs: {
 *   phase: 'perched'|'flying'|'gliding', reduced, talking, listening,
 *   thinking, oops, mood: {name, key} | null, facing: -1|0|1,
 *   shadow (bool, default true), thinkingDots (default true),
 *   blinkStart: ms | null (one scripted blink starting then),
 *   confetti (bool), tassel: 'live'|'still', travel: {x, y} | null (box
 *   position in px while airborne, for the tassel's follow-through),
 *   moodHold (bool): the caller drives the mood (a scroll beat) — when
 *   `mood` clears, a running one-shot ends at once (moodEnded as usual)
 *   instead of playing out its full length
 * }
 * returns { pose, state, moodEnded }
 *
 * options: seed (blinks, confetti, the idle phase); fidget 'some' (default —
 * the app: a calm idle that fidgets about one loop in three, phase-shifted
 * per owl) | 'every' (the mock's every-loop idle from t = 0, for the film).
 */
export function createScholarAnimator({ seed = 1, fidget = 'some' } = {}) {
  const idle =
    fidget === 'every'
      ? { phase: 0, seed, fidget: 'every' }
      : { phase: Math.floor(hash01(seed, 0x1d1e) * STATES.idle.dur), seed, fidget: 'some' }
  const s = {
    events: [],
    key: null,
    lastPhase: 'perched',
    landingUntil: -Infinity,
    mood: null,
    moodKey: undefined,
    confettiStart: null,
    mirror: { from: 1, to: 1, t0: -Infinity },
    gaze: { from: 0, to: 0, t0: -Infinity },
    tassel: createTassel(),
    lastNow: null,
    travel: null,
    offset: { x: 0, y: 0 },
  }

  const tween = (tw, now, ms) => {
    const p = Math.min(1, Math.max(0, (now - tw.t0) / ms))
    return lerp(tw.from, tw.to, ease('EIO', p))
  }
  const retarget = (tw, now, ms, to) => {
    if (tw.to === to) return
    tw.from = tween(tw, now, ms)
    tw.to = to
    tw.t0 = now
  }

  function update(now, inp = {}) {
    const phase = inp.phase || 'perched'
    let moodEnded = null

    // A flight ending fires the landing one-shot.
    const wasAir = s.lastPhase === 'flying' || s.lastPhase === 'gliding'
    if (wasAir && phase === 'perched') s.landingUntil = now + LANDING_MS
    if (phase !== 'perched') s.landingUntil = -Infinity
    s.lastPhase = phase

    // One-shot moods: a new key (re)starts one.
    const req = inp.mood
    const reqKey = req ? `${req.name}|${req.key ?? ''}` : undefined
    if (req && reqKey !== s.moodKey && STATES[req.name]) {
      s.mood = { name: req.name, start: now, end: now + STATES[req.name].dur }
      // A held mood is a beat the caller times (a scroll beat): it cuts a
      // landing short after its touchdown instead of waiting out the settle.
      if (inp.moodHold) s.landingUntil = Math.min(s.landingUntil, now + HELD_LANDING_MS)
      s.confettiStart =
        req.name === 'celebrate' && inp.confetti ? now + STATES.celebrate.dur * STATES.celebrate.confettiAt : null
    }
    s.moodKey = reqKey
    // A held mood (moodHold) ends the moment its caller clears it.
    if (s.mood && (now >= s.mood.end || (inp.moodHold && !req))) {
      moodEnded = s.mood.name
      s.mood = null
    }

    const state = resolveState({
      reduced: inp.reduced,
      phase,
      landing: now < s.landingUntil,
      mood: s.mood && s.mood.name,
      oops: inp.oops,
      talking: inp.talking,
      listening: inp.listening,
      thinking: inp.thinking,
    })
    // A restarted mood is a new event even when the state name repeats.
    const key = s.mood && state === s.mood.name ? `${state}@${s.mood.start}` : state
    if (key !== s.key) {
      s.key = key
      s.events.push({ t: now, state })
      if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS)
    }

    const pose = inp.reduced ? poseAt('still', 0) : timelinePose(s.events, now, idle)
    pose.state = state
    const airborne = AIRBORNE.includes(state)

    // Facing: mirror while airborne; perched, the gaze turns instead.
    const facing = inp.facing || 0
    retarget(s.mirror, now, MIRROR_MS, airborne && facing < 0 ? -1 : 1)
    retarget(s.gaze, now, GAZE_MS, airborne ? 0 : facing)
    const m = inp.reduced ? 1 : tween(s.mirror, now, MIRROR_MS)
    const g = inp.reduced ? 0 : tween(s.gaze, now, GAZE_MS)
    pose.parts.flip.sx = Math.abs(m) < 0.02 ? (m < 0 ? -0.02 : 0.02) : m
    if (g) {
      pose.parts.pupilL.x += 4.5 * g
      pose.parts.pupilR.x += 4.5 * g
      pose.parts.head.r += 4 * g
      pose.parts.root.r += 1.5 * g
    }

    if (!inp.reduced) {
      let b = blinkAt(now, seed)
      // A scripted blink (the landing demo's beat): one blink from `blinkStart`.
      const fb = inp.blinkStart == null ? -1 : now - inp.blinkStart
      if (fb >= 0 && fb < FORCED_BLINK_MS) b = Math.min(b, blinkShape(fb / FORCED_BLINK_MS))
      pose.parts.eyeOpenL.sy *= b
      pose.parts.eyeOpenR.sy *= b
    }
    if (inp.shadow === false) pose.parts.shadow.o = 0
    if (inp.thinkingDots === false) pose.parts.dots.o = 0

    // Tassel: pendulum in the owl's own frame (see scholarTassel.js).
    const cap = capFrame(pose)
    if (inp.reduced || inp.tassel === 'still') {
      pose.tassel = hangAngle(cap)
      s.tassel = createTassel()
    } else {
      const dt = s.lastNow == null ? 0.016 : Math.min(0.034, Math.max(0.001, (now - s.lastNow) / 1000))
      // Travel in screen px, folded into the local frame (mirrored → x flips).
      if (inp.travel) {
        if (s.travel) {
          s.offset.x += (inp.travel.x - s.travel.x) * (s.mirror.to < 0 ? -1 : 1) // fold by where it faces, not mid-turn
          s.offset.y += inp.travel.y - s.travel.y
        }
        s.travel = { x: inp.travel.x, y: inp.travel.y }
      } else s.travel = null
      pose.tassel = stepTassel(s.tassel, cap, dt, now / 1000, pose.breeze, s.offset)
    }
    s.lastNow = now

    if (s.confettiStart != null && inp.confetti && !inp.reduced) {
      const t = now - s.confettiStart
      if (t >= 0 && t < CONFETTI_MS) pose.confetti = confettiAt(t, seed + Math.round(s.confettiStart))
      else pose.confetti = null
      if (t >= CONFETTI_MS) s.confettiStart = null
    } else pose.confetti = null

    return { pose, state, moodEnded }
  }

  return { update, get events() { return s.events } }
}

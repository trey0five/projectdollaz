// The film's Scholar: the APP's owl, driven frame-exactly.
//
// Art, poses, moods, blinks, landing one-shot, facing, gaze and the tassel all
// come from the app's own plain-JS core (apps/web/src/components/penny/scholar/
// core, served at /core/ by render.mjs). This file adds only what the app's
// flight engine (Penny.jsx) does there: WHERE the owl is, how big, and which
// phase/mood/talking inputs it gets at each moment — the scene's `script(t)`.
//
// Determinism: the app's animator (createScholarAnimator) is stateful (the
// tassel pendulum, the mood clock), so the rig steps it on a fixed 120 Hz grid
// from t = 0. A 30 fps frame falls on every 4th step. Seeking forward continues
// the run; seeking backwards replays from 0. Same seek → same pixels, in any order.
import { scholarMarkup, collectParts, writePose } from '/core/scholarArt.js'
import { createScholarAnimator } from '/core/scholarEval.js'
import { ASPECT, VIEWBOX, VIEWBOX_ATTR, FEET } from '/core/scholarGeometry.js'
import { CONFETTI_MIN_PX } from '/core/scholarTracks.js'

const STEP_HZ = 120

/**
 * @param {HTMLElement} layer  absolutely-positioned container (the stage)
 * @param {object} o
 * @param {string} o.uid       unique id stem
 * @param {(tSec:number)=>object} o.script  t → { x, y (FEET point, px), size (px tall), phase, mood, talking,
 *                              listening, thinking, oops, facing (-1|0|1), opacity, shadow, z }
 * @param {'dark'|'light'} [o.tone]
 * @param {number} [o.seed]
 * @param {number} [o.baseSize]  size used to pick the dark-tone rim width (the app's formula)
 */
export function createFilmOwl(layer, { uid = 'owl', script, tone = 'dark', seed = 11, baseSize = 220, travelGain = 1 } = {}) {
  const host = document.createElement('div')
  host.className = 'scholar-owl'
  host.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;will-change:transform;'
  // The app's rim formula (ScholarOwl.jsx): thicker in owl units when the owl is small.
  const rim = Math.round(Math.min(9, Math.max(2.5, (1.6 * VIEWBOX.h) / baseSize)) * 2) / 2
  const confetti = baseSize >= CONFETTI_MIN_PX
  host.innerHTML = scholarMarkup({ uid, viewBox: VIEWBOX_ATTR, tiny: false, tone, rim, confetti })
  layer.appendChild(host)
  const parts = collectParts(host)
  let cache = {}
  let anim = null
  let k = -1 // last 120 Hz step run
  let last = null

  const reset = () => {
    anim = createScholarAnimator({ seed, fidget: 'every' })
    k = -1
    cache = {}
  }
  reset()

  function inputsAt(tSec) {
    const s = script(tSec)
    // The tassel feels the travel in px; scale so a big film owl swings like the app's.
    const g = (travelGain * 72) / Math.max(24, s.size || baseSize)
    return {
      s,
      inp: {
        phase: s.phase || 'perched',
        reduced: false,
        talking: !!s.talking,
        listening: !!s.listening,
        thinking: !!s.thinking,
        oops: !!s.oops,
        mood: s.mood || null,
        moodHold: !!s.moodHold,
        facing: s.facing || 0,
        shadow: s.shadow !== false,
        thinkingDots: true,
        confetti,
        tassel: 'live',
        travel: s.phase === 'flying' || s.phase === 'gliding' ? { x: s.x * g, y: s.y * g } : null,
      },
    }
  }

  /** Bring the owl to scene time tSec (seconds) and paint it. */
  function seek(tSec) {
    const target = Math.round(tSec * STEP_HZ)
    if (target < k) reset()
    let res = null
    let s = null
    for (let i = k + 1; i <= target; i++) {
      const t = i / STEP_HZ
      const r = inputsAt(t)
      s = r.s
      res = anim.update(t * 1000, r.inp)
      k = i
    }
    if (!res) {
      // Same step asked twice: repaint the last result.
      if (!last) return
      res = last.res
      s = last.s
    }
    last = { res, s }
    writePose(parts, res.pose, cache)
    const size = s.size
    const w = size * ASPECT
    host.style.width = `${w}px`
    host.style.height = `${size}px`
    host.style.transform = `translate(${(s.x - FEET.x * size).toFixed(2)}px, ${(s.y - FEET.y * size).toFixed(2)}px)`
    host.style.opacity = s.opacity == null ? '' : String(s.opacity)
    host.style.zIndex = s.z == null ? '' : String(s.z)
    host.style.filter = s.filter || ''
    host.setAttribute('data-state', res.state)
    return res.state
  }

  return { el: host, seek, get state() { return last && last.res.state } }
}

/**
 * A flight for the owl's script: keyed path + phases, as the app's engine does it
 * (flying → gliding for the last `glide` seconds → perched, which fires the
 * landing one-shot inside the animator). Facing follows the horizontal velocity
 * while airborne. Returns f(t) → partial script fields, or null outside [t0, t1].
 */
export function flightPhase(path, t0, t1, glide = 0.26) {
  return (t) => {
    if (t < t0 || t > t1) return null
    const p = path.at(t)
    const phase = t >= t1 - glide ? 'gliding' : 'flying'
    const facing = Math.abs(p.vx) > 25 ? Math.sign(p.vx) : 0
    return { x: p.x, y: p.y, size: p.size, phase, facing }
  }
}

/** Mood requests for the script: the latest started mood {name, key}, or null before the first. */
export function moodAt(t, moods) {
  let cur = null
  for (const m of moods) if (t >= m.t) cur = { name: m.name, key: m.key || `${m.name}@${m.t}` }
  return cur
}

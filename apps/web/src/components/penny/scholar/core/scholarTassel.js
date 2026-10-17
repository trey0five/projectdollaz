// ─────────────────────────────────────────────────────────────────────────────
// scholarTassel — the mortarboard tassel's pendulum, the Scholar's follow-through.
//
// Ported from the mock's tick(): a damped pendulum (length 46, gravity 1500,
// damping 2.6, three sub-steps, ±1.75 rad clamp with a soft bounce, an idle
// "breeze") driven by the ACCELERATION of the tassel's hanging point.
//
// Two changes from the mock, both on purpose:
//  1. The mock read the cap's position from the DOM every frame
//     (getBoundingClientRect on two marker dots). Here capFrame() composes the
//     part transforms in code, so a frame never forces layout and the film rig
//     gets the same numbers without a browser.
//  2. The mock worked in SCREEN space, so a mirrored owl swung the wrong way.
//     This works in the owl's OWN frame (before the facing mirror); the travel
//     the flight engine reports is folded in with x flipped when mirrored.
//     Gravity is symmetric, so the tassel hangs straight either way.
//
// Units: owl units × PX (the mock drew ~1.06px per unit), so the mock's
// constants carry over unchanged; travel arrives in screen px as in the mock.
// ─────────────────────────────────────────────────────────────────────────────
import { PIVOTS, CAP_TILT, TASSEL_PIVOT, CAP_BUTTON } from './scholarArt.js'

export const TASSEL = Object.freeze({ L: 46, g: 1500, damp: 2.6, sub: 3, limit: 1.75, bounce: -0.35, accelCap: 9000, smooth: 0.45 })
const PX = 1.0625
const BASE_ANG = Math.atan2(TASSEL_PIVOT[1] - CAP_BUTTON[1], TASSEL_PIVOT[0] - CAP_BUTTON[0])

// 2D affine matrices as [a, b, c, d, e, f] (SVG order).
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
const translate = (x, y) => [1, 0, 0, 1, x, y]
const rotate = (deg) => {
  const a = (deg * Math.PI) / 180
  return [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]
}
const scale = (sx, sy) => [sx, 0, 0, sy, 0, 0]

/** The matrix scholarArt.transformAttr writes for one part's pose. */
export function partMatrix(part, p) {
  const [ox, oy] = PIVOTS[part] || [0, 0]
  if (!p) return [1, 0, 0, 1, 0, 0]
  let m = translate(ox + (p.x || 0), oy + (p.y || 0))
  m = mul(m, rotate(p.r || 0))
  m = mul(m, scale(p.sx ?? 1, p.sy ?? 1))
  return mul(m, translate(-ox, -oy))
}

const CHAIN = ['root', 'squash', 'breath', 'head']

/**
 * Where the tassel hangs from, in the owl's own frame (owl units, before the
 * facing mirror), and how far the cap is rotated (radians) — the mock's
 * readCap(), computed instead of measured.
 */
export function capFrame(pose) {
  let m = [1, 0, 0, 1, 0, 0]
  for (const k of CHAIN) m = mul(m, partMatrix(k, pose.parts[k]))
  m = mul(m, mul(translate(CAP_TILT.cx, CAP_TILT.cy), mul(rotate(CAP_TILT.deg), translate(-CAP_TILT.cx, -CAP_TILT.cy))))
  m = mul(m, partMatrix('cap', pose.parts.cap))
  const a = apply(m, TASSEL_PIVOT)
  const b = apply(m, CAP_BUTTON)
  return { x: a[0], y: a[1], rot: Math.atan2(a[1] - b[1], a[0] - b[0]) - BASE_ANG }
}

/** Tassel rotation (deg, in cap space) that hangs it straight down. */
export const hangAngle = (cap) => (-cap.rot * 180) / Math.PI

/** A tassel at rest. */
export function createTassel() {
  return { init: false, phi: 0, w: 0, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0 }
}

/**
 * Advance the pendulum by dt seconds and return the tassel's rotation (deg, in
 * cap space). `offset` = travel in screen px already folded into the owl frame.
 */
export function stepTassel(ph, cap, dt, tSec, breeze = 1, offset = null) {
  const T = TASSEL
  const cx = cap.x * PX + (offset ? offset.x : 0)
  const cy = cap.y * PX + (offset ? offset.y : 0)
  if (!ph.init) {
    Object.assign(ph, { init: true, x: cx, y: cy, vx: 0, vy: 0, ax: 0, ay: 0, phi: 0, w: 0 })
    return (-(ph.phi + cap.rot) * 180) / Math.PI
  }
  const vx = (cx - ph.x) / dt
  const vy = (cy - ph.y) / dt
  let ax = (vx - ph.vx) / dt
  let ay = (vy - ph.vy) / dt
  const mag = Math.hypot(ax, ay)
  if (mag > T.accelCap) {
    ax *= T.accelCap / mag
    ay *= T.accelCap / mag
  }
  ph.ax += (ax - ph.ax) * T.smooth
  ph.ay += (ay - ph.ay) * T.smooth
  ph.x = cx
  ph.y = cy
  ph.vx = vx
  ph.vy = vy
  const gust = breeze * 3.2 * Math.sin(tSec * 1.6) + breeze * 1.4 * Math.sin(tSec * 2.9 + 1)
  const h = dt / T.sub
  for (let i = 0; i < T.sub; i++) {
    const s = Math.sin(ph.phi)
    const c = Math.cos(ph.phi)
    const alpha = (-T.g * s - ph.ax * c + ph.ay * s) / T.L - T.damp * ph.w + gust
    ph.w += alpha * h
    ph.phi += ph.w * h
  }
  if (ph.phi > T.limit) {
    ph.phi = T.limit
    if (ph.w > 0) ph.w *= T.bounce
  } else if (ph.phi < -T.limit) {
    ph.phi = -T.limit
    if (ph.w < 0) ph.w *= T.bounce
  }
  return (-(ph.phi + cap.rot) * 180) / Math.PI
}

/**
 * A seekable tassel for the film: re-simulates from t=0 at a fixed step, with
 * checkpoints, so at(t) is the same whatever order frames are asked for.
 *   poseFn(tMs)   → the owl's pose at tMs (e.g. t => timelinePose(events, t))
 *   travelFn(tMs) → {x, y} screen-px travel already in the owl frame (optional)
 *   breezeFn(tMs) → breeze gain (optional; defaults to the pose's)
 */
export function createTasselSim(poseFn, { stepMs = 1000 / 240, travelFn = null, checkpointMs = 500 } = {}) {
  const checkpoints = new Map() // step index → pendulum snapshot
  const snap = (ph) => ({ ...ph })
  return {
    at(tMs) {
      const target = Math.max(0, Math.round(tMs / stepMs))
      const every = Math.max(1, Math.round(checkpointMs / stepMs))
      let start = Math.floor(target / every) * every
      while (start > 0 && !checkpoints.has(start)) start -= every
      // A checkpoint holds the pendulum AFTER its step, so resume one later.
      let ph = start > 0 ? snap(checkpoints.get(start)) : createTassel()
      let deg = null
      for (let i = start > 0 ? start + 1 : 0; i <= target; i++) {
        const t = i * stepMs
        const pose = poseFn(t)
        const off = travelFn ? travelFn(t) : null
        deg = stepTassel(ph, capFrame(pose), stepMs / 1000, t / 1000, pose.breeze ?? 1, off)
        if (i > 0 && i % every === 0 && !checkpoints.has(i)) checkpoints.set(i, snap(ph))
      }
      if (deg === null) deg = (-(ph.phi + capFrame(poseFn(target * stepMs)).rot) * 180) / Math.PI
      return deg
    },
  }
}

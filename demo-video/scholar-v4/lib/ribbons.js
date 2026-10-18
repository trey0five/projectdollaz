// Light ribbons in the homescreen video's palette (the S6 monitor shot: cyan and
// white strands that weave round each other, scattered with soft particles, on
// deep teal-navy). Drawn on a 2D canvas, as a pure function of time.
import { clamp, hash, lerp, smooth } from './util.js'

export const PALETTE = Object.freeze({
  navyTop: '#0d2440',
  navy: '#091a2e',
  navyDeep: '#050f1c',
  cyan: [86, 222, 236],
  cyanSoft: [120, 210, 230],
  white: [214, 248, 255],
})

/** The video's screen: a soft top-lit navy with a vignette. */
export function paintNavy(ctx, w, h, { lift = 1 } = {}) {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.12, 40, w * 0.5, h * 0.45, w * 0.78)
  g.addColorStop(0, `rgba(22,58,96,${0.95 * lift})`)
  g.addColorStop(0.45, '#0b2038')
  g.addColorStop(1, PALETTE.navyDeep)
  ctx.fillStyle = PALETTE.navy
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

/** Drifting background motes (bokeh), as in the video's ribbon shot. */
export function paintMotes(ctx, t, { w = 1920, h = 1080, n = 70, seed = 3, alpha = 1, drift = 18 } = {}) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < n; i++) {
    const r = 1 + hash(seed, i, 1) * 3.2
    const x = (hash(seed, i, 2) * (w + 200) - 100 + t * drift * (0.4 + hash(seed, i, 3))) % (w + 200)
    const y = hash(seed, i, 4) * h + Math.sin(t * 0.6 + i) * 6
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.8 + hash(seed, i, 5) * 1.6) + i * 1.7))
    const a = alpha * tw * (0.12 + hash(seed, i, 6) * 0.3)
    ctx.fillStyle = `rgba(${PALETTE.cyan.join(',')},${a.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(x - 100, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * A ribbon: a bundle of strands weaving round a spine.
 * spine(u) → [x, y] for u in [0, 1]. Drawn between u0 and u1 (the visible
 * stretch: a head and tail can travel), with soft ends.
 * opts: strands, spread px, twist (turns along the length), speed, width,
 *       particles, seed, alpha, glow
 */
export function drawRibbon(ctx, spine, u0, u1, t, opts = {}) {
  const {
    strands = 6,
    spread = 26,
    twist = 2.2,
    speed = 0.9,
    width = 2.6,
    particles = 60,
    seed = 1,
    alpha = 1,
    glow = 1,
    samples = 160,
    fade = 0.12,
  } = opts
  if (u1 <= u0 || alpha <= 0) return
  const pts = []
  for (let i = 0; i <= samples; i++) {
    const u = lerp(u0, u1, i / samples)
    const [x, y] = spine(u)
    const [x2, y2] = spine(Math.min(1, u + 0.002))
    const [x1, y1] = spine(Math.max(0, u - 0.002))
    let nx = -(y2 - y1)
    let ny = x2 - x1
    const L = Math.hypot(nx, ny) || 1
    nx /= L
    ny /= L
    // Soft ends: the bundle narrows and fades at the head and the tail.
    const e = Math.min(1, (u - u0) / Math.max(1e-6, fade), (u1 - u) / Math.max(1e-6, fade))
    pts.push({ u, x, y, nx, ny, e: smooth(e) })
  }
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let s = 0; s < strands; s++) {
    const ph = hash(seed, s, 7) * Math.PI * 2
    const amp = spread * (0.45 + 0.55 * hash(seed, s, 8))
    const tw = twist * (0.7 + 0.6 * hash(seed, s, 9))
    const white = hash(seed, s, 10) < 0.34
    const col = white ? PALETTE.white : PALETTE.cyan
    const path = new Path2D()
    pts.forEach((p, i) => {
      const off = amp * Math.sin(p.u * tw * Math.PI * 2 + ph + t * speed * (s % 2 ? 1 : -0.8)) * p.e
      const x = p.x + p.nx * off
      const y = p.y + p.ny * off
      if (i === 0) path.moveTo(x, y)
      else path.lineTo(x, y)
    })
    // glow, then the bright core
    if (glow > 0) {
      ctx.strokeStyle = `rgba(${PALETTE.cyan.join(',')},${(0.07 * alpha * glow).toFixed(3)})`
      ctx.lineWidth = width * 7
      ctx.stroke(path)
      ctx.strokeStyle = `rgba(${PALETTE.cyan.join(',')},${(0.14 * alpha * glow).toFixed(3)})`
      ctx.lineWidth = width * 3
      ctx.stroke(path)
    }
    ctx.strokeStyle = `rgba(${col.join(',')},${((white ? 0.85 : 0.9) * alpha).toFixed(3)})`
    ctx.lineWidth = width * (white ? 0.75 : 1)
    ctx.stroke(path)
  }
  // particles riding the bundle
  for (let i = 0; i < particles; i++) {
    const u = hash(seed, i, 11)
    if (u < u0 || u > u1) continue
    const j = Math.round(((u - u0) / (u1 - u0)) * samples)
    const p = pts[Math.max(0, Math.min(samples, j))]
    const off = (hash(seed, i, 12) - 0.5) * spread * 3.4 + Math.sin(t * 1.3 + i) * 4
    const r = 1.2 + Math.pow(hash(seed, i, 13), 2.2) * 6.5
    const tw = 0.55 + 0.45 * Math.sin(t * (1.5 + hash(seed, i, 14) * 2) + i)
    const a = alpha * p.e * tw * (r > 4 ? 0.35 : 0.8)
    const x = p.x + p.nx * off
    const y = p.y + p.ny * off
    if (r > 3.5) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, `rgba(${PALETTE.cyanSoft.join(',')},${a.toFixed(3)})`)
      g.addColorStop(1, `rgba(${PALETTE.cyanSoft.join(',')},0)`)
      ctx.fillStyle = g
    } else ctx.fillStyle = `rgba(${PALETTE.cyan.join(',')},${a.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** A spine through points (Catmull-Rom), parametrised 0..1 by index. */
export function spineThrough(points) {
  const n = points.length
  const P = (i) => points[clamp(i, 0, n - 1)]
  return (u) => {
    const f = clamp(u) * (n - 1)
    const i = Math.min(n - 2, Math.floor(f))
    const v = f - i
    const a = P(i - 1)
    const b = P(i)
    const c = P(i + 1)
    const d = P(i + 2)
    const cr = (p0, p1, p2, p3) =>
      0.5 * (2 * p1 + (-p0 + p2) * v + (2 * p0 - 5 * p1 + 4 * p2 - p3) * v * v + (-p0 + 3 * p1 - 3 * p2 + p3) * v * v * v)
    return [cr(a[0], b[0], c[0], d[0]), cr(a[1], b[1], c[1], d[1])]
  }
}

/** A gentle sine spine across the frame: y = cy + A·sin(…), x from xa to xb. */
export function sineSpine(xa, xb, cy, A, turns = 1, phase = 0, tilt = 0) {
  return (u) => [lerp(xa, xb, u), cy + A * Math.sin(u * turns * Math.PI * 2 + phase) + tilt * (u - 0.5)]
}

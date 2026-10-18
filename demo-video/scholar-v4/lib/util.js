// Small pure helpers shared by every scholar-v4 scene. No clock, no Math.random:
// every value is a function of scene time, so any frame renders the same way
// whatever order it is asked for.
export const FPS = 30
export const W = 1920
export const H = 1080

export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v))
export const lerp = (a, b, k) => a + (b - a) * k
export const smooth = (u) => {
  u = clamp(u)
  return u * u * (3 - 2 * u)
}
export const smoother = (u) => {
  u = clamp(u)
  return u * u * u * (u * (u * 6 - 15) + 10)
}
export const easeOut = (u, p = 3) => 1 - Math.pow(1 - clamp(u), p)
export const easeIn = (u, p = 3) => Math.pow(clamp(u), p)
export const easeInOut = (u) => {
  u = clamp(u)
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
}
/** Back-out: overshoots a little, then settles (pops). */
export const backOut = (u, s = 1.70158) => {
  u = clamp(u) - 1
  return u * u * ((s + 1) * u + s) + 1
}
/** 0→1 over [a, b] (smoothstep). */
export const ramp = (t, a, b) => smooth((t - a) / (b - a))
/** Linear 0→1 over [a, b]. */
export const lin = (t, a, b) => clamp((t - a) / (b - a))
/** Rises over [a, a+inD], holds, falls over [b-outD, b]. */
export const window01 = (t, a, b, inD = 0.3, outD = 0.3) => Math.min(ramp(t, a, a + inD), 1 - ramp(t, b - outD, b))

/** A stable hash of integers → [0, 1). */
export function hash(a, b = 0, c = 0) {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b) ^ Math.imul((c | 0) + 0x165667b1, 0xc2b2ae35)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export const hexRgb = (hex) => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
export const rgba = (hex, a) => `rgba(${hexRgb(hex).join(',')},${a})`
/** Mix two hex colours (k=0 → a). */
export const mix = (a, b, k) => {
  const A = hexRgb(a)
  const B = hexRgb(b)
  return '#' + A.map((v, i) => Math.round(lerp(v, B[i], k)).toString(16).padStart(2, '0')).join('')
}

/**
 * A keyframed 2D path through waypoints [{t, x, y, size?}] (t in seconds),
 * Catmull-Rom between them, with each span's time eased by `ease`.
 * at(t) → {x, y, size, vx, vy}; before the first key it holds the first, after the last it holds the last.
 */
export function keyPath(keys, ease = (u) => u) {
  const n = keys.length
  const P = (i) => keys[Math.max(0, Math.min(n - 1, i))]
  const cr = (p0, p1, p2, p3, u) => {
    const u2 = u * u
    const u3 = u2 * u
    return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
  }
  function raw(t) {
    if (t <= keys[0].t) return { ...keys[0], size: keys[0].size }
    if (t >= keys[n - 1].t) return { ...keys[n - 1] }
    let i = 0
    while (i < n - 2 && t >= keys[i + 1].t) i++
    const a = P(i - 1)
    const b = P(i)
    const c = P(i + 1)
    const d = P(i + 2)
    const u = ease((t - b.t) / (c.t - b.t))
    const size = b.size != null && c.size != null ? lerp(b.size, c.size, u) : b.size
    return { x: cr(a.x, b.x, c.x, d.x, u), y: cr(a.y, b.y, c.y, d.y, u), size }
  }
  return {
    at(t) {
      const p = raw(t)
      const q = raw(t + 1 / 120)
      return { ...p, vx: (q.x - p.x) * 120, vy: (q.y - p.y) * 120 }
    },
  }
}

/** Load an image and wait for it to decode. */
export function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => (im.decode ? im.decode().then(() => res(im), () => res(im)) : res(im))
    im.onerror = rej
    im.src = src
  })
}

/** Query-string params as an object. */
export const params = () => Object.fromEntries(new URLSearchParams(location.search))

/** hex → [h (deg), s (0..1), l (0..1)] */
export function hexHsl(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}
/** CSS hsla() of a hex hue with its hue turned by `turn`°, at lightness `l` (0..1) and alpha `a`. */
export const hsla = (hex, l, a = 1, turn = 0, sMul = 1) => {
  const [h, s] = hexHsl(hex)
  return `hsla(${(((h + turn) % 360) + 360) % 360}, ${Math.min(100, s * 100 * sMul).toFixed(1)}%, ${(l * 100).toFixed(1)}%, ${a})`
}

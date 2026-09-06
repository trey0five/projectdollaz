// ─────────────────────────────────────────────────────────────────────────────
// KYRO the dove — asset contract for the sprite assets in /public/kyro-dove/.
//
// FALLBACK below is a verbatim copy of `public/kyro-dove/manifest.json` (the
// numbers the build script wrote), so the FIRST paint never waits on a fetch:
// KyroDove renders at fallback geometry immediately, `loadManifest()` fetches
// the JSON once (module-cached) and preloads the three webp files, and the
// hook swaps the manifest in if the served one differs (it normally doesn't).
//
// Anchors are FRACTIONS of the cell/image (already ratios — no /cellW needed):
//   fly / glide → body centroid (the pixels opaque in every frame: body+head+tail)
//   perched     → the feet (x = centroid of the leg pixels, y = lowest claw)
// Every sprite is authored facing RIGHT; mirror with scaleX(-1).
// ─────────────────────────────────────────────────────────────────────────────

export const ASSET_BASE = '/kyro-dove/'

export const FALLBACK = {
  fly: {
    file: 'fly.webp',
    frames: 40,
    cols: 8,
    rows: 5,
    cellW: 256,
    cellH: 205,
    sheetW: 2048,
    sheetH: 1025,
    fps: 24,
    anchor: { x: 0.5187, y: 0.7724 },
    facing: 'right',
    loop: 'forward',
  },
  perched: {
    file: 'perched.webp',
    w: 450,
    h: 512,
    anchor: { x: 0.681, y: 0.959 },
    facing: 'right',
    variants: { 256: { file: 'perched@256.webp', w: 225, h: 256 } },
  },
  glide: {
    file: 'glide.webp',
    w: 256,
    h: 205,
    anchor: { x: 0.5187, y: 0.7724 },
    facing: 'right',
  },
}

// The flying/gliding layers render this many times TALLER than the perched
// layer. The perched still is drawn at a larger scale than the flight cells
// (body ≈ 0.54 of its height vs ≈ 0.42 of a fly cell), so scaling the flight
// layers up keeps the bird's body the same apparent size across states.
export const FLY_SCALE = 1.22

// PLACEMENT anchor for the perched layer. The manifest's perched anchor is the
// FEET, but fly/glide are anchored on the body centroid — placing the perched
// still by its feet would jump the silhouette up ~0.17H on the glide→perched
// switch. So the perched layer is placed by the point that puts its alpha
// centroid where the glide frame's centroid is (measured: glide centroid at
// (0.512, 0.615) of its cell, perched at (0.597, 0.538) of its image; solved for
// FLY_SCALE): feet − (0.073, 0.229). The feet stay the transform-origin.
export const PERCHED_PLACEMENT_OFFSET = { x: -0.0733, y: -0.2289 }

/**
 * Box geometry shared by KyroDove and Penny.jsx. Everything is a FRACTION of the
 * box height H, so the same numbers work for a `size` prop or a CSS var.
 *
 * All three layers are placed so their anchor lands on ONE common point P; the
 * box is the union of their extents, so no state overflows the span and
 * switching state never moves the body.
 */
export function deriveGeometry(manifest = FALLBACK) {
  const fly = manifest.fly || FALLBACK.fly
  const glide = manifest.glide || FALLBACK.glide
  const perched = manifest.perched || FALLBACK.perched
  const flyAspect = fly.cellW / fly.cellH
  const glideAspect = glide.w / glide.h
  const perchedAspect = perched.w / perched.h

  // Extents around P in "units" (u = perched rendered height).
  const layers = [
    { key: 'fly', h: FLY_SCALE, aspect: flyAspect, anchor: fly.anchor },
    { key: 'glide', h: FLY_SCALE, aspect: glideAspect, anchor: glide.anchor },
    {
      key: 'perched',
      h: 1,
      aspect: perchedAspect,
      anchor: {
        x: perched.anchor.x + PERCHED_PLACEMENT_OFFSET.x,
        y: perched.anchor.y + PERCHED_PLACEMENT_OFFSET.y,
      },
    },
  ]
  let above = 0
  let below = 0
  let left = 0
  let right = 0
  for (const l of layers) {
    const w = l.h * l.aspect
    above = Math.max(above, l.anchor.y * l.h)
    below = Math.max(below, (1 - l.anchor.y) * l.h)
    left = Math.max(left, l.anchor.x * w)
    right = Math.max(right, (1 - l.anchor.x) * w)
  }
  const unitsTall = above + below
  const u = 1 / unitsTall // one unit as a fraction of H
  const aspect = (left + right) * u // W / H
  const ax = left * u // P.x as a fraction of H
  const ay = above * u // P.y as a fraction of H

  const place = (l) => {
    const h = l.h * u
    const w = h * l.aspect
    return { h, w, left: ax - l.anchor.x * w, top: ay - l.anchor.y * h }
  }
  return {
    aspect,
    ax,
    ay,
    fly: {
      ...place(layers[0]),
      file: ASSET_BASE + fly.file,
      frames: fly.frames,
      cols: fly.cols,
      rows: fly.rows,
      fps: fly.fps,
    },
    glide: { ...place(layers[1]), file: ASSET_BASE + glide.file },
    perched: {
      ...place(layers[2]),
      file: ASSET_BASE + perched.file,
      file256: ASSET_BASE + (perched.variants?.[256]?.file || perched.file),
      // Feet position INSIDE the perched layer (for transform-origin of the
      // breathe/settle so the bird moves about its feet, not its center).
      originX: perched.anchor.x,
      originY: perched.anchor.y,
    },
    // The perched bird's feet as a fraction of the BOX (x, y) — for parents that
    // squash/pivot the whole dove (e.g. the landing-scene touchdown).
    feet: {
      x: ax - PERCHED_PLACEMENT_OFFSET.x * perchedAspect * u,
      y: ay - PERCHED_PLACEMENT_OFFSET.y * u,
    },
  }
}

export const FALLBACK_GEOMETRY = deriveGeometry(FALLBACK)

let manifestPromise = null
let loaded = null

const preload = (src) =>
  new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve()
    const img = new Image()
    img.onload = () => (img.decode ? img.decode().catch(() => {}).then(resolve) : resolve())
    img.onerror = () => resolve()
    img.src = src
  })

/** Fetch + cache the manifest once; preload the images. Never rejects. */
export function loadManifest() {
  if (manifestPromise) return manifestPromise
  if (typeof fetch === 'undefined') return Promise.resolve(FALLBACK)
  manifestPromise = fetch(ASSET_BASE + 'manifest.json', { cache: 'force-cache' })
    .then((r) => (r.ok ? r.json() : FALLBACK))
    .then((m) => (m && m.fly && m.perched && m.glide ? m : FALLBACK))
    .catch(() => FALLBACK)
    .then((m) => {
      loaded = m
      const g = deriveGeometry(m)
      // Fire-and-forget; the swap in never waits on these.
      preload(g.perched.file)
      preload(g.fly.file)
      preload(g.glide.file)
      return m
    })
  return manifestPromise
}

export const getManifest = () => loaded || FALLBACK

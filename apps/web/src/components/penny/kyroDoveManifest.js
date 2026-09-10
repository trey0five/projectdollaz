// ─────────────────────────────────────────────────────────────────────────────
// KYRO the owl — asset contract for the sprite assets in /public/kyro-owl/.
// (File name kept from the dove era: it is an internal identifier, like
// KyroDove.jsx — the bird is now a snowy owl, owner decision 2026-09-10.)
//
// FALLBACK below is a verbatim copy of `public/kyro-owl/manifest.json` (the
// numbers the build script wrote), so the FIRST paint never waits on a fetch:
// KyroDove renders at fallback geometry immediately, `loadManifest()` fetches
// the JSON once (module-cached) and preloads the three webp files, and the
// hook swaps the manifest in if the served one differs (it normally doesn't).
//
// Anchors are FRACTIONS of the cell/image (already ratios — no /cellW needed):
//   fly / glide → body centroid (the pixels opaque in every frame: body+head+tail)
//   perched     → the feet (x = centroid of the talon pixels, y = lowest claw)
// Every sprite is authored facing RIGHT; mirror with scaleX(-1).
// ─────────────────────────────────────────────────────────────────────────────

export const ASSET_BASE = '/kyro-owl/'

export const FALLBACK = {
  fly: {
    file: 'fly.webp',
    frames: 42,
    cols: 7,
    rows: 6,
    cellW: 384,
    cellH: 139,
    sheetW: 2688,
    sheetH: 834,
    fps: 24,
    anchor: { x: 0.3342, y: 0.4001 },
    facing: 'right',
    loop: 'forward',
  },
  perched: {
    file: 'perched.webp',
    w: 507,
    h: 512,
    anchor: { x: 0.6549, y: 0.962 },
    facing: 'right',
    variants: { 256: { file: 'perched@256.webp', w: 254, h: 256 } },
  },
  glide: {
    file: 'glide.webp',
    w: 384,
    h: 139,
    anchor: { x: 0.3342, y: 0.4001 },
    facing: 'right',
  },
}

// Alpha-silhouette CENTROIDS measured by the asset build
// (demo-video/owl-candidates/sora/measurements.json), as fractions of the glide
// cell / perched image. THESE are the common point P every layer is placed by —
// not the manifest anchors. The manifest's fly/glide anchor is the torso (the
// always-opaque pixels) and its perched anchor is the feet; neither is what the
// eye tracks on the glide→perched cut, and — the subtler trap — a `facing` flip
// is a scaleX(-1) about P.x, so unless P IS the silhouette's mass centre, the
// flip that often coincides with a landing (glide faced the direction of
// travel, perched faces the card) throws the whole bird sideways by
// 2·(centroid − P). Anchoring on the centroids makes both cuts and both
// facings invariant by construction. The fly sheet shares the glide's crop and
// anchor, so the torso still holds still through the wingbeat.
export const GLIDE_CENTROID = { x: 0.4515, y: 0.4945 }
export const PERCHED_CENTROID = { x: 0.5733, y: 0.5274 }

// The flying/gliding layers render this many times the perched layer's HEIGHT
// (a fly cell is 384×139, so the flying owl is FLY_SCALE × 2.76 perched-heights
// wide). 1.0 is the size at which the owl reads as the SAME bird across the cut:
// the head/eye and torso mass of the wings-spread frame match the perched still
// (checked by overlaying glide on perched at 0.9 / 1.2 / 1.5 / 2.07 — at 2.07,
// the value that equates the horizontal flight torso's THICKNESS to the standing
// bird's HEIGHT, the flying owl is plainly a much bigger bird). The dove used
// 1.22 because its perched still was drawn at a larger scale than its cells.
export const FLY_SCALE = 1.0

// PLACEMENT anchor for the perched layer relative to the manifest's feet anchor:
// the perched still is placed by its alpha centroid (= P), the feet stay the
// transform-origin of the breathe/flutter/settle keyframes. Derived, not typed,
// so it cannot drift from the centroids (that drift was the "bird pops on
// landing" bug). Independent of FLY_SCALE.
export function placementOffset(manifest = FALLBACK) {
  const perched = manifest.perched || FALLBACK.perched
  return { x: PERCHED_CENTROID.x - perched.anchor.x, y: PERCHED_CENTROID.y - perched.anchor.y }
}
export const PERCHED_PLACEMENT_OFFSET = placementOffset()

/**
 * Box geometry shared by KyroDove and Penny.jsx. Everything is a FRACTION of the
 * box height H, so the same numbers work for a `size` prop or a CSS var.
 *
 * All three layers are placed so their anchor lands on ONE common point P, so
 * switching state never moves the body. The BOX is:
 *   • vertically, the union of all three layers (so a parent's `bottom: H + 8`
 *     bubble clears the bird in every state, wings up or down);
 *   • horizontally, the PERCHED still only (symmetric about P.x). The owl's fly cell is 2.76:1 — its
 *     wingspan is ~6 body-heights — so a box that contained the wings would be
 *     three times wider than the bird you see 99% of the time, and every layout
 *     that sizes/places the mascot by its box (corner inset, beside-the-card
 *     placement, the clickable button, badges) would drift far off the bird.
 *     The fly/glide layers therefore OVERFLOW the box sideways while airborne
 *     (`fly.left` is negative); nothing that hosts a flight clips, and inactive
 *     layers are collapsed (KyroDove) so they never add scrollable overflow.
 */
export function deriveGeometry(manifest = FALLBACK) {
  const fly = manifest.fly || FALLBACK.fly
  const glide = manifest.glide || FALLBACK.glide
  const perched = manifest.perched || FALLBACK.perched
  const flyAspect = fly.cellW / fly.cellH
  const glideAspect = glide.w / glide.h
  const perchedAspect = perched.w / perched.h
  const offset = placementOffset(manifest)

  // Extents around P in "units" (u = perched rendered height). Every layer is
  // anchored on its silhouette centroid (see GLIDE_CENTROID above); fly shares
  // the glide's crop so it takes the same anchor.
  const layers = [
    { key: 'fly', h: FLY_SCALE, aspect: flyAspect, anchor: GLIDE_CENTROID },
    { key: 'glide', h: FLY_SCALE, aspect: glideAspect, anchor: GLIDE_CENTROID },
    {
      key: 'perched',
      h: 1,
      aspect: perchedAspect,
      anchor: { x: perched.anchor.x + offset.x, y: perched.anchor.y + offset.y },
    },
  ]
  let above = 0
  let below = 0
  for (const l of layers) {
    above = Math.max(above, l.anchor.y * l.h)
    below = Math.max(below, (1 - l.anchor.y) * l.h)
  }
  // Horizontal: the perched still, made SYMMETRIC about P.x so the flipped
  // (facing-left) still stays inside the box too — costs ~0.07u of slack on one
  // side, and means the box, the button hit-area and any badge inset track the
  // bird in both facings.
  const perchedLayer = layers[2]
  const half = Math.max(perchedLayer.anchor.x, 1 - perchedLayer.anchor.x) * perchedAspect
  const left = half
  const right = half
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
  const perchedBox = place(perchedLayer)
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
      ...perchedBox,
      file: ASSET_BASE + perched.file,
      file256: ASSET_BASE + (perched.variants?.[256]?.file || perched.file),
      // Feet position INSIDE the perched layer (for transform-origin of the
      // breathe/settle so the bird moves about its feet, not its center).
      originX: perched.anchor.x,
      originY: perched.anchor.y,
    },
    // The perched bird's feet as a fraction of the BOX (x, y) — for parents that
    // squash/pivot the whole bird (e.g. the landing-scene touchdown).
    feet: {
      x: perchedBox.left + perched.anchor.x * perchedBox.w,
      y: perchedBox.top + perched.anchor.y * perchedBox.h,
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

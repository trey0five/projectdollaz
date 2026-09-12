// ─────────────────────────────────────────────────────────────────────────────
// KYRO the owl — asset contract for the sprite assets in /public/kyro-owl/.
// (File name kept from the dove era: it is an internal identifier, like
// KyroDove.jsx — the bird is now a LITTLE OWL, Athene noctua, Athena's owl of
// knowledge; owner decision 2026-09-10, replacing the snowy owl the same day.)
//
// FALLBACK below is a verbatim copy of `public/kyro-owl/manifest.json` (the
// numbers the build script wrote), so the FIRST paint never waits on a fetch:
// KyroDove renders at fallback geometry immediately, `loadManifest()` fetches
// the JSON once (module-cached) and preloads the three webp files, and the
// hook swaps the manifest in if the served one differs (it normally doesn't).
//
// GEOMETRY IS KEYED TO THE PIXELS (the "two giant cells" bug, 2026-09-10): the
// sprite math only works if the manifest that sizes the fly layer describes the
// sheet the browser actually decodes. Every mascot swap so far (dove → snowy
// owl → little owl) changed cols/rows/cell aspect at the SAME URLs, and prod
// serves everything under /public with a one-year `immutable` cache, so a user
// could hold the snowy owl's manifest (7×6, 2.76:1 cells) next to the little
// owl's sheet (6×6, ~1:1) — the fly layer then came out 2.8× too wide with
// `700% 600%` background-size over a 6×6 sheet: two partial cells side by side,
// head in one, wing in the other. `force-cache` on the manifest fetch made that
// the DEFAULT outcome even in dev (it never revalidated). Three belts now:
//   1. asset URLs carry `?v=<w>x<h>` from the manifest's own dimensions, so a
//      manifest that describes a different sheet asks for a different URL
//      (an old cached sheet can never be paired with a new manifest);
//   2. the manifest is fetched with `cache: 'no-cache'` (always revalidated);
//   3. the served manifest is only ADOPTED after the fly sheet has decoded and
//      its natural size equals the manifest's sheetW×sheetH — otherwise the
//      FALLBACK (shipped in the same bundle as the assets) stays in force.
//
// Anchors are FRACTIONS of the cell/image (already ratios — no /cellW needed):
//   fly / glide → body centroid (the pixels opaque in every frame: body+head+tail)
//   perched     → the feet (x = centroid of the talon pixels, y = lowest claw)
//   perch       → the spot on the branch's top edge those feet rest on
// Every sprite is authored facing RIGHT; mirror with scaleX(-1).
// ─────────────────────────────────────────────────────────────────────────────

export const ASSET_BASE = '/kyro-owl/'

/** Asset URL keyed to the dimensions the manifest declares for it (belt 1). */
export const assetUrl = (file, w, h) => `${ASSET_BASE}${file}?v=${w}x${h}`

export const FALLBACK = {
  fly: {
    file: 'fly.webp',
    frames: 36,
    cols: 6,
    rows: 6,
    cellW: 249,
    cellH: 256,
    sheetW: 1494,
    sheetH: 1536,
    fps: 24,
    anchor: { x: 0.5674, y: 0.4613 },
    facing: 'right',
    loop: 'forward',
  },
  perched: {
    file: 'perched.webp',
    w: 512,
    h: 505,
    anchor: { x: 0.6311, y: 0.9744 },
    facing: 'right',
    variants: { 256: { file: 'perched@256.webp', w: 256, h: 252 } },
  },
  glide: {
    file: 'glide.webp',
    w: 249,
    h: 256,
    anchor: { x: 0.5674, y: 0.4613 },
    facing: 'right',
  },
  // The olive branch the owl lands on (owner 2026-09-12: "the owl should land
  // on something … instead of floating in the air"; Athena's owl + olive
  // branch). anchor = the spot on the bare wood, right of the leaf junction,
  // where the perched still's FEET anchor (lowest claw) sits — ~0.055 of the
  // image into the 0.10-thick wood so the toes read as gripping it, with the
  // wood painting BEHIND the claw tips (the perch layer is z-below perched).
  perch: {
    file: 'perch.webp',
    w: 512,
    h: 325,
    anchor: { x: 0.76, y: 0.87 },
    facing: 'right',
    variants: { 256: { file: 'perch@256.webp', w: 256, h: 163 } },
  },
}

// Alpha-silhouette CENTROIDS measured by the asset build
// (demo-video/owl-candidates/little/sora/measurements.json), as fractions of the glide
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
export const GLIDE_CENTROID = { x: 0.5057, y: 0.4105 }
export const PERCHED_CENTROID = { x: 0.5664, y: 0.483 }

// The flying/gliding layers render this many times the perched layer's HEIGHT.
// The little owl's fly cell is ~1:1 (249×256): unlike the snowy owl's 2.76:1
// cell, the wings here sweep from 0.41u ABOVE the body centroid to 0.59u BELOW
// it, so the torso is only ~0.23 of the cell and "same bird" is a HEAD match,
// not a cell-height match. Overlaying glide on perched, centroid-aligned, at
// 1.0/1.4/1.7/2.0/2.4/2.8 (demo-video/owl-candidates/little/sora/
// fly-scale-overlay.png): the head/eye masses coincide at ~2.0 (the stricter
// eye-diameter measurement says 1.9); at 1.4 the flying bird is plainly
// smaller, at 2.4 plainly bigger. 1.6 is the deliberate compromise: the flying
// head is ~80 % of the perched head (reads as the same bird a little further
// off) while the airborne layers stay ~1.6u tall — see the box rule below for
// why that number, not 2.0, is the one that costs nothing in the perched state.
export const FLY_SCALE = 1.6

// The perch renders this many times the perched still's WIDTH (the branch
// should read as something the bird sits ON, longer than the bird, but not a
// scene). Its anchor is pinned to the perched still's feet anchor, so the
// branch is placed by the same feet the breathe/flutter keyframes pivot on.
//
// The perch OVERFLOWS the box, like the airborne layers do (see the box rule
// below): the box stays the perched still so every `size` prop, the bubble
// (`bottom: H + 8` in Penny.jsx), the chevron and every corner inset are
// untouched. With the manifest anchor at (0.76, 0.87) and aspect 1.575 the
// branch is 1.166u wide × 0.740u tall and reaches ≈ 0.25u past the box on the
// TAIL side (the olive end; left when facing right, right when facing left)
// and ≈ 0.09u below it (≈ 16px / 6px at Penny's 64px box; 42px / 15px at the
// 172px Studio hero) — never past the box on the BEAK side, so a branch never
// crosses the card the guide points at. Every host surface was checked to
// have that much padding (or no clipping ancestor) at its size.
export const PERCH_SCALE = 1.15

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
 * switching state never moves the body. The BOX is the PERCHED still, both
 * ways (horizontally symmetric about P.x):
 *   • horizontally that was already the rule for the snowy owl (wingspan ~6
 *     body-heights): a box that contained the wings would be several times
 *     wider than the bird you see 99% of the time, and every layout that
 *     sizes/places the mascot by its box (corner inset, beside-the-card
 *     placement, the clickable button, badges) would drift far off the bird;
 *   • vertically it USED to be the union of all three layers. The snowy owl's
 *     2.76:1 cell made that free (the wings barely left the body's height).
 *     The little owl's ~1:1 cell does not: its wings sweep 0.41u above and
 *     0.59u below P, so a union box at FLY_SCALE 1.6 would be 1.6u tall and
 *     the perched bird — the one every `size` prop is written for — would
 *     shrink to 62% of its box on every surface (parked, chat header, the
 *     172px Studio hero). So the airborne layers now overflow vertically too,
 *     by (0.41·FLY_SCALE − 0.48)u ≈ 0.17u above and (0.59·FLY_SCALE − 0.52)u ≈
 *     0.43u below the box (≈ 11px / 28px at Penny's 64px box) — only while
 *     flying/gliding. The bubble sits `bottom: H + 8` above the box, so a
 *     wing-up tip can brush its underside mid-flight (cosmetic; the bubble is
 *     for the perched bird). Nothing that hosts a flight clips, and inactive
 *     layers are collapsed (KyroDove) so they never add scrollable overflow.
 *     Callers that want the old envelope can read fly.top/fly.h from the
 *     geometry — it is still derived, just no longer folded into the box.
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
  // Vertical: the perched still only (see the box rule above); the airborne
  // layers overflow above/below while flying.
  const perchedLayer = layers[2]
  const above = perchedLayer.anchor.y * perchedLayer.h
  const below = (1 - perchedLayer.anchor.y) * perchedLayer.h
  // Horizontal: the perched still, made SYMMETRIC about P.x so the flipped
  // (facing-left) still stays inside the box too — costs ~0.07u of slack on one
  // side, and means the box, the button hit-area and any badge inset track the
  // bird in both facings.
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
  // The perched bird's feet as a fraction of the BOX (x, y).
  const feet = {
    x: perchedBox.left + perched.anchor.x * perchedBox.w,
    y: perchedBox.top + perched.anchor.y * perchedBox.h,
  }
  // Perch: PERCH_SCALE × the perched width, its anchor ON the feet (overflows
  // the box — see PERCH_SCALE). `null` when the manifest has no perch block.
  const perchSrc = manifest.perch || FALLBACK.perch
  const perch = perchSrc
    ? (() => {
        const w = perchedBox.w * PERCH_SCALE
        const h = w / (perchSrc.w / perchSrc.h)
        return {
          w,
          h,
          left: feet.x - perchSrc.anchor.x * w,
          top: feet.y - perchSrc.anchor.y * h,
          file: assetUrl(perchSrc.file, perchSrc.w, perchSrc.h),
          file256: perchSrc.variants?.[256]
            ? assetUrl(perchSrc.variants[256].file, perchSrc.variants[256].w, perchSrc.variants[256].h)
            : assetUrl(perchSrc.file, perchSrc.w, perchSrc.h),
          // The contact point inside the perch layer (transform-origin, so a
          // collapse/scale about it keeps the branch under the feet).
          originX: perchSrc.anchor.x,
          originY: perchSrc.anchor.y,
        }
      })()
    : null
  return {
    aspect,
    ax,
    ay,
    fly: {
      ...place(layers[0]),
      file: assetUrl(fly.file, fly.sheetW, fly.sheetH),
      frames: fly.frames,
      cols: fly.cols,
      rows: fly.rows,
      fps: fly.fps,
    },
    glide: { ...place(layers[1]), file: assetUrl(glide.file, glide.w, glide.h) },
    perched: {
      ...perchedBox,
      file: assetUrl(perched.file, perched.w, perched.h),
      file256: perched.variants?.[256]
        ? assetUrl(perched.variants[256].file, perched.variants[256].w, perched.variants[256].h)
        : assetUrl(perched.file, perched.w, perched.h),
      // Feet position INSIDE the perched layer (for transform-origin of the
      // breathe/settle so the bird moves about its feet, not its center).
      originX: perched.anchor.x,
      originY: perched.anchor.y,
    },
    perch,
    // The perched bird's feet as a fraction of the BOX (x, y) — for parents that
    // squash/pivot the whole bird (e.g. the landing-scene touchdown). The perch
    // anchor sits exactly here.
    feet,
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

/** An optional still block (perch): if present it must be sized and anchored. */
const isWellFormedStill = (s) =>
  s == null ||
  !!(s.file && s.w > 0 && s.h > 0 && Number.isFinite(s.anchor?.x) && Number.isFinite(s.anchor?.y))

/** Shape + internal consistency: the sheet must really be cols×rows cells. */
export function isWellFormedManifest(m) {
  const f = m?.fly
  return !!(
    f &&
    m.perched &&
    m.glide &&
    isWellFormedStill(m.perch) &&
    Number.isFinite(f.cols) &&
    Number.isFinite(f.rows) &&
    f.cols >= 1 &&
    f.rows >= 1 &&
    f.frames >= 1 &&
    f.frames <= f.cols * f.rows &&
    f.cellW > 0 &&
    f.cellH > 0 &&
    f.cols * f.cellW === f.sheetW &&
    f.rows * f.cellH === f.sheetH
  )
}

/** Belt 3: does this manifest describe a sheet of the given decoded size? */
export const manifestMatchesSheet = (m, naturalW, naturalH) =>
  !!m?.fly && m.fly.sheetW === naturalW && m.fly.sheetH === naturalH

/**
 * Decode the fly sheet the manifest points at and report its natural size.
 * Resolves null where it cannot be measured (no DOM, image failed) so the
 * caller falls back to the manifest shipped in the bundle rather than trusting
 * an unverified one.
 */
const measureSheet = (src) =>
  new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve(null)
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = src
  })

/**
 * Fetch + cache the manifest once; adopt it only if it is well-formed AND the
 * fly sheet that decodes is the one it describes; preload the images. Never
 * rejects.
 */
export function loadManifest() {
  if (manifestPromise) return manifestPromise
  if (typeof fetch === 'undefined') return Promise.resolve(FALLBACK)
  manifestPromise = fetch(ASSET_BASE + 'manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : FALLBACK))
    .then((m) => (isWellFormedManifest(m) ? m : FALLBACK))
    .catch(() => FALLBACK)
    .then(async (m) => {
      if (m === FALLBACK) return m
      const dims = await measureSheet(deriveGeometry(m).fly.file)
      if (dims && manifestMatchesSheet(m, dims.w, dims.h)) return m
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(
          '[KyroDove] served manifest does not describe the fly sheet that decoded ' +
            `(${m.fly.sheetW}x${m.fly.sheetH} vs ${dims ? `${dims.w}x${dims.h}` : 'unmeasurable'}); ` +
            'keeping the bundled manifest.',
        )
      }
      return FALLBACK
    })
    .then((m) => {
      loaded = m
      const g = deriveGeometry(m)
      // Fire-and-forget; the swap in never waits on these.
      preload(g.perched.file)
      preload(g.perched.file256)
      preload(g.fly.file)
      preload(g.glide.file)
      if (g.perch) {
        preload(g.perch.file)
        preload(g.perch.file256)
      }
      return m
    })
  return manifestPromise
}

/** Test seam: forget the cached fetch (module-scoped promise). */
export function __resetManifestCache() {
  manifestPromise = null
  loaded = null
}

export const getManifest = () => loaded || FALLBACK

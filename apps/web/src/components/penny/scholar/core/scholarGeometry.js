// ─────────────────────────────────────────────────────────────────────────────
// scholarGeometry — the Scholar's box, as constants. Replaces the old sprite
// manifest fetch (kyroDoveManifest.js): there is nothing to load, so the box is
// right on the first paint and never changes.
//
// The frame is the IDLE SILHOUETTE, measured from the rendered art (alpha
// bbox at 4×, ground shadow and thought-cloud excluded): x 35.25–224.75,
// y 28.5–289 in the mock's units. So the box IS the resting bird — feet on the
// bottom edge, cap/tufts at the top — and the bird is symmetric about x = 130,
// the box centre, which is why mirroring it never shifts the body.
//
// All fractions are of the box HEIGHT (the mascot's `size` is its height).
// ─────────────────────────────────────────────────────────────────────────────

export const VIEWBOX = Object.freeze({ x: 35.25, y: 28.5, w: 189.5, h: 260.5 })
export const VIEWBOX_ATTR = `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`

const fx = (u) => (u - VIEWBOX.x) / VIEWBOX.h
const fy = (u) => (u - VIEWBOX.y) / VIEWBOX.h

/** Width ÷ height of the box. */
export const ASPECT = VIEWBOX.w / VIEWBOX.h // ≈ 0.727

/** Body centroid (x, y as fractions of H) — the point flights are aimed by. */
export const CENTER = Object.freeze({ x: fx(129.92), y: fy(160.44) }) // ≈ 0.363, 0.506

/** Where the feet touch the ground (fractions of H). */
export const FEET = Object.freeze({ x: fx(130), y: fy(289) }) // ≈ 0.363, 1.0

/** One owl unit in px for a box `h` px tall. */
export const unitPx = (h) => h / VIEWBOX.h

/**
 * The geometry object the flight engine reads (same shape the old
 * useKyroGeometry returned: aspect, ax/ay = centre, feet).
 */
export const SCHOLAR_GEOMETRY = Object.freeze({
  aspect: ASPECT,
  ax: CENTER.x,
  ay: CENTER.y,
  feet: FEET,
  viewBox: VIEWBOX,
})

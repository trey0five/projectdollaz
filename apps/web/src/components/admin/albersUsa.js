// ─────────────────────────────────────────────────────────────────────────────
// albersUsa.js — a tiny, dependency-free Albers-USA projection used ONLY to place
// city dots on top of the hand-coded US_STATE_PATHS choropleth. It is NOT a full
// d3.geoAlbersUsa; it's the single conic-equal-area lobe (the lower-48) plus two
// hand-tuned insets for Alaska and Hawaii, matching the reference admin panels.
//
// Constants come from the reference panels (the `@svg-maps/usa` viewBox
// "192 9 1028 746" is a DISTINCT coordinate space from d3's default, so TX/TY are
// tuned to that art). If dots land slightly off, nudge TX/TY (and the AK/HI inset
// translates) — see the CALIBRATION note in the spec. lat/lon are in degrees.
// ─────────────────────────────────────────────────────────────────────────────

const SCALE = 1320
const TX = 766
const TY = 304

// Standard parallels + projection center for the contiguous US.
const LON0 = -96
const LAT0 = 38.5
const P1 = 29.5
const P2 = 45.5

const RAD = Math.PI / 180

// Precompute the conic constants once (Albers equal-area conic).
const sinP1 = Math.sin(P1 * RAD)
const sinP2 = Math.sin(P2 * RAD)
const N = (sinP1 + sinP2) / 2
const C = Math.cos(P1 * RAD) ** 2 + 2 * N * sinP1
const RHO0 = Math.sqrt(C - 2 * N * Math.sin(LAT0 * RAD)) / N

// Project a lat/lon (degrees) through the lower-48 Albers lobe into SVG pixels.
export function latLonToXY(lat, lon) {
  const theta = N * ((lon - LON0) * RAD)
  const rho = Math.sqrt(C - 2 * N * Math.sin(lat * RAD)) / N
  const x = rho * Math.sin(theta)
  const y = RHO0 - rho * Math.cos(theta)
  // SVG is y-down but the Albers lobe is y-up, so negate Y (as d3.geoAlbersUsa
  // does) — otherwise every dot renders vertically mirrored.
  return { x: TX + SCALE * x, y: TY - SCALE * y }
}

// Alaska + Hawaii ride in their own boxes on the reference art (bottom-left).
// We project them through the same conic but re-scale/re-translate the result so
// the dots land inside the AK/HI map insets rather than out in the ocean.
function projectInset(lat, lon, insetScale, ix, iy, refLat, refLon) {
  // Project the point and the inset's reference center, then place the point
  // relative to that center at the inset's own scale.
  const p = rawLobe(lat, lon)
  const c = rawLobe(refLat, refLon)
  return { x: ix + (p.x - c.x) * insetScale, y: iy + (p.y - c.y) * insetScale }
}

// The bare conic in the SAME pixel space as latLonToXY (before inset re-mapping).
function rawLobe(lat, lon) {
  const theta = N * ((lon - LON0) * RAD)
  const rho = Math.sqrt(C - 2 * N * Math.sin(lat * RAD)) / N
  return { x: TX + SCALE * (rho * Math.sin(theta)), y: TY - SCALE * (RHO0 - rho * Math.cos(theta)) }
}

// Public: project a city, routing AK/HI to their insets and everything else to
// the main lower-48 lobe. `region` is the 2-letter state code.
export function projectCity({ region, lat, lon }) {
  if (region === 'AK') return projectInset(lat, lon, 0.35, 430, 640, 63, -152)
  if (region === 'HI') return projectInset(lat, lon, 1, 560, 690, 20.7, -157)
  return latLonToXY(lat, lon)
}

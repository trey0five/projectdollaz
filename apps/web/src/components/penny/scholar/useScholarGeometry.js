// useScholarGeometry — the Scholar's box for the flight engine (Penny.jsx).
// Same shape the sprite owl's useKyroGeometry() returned ({ aspect, ax, ay,
// feet }), but constant: the owl is drawn in code, so there is no manifest to
// fetch and the box is right on the first paint.
import { SCHOLAR_GEOMETRY } from './core/scholarGeometry.js'

export function useScholarGeometry() {
  return SCHOLAR_GEOMETRY
}

export default useScholarGeometry

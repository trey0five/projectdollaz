// labelText — the ONE place a school name loses its filler before it is
// shortened for an axis or a dot label. `academics/chartKit.shortName` and
// `charts/ColumnChart` (shortLabel / wrapLabel) all call this, so "High School",
// "Academy" and friends are stripped by one regex, never two that drift.
const FILLER = /\b(High School|School|Academy|Catholic|Senior|Sr)\b/g

/** A name without its filler words, whitespace collapsed; the name itself if nothing is left. */
export function stripFiller(name) {
  const n = String(name ?? '').replace(FILLER, '').replace(/\s+/g, ' ').trim()
  return n || String(name ?? '')
}

// ─────────────────────────────────────────────────────────────────────────────
// The academics vocabulary, mirrored for the browser.
//
// The canonical list is `packages/db/src/academics.ts`, which the web cannot
// import: @finrep/db pulls in the Prisma client. This is the same mirror
// arrangement `lib/modules.js` has with `packages/db/src/modules.ts`, and the
// spec beside this file fails the moment the two lists disagree.
// ─────────────────────────────────────────────────────────────────────────────

export const TEST_TYPE_KEYS = [
  'act',
  'preact',
  'sat',
  'psat_nmsqt',
  'psat_10',
  'psat_89',
  'terranova',
  'iowa',
  'map',
  'star',
  'state_assessment',
]

export const TEST_TYPE_LABELS = {
  act: 'ACT',
  preact: 'PreACT',
  sat: 'SAT',
  psat_nmsqt: 'PSAT/NMSQT',
  psat_10: 'PSAT 10',
  psat_89: 'PSAT 8/9',
  terranova: 'TerraNova',
  iowa: 'Iowa Assessments',
  map: 'NWEA MAP',
  star: 'STAR',
  state_assessment: 'State Assessment',
}

/** The display name for a test key, falling back to the key rather than blank. */
export function testTypeLabel(key) {
  return TEST_TYPE_LABELS[key] ?? String(key ?? '').toUpperCase()
}

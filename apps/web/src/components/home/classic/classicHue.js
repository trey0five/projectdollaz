// ─────────────────────────────────────────────────────────────────────────────
// classicHue — the school identity colour the CLASSIC school-home briefing band
// tints itself with (multi-school orgs). Frozen copy of the palette + hash that
// shipped at origin/main 74caaba, so a school's band keeps exactly the colour it
// had in production. The org home's SchoolTile owns its own (newer) palette; this
// one deliberately does not follow it.
// ─────────────────────────────────────────────────────────────────────────────
const CLASSIC_SCHOOL_HUES = [
  '#2563eb',
  '#7c3aed',
  '#0891b2',
  '#e11d48',
  '#d97706',
  '#059669',
  '#4f46e5',
  '#db2777',
]

/** Stable hue per school ID (a small string hash) — not tied to list position. */
export function classicSchoolHue(schoolId) {
  const str = String(schoolId ?? '')
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return CLASSIC_SCHOOL_HUES[h % CLASSIC_SCHOOL_HUES.length]
}

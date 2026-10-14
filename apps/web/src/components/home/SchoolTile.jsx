// ─────────────────────────────────────────────────────────────────────────────
// SchoolTile — one school's identity on the ORG-scope home. Premium UI P2 turned
// the grid of sixteen school cards into a DataTable (OrgTiles), so this file
// now owns the two things that survive that move:
//   • schoolHue(id)  — the school's stable identity colour (also used by the
//     school's own home stage).
//   • SchoolMark     — the crest cell: the uploaded logo on a white plate, or a
//     monogram in the school's hue. Rendered in the table's first column.
// Each school gets its own colour from a rotating palette so rows read as
// distinct at a glance; colour follows the school, not its list position.
// ─────────────────────────────────────────────────────────────────────────────
import { useSchools } from '../../context/SchoolContext.jsx'
import { monogramOf } from './SchoolCrest.jsx'

// Distinct, validated hues (dataviz categorical light set) — one per school,
// cycled by a hash of the id. No purple in the set (Premium UI P2).
const SCHOOL_HUES = [
  '#2563eb',
  '#0891b2',
  '#e11d48',
  '#d97706',
  '#059669',
  '#0ea5e9',
  '#db2777',
  '#4f46e5',
]

// Stable hue per school ID (a small string hash), so a school reads the SAME
// colour on its org row AND on its own home stage — not tied to list position.
export function schoolHue(schoolId) {
  const str = String(schoolId ?? '')
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return SCHOOL_HUES[h % SCHOOL_HUES.length]
}

/**
 * The crest cell. The logo comes from the ROSTER, not from the org briefing:
 * the rollup that feeds the table is a briefing summary — putting a base64 logo
 * for every school on it would bloat a request made on every org page load,
 * for a picture the client already holds. SchoolContext has the roster.
 */
export function SchoolMark({ schoolId, name, size = 28 }) {
  const { schools: roster } = useSchools()
  const logo = roster?.find((r) => r.id === schoolId)?.logoBase64 ?? null
  const hue = schoolHue(schoolId)
  if (logo) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-hair bg-white p-0.5"
        style={{ width: size, height: size }}
      >
        <img src={logo} alt="" className="h-full w-full object-contain" />
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-sm font-serif text-[12px] font-semibold leading-none text-white"
      style={{ width: size, height: size, background: hue }}
    >
      {monogramOf(name)}
    </span>
  )
}

export default SchoolMark

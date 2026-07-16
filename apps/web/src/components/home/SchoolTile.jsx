// ─────────────────────────────────────────────────────────────────────────────
// SchoolTile — one school on the ORG-scope home. The org twin of ModuleTile:
// same hue-flood-on-hover tile (home-tiles.css), but each tile represents a
// school in the organization and clicking it SWAPS the app to that school's view
// (setActiveSchool + setScope('school')). Each school gets its own colour from a
// rotating palette so they read as distinct at a glance. A status chip surfaces
// that school's attention level from the org briefing rollup.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

// Distinct, validated hues (dataviz categorical light set) — one per school,
// cycled by index. Colour follows the school, so the grid stays legible.
const SCHOOL_HUES = [
  '#2563eb',
  '#7c3aed',
  '#0891b2',
  '#e11d48',
  '#d97706',
  '#059669',
  '#4f46e5',
  '#db2777',
]

// Stable hue per school ID (a small string hash), so a school reads the SAME
// colour on its org tile AND on its own home briefing band — not tied to list
// position.
export function schoolHue(schoolId) {
  const str = String(schoolId ?? '')
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return SCHOOL_HUES[h % SCHOOL_HUES.length]
}

function initials(name) {
  const words = (name || '').split(/\s+/).filter((w) => /[a-zA-Z]/.test(w))
  const letters = words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
  return letters || (name || '?').slice(0, 2).toUpperCase()
}

// Attention chip from the org briefing's per-school summary {total,critical,warn,info}.
function chipFor(school, ready) {
  if (!ready) return { text: '—', tone: 'none' }
  if (!school.reported) return { text: 'No statements yet', tone: 'none' }
  const s = school.summary || {}
  const critical = s.critical ?? 0
  const rest = (s.warn ?? 0) + (s.info ?? 0)
  if (critical > 0) return { text: `${critical} critical`, tone: 'critical' }
  if (rest > 0) return { text: `${rest} to review`, tone: 'attention' }
  return { text: 'All clear', tone: 'clear' }
}

const ENTRANCE = (reduce, index) => ({
  initial: reduce ? { opacity: 0 } : { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: index * 0.04, type: 'spring', stiffness: 240, damping: 24 },
})

export default function SchoolTile({ school, index = 0, ready = true, onSelect }) {
  const reduce = useReducedMotion()
  const hue = schoolHue(school.schoolId)
  const chip = chipFor(school, ready)

  return (
    <motion.li {...ENTRANCE(reduce, index)} whileHover={reduce ? undefined : { y: -4 }} className="list-none">
      <button
        type="button"
        onClick={() => onSelect?.(school.schoolId)}
        aria-label={`Switch to ${school.name}${school.periodLabel ? ` — ${school.periodLabel}` : ''}`}
        className="module-tile group w-full text-left"
        style={{ '--tile-hue': hue }}
      >
        <div className="tile-body" aria-hidden="true">
          <div className="flex items-start justify-between gap-3">
            <span className="tile-art font-serif text-[19px] font-bold">{initials(school.name)}</span>
            <span className="tile-arrow">
              <ArrowRight size={16} />
            </span>
          </div>
          <div>
            <h3 className="tile-title font-serif text-[17px] font-semibold leading-snug text-navy">
              {school.name}
            </h3>
            <p className="tile-sub mt-1 text-[13.5px] leading-relaxed text-muted">
              {school.periodLabel ? `Latest · ${school.periodLabel}` : 'Open this school’s dashboard'}
            </p>
          </div>
          <div className="mt-auto flex items-center justify-between gap-3 pt-1">
            <span className={`tile-chip tile-chip--${chip.tone}`}>{chip.text}</span>
          </div>
        </div>
      </button>
    </motion.li>
  )
}

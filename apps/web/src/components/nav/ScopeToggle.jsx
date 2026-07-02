// ─────────────────────────────────────────────────────────────────────────────
// ScopeToggle — the School ↔ Organization segmented control in the top strip.
// Renders ONLY for a multi-school caller (AppShell already guards on
// useScope().isMultiSchool). Styled for the dark navy header: an animated gold
// pill marks the active scope (shared layoutId), reduced-motion safe.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Building2, Layers } from 'lucide-react'
import { useScope } from '../../context/ScopeContext.jsx'

const SCOPES = [
  { value: 'school', label: 'School', Icon: Building2 },
  { value: 'org', label: 'Organization', shortLabel: 'Org', Icon: Layers },
]

export default function ScopeToggle() {
  const { scope, setScope, orgSchoolCount } = useScope()
  const reduce = useReducedMotion()

  return (
    <div
      role="tablist"
      aria-label="Scope"
      title={`Viewing ${scope === 'org' ? `all ${orgSchoolCount} schools (consolidated)` : 'a single school'}`}
      className="relative flex items-center gap-0.5 rounded-lg border-2 border-white/15 bg-white/[0.04] p-0.5"
    >
      {SCOPES.map((s) => {
        const active = scope === s.value
        return (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setScope(s.value)}
            className={`relative z-10 flex min-h-[36px] items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.08em] outline-none ring-gold/50 transition-colors focus-visible:ring-2 ${
              active ? 'text-navy-deep' : 'text-white/60 hover:text-white'
            }`}
          >
            {active && (
              <motion.span
                layoutId="scope-toggle-pill"
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-md bg-gold-gradient shadow-glow"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <s.Icon size={14} className="shrink-0" />
            <span className="hidden sm:inline">{s.label}</span>
            {s.shortLabel && <span className="sm:hidden">{s.shortLabel}</span>}
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Readiness tab bar. Desktop = segmented tabs with an animated gold underline
// (mirrors Dashboard.jsx, but with a DISTINCT layoutId so the underline never
// animates across pages). Mobile = the ReportPicker dropdown (the established
// phone pattern). Each tab may carry a small `badge` node rendered inline after
// the label on desktop. Presentational only — active-tab state lives in the panel.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import ReportPicker from '../reports/ReportPicker.jsx'

export default function ReadinessTabs({ tabs, value, onChange }) {
  return (
    <>
      {/* Desktop: segmented gold-underline tabs */}
      <div className="no-print hidden border-b-2 border-rule bg-white/95 backdrop-blur sm:block">
        <nav className="scrollbar-none flex items-stretch gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              aria-current={value === t.key ? 'page' : undefined}
              className={`relative -mb-0.5 flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-lg px-3.5 py-4 text-[13px] font-semibold uppercase tracking-wide transition-colors ${
                value === t.key
                  ? 'bg-gold/15 text-navy'
                  : 'text-muted hover:bg-section/60 hover:text-navy'
              }`}
            >
              <span>{t.short ?? t.label}</span>
              {t.badge}
              {value === t.key && (
                <motion.span
                  layoutId="readiness-tab-underline"
                  className="absolute inset-x-0 -bottom-0.5 h-[4px] rounded-full bg-gold-gradient"
                />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Mobile: dropdown picker (relative z-20 keeps the open menu above panels) */}
      <div className="no-print relative z-20 rounded-xl border-2 border-rule bg-white shadow-card sm:hidden">
        <ReportPicker tabs={tabs} value={value} onChange={onChange} />
      </div>
    </>
  )
}

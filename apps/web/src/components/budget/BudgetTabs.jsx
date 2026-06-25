// Accessible, keyboard-navigable tab bar for the Budget workspace. Navy/gold
// pill bar with a framer-motion shared underline that slides between tabs.
//
// Presentational only: it owns NO content, just the active-tab selection. The
// parent renders the panels via render-helper functions (React-Compiler safe —
// no nested component definitions). This component follows the WAI-ARIA tabs
// pattern: roving tabindex, ArrowLeft/Right + Home/End wrap-around, role=tab on
// each control wired to its panel via aria-controls / id.
import { useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

export default function BudgetTabs({ tabs, active, onChange }) {
  const reduce = useReducedMotion()
  const btnRefs = useRef([])

  // Roving focus + wrap-around arrow navigation across the tab strip.
  const onKeyDown = (e, idx) => {
    const last = tabs.length - 1
    let next = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = idx === last ? 0 : idx + 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = idx === 0 ? last : idx - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    if (next == null) return
    e.preventDefault()
    onChange(tabs[next].id)
    btnRefs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Budget workspace sections"
      className="flex flex-wrap gap-1.5 rounded-2xl border border-gold/25 bg-navy-gradient p-1.5 shadow-navy-glow"
    >
      {tabs.map((t, idx) => {
        const isActive = t.id === active
        const Icon = t.Icon
        return (
          <button
            key={t.id}
            ref={(el) => {
              btnRefs.current[idx] = el
            }}
            id={`budget-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-controls={`budget-panel-${t.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={`relative flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.1em] outline-none ring-gold/50 transition-colors focus-visible:ring-2 ${
              isActive ? 'text-navy' : 'text-white/70 hover:text-white'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="budget-tab-pill"
                className="absolute inset-0 rounded-xl bg-gold-gradient shadow-glow"
                transition={
                  reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }
                }
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {Icon && <Icon size={15} />}
              <span className="whitespace-nowrap">{t.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

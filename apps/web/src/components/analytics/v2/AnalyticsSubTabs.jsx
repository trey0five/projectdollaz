// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsSubTabs — the content axis (Overview · Charts · Scorecard). Clones
// ModuleTabs' a11y contract: role=tablist/tab, roving tabindex + arrow-key nav,
// aria-selected, focus-visible ring, and a sliding gold underline (static under
// reduced-motion). Each tab shows a label + a one-word "what kind" caption from the
// mockup ("the story" / "the graphs" / "the metrics").
// ─────────────────────────────────────────────────────────────────────────────
import { useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { VIEWS } from './useAnalyticsNav.js'

const VIEW_META = {
  overview: { label: 'Overview', caption: 'the story' },
  charts: { label: 'Charts', caption: 'the graphs' },
  scorecard: { label: 'Scorecard', caption: 'the metrics' },
}

export default function AnalyticsSubTabs({ view, onView }) {
  const reduce = useReducedMotion()
  const tabRefs = useRef([])

  const onKeyDown = (e, i) => {
    let next = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % VIEWS.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + VIEWS.length) % VIEWS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = VIEWS.length - 1
    if (next == null) return
    e.preventDefault()
    onView(VIEWS[next])
    tabRefs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Analytics content"
      className="av2-chiprow border-b border-rule/60 pb-0"
    >
      {VIEWS.map((key, i) => {
        const active = key === view
        const meta = VIEW_META[key]
        return (
          <button
            key={key}
            ref={(el) => (tabRefs.current[i] = el)}
            role="tab"
            id={`av2-subtab-${key}`}
            aria-selected={active}
            aria-controls="av2-panel"
            tabIndex={active ? 0 : -1}
            onClick={() => onView(key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative flex shrink-0 flex-col items-start gap-0.5 rounded-t-lg border-x border-t px-4 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/50 ${
              active
                ? 'border-gold/50 bg-white'
                : 'border-transparent text-muted hover:bg-cream/60'
            }`}
          >
            <span className={`text-[14px] font-semibold ${active ? 'text-navy' : 'text-muted'}`}>
              {meta.label}
            </span>
            <span className="text-[11px] text-muted">{meta.caption}</span>
            {active &&
              (reduce ? (
                <span className="absolute inset-x-3 -bottom-px h-[3px] rounded-full bg-gold" />
              ) : (
                <motion.span
                  layoutId="av2-subtab-underline"
                  className="absolute inset-x-3 -bottom-px h-[3px] rounded-full bg-gold"
                />
              ))}
          </button>
        )
      })}
    </div>
  )
}

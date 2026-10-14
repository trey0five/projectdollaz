// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsSubTabs — the content axis (Overview · Charts · Scorecard). Clones
// ModuleTabs' a11y contract: role=tablist/tab, roving tabindex + arrow-key nav,
// aria-selected, focus-visible ring. Premium UI P3: ink tabs on the ground with
// a sliding 2px rule in the module hue (static under reduced-motion) — no card
// tabs, no gold. Each tab shows a label + a one-word "what kind" caption
// ("the story" / "the graphs" / "the metrics").
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
    <div role="tablist" aria-label="Analytics content" className="tabs-ink">
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
            className="tab-ink"
          >
            <span>{meta.label}</span>
            <span className="tab-ink-cap">{meta.caption}</span>
            {active &&
              (reduce ? (
                <span className="tab-ink-rule" aria-hidden="true" />
              ) : (
                <motion.span layoutId="av2-subtab-underline" className="tab-ink-rule" aria-hidden="true" />
              ))}
          </button>
        )
      })}
    </div>
  )
}

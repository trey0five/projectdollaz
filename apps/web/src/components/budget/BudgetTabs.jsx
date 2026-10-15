// Accessible, keyboard-navigable tab bar for the Budget workspace. Premium UI
// P4: the ink tabs on the ground (`.tabs-ink`, the P3 pattern) — label in ink,
// a 2px rule under the active tab that slides between tabs (one-shot layout
// motion; static under reduced motion). No navy band, no gold pill.
//
// Presentational only: it owns NO content, just the active-tab selection. The
// parent renders the panels via render-helper functions (React-Compiler safe —
// no nested component definitions). This component follows the WAI-ARIA tabs
// pattern: roving tabindex, ArrowLeft/Right + Home/End wrap-around, role=tab on
// each control wired to its panel via aria-controls / id.
import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import '../../styles/pending/b2-finance.css'

export default function BudgetTabs({ tabs, active, onChange }) {
  const reduce = useReducedMotion()
  const btnRefs = useRef([])
  const fadeRef = useRef(null)
  const scrollRef = useRef(null)

  // Phone width: the strip scrolls sideways. Show a right-edge fade while more
  // tabs sit off-screen (the b2-hscroll-fade cue), and bring the active tab to
  // the start of the strip so it is never clipped mid-word. The overflow flags
  // are written straight to the DOM — no re-render per scroll event.
  useEffect(() => {
    const wrap = fadeRef.current
    const sc = scrollRef.current
    if (!wrap || !sc) return undefined
    const sync = () => {
      const over = sc.scrollWidth > sc.clientWidth + 1
      if (over) wrap.setAttribute('data-overflow', 'x')
      else wrap.removeAttribute('data-overflow')
      wrap.setAttribute('data-at-end', String(sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 2))
    }
    sync()
    sc.addEventListener('scroll', sync, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null
    ro?.observe(sc)
    return () => {
      sc.removeEventListener('scroll', sync)
      ro?.disconnect()
    }
  }, [tabs.length])
  useEffect(() => {
    const sc = scrollRef.current
    const idx = tabs.findIndex((t) => t.id === active)
    const btn = btnRefs.current[idx]
    if (!sc || !btn || sc.scrollWidth <= sc.clientWidth + 1) return
    const left = btn.offsetLeft - sc.offsetLeft
    if (left < sc.scrollLeft || left + btn.offsetWidth > sc.scrollLeft + sc.clientWidth) {
      sc.scrollTo({ left: Math.max(0, left - 16), behavior: reduce ? 'auto' : 'smooth' })
    }
  }, [active, tabs, reduce])

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
    // The scroller is a WRAPPER so the active tab's 2px rule (which sits on the
    // strip's hairline, 1px below the buttons) is never clipped by it.
    <div ref={fadeRef} className="b2-hscroll-fade">
    <div ref={scrollRef} className="scrollbar-none overflow-x-auto">
    <div role="tablist" aria-label="Budget workspace sections" className="tabs-ink min-w-max">
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
            className="tab-ink shrink-0"
          >
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              {Icon && <Icon size={14} aria-hidden="true" className="text-ink2" />}
              {t.label}
            </span>
            {t.caption ? <span className="tab-ink-cap">{t.caption}</span> : null}
            {isActive &&
              (reduce ? (
                <span className="tab-ink-rule" aria-hidden="true" />
              ) : (
                <motion.span layoutId="budget-tab-rule" className="tab-ink-rule" aria-hidden="true" />
              ))}
          </button>
        )
      })}
    </div>
    </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EnrollmentAnalyticsTabs — the FOUR DOORS into the Analytics tab.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// The tab was one ~4,500px column: six charts, a figures table and two honesty
// surfaces stacked in a single scroll. Everything on it was worth drawing and
// almost none of it was ever seen, because the reader who came to ask "which
// grades carry the miss" had to scroll past the trend to find it and then had no
// way to link anyone else straight to it. These are FOUR DIFFERENT QUESTIONS —
// how has the whole school moved · where is the miss · what is happening to each
// class · who is actually here — not four slices of one, so each gets its own
// door. (Same reasoning, same idiom as the academics dashboard's view strip.)
//
// ── THE A11Y CONTRACT IS CLONED FROM AnalyticsSubTabs, NOT APPROXIMATED ─────
// role=tablist / role=tab, aria-selected, aria-controls onto ONE panel id,
// ROVING TABINDEX (only the selected tab is in the tab order) and arrow/Home/End
// key nav that moves selection AND focus together. The underline glides between
// tabs via a shared layoutId, and is a static bar under reduced motion.
//
// The underline wears the MODULE hue rather than gold: this strip renders inside
// <ModuleAccent moduleKey="enrollment">, where a gold rule would be the only
// thing on the page that had not been re-hued.
//
// ── URL MODEL ───────────────────────────────────────────────────────────────
// The view is `?view=` beside the page's existing `?tab=` — the same sub-view
// param ModuleTabs already reserves and clears on tab changes, so nothing new is
// invented and a stale view cannot leak onto another tab. Every pick PUSHES
// history, so the back button walks the doors you opened and a link pasted into
// an email opens on the chart it was written about.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { ENROLL_HUE } from './enrollmentAnalyticsKit.jsx'

/** The doors, in reading order: the whole school, then its parts, then its people. */
export const ENROLLMENT_VIEWS = [
  { key: 'trend', label: 'Trend', caption: 'how it moved' },
  { key: 'grades', label: 'Grades', caption: 'where the miss is' },
  { key: 'cohorts', label: 'Cohorts', caption: 'following a class' },
  { key: 'who', label: "Who's here", caption: 'the mix' },
]

const KEYS = ENROLLMENT_VIEWS.map((v) => v.key)
export const DEFAULT_VIEW = 'trend'

export const PANEL_ID = 'enr-analytics-panel'
const tabId = (key) => `enr-analytics-tab-${key}`

/**
 * The view in the URL. An absent or unknown `?view=` reads as Trend — so the
 * sidebar's bare `?tab=analytics` and an explicit `&view=trend` land in the same
 * place, and a link carrying a view from ANOTHER module's tab cannot strand this
 * page on a blank panel.
 *
 * The view is written explicitly (never dropped for the default): the strip is
 * the page's primary navigation now, and a URL that silently omits where you are
 * cannot be pasted to someone else as an answer.
 */
export function useEnrollmentAnalyticsView() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('view')
  const view = KEYS.includes(raw) ? raw : DEFAULT_VIEW
  const setView = useCallback(
    (key) => {
      if (!KEYS.includes(key)) return
      const next = new URLSearchParams(params)
      next.set('view', key)
      setParams(next) // PUSH: the back button walks the views
    },
    [params, setParams],
  )
  return [view, setView]
}

/**
 * The COHORT LADDER LENGTH, in the URL beside the view.
 *
 * It lives here rather than in the card for the same reason `?view=` does: a
 * setting that changes what is on screen belongs in the address bar, or the
 * reader cannot send anyone the thing they are looking at. `?window=4` deep
 * links to the four-grade grid and the back button walks the lengths tried.
 *
 * An absent or unreadable value reads as NULL, not as a number of our own: the
 * server picks the default (the longest the school's data supports) and echoes
 * it back. Inventing a default here would give the page two opinions about the
 * length and show whichever lost.
 */
export const COHORT_WINDOWS = [5, 4, 3, 2]

export function useEnrollmentCohortWindow() {
  const [params, setParams] = useSearchParams()
  const raw = Number(params.get('window'))
  // NOT named `window`: this file also reaches for the global one (print), and a
  // shadow there is the kind of bug that only shows up in the one code path.
  const selected = COHORT_WINDOWS.includes(raw) ? raw : null
  const setWindow = useCallback(
    (next) => {
      if (!COHORT_WINDOWS.includes(Number(next))) return
      const p = new URLSearchParams(params)
      p.set('window', String(next))
      setParams(p) // PUSH: the back button walks the lengths
    },
    [params, setParams],
  )
  return [selected, setWindow]
}

export default function EnrollmentAnalyticsTabs({ view, onView }) {
  const reduce = useReducedMotion()
  const tabRefs = useRef([])

  const onKeyDown = (e, i) => {
    let next = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % KEYS.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + KEYS.length) % KEYS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = KEYS.length - 1
    if (next == null) return
    e.preventDefault()
    onView(KEYS[next])
    tabRefs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Enrollment analysis"
      className="flex flex-wrap items-end gap-1 border-b border-rule/60"
    >
      {ENROLLMENT_VIEWS.map((v, i) => {
        const active = v.key === view
        return (
          <button
            key={v.key}
            type="button"
            ref={(el) => {
              tabRefs.current[i] = el
            }}
            role="tab"
            id={tabId(v.key)}
            aria-selected={active}
            aria-controls={PANEL_ID}
            tabIndex={active ? 0 : -1}
            onClick={() => onView(v.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative flex shrink-0 flex-col items-start gap-0.5 rounded-t-lg border-x border-t px-4 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-500/50 ${
              active ? 'bg-white' : 'border-transparent hover:bg-cream/60'
            }`}
            style={active ? { borderColor: `${ENROLL_HUE}55` } : undefined}
          >
            <span className={`text-[14px] font-semibold ${active ? 'text-navy' : 'text-muted'}`}>{v.label}</span>
            <span className="text-[10.5px] uppercase tracking-wide text-muted/80">{v.caption}</span>
            {active &&
              (reduce ? (
                <span
                  className="absolute inset-x-3 -bottom-px h-[3px] rounded-full"
                  style={{ background: ENROLL_HUE }}
                />
              ) : (
                <motion.span
                  layoutId="enr-analytics-underline"
                  className="absolute inset-x-3 -bottom-px h-[3px] rounded-full"
                  style={{ background: ENROLL_HUE }}
                />
              ))}
          </button>
        )
      })}
    </div>
  )
}

/** The one panel every tab controls — labelled by whichever tab is selected. */
export function EnrollmentAnalyticsPanel({ view, children }) {
  return (
    <div id={PANEL_ID} role="tabpanel" aria-labelledby={tabId(view)} tabIndex={-1} className="space-y-4 outline-none">
      {children}
    </div>
  )
}

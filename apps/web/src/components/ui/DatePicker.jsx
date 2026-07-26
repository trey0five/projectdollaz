// ─────────────────────────────────────────────────────────────────────────────
// DatePicker — the ONE on-theme date field, replacing the browser's native
// <input type="date"> everywhere (the default calendar is off-brand and looks
// different in every browser, especially the mm/dd/yyyy chrome on the dark
// modals). Drop-in contract: `value` is an ISO 'yyyy-mm-dd' string (or ''),
// `onChange(next)` receives the same. The TRIGGER inherits the caller's field
// class (fieldInput on dark modals, a light input class elsewhere); the POPOVER
// is one consistent cream calendar card portalled to <body> (so a modal's
// overflow-y-auto can't clip it) with a navy/gold month grid.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// ── Pure yyyy-mm-dd helpers (UTC math so no timezone drifts the calendar day) ──
const pad = (n) => String(n).padStart(2, '0')
const toIso = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`
function parseIso(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '')
  return m ? { y: +m[1], m0: +m[2] - 1, d: +m[3] } : null
}
function todayIso() {
  const n = new Date()
  return toIso(n.getFullYear(), n.getMonth(), n.getDate())
}
function daysInMonth(y, m0) {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()
}
function firstWeekday(y, m0) {
  return new Date(Date.UTC(y, m0, 1)).getUTCDay()
}
function prettyLabel(v) {
  const p = parseIso(v)
  return p ? `${MONTHS[p.m0].slice(0, 3)} ${p.d}, ${p.y}` : ''
}

export default function DatePicker({
  value = '',
  onChange,
  className = '',
  placeholder = 'Select date…',
  min,
  max,
  disabled = false,
  id,
  'aria-label': ariaLabel,
}) {
  const autoReduce = useReducedMotion()
  const reactId = useId()
  const fieldId = id || reactId
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null)
  // The month currently on view (independent of the selected value).
  const sel = parseIso(value)
  const [view, setView] = useState(() => {
    const base = sel || parseIso(todayIso())
    return { y: base.y, m0: base.m0 }
  })
  // Drill-down mode: 'days' (default) → header click → 'months' → header click →
  // 'years'. Picking a year returns to months, a month returns to days — so a far
  // birth date is 3 clicks, not 100 arrow presses.
  const [mode, setMode] = useState('days')

  // Open the popover, re-centering the grid on the selected month (or today).
  // Done here rather than in an effect so there's no setState-in-effect cascade.
  const openPicker = () => {
    const base = parseIso(value) || parseIso(todayIso())
    setView({ y: base.y, m0: base.m0 })
    setMode('days')
    setOpen(true)
  }

  const place = () => {
    const el = btnRef.current
    if (el) setRect(el.getBoundingClientRect())
  }
  useLayoutEffect(() => {
    if (open) place()
  }, [open])

  // Close on outside click, Esc, and reposition on scroll/resize.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onScroll = () => place()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  // The header arrows step by month in day view, by year in month view, and by
  // a 12-year page in year view.
  const step = (delta) => {
    if (mode === 'days') {
      setView((v) => {
        const m = v.m0 + delta
        return { y: v.y + Math.floor(m / 12), m0: ((m % 12) + 12) % 12 }
      })
    } else {
      setView((v) => ({ ...v, y: v.y + delta * (mode === 'years' ? 12 : 1) }))
    }
  }

  const pick = (d) => {
    onChange?.(toIso(view.y, view.m0, d))
    setOpen(false)
  }

  const today = todayIso()
  const outOfRange = (iso) => (min && iso < min) || (max && iso > max)
  // A month/year is pickable if any day inside it can be in range.
  const monthOutOfRange = (y, m0) =>
    (min && toIso(y, m0, daysInMonth(y, m0)) < min) || (max && toIso(y, m0, 1) > max)
  const yearOutOfRange = (y) =>
    (min && `${y}-12-31` < min) || (max && `${y}-01-01` > max)

  // Build the day grid: leading blanks then 1..N.
  const lead = firstWeekday(view.y, view.m0)
  const total = daysInMonth(view.y, view.m0)
  const cells = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]

  // Year view: a 12-year page anchored so the on-view year sits in the page.
  const yearPageStart = view.y - ((view.y % 12) + 12) % 12
  const yearCells = Array.from({ length: 12 }, (_, i) => yearPageStart + i)

  const headerLabel =
    mode === 'days'
      ? `${MONTHS[view.m0]} ${view.y}`
      : mode === 'months'
        ? String(view.y)
        : `${yearPageStart} – ${yearPageStart + 11}`
  const prevAria = mode === 'days' ? 'Previous month' : mode === 'months' ? 'Previous year' : 'Previous years'
  const nextAria = mode === 'days' ? 'Next month' : mode === 'months' ? 'Next year' : 'Next years'

  const popover = rect
    ? createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={popRef}
              initial={autoReduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
              style={{
                position: 'fixed',
                top: Math.min(rect.bottom + 8, window.innerHeight - 340),
                left: Math.min(rect.left, window.innerWidth - 312),
                width: 296,
              }}
              className="z-[80] rounded-2xl border border-gold/30 bg-cream p-3 shadow-[0_24px_60px_-18px_rgba(16,40,79,0.55)]"
              role="dialog"
              aria-label="Choose a date"
            >
              {/* Header nav — the label is a BUTTON that drills up: days → months
                  → years. Arrows step a month / a year / a 12-year page. */}
              <div className="mb-2 flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label={prevAria}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-navy/70 transition-colors hover:bg-gold/15 hover:text-navy"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setMode((m) => (m === 'days' ? 'months' : 'years'))}
                  disabled={mode === 'years'}
                  aria-label={
                    mode === 'days'
                      ? 'Choose month and year'
                      : mode === 'months'
                        ? 'Choose year'
                        : undefined
                  }
                  className={`rounded-lg px-2.5 py-1 font-serif text-[15px] font-semibold text-navy transition-colors ${
                    mode === 'years' ? '' : 'hover:bg-gold/15'
                  }`}
                >
                  {headerLabel}
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label={nextAria}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-navy/70 transition-colors hover:bg-gold/15 hover:text-navy"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              {mode === 'days' ? (
                <>
                  {/* Weekday header */}
                  <div className="grid grid-cols-7 gap-0.5 px-0.5 pb-1">
                    {WEEKDAYS.map((w) => (
                      <span
                        key={w}
                        className="py-1 text-center text-[11px] font-bold uppercase tracking-wide text-muted/70"
                      >
                        {w}
                      </span>
                    ))}
                  </div>

                  {/* Day grid */}
                  <div className="grid grid-cols-7 gap-0.5 px-0.5">
                    {cells.map((d, i) => {
                      if (d == null) return <span key={`b${i}`} />
                      const iso = toIso(view.y, view.m0, d)
                      const isSel = iso === value
                      const isToday = iso === today
                      const disabledDay = outOfRange(iso)
                      return (
                        <button
                          key={iso}
                          type="button"
                          disabled={disabledDay}
                          onClick={() => pick(d)}
                          className={`flex h-9 items-center justify-center rounded-lg text-[13.5px] font-semibold transition-all ${
                            isSel
                              ? 'bg-gold-gradient text-navy shadow-glow'
                              : disabledDay
                                ? 'cursor-not-allowed text-muted/30'
                                : isToday
                                  ? 'text-navy ring-1 ring-inset ring-gold/60 hover:bg-gold/15'
                                  : 'text-ink/80 hover:bg-gold/15 hover:text-navy'
                          }`}
                        >
                          {d}
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : mode === 'months' ? (
                /* Month grid — pick a month, drop back to days. */
                <div className="grid grid-cols-3 gap-1 px-0.5 py-1">
                  {MONTHS.map((name, m0) => {
                    const isCur = m0 === view.m0
                    const isSelMonth = sel && sel.y === view.y && sel.m0 === m0
                    const off = monthOutOfRange(view.y, m0)
                    return (
                      <button
                        key={name}
                        type="button"
                        disabled={off}
                        onClick={() => {
                          setView((v) => ({ ...v, m0 }))
                          setMode('days')
                        }}
                        className={`flex h-10 items-center justify-center rounded-lg text-[13px] font-semibold transition-all ${
                          isSelMonth
                            ? 'bg-gold-gradient text-navy shadow-glow'
                            : off
                              ? 'cursor-not-allowed text-muted/30'
                              : isCur
                                ? 'text-navy ring-1 ring-inset ring-gold/60 hover:bg-gold/15'
                                : 'text-ink/80 hover:bg-gold/15 hover:text-navy'
                        }`}
                      >
                        {name.slice(0, 3)}
                      </button>
                    )
                  })}
                </div>
              ) : (
                /* Year grid — a 12-year page; pick a year, drop back to months. */
                <div className="grid grid-cols-3 gap-1 px-0.5 py-1">
                  {yearCells.map((y) => {
                    const isCur = y === view.y
                    const isSelYear = sel && sel.y === y
                    const off = yearOutOfRange(y)
                    return (
                      <button
                        key={y}
                        type="button"
                        disabled={off}
                        onClick={() => {
                          setView((v) => ({ ...v, y }))
                          setMode('months')
                        }}
                        className={`flex h-10 items-center justify-center rounded-lg text-[13px] font-semibold tabular-nums transition-all ${
                          isSelYear
                            ? 'bg-gold-gradient text-navy shadow-glow'
                            : off
                              ? 'cursor-not-allowed text-muted/30'
                              : isCur
                                ? 'text-navy ring-1 ring-inset ring-gold/60 hover:bg-gold/15'
                                : 'text-ink/80 hover:bg-gold/15 hover:text-navy'
                        }`}
                      >
                        {y}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Footer actions */}
              <div className="mt-2 flex items-center justify-between border-t border-rule/50 px-1 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onChange?.(today)
                    setOpen(false)
                  }}
                  className="rounded-md px-2 py-1 text-[12.5px] font-semibold text-navy transition-colors hover:bg-gold/15"
                >
                  Today
                </button>
                {value ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange?.('')
                      setOpen(false)
                    }}
                    className="rounded-md px-2 py-1 text-[12.5px] font-semibold text-muted transition-colors hover:text-navy"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )
    : null

  return (
    <>
      <button
        ref={btnRef}
        id={fieldId}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={`${className} flex items-center justify-between gap-2 text-left ${
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        }`}
      >
        <span className={value ? '' : 'opacity-45'}>{value ? prettyLabel(value) : placeholder}</span>
        <CalendarIcon size={16} className="shrink-0 opacity-60" />
      </button>
      {popover}
    </>
  )
}

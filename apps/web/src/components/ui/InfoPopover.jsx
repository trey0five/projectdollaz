// ─────────────────────────────────────────────────────────────────────────────
// InfoPopover — a small ⓘ disclosure for methodology text that must SURVIVE but
// no longer needs to be read before the chart.
//
// Born from the enrollment analytics feedback: every chart led with a paragraph
// of (true, load-bearing) prose, and six paragraphs on one tab read as a wall.
// The fix is progressive disclosure, not deletion — the full text moves behind
// this trigger VERBATIM, and the card keeps a one-line caption in view.
//
// The a11y contract is the DISCLOSURE pattern, not a dialog: the trigger carries
// aria-expanded + aria-controls, focus STAYS on the trigger (the panel is
// reachable next in the tab order), Escape closes and keeps focus, and a click
// or focus outside closes. Reduced motion renders the panel without the pop.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Info, X } from 'lucide-react'

export default function InfoPopover({
  label = 'How to read this chart',
  children,
  align = 'right',
  panelWidth = 380,
  className = '',
}) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const panelId = useId()

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        // No stopPropagation: an outer Escape handler (a modal this popover sits
        // in, say) may also close — swallowing the event trapped the user a
        // keypress behind where they expected to be.
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    // pointerdown, not click: a drag that starts outside should already dismiss,
    // and click misses the case where the press target unmounts mid-gesture.
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onFocusIn = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [open])

  return (
    <span ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-500/60 ${
          open ? 'bg-sky-500/15 text-sky-700' : 'text-slate-400 hover:bg-navy/[0.05] hover:text-navy'
        }`}
      >
        <Info size={14} strokeWidth={2.2} />
      </button>
      {open ? (
        <motion.div
          id={panelId}
          role="region"
          aria-label={label}
          initial={reduce ? false : { opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          style={{ width: `min(${panelWidth}px, 88vw)` }}
          className={`absolute top-full z-30 mt-1.5 max-h-[60vh] overflow-y-auto rounded-lg border border-hair/15 bg-white p-3.5 text-left shadow-float ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
            <button
              type="button"
              aria-label="Close"
              onClick={() => {
                close()
                buttonRef.current?.focus()
              }}
              className="-mr-1 -mt-1 rounded-md p-1 text-muted transition-colors hover:bg-navy/[0.06] hover:text-navy"
            >
              <X size={13} />
            </button>
          </div>
          {children}
        </motion.div>
      ) : null}
    </span>
  )
}

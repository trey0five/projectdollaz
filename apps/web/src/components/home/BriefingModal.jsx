// ─────────────────────────────────────────────────────────────────────────────
// BriefingModal — the ui.v2 morning-brief POPUP. The brief no longer sits at the
// bottom of the home page; the band's ▶ Play / "Open the briefing" open THIS
// overlay, which mounts <PennyMorningBrief/> (passed as children, same props the
// page used to pass) inside a centered scrollable panel.
//
// autoNarrate: when opened via ▶ Play, dispatch 'penny:narrate' ~350ms after the
// panel mounts — the brief's listener registers on ITS mount, so the delay lets
// the child wire up before the event fires (the old band dispatched directly
// because the brief was already on the page).
//
// A11y: Esc closes; backdrop click closes; body scroll-locked while open; focus
// moves to the close button on open and returns to the opener on close; reduced
// motion = fade-only.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'

export default function BriefingModal({ open, onClose, autoNarrate = false, children }) {
  const reduce = useReducedMotion()
  const closeRef = useRef(null)

  // Esc + body scroll-lock + focus move-in/restore while open (DOM side-effects).
  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const raf = window.requestAnimationFrame(() => {
      if (closeRef.current) closeRef.current.focus()
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      window.cancelAnimationFrame(raf)
      if (opener && typeof opener.focus === 'function') opener.focus()
    }
  }, [open, onClose])

  // ▶ Play: fire 'penny:narrate' once the mounted brief's listener is wired.
  useEffect(() => {
    if (!open || !autoNarrate) return undefined
    const t = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('penny:narrate'))
    }, 350)
    return () => window.clearTimeout(t)
  }, [open, autoNarrate])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
            className="absolute inset-0 bg-navy/50 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Morning brief"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="relative max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-section p-4 shadow-2xl sm:p-6"
          >
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close the briefing"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-navy/10 bg-white text-navy shadow-lg outline-none ring-navy/40 transition-colors hover:bg-white/90 focus-visible:ring-2 sm:right-4 sm:top-4"
            >
              <X size={18} />
            </button>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

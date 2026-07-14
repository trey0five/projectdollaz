// ─────────────────────────────────────────────────────────────────────────────
// ModuleInfoPopup — the "what does this module unlock?" dialog opened from a
// locked tile's (i) button. Pure sell surface: pitch + feature bullets from
// MODULE_PITCH (tileRegistry), art/hue from the tile itself. Deliberately NO
// add-from-popup — unlocking lives ONLY in Settings → Membership (one code
// path, owner gating, celebration), so the primary CTA routes there.
// A11y: role=dialog aria-modal, Esc closes, focus lands on "Not now" on open,
// backdrop click closes. Reduced motion: fade only (no spring scale).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { tileLabel, MODULE_PITCH } from './tileRegistry.jsx'
import { MODULE_META } from '../../lib/modules.js'

export default function ModuleInfoPopup({ open, tile, onClose }) {
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const closeRef = useRef(null)
  const dialogRef = useRef(null)

  // Esc-to-close + a minimal Tab focus trap (aria-modal alone doesn't stop the
  // tab order escaping into the blurred page behind), gated on open.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll(
          'button, a[href], [tabindex]:not([tabindex="-1"])',
        )
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Move focus into the dialog on open (the ghost button — least destructive).
  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  const { key, hue, Art } = tile
  const label = tileLabel(key)
  // Fallback: any sellable key without curated pitch copy (e.g. a locked Finance
  // tile after a webhook writes an explicit set omitting finance) still gets a
  // sentence from the module registry instead of an empty dialog.
  const pitch = MODULE_PITCH[key] ?? {
    pitch: MODULE_META[key]?.description ?? '',
    bullets: [],
  }
  const titleId = `module-info-title-${key}`

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            style={{ '--tile-hue': hue }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: art disc + serif label + hue add-on mini-pill */}
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-12 w-12 flex-none items-center justify-center rounded-xl"
                style={{ background: `color-mix(in srgb, ${hue} 12%, white)`, color: hue }}
              >
                <Art width={30} height={30} />
              </span>
              <div className="min-w-0">
                <h2 id={titleId} className="font-serif text-[20px] font-semibold leading-snug text-navy">
                  {label}
                </h2>
                <span
                  className="mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]"
                  style={{ background: `color-mix(in srgb, ${hue} 12%, white)`, color: hue }}
                >
                  + Add-on
                </span>
              </div>
            </div>

            {pitch && (
              <>
                <p className="mt-4 text-[15px] leading-relaxed text-navy/80">{pitch.pitch}</p>
                <ul className="mt-4 space-y-2.5">
                  {pitch.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-[13.5px] leading-snug text-muted">
                      <Check size={14} className="mt-0.5 flex-none" style={{ color: hue }} aria-hidden="true" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-[14px] font-semibold text-muted transition-colors hover:bg-navy/[0.05] hover:text-navy"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => navigate('/settings/billing#modules')}
                className="btn-primary"
              >
                Add in Membership
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EntityFormModal — the ONE premium "add / edit record" modal shared across every
// register module (Governance policies/committees/meetings, Accreditation
// standards, Facilities maintenance, Advancement campaigns, Tasks). Replaces each
// page's hand-rolled `max-w-lg bg-navy-gradient` modal with a single luxe surface:
// a deep navy pane wrapped in the flowing gold↔navy gradient ring (.modal-lux),
// a gold icon medallion header, fields that stagger up on open, and a gold-sheen
// primary action. Respects prefers-reduced-motion (framer + the CSS ring both
// stand down). Purely presentational — each form keeps its own field/state logic.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X, ChevronDown } from 'lucide-react'

// Shared field class strings — a recessed navy well with a soft gold focus ring
// (.field-lux). `fieldSelect` hides the native chrome; the caller adds a chevron.
export const fieldInput = 'field-lux'
export const fieldSelect = 'field-lux cursor-pointer appearance-none pr-9'
export const fieldTextarea = 'field-lux resize-none leading-relaxed'

const EASE = [0.2, 0.8, 0.2, 1]

/** A native <select> styled as a luxe field, with a gold chevron overlay. */
export function Select({ value, onChange, children, ...rest }) {
  return (
    <div className="relative">
      <select value={value} onChange={onChange} className={fieldSelect} {...rest}>
        {children}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gold-light/70"
      />
    </div>
  )
}

/**
 * A labelled field. `span={2}` makes it full-width in the 2-col grid; `index`
 * drives the staggered fade-up so fields cascade in as the modal opens.
 */
export function Field({ label, hint, span = 1, index = 0, reduce, children }) {
  return (
    <motion.label
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : 0.04 * index + 0.06, duration: 0.3, ease: EASE }}
      className={`block ${span === 2 ? 'sm:col-span-2' : ''}`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-light/80">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] leading-snug text-white/40">{hint}</span> : null}
    </motion.label>
  )
}

/**
 * The modal shell. Renders nothing when `open` is false so the caller can mount it
 * unconditionally. `icon` is the module's lucide glyph (gold medallion); `title`
 * / `subtitle` head the form; children are `<Field>`s inside a 2-col grid.
 * `onSubmit` is the form submit; `saving` disables the primary; `error` shows a
 * red line above the actions; `submitLabel` names the primary; `wide` widens it.
 */
export default function EntityFormModal({
  open,
  onClose,
  icon: Icon,
  title,
  subtitle,
  onSubmit,
  saving = false,
  error = '',
  submitLabel = 'Save',
  reduce: reduceProp,
  wide = false,
  children,
}) {
  const autoReduce = useReducedMotion()
  const reduce = reduceProp ?? autoReduce

  // Esc closes; body scroll locks while open.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-navy-deep/70 backdrop-blur-md"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            className={`modal-lux relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden ${
              wide ? 'max-w-2xl' : 'max-w-lg'
            }`}
          >
            {/* Header — gold medallion + serif title, above the fields. */}
            <div className="relative z-10 flex items-start gap-3.5 px-6 pb-4 pt-6">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
                {Icon ? <Icon size={22} strokeWidth={2.1} /> : null}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 className="font-serif text-[21px] font-semibold leading-tight text-white">{title}</h2>
                {subtitle ? <p className="mt-0.5 text-[13px] leading-snug text-white/55">{subtitle}</p> : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg border border-white/15 p-1.5 text-white/60 transition-colors hover:border-gold/50 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="relative z-10 flex min-h-0 flex-1 flex-col">
              <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 overflow-y-auto px-6 pb-1 sm:grid-cols-2">
                {children}
              </div>
              {error ? (
                <p className="px-6 pt-2.5 text-[13px] font-medium text-red-300">{error}</p>
              ) : null}
              <div className="mt-3 flex items-center justify-end gap-2.5 border-t border-white/10 bg-navy-deep/40 px-6 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border-2 border-white/20 px-4 py-2.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-white/75 transition-all hover:border-white/40 hover:text-white"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-gold">
                  {saving ? 'Saving…' : submitLabel}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

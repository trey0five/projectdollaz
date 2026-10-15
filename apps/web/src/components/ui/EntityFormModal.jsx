// ─────────────────────────────────────────────────────────────────────────────
// EntityFormModal — the ONE "add / edit record" dialog shared across every
// register module (Governance policies/committees/meetings/people, Accreditation
// standards, Facilities maintenance, Advancement campaigns, Strategy, Tasks).
//
// Premium UI P4 (docs/Premium_UI_Plan.md §2.4): a Panel lifted to the one float
// elevation — white, 1px hairline, --r-panel radius, --sh-float — with a 2px
// module-hue rule along its top edge (drawn once), the module glyph as a hue
// icon STROKE (no medallion fill), a Garamond title, plain fields (.field-plain:
// no bevel, no sheen, no gold) and flat Buttons on a hairline footer. The old
// .modal-lux gradient ring / glint and the .btn-gold sheen are gone. Purely
// presentational — each form keeps its own field/state logic.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X, ChevronDown } from 'lucide-react'
import Button from './surface/Button.jsx'
import { useUiV2 } from '../../context/UiFlagContext.jsx'
import '../../styles/pending/c1-flows.css'

// Shared field class strings (.field-plain lives in styles/pending/c1-flows.css).
// `fieldSelect` hides the native chrome; <Select> adds the chevron.
export const fieldInput = 'field-plain'
export const fieldSelect = 'field-plain field-select'
export const fieldTextarea = 'field-plain field-area'

const EASE = [0.22, 1, 0.36, 1]

// The last element focused OUTSIDE any dialog. A form's `autoFocus` field takes
// focus during commit — before the open effect can read document.activeElement
// — so the opener is remembered here, by one capture-phase listener, instead.
let lastOutsideFocus = null
if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (e) => {
      const t = e.target
      if (t instanceof Element && !t.closest('[role="dialog"]')) lastOutsideFocus = t
    },
    true,
  )
}

/** A native <select> styled as a plain field, with a chevron overlay. */
export function Select({ value, onChange, children, ...rest }) {
  return (
    <div className="relative">
      <select value={value} onChange={onChange} className={fieldSelect} {...rest}>
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 mt-[3px] -translate-y-1/2 text-ink2"
      />
    </div>
  )
}

/**
 * A labelled field. `span={2}` makes it full-width in the 2-col grid; `index`
 * drives a one-shot staggered fade-up so fields settle in as the dialog opens.
 */
export function Field({ label, hint, span = 1, index = 0, reduce, children }) {
  return (
    <motion.label
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : 0.03 * index + 0.04, duration: 0.26, ease: EASE }}
      className={`block min-w-0 ${span === 2 ? 'sm:col-span-2' : ''}`}
    >
      <span className="fld-label block">{label}</span>
      {children}
      {hint ? <span className="fld-hint block">{hint}</span> : null}
    </motion.label>
  )
}

/**
 * The dialog shell. Renders nothing when `open` is false so the caller can mount
 * it unconditionally. `icon` is the module's lucide glyph (a hue stroke); `title`
 * / `subtitle` head the form; children are `<Field>`s inside a 2-col grid.
 * `onSubmit` is the form submit; `saving` disables the primary; `error` shows a
 * risk-marked line above the actions; `submitLabel` names the primary; `wide`
 * widens it.
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
  // Legacy guard: MfaWizard still emits v1 white-on-navy ternaries. Under
  // ?ui=v1 the (white) dialog gets .dlg-v1, whose pending c1-flows.css rules
  // remap those utilities to ink so they stay legible until they are dropped.
  const v2 = useUiV2()

  // Focus returns to the control that opened the dialog when it closes. Keyed on
  // `open` ALONE: the Esc effect below re-runs whenever a caller passes a fresh
  // inline onClose, and restoring from there would yank focus out mid-typing.
  useEffect(() => {
    if (!open) return undefined
    const a = document.activeElement
    const opener = a && a !== document.body && !a.closest?.('[role="dialog"]') ? a : lastOutsideFocus
    return () => {
      if (opener && opener !== document.body && opener.isConnected) opener.focus?.()
    }
  }, [open])

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
          transition={{ duration: 0.16 }}
        >
          <div className="dlg-scrim" onClick={onClose} aria-hidden="true" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.24, ease: EASE }}
            className={`dlg ${v2 ? '' : 'dlg-v1 '}flex max-h-[90vh] w-full flex-col ${wide ? 'max-w-2xl' : 'max-w-lg'}`}
          >
            {reduce ? (
              <span className="dlg-rule" aria-hidden="true" />
            ) : (
              <motion.span
                className="dlg-rule"
                aria-hidden="true"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.48, ease: EASE, delay: 0.06 }}
              />
            )}

            {/* Header — hue glyph + Garamond title + close, on a hairline. */}
            <div className="dlg-head">
              {Icon ? (
                <span className="dlg-icon" aria-hidden="true">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <h2 className="dlg-title">{title}</h2>
                {subtitle ? <p className="dlg-sub">{subtitle}</p> : null}
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="dlg-x">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="grid grid-cols-1 gap-x-4 gap-y-4 overflow-y-auto px-5 pb-2 pt-4 sm:grid-cols-2">
                {children}
              </div>
              {error ? (
                <div className="px-5 pt-2">
                  <p className="dlg-error" role="alert">
                    {error}
                  </p>
                </div>
              ) : null}
              <div className="dlg-foot mt-3">
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : submitLabel}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

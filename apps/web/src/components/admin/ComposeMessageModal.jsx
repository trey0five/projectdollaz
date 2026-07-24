// ─────────────────────────────────────────────────────────────────────────────
// ComposeMessageModal — admin composer that drops a message into one user's inbox
// (or, when the caller passes an 'all' target, broadcasts). Reused from the Users
// page row action; AdminMessagesPage uses it too for its Specific-user path. The
// `audience` prop is the FLAT target descriptor merged into the POST body exactly:
//   { target:'users', userIds:[...] }  |  { target:'all' }
// senderLabel defaults to "KYRO Team" (server default too, ≤80). White admin-
// console surface (matches _ui.jsx), Esc / backdrop / focus-trap, reduced motion.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Send, X } from 'lucide-react'
import { adminApi, apiErrorMessage } from '../../lib/api.js'

const LABEL_MAX = 80
const SUBJECT_MAX = 200
const BODY_MAX = 5000

export default function ComposeMessageModal({ open, onClose, audience, headerLabel, onSent }) {
  const reduce = useReducedMotion()
  const dialogRef = useRef(null)
  const firstRef = useRef(null)

  const [senderLabel, setSenderLabel] = useState('KYRO Team')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setSenderLabel('KYRO Team')
      setSubject('')
      setBody('')
      setError('')
      setBusy(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && dialogRef.current) {
        const list = Array.from(
          dialogRef.current.querySelectorAll(
            'button, a[href], input, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.disabled)
        if (!list.length) return
        const first = list[0]
        const last = list[list.length - 1]
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
    const raf = window.requestAnimationFrame(() => firstRef.current?.focus())
    return () => {
      window.removeEventListener('keydown', onKey)
      window.cancelAnimationFrame(raf)
    }
  }, [open, onClose])

  const canSubmit = subject.trim() && body.trim() && !busy && !!audience

  const submit = async () => {
    if (!canSubmit) return
    setError('')
    setBusy(true)
    try {
      const payload = {
        ...audience,
        subject: subject.trim(),
        body: body.trim(),
        ...(senderLabel.trim() ? { senderLabel: senderLabel.trim() } : {}),
      }
      const res = await adminApi.sendMessage(payload)
      onSent?.(res.data?.sent ?? 0)
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not send the message.'))
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-navy'

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/50 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Compose message"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral/15 text-coral">
                  <Send size={16} />
                </span>
                <div className="min-w-0">
                  <h2 className="font-serif text-[18px] text-ink">Send message</h2>
                  {headerLabel && <p className="truncate text-xs text-muted">{headerLabel}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-section hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                From (sender label)
              </label>
              <input
                ref={firstRef}
                value={senderLabel}
                maxLength={LABEL_MAX}
                onChange={(e) => setSenderLabel(e.target.value)}
                placeholder="KYRO Team"
                className={inputCls}
              />

              <label className="mb-1 mt-4 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Subject
              </label>
              <input
                value={subject}
                maxLength={SUBJECT_MAX}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className={inputCls}
              />

              <label className="mb-1 mt-4 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Message
              </label>
              <textarea
                value={body}
                maxLength={BODY_MAX}
                rows={6}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message…"
                className={`${inputCls} resize-y`}
              />
              <div className="mt-1 text-right text-[11px] text-muted tabular-nums">
                {body.length}/{BODY_MAX}
              </div>

              {error && (
                <p className="mt-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">
                  {error}
                </p>
              )}

              <div className="mt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-section hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  className="inline-flex items-center gap-2 rounded-lg bg-coral px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send size={15} /> {busy ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

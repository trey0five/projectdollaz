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
import Button from '../ui/surface/Button.jsx'
import '../../styles/pending/c1-flows.css'

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

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <div className="dlg-scrim" aria-hidden="true" />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Compose message"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="dlg w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="dlg-rule" aria-hidden="true" />
            <div className="dlg-head items-center">
              <Send size={18} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-ink2" />
              <div className="min-w-0 flex-1">
                <h2 className="dlg-title">Send message</h2>
                {headerLabel && <p className="dlg-sub truncate">{headerLabel}</p>}
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="dlg-x">
                <X size={16} />
              </button>
            </div>

            <div className="dlg-body">
              <label htmlFor="compose-sender" className="fld-label block">
                From (sender label)
              </label>
              <input
                id="compose-sender"
                ref={firstRef}
                value={senderLabel}
                maxLength={LABEL_MAX}
                onChange={(e) => setSenderLabel(e.target.value)}
                placeholder="KYRO Team"
                className="field-plain"
              />

              <label htmlFor="compose-subject" className="fld-label mt-4 block">
                Subject
              </label>
              <input
                id="compose-subject"
                value={subject}
                maxLength={SUBJECT_MAX}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="field-plain"
              />

              <label htmlFor="compose-body" className="fld-label mt-4 block">
                Message
              </label>
              <textarea
                id="compose-body"
                value={body}
                maxLength={BODY_MAX}
                rows={6}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message…"
                className="field-plain field-area"
              />
              <div className="mt-1 text-right text-[11px] tabular-nums text-ink2">
                {body.length}/{BODY_MAX}
              </div>

              {error && (
                <p className="dlg-error mt-2" role="alert">
                  {error}
                </p>
              )}
            </div>
            <div className="dlg-foot">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submit} disabled={!canSubmit} icon={<Send size={14} />}>
                {busy ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

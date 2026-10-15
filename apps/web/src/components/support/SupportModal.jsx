// ─────────────────────────────────────────────────────────────────────────────
// SupportModal — the in-app "Contact support" form that replaces the AvatarMenu
// mailto. Subject + message → POST /support; the BACKEND emails support@ourkyro.com
// with replyTo = the signed-in user's email (the client never sends a from/replyTo
// field). A Panel-styled dialog at the float elevation (Premium UI P4); Esc /
// backdrop / focus-return,
// reduced-motion safe. On success it shows an inline confirmation (no global toast
// provider) reassuring the user we'll reply to their address.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { LifeBuoy, X, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { authApi, apiErrorMessage } from '../../lib/api.js'
import Button from '../ui/surface/Button.jsx'
import '../../styles/pending/c1-flows.css'

const SUBJECT_MAX = 200
const MESSAGE_MAX = 5000

export default function SupportModal({ open, onClose }) {
  const { user } = useAuth()
  const reduce = useReducedMotion()
  const dialogRef = useRef(null)
  const firstFieldRef = useRef(null)

  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const email = user?.email || ''

  // Reset the form whenever the modal (re)opens so a prior send doesn't linger.
  useEffect(() => {
    if (open) {
      setSubject('')
      setMessage('')
      setError('')
      setSent(false)
      setBusy(false)
    }
  }, [open])

  // Focus returns to the opener (the Support button) when the dialog closes.
  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement
    return () => {
      if (opener && opener !== document.body && opener.isConnected) opener.focus?.()
    }
  }, [open])

  // Esc-to-close + a minimal Tab focus-trap; focus the first field on open.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll(
          'button, a[href], input, textarea, [tabindex]:not([tabindex="-1"])',
        )
        const list = Array.from(f).filter((el) => !el.disabled)
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
    const raf = window.requestAnimationFrame(() => firstFieldRef.current?.focus())
    return () => {
      window.removeEventListener('keydown', onKey)
      window.cancelAnimationFrame(raf)
    }
  }, [open, onClose])

  const canSubmit = subject.trim() && message.trim() && !busy

  const submit = async () => {
    if (!canSubmit) return
    setError('')
    setBusy(true)
    try {
      await authApi.support({ subject: subject.trim(), message: message.trim() })
      setSent(true)
    } catch (err) {
      if (err?.response?.status === 429) {
        setError('You’ve sent a few messages just now — please wait a minute and try again.')
      } else {
        setError(apiErrorMessage(err, 'Could not send your message. Please try again.'))
      }
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
            aria-label="Contact support"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="dlg w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="dlg-rule" aria-hidden="true" />
            <div className="dlg-head items-center">
              <LifeBuoy size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-ink2" />
              <h2 className="dlg-title min-w-0 flex-1">Contact support</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="dlg-x">
                <X size={16} />
              </button>
            </div>

            {sent ? (
              <>
                <div className="dlg-body flex items-start gap-3">
                  <CheckCircle2 size={22} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 tone-good" />
                  <p className="text-[15px] leading-[23px] text-ink">
                    Message sent — we’ll reply to <strong className="font-semibold">{email}</strong>.
                  </p>
                </div>
                <div className="dlg-foot">
                  <Button variant="primary" onClick={onClose}>
                    Done
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="dlg-body">
                  <p className="mb-4 text-[13px] text-ink2">
                    From <span className="font-medium text-ink">{email || 'your account'}</span> —
                    we’ll reply to this address.
                  </p>

                  <label htmlFor="support-subject" className="fld-label block">
                    Subject
                  </label>
                  <input
                    id="support-subject"
                    ref={firstFieldRef}
                    value={subject}
                    maxLength={SUBJECT_MAX}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="What can we help with?"
                    className="field-plain"
                  />

                  <label htmlFor="support-message" className="fld-label mt-4 block">
                    Message
                  </label>
                  <textarea
                    id="support-message"
                    value={message}
                    maxLength={MESSAGE_MAX}
                    rows={6}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us what’s going on…"
                    className="field-plain field-area"
                  />
                  <div className="mt-1 text-right text-[11px] tabular-nums text-ink2">
                    {message.length}/{MESSAGE_MAX}
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
                  <Button variant="primary" onClick={submit} disabled={!canSubmit}>
                    {busy ? 'Sending…' : 'Send'}
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

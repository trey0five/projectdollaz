// ─────────────────────────────────────────────────────────────────────────────
// SupportModal — the in-app "Contact support" form that replaces the AvatarMenu
// mailto. Subject + message → POST /support; the BACKEND emails support@ourkyro.com
// with replyTo = the signed-in user's email (the client never sends a from/replyTo
// field). Navy-deep dialog matching the app chrome; Esc / backdrop / focus-return,
// reduced-motion safe. On success it shows an inline confirmation (no global toast
// provider) reassuring the user we'll reply to their address.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { LifeBuoy, X, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { authApi, apiErrorMessage } from '../../lib/api.js'

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

  const inputCls =
    'w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-[14px] text-white outline-none ring-gold/50 placeholder:text-white/35 focus:border-white/30 focus-visible:ring-2'

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-navy-deep/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Contact support"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/12 bg-navy-deep shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral/15 text-coral">
                  <LifeBuoy size={18} />
                </span>
                <h2 className="font-serif text-[18px] text-white">Contact support</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {sent ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
                  <CheckCircle2 size={30} />
                </span>
                <p className="text-[15px] leading-relaxed text-white/85">
                  Message sent — we’ll reply to <strong className="text-white">{email}</strong>.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-6 rounded-lg bg-coral px-5 py-2 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="px-5 py-4">
                <p className="mb-4 text-[13px] text-white/60">
                  From <span className="font-medium text-white/80">{email || 'your account'}</span> —
                  we’ll reply to this address.
                </p>

                <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-white/55">
                  Subject
                </label>
                <input
                  ref={firstFieldRef}
                  value={subject}
                  maxLength={SUBJECT_MAX}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="What can we help with?"
                  className={inputCls}
                />

                <label className="mb-1 mt-4 block text-[12px] font-semibold uppercase tracking-wide text-white/55">
                  Message
                </label>
                <textarea
                  value={message}
                  maxLength={MESSAGE_MAX}
                  rows={6}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us what’s going on…"
                  className={`${inputCls} resize-y`}
                />
                <div className="mt-1 text-right text-[11px] text-white/35 tabular-nums">
                  {message.length}/{MESSAGE_MAX}
                </div>

                {error && (
                  <p className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-red-200">
                    {error}
                  </p>
                )}

                <div className="mt-4 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg px-4 py-2 text-[14px] font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!canSubmit}
                    className="rounded-lg bg-coral px-5 py-2 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

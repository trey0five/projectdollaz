// ─────────────────────────────────────────────────────────────────────────────
// NewAdminModal — the super-admin's "New admin" flow. Two segmented modes:
//   • Promote existing — email only → POST /admin/admins { email } (sets isAdmin).
//     A 422 { code:'USER_NOT_FOUND' } means there's no account for that email, so
//     we auto-switch to Create (email prefilled) and nudge the user.
//   • Create new — email + password (+ optional first/last) → creates a verified
//     admin. The body OMITS absent optionals entirely (never password:'' /
//     firstName:undefined) so the forbidNonWhitelisted pipe never 400s.
// Client password strength mirrors the register rules. White admin surface,
// Esc / backdrop / focus-trap, reduced motion.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { UserPlus, X } from 'lucide-react'
import { adminApi, apiErrorMessage, apiErrorCode } from '../../lib/api.js'
import PasswordRequirements, { allRequirementsMet } from '../auth/PasswordRequirements.jsx'

export default function NewAdminModal({ open, onClose, onCreated }) {
  const reduce = useReducedMotion()
  const dialogRef = useRef(null)
  const firstRef = useRef(null)

  const [mode, setMode] = useState('promote') // 'promote' | 'create'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (open) {
      setMode('promote')
      setEmail('')
      setPassword('')
      setFirstName('')
      setLastName('')
      setError('')
      setNotice('')
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

  const emailOk = /\S+@\S+\.\S+/.test(email.trim())
  const pwOk = allRequirementsMet(password)
  const canSubmit =
    !busy && emailOk && (mode === 'promote' || pwOk)

  const submit = async () => {
    if (!canSubmit) return
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const normEmail = email.trim().toLowerCase()
      // Build the body conditionally — omit every absent optional (never send
      // password:'' or firstName:undefined) to satisfy forbidNonWhitelisted.
      const body =
        mode === 'promote'
          ? { email: normEmail }
          : {
              email: normEmail,
              password,
              ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
              ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
            }
      const res = await adminApi.createAdmin(body)
      onCreated?.(res.data)
      onClose()
    } catch (err) {
      // Promote against a non-existent account → pivot to Create, prefilled.
      if (mode === 'promote' && err?.response?.status === 422 && apiErrorCode(err) === 'USER_NOT_FOUND') {
        setMode('create')
        setNotice('No account exists for that email yet — set a password to create a new admin.')
      } else {
        setError(apiErrorMessage(err, 'Could not add the admin.'))
      }
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-navy'

  const segBtn = (m, label) => (
    <button
      type="button"
      onClick={() => {
        setMode(m)
        setError('')
        setNotice('')
      }}
      className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
        mode === m ? 'bg-navy text-white' : 'text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )

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
            aria-label="New admin"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral/15 text-coral">
                  <UserPlus size={16} />
                </span>
                <h2 className="font-serif text-[18px] text-ink">New admin</h2>
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
              <div className="mb-4 flex gap-1 rounded-xl border border-border bg-section p-1">
                {segBtn('promote', 'Promote existing')}
                {segBtn('create', 'Create new')}
              </div>

              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Email
              </label>
              <input
                ref={firstRef}
                type="email"
                value={email}
                maxLength={320}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@school.org"
                className={inputCls}
              />

              {mode === 'create' && (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                        First name
                      </label>
                      <input
                        value={firstName}
                        maxLength={100}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Optional"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                        Last name
                      </label>
                      <input
                        value={lastName}
                        maxLength={100}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Optional"
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <label className="mb-1 mt-4 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    maxLength={128}
                    autoComplete="new-password"
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Set a strong password"
                    className={inputCls}
                  />
                  <PasswordRequirements password={password} />
                </>
              )}

              {notice && (
                <p className="mt-3 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-[13px] text-amber-700">
                  {notice}
                </p>
              )}
              {error && (
                <p className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">
                  {error}
                </p>
              )}

              <div className="mt-5 flex items-center justify-end gap-3">
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
                  className="rounded-lg bg-coral px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? 'Saving…' : mode === 'promote' ? 'Grant admin' : 'Create admin'}
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

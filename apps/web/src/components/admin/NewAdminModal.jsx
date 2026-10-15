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
import Button from '../ui/surface/Button.jsx'
import '../../styles/pending/c1-flows.css'

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

  const segBtn = (m, label) => (
    <button
      type="button"
      aria-pressed={mode === m}
      onClick={() => {
        setMode(m)
        setError('')
        setNotice('')
      }}
      className="seg-btn flex-1 justify-center"
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
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <div className="dlg-scrim" aria-hidden="true" />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="New admin"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="dlg w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="dlg-rule" aria-hidden="true" />
            <div className="dlg-head items-center">
              <UserPlus size={18} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-ink2" />
              <h2 className="dlg-title min-w-0 flex-1">New admin</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="dlg-x">
                <X size={16} />
              </button>
            </div>

            <div className="dlg-body">
              <div className="seg mb-4 flex w-full" role="group" aria-label="New admin mode">
                {segBtn('promote', 'Promote existing')}
                {segBtn('create', 'Create new')}
              </div>

              <label htmlFor="new-admin-email" className="fld-label block">
                Email
              </label>
              <input
                id="new-admin-email"
                ref={firstRef}
                type="email"
                value={email}
                maxLength={320}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@school.org"
                className="field-plain"
              />

              {mode === 'create' && (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="new-admin-first" className="fld-label block">
                        First name
                      </label>
                      <input
                        id="new-admin-first"
                        value={firstName}
                        maxLength={100}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Optional"
                        className="field-plain"
                      />
                    </div>
                    <div>
                      <label htmlFor="new-admin-last" className="fld-label block">
                        Last name
                      </label>
                      <input
                        id="new-admin-last"
                        value={lastName}
                        maxLength={100}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Optional"
                        className="field-plain"
                      />
                    </div>
                  </div>
                  <label htmlFor="new-admin-password" className="fld-label mt-4 block">
                    Password
                  </label>
                  <input
                    id="new-admin-password"
                    type="password"
                    value={password}
                    maxLength={128}
                    autoComplete="new-password"
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Set a strong password"
                    className="field-plain"
                  />
                  <PasswordRequirements password={password} />
                </>
              )}

              {notice && <p className="mt-3 border-l-2 border-watch bg-watch/[0.04] px-3 py-2 text-[13px] text-ink">{notice}</p>}
              {error && (
                <p className="dlg-error mt-3" role="alert">
                  {error}
                </p>
              )}
            </div>
            <div className="dlg-foot">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submit} disabled={!canSubmit}>
                {busy ? 'Saving…' : mode === 'promote' ? 'Grant admin' : 'Create admin'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

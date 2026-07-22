// ─────────────────────────────────────────────────────────────────────────────
// MfaNudge — a dismissible "Secure your account" band on the authed home for
// users who haven't turned on two-factor yet. Sits under BillingBanner, OUTSIDE
// the uiV2 branch (account chrome, not theme — same rationale as BillingBanner).
//
// Dismissal lives in localStorage under `kyro_mfa_nudge`:
//   • 'never'        — the ✕: don't show again on this browser
//   • '<timestamp>'  — "Later": snooze for 7 days from that moment
// Read lazily in a useState initializer (no effect / no flash). Renders null
// unless the user is loaded AND mfa_enabled is EXPLICITLY false — an older API
// payload without the field keeps the band hidden (fail quiet, never nag).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'

const KEY = 'kyro_mfa_nudge'
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

function readSuppressed() {
  try {
    const v = localStorage.getItem(KEY)
    if (!v) return false
    if (v === 'never') return true
    const ts = Number(v)
    return Number.isFinite(ts) && Date.now() - ts < SNOOZE_MS
  } catch {
    return false
  }
}

export default function MfaNudge() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [suppressed, setSuppressed] = useState(readSuppressed)

  if (suppressed || !user || user.mfa_enabled !== false) return null

  const dismiss = (value) => {
    try {
      localStorage.setItem(KEY, value)
    } catch {
      /* private mode — session-only dismiss still works via state */
    }
    setSuppressed(true)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="no-print border-b border-gold/30 bg-gold/10"
    >
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <div className="flex items-start gap-2 text-[15px] font-medium text-navy sm:items-center">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-gold sm:mt-0" />
          <span>Protect your account — add two-factor authentication.</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/settings/account')}
            className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-gold/50 px-3 py-1.5 text-[14px] font-semibold uppercase tracking-wide text-navy transition-colors hover:bg-gold/20"
          >
            Set it up
          </button>
          <button
            type="button"
            onClick={() => dismiss(String(Date.now()))}
            className="rounded-lg px-2.5 py-1.5 text-[14px] font-semibold text-muted transition-colors hover:bg-navy/[0.05] hover:text-navy"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => dismiss('never')}
            aria-label="Don't show this again"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-navy/[0.05] hover:text-navy"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

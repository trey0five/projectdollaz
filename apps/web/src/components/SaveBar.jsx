// Save control (Phase 1C). The live preview is the fast path; this persists the
// uploaded imports + requests the canonical server snapshot so the work survives
// a refresh. Hidden for viewers (server enforces 403 regardless).
import { Save, Check, Loader2, AlertTriangle, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useApp } from '../context/AppContext.jsx'

export default function SaveBar() {
  const { canEdit, canGenerate, dirty, save, saveState } = useApp()
  const reduce = useReducedMotion()
  if (!canEdit) return null

  const busy = saveState === 'saving'
  const saved = saveState === 'saved' && !dirty
  const failed = saveState === 'error'
  const blocked = saveState === 'blocked'

  if (saved) {
    return (
      <span className="inline-flex min-h-[44px] w-full shrink-0 items-center sm:h-[52px] justify-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-2 text-[15px] font-semibold uppercase tracking-[0.12em] text-emerald-700 sm:w-[120px]">
        <Check size={14} /> Saved
      </span>
    )
  }

  // Entitlement gate (402): friendly "subscribe to generate" state, not an error.
  if (blocked) {
    return (
      <Link
        to="/settings/billing"
        className="inline-flex min-h-[44px] w-full shrink-0 items-center sm:h-[52px] justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-[14px] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-red-700 sm:min-w-[120px]"
      >
        <Lock size={14} /> Subscribe to generate
      </Link>
    )
  }

  // Unsaved work the user can persist → nudge them to press Save with a gold
  // "radar-ping" glow + gentle breath so it's obvious the click is required.
  const shouldPulse = canGenerate && dirty && !busy && !reduce

  return (
    <motion.button
      type="button"
      onClick={save}
      disabled={busy || !canGenerate || !dirty}
      animate={
        shouldPulse
          ? {
              boxShadow: [
                '0 0 0 0 rgba(201,162,39,0.55)',
                '0 0 0 10px rgba(201,162,39,0)',
              ],
              scale: [1, 1.035, 1],
            }
          : { boxShadow: '0 0 0 0 rgba(201,162,39,0)', scale: 1 }
      }
      transition={
        shouldPulse
          ? { duration: 1.5, repeat: Infinity, ease: 'easeOut' }
          : { duration: 0.2 }
      }
      className={`inline-flex min-h-[44px] w-full shrink-0 items-center sm:h-[52px] justify-center gap-1.5 rounded-xl px-4 py-2 text-[15px] font-semibold uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed sm:w-[120px] ${
        canGenerate && dirty && !busy
          ? 'bg-gold-gradient text-white hover:opacity-90'
          : 'border-2 border-border text-muted'
      }`}
    >
      {busy ? (
        <>
          <Loader2 size={15} className="animate-spin" /> Saving…
        </>
      ) : failed ? (
        <>
          <AlertTriangle size={15} /> Retry save
        </>
      ) : (
        <>
          <Save size={15} /> Save
        </>
      )}
    </motion.button>
  )
}

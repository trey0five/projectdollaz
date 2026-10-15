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
      <span className="inline-flex min-h-[44px] w-full shrink-0 items-center sm:h-[52px] justify-center gap-1.5 rounded-[8px] bg-white px-4 py-2 text-[15px] font-semibold uppercase tracking-[0.12em] text-ink sm:w-[120px]">
        <Check size={14} /> Saved
      </span>
    )
  }

  // Entitlement gate (402): friendly "subscribe to generate" state, not an error.
  if (blocked) {
    return (
      <Link
        to="/settings/billing"
        className="btn btn-primary w-full shrink-0 sm:w-auto"
      >
        <Lock size={14} /> Subscribe to generate
      </Link>
    )
  }

  // Unsaved work the user can persist → the Save button turns primary (a flat
  // fill is the cue; the old infinite gold "radar-ping" is gone — motion is
  // one-shot). A single 2px primary ring blooms once when it becomes savable.
  const savable = canGenerate && dirty && !busy

  return (
    <motion.button
      type="button"
      onClick={save}
      disabled={busy || !canGenerate || !dirty}
      initial={false}
      animate={
        savable && !reduce
          ? { boxShadow: ['0 0 0 0 rgba(37,99,235,0.45)', '0 0 0 8px rgba(37,99,235,0)'] }
          : { boxShadow: '0 0 0 0 rgba(37,99,235,0)' }
      }
      transition={{ duration: 0.9, ease: 'easeOut' }}
      className={`btn w-full shrink-0 sm:w-auto ${savable ? 'btn-primary' : 'btn-secondary'}`}
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

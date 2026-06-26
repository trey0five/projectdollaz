// Save control (Phase 1C). The live preview is the fast path; this persists the
// uploaded imports + requests the canonical server snapshot so the work survives
// a refresh. Hidden for viewers (server enforces 403 regardless).
import { Save, Check, Loader2, AlertTriangle, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'

export default function SaveBar() {
  const { canEdit, canGenerate, dirty, save, saveState } = useApp()
  if (!canEdit) return null

  const busy = saveState === 'saving'
  const saved = saveState === 'saved' && !dirty
  const failed = saveState === 'error'
  const blocked = saveState === 'blocked'

  if (saved) {
    return (
      <span className="inline-flex min-h-[44px] w-full shrink-0 items-center sm:h-[52px] justify-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-emerald-700 sm:w-[120px]">
        <Check size={14} /> Saved
      </span>
    )
  }

  // Entitlement gate (402): friendly "subscribe to generate" state, not an error.
  if (blocked) {
    return (
      <Link
        to="/settings/billing"
        className="inline-flex min-h-[44px] w-full shrink-0 items-center sm:h-[52px] justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-red-700 sm:min-w-[120px]"
      >
        <Lock size={14} /> Subscribe to generate
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={save}
      disabled={busy || !canGenerate || !dirty}
      className={`inline-flex min-h-[44px] w-full shrink-0 items-center sm:h-[52px] justify-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed sm:w-[120px] ${
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
    </button>
  )
}

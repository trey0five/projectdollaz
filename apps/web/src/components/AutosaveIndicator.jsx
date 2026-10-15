// Shared autosave UI. Replaces a manual "Save" button on draft-of-an-existing-
// record forms: a live status line (saving / saved / unsaved / error) plus an
// optional "Save now" link. Pair with the useAutosave hook. Ledger tokens (ink text, a watch dot while unsaved).
import { Check, Loader2, AlertCircle } from 'lucide-react'

export default function AutosaveIndicator({ saving, dirty, error }) {
  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[14px] font-medium tone-risk">
        <AlertCircle size={14} /> Couldn’t save — will retry on your next edit
      </span>
    )
  }
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ink">
        <Loader2 size={14} className="animate-spin text-ink2" /> Saving…
      </span>
    )
  }
  if (dirty) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ink2">
        <span className="h-2 w-2 rounded-full bg-watch" aria-hidden="true" /> Unsaved changes — autosaving…
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ink2">
      <Check size={14} className="text-ink" /> All changes saved
    </span>
  )
}

// Indicator + a "Save now" affordance (shown only when there's something to flush).
export function AutosaveBar({ saving, dirty, error, onSaveNow, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <AutosaveIndicator saving={saving} dirty={dirty} error={error} />
      {dirty && !saving && (
        <button
          type="button"
          onClick={onSaveNow}
          className="text-[14px] font-semibold uppercase tracking-[0.06em] text-ink2 transition-colors hover:text-ink2"
        >
          Save now
        </button>
      )}
    </div>
  )
}

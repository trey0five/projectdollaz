// Shared autosave UI. Replaces a manual "Save" button on draft-of-an-existing-
// record forms: a live status line (saving / saved / unsaved / error) plus an
// optional "Save now" link. Pair with the useAutosave hook. On-theme navy/gold.
import { Check, Loader2, AlertCircle } from 'lucide-react'

export default function AutosaveIndicator({ saving, dirty, error }) {
  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-danger">
        <AlertCircle size={14} /> Couldn’t save — will retry on your next edit
      </span>
    )
  }
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-navy">
        <Loader2 size={14} className="animate-spin text-gold" /> Saving…
      </span>
    )
  }
  if (dirty) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-gold" /> Unsaved changes — autosaving…
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-muted">
      <Check size={14} className="text-[#7a5e00]" /> All changes saved
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
          className="text-[14px] font-semibold uppercase tracking-[0.06em] text-gold transition-colors hover:text-gold-light"
        >
          Save now
        </button>
      )}
    </div>
  )
}

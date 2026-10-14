import { Check, Loader2, RotateCcw, SlidersHorizontal, X, AlertTriangle } from 'lucide-react'
import { Panel, Button } from '../ui/surface/index.js'

/**
 * Sticky customize-mode action bar (mirrors SaveBar vocabulary). Save / Cancel /
 * Reset-to-default with a dirty indicator. Owner-only — the parent only renders
 * this when in customize mode. Save is disabled when not dirty or while saving.
 * Premium UI P3: a `Panel` (the one raised surface — this is a form you act on)
 * with flat `Button`s; no glass, no gold, no pulse loop.
 */
export default function CustomizeBar({ dirty, saving, error, onSave, onCancel, onReset }) {
  return (
    <Panel className="sticky top-2 z-30 mb-4" padded={false}>
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex text-ink2" aria-hidden="true">
            <SlidersHorizontal size={16} />
          </span>
          <div>
            <p className="text-body font-semibold text-ink">Customizing dashboard</p>
            <p className="text-small text-ink2">
              {dirty ? 'You have unsaved changes.' : 'Show, hide, reorder, and resize your metrics.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {error && (
            <span className="inline-flex items-center gap-1 text-small font-semibold tone-risk">
              <AlertTriangle size={12} /> {error}
            </span>
          )}
          <Button variant="quiet" onClick={onReset} disabled={saving} icon={<RotateCcw size={14} />}>
            Reset to default
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={saving} icon={<X size={14} />}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onSave}
            disabled={saving || !dirty}
            icon={saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          >
            {saving ? 'Saving…' : 'Save layout'}
          </Button>
        </div>
      </div>
    </Panel>
  )
}

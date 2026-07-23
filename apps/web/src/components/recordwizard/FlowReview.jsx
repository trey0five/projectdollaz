// ─────────────────────────────────────────────────────────────────────────────
// FlowReview — the framework-appended last step: every queued item as a stacked
// card (headline + the flow's reviewPairs grid + a status cell) so the user can
// look the whole batch over before "Save all". During/after submit the cards
// double as the progress board: saved rows lock with a ✓ (never re-posted —
// the engine skips 'done'), failed rows surface the server's apiErrorMessage
// with row-level Retry / Edit / Remove. Batch-level Retry/Finish live in the
// RecordFlow footer, outside the animated panel.
// ─────────────────────────────────────────────────────────────────────────────
import { Check, Loader2, AlertCircle, Pencil, X, RefreshCw } from 'lucide-react'
import { apiErrorMessage } from '../../lib/api.js'
import { hueRgba } from '../wizard/wizardConfigs.jsx'
import { flowCount } from './flowRuntime.js'

function StatusPill({ status, hue }) {
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide" style={{ color: hue }}>
        <Loader2 size={13} className="animate-spin" /> Saving…
      </span>
    )
  }
  if (status === 'done') {
    return (
      <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-emerald-600">
        <Check size={13} strokeWidth={3} /> Saved
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-danger">
        <AlertCircle size={13} /> Didn’t save
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-muted">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: hue }} aria-hidden /> Ready
    </span>
  )
}

export default function FlowReview({
  basket,
  flow,
  data,
  hue,
  headingRef,
  submitting,
  onEditItem,
  onRemoveItem,
  onRetryItem,
}) {
  const labelOf = (item) => flow.itemLabel(item.values) || `Untitled ${flow.noun}`

  return (
    <div>
      <h4
        ref={headingRef}
        data-rf-heading
        tabIndex={-1}
        className="font-serif text-[17px] font-semibold text-navy outline-none"
      >
        Look these over, then save them all
      </h4>
      <p className="mt-0.5 text-[13.5px] leading-snug text-muted">
        {flowCount(basket.length, flow.noun, flow.nounPlural)} ready — edit anything that looks off,
        then one click saves the lot.
      </p>

      <ul className="mt-4 space-y-3">
        {basket.map((item) => {
          const locked = item.status === 'done' || item.status === 'saving' || submitting
          return (
            <li
              key={item.id}
              className="rounded-xl border bg-white p-4"
              style={{
                borderColor:
                  item.status === 'error' ? 'rgb(var(--c-danger) / 0.45)' : hueRgba(hue, 0.25),
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-navy">{labelOf(item)}</p>
                  {flow.itemSub && (
                    <p className="truncate text-[12.5px] text-muted">
                      {flow.itemSub(item.values, data)}
                    </p>
                  )}
                </div>
                <StatusPill status={item.status} hue={hue} />
              </div>

              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-rule/50 pt-3 sm:grid-cols-2">
                {flow.reviewPairs(item.values, data).map(([label, display]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                      {label}
                    </dt>
                    <dd className="truncate text-right text-[13.5px] text-ink/85">{display}</dd>
                  </div>
                ))}
              </dl>

              {item.status === 'error' && (
                <p className="mt-2.5 rounded-lg bg-danger/[0.06] px-3 py-2 text-[13px] font-medium text-danger">
                  {apiErrorMessage(item.error)}
                </p>
              )}

              {!locked && (
                <div className="mt-2.5 flex items-center justify-end gap-1">
                  {item.status === 'error' && (
                    <button
                      type="button"
                      onClick={() => onRetryItem(item.id)}
                      className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold outline-none transition-colors focus-visible:ring-2"
                      style={{ color: hue, '--tw-ring-color': hueRgba(hue, 0.5) }}
                    >
                      <RefreshCw size={13} /> Retry
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onEditItem(item.id)}
                    className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted outline-none transition-colors hover:text-navy focus-visible:ring-2"
                    style={{ '--tw-ring-color': hueRgba(hue, 0.5) }}
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted outline-none transition-colors hover:text-danger focus-visible:ring-2"
                    style={{ '--tw-ring-color': hueRgba(hue, 0.5) }}
                  >
                    <X size={14} /> Remove
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

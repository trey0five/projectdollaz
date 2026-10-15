// ─────────────────────────────────────────────────────────────────────────────
// FlowReview — the framework-appended last step: every queued item as a RULED
// ROW (headline + the flow's reviewPairs as a two-column definition list + a
// status cell) so the user can look the whole batch over before "Save all".
// During/after submit the rows double as the progress board: saved rows lock
// with a ✓ (never re-posted — the engine skips 'done'), failed rows surface the
// server's apiErrorMessage with row-level Retry / Edit / Remove. Batch-level
// Retry/Finish live in the RecordFlow footer, outside the animated body.
//
// Premium UI P4: no stacked cards — rows on the panel divided by hairlines,
// status as a 2px mark + ink text (statusStyle grammar), values tabular.
// ─────────────────────────────────────────────────────────────────────────────
import { Loader2, Pencil, X, RefreshCw } from 'lucide-react'
import { apiErrorMessage } from '../../lib/api.js'
import Button from '../ui/surface/Button.jsx'
import { flowCount } from './flowRuntime.js'
import '../../styles/pending/c1-flows.css'

const STATUS = {
  saving: { tone: 'neutral', label: 'Saving…' },
  done: { tone: 'good', label: 'Saved' },
  error: { tone: 'risk', label: 'Didn’t save' },
  ready: { tone: 'neutral', label: 'Ready' },
}

function StatusMark({ status }) {
  const s = STATUS[status] ?? STATUS.ready
  return (
    <span className={`pill pill-status tone-${s.tone}`}>
      {status === 'saving' ? (
        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
      ) : (
        <i className="pill-mark" aria-hidden="true" />
      )}
      {s.label}
    </span>
  )
}

export default function FlowReview({
  basket,
  flow,
  data,
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
        className="font-serif text-heading font-medium text-ink outline-none"
      >
        Look these over, then save them all
      </h4>
      <p className="mt-0.5 text-[13px] leading-[18px] text-ink2">
        {flowCount(basket.length, flow.noun, flow.nounPlural)} ready — edit anything that looks off,
        then one click saves the lot.
      </p>

      <ul className="ruled mt-4 border-y border-hair">
        {basket.map((item) => {
          const locked = item.status === 'done' || item.status === 'saving' || submitting
          return (
            <li key={item.id} className="py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                <div className="min-w-0">
                  <p className="break-words text-[15px] font-semibold leading-[22px] text-ink">{labelOf(item)}</p>
                  {flow.itemSub && (
                    <p className="break-words text-[12.5px] leading-[18px] text-ink2">
                      {flow.itemSub(item.values, data)}
                    </p>
                  )}
                </div>
                <StatusMark status={item.status} />
              </div>

              <dl className="mt-2.5 grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
                {flow.reviewPairs(item.values, data).map(([label, display]) => (
                  <div key={label} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-hair/[0.06] py-0.5">
                    <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
                      {label}
                    </dt>
                    <dd className="min-w-0 break-words text-right text-[13.5px] tabular-nums text-ink">{display}</dd>
                  </div>
                ))}
              </dl>

              {item.status === 'error' && (
                <p className="dlg-error mt-2.5">{apiErrorMessage(item.error)}</p>
              )}

              {!locked && (
                <div className="mt-2 flex items-center justify-end gap-1">
                  {item.status === 'error' && (
                    <Button variant="quiet" size="sm" onClick={() => onRetryItem(item.id)} icon={<RefreshCw size={13} />}>
                      Retry
                    </Button>
                  )}
                  <Button variant="quiet" size="sm" onClick={() => onEditItem(item.id)} icon={<Pencil size={13} />}>
                    Edit
                  </Button>
                  <Button variant="quiet" size="sm" onClick={() => onRemoveItem(item.id)} icon={<X size={14} />}>
                    Remove
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

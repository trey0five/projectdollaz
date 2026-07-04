// StudioActivity — "What Penny did lately". A compact, transparent log of the
// changes Penny made in this school (GET /assistant/activity), each safely-
// reversible + not-yet-undone entry carrying a small inline Undo. Owner/accountant
// only (canEdit) — the route is owner/accountant gated too, so a viewer never sees
// it. Refetches on mount, after an undo, and whenever a Penny action broadcasts
// 'penny:data-changed' (so a just-applied change shows up without a reload).
import { useCallback, useEffect, useRef, useState } from 'react'
import { History, RotateCcw, Undo2, CheckCircle2 } from 'lucide-react'
import { assistantApi, apiErrorMessage } from '../../../lib/api.js'
import { usePenny } from '../../../context/PennyContext.jsx'

// tool kind → a short human label for the log row.
const TOOL_LABELS = {
  create_policy: 'Policy',
  create_committee: 'Committee',
  create_meeting: 'Meeting',
  create_standard: 'Standard',
  create_maintenance_item: 'Maintenance item',
  create_campaign: 'Campaign',
  create_task: 'Task',
  file_document: 'Document',
  import_trial_balance: 'Trial balance',
  import_monthly_actuals: 'Monthly actuals',
  set_budget: 'Budget',
  apply_driver_budget: 'Budget model',
  apply_forecast: 'Forecast',
  set_feeder_enrollment: 'Feeder enrollment',
  set_explanation: 'Explanation',
  draft_cap_entry: 'Corrective action',
  submit_for_approval: 'Approval request',
  decide_approval: 'Approval decision',
}

// tool → refresh keys to broadcast after an undo (so an open register page refetches).
const UNDO_REFRESH_KEYS = {
  create_policy: ['governance'],
  create_committee: ['governance'],
  create_meeting: ['governance'],
  create_standard: ['accreditation'],
  create_maintenance_item: ['facilities'],
  create_campaign: ['advancement'],
  create_task: ['tasks'],
  file_document: ['knowledge', 'facilities'],
  import_trial_balance: ['dataStatus', 'metrics'],
}

function relTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day = Math.round(hr / 24)
  if (day === 1) return 'yesterday'
  if (day < 7) return `${day} days ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function StudioActivity({ schoolId, canEdit }) {
  const penny = usePenny()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // auditId → 'undoing' | 'error' while an undo is in flight/failed (server truth
  // otherwise; on success we refetch so the row shows its `undone` flag).
  const [undoState, setUndoState] = useState({})
  const activeRef = useRef(schoolId)
  activeRef.current = schoolId

  const load = useCallback(async () => {
    if (!schoolId || !canEdit) return
    try {
      const res = await assistantApi.getActivity(schoolId)
      if (activeRef.current !== schoolId) return
      setItems(Array.isArray(res?.data) ? res.data : [])
      setError(null)
    } catch (e) {
      if (activeRef.current !== schoolId) return
      setError(apiErrorMessage(e, 'Couldn’t load Penny’s activity.'))
    } finally {
      if (activeRef.current === schoolId) setLoading(false)
    }
  }, [schoolId, canEdit])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Refetch when any Penny action broadcasts a data change (debounced), so a
  // just-applied change appears here without a manual reload.
  useEffect(() => {
    if (!schoolId || !canEdit) return undefined
    let t = null
    const onChange = () => {
      window.clearTimeout(t)
      t = window.setTimeout(load, 300)
    }
    window.addEventListener('penny:data-changed', onChange)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('penny:data-changed', onChange)
    }
  }, [schoolId, canEdit, load])

  const onUndo = useCallback(
    async (entry) => {
      if (!entry?.id || undoState[entry.id] === 'undoing') return
      setUndoState((s) => ({ ...s, [entry.id]: 'undoing' }))
      try {
        await assistantApi.undoActivity(schoolId, entry.id)
        penny?.agentRefresh?.(UNDO_REFRESH_KEYS[entry.tool] || [])
        setUndoState((s) => {
          const next = { ...s }
          delete next[entry.id]
          return next
        })
        await load()
      } catch {
        setUndoState((s) => ({ ...s, [entry.id]: 'error' }))
      }
    },
    [schoolId, undoState, penny, load],
  )

  if (!canEdit) return null

  return (
    <aside className="rounded-2xl border border-rule/60 bg-white p-4 shadow-card">
      <h2 className="mb-3 flex items-center gap-2 px-0.5 font-serif text-[16px] font-semibold text-navy">
        <span className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-gold-gradient text-navy">
          <History size={14} aria-hidden />
        </span>
        What Penny did lately
      </h2>

      {loading ? (
        <p className="px-0.5 text-[13px] text-muted">Loading…</p>
      ) : error ? (
        <p className="px-0.5 text-[13px] text-danger">{error}</p>
      ) : items.length === 0 ? (
        <p className="px-0.5 text-[13px] text-muted">Penny hasn’t made any changes yet.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => {
            const label = TOOL_LABELS[it.tool] || 'Change'
            const st = undoState[it.id]
            const showUndo = it.reversible && !it.undone
            return (
              <li
                key={it.id}
                className="flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-section"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="rounded-md bg-navy/[0.06] px-1.5 py-px text-[11px] font-bold uppercase tracking-[0.06em] text-navy/70">
                      {label}
                    </span>
                    {it.undone && (
                      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-700">
                        <CheckCircle2 size={11} aria-hidden /> Undone
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[13.5px] leading-tight text-ink">
                    {it.summary || label}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted">{relTime(it.createdAt)}</span>
                </span>

                {showUndo &&
                  (st === 'undoing' ? (
                    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[12.5px] text-muted">
                      <RotateCcw size={12} aria-hidden className="motion-safe:animate-spin" />
                      Undoing…
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onUndo(it)}
                      className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-lg border border-navy/15 bg-white px-2 py-1 text-[12.5px] font-semibold text-navy/80 transition-colors hover:border-navy/30 hover:text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                    >
                      <Undo2 size={12} aria-hidden />
                      {st === 'error' ? 'Retry' : 'Undo'}
                    </button>
                  ))}
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

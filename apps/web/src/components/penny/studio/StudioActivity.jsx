// StudioActivity — "What Penny did lately". A compact, transparent log of the
// changes Penny made in this school (GET /assistant/activity), each safely-
// reversible + not-yet-undone entry carrying a small inline Undo. Owner/accountant
// only (canEdit) — the route is owner/accountant gated too, so a viewer never sees
// it. Refetches on mount, after an undo, and whenever a Penny action broadcasts
// 'penny:data-changed' (so a just-applied change shows up without a reload).
import { useCallback, useEffect, useRef, useState } from 'react'
import { History, RotateCcw, Undo2 } from 'lucide-react'
import { Button, Section } from '../../ui/surface/index.js'
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
  create_cash_commitment: ['cashflow'],
  save_cash_line_adjustment: ['cashflow'],
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
      setError(apiErrorMessage(e, 'Couldn’t load KYRO’s activity.'))
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

  // Premium UI P4: a Section on the ground with ruled rows — no card shell.
  return (
    <Section
      label="What KYRO did lately"
      aside={<History size={14} aria-hidden className="text-penny" />}
    >
      {loading ? (
        <p className="text-[13px] text-ink2">Loading…</p>
      ) : error ? (
        <p className="border-l-2 border-risk pl-2.5 text-[13px] text-ink">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-ink2">KYRO hasn’t made any changes yet.</p>
      ) : (
        <ul className="ruled border-b border-hair">
          {items.map((it) => {
            const label = TOOL_LABELS[it.tool] || 'Change'
            const st = undoState[it.id]
            const showUndo = it.reversible && !it.undone
            return (
              <li key={it.id} className="flex items-start gap-2.5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="pill">{label}</span>
                    {it.undone && (
                      <span className="pill pill-status tone-good">
                        <i className="pill-mark" aria-hidden="true" />
                        Undone
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block truncate text-[13.5px] leading-tight text-ink">
                    {it.summary || label}
                  </span>
                  <span className="mt-0.5 block text-[12px] tabular-nums text-ink2">{relTime(it.createdAt)}</span>
                </span>

                {showUndo &&
                  (st === 'undoing' ? (
                    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[12.5px] text-ink2">
                      <RotateCcw size={12} aria-hidden className="motion-safe:animate-spin" />
                      Undoing…
                    </span>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => onUndo(it)} icon={<Undo2 size={12} />}>
                      {st === 'error' ? 'Retry' : 'Undo'}
                    </Button>
                  ))}
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

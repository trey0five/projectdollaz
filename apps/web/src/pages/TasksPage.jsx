// ─────────────────────────────────────────────────────────────────────────────
// Tasks route (Phase 3 Workflow v1): AppShell chrome + the TASK list panel. School-scoped
// (no period selector). CORE — always available (no module gate); only the base
// entitlement can pause it (notEntitled). Navy/gold theme, reduced-motion safe,
// no setState-in-effect.
//
// A briefing/governance item can hand this page a `prefill` (via navigation state)
// to open the create modal pre-seeded with a source link (sourceType/sourceRef) —
// the "actionable pairing" that turns an attention item into a task.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ListChecks,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Link2,
  ShieldCheck,
  Repeat,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useTasks } from '../hooks/useTasks.js'

const STATUSES = ['open', 'in_progress', 'done', 'cancelled']
const PRIORITIES = ['low', 'normal', 'high']
const RECURRENCES = ['none', 'weekly', 'monthly', 'quarterly', 'annual']

const URGENCY_BADGE = {
  overdue: { label: 'Overdue', cls: 'border-red-400/50 bg-red-500/15 text-red-200' },
  'due-soon': { label: 'Due soon', cls: 'border-amber-400/50 bg-amber-500/15 text-amber-200' },
  'on-track': { label: 'On track', cls: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' },
  none: { label: 'No due date', cls: 'border-white/20 bg-white/5 text-white/50' },
}

function UrgencyBadge({ urgency, dueDate, daysUntilDue }) {
  const b = URGENCY_BADGE[urgency] ?? URGENCY_BADGE.none
  let suffix = ''
  if (urgency === 'due-soon' && typeof daysUntilDue === 'number')
    suffix = daysUntilDue === 0 ? ' · today' : ` · in ${daysUntilDue}d`
  else if (urgency === 'overdue' && typeof daysUntilDue === 'number')
    suffix = ` · ${Math.abs(daysUntilDue)}d ago`
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${b.cls}`}
      title={dueDate ? `Due: ${dueDate}` : 'No due date'}
    >
      {b.label}
      {suffix}
    </span>
  )
}

function memberName(m) {
  const full = [m.first_name, m.last_name].filter(Boolean).join(' ').trim()
  return full || m.email
}

function assigneeName(a) {
  if (!a) return 'Unassigned'
  const full = [a.firstName, a.lastName].filter(Boolean).join(' ').trim()
  return full || a.email
}

// Approval / sign-off status pill (mirrors the URGENCY_BADGE styling vocab). 'none'
// renders nothing.
const APPROVAL_BADGE = {
  pending: { label: 'Awaiting sign-off', cls: 'border-amber-400/50 bg-amber-500/15 text-amber-200' },
  approved: { label: 'Approved', cls: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' },
  rejected: {
    label: 'Changes requested',
    cls: 'border-red-400/50 bg-red-500/15 text-red-200',
  },
}

const EMPTY_FORM = {
  title: '',
  description: '',
  assigneeUserId: '',
  dueDate: '',
  priority: 'normal',
  status: 'open',
  sourceType: 'manual',
  sourceRef: '',
  recurrence: 'none',
  recurrenceUntil: '',
}

/** Build the request body: send null to CLEAR optional fields. */
function toBody(form) {
  const recurrence = form.recurrence || 'none'
  return {
    title: form.title.trim(),
    description: form.description.trim() ? form.description.trim() : null,
    assigneeUserId: form.assigneeUserId ? form.assigneeUserId : null,
    dueDate: form.dueDate ? form.dueDate : null,
    priority: form.priority,
    status: form.status,
    sourceType: form.sourceType || 'manual',
    sourceRef: form.sourceRef ? form.sourceRef : null,
    recurrence,
    // recurrenceUntil is meaningful only on a recurring task; clear it otherwise.
    recurrenceUntil: recurrence !== 'none' && form.recurrenceUntil ? form.recurrenceUntil : null,
  }
}

function TaskFormModal({ open, initial, members, onClose, onSave, reduce }) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) {
      setErr('A title is required.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onSave(toBody(form))
      onClose()
    } catch {
      setErr('Could not save this task.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null
  const linked = form.sourceType && form.sourceType !== 'manual'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg rounded-2xl border-2 border-gold/30 bg-navy-gradient p-6 shadow-navy-glow"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-[18px] uppercase tracking-[0.12em] text-gold-light">
            {initial ? 'Edit task' : 'Add task'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-gold/60 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        {linked ? (
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-gold/40 bg-gold/10 px-2 py-1 text-[12px] font-semibold text-gold-light">
            <Link2 size={13} /> Linked from {form.sourceType}
          </div>
        ) : null}
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 block text-[13px] text-white/70">
              Title
              <input
                value={form.title}
                onChange={set('title')}
                maxLength={200}
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Assignee
              <select
                value={form.assigneeUserId}
                onChange={set('assigneeUserId')}
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {memberName(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[13px] text-white/70">
              Due date
              <input
                type="date"
                value={form.dueDate}
                onChange={set('dueDate')}
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Priority
              <select
                value={form.priority}
                onChange={set('priority')}
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60 capitalize"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[13px] text-white/70">
              Status
              <select
                value={form.status}
                onChange={set('status')}
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[13px] text-white/70">
              Repeats
              <select
                value={form.recurrence}
                onChange={set('recurrence')}
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60 capitalize"
              >
                {RECURRENCES.map((r) => (
                  <option key={r} value={r}>
                    {r === 'none' ? "Doesn't repeat" : r}
                  </option>
                ))}
              </select>
            </label>
            {form.recurrence !== 'none' ? (
              <label className="block text-[13px] text-white/70">
                Repeat until
                <input
                  type="date"
                  value={form.recurrenceUntil}
                  onChange={set('recurrenceUntil')}
                  className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
                />
              </label>
            ) : null}
            {form.recurrence !== 'none' ? (
              <p className="col-span-2 -mt-1 text-[12px] text-gold-light/80">
                <Repeat size={12} className="mr-1 inline" />
                Completing this task will auto-create the next one
                {form.recurrenceUntil ? ` until ${form.recurrenceUntil}` : ''}.
              </p>
            ) : null}
            <label className="col-span-2 block text-[13px] text-white/70">
              Description
              <textarea
                value={form.description}
                onChange={set('description')}
                maxLength={4000}
                rows={2}
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
          </div>
          {err ? <p className="text-[13px] text-red-300">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border-2 border-white/20 px-4 py-2 text-[14px] font-semibold text-white/70 hover:border-white/40 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg border-2 border-gold/60 bg-gold/15 px-4 py-2 text-[14px] font-semibold text-gold-light hover:bg-gold/25 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save task'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

/** Approver-picker modal for "Request sign-off" — builds an ORDERED chain of
 *  approvers (add / remove / reorder). A single-element chain reproduces the legacy
 *  single-approver flow. Reuses the members roster + create-modal styling. Editors
 *  (owner/accountant) only. */
function ApproverPickerModal({ open, task, members, onClose, onSubmit, reduce }) {
  const [chain, setChain] = useState([]) // ordered array of member userIds
  const [pick, setPick] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const nameFor = (id) => {
    const m = members.find((mm) => mm.id === id)
    return m ? memberName(m) : id
  }
  const available = members.filter((m) => !chain.includes(m.id))

  const addApprover = () => {
    if (!pick || chain.includes(pick)) return
    setChain((c) => [...c, pick])
    setPick('')
  }
  const removeAt = (i) => setChain((c) => c.filter((_, idx) => idx !== i))
  const move = (i, dir) =>
    setChain((c) => {
      const j = i + dir
      if (j < 0 || j >= c.length) return c
      const next = [...c]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const submit = async (e) => {
    e.preventDefault()
    if (chain.length === 0) {
      setErr('Add at least one approver.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onSubmit(chain)
      onClose()
    } catch {
      setErr('Could not request sign-off.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border-2 border-gold/30 bg-navy-gradient p-6 shadow-navy-glow"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-[18px] uppercase tracking-[0.12em] text-gold-light">
            Request sign-off
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-gold/60 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-[13px] text-white/60">
          Route <span className="font-semibold text-white/90">{task?.title}</span> through one or
          more approvers, in order. Each signs off in turn.
        </p>
        <form onSubmit={submit} className="space-y-3">
          {chain.length > 0 ? (
            <ol className="space-y-1.5">
              {chain.map((id, i) => (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-lg border-2 border-gold/25 bg-navy/40 px-2.5 py-1.5"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-[12px] font-bold text-gold-light">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-[13px] text-white/90">{nameFor(id)}</span>
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="rounded p-1 text-white/50 hover:text-gold-light disabled:opacity-30"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === chain.length - 1}
                    aria-label="Move down"
                    className="rounded p-1 text-white/50 hover:text-gold-light disabled:opacity-30"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    aria-label="Remove approver"
                    className="rounded p-1 text-white/50 hover:text-red-300"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-lg border-2 border-dashed border-white/15 px-3 py-2 text-[12px] text-white/45">
              No approvers yet — add one below.
            </p>
          )}
          <div className="flex gap-2">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="flex-1 rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-[13px] text-white outline-none focus:border-gold/60"
            >
              <option value="">Add an approver…</option>
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {memberName(m)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addApprover}
              disabled={!pick}
              className="inline-flex items-center gap-1 rounded-lg border-2 border-white/20 px-3 py-2 text-[13px] font-semibold text-white/80 hover:border-gold/60 hover:text-gold-light disabled:opacity-40"
            >
              <Plus size={14} /> Add
            </button>
          </div>
          {err ? <p className="text-[13px] text-red-300">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border-2 border-white/20 px-4 py-2 text-[14px] font-semibold text-white/70 hover:border-white/40 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || chain.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-gold/60 bg-gold/15 px-4 py-2 text-[14px] font-semibold text-gold-light hover:bg-gold/25 disabled:opacity-50"
            >
              <ShieldCheck size={15} /> {saving ? 'Requesting…' : 'Request sign-off'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

/** Inline Approve / Request-changes controls shown ONLY to the row's designated
 *  approver on a pending task (gated on currentUserId === approverUserId, NOT on
 *  canEdit — a viewer-approver must see these). Optional decision note. */
function DecideControls({ task, onDecide }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const act = async (decision) => {
    setBusy(true)
    try {
      await onDecide(task.id, decision, note.trim() || null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 rounded-lg border-2 border-amber-400/30 bg-amber-500/5 p-2">
      <p className="mb-1.5 text-[12px] font-semibold text-amber-200">You are the approver.</p>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={2000}
        placeholder="Add a note (optional)"
        className="mb-2 w-full rounded-md border-2 border-white/20 bg-navy/40 px-2 py-1 text-[13px] text-white outline-none focus:border-gold/60"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => act('approve')}
          className="inline-flex items-center gap-1 rounded-lg border-2 border-emerald-400/50 bg-emerald-500/15 px-3 py-1 text-[13px] font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          <Check size={14} /> Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act('reject')}
          className="inline-flex items-center gap-1 rounded-lg border-2 border-red-400/50 bg-red-500/15 px-3 py-1 text-[13px] font-semibold text-red-200 hover:bg-red-500/25 disabled:opacity-50"
        >
          <X size={14} /> Request changes
        </button>
      </div>
    </div>
  )
}

/** A small navy/gold "↻ cadence" badge shown on recurring task rows. */
function RecurrenceBadge({ recurrence, seriesId }) {
  if (!recurrence || recurrence === 'none') return null
  return (
    <span
      className="mt-1 ml-1 inline-flex items-center gap-1 rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[11px] font-semibold capitalize text-gold-light"
      title={seriesId ? 'Part of a recurring series.' : 'Repeats automatically on completion.'}
    >
      <Repeat size={11} /> {recurrence}
    </span>
  )
}

/** Multi-step chain progress ("Step 2 of 3") + per-step chips. Renders nothing for
 *  a legacy single-approver task (steps null / length <= 1). Resolves each step's
 *  approver name off the roster, falling back to task.approver (the pointer). */
function ChainProgress({ task, members }) {
  const steps = Array.isArray(task.approvalSteps) ? task.approvalSteps : null
  if (!steps || steps.length <= 1) return null
  const nameFor = (id) => {
    const m = members.find((mm) => mm.id === id)
    if (m) return memberName(m)
    if (task.approver && task.approver.id === id) return assigneeName(task.approver)
    return 'Approver'
  }
  const currentIdx = steps.findIndex((s) => s.status === 'pending')
  const chip = {
    approved: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200',
    rejected: 'border-red-400/50 bg-red-500/15 text-red-200',
    pending: 'border-amber-400/50 bg-amber-500/15 text-amber-200',
  }
  return (
    <div className="mt-1.5">
      {currentIdx >= 0 ? (
        <div className="text-[11px] font-semibold text-white/70">
          Step {currentIdx + 1} of {steps.length} — {nameFor(steps[currentIdx].approverUserId)}
        </div>
      ) : (
        <div className="text-[11px] font-semibold text-white/50">
          {steps.length}-step chain complete
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-1">
        {steps.map((s, i) => {
          const isCurrent = i === currentIdx
          const cls =
            s.status === 'pending' && !isCurrent
              ? 'border-white/15 bg-white/5 text-white/40'
              : chip[s.status] ?? 'border-white/15 bg-white/5 text-white/40'
          return (
            <span
              key={s.order ?? i}
              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}
              title={`${nameFor(s.approverUserId)} — ${s.status}`}
            >
              {i + 1}. {s.status === 'approved' ? '✓' : s.status === 'rejected' ? '✕' : '…'}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function TasksPanel() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()
  const location = useLocation()
  const navigate = useNavigate()

  const [statusFilter, setStatusFilter] = useState('open')
  const [assigneeFilter, setAssigneeFilter] = useState('')

  const filters = useMemo(
    () => ({
      status: statusFilter === 'all' ? undefined : statusFilter,
      assigneeUserId: assigneeFilter || undefined,
    }),
    [statusFilter, assigneeFilter],
  )

  const {
    tasks,
    members,
    currentUserId,
    loading,
    error,
    notEntitled,
    create,
    update,
    complete,
    remove,
    submitApproval,
    decide,
  } = useTasks(schoolId, filters, canEdit)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [prefill, setPrefill] = useState(null)
  const [approvalTask, setApprovalTask] = useState(null)

  // A navigated-in prefill (from a "Create task" affordance elsewhere) opens the
  // create modal pre-seeded. Deferred to a microtask (setState-in-effect safe) and
  // the router state is cleared so a back/refresh doesn't re-open it.
  useEffect(() => {
    let cancelled = false
    const pf = location.state?.prefill
    if (!pf) return undefined
    Promise.resolve().then(() => {
      if (cancelled) return
      setEditing(null)
      setPrefill(pf)
      setModalOpen(true)
      navigate(location.pathname, { replace: true, state: {} })
    })
    return () => {
      cancelled = true
    }
  }, [location, navigate])

  const openAdd = () => {
    setEditing(null)
    setPrefill(null)
    setModalOpen(true)
  }
  const openEdit = (t) => {
    setEditing(t)
    setPrefill(null)
    setModalOpen(true)
  }

  const initialForm = useMemo(() => {
    if (editing) {
      return {
        title: editing.title ?? '',
        description: editing.description ?? '',
        assigneeUserId: editing.assigneeUserId ?? '',
        dueDate: editing.dueDate ?? '',
        priority: editing.priority ?? 'normal',
        status: editing.status ?? 'open',
        sourceType: editing.sourceType ?? 'manual',
        sourceRef: editing.sourceRef ?? '',
        recurrence: editing.recurrence ?? 'none',
        recurrenceUntil: editing.recurrenceUntil ?? '',
      }
    }
    if (prefill) return { ...EMPTY_FORM, ...prefill }
    return null
  }, [editing, prefill])

  const onSave = async (body) => {
    if (editing) await update(editing.id, body)
    else await create(body)
  }

  const onDelete = async (t) => {
    if (window.confirm(`Delete "${t.title}"? This cannot be undone.`)) {
      await remove(t.id)
    }
  }

  const modalKey = editing ? editing.id : prefill ? 'prefill' : 'new'

  // MY SIGN-OFFS — tasks where the caller IS the current designated approver of a
  // pending chain. Computed over the full loaded list (independent of the status
  // filter is not possible here since the list is filtered; but a 'pending' approval
  // only lives on open/in_progress tasks, so the default 'open' filter surfaces
  // most). The briefing item workflow:my-approvals-pending deep-links here.
  const mySignoffs = useMemo(
    () =>
      tasks.filter(
        (t) => t.approvalStatus === 'pending' && t.approverUserId === currentUserId,
      ),
    [tasks, currentUserId],
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/15 text-gold-light shadow-glow">
            <ListChecks size={22} />
          </span>
          <div>
            <h1 className="font-serif text-[22px] uppercase tracking-[0.12em] text-gold-light">
              Tasks
            </h1>
            <p className="text-[13px] text-white/60">
              Assignable, due-dated work across every part of your school.
            </p>
          </div>
        </div>
        {canEdit && !notEntitled ? (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-gold/60 bg-gold/15 px-4 py-2 text-[14px] font-semibold text-gold-light hover:bg-gold/25"
          >
            <Plus size={16} /> Add task
          </button>
        ) : null}
      </div>

      {!notEntitled && mySignoffs.length > 0 ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-2xl border-2 border-amber-400/40 bg-amber-500/[0.07] p-4 shadow-navy-glow"
        >
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck size={18} className="text-amber-200" />
            <h2 className="font-serif text-[15px] uppercase tracking-[0.1em] text-amber-100">
              Awaiting your sign-off ({mySignoffs.length})
            </h2>
          </div>
          <div className="space-y-2">
            {mySignoffs.map((t) => (
              <div
                key={`signoff-${t.id}`}
                className="rounded-xl border border-amber-400/25 bg-navy/40 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{t.title}</span>
                  <RecurrenceBadge recurrence={t.recurrence} seriesId={t.seriesId} />
                </div>
                <ChainProgress task={t} members={members} />
                <DecideControls task={t} onDecide={decide} />
              </div>
            ))}
          </div>
        </motion.div>
      ) : null}

      {!notEntitled ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-1.5 text-[13px] text-white outline-none focus:border-gold/60"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          {canEdit ? (
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-1.5 text-[13px] text-white outline-none focus:border-gold/60"
            >
              <option value="">All assignees</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {memberName(m)}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}

      {notEntitled ? (
        <div className="rounded-2xl border-2 border-gold/30 bg-navy/30 p-8 text-center">
          <p className="text-[15px] text-white/80">Your subscription is paused.</p>
          <p className="mt-1 text-[13px] text-white/55">Resume your plan to manage tasks.</p>
        </div>
      ) : loading ? (
        <div className="rounded-2xl border-2 border-white/10 bg-navy/30 p-8 text-center text-white/50">
          Loading tasks…
        </div>
      ) : error ? (
        <div className="rounded-2xl border-2 border-red-400/30 bg-red-500/10 p-6 text-center text-red-200">
          {error}
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-white/20 bg-navy/30 p-10 text-center">
          <p className="text-[15px] text-white/80">No tasks here.</p>
          <p className="mt-1 text-[13px] text-white/55">
            Add a task, or spawn one from an attention item on your briefing.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border-2 border-gold/20">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-navy/50 text-[12px] uppercase tracking-[0.08em] text-white/50">
              <tr>
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Assignee</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Due</th>
                {canEdit ? <th className="px-4 py-3 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {tasks.map((t) => (
                  <motion.tr
                    key={t.id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                    className="border-t border-white/10 text-white/85"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{t.title}</div>
                      <div className="flex flex-wrap items-center">
                        {t.sourceType && t.sourceType !== 'manual' ? (
                          <span className="mt-1 inline-flex items-center gap-1 rounded border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[11px] font-semibold text-gold-light">
                            <Link2 size={11} /> from {t.sourceType}
                          </span>
                        ) : null}
                        <RecurrenceBadge recurrence={t.recurrence} seriesId={t.seriesId} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white/70">{assigneeName(t.assignee)}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-white/20 bg-white/5 px-2 py-0.5 text-[12px] capitalize text-white/70">
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-white/20 bg-white/5 px-2 py-0.5 text-[12px] text-white/70">
                        {t.status.replace('_', ' ')}
                      </span>
                      {APPROVAL_BADGE[t.approvalStatus] ? (
                        <div className="mt-1.5">
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${APPROVAL_BADGE[t.approvalStatus].cls}`}
                            title={t.decisionNote || undefined}
                          >
                            {APPROVAL_BADGE[t.approvalStatus].label}
                          </span>
                          {t.approvalStatus === 'pending' &&
                          t.approver &&
                          !(Array.isArray(t.approvalSteps) && t.approvalSteps.length > 1) ? (
                            <div className="mt-1 text-[11px] text-white/45">
                              Approver: {assigneeName(t.approver)}
                            </div>
                          ) : null}
                          <ChainProgress task={t} members={members} />
                          {(t.approvalStatus === 'approved' || t.approvalStatus === 'rejected') &&
                          t.decidedBy ? (
                            <div className="mt-1 text-[11px] text-white/45">
                              Decided by {assigneeName(t.decidedBy)}
                            </div>
                          ) : null}
                          {t.approvalStatus === 'pending' &&
                          t.approverUserId === currentUserId ? (
                            <DecideControls task={t} onDecide={decide} />
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <UrgencyBadge
                        urgency={t.urgency}
                        dueDate={t.dueDate}
                        daysUntilDue={t.daysUntilDue}
                      />
                    </td>
                    {canEdit ? (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {t.status !== 'done' &&
                          t.status !== 'cancelled' &&
                          (t.approvalStatus === 'none' || t.approvalStatus === 'rejected') ? (
                            <button
                              type="button"
                              onClick={() => setApprovalTask(t)}
                              aria-label={`Request sign-off for ${t.title}`}
                              title="Request sign-off"
                              className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-gold/60 hover:text-gold-light"
                            >
                              <ShieldCheck size={15} />
                            </button>
                          ) : null}
                          {t.status !== 'done' && t.status !== 'cancelled' ? (
                            <button
                              type="button"
                              onClick={() => complete(t.id)}
                              aria-label={`Complete ${t.title}`}
                              className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-emerald-400/60 hover:text-emerald-200"
                            >
                              <Check size={15} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openEdit(t)}
                            aria-label={`Edit ${t.title}`}
                            className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-gold/60 hover:text-white"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(t)}
                            aria-label={`Delete ${t.title}`}
                            className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-red-400/60 hover:text-red-200"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      <TaskFormModal
        key={modalKey}
        open={modalOpen}
        initial={initialForm}
        members={members}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
        reduce={reduce}
      />

      <ApproverPickerModal
        key={approvalTask ? `approve-${approvalTask.id}` : 'approve-none'}
        open={!!approvalTask}
        task={approvalTask}
        members={members}
        onClose={() => setApprovalTask(null)}
        onSubmit={(approverUserIds) => submitApproval(approvalTask.id, approverUserIds)}
        reduce={reduce}
      />
    </div>
  )
}

export default function TasksPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <TasksPanel />
    </div>
  )
}

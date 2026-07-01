// ─────────────────────────────────────────────────────────────────────────────
// Tasks route (Phase 3 Workflow v1): TopBar + the TASK list panel. School-scoped
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
import { ListChecks, Plus, Pencil, Trash2, Check, X, Link2, ShieldCheck } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import BillingBanner from '../components/BillingBanner.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useTasks } from '../hooks/useTasks.js'

const STATUSES = ['open', 'in_progress', 'done', 'cancelled']
const PRIORITIES = ['low', 'normal', 'high']

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
}

/** Build the request body: send null to CLEAR optional fields. */
function toBody(form) {
  return {
    title: form.title.trim(),
    description: form.description.trim() ? form.description.trim() : null,
    assigneeUserId: form.assigneeUserId ? form.assigneeUserId : null,
    dueDate: form.dueDate ? form.dueDate : null,
    priority: form.priority,
    status: form.status,
    sourceType: form.sourceType || 'manual',
    sourceRef: form.sourceRef ? form.sourceRef : null,
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

/** Approver-picker modal for "Request sign-off" — reuses the members roster + the
 *  create-modal control styling. Editors (owner/accountant) only. */
function ApproverPickerModal({ open, task, members, onClose, onSubmit, reduce }) {
  const [approverUserId, setApproverUserId] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!approverUserId) {
      setErr('Choose an approver.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onSubmit(approverUserId)
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
          Route <span className="font-semibold text-white/90">{task?.title}</span> to an approver.
          They will be able to approve or request changes.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-[13px] text-white/70">
            Approver
            <select
              value={approverUserId}
              onChange={(e) => setApproverUserId(e.target.value)}
              className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
            >
              <option value="">Select an approver…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {memberName(m)}
                </option>
              ))}
            </select>
          </label>
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
                      {t.sourceType && t.sourceType !== 'manual' ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[11px] font-semibold text-gold-light">
                          <Link2 size={11} /> from {t.sourceType}
                        </span>
                      ) : null}
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
                          {t.approvalStatus === 'pending' && t.approver ? (
                            <div className="mt-1 text-[11px] text-white/45">
                              Approver: {assigneeName(t.approver)}
                            </div>
                          ) : null}
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
        onSubmit={(approverUserId) => submitApproval(approvalTask.id, approverUserId)}
        reduce={reduce}
      />
    </div>
  )
}

export default function TasksPage() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <BillingBanner />
      <TasksPanel />
    </div>
  )
}

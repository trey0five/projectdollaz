// ─────────────────────────────────────────────────────────────────────────────
// Tasks route (Phase 3 Workflow v1) — the DOMAIN COMMAND CENTER. A LIGHT
// command-center (matches Governance / Facilities / Advancement / Accreditation):
// Penny lands you on the workflow engine's slice of the briefing — the KPIs that
// define its health (open work, overdue, due soon, sign-offs awaiting YOU), the
// items that need a decision (the attention rail with one-click Approve / Complete
// actions), with the task list a tab away (All · Mine · Awaiting sign-off). Built
// on the reusable DomainCommandCenter scaffold.
//
// School-scoped (no period selector). Route stays /tasks. CORE — always available
// (no module gate); only the base entitlement can pause it (notEntitled → a light
// GatePanel). The create/edit, approver-picker, and decision modals are kept as
// dark navy/gold overlays over the light page. Reduced-motion safe, no
// setState-in-effect.
//
// A briefing/governance item can still hand this page a `prefill` (via navigation
// state) to open the create modal pre-seeded with a source link.
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
  TrendingDown,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter from '../components/domain/DomainCommandCenter.jsx'
import DatePicker from '../components/ui/DatePicker.jsx'
import EntityFormModal, { Field, Select, fieldInput, fieldTextarea } from '../components/ui/EntityFormModal.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useTasks } from '../hooks/useTasks.js'

const STATUSES = ['open', 'in_progress', 'done', 'cancelled']
const PRIORITIES = ['low', 'normal', 'high']
const RECURRENCES = ['none', 'weekly', 'monthly', 'quarterly', 'annual']

// ── Light-theme urgency badge (restyled from the old dark pills) ─────────────
const URGENCY_BADGE = {
  overdue: { label: 'Overdue', cls: 'border-danger/30 bg-danger/10 text-danger' },
  'due-soon': { label: 'Due soon', cls: 'border-gold/40 bg-gold/10 text-[#7a5e00]' },
  'on-track': { label: 'On track', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' },
  none: { label: 'No due date', cls: 'border-rule/60 bg-section text-muted' },
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

// ── Light-theme approval / sign-off status badge. 'none' renders nothing. ────
const APPROVAL_BADGE = {
  pending: { label: 'Awaiting sign-off', cls: 'border-gold/40 bg-gold/10 text-[#7a5e00]' },
  approved: { label: 'Approved', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Changes requested', cls: 'border-danger/30 bg-danger/10 text-danger' },
}

// ── Light-theme table primitives (shared idiom with GovernancePage) ──────────
function Th({ children, right }) {
  return (
    <th
      className={`px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

function IconAction(props) {
  const { onClick, label, title, danger, good } = props
  const ActionIcon = props.Icon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={`rounded-lg border border-rule/60 p-1.5 text-muted transition hover:text-navy ${
        danger
          ? 'hover:border-danger/50 hover:text-danger'
          : good
            ? 'hover:border-emerald-400/60 hover:text-emerald-600'
            : 'hover:border-gold/60'
      }`}
    >
      <ActionIcon size={15} />
    </button>
  )
}

function TableShell({ children, cols }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-rule/50">
      <table className="w-full text-left text-[14px]">
        <thead className="bg-cream">
          <tr>{cols}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function StateRow({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-12 text-center">
      {children}
    </div>
  )
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

  const linked = form.sourceType && form.sourceType !== 'manual'
  return (
    <EntityFormModal
      open={open}
      icon={ListChecks}
      title={initial ? 'Edit task' : 'Add task'}
      subtitle="Assign, prioritize, set a due date"
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={initial ? 'Save task' : 'Add task'}
      reduce={reduce}
    >
      {linked ? (
        <div className="inline-flex items-center gap-1.5 self-start rounded-md border border-gold/40 bg-gold/10 px-2 py-1 text-[12px] font-semibold text-gold-light sm:col-span-2">
          <Link2 size={13} /> Linked from {form.sourceType}
        </div>
      ) : null}
      <Field label="Title" span={2} index={0} reduce={reduce}>
        <input
          value={form.title}
          onChange={set('title')}
          maxLength={200}
          className={fieldInput}
          autoFocus
        />
      </Field>
      <Field label="Assignee" index={1} reduce={reduce}>
        <Select value={form.assigneeUserId} onChange={set('assigneeUserId')}>
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {memberName(m)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Due date" index={2} reduce={reduce}>
        <DatePicker
          value={form.dueDate}
          onChange={(v) => set('dueDate')({ target: { value: v } })}
          className={fieldInput}
        />
      </Field>
      <Field label="Priority" index={3} reduce={reduce}>
        <Select value={form.priority} onChange={set('priority')}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status" index={4} reduce={reduce}>
        <Select value={form.status} onChange={set('status')}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Repeats" index={5} reduce={reduce}>
        <Select value={form.recurrence} onChange={set('recurrence')}>
          {RECURRENCES.map((r) => (
            <option key={r} value={r}>
              {r === 'none' ? "Doesn't repeat" : r}
            </option>
          ))}
        </Select>
      </Field>
      {form.recurrence !== 'none' ? (
        <Field label="Repeat until" index={6} reduce={reduce}>
          <DatePicker
            value={form.recurrenceUntil}
            onChange={(v) => set('recurrenceUntil')({ target: { value: v } })}
            className={fieldInput}
          />
        </Field>
      ) : null}
      {form.recurrence !== 'none' ? (
        <p className="-mt-1 text-[12px] text-gold-light/80 sm:col-span-2">
          <Repeat size={12} className="mr-1 inline" />
          Completing this task will auto-create the next one
          {form.recurrenceUntil ? ` until ${form.recurrenceUntil}` : ''}.
        </p>
      ) : null}
      <Field label="Description" span={2} index={7} reduce={reduce}>
        <textarea
          value={form.description}
          onChange={set('description')}
          maxLength={4000}
          rows={2}
          className={fieldTextarea}
        />
      </Field>
    </EntityFormModal>
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

/** A small light-theme "↻ cadence" badge shown on recurring task rows. */
function RecurrenceBadge({ recurrence, seriesId }) {
  if (!recurrence || recurrence === 'none') return null
  return (
    <span
      className="ml-1 inline-flex items-center gap-1 rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[11px] font-semibold capitalize text-[#7a5e00]"
      title={seriesId ? 'Part of a recurring series.' : 'Repeats automatically on completion.'}
    >
      <Repeat size={11} /> {recurrence}
    </span>
  )
}

/** Multi-step chain progress ("Step 2 of 3") + per-step chips — LIGHT theme.
 *  Renders nothing for a legacy single-approver task (steps null / length <= 1). */
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
    approved: 'border-emerald-300/70 bg-emerald-50 text-emerald-700',
    rejected: 'border-danger/30 bg-danger/10 text-danger',
    pending: 'border-gold/40 bg-gold/10 text-[#7a5e00]',
  }
  return (
    <div className="mt-1.5">
      {currentIdx >= 0 ? (
        <div className="text-[11px] font-semibold text-muted">
          Step {currentIdx + 1} of {steps.length} — {nameFor(steps[currentIdx].approverUserId)}
        </div>
      ) : (
        <div className="text-[11px] font-semibold text-muted/70">
          {steps.length}-step chain complete
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-1">
        {steps.map((s, i) => {
          const isCurrent = i === currentIdx
          const cls =
            s.status === 'pending' && !isCurrent
              ? 'border-rule/60 bg-section text-muted/70'
              : chip[s.status] ?? 'border-rule/60 bg-section text-muted/70'
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

// ── Light-theme entitlement / license gate ───────────────────────────────────
function GatePanel() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-10 sm:py-8">
      <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
          <ListChecks size={26} />
        </span>
        <h2 className="font-serif text-xl font-semibold text-navy">Your subscription is paused</h2>
        <p className="max-w-md text-[15px] text-muted">Resume your plan to manage tasks.</p>
      </div>
    </div>
  )
}

// ═══════════════════════════ LIGHT TASKS TABLE ══════════════════════════════

function TasksTable({
  tasks,
  members,
  currentUserId,
  loading,
  error,
  canEdit,
  reduce,
  emptyLabel,
  onComplete,
  onEdit,
  onDelete,
  onRequestSignoff,
  onDecide,
}) {
  if (loading)
    return (
      <StateRow>
        <p className="text-[14px] text-muted">Loading tasks…</p>
      </StateRow>
    )
  if (error)
    return (
      <StateRow>
        <p className="text-[14px] text-danger">{error}</p>
      </StateRow>
    )
  if (tasks.length === 0)
    return (
      <StateRow>
        <p className="font-serif text-[16px] italic text-muted">{emptyLabel}</p>
        <p className="mt-1 text-[13px] text-muted">
          Add a task, or spawn one from an attention item on your briefing.
        </p>
      </StateRow>
    )

  return (
    <TableShell
      cols={
        <>
          <Th>Task</Th>
          <Th>Assignee</Th>
          <Th>Due</Th>
          <Th>Priority</Th>
          <Th>Status</Th>
          <Th>Approval</Th>
          {canEdit ? <Th right>Actions</Th> : null}
        </>
      }
    >
      <AnimatePresence initial={false}>
        {tasks.map((t) => {
          const active = t.status !== 'done' && t.status !== 'cancelled'
          const canRequest =
            canEdit && active && (t.approvalStatus === 'none' || t.approvalStatus === 'rejected')
          const iAmApprover = t.approvalStatus === 'pending' && t.approverUserId === currentUserId
          const badge = APPROVAL_BADGE[t.approvalStatus]
          return (
            <motion.tr
              key={t.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              className="group border-t border-rule/50 align-top"
            >
              <td className="px-4 py-3">
                <div className="font-semibold text-navy">{t.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {t.sourceType && t.sourceType !== 'manual' ? (
                    <span className="inline-flex items-center gap-1 rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#7a5e00]">
                      <Link2 size={11} /> from {t.sourceType}
                    </span>
                  ) : null}
                  <RecurrenceBadge recurrence={t.recurrence} seriesId={t.seriesId} />
                </div>
              </td>
              <td className="px-4 py-3 text-muted">{assigneeName(t.assignee)}</td>
              <td className="px-4 py-3">
                <UrgencyBadge
                  urgency={t.urgency}
                  dueDate={t.dueDate}
                  daysUntilDue={t.daysUntilDue}
                />
              </td>
              <td className="px-4 py-3">
                <span className="rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[12px] capitalize text-muted">
                  {t.priority}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[12px] capitalize text-muted">
                  {t.status.replace('_', ' ')}
                </span>
              </td>
              <td className="px-4 py-3">
                {badge ? (
                  <div>
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${badge.cls}`}
                      title={t.decisionNote || undefined}
                    >
                      {badge.label}
                    </span>
                    {t.approvalStatus === 'pending' &&
                    t.approver &&
                    !(Array.isArray(t.approvalSteps) && t.approvalSteps.length > 1) ? (
                      <div className="mt-1 text-[11px] text-muted">
                        Approver: {assigneeName(t.approver)}
                      </div>
                    ) : null}
                    <ChainProgress task={t} members={members} />
                    {(t.approvalStatus === 'approved' || t.approvalStatus === 'rejected') &&
                    t.decidedBy ? (
                      <div className="mt-1 text-[11px] text-muted">
                        Decided by {assigneeName(t.decidedBy)}
                      </div>
                    ) : null}
                    {iAmApprover ? <DecideControls task={t} onDecide={onDecide} /> : null}
                  </div>
                ) : (
                  <span className="text-[12px] text-muted/60">—</span>
                )}
              </td>
              {canEdit ? (
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5 opacity-60 transition group-hover:opacity-100">
                    {active ? (
                      <IconAction
                        Icon={Check}
                        good
                        onClick={() => onComplete(t.id)}
                        label={`Complete ${t.title}`}
                        title="Mark complete"
                      />
                    ) : null}
                    {canRequest ? (
                      <IconAction
                        Icon={ShieldCheck}
                        onClick={() => onRequestSignoff(t)}
                        label={`Request sign-off for ${t.title}`}
                        title="Request sign-off"
                      />
                    ) : null}
                    <IconAction Icon={Pencil} onClick={() => onEdit(t)} label={`Edit ${t.title}`} />
                    <IconAction
                      Icon={Trash2}
                      danger
                      onClick={() => onDelete(t)}
                      label={`Delete ${t.title}`}
                    />
                  </div>
                </td>
              ) : null}
            </motion.tr>
          )
        })}
      </AnimatePresence>
    </TableShell>
  )
}

const TABS = [
  { key: 'all', label: 'All tasks' },
  { key: 'mine', label: 'My tasks' },
  { key: 'signoffs', label: 'Awaiting sign-off' },
]

const EMPTY_LABEL = {
  all: 'No tasks here.',
  mine: 'Nothing assigned to you.',
  signoffs: 'No sign-offs waiting on you.',
}

// ═══════════════════════════ PAGE ═══════════════════════════════════════════

function TasksWorkspace() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()
  const location = useLocation()
  const navigate = useNavigate()

  // The command center owns the full list (no server-side status/assignee filter);
  // the tabs (All / Mine / Awaiting sign-off) slice it client-side, and the KPIs +
  // attention rail are computed over the whole list.
  const filters = useMemo(() => ({}), [])

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

  const [tab, setTab] = useState('all')
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

  const isOverdue = (t) =>
    t.urgency === 'overdue' ||
    (t.dueDate &&
      t.dueDate < new Date().toISOString().slice(0, 10) &&
      t.status !== 'done' &&
      t.status !== 'cancelled')

  // ── KPIs (computed over the whole list) ────────────────────────────────────
  const kpis = useMemo(() => {
    const openCount = tasks.filter((t) => t.status === 'open' || t.status === 'in_progress').length
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length
    const overdue = tasks.filter(isOverdue).length
    const dueSoon = tasks.filter((t) => t.urgency === 'due-soon').length
    const mySignoffs = tasks.filter(
      (t) => t.approvalStatus === 'pending' && t.approverUserId === currentUserId,
    ).length

    return [
      {
        label: 'Open tasks',
        value: String(openCount),
        status: openCount === 0 ? 'good' : inProgress > 0 ? 'watch' : 'neutral',
        sub:
          openCount === 0
            ? { icon: Check, text: 'all clear', tone: 'good' }
            : { icon: Clock, text: `${inProgress} in progress`, tone: 'neutral' },
      },
      {
        label: 'Overdue',
        value: String(overdue),
        status: overdue > 0 ? 'risk' : 'good',
        sub:
          overdue > 0
            ? { icon: TrendingDown, text: 'past due date', tone: 'bad' }
            : { icon: Check, text: 'on schedule', tone: 'good' },
      },
      {
        label: 'Due soon',
        value: String(dueSoon),
        status: dueSoon > 0 ? 'watch' : 'neutral',
        sub: { icon: Clock, text: 'within 7 days', tone: 'neutral' },
      },
      {
        label: 'Awaiting your sign-off',
        value: String(mySignoffs),
        status: mySignoffs > 0 ? 'risk' : 'good',
        sub:
          mySignoffs > 0
            ? { icon: AlertTriangle, text: 'your decision', tone: 'bad' }
            : { icon: Check, text: 'none pending', tone: 'good' },
      },
    ]
  }, [tasks, currentUserId])

  // ── Needs-attention items (most-urgent first, capped at 6) ─────────────────
  const attentionItems = useMemo(() => {
    const items = []

    // 1) Tasks awaiting MY sign-off — I am the current approver.
    const mine = tasks.filter(
      (t) => t.approvalStatus === 'pending' && t.approverUserId === currentUserId,
    )
    for (const t of mine) {
      items.push({
        id: `signoff-${t.id}`,
        tone: 'risk',
        sortKey: 0,
        title: `${t.title} awaits your sign-off`,
        why: 'You are the approver',
        actions: canEdit
          ? [
              {
                label: 'Approve',
                primary: true,
                onClick: () => decide(t.id, 'approve', null),
              },
            ]
          : [],
      })
    }

    // 2) Overdue tasks — most days-past-due first.
    const overdue = tasks
      .filter((t) => isOverdue(t) && !(t.approvalStatus === 'pending' && t.approverUserId === currentUserId))
      .sort((a, b) => (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0))
    for (const t of overdue) {
      const days = typeof t.daysUntilDue === 'number' ? Math.abs(t.daysUntilDue) : null
      items.push({
        id: `overdue-${t.id}`,
        tone: 'risk',
        sortKey: 1,
        title: `${t.title} is overdue`,
        why: days != null ? `${days} day${days === 1 ? '' : 's'} past due` : 'Past its due date',
        actions: canEdit
          ? [{ label: 'Complete', primary: false, onClick: () => complete(t.id) }]
          : [],
      })
    }

    // 3) Due-soon tasks — soonest first.
    const dueSoon = tasks
      .filter((t) => t.urgency === 'due-soon')
      .sort((a, b) => (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0))
    for (const t of dueSoon) {
      const days = typeof t.daysUntilDue === 'number' ? t.daysUntilDue : null
      items.push({
        id: `due-soon-${t.id}`,
        tone: 'watch',
        sortKey: 2,
        title:
          days === 0
            ? `${t.title} is due today`
            : days != null
              ? `${t.title} is due in ${days} day${days === 1 ? '' : 's'}`
              : `${t.title} is due soon`,
        why: 'Coming up within the next 7 days',
        actions: [],
      })
    }

    return items.sort((a, b) => a.sortKey - b.sortKey).slice(0, 6)
  }, [tasks, currentUserId, canEdit, decide, complete])

  // ── Gate ───────────────────────────────────────────────────────────────────
  if (notEntitled) return <GatePanel />

  // ── Active-tab slice ───────────────────────────────────────────────────────
  const visibleTasks =
    tab === 'mine'
      ? tasks.filter((t) => t.assigneeUserId === currentUserId)
      : tab === 'signoffs'
        ? tasks.filter(
            (t) => t.approvalStatus === 'pending' && t.approverUserId === currentUserId,
          )
        : tasks

  const registerTable = (
    <TasksTable
      tasks={visibleTasks}
      members={members}
      currentUserId={currentUserId}
      loading={loading}
      error={error}
      canEdit={canEdit}
      reduce={reduce}
      emptyLabel={EMPTY_LABEL[tab] ?? EMPTY_LABEL.all}
      onComplete={complete}
      onEdit={openEdit}
      onDelete={onDelete}
      onRequestSignoff={setApprovalTask}
      onDecide={decide}
    />
  )

  return (
    <>
      <DomainCommandCenter
        eyebrow="Core · Workflow engine · system of record"
        title="Tasks"
        Icon={ListChecks}
        attentionCount={attentionItems.length}
        kpis={kpis}
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        onNew={canEdit ? openAdd : null}
        registerTable={registerTable}
        attentionItems={attentionItems}
      />

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
    </>
  )
}

export default function TasksPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <TasksWorkspace />
    </div>
  )
}

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
// (no module gate); only the base entitlement can pause it (notEntitled → a plain
// GatePanel header). Premium UI P4: tasks are ruled rows with a 2px status mark;
// the create/edit and approver-picker dialogs share EntityFormModal and the
// detail dialog is a white Panel at the float elevation. Reduced-motion safe, no
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
  User,
  ChevronRight,
  FileSignature,
  CreditCard,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter, { DomainStatePanel } from '../components/domain/DomainCommandCenter.jsx'
import RegisterEmpty from '../components/module/RegisterEmpty.jsx'
import { AuroraButton, VerdictEm } from '../components/ui/aurora/index.js'
import DatePicker from '../components/ui/DatePicker.jsx'
import EntityFormModal, { Field, Select, fieldInput, fieldTextarea } from '../components/ui/EntityFormModal.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useTasks } from '../hooks/useTasks.js'
import { memberLabel, memberName } from '../lib/memberLabels.js'
import { Pill, Button } from '../components/ui/surface/index.js'
import '../styles/pending/b1-domain.css'

const STATUSES = ['open', 'in_progress', 'done', 'cancelled']
const PRIORITIES = ['low', 'normal', 'high']
const RECURRENCES = ['none', 'weekly', 'monthly', 'quarterly', 'annual']

// ── Urgency / sign-off → status Pill tones (2px mark + ink text) ─────────────
const URGENCY_BADGE = {
  overdue: { label: 'Overdue', tone: 'risk' },
  'due-soon': { label: 'Due soon', tone: 'watch' },
  'on-track': { label: 'On track', tone: 'good' },
  none: { label: 'No due date', tone: 'neutral' },
}

function UrgencyBadge({ urgency, dueDate, daysUntilDue }) {
  const b = URGENCY_BADGE[urgency] ?? URGENCY_BADGE.none
  let suffix = ''
  if (urgency === 'due-soon' && typeof daysUntilDue === 'number')
    suffix = daysUntilDue === 0 ? ' · today' : ` · in ${daysUntilDue}d`
  else if (urgency === 'overdue' && typeof daysUntilDue === 'number')
    suffix = ` · ${Math.abs(daysUntilDue)}d ago`
  return (
    <Pill variant="status" tone={b.tone} title={dueDate ? `Due: ${dueDate}` : 'No due date'}>
      {b.label}
      {suffix}
    </Pill>
  )
}

function assigneeName(a) {
  if (!a) return 'Unassigned'
  return memberName(a)
}

// Sign-off status. 'none' renders nothing.
const APPROVAL_BADGE = {
  pending: { label: 'Awaiting sign-off', tone: 'watch' },
  approved: { label: 'Approved', tone: 'good' },
  rejected: { label: 'Changes requested', tone: 'risk' },
}

/** Loading / error / empty — a ruled block on the ground, never a dashed card. */
function StateRow({ title, children, error }) {
  return (
    <div className="b1-empty" role={error ? 'alert' : undefined}>
      {title ? <p className="b1-empty-title">{title}</p> : null}
      {children ? <p className={error ? 'b1-empty-err' : undefined}>{children}</p> : null}
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
        <div className="inline-flex items-center gap-1.5 self-start text-[12px] font-semibold text-ink2 sm:col-span-2">
          <Link2 size={13} aria-hidden="true" /> Linked from {form.sourceType}
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
              {memberLabel(m)}
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
        <p className="-mt-1 text-[12px] text-ink2 sm:col-span-2">
          <Repeat size={12} className="mr-1 inline" aria-hidden="true" />
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
 *  single-approver flow. Built on the shared EntityFormModal (the ONE record
 *  dialog). Editors (owner/accountant) only. */
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
    <EntityFormModal
      open
      icon={ShieldCheck}
      title="Request sign-off"
      subtitle={task?.title ? `Route “${task.title}” through one or more approvers, in order.` : 'Each approver signs off in turn.'}
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel="Request sign-off"
      reduce={reduce}
    >
      <div className="space-y-3 sm:col-span-2">
        {chain.length > 0 ? (
          <ol className="b1-list">
            {chain.map((id, i) => (
              <li key={id} className="b1-row !flex-nowrap">
                <span className="w-5 shrink-0 text-right text-[12px] font-semibold tabular-nums text-ink2">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{nameFor(id)}</span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="b1-icon-act">
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === chain.length - 1}
                  aria-label="Move down"
                  className="b1-icon-act"
                >
                  <ArrowDown size={14} />
                </button>
                <button type="button" onClick={() => removeAt(i)} aria-label="Remove approver" className="b1-icon-act b1-icon-act-danger">
                  <X size={14} />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="b1-empty !py-4">
            <p>No approvers yet. Add one below.</p>
          </div>
        )}

        <div className="flex gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="b1-fld flex-1" aria-label="Add an approver">
            <option value="">Add an approver…</option>
            {available.map((m) => (
              <option key={m.id} value={m.id}>
                {memberLabel(m)}
              </option>
            ))}
          </select>
          <Button onClick={addApprover} disabled={!pick} icon={<Plus size={14} />}>
            Add
          </Button>
        </div>
      </div>
    </EntityFormModal>
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
    <div className="mt-3 space-y-2 border-l-2 pl-3" style={{ borderLeftColor: 'rgb(var(--c-watch))' }}>
      <p className="text-[12px] font-semibold text-ink">You are the approver.</p>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={2000}
        placeholder="Add a note (optional)"
        aria-label="Decision note"
        className="b1-fld"
      />
      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={busy} onClick={() => act('approve')} icon={<Check size={14} />}>
          Approve
        </Button>
        <Button size="sm" disabled={busy} onClick={() => act('reject')} icon={<X size={14} />}>
          Request changes
        </Button>
      </div>
    </div>
  )
}

/** The "↻ cadence" note shown on recurring task rows. */
function RecurrenceBadge({ recurrence, seriesId }) {
  if (!recurrence || recurrence === 'none') return null
  return (
    <span
      className="inline-flex items-center gap-1 capitalize"
      title={seriesId ? 'Part of a recurring series.' : 'Repeats automatically on completion.'}
    >
      <Repeat size={11} aria-hidden="true" /> {recurrence}
    </span>
  )
}

/** Multi-step chain progress ("Step 2 of 3") + one 2px mark per step.
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
  const tone = { approved: 'good', rejected: 'risk', pending: 'watch' }
  return (
    <div className="mt-1.5">
      <div className="text-[12px] font-semibold text-ink2">
        {currentIdx >= 0
          ? `Step ${currentIdx + 1} of ${steps.length} · ${nameFor(steps[currentIdx].approverUserId)}`
          : `${steps.length}-step chain complete`}
      </div>
      <ol className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] font-semibold text-ink2">
        {steps.map((s, i) => {
          const isCurrent = i === currentIdx
          const t = s.status === 'pending' && !isCurrent ? 'neutral' : (tone[s.status] ?? 'neutral')
          return (
            <li key={s.order ?? i} className="inline-flex items-center gap-1.5" title={`${nameFor(s.approverUserId)} — ${s.status}`}>
              <i className={`mark tone-${t}`} aria-hidden="true" />
              {i + 1}. {s.status === 'approved' ? 'approved' : s.status === 'rejected' ? 'changes' : isCurrent ? 'now' : 'next'}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ── Entitlement gate: a plain page header on the ground ──────────────────────
function GatePanel() {
  const { activeSchool } = useSchools()
  const isOwner = activeSchool?.role === 'owner'
  return (
    <DomainStatePanel
      showBack
      title="Tasks"
      Icon={ListChecks}
      icon={ListChecks}
      verdict="Your subscription is paused."
      primaryAction={
        <AuroraButton
          variant="primary"
          to={isOwner ? '/settings/billing' : '/settings'}
          icon={<CreditCard size={19} aria-hidden="true" />}
        >
          Resume your plan
        </AuroraButton>
      }
      text="Resume your plan to manage tasks."
    />
  )
}

// ═══════════════════════════ TASK ROWS + DETAIL ═════════════════════════════

const PRIORITY_META = {
  high: { tone: 'risk', Icon: ArrowUp },
  normal: { tone: null, Icon: null },
  low: { tone: null, Icon: ArrowDown },
}

// The 2px status mark reads a row's urgency at a glance: risk overdue, watch for
// due-soon or high priority, good when done, nothing otherwise.
function markTone(t) {
  if (t.status === 'done') return 'good'
  if (t.urgency === 'overdue') return 'risk'
  if (t.urgency === 'due-soon' || t.priority === 'high') return 'watch'
  return null
}

// A single task as a clickable RULED ROW: title + a wrapping meta line (assignee,
// due, priority, status, sign-off, source, recurrence) — so nothing gets cut off
// and the list never scrolls sideways. Clicking anywhere opens the detail dialog;
// a hover-revealed check completes it inline.
function TaskCard({ t, canEdit, onOpenDetail, onComplete }) {
  const active = t.status !== 'done' && t.status !== 'cancelled'
  const pr = PRIORITY_META[t.priority] ?? PRIORITY_META.normal
  const badge = APPROVAL_BADGE[t.approvalStatus]
  const tone = markTone(t)
  const open = () => onOpenDetail(t)
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            open()
          }
        }}
        className="group b1-row b1-row-link relative !flex-nowrap !items-start !py-3 !pl-3"
      >
        {tone ? (
          <i className={`absolute bottom-3 left-0 top-3 w-[2px] tone-${tone}`} style={{ background: 'currentColor' }} aria-hidden="true" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className={`font-semibold leading-snug text-ink ${t.status === 'done' ? 'text-ink2 line-through' : ''}`}>{t.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink2">
            <span className="inline-flex items-center gap-1">
              <User size={12} aria-hidden="true" />
              {assigneeName(t.assignee)}
            </span>
            <UrgencyBadge urgency={t.urgency} dueDate={t.dueDate} daysUntilDue={t.daysUntilDue} />
            {pr.tone ? (
              <Pill variant="status" tone={pr.tone} className="capitalize">
                {t.priority}
              </Pill>
            ) : (
              <span className="inline-flex items-center gap-1 capitalize">
                {pr.Icon ? <pr.Icon size={12} aria-hidden="true" /> : null}
                {t.priority}
              </span>
            )}
            <span className="capitalize">{t.status.replace('_', ' ')}</span>
            {badge ? (
              <Pill variant="status" tone={badge.tone}>
                {badge.label}
              </Pill>
            ) : null}
            {t.sourceType && t.sourceType !== 'manual' ? (
              <span className="inline-flex items-center gap-1">
                <Link2 size={12} aria-hidden="true" /> from {t.sourceType}
              </span>
            ) : null}
            <RecurrenceBadge recurrence={t.recurrence} seriesId={t.seriesId} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 self-center">
          {canEdit && active ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onComplete(t.id)
              }}
              aria-label={`Complete ${t.title}`}
              title="Mark complete"
              className="b1-icon-act dt-actions group-hover:opacity-100 group-focus-within:opacity-100"
            >
              <Check size={15} />
            </button>
          ) : null}
          <ChevronRight size={16} className="text-ink2 transition group-hover:translate-x-0.5" aria-hidden="true" />
        </div>
      </div>
    </li>
  )
}

function TasksList({ tasks, loading, error, canEdit, emptyLabel, onOpenDetail, onComplete }) {
  if (loading) return <StateRow>Loading tasks…</StateRow>
  if (error) return <StateRow error>{error}</StateRow>
  if (tasks.length === 0)
    return <RegisterEmpty icon={ListChecks} text={emptyLabel} sub="Add one, or make one from any warning." actionLabel="Add a task" />

  return (
    <ul className="b1-list">
      {tasks.map((t) => (
        <TaskCard key={t.id} t={t} canEdit={canEdit} onOpenDetail={onOpenDetail} onComplete={onComplete} />
      ))}
    </ul>
  )
}

// ── Task detail dialog — a white Panel at the float elevation that opens on row
// click: full description, an at-a-glance fact list, the sign-off timeline, and
// every action on a hairline footer.
function DetailRow({ label, children }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function TaskDetailModal({
  task,
  members,
  currentUserId,
  canEdit,
  reduce,
  onClose,
  onComplete,
  onEdit,
  onDelete,
  onRequestSignoff,
  onDecide,
}) {
  useEffect(() => {
    if (!task) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [task, onClose])

  const active = task && task.status !== 'done' && task.status !== 'cancelled'
  const canRequest = active && (task?.approvalStatus === 'none' || task?.approvalStatus === 'rejected')
  const pr = task ? (PRIORITY_META[task.priority] ?? PRIORITY_META.normal) : PRIORITY_META.normal
  const badge = task ? APPROVAL_BADGE[task.approvalStatus] : null

  return (
    <AnimatePresence>
      {task && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="b1-drawer-scrim" onClick={onClose} aria-hidden="true" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={task.title}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-[61] flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-hair bg-white shadow-float"
          >
            <span className="block h-[2px] w-full shrink-0" style={{ background: 'rgb(var(--c-module, 16 28 61))' }} aria-hidden="true" />
            <div className="flex items-start gap-3 px-6 pb-4 pt-5">
              <div className="min-w-0 flex-1">
                <p className="pg-eyebrow">Task</p>
                <h2
                  className={`font-serif text-[24px] font-medium leading-tight text-ink ${task.status === 'done' ? 'opacity-70 line-through' : ''}`}
                >
                  {task.title}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink2">
                  {pr.tone ? (
                    <Pill variant="status" tone={pr.tone} className="capitalize">
                      {task.priority} priority
                    </Pill>
                  ) : (
                    <span className="capitalize">{task.priority} priority</span>
                  )}
                  <span className="capitalize">{task.status.replace('_', ' ')}</span>
                  {badge ? (
                    <Pill variant="status" tone={badge.tone}>
                      {badge.label}
                    </Pill>
                  ) : null}
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="b1-icon-act">
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-5">
              {task.description ? (
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{task.description}</p>
              ) : (
                <p className="text-[13.5px] text-ink2">No description.</p>
              )}

              <dl className="b1-facts">
                <DetailRow label="Assignee">{assigneeName(task.assignee)}</DetailRow>
                <DetailRow label="Due">
                  <UrgencyBadge urgency={task.urgency} dueDate={task.dueDate} daysUntilDue={task.daysUntilDue} />
                </DetailRow>
                {task.sourceType && task.sourceType !== 'manual' ? (
                  <DetailRow label="Source">
                    <span className="capitalize">{task.sourceType}</span>
                  </DetailRow>
                ) : null}
                {task.recurrence && task.recurrence !== 'none' ? (
                  <DetailRow label="Repeats">
                    <span className="capitalize">{task.recurrence}</span>
                  </DetailRow>
                ) : null}
              </dl>

              {badge ? (
                <div>
                  <p className="sec-label">Sign-off</p>
                  {task.approvalStatus === 'pending' &&
                  task.approver &&
                  !(Array.isArray(task.approvalSteps) && task.approvalSteps.length > 1) ? (
                    <p className="mt-1 text-[13px] text-ink2">Approver: {assigneeName(task.approver)}</p>
                  ) : null}
                  <ChainProgress task={task} members={members} />
                  {(task.approvalStatus === 'approved' || task.approvalStatus === 'rejected') && task.decidedBy ? (
                    <p className="mt-1.5 text-[13px] text-ink2">Decided by {assigneeName(task.decidedBy)}</p>
                  ) : null}
                  {task.decisionNote ? (
                    <p className="mt-1 text-[13px] text-ink2">&ldquo;{task.decisionNote}&rdquo;</p>
                  ) : null}
                  {task.approvalStatus === 'pending' && task.approverUserId === currentUserId ? (
                    <DecideControls
                      task={task}
                      onDecide={(id, d, n) => {
                        onDecide(id, d, n)
                        onClose()
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>

            {canEdit ? (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hair px-6 py-3">
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => {
                    onDelete(task)
                    onClose()
                  }}
                  icon={<Trash2 size={14} />}
                  className="mr-auto !text-risk"
                >
                  Delete
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    onClose()
                    onEdit(task)
                  }}
                  icon={<Pencil size={14} />}
                >
                  Edit
                </Button>
                {canRequest ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      onRequestSignoff(task)
                      onClose()
                    }}
                    icon={<ShieldCheck size={15} />}
                  >
                    Request sign-off
                  </Button>
                ) : null}
                {active ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      onComplete(task.id)
                      onClose()
                    }}
                    icon={<Check size={15} />}
                  >
                    Complete
                  </Button>
                ) : null}
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const TABS = [
  { key: 'all', label: 'All tasks' },
  { key: 'mine', label: 'My tasks' },
  { key: 'signoffs', label: 'Awaiting sign-off' },
]

const EMPTY_LABEL = {
  all: 'No tasks yet.',
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
  const [detailTask, setDetailTask] = useState(null)

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
  // With no tasks at all there is nothing to judge: plain zeros, no pills.
  const kpis = useMemo(() => {
    const openCount = tasks.filter((t) => t.status === 'open' || t.status === 'in_progress').length
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length
    const overdue = tasks.filter(isOverdue).length
    const dueSoon = tasks.filter((t) => t.urgency === 'due-soon').length
    const mySignoffs = tasks.filter(
      (t) => t.approvalStatus === 'pending' && t.approverUserId === currentUserId,
    ).length
    const none = tasks.length === 0

    return [
      {
        label: 'Open tasks',
        icon: ListChecks,
        value: String(openCount),
        status: none ? 'neutral' : openCount === 0 ? 'good' : inProgress > 0 ? 'watch' : 'neutral',
        sub:
          none
            ? { icon: ListChecks, text: 'nothing added yet', tone: 'neutral' }
            : openCount === 0
              ? { icon: Check, text: 'all clear', tone: 'good' }
              : { icon: Clock, text: `${inProgress} in progress`, tone: 'neutral' },
      },
      {
        label: 'Overdue',
        icon: AlertTriangle,
        value: String(overdue),
        status: overdue > 0 ? 'risk' : openCount === 0 ? 'neutral' : 'good',
        sub:
          overdue > 0
            ? { icon: TrendingDown, text: 'past due date', tone: 'bad' }
            : { icon: Check, text: openCount === 0 ? 'nothing open' : 'on schedule', tone: 'neutral' },
      },
      {
        label: 'Due soon',
        icon: Clock,
        value: String(dueSoon),
        status: dueSoon > 0 ? 'watch' : 'neutral',
        sub: { icon: Clock, text: 'within 7 days', tone: 'neutral' },
      },
      {
        label: 'Waiting on your sign-off',
        icon: FileSignature,
        value: String(mySignoffs),
        status: mySignoffs > 0 ? 'risk' : 'neutral',
        sub:
          mySignoffs > 0
            ? { icon: AlertTriangle, text: 'your decision', tone: 'bad' }
            : { icon: Check, text: 'none pending', tone: 'neutral' },
      },
    ]
  }, [tasks, currentUserId])

  // ── The band's one sentence (real counts only; worst thing first) ─────────
  const verdict = useMemo(() => {
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
    if (tasks.length === 0) return <>No tasks yet. Add one, or make one from any warning.</>
    const openCount = tasks.filter((t) => t.status === 'open' || t.status === 'in_progress').length
    const overdue = tasks.filter(isOverdue).length
    const dueSoon = tasks.filter((t) => t.urgency === 'due-soon').length
    const mySignoffs = tasks.filter(
      (t) => t.approvalStatus === 'pending' && t.approverUserId === currentUserId,
    ).length
    const issues = [
      mySignoffs && { tone: 'risk', text: `${plural(mySignoffs, 'waits', 'wait')} on your sign-off.` },
      overdue && { tone: 'risk', text: `${plural(overdue, 'is', 'are')} overdue.` },
      dueSoon && { tone: 'watch', text: `${plural(dueSoon, 'is', 'are')} due this week.` },
    ].filter(Boolean)
    const top = issues[0]
    return (
      <>
        {openCount > 0 ? (
          <>
            <VerdictEm>{plural(openCount, 'task is', 'tasks are')} open</VerdictEm>.{' '}
          </>
        ) : (
          <>Every task is done. </>
        )}
        {top ? (
          <VerdictEm tone={top.tone}>{top.text}</VerdictEm>
        ) : openCount > 0 ? (
          <VerdictEm tone="good">Nothing is overdue.</VerdictEm>
        ) : null}
      </>
    )
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
        why: 'You are the approver.',
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
        why: days != null ? `${days} day${days === 1 ? '' : 's'} past due.` : 'Past its due date.',
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
        why: 'Due within the next 7 days.',
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
    <TasksList
      tasks={visibleTasks}
      loading={loading}
      error={error}
      canEdit={canEdit}
      emptyLabel={EMPTY_LABEL[tab] ?? EMPTY_LABEL.all}
      onOpenDetail={setDetailTask}
      onComplete={complete}
    />
  )

  return (
    <>
      <DomainCommandCenter
        showBack
        eyebrow={null}
        title="Tasks"
        Icon={ListChecks}
        verdict={verdict}
        attentionCount={attentionItems.length}
        kpis={kpis}
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        onNew={canEdit ? openAdd : null}
        registerTable={registerTable}
        registerSubtitle="Everything your team has to do"
        registerIcon={ListChecks}
        attentionItems={attentionItems}
        howItWorks={
          <>
            <p>Tasks come from your team, or from a warning, policy or standard someone turned into a task.</p>
            <p>
              Due soon means due within 7 days. A task that needs sign-off waits on each approver in turn; the ones
              waiting on you show first.
            </p>
          </>
        }
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

      <TaskDetailModal
        task={detailTask}
        members={members}
        currentUserId={currentUserId}
        canEdit={canEdit}
        reduce={reduce}
        onClose={() => setDetailTask(null)}
        onComplete={complete}
        onEdit={openEdit}
        onDelete={onDelete}
        onRequestSignoff={setApprovalTask}
        onDecide={decide}
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

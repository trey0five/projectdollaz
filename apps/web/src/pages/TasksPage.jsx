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
  User,
  ChevronRight,
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

// ═══════════════════════════ TASK CARDS + DETAIL ════════════════════════════

const PRIORITY_META = {
  high: { cls: 'border-danger/30 bg-danger/10 text-danger', Icon: ArrowUp },
  normal: { cls: 'border-rule/60 bg-section text-muted', Icon: null },
  low: { cls: 'border-rule/60 bg-section text-muted/80', Icon: ArrowDown },
}

// The left accent stripe reads a card's urgency at a glance: red overdue, gold
// for due-soon or high priority, green when done, quiet otherwise.
function accentClass(t) {
  if (t.status === 'done') return 'bg-emerald-400/70'
  if (t.urgency === 'overdue') return 'bg-danger'
  if (t.urgency === 'due-soon' || t.priority === 'high') return 'bg-gold-gradient'
  return 'bg-rule/50'
}

function Chip({ Icon, className = 'border-rule/60 bg-section text-muted', children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] font-medium capitalize ${className}`}
    >
      {Icon ? <Icon size={12} /> : null}
      {children}
    </span>
  )
}

// A single task as a clickable card: title + a wrapping chip row (assignee, due,
// priority, status, sign-off, source, recurrence) — so nothing gets cut off and
// the list never scrolls sideways. Clicking anywhere opens the detail popup; a
// hover-revealed check completes it inline.
function TaskCard({ t, canEdit, reduce, onOpenDetail, onComplete }) {
  const active = t.status !== 'done' && t.status !== 'cancelled'
  const pr = PRIORITY_META[t.priority] ?? PRIORITY_META.normal
  const badge = APPROVAL_BADGE[t.approvalStatus]
  const open = () => onOpenDetail(t)
  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0 }}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      className="group relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-2xl border border-rule/50 bg-white px-4 py-3.5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
    >
      <span className={`absolute inset-y-2.5 left-0 w-1 rounded-full ${accentClass(t)}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 pl-2">
        <p
          className={`font-semibold leading-snug text-navy ${t.status === 'done' ? 'text-muted line-through' : ''}`}
        >
          {t.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Chip Icon={User}>{assigneeName(t.assignee)}</Chip>
          <UrgencyBadge urgency={t.urgency} dueDate={t.dueDate} daysUntilDue={t.daysUntilDue} />
          <Chip Icon={pr.Icon} className={pr.cls}>
            {t.priority}
          </Chip>
          <Chip>{t.status.replace('_', ' ')}</Chip>
          {badge ? (
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${badge.cls}`}
            >
              {badge.label}
            </span>
          ) : null}
          {t.sourceType && t.sourceType !== 'manual' ? (
            <Chip Icon={Link2} className="border-gold/40 bg-gold/10 text-[#7a5e00]">
              from {t.sourceType}
            </Chip>
          ) : null}
          <RecurrenceBadge recurrence={t.recurrence} seriesId={t.seriesId} />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 self-center">
        {canEdit && active ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onComplete(t.id)
            }}
            aria-label={`Complete ${t.title}`}
            title="Mark complete"
            className="rounded-lg border border-rule/60 p-1.5 text-muted opacity-0 transition hover:border-emerald-400/60 hover:text-emerald-600 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Check size={15} />
          </button>
        ) : null}
        <ChevronRight
          size={18}
          className="text-muted/40 transition group-hover:translate-x-0.5 group-hover:text-gold"
        />
      </div>
    </motion.div>
  )
}

function TasksList({ tasks, loading, error, canEdit, reduce, emptyLabel, onOpenDetail, onComplete }) {
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
    <div className="flex flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            t={t}
            canEdit={canEdit}
            reduce={reduce}
            onOpenDetail={onOpenDetail}
            onComplete={onComplete}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

// ── Task detail popup — a light premium card (distinct from the dark edit form)
// that opens on card click: full description, an at-a-glance detail grid, the
// sign-off timeline, and every action in one place.
function DetailRow({ label, children }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted/80">{label}</p>
      <div className="mt-1 text-[14px] text-navy">{children}</div>
    </div>
  )
}

const detailBtn =
  'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-semibold transition-all'

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
  const canRequest =
    active && (task?.approvalStatus === 'none' || task?.approvalStatus === 'rejected')
  const pr = task ? PRIORITY_META[task.priority] ?? PRIORITY_META.normal : PRIORITY_META.normal
  const badge = task ? APPROVAL_BADGE[task.approvalStatus] : null

  return (
    <AnimatePresence>
      {task && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-navy-deep/55 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={task.title}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[1.4rem] border border-gold/25 bg-cream shadow-[0_30px_66px_-22px_rgba(4,10,26,0.5)]"
          >
            <div className="h-1.5 w-full shrink-0 bg-gold-gradient" />
            <div className="flex items-start gap-3.5 px-6 pb-4 pt-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
                <ListChecks size={20} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2
                  className={`font-serif text-[20px] font-semibold leading-tight text-navy ${task.status === 'done' ? 'opacity-70 line-through' : ''}`}
                >
                  {task.title}
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Chip Icon={pr.Icon} className={pr.cls}>
                    {task.priority}
                  </Chip>
                  <Chip>{task.status.replace('_', ' ')}</Chip>
                  {badge ? (
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg border border-rule/60 p-1.5 text-muted transition-colors hover:border-gold/50 hover:text-navy"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
              {task.description ? (
                <p className="whitespace-pre-wrap rounded-xl border border-rule/40 bg-white px-3.5 py-3 text-[14px] leading-relaxed text-ink">
                  {task.description}
                </p>
              ) : (
                <p className="text-[13.5px] italic text-muted">No description.</p>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                <DetailRow label="Assignee">
                  <span className="inline-flex items-center gap-1.5">
                    <User size={14} className="text-gold" />
                    {assigneeName(task.assignee)}
                  </span>
                </DetailRow>
                <DetailRow label="Due">
                  <UrgencyBadge urgency={task.urgency} dueDate={task.dueDate} daysUntilDue={task.daysUntilDue} />
                </DetailRow>
                {task.sourceType && task.sourceType !== 'manual' ? (
                  <DetailRow label="Source">
                    <span className="inline-flex items-center gap-1 capitalize">
                      <Link2 size={13} className="text-gold" />
                      {task.sourceType}
                    </span>
                  </DetailRow>
                ) : null}
                {task.recurrence && task.recurrence !== 'none' ? (
                  <DetailRow label="Repeats">
                    <span className="capitalize">{task.recurrence}</span>
                  </DetailRow>
                ) : null}
              </div>
              {badge ? (
                <div className="rounded-xl border border-gold/25 bg-gold/[0.05] px-3.5 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#7a5e00]">Sign-off</p>
                  {task.approvalStatus === 'pending' &&
                  task.approver &&
                  !(Array.isArray(task.approvalSteps) && task.approvalSteps.length > 1) ? (
                    <p className="mt-1 text-[13px] text-muted">Approver: {assigneeName(task.approver)}</p>
                  ) : null}
                  <ChainProgress task={task} members={members} />
                  {(task.approvalStatus === 'approved' || task.approvalStatus === 'rejected') && task.decidedBy ? (
                    <p className="mt-1.5 text-[13px] text-muted">Decided by {assigneeName(task.decidedBy)}</p>
                  ) : null}
                  {task.decisionNote ? (
                    <p className="mt-1 text-[13px] italic text-muted">&ldquo;{task.decisionNote}&rdquo;</p>
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
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-rule/50 bg-white/70 px-6 py-3.5">
                {active ? (
                  <button
                    type="button"
                    onClick={() => {
                      onComplete(task.id)
                      onClose()
                    }}
                    className={`${detailBtn} border-emerald-300/70 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
                  >
                    <Check size={15} /> Complete
                  </button>
                ) : null}
                {canRequest ? (
                  <button
                    type="button"
                    onClick={() => {
                      onRequestSignoff(task)
                      onClose()
                    }}
                    className={`${detailBtn} border-gold/50 bg-gold/10 text-[#7a5e00] hover:bg-gold/20`}
                  >
                    <ShieldCheck size={15} /> Request sign-off
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onEdit(task)
                  }}
                  className={`${detailBtn} border-rule/60 bg-white text-navy hover:border-gold/50`}
                >
                  <Pencil size={14} /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(task)
                    onClose()
                  }}
                  className={`${detailBtn} border-rule/60 bg-white text-danger/80 hover:border-danger/50 hover:text-danger`}
                >
                  <Trash2 size={14} /> Delete
                </button>
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
    <TasksList
      tasks={visibleTasks}
      loading={loading}
      error={error}
      canEdit={canEdit}
      reduce={reduce}
      emptyLabel={EMPTY_LABEL[tab] ?? EMPTY_LABEL.all}
      onOpenDetail={setDetailTask}
      onComplete={complete}
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

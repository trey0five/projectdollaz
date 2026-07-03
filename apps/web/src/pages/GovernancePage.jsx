// ─────────────────────────────────────────────────────────────────────────────
// Governance route — the DOMAIN COMMAND CENTER (Phase 3 register, redesigned). A
// LIGHT command-center (matches the Finance home, not the old dark tabbed page):
// Penny lands you on governance's slice of the briefing — the KPIs that define its
// health (policies past review, minutes awaiting sign-off, committees, next
// meeting), the items that need a decision (the attention rail with one-click
// Approve / Draft-agenda actions), with the three registers (Meetings, Committees,
// Policies) a tab away. Built on the reusable DomainCommandCenter scaffold that
// Facilities / Advancement / Accreditation will reuse next.
//
// School-scoped (no period selector). Route stays /governance. Gated by the
// 'governance' module — a finance-only school direct-navving here gets a friendly
// light "module not on your plan" panel (the API 402 → notLicensed). The create /
// edit form modals are kept as dark navy/gold overlays over the light page.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Landmark,
  Pencil,
  Trash2,
  ListPlus,
  X,
  CheckCircle2,
  TrendingDown,
  AlertTriangle,
  Check,
  CalendarClock,
  Clock,
  FileWarning,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter from '../components/domain/DomainCommandCenter.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePolicies } from '../hooks/usePolicies.js'
import { useCommittees } from '../hooks/useCommittees.js'
import { useMeetings } from '../hooks/useMeetings.js'

const STATUSES = ['active', 'draft', 'retired']
const COMMITTEE_KINDS = ['board', 'finance', 'governance', 'advancement', 'academic', 'other']
const MEETING_STATUSES = ['scheduled', 'held', 'cancelled']
const MINUTES_STATUSES = ['none', 'draft', 'pending_approval', 'approved']

// ── Light-theme review badge (restyled from the old dark pills) ──────────────
const REVIEW_BADGE = {
  overdue: { label: 'Overdue', cls: 'border-danger/30 bg-danger/10 text-danger' },
  'due-soon': { label: 'Due soon', cls: 'border-gold/40 bg-gold/10 text-[#7a5e00]' },
  current: { label: 'Current', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' },
  unknown: { label: 'No review date', cls: 'border-rule/60 bg-section text-muted' },
}

function ReviewBadge({ status, nextReviewDate, daysUntilDue }) {
  const b = REVIEW_BADGE[status] ?? REVIEW_BADGE.unknown
  let suffix = ''
  if (status === 'due-soon' && typeof daysUntilDue === 'number') suffix = ` · in ${daysUntilDue}d`
  else if (status === 'overdue' && typeof daysUntilDue === 'number')
    suffix = ` · ${Math.abs(daysUntilDue)}d ago`
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${b.cls}`}
      title={nextReviewDate ? `Next review: ${nextReviewDate}` : 'No adopted or last-reviewed date'}
    >
      {b.label}
      {suffix}
    </span>
  )
}

/** A small light-theme pill (shared idiom for committee active + meeting signals). */
function Pill({ cls, children, title }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${cls}`}
      title={title}
    >
      {children}
    </span>
  )
}

// ── Light-theme register table primitives ────────────────────────────────────
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
  const { onClick, label, title, danger } = props
  const ActionIcon = props.Icon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={`rounded-lg border border-rule/60 p-1.5 text-muted transition hover:text-navy ${
        danger ? 'hover:border-danger/50 hover:text-danger' : 'hover:border-gold/60'
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

// ── Shared dark modal shell (an overlay — deliberately kept dark) ─────────────
function ModalShell({ title, onClose, reduce, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg rounded-2xl border-2 border-gold/30 bg-navy-gradient p-6 shadow-navy-glow"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-[18px] uppercase tracking-[0.12em] text-gold-light">
            {title}
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
        {children}
      </motion.div>
    </div>
  )
}

const inputCls =
  'mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60'

function ModalActions({ saving, onClose, label }) {
  return (
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
        {saving ? 'Saving…' : label}
      </button>
    </div>
  )
}

// ── Light-theme entitlement / license gate ───────────────────────────────────
function GatePanel({ notLicensed }) {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-10 sm:py-8">
      <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
          <Landmark size={26} />
        </span>
        {notLicensed ? (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">
              Governance isn&apos;t on your plan yet
            </h2>
            <p className="max-w-md text-[15px] text-muted">
              Add the Governance module to track board policies, committees, and meetings — and land
              its slice of the briefing here.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">Your subscription is paused</h2>
            <p className="max-w-md text-[15px] text-muted">
              Resume your plan to manage governance records.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════ POLICY MODAL ═══════════════════════════════════

const EMPTY_POLICY = {
  title: '',
  category: '',
  status: 'active',
  owner: '',
  adoptedDate: '',
  lastReviewedDate: '',
  reviewIntervalMonths: 12,
  notes: '',
}

function policyBody(form) {
  return {
    title: form.title.trim(),
    category: form.category.trim(),
    status: form.status,
    owner: form.owner.trim() ? form.owner.trim() : null,
    adoptedDate: form.adoptedDate ? form.adoptedDate : null,
    lastReviewedDate: form.lastReviewedDate ? form.lastReviewedDate : null,
    reviewIntervalMonths: Number(form.reviewIntervalMonths) || 12,
    notes: form.notes.trim() ? form.notes.trim() : null,
  }
}

function PolicyFormModal({ initial, onClose, onSave, reduce }) {
  const [form, setForm] = useState(initial ?? EMPTY_POLICY)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || !form.category.trim()) {
      setErr('Title and category are required.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onSave(policyBody(form))
      onClose()
    } catch {
      setErr('Could not save this policy.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={initial ? 'Edit policy' : 'Add policy'} onClose={onClose} reduce={reduce}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block text-[13px] text-white/70">
            Title
            <input value={form.title} onChange={set('title')} maxLength={200} className={inputCls} />
          </label>
          <label className="block text-[13px] text-white/70">
            Category
            <input
              value={form.category}
              onChange={set('category')}
              maxLength={80}
              placeholder="e.g. Financial, HR, Safety"
              className={inputCls}
            />
          </label>
          <label className="block text-[13px] text-white/70">
            Status
            <select value={form.status} onChange={set('status')} className={inputCls}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[13px] text-white/70">
            Owner
            <input value={form.owner} onChange={set('owner')} maxLength={200} className={inputCls} />
          </label>
          <label className="block text-[13px] text-white/70">
            Review every (months)
            <input
              type="number"
              min={1}
              max={120}
              value={form.reviewIntervalMonths}
              onChange={set('reviewIntervalMonths')}
              className={inputCls}
            />
          </label>
          <label className="block text-[13px] text-white/70">
            Adopted date
            <input type="date" value={form.adoptedDate} onChange={set('adoptedDate')} className={inputCls} />
          </label>
          <label className="block text-[13px] text-white/70">
            Last reviewed
            <input
              type="date"
              value={form.lastReviewedDate}
              onChange={set('lastReviewedDate')}
              className={inputCls}
            />
          </label>
          <label className="col-span-2 block text-[13px] text-white/70">
            Notes
            <textarea
              value={form.notes}
              onChange={set('notes')}
              maxLength={4000}
              rows={2}
              className={inputCls}
            />
          </label>
        </div>
        {err ? <p className="text-[13px] text-red-300">{err}</p> : null}
        <ModalActions saving={saving} onClose={onClose} label="Save policy" />
      </form>
    </ModalShell>
  )
}

// ═══════════════════════════ COMMITTEE MODAL ════════════════════════════════

const EMPTY_COMMITTEE = { name: '', kind: 'board', chair: '', description: '', active: true }

function committeeBody(form) {
  return {
    name: form.name.trim(),
    kind: form.kind || 'other',
    chair: form.chair.trim() ? form.chair.trim() : null,
    description: form.description.trim() ? form.description.trim() : null,
    active: !!form.active,
  }
}

function CommitteeFormModal({ initial, onClose, onSave, reduce }) {
  const [form, setForm] = useState(initial ?? EMPTY_COMMITTEE)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setErr('Name is required.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onSave(committeeBody(form))
      onClose()
    } catch {
      setErr('Could not save this committee.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={initial ? 'Edit committee' : 'Add committee'} onClose={onClose} reduce={reduce}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block text-[13px] text-white/70">
            Name
            <input value={form.name} onChange={set('name')} maxLength={200} className={inputCls} />
          </label>
          <label className="block text-[13px] text-white/70">
            Kind
            <select value={form.kind} onChange={set('kind')} className={inputCls}>
              {COMMITTEE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[13px] text-white/70">
            Chair
            <input value={form.chair} onChange={set('chair')} maxLength={200} className={inputCls} />
          </label>
          <label className="col-span-2 block text-[13px] text-white/70">
            Description
            <textarea
              value={form.description}
              onChange={set('description')}
              maxLength={2000}
              rows={2}
              className={inputCls}
            />
          </label>
          <label className="col-span-2 flex items-center gap-2 text-[13px] text-white/70">
            <input
              type="checkbox"
              checked={!!form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              className="h-4 w-4 rounded border-white/30 bg-navy/40"
            />
            Active
          </label>
        </div>
        {err ? <p className="text-[13px] text-red-300">{err}</p> : null}
        <ModalActions saving={saving} onClose={onClose} label="Save committee" />
      </form>
    </ModalShell>
  )
}

// ═══════════════════════════ MEETING MODAL ══════════════════════════════════

const EMPTY_MEETING = {
  title: '',
  committeeId: '',
  scheduledAt: '',
  location: '',
  status: 'scheduled',
  agenda: '',
  minutes: '',
  decisions: '',
  minutesStatus: 'none',
}

function meetingBody(form) {
  return {
    title: form.title.trim(),
    committeeId: form.committeeId ? form.committeeId : null,
    scheduledAt: form.scheduledAt ? form.scheduledAt : undefined,
    location: form.location.trim() ? form.location.trim() : null,
    status: form.status,
    agenda: form.agenda.trim() ? form.agenda.trim() : null,
    minutes: form.minutes.trim() ? form.minutes.trim() : null,
    decisions: form.decisions.trim() ? form.decisions.trim() : null,
    minutesStatus: form.minutesStatus,
  }
}

function MeetingFormModal({ initial, committees, onClose, onSave, reduce }) {
  const [form, setForm] = useState(initial ?? EMPTY_MEETING)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || !form.scheduledAt) {
      setErr('Title and a meeting date are required.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onSave(meetingBody(form))
      onClose()
    } catch {
      setErr('Could not save this meeting.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={initial ? 'Edit meeting' : 'Add meeting'} onClose={onClose} reduce={reduce}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block text-[13px] text-white/70">
            Title
            <input value={form.title} onChange={set('title')} maxLength={200} className={inputCls} />
          </label>
          <label className="block text-[13px] text-white/70">
            Committee
            <select value={form.committeeId} onChange={set('committeeId')} className={inputCls}>
              <option value="">— none —</option>
              {committees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[13px] text-white/70">
            Meeting date
            <input type="date" value={form.scheduledAt} onChange={set('scheduledAt')} className={inputCls} />
          </label>
          <label className="block text-[13px] text-white/70">
            Location
            <input value={form.location} onChange={set('location')} maxLength={200} className={inputCls} />
          </label>
          <label className="block text-[13px] text-white/70">
            Status
            <select value={form.status} onChange={set('status')} className={inputCls}>
              {MEETING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 block text-[13px] text-white/70">
            Agenda
            <textarea value={form.agenda} onChange={set('agenda')} maxLength={20000} rows={2} className={inputCls} />
          </label>
          <label className="col-span-2 block text-[13px] text-white/70">
            Minutes
            <textarea value={form.minutes} onChange={set('minutes')} maxLength={20000} rows={2} className={inputCls} />
          </label>
          <label className="col-span-2 block text-[13px] text-white/70">
            Decisions
            <textarea
              value={form.decisions}
              onChange={set('decisions')}
              maxLength={20000}
              rows={2}
              className={inputCls}
            />
          </label>
          <label className="block text-[13px] text-white/70">
            Minutes status
            <select value={form.minutesStatus} onChange={set('minutesStatus')} className={inputCls}>
              {MINUTES_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
        </div>
        {err ? <p className="text-[13px] text-red-300">{err}</p> : null}
        <ModalActions saving={saving} onClose={onClose} label="Save meeting" />
      </form>
    </ModalShell>
  )
}

// ═══════════════════════════ LIGHT REGISTER TABLES ══════════════════════════

function PoliciesTable({ policies, loading, error, canEdit, reduce, onEdit, onDelete, onMakeTask }) {
  if (loading) return <StateRow><p className="text-[14px] text-muted">Loading policies…</p></StateRow>
  if (error)
    return (
      <StateRow>
        <p className="text-[14px] text-danger">{error}</p>
      </StateRow>
    )
  if (policies.length === 0)
    return (
      <StateRow>
        <p className="font-serif text-[16px] italic text-muted">No policies yet.</p>
        <p className="mt-1 text-[13px] text-muted">Add your first policy to start tracking review cycles.</p>
      </StateRow>
    )

  return (
    <TableShell
      cols={
        <>
          <Th>Policy</Th>
          <Th>Category</Th>
          <Th>Owner</Th>
          <Th>Status</Th>
          <Th>Review</Th>
          {canEdit ? <Th right>Actions</Th> : null}
        </>
      }
    >
      <AnimatePresence initial={false}>
        {policies.map((p) => (
          <motion.tr
            key={p.id}
            layout={!reduce}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            className="group border-t border-rule/50"
          >
            <td className="px-4 py-3 font-semibold text-navy">{p.title}</td>
            <td className="px-4 py-3 text-muted">{p.category}</td>
            <td className="px-4 py-3 text-muted">{p.owner ?? '—'}</td>
            <td className="px-4 py-3">
              <span className="rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[12px] capitalize text-muted">
                {p.status}
              </span>
            </td>
            <td className="px-4 py-3">
              <ReviewBadge
                status={p.reviewStatus}
                nextReviewDate={p.nextReviewDate}
                daysUntilDue={p.daysUntilDue}
              />
            </td>
            {canEdit ? (
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1.5 opacity-60 transition group-hover:opacity-100">
                  {p.reviewStatus === 'overdue' || p.reviewStatus === 'due-soon' ? (
                    <IconAction
                      Icon={ListPlus}
                      onClick={() => onMakeTask(p)}
                      label={`Create task to review ${p.title}`}
                      title="Create a task to review this policy"
                    />
                  ) : null}
                  <IconAction Icon={Pencil} onClick={() => onEdit(p)} label={`Edit ${p.title}`} />
                  <IconAction Icon={Trash2} danger onClick={() => onDelete(p)} label={`Delete ${p.title}`} />
                </div>
              </td>
            ) : null}
          </motion.tr>
        ))}
      </AnimatePresence>
    </TableShell>
  )
}

function CommitteesTable({ committees, loading, error, canEdit, reduce, onEdit, onDelete }) {
  if (loading) return <StateRow><p className="text-[14px] text-muted">Loading committees…</p></StateRow>
  if (error)
    return (
      <StateRow>
        <p className="text-[14px] text-danger">{error}</p>
      </StateRow>
    )
  if (committees.length === 0)
    return (
      <StateRow>
        <p className="font-serif text-[16px] italic text-muted">No committees yet.</p>
        <p className="mt-1 text-[13px] text-muted">Add a committee to organize your meetings.</p>
      </StateRow>
    )

  return (
    <TableShell
      cols={
        <>
          <Th>Committee</Th>
          <Th>Kind</Th>
          <Th>Chair</Th>
          <Th>Status</Th>
          {canEdit ? <Th right>Actions</Th> : null}
        </>
      }
    >
      <AnimatePresence initial={false}>
        {committees.map((c) => (
          <motion.tr
            key={c.id}
            layout={!reduce}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            className="group border-t border-rule/50"
          >
            <td className="px-4 py-3 font-semibold text-navy">{c.name}</td>
            <td className="px-4 py-3">
              <span className="rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[12px] capitalize text-muted">
                {c.kind}
              </span>
            </td>
            <td className="px-4 py-3 text-muted">{c.chair ?? '—'}</td>
            <td className="px-4 py-3">
              {c.active ? (
                <Pill cls="border-emerald-300/70 bg-emerald-50 text-emerald-700">Active</Pill>
              ) : (
                <Pill cls="border-rule/60 bg-section text-muted">Inactive</Pill>
              )}
            </td>
            {canEdit ? (
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1.5 opacity-60 transition group-hover:opacity-100">
                  <IconAction Icon={Pencil} onClick={() => onEdit(c)} label={`Edit ${c.name}`} />
                  <IconAction Icon={Trash2} danger onClick={() => onDelete(c)} label={`Delete ${c.name}`} />
                </div>
              </td>
            ) : null}
          </motion.tr>
        ))}
      </AnimatePresence>
    </TableShell>
  )
}

function MeetingsTable({
  meetings,
  loading,
  error,
  canEdit,
  reduce,
  onEdit,
  onDelete,
  onApprove,
}) {
  if (loading) return <StateRow><p className="text-[14px] text-muted">Loading meetings…</p></StateRow>
  if (error)
    return (
      <StateRow>
        <p className="text-[14px] text-danger">{error}</p>
      </StateRow>
    )
  if (meetings.length === 0)
    return (
      <StateRow>
        <p className="font-serif text-[16px] italic text-muted">No meetings yet.</p>
        <p className="mt-1 text-[13px] text-muted">Schedule a meeting to track its agenda and minutes.</p>
      </StateRow>
    )

  return (
    <TableShell
      cols={
        <>
          <Th>Meeting</Th>
          <Th>Committee</Th>
          <Th>Date</Th>
          <Th>Status</Th>
          <Th>Signals</Th>
          {canEdit ? <Th right>Actions</Th> : null}
        </>
      }
    >
      <AnimatePresence initial={false}>
        {meetings.map((m) => (
          <motion.tr
            key={m.id}
            layout={!reduce}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            className="group border-t border-rule/50"
          >
            <td className="px-4 py-3 font-semibold text-navy">{m.title}</td>
            <td className="px-4 py-3 text-muted">{m.committeeName ?? '—'}</td>
            <td className="px-4 py-3 text-muted">{m.scheduledAt ?? '—'}</td>
            <td className="px-4 py-3">
              <span className="rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[12px] capitalize text-muted">
                {m.status}
              </span>
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1.5">
                {m.agendaMissing ? (
                  <Pill cls="border-gold/40 bg-gold/10 text-[#7a5e00]">Agenda due</Pill>
                ) : null}
                {m.minutesOverdue ? (
                  <Pill cls="border-danger/30 bg-danger/10 text-danger">Minutes overdue</Pill>
                ) : m.minutesPending ? (
                  <Pill cls="border-gold/40 bg-gold/10 text-[#7a5e00]">Minutes pending</Pill>
                ) : null}
                {m.minutesStatus === 'approved' ? (
                  <Pill cls="border-emerald-300/70 bg-emerald-50 text-emerald-700">Minutes approved</Pill>
                ) : null}
                {!m.agendaMissing &&
                !m.minutesPending &&
                !m.minutesOverdue &&
                m.minutesStatus !== 'approved' ? (
                  <span className="text-[12px] text-muted/60">—</span>
                ) : null}
              </div>
            </td>
            {canEdit ? (
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1.5 opacity-60 transition group-hover:opacity-100">
                  {m.minutesStatus === 'pending_approval' ? (
                    <button
                      type="button"
                      onClick={() => onApprove(m.id)}
                      aria-label={`Mark minutes approved for ${m.title}`}
                      title="Mark minutes approved"
                      className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-emerald-400/60 hover:text-emerald-600"
                    >
                      <CheckCircle2 size={15} />
                    </button>
                  ) : null}
                  <IconAction Icon={Pencil} onClick={() => onEdit(m)} label={`Edit ${m.title}`} />
                  <IconAction Icon={Trash2} danger onClick={() => onDelete(m)} label={`Delete ${m.title}`} />
                </div>
              </td>
            ) : null}
          </motion.tr>
        ))}
      </AnimatePresence>
    </TableShell>
  )
}

// ── Short "Jul 6" date from a yyyy-mm-dd string (UTC-safe, no tz drift). ──────
function shortDate(iso) {
  if (!iso) return null
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

const TABS = [
  { key: 'meetings', label: 'Meetings' },
  { key: 'committees', label: 'Committees' },
  { key: 'policies', label: 'Policies' },
]

// ═══════════════════════════ PAGE ═══════════════════════════════════════════

function GovernanceWorkspace() {
  const navigate = useNavigate()
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()

  const policiesHook = usePolicies(schoolId)
  const committeesHook = useCommittees(schoolId)
  const meetingsHook = useMeetings(schoolId)

  const { policies } = policiesHook
  const { committees } = committeesHook
  const { meetings, summary, approveMinutes } = meetingsHook

  const [tab, setTab] = useState('meetings')
  const [modal, setModal] = useState(null) // { type, entity } | null

  const openCreate = (type) => setModal({ type, entity: null })
  const openEdit = (type, entity) => setModal({ type, entity })
  const closeModal = () => setModal(null)

  const createTaskFromPolicy = (p) => {
    const today = new Date().toISOString().slice(0, 10)
    const futureDue = p.nextReviewDate && p.nextReviewDate > today ? p.nextReviewDate : ''
    navigate('/tasks', {
      state: {
        prefill: {
          title: `Review policy: ${p.title}`,
          sourceType: 'policy',
          sourceRef: p.id,
          dueDate: futureDue,
        },
      },
    })
  }

  const onDeletePolicy = async (p) => {
    if (window.confirm(`Delete "${p.title}"? This cannot be undone.`)) await policiesHook.remove(p.id)
  }
  const onDeleteCommittee = async (c) => {
    if (window.confirm(`Delete "${c.name}"? Its meetings are kept but detached.`))
      await committeesHook.remove(c.id)
  }
  const onDeleteMeeting = async (m) => {
    if (window.confirm(`Delete "${m.title}"? This cannot be undone.`)) await meetingsHook.remove(m.id)
  }

  // ── KPIs (computed from the hooks) ─────────────────────────────────────────
  const kpis = useMemo(() => {
    // Policies past review.
    const total = policies.length
    const overdue = policies.filter((p) => p.reviewStatus === 'overdue').length
    const dueSoon = policies.filter((p) => p.reviewStatus === 'due-soon').length
    const flagged = overdue + dueSoon
    const policiesKpi = {
      label: 'Policies past review',
      value: `${flagged}/${total}`,
      status: overdue > 0 ? 'risk' : dueSoon > 0 ? 'watch' : 'good',
      sub:
        overdue > 0
          ? { icon: TrendingDown, text: `${overdue} overdue`, tone: 'bad' }
          : dueSoon > 0
            ? { icon: Clock, text: `${dueSoon} due soon`, tone: 'neutral' }
            : { icon: Check, text: 'all current', tone: 'good' },
    }

    // Minutes awaiting sign-off.
    const pending = summary.minutesPendingCount ?? 0
    const minutesOverdue = summary.minutesOverdueCount ?? 0
    const minutesKpi = {
      label: 'Minutes awaiting sign-off',
      value: minutesOverdue > 0 ? `${pending} · ${minutesOverdue} overdue` : String(pending),
      status: minutesOverdue > 0 ? 'risk' : pending > 0 ? 'watch' : 'good',
      sub:
        minutesOverdue > 0
          ? { icon: AlertTriangle, text: `${minutesOverdue} overdue`, tone: 'bad' }
          : pending > 0
            ? { icon: Clock, text: 'awaiting approval', tone: 'neutral' }
            : { icon: Check, text: 'all signed off', tone: 'good' },
    }

    // Committees.
    const active = committees.filter((c) => c.active)
    const noChair = active.filter((c) => !c.chair).length
    const committeesKpi = {
      label: 'Committees',
      value: String(active.length),
      status: noChair > 0 ? 'watch' : 'good',
      sub:
        noChair > 0
          ? { icon: AlertTriangle, text: `${noChair} without a chair`, tone: 'neutral' }
          : { icon: Check, text: 'all staffed', tone: 'good' },
    }

    // Next meeting.
    const nextIso = summary.nextMeetingAt
    const nextMeeting = nextIso
      ? meetings.find((m) => m.isUpcoming && m.scheduledAt === nextIso) ??
        meetings.find((m) => m.scheduledAt === nextIso)
      : null
    const noAgenda = nextMeeting ? nextMeeting.agendaMissing : false
    const nextKpi = {
      label: 'Next meeting',
      value: nextIso ? (shortDate(nextIso) ?? '—') : 'None scheduled',
      status: !nextIso ? 'good' : noAgenda ? 'watch' : 'good',
      sub: !nextIso
        ? { icon: CalendarClock, text: 'nothing on the calendar', tone: 'neutral' }
        : noAgenda
          ? {
              icon: FileWarning,
              text: `${nextMeeting?.committeeName ?? 'Meeting'} · no agenda yet`,
              tone: 'neutral',
            }
          : {
              icon: Check,
              text: `${nextMeeting?.committeeName ?? 'Meeting'} · agenda ready`,
              tone: 'good',
            },
    }

    return [policiesKpi, minutesKpi, committeesKpi, nextKpi]
  }, [policies, committees, meetings, summary])

  // ── Needs-attention items (most-urgent first, capped at 6) ─────────────────
  const attentionItems = useMemo(() => {
    const items = []

    // 1) Minutes awaiting sign-off (overdue first).
    const pendingMeetings = meetings
      .filter((m) => m.minutesPending || m.minutesOverdue)
      .sort((a, b) => (b.minutesOverdue ? 1 : 0) - (a.minutesOverdue ? 1 : 0))
    for (const m of pendingMeetings) {
      items.push({
        id: `minutes-${m.id}`,
        tone: m.minutesOverdue ? 'risk' : 'watch',
        sortKey: m.minutesOverdue ? 0 : 2,
        title: `${m.title} minutes await sign-off`,
        why: m.minutesOverdue
          ? 'You are the current approver · past the sign-off SLA'
          : 'You are the current approver · awaiting your approval',
        actions:
          canEdit && m.minutesStatus === 'pending_approval'
            ? [
                {
                  label: 'Approve',
                  primary: true,
                  onClick: () => approveMinutes(m.id),
                },
              ]
            : [],
      })
    }

    // 2) Upcoming meetings missing an agenda within the soon window.
    const needAgenda = meetings.filter((m) => m.isUpcoming && m.agendaMissing)
    for (const m of needAgenda) {
      const days = typeof m.daysUntilMeeting === 'number' ? m.daysUntilMeeting : null
      items.push({
        id: `agenda-${m.id}`,
        tone: 'watch',
        sortKey: 1,
        title: `${m.committeeName ?? m.title} needs an agenda`,
        why: days != null ? `Meets in ${days} day${days === 1 ? '' : 's'} · no agenda posted` : 'No agenda posted',
        actions: canEdit
          ? [{ label: 'Draft agenda', primary: false, onClick: () => openEdit('meeting', m) }]
          : [],
      })
    }

    // 3) Policies overdue on their review cycle.
    const overduePolicies = policies.filter((p) => p.reviewStatus === 'overdue')
    for (const p of overduePolicies) {
      const days = typeof p.daysUntilDue === 'number' ? Math.abs(p.daysUntilDue) : null
      items.push({
        id: `policy-${p.id}`,
        tone: 'risk',
        sortKey: 0,
        title: `${p.title} review`,
        why: days != null ? `${days} day${days === 1 ? '' : 's'} overdue on its annual cycle` : 'Overdue on its review cycle',
        actions: [
          {
            label: 'Review',
            primary: false,
            onClick: () => {
              setTab('policies')
              openEdit('policy', p)
            },
          },
        ],
      })
    }

    return items.sort((a, b) => a.sortKey - b.sortKey).slice(0, 6)
  }, [meetings, policies, canEdit, approveMinutes])

  // ── Gate (shared across all three registers) ───────────────────────────────
  const notLicensed =
    policiesHook.notLicensed || committeesHook.notLicensed || meetingsHook.notLicensed
  const notEntitled =
    policiesHook.notEntitled || committeesHook.notEntitled || meetingsHook.notEntitled
  if (notLicensed || notEntitled) return <GatePanel notLicensed={notLicensed} />

  // ── Active register table ──────────────────────────────────────────────────
  let registerTable = null
  if (tab === 'meetings')
    registerTable = (
      <MeetingsTable
        meetings={meetings}
        loading={meetingsHook.loading}
        error={meetingsHook.error}
        canEdit={canEdit}
        reduce={reduce}
        onEdit={(m) => openEdit('meeting', m)}
        onDelete={onDeleteMeeting}
        onApprove={approveMinutes}
      />
    )
  else if (tab === 'committees')
    registerTable = (
      <CommitteesTable
        committees={committees}
        loading={committeesHook.loading}
        error={committeesHook.error}
        canEdit={canEdit}
        reduce={reduce}
        onEdit={(c) => openEdit('committee', c)}
        onDelete={onDeleteCommittee}
      />
    )
  else
    registerTable = (
      <PoliciesTable
        policies={policies}
        loading={policiesHook.loading}
        error={policiesHook.error}
        canEdit={canEdit}
        reduce={reduce}
        onEdit={(p) => openEdit('policy', p)}
        onDelete={onDeletePolicy}
        onMakeTask={createTaskFromPolicy}
      />
    )

  const onNew = canEdit
    ? () => openCreate(tab === 'meetings' ? 'meeting' : tab === 'committees' ? 'committee' : 'policy')
    : null

  const savePolicy = async (body) => {
    if (modal?.entity) await policiesHook.update(modal.entity.id, body)
    else await policiesHook.create(body)
  }
  const saveCommittee = async (body) => {
    if (modal?.entity) await committeesHook.update(modal.entity.id, body)
    else await committeesHook.create(body)
  }
  const saveMeeting = async (body) => {
    if (modal?.entity) await meetingsHook.update(modal.entity.id, body)
    else await meetingsHook.create(body)
  }

  const policyInitial = modal?.entity
    ? {
        title: modal.entity.title ?? '',
        category: modal.entity.category ?? '',
        status: modal.entity.status ?? 'active',
        owner: modal.entity.owner ?? '',
        adoptedDate: modal.entity.adoptedDate ?? '',
        lastReviewedDate: modal.entity.lastReviewedDate ?? '',
        reviewIntervalMonths: modal.entity.reviewIntervalMonths ?? 12,
        notes: modal.entity.notes ?? '',
      }
    : null
  const committeeInitial = modal?.entity
    ? {
        name: modal.entity.name ?? '',
        kind: modal.entity.kind ?? 'other',
        chair: modal.entity.chair ?? '',
        description: modal.entity.description ?? '',
        active: modal.entity.active ?? true,
      }
    : null
  const meetingInitial = modal?.entity
    ? {
        title: modal.entity.title ?? '',
        committeeId: modal.entity.committeeId ?? '',
        scheduledAt: modal.entity.scheduledAt ?? '',
        location: modal.entity.location ?? '',
        status: modal.entity.status ?? 'scheduled',
        agenda: modal.entity.agenda ?? '',
        minutes: modal.entity.minutes ?? '',
        decisions: modal.entity.decisions ?? '',
        minutesStatus: modal.entity.minutesStatus ?? 'none',
      }
    : null

  return (
    <>
      <DomainCommandCenter
        eyebrow="Domain · Govern engine · system of record"
        title="Governance"
        Icon={Landmark}
        attentionCount={attentionItems.length}
        kpis={kpis}
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        onNew={onNew}
        registerTable={registerTable}
        attentionItems={attentionItems}
      />

      {modal?.type === 'policy' ? (
        <PolicyFormModal
          key={modal.entity ? modal.entity.id : 'new'}
          initial={policyInitial}
          onClose={closeModal}
          onSave={savePolicy}
          reduce={reduce}
        />
      ) : null}
      {modal?.type === 'committee' ? (
        <CommitteeFormModal
          key={modal.entity ? modal.entity.id : 'new'}
          initial={committeeInitial}
          onClose={closeModal}
          onSave={saveCommittee}
          reduce={reduce}
        />
      ) : null}
      {modal?.type === 'meeting' ? (
        <MeetingFormModal
          key={modal.entity ? modal.entity.id : 'new'}
          initial={meetingInitial}
          committees={committees}
          onClose={closeModal}
          onSave={saveMeeting}
          reduce={reduce}
        />
      ) : null}
    </>
  )
}

export default function GovernancePage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <GovernanceWorkspace />
    </div>
  )
}

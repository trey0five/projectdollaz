// ─────────────────────────────────────────────────────────────────────────────
// Governance route (Phase 3): AppShell chrome + the governance module surfaced as
// TABS — Policies (the review register), Committees, and Meetings (agenda /
// minutes / decisions / minutes-approval). School-scoped (no period selector).
// Gated by the 'governance' module — the nav item is hidden by hasModule, but a
// direct-nav for a finance-only school renders a friendly "module not on your
// plan" panel (the API 402 → notLicensed) shown ONCE at page level.
// Navy/gold theme, flashy tab underline, reduced-motion safe, no setState-in-effect.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Landmark,
  Plus,
  Pencil,
  Trash2,
  ListPlus,
  X,
  Users,
  CalendarDays,
  CheckCircle2,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePolicies } from '../hooks/usePolicies.js'
import { useCommittees } from '../hooks/useCommittees.js'
import { useMeetings } from '../hooks/useMeetings.js'

const STATUSES = ['active', 'draft', 'retired']
const COMMITTEE_KINDS = ['board', 'finance', 'governance', 'advancement', 'academic', 'other']
const MEETING_STATUSES = ['scheduled', 'held', 'cancelled']
const MINUTES_STATUSES = ['none', 'draft', 'pending_approval', 'approved']

const REVIEW_BADGE = {
  overdue: { label: 'Overdue', cls: 'border-red-400/50 bg-red-500/15 text-red-200' },
  'due-soon': { label: 'Due soon', cls: 'border-amber-400/50 bg-amber-500/15 text-amber-200' },
  current: { label: 'Current', cls: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' },
  unknown: { label: 'No review date', cls: 'border-white/20 bg-white/5 text-white/50' },
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

/** A small pill (shared idiom for committee active + meeting status / signal badges). */
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

// ── Shared modal shell (navy/gold, reduced-motion safe) ──────────────────────
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

// ── Shared empty/loading/error/locked states so all three tabs render alike ──
function GatePanel({ notLicensed, notEntitled }) {
  if (notLicensed)
    return (
      <div className="rounded-2xl border-2 border-gold/30 bg-navy/30 p-8 text-center">
        <p className="text-[15px] text-white/80">
          The Governance module isn&apos;t on your plan yet.
        </p>
        <p className="mt-1 text-[13px] text-white/55">
          Add Governance to track board policies, committees, and meetings.
        </p>
      </div>
    )
  if (notEntitled)
    return (
      <div className="rounded-2xl border-2 border-gold/30 bg-navy/30 p-8 text-center">
        <p className="text-[15px] text-white/80">Your subscription is paused.</p>
        <p className="mt-1 text-[13px] text-white/55">
          Resume your plan to manage governance records.
        </p>
      </div>
    )
  return null
}

// ═══════════════════════════ POLICIES TAB ═══════════════════════════════════

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

function PoliciesPanel({ schoolId, canEdit, reduce, gate }) {
  const navigate = useNavigate()
  const { policies, loading, error, create, update, remove } = usePolicies(schoolId)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

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

  const openAdd = () => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (p) => {
    setEditing(p)
    setModalOpen(true)
  }
  const initialForm = useMemo(() => {
    if (!editing) return null
    return {
      title: editing.title ?? '',
      category: editing.category ?? '',
      status: editing.status ?? 'active',
      owner: editing.owner ?? '',
      adoptedDate: editing.adoptedDate ?? '',
      lastReviewedDate: editing.lastReviewedDate ?? '',
      reviewIntervalMonths: editing.reviewIntervalMonths ?? 12,
      notes: editing.notes ?? '',
    }
  }, [editing])

  const onSave = async (body) => {
    if (editing) await update(editing.id, body)
    else await create(body)
  }
  const onDelete = async (p) => {
    if (window.confirm(`Delete "${p.title}"? This cannot be undone.`)) await remove(p.id)
  }

  if (gate) return gate

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] text-white/60">Your standing policies and their review cycles.</p>
        {canEdit ? (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-gold/60 bg-gold/15 px-4 py-2 text-[14px] font-semibold text-gold-light hover:bg-gold/25"
          >
            <Plus size={16} /> Add policy
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-2xl border-2 border-white/10 bg-navy/30 p-8 text-center text-white/50">
          Loading policies…
        </div>
      ) : error ? (
        <div className="rounded-2xl border-2 border-red-400/30 bg-red-500/10 p-6 text-center text-red-200">
          {error}
        </div>
      ) : policies.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-white/20 bg-navy/30 p-10 text-center">
          <p className="text-[15px] text-white/80">No policies yet.</p>
          <p className="mt-1 text-[13px] text-white/55">
            Add your first policy to start tracking review cycles.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border-2 border-gold/20">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-navy/50 text-[12px] uppercase tracking-[0.08em] text-white/50">
              <tr>
                <th className="px-4 py-3">Policy</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Review</th>
                {canEdit ? <th className="px-4 py-3 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {policies.map((p) => (
                  <motion.tr
                    key={p.id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                    className="border-t border-white/10 text-white/85"
                  >
                    <td className="px-4 py-3 font-semibold text-white">{p.title}</td>
                    <td className="px-4 py-3 text-white/70">{p.category}</td>
                    <td className="px-4 py-3 text-white/70">{p.owner ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-white/20 bg-white/5 px-2 py-0.5 text-[12px] capitalize text-white/70">
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
                        <div className="flex justify-end gap-1.5">
                          {p.reviewStatus === 'overdue' || p.reviewStatus === 'due-soon' ? (
                            <button
                              type="button"
                              onClick={() => createTaskFromPolicy(p)}
                              aria-label={`Create task to review ${p.title}`}
                              title="Create a task to review this policy"
                              className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-gold/60 hover:text-gold-light"
                            >
                              <ListPlus size={15} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            aria-label={`Edit ${p.title}`}
                            className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-gold/60 hover:text-white"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(p)}
                            aria-label={`Delete ${p.title}`}
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

      {modalOpen ? (
        <PolicyFormModal
          key={editing ? editing.id : 'new'}
          initial={initialForm}
          onClose={() => setModalOpen(false)}
          onSave={onSave}
          reduce={reduce}
        />
      ) : null}
    </div>
  )
}

// ═══════════════════════════ COMMITTEES TAB ═════════════════════════════════

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

function CommitteesPanel({ committeesHook, canEdit, reduce, gate }) {
  const { committees, loading, error, create, update, remove } = committeesHook
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const openAdd = () => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (c) => {
    setEditing(c)
    setModalOpen(true)
  }
  const initialForm = useMemo(() => {
    if (!editing) return null
    return {
      name: editing.name ?? '',
      kind: editing.kind ?? 'other',
      chair: editing.chair ?? '',
      description: editing.description ?? '',
      active: editing.active ?? true,
    }
  }, [editing])

  const onSave = async (body) => {
    if (editing) await update(editing.id, body)
    else await create(body)
  }
  const onDelete = async (c) => {
    if (window.confirm(`Delete "${c.name}"? Its meetings are kept but detached.`)) await remove(c.id)
  }

  if (gate) return gate

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] text-white/60">
          Your committees — meetings can be filed under one.
        </p>
        {canEdit ? (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-gold/60 bg-gold/15 px-4 py-2 text-[14px] font-semibold text-gold-light hover:bg-gold/25"
          >
            <Plus size={16} /> Add committee
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-2xl border-2 border-white/10 bg-navy/30 p-8 text-center text-white/50">
          Loading committees…
        </div>
      ) : error ? (
        <div className="rounded-2xl border-2 border-red-400/30 bg-red-500/10 p-6 text-center text-red-200">
          {error}
        </div>
      ) : committees.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-white/20 bg-navy/30 p-10 text-center">
          <p className="text-[15px] text-white/80">No committees yet.</p>
          <p className="mt-1 text-[13px] text-white/55">Add a committee to organize your meetings.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border-2 border-gold/20">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-navy/50 text-[12px] uppercase tracking-[0.08em] text-white/50">
              <tr>
                <th className="px-4 py-3">Committee</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Chair</th>
                <th className="px-4 py-3">Status</th>
                {canEdit ? <th className="px-4 py-3 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {committees.map((c) => (
                  <motion.tr
                    key={c.id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                    className="border-t border-white/10 text-white/85"
                  >
                    <td className="px-4 py-3 font-semibold text-white">{c.name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-white/20 bg-white/5 px-2 py-0.5 text-[12px] capitalize text-white/70">
                        {c.kind}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/70">{c.chair ?? '—'}</td>
                    <td className="px-4 py-3">
                      {c.active ? (
                        <Pill cls="border-emerald-400/50 bg-emerald-500/15 text-emerald-200">Active</Pill>
                      ) : (
                        <Pill cls="border-white/20 bg-white/5 text-white/50">Inactive</Pill>
                      )}
                    </td>
                    {canEdit ? (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            aria-label={`Edit ${c.name}`}
                            className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-gold/60 hover:text-white"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(c)}
                            aria-label={`Delete ${c.name}`}
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

      {modalOpen ? (
        <CommitteeFormModal
          key={editing ? editing.id : 'new'}
          initial={initialForm}
          onClose={() => setModalOpen(false)}
          onSave={onSave}
          reduce={reduce}
        />
      ) : null}
    </div>
  )
}

// ═══════════════════════════ MEETINGS TAB ═══════════════════════════════════

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

function MeetingsPanel({ meetingsHook, committees, canEdit, reduce, gate }) {
  const { meetings, loading, error, create, update, remove, approveMinutes } = meetingsHook
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const openAdd = () => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (m) => {
    setEditing(m)
    setModalOpen(true)
  }
  const initialForm = useMemo(() => {
    if (!editing) return null
    return {
      title: editing.title ?? '',
      committeeId: editing.committeeId ?? '',
      scheduledAt: editing.scheduledAt ?? '',
      location: editing.location ?? '',
      status: editing.status ?? 'scheduled',
      agenda: editing.agenda ?? '',
      minutes: editing.minutes ?? '',
      decisions: editing.decisions ?? '',
      minutesStatus: editing.minutesStatus ?? 'none',
    }
  }, [editing])

  const onSave = async (body) => {
    if (editing) await update(editing.id, body)
    else await create(body)
  }
  const onDelete = async (m) => {
    if (window.confirm(`Delete "${m.title}"? This cannot be undone.`)) await remove(m.id)
  }

  if (gate) return gate

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] text-white/60">
          Board and committee meetings — agenda, minutes, decisions, approvals.
        </p>
        {canEdit ? (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-gold/60 bg-gold/15 px-4 py-2 text-[14px] font-semibold text-gold-light hover:bg-gold/25"
          >
            <Plus size={16} /> Add meeting
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-2xl border-2 border-white/10 bg-navy/30 p-8 text-center text-white/50">
          Loading meetings…
        </div>
      ) : error ? (
        <div className="rounded-2xl border-2 border-red-400/30 bg-red-500/10 p-6 text-center text-red-200">
          {error}
        </div>
      ) : meetings.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-white/20 bg-navy/30 p-10 text-center">
          <p className="text-[15px] text-white/80">No meetings yet.</p>
          <p className="mt-1 text-[13px] text-white/55">
            Schedule a meeting to track its agenda and minutes.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border-2 border-gold/20">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-navy/50 text-[12px] uppercase tracking-[0.08em] text-white/50">
              <tr>
                <th className="px-4 py-3">Meeting</th>
                <th className="px-4 py-3">Committee</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Signals</th>
                {canEdit ? <th className="px-4 py-3 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {meetings.map((m) => (
                  <motion.tr
                    key={m.id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                    className="border-t border-white/10 text-white/85"
                  >
                    <td className="px-4 py-3 font-semibold text-white">{m.title}</td>
                    <td className="px-4 py-3 text-white/70">{m.committeeName ?? '—'}</td>
                    <td className="px-4 py-3 text-white/70">{m.scheduledAt ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-white/20 bg-white/5 px-2 py-0.5 text-[12px] capitalize text-white/70">
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {m.agendaMissing ? (
                          <Pill cls="border-amber-400/50 bg-amber-500/15 text-amber-200">Agenda due</Pill>
                        ) : null}
                        {m.minutesOverdue ? (
                          <Pill cls="border-red-400/50 bg-red-500/15 text-red-200">Minutes overdue</Pill>
                        ) : m.minutesPending ? (
                          <Pill cls="border-amber-400/50 bg-amber-500/15 text-amber-200">Minutes pending</Pill>
                        ) : null}
                        {m.minutesStatus === 'approved' ? (
                          <Pill cls="border-emerald-400/50 bg-emerald-500/15 text-emerald-200">
                            Minutes approved
                          </Pill>
                        ) : null}
                        {!m.agendaMissing &&
                        !m.minutesPending &&
                        !m.minutesOverdue &&
                        m.minutesStatus !== 'approved' ? (
                          <span className="text-[12px] text-white/40">—</span>
                        ) : null}
                      </div>
                    </td>
                    {canEdit ? (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {m.minutesStatus === 'pending_approval' ? (
                            <button
                              type="button"
                              onClick={() => approveMinutes(m.id)}
                              aria-label={`Mark minutes approved for ${m.title}`}
                              title="Mark minutes approved"
                              className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-emerald-400/60 hover:text-emerald-200"
                            >
                              <CheckCircle2 size={15} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openEdit(m)}
                            aria-label={`Edit ${m.title}`}
                            className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-gold/60 hover:text-white"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(m)}
                            aria-label={`Delete ${m.title}`}
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

      {modalOpen ? (
        <MeetingFormModal
          key={editing ? editing.id : 'new'}
          initial={initialForm}
          committees={committees}
          onClose={() => setModalOpen(false)}
          onSave={onSave}
          reduce={reduce}
        />
      ) : null}
    </div>
  )
}

// ═══════════════════════════ PAGE (tabs) ════════════════════════════════════

const TABS = [
  { id: 'policies', label: 'Policies', icon: Landmark },
  { id: 'committees', label: 'Committees', icon: Users },
  { id: 'meetings', label: 'Meetings', icon: CalendarDays },
]

function GovernanceWorkspace() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()
  const [tab, setTab] = useState('policies')

  // Committees + meetings hooks are mounted at the page level: the committees list
  // feeds the Meetings tab's committee picker + name column too. The gate state
  // (notLicensed / notEntitled) is shared across all three tabs.
  const committeesHook = useCommittees(schoolId)
  const meetingsHook = useMeetings(schoolId)

  const notLicensed = committeesHook.notLicensed || meetingsHook.notLicensed
  const notEntitled = committeesHook.notEntitled || meetingsHook.notEntitled
  const gate =
    notLicensed || notEntitled ? (
      <GatePanel notLicensed={notLicensed} notEntitled={notEntitled} />
    ) : null

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/15 text-gold-light shadow-glow">
          <Landmark size={22} />
        </span>
        <div>
          <h1 className="font-serif text-[22px] uppercase tracking-[0.12em] text-gold-light">
            Governance
          </h1>
          <p className="text-[13px] text-white/60">
            Board policies, committees, and meetings — your Monday-morning governance screen.
          </p>
        </div>
      </div>

      {/* Flashy navy/gold tab bar with a framer-motion underline. */}
      <div className="mb-6 flex gap-1 border-b-2 border-white/10">
        {TABS.map(({ id, label, icon }) => {
          const Icon = icon
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-[14px] font-semibold transition-colors ${
                active ? 'text-gold-light' : 'text-white/55 hover:text-white/80'
              }`}
            >
              <Icon size={16} />
              {label}
              {active ? (
                <motion.span
                  layoutId={reduce ? undefined : 'gov-tab-underline'}
                  className="absolute inset-x-1 -bottom-[2px] h-[3px] rounded-full bg-gold"
                />
              ) : null}
            </button>
          )
        })}
      </div>

      {tab === 'policies' ? (
        <PoliciesPanel schoolId={schoolId} canEdit={canEdit} reduce={reduce} gate={gate} />
      ) : tab === 'committees' ? (
        <CommitteesPanel committeesHook={committeesHook} canEdit={canEdit} reduce={reduce} gate={gate} />
      ) : (
        <MeetingsPanel
          meetingsHook={meetingsHook}
          committees={committeesHook.committees}
          canEdit={canEdit}
          reduce={reduce}
          gate={gate}
        />
      )}
    </div>
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

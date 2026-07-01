// ─────────────────────────────────────────────────────────────────────────────
// Governance route (Phase 3 v1): TopBar + the POLICY REGISTER panel. School-scoped
// (no period selector). Gated by the 'governance' module — the nav item is hidden
// by hasModule, but a direct-nav to /governance for a finance-only school renders
// a friendly "module not on your plan" panel (the API 402 → notLicensed).
// Navy/gold theme, reduced-motion safe, no setState-in-effect.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Landmark, Plus, Pencil, Trash2, ListPlus, X } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import BillingBanner from '../components/BillingBanner.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePolicies } from '../hooks/usePolicies.js'

const STATUSES = ['active', 'draft', 'retired']

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

const EMPTY_FORM = {
  title: '',
  category: '',
  status: 'active',
  owner: '',
  adoptedDate: '',
  lastReviewedDate: '',
  reviewIntervalMonths: 12,
  notes: '',
}

/** Build the request body: send null to CLEAR optional fields, numbers as numbers. */
function toBody(form) {
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

function PolicyFormModal({ open, initial, onClose, onSave, reduce }) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Re-seed when the modal opens for a different policy (key remount handles it).
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
      await onSave(toBody(form))
      onClose()
    } catch {
      setErr('Could not save this policy.')
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
        className="w-full max-w-lg rounded-2xl border-2 border-gold/30 bg-navy-gradient p-6 shadow-navy-glow"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-[18px] uppercase tracking-[0.12em] text-gold-light">
            {initial ? 'Edit policy' : 'Add policy'}
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
              Category
              <input
                value={form.category}
                onChange={set('category')}
                maxLength={80}
                placeholder="e.g. Financial, HR, Safety"
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
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
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[13px] text-white/70">
              Owner
              <input
                value={form.owner}
                onChange={set('owner')}
                maxLength={200}
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Review every (months)
              <input
                type="number"
                min={1}
                max={120}
                value={form.reviewIntervalMonths}
                onChange={set('reviewIntervalMonths')}
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Adopted date
              <input
                type="date"
                value={form.adoptedDate}
                onChange={set('adoptedDate')}
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Last reviewed
              <input
                type="date"
                value={form.lastReviewedDate}
                onChange={set('lastReviewedDate')}
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="col-span-2 block text-[13px] text-white/70">
              Notes
              <textarea
                value={form.notes}
                onChange={set('notes')}
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
              {saving ? 'Saving…' : 'Save policy'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function GovernancePanel() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()
  const navigate = useNavigate()

  const { policies, loading, error, notLicensed, notEntitled, create, update, remove } =
    usePolicies(schoolId)

  // "Create task" — the actionable pairing: an overdue/due-soon policy row spawns a
  // pre-filled task (sourceType='policy', sourceRef=policy.id) on the /tasks page.
  // That task, being open + due-dated, then feeds BACK into the briefing's workflow
  // items. v1 = manual (the user confirms assignee + due date in the task modal).
  const createTaskFromPolicy = (p) => {
    // Only seed the task's due date when the policy's next review is still in the
    // FUTURE (a due-soon policy). For an OVERDUE policy nextReviewDate is in the
    // past, and a task's due date is a fresh "when will you do this" decision —
    // seeding a past date would open the modal already-overdue, so leave it blank.
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

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null) // the policy being edited, or null

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
    if (window.confirm(`Delete "${p.title}"? This cannot be undone.`)) {
      await remove(p.id)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/15 text-gold-light shadow-glow">
            <Landmark size={22} />
          </span>
          <div>
            <h1 className="font-serif text-[22px] uppercase tracking-[0.12em] text-gold-light">
              Policy Register
            </h1>
            <p className="text-[13px] text-white/60">
              Your standing policies and their review cycles.
            </p>
          </div>
        </div>
        {canEdit && !notLicensed && !notEntitled ? (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-gold/60 bg-gold/15 px-4 py-2 text-[14px] font-semibold text-gold-light hover:bg-gold/25"
          >
            <Plus size={16} /> Add policy
          </button>
        ) : null}
      </div>

      {notLicensed ? (
        <div className="rounded-2xl border-2 border-gold/30 bg-navy/30 p-8 text-center">
          <p className="text-[15px] text-white/80">
            The Governance module isn&apos;t on your plan yet.
          </p>
          <p className="mt-1 text-[13px] text-white/55">
            Add Governance to track board policies and review cycles.
          </p>
        </div>
      ) : notEntitled ? (
        <div className="rounded-2xl border-2 border-gold/30 bg-navy/30 p-8 text-center">
          <p className="text-[15px] text-white/80">Your subscription is paused.</p>
          <p className="mt-1 text-[13px] text-white/55">
            Resume your plan to manage the policy register.
          </p>
        </div>
      ) : loading ? (
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

      <PolicyFormModal
        key={editing ? editing.id : 'new'}
        open={modalOpen}
        initial={initialForm}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
        reduce={reduce}
      />
    </div>
  )
}

export default function GovernancePage() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <BillingBanner />
      <GovernancePanel />
    </div>
  )
}

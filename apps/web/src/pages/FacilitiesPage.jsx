// ─────────────────────────────────────────────────────────────────────────────
// Facilities route (Phase 4 v1): AppShell chrome + the deferred-maintenance register.
// School-scoped (no period selector). Gated by the 'facilities' module — the nav
// item is hidden by hasModule, but a direct-nav for a finance-only school renders a
// friendly "module not on your plan" panel (the API 402 → notLicensed). A backlog
// summary banner headlines the open/high-priority counts + $ backlog; each row shows
// priority/status/urgency badges. Navy/gold theme, reduced-motion safe, no setState-
// in-effect. SEPARATE from the capital schedule (deferred-maintenance ≠ planned capital).
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Pencil, Plus, Trash2, Wrench, X } from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useFacilities } from '../hooks/useFacilities.js'

const PRIORITIES = ['low', 'medium', 'high', 'critical']
const STATUSES = ['open', 'scheduled', 'in_progress', 'resolved']

const PRIORITY_BADGE = {
  low: { label: 'Low', cls: 'border-white/20 bg-white/5 text-white/60' },
  medium: { label: 'Medium', cls: 'border-sky-400/50 bg-sky-500/15 text-sky-200' },
  high: { label: 'High', cls: 'border-amber-400/50 bg-amber-500/15 text-amber-200' },
  critical: { label: 'Critical', cls: 'border-red-400/50 bg-red-500/15 text-red-200' },
}

const STATUS_BADGE = {
  open: { label: 'Open', cls: 'border-amber-400/50 bg-amber-500/15 text-amber-200' },
  scheduled: { label: 'Scheduled', cls: 'border-sky-400/50 bg-sky-500/15 text-sky-200' },
  in_progress: { label: 'In progress', cls: 'border-gold/50 bg-gold/15 text-gold-light' },
  resolved: { label: 'Resolved', cls: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' },
}

const URGENCY_BADGE = {
  overdue: { label: 'Overdue', cls: 'border-red-400/50 bg-red-500/15 text-red-200' },
  'due-soon': { label: 'Due soon', cls: 'border-amber-400/50 bg-amber-500/15 text-amber-200' },
  'on-track': { label: 'On track', cls: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' },
  none: null,
}

function fmtMoney(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0'
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function Badge({ def, suffix }) {
  if (!def) return null
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${def.cls}`}
    >
      {def.label}
      {suffix ?? ''}
    </span>
  )
}

const EMPTY_FORM = {
  title: '',
  location: '',
  category: '',
  priority: 'medium',
  status: 'open',
  estimatedCost: '',
  targetDate: '',
  notes: '',
}

function toItemBody(form) {
  const cost = form.estimatedCost.trim()
  return {
    title: form.title.trim(),
    location: form.location.trim() ? form.location.trim() : null,
    category: form.category.trim() ? form.category.trim() : null,
    priority: form.priority,
    status: form.status,
    estimatedCost: cost === '' ? null : Number(cost),
    targetDate: form.targetDate ? form.targetDate : null,
    notes: form.notes.trim() ? form.notes.trim() : null,
  }
}

function MaintenanceFormModal({ open, initial, onClose, onSave, reduce }) {
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
    if (form.estimatedCost.trim() && Number.isNaN(Number(form.estimatedCost))) {
      setErr('Estimated cost must be a number.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onSave(toItemBody(form))
      onClose()
    } catch {
      setErr('Could not save this maintenance item.')
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
            {initial ? 'Edit maintenance item' : 'Add maintenance item'}
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
                placeholder="e.g. Replace gym roof membrane"
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Location
              <input
                value={form.location}
                onChange={set('location')}
                maxLength={200}
                placeholder="e.g. Gymnasium"
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Category
              <input
                value={form.category}
                onChange={set('category')}
                maxLength={80}
                placeholder="e.g. Roofing"
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Priority
              <select
                value={form.priority}
                onChange={set('priority')}
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_BADGE[p].label}
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
                    {STATUS_BADGE[s].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[13px] text-white/70">
              Estimated cost ($)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.estimatedCost}
                onChange={set('estimatedCost')}
                placeholder="e.g. 125000"
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Target date
              <input
                type="date"
                value={form.targetDate}
                onChange={set('targetDate')}
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
              {saving ? 'Saving…' : 'Save item'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function FacilitiesPanel() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()

  const {
    items,
    summary,
    loading,
    error,
    notLicensed,
    notEntitled,
    createItem,
    updateItem,
    removeItem,
  } = useFacilities(schoolId)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const openAdd = () => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (it) => {
    setEditing(it)
    setModalOpen(true)
  }

  const initialForm = useMemo(() => {
    if (!editing) return null
    return {
      title: editing.title ?? '',
      location: editing.location ?? '',
      category: editing.category ?? '',
      priority: editing.priority ?? 'medium',
      status: editing.status ?? 'open',
      estimatedCost: editing.estimatedCost === null || editing.estimatedCost === undefined ? '' : String(editing.estimatedCost),
      targetDate: editing.targetDate ?? '',
      notes: editing.notes ?? '',
    }
  }, [editing])

  const onSave = async (body) => {
    if (editing) await updateItem(editing.id, body)
    else await createItem(body)
  }

  const onDelete = async (it) => {
    if (window.confirm(`Delete "${it.title}"?`)) {
      await removeItem(it.id)
    }
  }

  const showList = !notLicensed && !notEntitled && !loading && !error

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/15 text-gold-light shadow-glow">
            <Wrench size={22} />
          </span>
          <div>
            <h1 className="font-serif text-[22px] uppercase tracking-[0.12em] text-gold-light">
              Deferred Maintenance
            </h1>
            <p className="text-[13px] text-white/60">
              Your maintenance backlog — priority, status, estimated cost, and target date.
            </p>
          </div>
        </div>
        {canEdit && showList ? (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-gold/60 bg-gold/15 px-4 py-2 text-[14px] font-semibold text-gold-light hover:bg-gold/25"
          >
            <Plus size={16} /> Add item
          </button>
        ) : null}
      </div>

      {/* Backlog summary banner */}
      {showList && summary.total > 0 ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border-2 border-gold/20 bg-navy/40 p-4">
            <p className="text-[12px] uppercase tracking-[0.1em] text-white/50">Open items</p>
            <p className="mt-1 text-[22px] font-semibold text-white">{summary.openCount}</p>
          </div>
          <div className="rounded-2xl border-2 border-gold/20 bg-navy/40 p-4">
            <p className="text-[12px] uppercase tracking-[0.1em] text-white/50">High priority</p>
            <p className="mt-1 text-[22px] font-semibold text-amber-200">
              {summary.highPriorityOpenCount}
            </p>
            {summary.criticalOpen > 0 ? (
              <span className="mt-1 inline-flex items-center rounded-md border border-red-400/50 bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-200">
                {summary.criticalOpen} critical
              </span>
            ) : null}
          </div>
          <div className="rounded-2xl border-2 border-gold/20 bg-navy/40 p-4">
            <p className="text-[12px] uppercase tracking-[0.1em] text-white/50">Overdue</p>
            <p className="mt-1 text-[22px] font-semibold text-red-200">{summary.overdueOpen}</p>
          </div>
          <div className="rounded-2xl border-2 border-gold/20 bg-navy/40 p-4">
            <p className="text-[12px] uppercase tracking-[0.1em] text-white/50">Backlog cost</p>
            <p className="mt-1 text-[22px] font-semibold text-gold-light">
              {fmtMoney(summary.backlogCost)}
            </p>
          </div>
        </div>
      ) : null}

      {notLicensed ? (
        <div className="rounded-2xl border-2 border-gold/30 bg-navy/30 p-8 text-center">
          <p className="text-[15px] text-white/80">
            The Facilities module isn&apos;t on your plan yet.
          </p>
          <p className="mt-1 text-[13px] text-white/55">
            Add Facilities to track deferred maintenance and its capital backlog.
          </p>
        </div>
      ) : notEntitled ? (
        <div className="rounded-2xl border-2 border-gold/30 bg-navy/30 p-8 text-center">
          <p className="text-[15px] text-white/80">Your subscription is paused.</p>
          <p className="mt-1 text-[13px] text-white/55">
            Resume your plan to manage the maintenance register.
          </p>
        </div>
      ) : loading ? (
        <div className="rounded-2xl border-2 border-white/10 bg-navy/30 p-8 text-center text-white/50">
          Loading maintenance items…
        </div>
      ) : error ? (
        <div className="rounded-2xl border-2 border-red-400/30 bg-red-500/10 p-6 text-center text-red-200">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-white/20 bg-navy/30 p-10 text-center">
          <p className="text-[15px] text-white/80">No maintenance items yet.</p>
          <p className="mt-1 text-[13px] text-white/55">
            Add your first item to start tracking the deferred-maintenance backlog.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div
              key={it.id}
              className="overflow-hidden rounded-2xl border-2 border-gold/20 bg-navy/30 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-white">{it.title}</span>
                    {it.location ? (
                      <span className="text-[12px] text-white/45">{it.location}</span>
                    ) : null}
                    {it.category ? (
                      <span className="rounded-md border border-white/20 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/60">
                        {it.category}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge def={PRIORITY_BADGE[it.priority]} />
                    <Badge def={STATUS_BADGE[it.status]} />
                    <Badge
                      def={URGENCY_BADGE[it.urgency]}
                      suffix={
                        it.urgency === 'overdue' && typeof it.daysUntilTarget === 'number'
                          ? ` · ${Math.abs(it.daysUntilTarget)}d ago`
                          : it.urgency === 'due-soon' && typeof it.daysUntilTarget === 'number'
                            ? ` · in ${it.daysUntilTarget}d`
                            : ''
                      }
                    />
                    {typeof it.estimatedCost === 'number' ? (
                      <span className="text-[12px] font-semibold text-gold-light">
                        {fmtMoney(it.estimatedCost)}
                      </span>
                    ) : null}
                    {it.targetDate ? (
                      <span className="text-[12px] text-white/45">target {it.targetDate}</span>
                    ) : null}
                  </div>
                </div>
                {canEdit ? (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(it)}
                      aria-label={`Edit ${it.title}`}
                      className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-gold/60 hover:text-white"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(it)}
                      aria-label={`Delete ${it.title}`}
                      className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-red-400/60 hover:text-red-200"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <MaintenanceFormModal
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

export default function FacilitiesPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <FacilitiesPanel />
    </div>
  )
}

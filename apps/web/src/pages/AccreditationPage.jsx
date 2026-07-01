// ─────────────────────────────────────────────────────────────────────────────
// Accreditation route (Phase 4 v1): TopBar + the STANDARDS + EVIDENCE register.
// School-scoped (no period selector). Gated by the 'accreditation' module — the nav
// item is hidden by hasModule, but a direct-nav for a finance-only school renders a
// friendly "module not on your plan" panel (the API 402 → notLicensed). A coverage
// summary banner headlines the gap count; each standard row lazy-loads its evidence.
// Navy/gold theme, reduced-motion safe, no setState-in-effect.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  FileText,
  Link as LinkIcon,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import BillingBanner from '../components/BillingBanner.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useAccreditation } from '../hooks/useAccreditation.js'

const REVIEW_BADGE = {
  overdue: { label: 'Review overdue', cls: 'border-red-400/50 bg-red-500/15 text-red-200' },
  'due-soon': { label: 'Review approaching', cls: 'border-amber-400/50 bg-amber-500/15 text-amber-200' },
  current: { label: 'Review current', cls: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' },
  unknown: { label: 'No review date', cls: 'border-white/20 bg-white/5 text-white/50' },
}

const COVERAGE_BADGE = {
  'no-evidence': { label: 'No evidence', cls: 'border-amber-400/50 bg-amber-500/15 text-amber-200' },
  covered: { label: 'Evidenced', cls: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' },
}

const KIND_ICON = { document: FileText, link: LinkIcon, note: StickyNote }
const EVIDENCE_KINDS = ['document', 'link', 'note']

function CoverageBadge({ coverage, evidenceCount }) {
  const b = COVERAGE_BADGE[coverage] ?? COVERAGE_BADGE['no-evidence']
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${b.cls}`}
      title={`${evidenceCount} evidence item${evidenceCount === 1 ? '' : 's'}`}
    >
      {b.label}
      {coverage === 'covered' ? ` · ${evidenceCount}` : ''}
    </span>
  )
}

function ReviewBadge({ status, reviewDate, daysUntilReview }) {
  if (status === 'unknown') return null
  const b = REVIEW_BADGE[status] ?? REVIEW_BADGE.unknown
  let suffix = ''
  if (status === 'due-soon' && typeof daysUntilReview === 'number') suffix = ` · in ${daysUntilReview}d`
  else if (status === 'overdue' && typeof daysUntilReview === 'number')
    suffix = ` · ${Math.abs(daysUntilReview)}d ago`
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${b.cls}`}
      title={reviewDate ? `Review date: ${reviewDate}` : ''}
    >
      {b.label}
      {suffix}
    </span>
  )
}

const EMPTY_FORM = { code: '', title: '', category: '', reviewDate: '', owner: '', notes: '' }

function toStandardBody(form) {
  return {
    code: form.code.trim(),
    title: form.title.trim(),
    category: form.category.trim() ? form.category.trim() : null,
    reviewDate: form.reviewDate ? form.reviewDate : null,
    owner: form.owner.trim() ? form.owner.trim() : null,
    notes: form.notes.trim() ? form.notes.trim() : null,
  }
}

function StandardFormModal({ open, initial, onClose, onSave, reduce }) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.code.trim() || !form.title.trim()) {
      setErr('Code and title are required.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onSave(toStandardBody(form))
      onClose()
    } catch {
      setErr('Could not save this standard.')
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
            {initial ? 'Edit standard' : 'Add standard'}
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
            <label className="block text-[13px] text-white/70">
              Code
              <input
                value={form.code}
                onChange={set('code')}
                maxLength={40}
                placeholder="e.g. MSA-3"
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Category
              <input
                value={form.category}
                onChange={set('category')}
                maxLength={80}
                placeholder="e.g. Governance"
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
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
              Owner
              <input
                value={form.owner}
                onChange={set('owner')}
                maxLength={200}
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Review date
              <input
                type="date"
                value={form.reviewDate}
                onChange={set('reviewDate')}
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
              {saving ? 'Saving…' : 'Save standard'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

/** The lazy-loaded evidence sub-list for one expanded standard row. */
function EvidencePanel({ standardId, canEdit, listEvidence, createEvidence, removeEvidence }) {
  const [items, setItems] = useState(null) // null = not yet loaded
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', kind: 'document', reference: '', capturedAt: '' })
  const [err, setErr] = useState('')

  // Lazy load on first mount (the row was just expanded). setState-safe: deferred
  // to a microtask + cancelled flag, mirroring the hook pattern.
  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => listEvidence(standardId))
      .then((rows) => {
        if (!cancelled) setItems(rows)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standardId])

  const reload = async () => {
    const rows = await listEvidence(standardId)
    setItems(rows)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) {
      setErr('A title is required.')
      return
    }
    setErr('')
    try {
      await createEvidence(standardId, {
        title: form.title.trim(),
        kind: form.kind,
        reference: form.reference.trim() ? form.reference.trim() : null,
        capturedAt: form.capturedAt ? form.capturedAt : null,
      })
      setForm({ title: '', kind: 'document', reference: '', capturedAt: '' })
      setAdding(false)
      await reload()
    } catch {
      setErr('Could not add this evidence.')
    }
  }

  const onDelete = async (ev) => {
    if (window.confirm(`Delete evidence "${ev.title}"?`)) {
      await removeEvidence(standardId, ev.id)
      await reload()
    }
  }

  return (
    <div className="border-t border-white/10 bg-navy/40 px-6 py-4">
      {loading || items === null ? (
        <p className="text-[13px] text-white/50">Loading evidence…</p>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-white/55">No evidence attached yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((ev) => {
            const Icon = KIND_ICON[ev.kind] ?? FileText
            return (
              <li
                key={ev.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-navy/50 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Icon size={15} className="shrink-0 text-gold-light" />
                  <span className="truncate text-[13px] text-white/85">{ev.title}</span>
                  {ev.reference && ev.kind === 'link' ? (
                    <a
                      href={ev.reference}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-[12px] text-gold-light underline"
                    >
                      link
                    </a>
                  ) : ev.reference ? (
                    <span className="truncate text-[12px] text-white/45">{ev.reference}</span>
                  ) : null}
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => onDelete(ev)}
                    aria-label={`Delete evidence ${ev.title}`}
                    className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-red-400/60 hover:text-red-200"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {canEdit ? (
        adding ? (
          <form onSubmit={submit} className="mt-3 grid grid-cols-2 gap-2">
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={200}
              placeholder="Evidence title"
              className="col-span-2 rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-1.5 text-[13px] text-white outline-none focus:border-gold/60"
            />
            <select
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
              className="rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-1.5 text-[13px] text-white outline-none focus:border-gold/60"
            >
              {EVIDENCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={form.capturedAt}
              onChange={(e) => setForm((f) => ({ ...f, capturedAt: e.target.value }))}
              className="rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-1.5 text-[13px] text-white outline-none focus:border-gold/60"
            />
            <input
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              maxLength={2000}
              placeholder="Reference (URL / doc path / citation)"
              className="col-span-2 rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-1.5 text-[13px] text-white outline-none focus:border-gold/60"
            />
            {err ? <p className="col-span-2 text-[12px] text-red-300">{err}</p> : null}
            <div className="col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-lg border-2 border-white/20 px-3 py-1.5 text-[13px] font-semibold text-white/70 hover:border-white/40 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg border-2 border-gold/60 bg-gold/15 px-3 py-1.5 text-[13px] font-semibold text-gold-light hover:bg-gold/25"
              >
                Add evidence
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border-2 border-white/20 px-3 py-1.5 text-[13px] font-semibold text-white/70 hover:border-gold/60 hover:text-gold-light"
          >
            <Plus size={14} /> Add evidence
          </button>
        )
      ) : null}
    </div>
  )
}

function AccreditationPanel() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()

  const {
    standards,
    summary,
    loading,
    error,
    notLicensed,
    notEntitled,
    createStandard,
    updateStandard,
    removeStandard,
    listEvidence,
    createEvidence,
    removeEvidence,
  } = useAccreditation(schoolId)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(null) // the expanded standard id, or null

  const openAdd = () => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (s) => {
    setEditing(s)
    setModalOpen(true)
  }

  const initialForm = useMemo(() => {
    if (!editing) return null
    return {
      code: editing.code ?? '',
      title: editing.title ?? '',
      category: editing.category ?? '',
      reviewDate: editing.reviewDate ?? '',
      owner: editing.owner ?? '',
      notes: editing.notes ?? '',
    }
  }, [editing])

  const onSave = async (body) => {
    if (editing) await updateStandard(editing.id, body)
    else await createStandard(body)
  }

  const onDelete = async (s) => {
    if (window.confirm(`Delete "${s.code} — ${s.title}"? Its evidence is removed too.`)) {
      await removeStandard(s.id)
    }
  }

  const showList = !notLicensed && !notEntitled && !loading && !error
  const pct = summary.total === 0 ? 0 : summary.pctCovered

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/15 text-gold-light shadow-glow">
            <BadgeCheck size={22} />
          </span>
          <div>
            <h1 className="font-serif text-[22px] uppercase tracking-[0.12em] text-gold-light">
              Accreditation Register
            </h1>
            <p className="text-[13px] text-white/60">
              Your accreditation standards and the evidence demonstrating each.
            </p>
          </div>
        </div>
        {canEdit && showList ? (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-gold/60 bg-gold/15 px-4 py-2 text-[14px] font-semibold text-gold-light hover:bg-gold/25"
          >
            <Plus size={16} /> Add standard
          </button>
        ) : null}
      </div>

      {/* Coverage summary banner */}
      {showList && summary.total > 0 ? (
        <div className="mb-6 rounded-2xl border-2 border-gold/20 bg-navy/40 p-5">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold text-white">
              {summary.withEvidence} of {summary.total} standards evidenced
            </p>
            <p className="text-[13px] text-white/60">
              {summary.gaps > 0 ? (
                <span className="text-amber-200">{summary.gaps} still need evidence</span>
              ) : (
                <span className="text-emerald-200">All standards evidenced</span>
              )}
            </p>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-gold/70 to-gold-light"
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={reduce ? undefined : { duration: 0.6 }}
            />
          </div>
        </div>
      ) : null}

      {notLicensed ? (
        <div className="rounded-2xl border-2 border-gold/30 bg-navy/30 p-8 text-center">
          <p className="text-[15px] text-white/80">
            The Accreditation module isn&apos;t on your plan yet.
          </p>
          <p className="mt-1 text-[13px] text-white/55">
            Add Accreditation to track standards and the evidence for each.
          </p>
        </div>
      ) : notEntitled ? (
        <div className="rounded-2xl border-2 border-gold/30 bg-navy/30 p-8 text-center">
          <p className="text-[15px] text-white/80">Your subscription is paused.</p>
          <p className="mt-1 text-[13px] text-white/55">
            Resume your plan to manage the accreditation register.
          </p>
        </div>
      ) : loading ? (
        <div className="rounded-2xl border-2 border-white/10 bg-navy/30 p-8 text-center text-white/50">
          Loading standards…
        </div>
      ) : error ? (
        <div className="rounded-2xl border-2 border-red-400/30 bg-red-500/10 p-6 text-center text-red-200">
          {error}
        </div>
      ) : standards.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-white/20 bg-navy/30 p-10 text-center">
          <p className="text-[15px] text-white/80">No standards yet.</p>
          <p className="mt-1 text-[13px] text-white/55">
            Add your first standard to start tracking accreditation evidence.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {standards.map((s) => {
              const isOpen = expanded === s.id
              return (
                <motion.div
                  key={s.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduce ? undefined : { opacity: 0 }}
                  className="overflow-hidden rounded-2xl border-2 border-gold/20 bg-navy/30"
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : s.id)}
                      aria-label={isOpen ? 'Collapse evidence' : 'Expand evidence'}
                      className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-gold/60 hover:text-gold-light"
                    >
                      {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-white/20 bg-white/5 px-2 py-0.5 text-[12px] font-semibold text-white/70">
                          {s.code}
                        </span>
                        <span className="truncate font-semibold text-white">{s.title}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <CoverageBadge coverage={s.coverage} evidenceCount={s.evidenceCount} />
                        <ReviewBadge
                          status={s.reviewStatus}
                          reviewDate={s.reviewDate}
                          daysUntilReview={s.daysUntilReview}
                        />
                        {s.category ? (
                          <span className="text-[12px] text-white/45">{s.category}</span>
                        ) : null}
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          aria-label={`Edit ${s.code}`}
                          className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-gold/60 hover:text-white"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(s)}
                          aria-label={`Delete ${s.code}`}
                          className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-red-400/60 hover:text-red-200"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {isOpen ? (
                    <EvidencePanel
                      standardId={s.id}
                      canEdit={canEdit}
                      listEvidence={listEvidence}
                      createEvidence={createEvidence}
                      removeEvidence={removeEvidence}
                    />
                  ) : null}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      <StandardFormModal
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

export default function AccreditationPage() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <BillingBanner />
      <AccreditationPanel />
    </div>
  )
}

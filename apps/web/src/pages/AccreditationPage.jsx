// ─────────────────────────────────────────────────────────────────────────────
// Accreditation route — the DOMAIN COMMAND CENTER (Phase 4 register, redesigned).
// A LIGHT command-center (matches Governance / the Finance home, not the old dark
// register): Penny lands you on accreditation's slice of the briefing — the KPIs
// that define its health (evidence coverage, gaps, standards, reviews due), the
// items that need a decision (the attention rail — standards with no evidence,
// then reviews past due), with the Standards register a tab away. Built on the
// reusable DomainCommandCenter scaffold shared with Governance.
//
// School-scoped (no period selector). Route stays /accreditation. Gated by the
// 'accreditation' module — a finance-only school direct-navving here gets a
// friendly light "module not on your plan" panel (the API 402 → notLicensed).
//
// The expand-to-evidence interaction is PRESERVED: each standard row expands to
// the lazy EvidencePanel (list evidence + "Add evidence" form + "Attach from
// operations" SourcePicker). The evidence panel, source picker, and the standard
// create/edit form modal remain dark navy/gold overlays over the light page.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Award,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Landmark,
  Link as LinkIcon,
  Pencil,
  Plus,
  ShieldAlert,
  StickyNote,
  Trash2,
  TrendingDown,
  X,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import EntityFormModal, { Field, Select, fieldInput, fieldTextarea } from '../components/ui/EntityFormModal.jsx'
import DomainCommandCenter from '../components/domain/DomainCommandCenter.jsx'
import DatePicker from '../components/ui/DatePicker.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useAccreditation } from '../hooks/useAccreditation.js'

// ── Light-theme coverage badge (restyled from the old dark pills) ────────────
const COVERAGE_BADGE = {
  'no-evidence': { label: 'No evidence', cls: 'border-gold/40 bg-gold/10 text-[#7a5e00]' },
  covered: { label: 'Evidenced', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' },
}

// ── Light-theme review badge ─────────────────────────────────────────────────
const REVIEW_BADGE = {
  overdue: { label: 'Review overdue', cls: 'border-danger/30 bg-danger/10 text-danger' },
  'due-soon': { label: 'Review approaching', cls: 'border-gold/40 bg-gold/10 text-[#7a5e00]' },
  current: { label: 'Review current', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' },
  unknown: { label: 'No review date', cls: 'border-rule/60 bg-section text-muted' },
}

const KIND_ICON = { document: FileText, link: LinkIcon, note: StickyNote }
const EVIDENCE_KINDS = ['document', 'link', 'note']

// ── Per-standard accreditor rating (met / partial / not-met lifecycle) ────────
const RATING_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'not_met', label: 'Not met' },
  { value: 'partially_met', label: 'Partially met' },
  { value: 'met', label: 'Met' },
]
const RATING_BADGE = {
  met: { label: 'Met', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' },
  partially_met: { label: 'Partially met', cls: 'border-gold/40 bg-gold/10 text-[#7a5e00]' },
  not_met: { label: 'Not met', cls: 'border-danger/30 bg-danger/10 text-danger' },
  not_started: { label: 'Not started', cls: 'border-rule/60 bg-section text-muted' },
}

function RatingBadge({ rating }) {
  const b = RATING_BADGE[rating] ?? RATING_BADGE.not_started
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${b.cls}`}
    >
      {b.label}
    </span>
  )
}

/** A parent standard's rating rollup over its descendant leaves ("3/5 met · 70%"). */
function RollupBadge({ leafSummary }) {
  if (!leafSummary || leafSummary.leafCount === 0) return null
  const { metCount, leafCount, ratingCoveragePct } = leafSummary
  return (
    <span
      className="inline-flex items-center rounded-md border border-navy/20 bg-navy/5 px-2 py-0.5 text-[12px] font-semibold text-navy"
      title={`${metCount} of ${leafCount} indicators met · ${ratingCoveragePct}% weighted`}
    >
      {metCount}/{leafCount} met · {ratingCoveragePct}%
    </span>
  )
}

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
  if (status === 'unknown') return <span className="text-[12px] text-muted/60">—</span>
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

// ── Light-theme register table primitives (shared idiom with Governance) ─────
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

// ── Light-theme entitlement / license gate ───────────────────────────────────
function GatePanel({ notLicensed }) {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-10 sm:py-8">
      <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
          <BadgeCheck size={26} />
        </span>
        {notLicensed ? (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">
              Accreditation isn&apos;t on your plan yet
            </h2>
            <p className="max-w-md text-[15px] text-muted">
              Add the Accreditation module to track your standards and the evidence demonstrating
              each — and land its slice of the briefing here.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">Your subscription is paused</h2>
            <p className="max-w-md text-[15px] text-muted">
              Resume your plan to manage the accreditation register.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════ STANDARD MODAL (dark overlay) ══════════════════

const EMPTY_FORM = {
  code: '',
  title: '',
  category: '',
  parentId: '',
  rating: 'not_started',
  reviewDate: '',
  owner: '',
  notes: '',
}

function toStandardBody(form) {
  return {
    code: form.code.trim(),
    title: form.title.trim(),
    category: form.category.trim() ? form.category.trim() : null,
    parentId: form.parentId ? form.parentId : null,
    rating: form.rating || 'not_started',
    reviewDate: form.reviewDate ? form.reviewDate : null,
    owner: form.owner.trim() ? form.owner.trim() : null,
    notes: form.notes.trim() ? form.notes.trim() : null,
  }
}

/** Parent-select options: every OTHER standard except the node being edited and its
 *  descendants (choosing one of those would create a cycle — the API rejects it too). */
function parentOptions(standards, editingId) {
  if (!editingId) return standards
  const childrenOf = new Map()
  for (const s of standards) {
    const pid = s.parentId ?? null
    if (!pid) continue
    const arr = childrenOf.get(pid) ?? []
    arr.push(s.id)
    childrenOf.set(pid, arr)
  }
  const banned = new Set([editingId])
  const stack = [editingId]
  while (stack.length) {
    const id = stack.pop()
    for (const kid of childrenOf.get(id) ?? []) {
      if (!banned.has(kid)) {
        banned.add(kid)
        stack.push(kid)
      }
    }
  }
  return standards.filter((s) => !banned.has(s.id))
}

function StandardFormModal({ open, initial, onClose, onSave, reduce, standards = [], editingId = null }) {
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

  return (
    <EntityFormModal
      open={open}
      icon={Award}
      title={initial ? 'Edit standard' : 'Add standard'}
      subtitle="Accreditation standard with evidence and a review cadence"
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={initial ? 'Save standard' : 'Add standard'}
      reduce={reduce}
    >
      <Field label="Code" index={0} reduce={reduce}>
        <input
          value={form.code}
          onChange={set('code')}
          maxLength={40}
          placeholder="e.g. MSA-3"
          className={fieldInput}
          autoFocus
        />
      </Field>
      <Field label="Category" index={1} reduce={reduce}>
        <input
          value={form.category}
          onChange={set('category')}
          maxLength={80}
          placeholder="e.g. Governance"
          className={fieldInput}
        />
      </Field>
      <Field label="Title" span={2} index={2} reduce={reduce}>
        <input value={form.title} onChange={set('title')} maxLength={200} className={fieldInput} />
      </Field>
      <Field label="Parent standard" index={3} reduce={reduce}>
        <Select value={form.parentId} onChange={set('parentId')}>
          <option value="">Top-level (no parent)</option>
          {parentOptions(standards, editingId).map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Rating" index={4} reduce={reduce}>
        <Select value={form.rating} onChange={set('rating')}>
          {RATING_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Owner" index={5} reduce={reduce}>
        <input value={form.owner} onChange={set('owner')} maxLength={200} className={fieldInput} />
      </Field>
      <Field label="Review date" index={6} reduce={reduce}>
        <DatePicker
          value={form.reviewDate}
          onChange={(v) => set('reviewDate')({ target: { value: v } })}
          className={fieldInput}
        />
      </Field>
      <Field label="Notes" span={2} index={7} reduce={reduce}>
        <textarea value={form.notes} onChange={set('notes')} maxLength={4000} rows={2} className={fieldTextarea} />
      </Field>
    </EntityFormModal>
  )
}

/** The lazy-loaded evidence sub-list for one expanded standard row (dark overlay
 *  panel — deliberately kept dark against the light table). */
function EvidencePanel({
  standardId,
  canEdit,
  reduce,
  listEvidence,
  listEvidenceSources,
  createEvidence,
  updateEvidence,
  removeEvidence,
}) {
  const [items, setItems] = useState(null) // null = not yet loaded
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', kind: 'document', reference: '', capturedAt: '' })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', kind: 'document', reference: '', capturedAt: '' })
  const [err, setErr] = useState('')
  // "Attach from operations" picker: null = closed, undefined = loading, object = loaded sources.
  const [sources, setSources] = useState(null)
  const [picking, setPicking] = useState(false)
  const [attaching, setAttaching] = useState(null) // sourceRef currently attaching (spinner)

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

  // Open the picker and lazily fetch the school's operational artifacts. Fetch runs in
  // the click handler (NOT an effect) so no new effect / setState-in-effect is introduced.
  const openPicker = async () => {
    setErr('')
    setPicking(true)
    setSources(undefined) // loading
    try {
      const res = await listEvidenceSources()
      setSources(res ?? { policies: [], boardReports: [] })
    } catch {
      setSources({ policies: [], boardReports: [] })
      setErr('Could not load your operational artifacts.')
    }
  }

  // Attach a discovered artifact as LINKED evidence. Title is omitted so the server
  // auto-derives it from the artifact; kind is forced to 'link' server-side.
  const attach = async (src) => {
    setAttaching(src.sourceRef)
    setErr('')
    try {
      await createEvidence(standardId, { sourceType: src.sourceType, sourceRef: src.sourceRef })
      setPicking(false)
      setSources(null)
      await reload()
    } catch {
      setErr('Could not attach this artifact.')
    } finally {
      setAttaching(null)
    }
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

  const startEdit = (ev) => {
    setEditingId(ev.id)
    setEditForm({
      title: ev.title ?? '',
      kind: ev.kind ?? 'document',
      reference: ev.reference ?? '',
      capturedAt: ev.capturedAt ?? '',
    })
    setErr('')
  }

  const submitEdit = async (e) => {
    e.preventDefault()
    if (!editForm.title.trim()) {
      setErr('A title is required.')
      return
    }
    setErr('')
    try {
      await updateEvidence(standardId, editingId, {
        title: editForm.title.trim(),
        kind: editForm.kind,
        reference: editForm.reference.trim() ? editForm.reference.trim() : null,
        capturedAt: editForm.capturedAt ? editForm.capturedAt : null,
      })
      setEditingId(null)
      await reload()
    } catch {
      setErr('Could not update this evidence.')
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
            if (canEdit && editingId === ev.id) {
              return (
                <li key={ev.id} className="rounded-lg border border-gold/30 bg-navy/60 px-3 py-2">
                  <form onSubmit={submitEdit} className="grid grid-cols-2 gap-2">
                    <input
                      value={editForm.title}
                      onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                      maxLength={200}
                      placeholder="Evidence title"
                      className="col-span-2 rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-1.5 text-[13px] text-white outline-none focus:border-gold/60"
                    />
                    <select
                      value={editForm.kind}
                      onChange={(e) => setEditForm((f) => ({ ...f, kind: e.target.value }))}
                      className="rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-1.5 text-[13px] text-white outline-none focus:border-gold/60"
                    >
                      {EVIDENCE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                    <DatePicker
                      value={editForm.capturedAt}
                      onChange={(v) => setEditForm((f) => ({ ...f, capturedAt: v }))}
                      className="rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-1.5 text-[13px] text-white outline-none focus:border-gold/60"
                    />
                    <input
                      value={editForm.reference}
                      onChange={(e) => setEditForm((f) => ({ ...f, reference: e.target.value }))}
                      maxLength={2000}
                      placeholder="Reference (URL / doc path / citation)"
                      className="col-span-2 rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-1.5 text-[13px] text-white outline-none focus:border-gold/60"
                    />
                    <div className="col-span-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border-2 border-white/20 px-3 py-1.5 text-[13px] font-semibold text-white/70 hover:border-white/40 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded-lg border-2 border-gold/60 bg-gold/15 px-3 py-1.5 text-[13px] font-semibold text-gold-light hover:bg-gold/25"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                </li>
              )
            }
            return (
              <li
                key={ev.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-navy/50 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Icon size={15} className="shrink-0 text-gold-light" />
                  <span className="truncate text-[13px] text-white/85">{ev.title}</span>
                  {ev.sourceType && ev.sourceType !== 'manual' && ev.sourceLink ? (
                    <Link
                      to={ev.sourceLink}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[11px] font-semibold text-gold-light hover:bg-gold/20"
                      title={`Attached from ${ev.sourceLabel}`}
                    >
                      from {ev.sourceLabel}
                    </Link>
                  ) : null}
                  {ev.reference && ev.kind === 'link' && ev.sourceType === 'manual' ? (
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
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEdit(ev)}
                      aria-label={`Edit evidence ${ev.title}`}
                      className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-gold/60 hover:text-gold-light"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(ev)}
                      aria-label={`Delete evidence ${ev.title}`}
                      className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-red-400/60 hover:text-red-200"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
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
            <DatePicker
              value={form.capturedAt}
              onChange={(v) => setForm((f) => ({ ...f, capturedAt: v }))}
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
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border-2 border-white/20 px-3 py-1.5 text-[13px] font-semibold text-white/70 hover:border-gold/60 hover:text-gold-light"
            >
              <Plus size={14} /> Add evidence
            </button>
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex items-center gap-1.5 rounded-lg border-2 border-gold/40 bg-gold/10 px-3 py-1.5 text-[13px] font-semibold text-gold-light hover:bg-gold/20"
            >
              <Landmark size={14} /> Attach from operations
            </button>
          </div>
        )
      ) : null}

      {picking ? (
        <SourcePicker
          sources={sources}
          attaching={attaching}
          err={err}
          reduce={reduce}
          onAttach={attach}
          onClose={() => {
            setPicking(false)
            setSources(null)
            setErr('')
          }}
        />
      ) : null}
    </div>
  )
}

/** Grouped picker of the school's operational artifacts (policies + board reports). */
function SourcePicker({ sources, attaching, err, reduce, onAttach, onClose }) {
  const loading = sources === undefined
  const groups = [
    { key: 'policies', label: 'Governance policies', empty: 'No policies yet' },
    { key: 'boardReports', label: 'Board reports', empty: 'No board reports yet' },
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border-2 border-gold/30 bg-navy-gradient p-6 shadow-navy-glow"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-[18px] uppercase tracking-[0.12em] text-gold-light">
            Attach from operations
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
        <p className="mb-4 text-[13px] text-white/60">
          Link an existing policy or board report as evidence for this standard — one click, a
          live deep link.
        </p>
        {loading ? (
          <p className="text-[13px] text-white/50">Loading your artifacts…</p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => {
              const list = sources?.[g.key] ?? []
              return (
                <div key={g.key}>
                  <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/50">
                    {g.label}
                  </h3>
                  {list.length === 0 ? (
                    <p className="text-[13px] text-white/40">{g.empty}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {list.map((src) => (
                        <li key={src.sourceRef}>
                          <button
                            type="button"
                            disabled={attaching !== null}
                            onClick={() => onAttach(src)}
                            className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-navy/50 px-3 py-2 text-left hover:border-gold/50 hover:bg-navy/70 disabled:opacity-50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] text-white/85">
                                {src.label}
                              </span>
                              {src.date ? (
                                <span className="block text-[11px] text-white/45">{src.date}</span>
                              ) : null}
                            </span>
                            <span className="shrink-0 text-[12px] font-semibold text-gold-light">
                              {attaching === src.sourceRef ? 'Attaching…' : 'Attach'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {err ? <p className="mt-4 text-[13px] text-red-300">{err}</p> : null}
      </motion.div>
    </div>
  )
}

// ═══════════════════════════ LIGHT STANDARDS TABLE ══════════════════════════

function StandardsTable({
  standards,
  loading,
  error,
  canEdit,
  reduce,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}) {
  if (loading)
    return (
      <StateRow>
        <p className="text-[14px] text-muted">Loading standards…</p>
      </StateRow>
    )
  if (error)
    return (
      <StateRow>
        <p className="text-[14px] text-danger">{error}</p>
      </StateRow>
    )
  if (standards.length === 0)
    return (
      <StateRow>
        <p className="font-serif text-[16px] italic text-muted">No standards yet.</p>
        <p className="mt-1 text-[13px] text-muted">
          Add your first standard to start tracking accreditation evidence.
        </p>
      </StateRow>
    )

  return (
    <TableShell
      cols={
        <>
          <Th>Code</Th>
          <Th>Standard</Th>
          <Th>Rating</Th>
          <Th>Coverage</Th>
          <Th>Review</Th>
          <Th right>{canEdit ? 'Actions' : ''}</Th>
        </>
      }
    >
      <AnimatePresence initial={false}>
        {standards.map((s) => {
          const isOpen = expanded === s.id
          return (
            <motion.tr
              key={s.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              className="group border-t border-rule/50 align-top"
            >
              <td className="px-4 py-3">
                <div
                  className="flex items-center gap-1.5"
                  style={{ paddingLeft: `${(s.depth ?? 0) * 18}px` }}
                >
                  {(s.depth ?? 0) > 0 ? (
                    <ChevronRight size={12} className="shrink-0 text-muted/50" aria-hidden />
                  ) : null}
                  <span className="rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[12px] font-semibold text-muted">
                    {s.code}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="font-semibold text-navy" style={{ paddingLeft: `${(s.depth ?? 0) * 18}px` }}>
                  {s.title}
                  {s.category ? (
                    <span className="ml-2 text-[12px] font-normal text-muted">· {s.category}</span>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3">
                {s.isLeaf === false ? (
                  <RollupBadge leafSummary={s.leafSummary} />
                ) : (
                  <RatingBadge rating={s.rating} />
                )}
              </td>
              <td className="px-4 py-3">
                <CoverageBadge coverage={s.coverage} evidenceCount={s.evidenceCount} />
              </td>
              <td className="px-4 py-3">
                <ReviewBadge
                  status={s.reviewStatus}
                  reviewDate={s.reviewDate}
                  daysUntilReview={s.daysUntilReview}
                />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1.5">
                  <IconAction
                    Icon={isOpen ? ChevronDown : ChevronRight}
                    onClick={() => onToggle(s.id)}
                    label={isOpen ? `Collapse evidence for ${s.code}` : `Expand evidence for ${s.code}`}
                    title={isOpen ? 'Collapse evidence' : 'Expand evidence'}
                  />
                  {canEdit ? (
                    <span className="flex gap-1.5 opacity-60 transition group-hover:opacity-100">
                      <IconAction Icon={Pencil} onClick={() => onEdit(s)} label={`Edit ${s.code}`} />
                      <IconAction
                        Icon={Trash2}
                        danger
                        onClick={() => onDelete(s)}
                        label={`Delete ${s.code}`}
                      />
                    </span>
                  ) : null}
                </div>
              </td>
            </motion.tr>
          )
        })}
      </AnimatePresence>
    </TableShell>
  )
}

// ═══════════════════════════ PAGE ═══════════════════════════════════════════

const TABS = [{ key: 'standards', label: 'Standards' }]

function AccreditationWorkspace() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()

  const {
    standards,
    summary,
    ratingSummary,
    loading,
    error,
    notLicensed,
    notEntitled,
    createStandard,
    updateStandard,
    removeStandard,
    listEvidenceSources,
    listEvidence,
    createEvidence,
    updateEvidence,
    removeEvidence,
  } = useAccreditation(schoolId)

  const [tab, setTab] = useState('standards')
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
  const toggleExpanded = (id) => setExpanded((cur) => (cur === id ? null : id))

  const initialForm = useMemo(() => {
    if (!editing) return null
    return {
      code: editing.code ?? '',
      title: editing.title ?? '',
      category: editing.category ?? '',
      parentId: editing.parentId ?? '',
      rating: editing.rating ?? 'not_started',
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

  // ── KPIs (computed from the summary + standards) ───────────────────────────
  const kpis = useMemo(() => {
    const total = summary.total ?? 0
    const withEvidence = summary.withEvidence ?? 0
    const gaps = summary.gaps ?? 0
    const pct = total === 0 ? 0 : summary.pctCovered ?? 0

    // 1) Coverage.
    const coverageKpi = {
      label: 'Coverage',
      value: total === 0 ? '—' : `${withEvidence}/${total}`,
      status: total === 0 ? 'neutral' : pct >= 80 ? 'good' : pct >= 50 ? 'watch' : 'risk',
      sub:
        total === 0
          ? { icon: Check, text: 'no standards yet', tone: 'neutral' }
          : pct >= 80
            ? { icon: Check, text: `${pct}% evidenced`, tone: 'good' }
            : { icon: TrendingDown, text: `${pct}% evidenced`, tone: pct >= 50 ? 'neutral' : 'bad' },
    }

    // 2) Evidence gaps.
    const gapsKpi = {
      label: 'Evidence gaps',
      value: String(gaps),
      status: gaps > 0 ? 'risk' : 'good',
      sub:
        gaps > 0
          ? { icon: ShieldAlert, text: 'standards with no evidence', tone: 'bad' }
          : { icon: Check, text: 'all evidenced', tone: 'good' },
    }

    // 3) Rating coverage (met %) over LEAF standards — the accreditor-judgement
    //    dimension, distinct from evidence coverage above. Total standards live in the
    //    Coverage card's "N/M" so this slot surfaces the rating rollup.
    const leafCount = ratingSummary?.leafCount ?? 0
    const metCount = ratingSummary?.metCount ?? 0
    const ratingPct = ratingSummary?.ratingCoveragePct ?? 0
    const ratingKpi = {
      label: 'Rating met',
      value: total === 0 ? '—' : `${ratingPct}%`,
      status:
        total === 0 || leafCount === 0
          ? 'neutral'
          : ratingPct >= 80
            ? 'good'
            : ratingPct >= 50
              ? 'watch'
              : 'risk',
      sub:
        total === 0 || leafCount === 0
          ? { icon: BadgeCheck, text: `${total} in your register`, tone: 'neutral' }
          : ratingPct >= 80
            ? { icon: Check, text: `${metCount}/${leafCount} leaves met`, tone: 'good' }
            : { icon: TrendingDown, text: `${metCount}/${leafCount} leaves met`, tone: ratingPct >= 50 ? 'neutral' : 'bad' },
    }

    // 4) Review due (past-due or approaching, from reviewStatus).
    const reviewDue = standards.filter(
      (s) => s.reviewStatus === 'overdue' || s.reviewStatus === 'due-soon',
    ).length
    const hasReviewData = standards.some((s) => s.reviewStatus && s.reviewStatus !== 'unknown')
    const reviewKpi = {
      label: 'Review due',
      value: !hasReviewData ? '—' : String(reviewDue),
      status: !hasReviewData ? 'neutral' : reviewDue > 0 ? 'risk' : 'good',
      sub: !hasReviewData
        ? { icon: Check, text: 'no review dates set', tone: 'neutral' }
        : reviewDue > 0
          ? { icon: ShieldAlert, text: 'past review date', tone: 'bad' }
          : { icon: Check, text: 'all current', tone: 'good' },
    }

    return [coverageKpi, ratingKpi, gapsKpi, reviewKpi]
  }, [summary, ratingSummary, standards])

  // ── Needs-attention items (most-urgent first, capped at 6) ─────────────────
  const attentionItems = useMemo(() => {
    if (!canEdit) return []
    const items = []

    // 1) Standards with no evidence → "«code» has no evidence".
    const noEvidence = standards.filter((s) => s.coverage === 'no-evidence')
    for (const s of noEvidence) {
      items.push({
        id: `gap-${s.id}`,
        tone: 'risk',
        sortKey: 0,
        title: `${s.code} has no evidence`,
        why: s.title,
        actions: [{ label: 'Add evidence', primary: true, onClick: () => setExpanded(s.id) }],
      })
    }

    // 2) Standards past their review date → "«code» review is due".
    const reviewDue = standards.filter((s) => s.reviewStatus === 'overdue')
    for (const s of reviewDue) {
      const days = typeof s.daysUntilReview === 'number' ? Math.abs(s.daysUntilReview) : null
      items.push({
        id: `review-${s.id}`,
        tone: 'watch',
        sortKey: 1,
        title: `${s.code} review is due`,
        why:
          days != null
            ? `${s.title} · ${days} day${days === 1 ? '' : 's'} past review date`
            : `${s.title} · past its review date`,
        actions: [{ label: 'Open', primary: false, onClick: () => setExpanded(s.id) }],
      })
    }

    return items.sort((a, b) => a.sortKey - b.sortKey).slice(0, 6)
  }, [standards, canEdit])

  // ── Gate ───────────────────────────────────────────────────────────────────
  if (notLicensed || notEntitled) return <GatePanel notLicensed={notLicensed} />

  const registerTable = (
    <StandardsTable
      standards={standards}
      loading={loading}
      error={error}
      canEdit={canEdit}
      reduce={reduce}
      expanded={expanded}
      onToggle={toggleExpanded}
      onEdit={openEdit}
      onDelete={onDelete}
    />
  )

  const expandedStandard = expanded ? standards.find((s) => s.id === expanded) : null

  return (
    <>
      <DomainCommandCenter
        eyebrow="Domain · Accreditation engine · system of record"
        title="Accreditation"
        Icon={BadgeCheck}
        attentionCount={attentionItems.length}
        kpis={kpis}
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        onNew={canEdit ? openAdd : null}
        registerTable={registerTable}
        attentionItems={attentionItems}
      />

      {/* Expanded standard → its evidence, shown as a light panel below the center
          (the register table rows can't host their own tbody sub-row cleanly, so the
          evidence for the open row lives here — the interaction is preserved). */}
      {expandedStandard ? (
        <div className="mx-auto max-w-[1180px] px-4 pb-8 sm:px-10">
          <motion.div
            layout={!reduce}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-2xl border-2 border-gold/20 bg-navy-gradient shadow-navy-glow"
          >
            <div className="flex items-center justify-between gap-3 px-6 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded-md border border-white/20 bg-white/5 px-2 py-0.5 text-[12px] font-semibold text-white/70">
                  {expandedStandard.code}
                </span>
                <span className="truncate text-[14px] font-semibold text-white">
                  {expandedStandard.title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(null)}
                aria-label="Close evidence panel"
                className="rounded-lg border-2 border-white/20 p-1.5 text-white/70 hover:border-gold/60 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <EvidencePanel
              key={expandedStandard.id}
              standardId={expandedStandard.id}
              canEdit={canEdit}
              reduce={reduce}
              listEvidenceSources={listEvidenceSources}
              listEvidence={listEvidence}
              createEvidence={createEvidence}
              updateEvidence={updateEvidence}
              removeEvidence={removeEvidence}
            />
          </motion.div>
        </div>
      ) : null}

      <StandardFormModal
        key={editing ? editing.id : 'new'}
        open={modalOpen}
        initial={initialForm}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
        reduce={reduce}
        standards={standards}
        editingId={editing ? editing.id : null}
      />
    </>
  )
}

export default function AccreditationPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <AccreditationWorkspace />
    </div>
  )
}

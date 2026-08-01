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
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useNavigate } from 'react-router-dom'
import EntityFormModal, { Field, Select, fieldInput, fieldTextarea } from '../components/ui/EntityFormModal.jsx'
import DomainCommandCenter from '../components/domain/DomainCommandCenter.jsx'
import ModuleTabs, { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import ModuleRegister from '../components/module/ModuleRegister.jsx'
import { moduleHue } from '../components/module/moduleAnatomy.js'
import AddDataTab from '../components/wizard/AddDataTab.jsx'
import DatePicker from '../components/ui/DatePicker.jsx'
import { formatShortDate } from '../lib/format.js'
import { useSchools } from '../context/SchoolContext.jsx'
import { useUiV2 } from '../context/UiFlagContext.jsx'
import { useAccreditation } from '../hooks/useAccreditation.js'
import { useReadinessTrend } from '../hooks/useReadinessTrend.js'
import { useAccreditationSignals } from '../hooks/useAccreditationSignals.js'
import { useEvidenceReadiness } from '../hooks/useEvidenceReadiness.js'
import { useCommendations } from '../hooks/useCommendations.js'
// ── Phase 3: framework catalog + rubric readiness + evidence warehouse ────────
import ReadinessHero from '../components/accreditation/ReadinessHero.jsx'
import AdoptFrameworkModal from '../components/accreditation/AdoptFrameworkModal.jsx'
import RubricPicker from '../components/accreditation/RubricPicker.jsx'
import SuggestionsStrip from '../components/accreditation/SuggestionsStrip.jsx'
import StandardDocuments from '../components/accreditation/StandardDocuments.jsx'
import StrategyLinkChip from '../components/accreditation/StrategyLinkChip.jsx'
// ── Phase B: the ten-domain grid + the operational signal binding ─────────────
import DomainGrid from '../components/accreditation/DomainGrid.jsx'
import SignalPanel from '../components/accreditation/SignalPanel.jsx'
// ── Phase C: evidence currency, auto-satisfaction, the index + commendations ──
import EvidenceReadinessTable from '../components/accreditation/EvidenceReadinessTable.jsx'
import CommendationsPanel from '../components/accreditation/CommendationsPanel.jsx'
import EvidenceDateField from '../components/accreditation/EvidenceDateField.jsx'
import CurrencyChip from '../components/accreditation/CurrencyChip.jsx'

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
    <div className="mx-auto max-w-page space-y-4 px-4 py-6 sm:px-10 sm:py-8">
      <BackLink />
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

export function StandardFormModal({ open, initial, onClose, onSave, reduce, standards = [], editingId = null }) {
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

// One stable key per attachable artifact (governance_report has a null sourceRef).
const attachKey = (src) => `${src.sourceType}:${src.sourceRef ?? ''}`

/** Binary evidence-gate chip for ASSURANCE leaves (e.g. Cognia COG-A1..A6).
 *  Assurances are excluded from ALL rubric/index/readiness math server-side, so
 *  rendering rubric pips on them would be a dead control — instead we mirror the
 *  hero assurances strip's satisfied/unmet gate state. `satisfied` mirrors
 *  computeAssurances: any attached evidence satisfies the gate. */
function AssuranceGateChip({ satisfied, dark = false }) {
  const Icon = satisfied ? Check : ShieldAlert
  return (
    <span
      title={
        satisfied
          ? 'Assurance satisfied — evidence attached'
          : 'Assurance gate — attach evidence to satisfy it'
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
        satisfied
          ? dark
            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
            : 'border-emerald-600/30 bg-emerald-50 text-emerald-700'
          : dark
            ? 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#fde68a]'
            : 'border-[#F59E0B]/40 bg-amber-50 text-amber-700'
      }`}
    >
      <Icon size={12} aria-hidden />
      {satisfied ? 'Assurance met' : 'Assurance unmet'}
    </span>
  )
}

/**
 * Phase C — "is this also in your accreditor's portal?", asked ONCE per artifact.
 *
 * TWO STATES, NOT THREE: checked asserts `true`, unchecked sends `null` — NOT
 * ASSERTED. We never record a "No" on the school's behalf, because the Evidence
 * Index prints this column for a visiting team and a fabricated "No" is a claim
 * the school never made, in front of the one audience that would act on it.
 */
function PortalAssertionField({ checked, onChange }) {
  return (
    <label className="col-span-2 flex items-start gap-2 text-[12.5px] leading-snug text-white/70">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[#F59E0B]"
      />
      <span>
        This also lives in our accreditor&apos;s portal
        <span className="ml-1 text-white/40">
          — leave it unchecked if you haven&apos;t checked; we&apos;ll print &ldquo;—&rdquo;, never
          &ldquo;No&rdquo;.
        </span>
      </span>
    </label>
  )
}

/** The lazy-loaded evidence sub-list for one expanded standard row (dark overlay
 *  panel — deliberately kept dark against the light table). Phase 3 adds the
 *  rubric pips + strategy link header, the deterministic suggestions strip, and
 *  the document upload/list section (all additive — the evidence list, add form,
 *  and source picker are unchanged). */
export function EvidencePanel({
  standardId,
  canEdit,
  reduce,
  listEvidence,
  listEvidenceSources,
  createEvidence,
  updateEvidence,
  removeEvidence,
  // ── Phase 3 (all optional — panel renders fine without them) ───────────────
  schoolId = null,
  standard = null,
  rubricLabels = null,
  onRubric = null,
  fetchSuggestions = null,
  linkStrategy = null,
  clearStrategy = null,
  // ── Phase B (optional) ─────────────────────────────────────────────────────
  // The operational-signal panel for THIS standard, composed by the page from the
  // one per-school /signals payload (no per-standard fetching, no extra request
  // when a row is expanded). Rendered between the rubric header strip and the
  // evidence list; absent → the panel simply isn't there and nothing else moves.
  signalPanel = null,
}) {
  const [items, setItems] = useState(null) // null = not yet loaded
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  // Phase C: `effectiveDate` is THE ONE FIELD we ask for — "which period does this
  // cover?". It sits BESIDE capturedAt and never replaces it: capturedAt is when we
  // captured the artifact, which is not a document date and is never read as one.
  const [form, setForm] = useState({
    title: '',
    kind: 'document',
    reference: '',
    capturedAt: '',
    effectiveDate: '',
    alsoInPortal: false,
  })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({
    title: '',
    kind: 'document',
    reference: '',
    capturedAt: '',
    effectiveDate: '',
    alsoInPortal: false,
  })
  const [err, setErr] = useState('')
  // "Attach from operations" picker: null = closed, undefined = loading, object = loaded sources.
  const [sources, setSources] = useState(null)
  const [picking, setPicking] = useState(false)
  const [attaching, setAttaching] = useState(null) // attachKey currently attaching (spinner)
  // Deterministic suggestions: null = loading, [] = none / not catalog-linked.
  const [suggestions, setSuggestions] = useState(null)

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

  // Suggestions ride the same lazy mount (catalog-linked standards only — the
  // endpoint returns [] for hand-made rows, so skip the round-trip client-side).
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (!fetchSuggestions || !standard?.catalogStandardId) {
        setSuggestions([])
        return
      }
      fetchSuggestions(standardId)
        .then((rows) => {
          if (!cancelled) setSuggestions(rows)
        })
        .catch(() => {
          if (!cancelled) setSuggestions([])
        })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standardId])

  const reload = async () => {
    const rows = await listEvidence(standardId)
    setItems(rows)
    if (fetchSuggestions && standard?.catalogStandardId) {
      try {
        setSuggestions(await fetchSuggestions(standardId))
      } catch {
        /* keep the stale strip — evidence itself reloaded fine */
      }
    }
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
  // auto-derives it from the artifact; kind is forced to 'link' server-side. The
  // virtual governance_report source carries NO sourceRef (omit it — the global
  // forbidNonWhitelisted pipe tolerates absence, the contract forbids a value).
  const attach = async (src) => {
    setAttaching(attachKey(src))
    setErr('')
    try {
      const body = { sourceType: src.sourceType }
      if (src.sourceRef) body.sourceRef = src.sourceRef
      await createEvidence(standardId, body)
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
        // Blank stays blank. An explicit null is "we don't know", which reads as
        // "date unknown" downstream and is excluded from every denominator — the
        // one thing we must never do here is substitute today's date.
        effectiveDate: form.effectiveDate ? form.effectiveDate : null,
        // TRUE or NOT ASSERTED. Unchecked sends null, never false: a school that
        // has not told us has not told us, and the Evidence Index prints "—".
        alsoInPortal: form.alsoInPortal ? true : null,
      })
      setForm({
        title: '',
        kind: 'document',
        reference: '',
        capturedAt: '',
        effectiveDate: '',
        alsoInPortal: false,
      })
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
      effectiveDate: ev.effectiveDate ?? '',
      alsoInPortal: ev.alsoInPortal === true,
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
        // Editable afterward, and clearable: an explicit null puts the artifact
        // back to "date unknown" rather than stranding a date the school retracted.
        effectiveDate: editForm.effectiveDate ? editForm.effectiveDate : null,
        // Retractable the same way: unchecking clears the assertion back to
        // "not asserted" rather than recording a "No" the school never made.
        alsoInPortal: editForm.alsoInPortal ? true : null,
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

  // One-click suggestion attach (leaves the "Attach from operations" picker alone).
  // Phase C FREE WIN: the matcher already computed which requirement this artifact
  // answers and used to throw it away at attach time. Persisting `tag` costs one
  // line and is what lets the Evidence Index group this artifact with the eight
  // other standards that ask for the same thing.
  const attachSuggestion = async (sug) => {
    const body = { sourceType: sug.sourceType }
    if (sug.sourceRef) body.sourceRef = sug.sourceRef
    if (sug.tag) body.tag = sug.tag
    await createEvidence(standardId, body)
    await reload()
  }
  const linkPlanFromSuggestion = linkStrategy
    ? async (sug) => {
        await linkStrategy(standardId, 'strategic_plan', sug.sourceRef)
      }
    : null

  return (
    <div className="border-t border-white/10 bg-navy/40 px-6 py-4">
      {/* ── Phase 3 header strip: rubric self-score + strategy link ─────────── */}
      {standard && (standard.isLeaf !== false || linkStrategy) ? (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {standard.isLeaf !== false ? (
            standard.isAssurance ? (
              // Assurance leaves are binary evidence gates — no rubric pips.
              <AssuranceGateChip dark satisfied={(standard.evidenceCount ?? 0) > 0} />
            ) : (
              <RubricPicker
                dark
                showLabel
                value={standard.rubricScore ?? null}
                labels={rubricLabels}
                activeLabel={standard.rubricLabel ?? null}
                disabled={!canEdit || !onRubric}
                onChange={onRubric ? (v) => onRubric(standard.id, v) : undefined}
              />
            )
          ) : null}
          {linkStrategy ? (
            <StrategyLinkChip
              schoolId={schoolId}
              standard={standard}
              canEdit={canEdit}
              onLink={linkStrategy}
              onClear={clearStrategy}
            />
          ) : null}
        </div>
      ) : null}

      {/* ── Phase B: the operating numbers this standard is judged against ──── */}
      {signalPanel}

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
                    {/* Phase C — editable afterward, and clearable back to blank. */}
                    <EvidenceDateField
                      className="col-span-2"
                      showHelp={false}
                      value={editForm.effectiveDate}
                      onChange={(v) => setEditForm((f) => ({ ...f, effectiveDate: v }))}
                    />
                    <PortalAssertionField
                      checked={editForm.alsoInPortal}
                      onChange={(v) => setEditForm((f) => ({ ...f, alsoInPortal: v }))}
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
                  {/* Phase C: the period this artifact covers, when the school told
                      us. Absent → nothing is shown; we never print an upload date
                      here to fill the space. */}
                  {ev.effectiveDate ? (
                    <span
                      title="Which period this covers"
                      className="shrink-0 rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/60"
                    >
                      covers {formatShortDate(String(ev.effectiveDate).slice(0, 10))}
                    </span>
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
            {/* Phase C — THE ONE FIELD, asked at attach time. Optional by design:
                blank is an explicitly safe answer that reads "date unknown", and a
                guessed date is worse than none because it produces a confident
                "Current" nobody can defend. */}
            <EvidenceDateField
              className="col-span-2"
              value={form.effectiveDate}
              onChange={(v) => setForm((f) => ({ ...f, effectiveDate: v }))}
            />
            <PortalAssertionField
              checked={form.alsoInPortal}
              onChange={(v) => setForm((f) => ({ ...f, alsoInPortal: v }))}
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

      {/* ── Phase 3: deterministic evidence suggestions (catalog-linked only) ── */}
      {standard?.catalogStandardId ? (
        <div className="mt-3">
          <SuggestionsStrip
            suggestions={suggestions}
            canEdit={canEdit}
            onAttach={attachSuggestion}
            onLinkPlan={linkPlanFromSuggestion}
          />
        </div>
      ) : null}

      {/* ── Phase 3: file evidence via the CORE knowledge store ──────────────── */}
      {schoolId ? (
        <div className="mt-4 border-t border-white/10 pt-4">
          <StandardDocuments
            schoolId={schoolId}
            standardId={standardId}
            canEdit={canEdit}
            createEvidence={createEvidence}
            onChanged={reload}
          />
        </div>
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

/** Grouped picker of the school's operational artifacts (policies, board reports,
 *  approved meeting minutes, strategic plans, knowledge documents, and the live
 *  governance report). New groups carry {id,label,date}-shaped rows off the
 *  evidence-sources siblings — normalized here to the {sourceType,sourceRef}
 *  attach contract; the existing policies/boardReports rows pass through as-is. */
function SourcePicker({ sources, attaching, err, reduce, onAttach, onClose }) {
  const loading = sources === undefined
  const groups = [
    { key: 'policies', label: 'Governance policies', empty: 'No policies yet' },
    { key: 'boardReports', label: 'Board reports', empty: 'No board reports yet' },
    {
      key: 'meetings',
      label: 'Meeting minutes (approved)',
      empty: 'No approved minutes yet',
      sourceType: 'meeting',
    },
    {
      key: 'strategicPlans',
      label: 'Strategic plans',
      empty: 'No strategic plans yet',
      sourceType: 'strategic_plan',
    },
    {
      key: 'knowledgeDocuments',
      label: 'Knowledge documents',
      empty: 'No documents in the library yet',
      sourceType: 'knowledge_document',
    },
  ]
  // The live governance report is a VIRTUAL artifact (no sourceRef) — one row
  // when the school has a governance roster.
  const governanceRows = sources?.governanceReport?.available
    ? [
        {
          sourceType: 'governance_report',
          sourceRef: null,
          label: 'Governance report — board roster, committees, minutes discipline (live)',
          date: null,
        },
      ]
    : []
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
              // Normalize {id,…} rows from the new sibling groups to the
              // {sourceType,sourceRef} attach contract; legacy rows pass through.
              const list = (sources?.[g.key] ?? []).map((src) => ({
                ...src,
                sourceType: src.sourceType ?? g.sourceType,
                sourceRef: src.sourceRef ?? src.id ?? null,
              }))
              // The legacy groups keep their friendly empty rows; new empty
              // groups vanish so the picker stays scannable.
              if (list.length === 0 && g.sourceType) return null
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
                        <li key={attachKey(src)}>
                          <button
                            type="button"
                            disabled={attaching !== null}
                            onClick={() => onAttach(src)}
                            className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-navy/50 px-3 py-2 text-left hover:border-gold/50 hover:bg-navy/70 disabled:opacity-50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] text-white/85">
                                {src.label}
                                {src.fiveYear ? (
                                  <span className="ml-1.5 rounded-md border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-gold-light">
                                    5-year
                                  </span>
                                ) : null}
                              </span>
                              {src.date ? (
                                <span className="block text-[11px] text-white/45">{src.date}</span>
                              ) : null}
                            </span>
                            <span className="shrink-0 text-[12px] font-semibold text-gold-light">
                              {attaching === attachKey(src) ? 'Attaching…' : 'Attach'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}

            {/* The live governance report — one click, no sourceRef (virtual). */}
            {governanceRows.length ? (
              <div>
                <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/50">
                  Governance report
                </h3>
                <ul className="space-y-1.5">
                  {governanceRows.map((src) => (
                    <li key={attachKey(src)}>
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
                        </span>
                        <span className="shrink-0 text-[12px] font-semibold text-gold-light">
                          {attaching === attachKey(src) ? 'Attaching…' : 'Attach'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
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
  labelsFor = null, // (standard) => rubricLabels[4] | null — per-row framework labels
  onRubric = null,
  // Phase C: standardId → the WORST currency state among the required artifacts
  // this standard is served by, straight off the evidence-readiness payload. A
  // standard with no requirement rows is simply absent from the map and renders no
  // chip at all — sparseness holds, and the row looks exactly as it did before.
  currencyByStandard = null,
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
              id={`accr-std-${s.id}`}
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
                  {s.strategySourceRef ? (
                    <span className="ml-2 inline-flex align-middle">
                      <StrategyLinkChip light standard={s} canEdit={false} />
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3">
                {s.isLeaf === false ? (
                  <RollupBadge leafSummary={s.leafSummary} />
                ) : (
                  <div className="flex flex-col items-start gap-1.5">
                    <RatingBadge rating={s.rating} />
                    {s.isAssurance ? (
                      // Assurance leaves are binary evidence gates — rubric pips
                      // would be a dead control (excluded from index/readiness).
                      <AssuranceGateChip satisfied={(s.evidenceCount ?? 0) > 0} />
                    ) : (
                      <RubricPicker
                        value={s.rubricScore ?? null}
                        labels={labelsFor ? labelsFor(s) : null}
                        activeLabel={s.rubricLabel ?? null}
                        disabled={!canEdit || !onRubric}
                        onChange={onRubric ? (v) => onRubric(s.id, v) : undefined}
                      />
                    )}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col items-start gap-1.5">
                  <CoverageBadge coverage={s.coverage} evidenceCount={s.evidenceCount} />
                  {/* COVERAGE AND CURRENCY ARE TWO QUESTIONS AND ARE NEVER BLENDED:
                      "Evidenced" says something is attached, this chip says whether
                      what a visiting team would ask for is still in date. */}
                  {currencyByStandard?.[s.id] ? (
                    <CurrencyChip
                      size="sm"
                      state={currencyByStandard[s.id].state}
                      expiresOn={currencyByStandard[s.id].expiresOn}
                      showDate
                    />
                  ) : null}
                </div>
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

// ── Phase B: the tab list SPLITS in two (the one gotcha of this phase) ───────
// One shared TABS array used to feed both the command center and the Records
// register. Adding 'domains' to it would have put the ten-domain grid inside the
// Records register, which is a standards TABLE and nothing else. So:
//   REGISTER_TABS — what the Records tab offers (unchanged: one register)
//   CENTER_TABS   — what the overview offers (the register + the domain grid)
// DomainCommandCenter renders an underlined tab bar as soon as tabs.length > 1,
// so the bar appears with no component change; ModuleRegister keeps its single
// register and falls back to 'standards' if the shared tab state says 'domains'.
// Phase C adds a THIRD overview tab — Evidence — for the same reason Domains got
// its own: the evidence index is grouped BY ARTIFACT ACROSS STANDARDS, which is
// the opposite axis to the standards table and cannot be a column on it. Records
// still hosts exactly one register.
const REGISTER_TABS = [{ key: 'standards', label: 'Standards' }]
const CENTER_TABS = [
  { key: 'standards', label: 'Standards' },
  { key: 'domains', label: 'Domains' },
  { key: 'evidence', label: 'Evidence' },
]

function AccreditationWorkspace() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()
  const uiV2 = useUiV2()

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
    // Phase 3: framework catalog + rubric readiness
    readiness,
    frameworks,
    loadFrameworks,
    adoptFramework,
    setReadinessTarget,
    setRubric,
    fetchSuggestions,
    linkStrategy,
  } = useAccreditation(schoolId)

  // Phase A: the recorded readiness history, passed straight through to the hero
  // (fail-soft on its own — a history hiccup never blanks the register). Gated on
  // the module check the page has ALREADY made: hooks run before this component's
  // entitlement early-return, so without the gate a finance-only tenant would
  // fire two extra requests that both 402.
  const history = useReadinessTrend(schoolId, {
    enabled: !loading && !notLicensed && !notEntitled,
  })

  // Phase B: the OPERATIONAL SIGNALS bound to this school's standards — one
  // request for the whole page, sliced below into the domain cards and the open
  // standard's drawer. Gated on the same already-made module check as the history
  // hook, for the same reason (hooks run above the page's entitlement return).
  const signals = useAccreditationSignals(schoolId, {
    enabled: !loading && !notLicensed && !notEntitled,
  })

  // Phase C: the EVIDENCE READINESS payload — one request for the whole page, used
  // by the Evidence tab AND by the per-row currency chip on the standards register
  // (which is why it is not deferred until the tab is opened). Gated on the same
  // already-made module check as the two hooks above, for the same reason.
  const evidence = useEvidenceReadiness(schoolId, {
    enabled: !loading && !notLicensed && !notEntitled,
  })

  // Phase C: the strengths surface. Separate endpoint because it needs the signals
  // service AND the currency service; separate hook because a commendations hiccup
  // must never take the evidence index down with it.
  const commendations = useCommendations(schoolId, {
    enabled: !loading && !notLicensed && !notEntitled,
  })

  const [tab, setTab] = useState('standards')
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(null) // the expanded standard id, or null
  const [adoptOpen, setAdoptOpen] = useState(false)

  // "+ Add" now launches the multi-step batch wizard (Add-data tab, deep-linked);
  // the modal below stays for EDITING an existing standard.
  const openAdd = () => navigate('/accreditation?tab=add&add=standard')
  const openEdit = (s) => {
    setEditing(s)
    setModalOpen(true)
  }
  const toggleExpanded = (id) => setExpanded((cur) => (cur === id ? null : id))

  // ── Phase 3 derived state ──────────────────────────────────────────────────
  // A framework is "adopted" when any standard carries a frameworkId.
  const adopted = useMemo(() => standards.some((s) => s.frameworkId), [standards])
  // Per-row rubric labels: the readiness payload carries the DOMINANT framework's
  // labels, which are only correct for rows of that framework (or hand-made rows
  // with no framework link). A row adopted from a DIFFERENT framework (a school
  // may adopt several) must not borrow them — its own server-resolved
  // s.rubricLabel still names the active score via RubricPicker's activeLabel.
  const readinessFrameworkId = readiness?.framework?.id ?? null
  const rubricLabels = readiness?.framework?.rubricLabels ?? null
  const labelsFor = useCallback(
    (s) => (!s?.frameworkId || s.frameworkId === readinessFrameworkId ? rubricLabels : null),
    [readinessFrameworkId, rubricLabels],
  )

  const openAdoptModal = () => {
    setAdoptOpen(true)
    loadFrameworks() // lazy fetch — fail-soft to []
  }

  // Gap-list / assurance deep-scroll: expand the standard's evidence panel and
  // scroll its register row into view.
  const scrollToStandard = useCallback(
    (standardId) => {
      setTab('standards')
      setExpanded(standardId)
      window.setTimeout(() => {
        document
          .getElementById(`accr-std-${standardId}`)
          ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
      }, 80)
    },
    [reduce],
  )

  const clearStrategy = (standardId) => linkStrategy(standardId, null)

  // ── Phase C: keep the currency surfaces honest after an evidence write ──────
  // useAccreditation's evidence mutators refresh the register's coverage counts
  // but know nothing about the Phase-C endpoints, and a stale Evidence tab after
  // dating an artifact is exactly the kind of quiet lie this phase exists to
  // remove. Wrapping here (rather than editing the shared hook) keeps the change
  // inside this page and leaves every other consumer byte-identical. Fail-soft:
  // both refreshes swallow their own errors, so a currency hiccup can never make
  // an evidence write appear to have failed.
  // Depend on the two REFRESH functions, not on the hook objects: the hooks return
  // a fresh object literal every render, so closing over them would rebuild this
  // callback (and both wrappers below) on every keystroke in the evidence form.
  const refreshEvidenceReadiness = evidence.refresh
  const refreshCommendations = commendations.refresh
  const afterEvidenceWrite = useCallback(() => {
    refreshEvidenceReadiness()
    refreshCommendations()
  }, [refreshEvidenceReadiness, refreshCommendations])

  const createEvidenceAndRefresh = useCallback(
    async (standardId, body) => {
      const res = await createEvidence(standardId, body)
      afterEvidenceWrite()
      return res
    },
    [createEvidence, afterEvidenceWrite],
  )

  const updateEvidenceAndRefresh = useCallback(
    async (standardId, evidenceId, body) => {
      const res = await updateEvidence(standardId, evidenceId, body)
      afterEvidenceWrite()
      return res
    },
    [updateEvidence, afterEvidenceWrite],
  )

  const removeEvidenceAndRefresh = useCallback(
    async (standardId, evidenceId) => {
      const res = await removeEvidence(standardId, evidenceId)
      afterEvidenceWrite()
      return res
    },
    [removeEvidence, afterEvidenceWrite],
  )

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

    // 5) Documented / Defensible (Phase A) — once a framework is adopted. This
    //    slot deliberately does NOT carry the blended readiness percentage: a
    //    single number that averages "what you claim" with "what you can prove"
    //    reads as a grade and hides the only figure an accreditor will press on,
    //    which is the DIFFERENCE between the two. Same source and same instant as
    //    the hero's ProvenancePair directly below it. The grid flexes to 5-up
    //    (DomainCommandCenter handles cols).
    if (adopted && readiness) {
      const documented = typeof readiness.selfScoredPct === 'number' ? readiness.selfScoredPct : null
      const defensible = typeof readiness.verifiedPct === 'number' ? readiness.verifiedPct : null
      const scored = readiness.scoredCount ?? 0
      const covered = readiness.coveredCount ?? 0
      const rLeaves = readiness.leafCount ?? 0
      const hasPair = documented != null && defensible != null
      const spread = hasPair ? documented - defensible : null
      return [
        coverageKpi,
        ratingKpi,
        gapsKpi,
        reviewKpi,
        {
          label: 'Documented / Defensible',
          value: hasPair ? `${documented} / ${defensible}` : '—',
          status:
            !hasPair || rLeaves === 0
              ? 'neutral'
              : defensible >= 80
                ? 'good'
                : defensible >= 50
                  ? 'watch'
                  : 'risk',
          sub: !hasPair
            ? { icon: BadgeCheck, text: 'not available yet', tone: 'neutral' }
            : spread > 0
              ? {
                  icon: TrendingDown,
                  text: `${scored} scored · ${covered} evidenced of ${rLeaves}`,
                  tone: spread >= 20 ? 'bad' : 'neutral',
                }
              : {
                  icon: Check,
                  text: `${scored} scored · ${covered} evidenced of ${rLeaves}`,
                  tone: 'good',
                },
        },
      ]
    }

    return [coverageKpi, ratingKpi, gapsKpi, reviewKpi]
  }, [summary, ratingSummary, standards, adopted, readiness])

  // ── Needs-attention items (most-urgent first, capped at 6) ─────────────────
  // Phase 3: readiness entries are composed CLIENT-SIDE from the readiness
  // endpoint (the frozen decision — briefing.service.ts is untouched this phase):
  // unmet assurances upgrade their no-evidence row, unscored top gaps append.
  const attentionItems = useMemo(() => {
    if (!canEdit) return []
    const items = []
    const assuranceUnmet = new Map(
      (readiness?.assurances ?? []).filter((a) => !a.satisfied).map((a) => [a.standardId, a]),
    )

    // 1) Standards with no evidence → "«code» has no evidence" (assurance gates
    //    get their sharper binary-gate framing).
    const noEvidence = standards.filter((s) => s.coverage === 'no-evidence')
    for (const s of noEvidence) {
      const isGate = assuranceUnmet.has(s.id)
      items.push({
        id: `gap-${s.id}`,
        tone: 'risk',
        sortKey: isGate ? -1 : 0,
        title: isGate ? `Assurance ${s.code} is unmet` : `${s.code} has no evidence`,
        why: isGate ? `${s.title} · binary accreditation gate — attach evidence` : s.title,
        actions: [{ label: 'Add evidence', primary: true, onClick: () => scrollToStandard(s.id) }],
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

    // 3) Unscored top readiness gaps → "«code» is unscored" (skip standards
    //    already surfaced above so the rail never repeats itself).
    const usedIds = new Set([...noEvidence.map((s) => s.id), ...reviewDue.map((s) => s.id)])
    for (const g of readiness?.gaps ?? []) {
      if (g.rubricScore != null || usedIds.has(g.standardId)) continue
      const lift = typeof g.fullLift === 'number' ? Math.round(g.fullLift * 10) / 10 : null
      items.push({
        id: `score-${g.standardId}`,
        tone: 'watch',
        sortKey: 2,
        title: `${g.code} is unscored`,
        why: lift != null ? `${g.title} · worth +${lift} index pts at full marks` : g.title,
        actions: [
          { label: 'Score it', primary: true, onClick: () => scrollToStandard(g.standardId) },
        ],
      })
    }

    return items.sort((a, b) => a.sortKey - b.sortKey).slice(0, 6)
  }, [standards, canEdit, readiness, scrollToStandard])

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
      labelsFor={labelsFor}
      onRubric={canEdit ? setRubric : null}
      currencyByStandard={evidence.byStandard}
    />
  )

  const expandedStandard = expanded ? standards.find((s) => s.id === expanded) : null

  // ── Phase B: the Domains tab ───────────────────────────────────────────────
  // Rendered in the command center's register slot when the Domains tab is
  // active. It reads the SAME readiness payload the hero reads, so a card can
  // never describe a different population than the number above it.
  const domainGrid = (
    <DomainGrid
      readiness={readiness}
      signals={signals.signals}
      byDomain={signals.byDomain}
      signalsLoading={signals.loading}
      signalsUnavailable={Boolean(signals.notLicensed || signals.error)}
      onOpenStandards={() => setTab('standards')}
      reduce={reduce}
    />
  )

  // ── Phase C: the Evidence tab ──────────────────────────────────────────────
  // Requirement-driven and grouped BY TAG ACROSS STANDARDS — the axis the
  // standards table cannot express. COMMENDATIONS LEAD: a visiting team writes
  // commendations before recommendations, and every other panel on this page is
  // about what is missing, so the strengths surface sits above the ask list rather
  // than buried under it.
  const evidenceTab = (
    <EvidenceReadinessTable
      health={evidence.health}
      counts={evidence.counts}
      groups={evidence.groups}
      nudges={evidence.nudges}
      framework={evidence.framework}
      loading={evidence.loading}
      error={evidence.error}
      notLicensed={evidence.notLicensed}
      printHref="/accreditation/evidence/print"
      onOpenStandard={scrollToStandard}
      strengths={
        <CommendationsPanel
          commendations={commendations.commendations}
          exclusions={commendations.exclusions}
          caveat={commendations.caveat}
          signalsUnavailable={commendations.signalsUnavailable}
          loading={commendations.loading}
          error={commendations.error}
          notLicensed={commendations.notLicensed}
        />
      }
    />
  )

  // ── Phase B: the open standard's signal slice ──────────────────────────────
  // byStandard is the server's catalog-derived index; the row's own signalKeys
  // (StandardPublic) carry the same catalog truth and are the fallback when the
  // /signals call is degraded — so the panel can still say "3 signals bound"
  // rather than falsely reporting that nothing is bound to this standard.
  const expandedBoundKeys = expandedStandard
    ? (signals.byStandard?.[expandedStandard.id] ?? expandedStandard.signalKeys ?? [])
    : []
  const expandedBoundSet = new Set(expandedBoundKeys)
  // Registry order, exactly as the server sorted it — the same order every other
  // metric surface uses.
  const expandedSignalRows = signals.signals.filter((s) => expandedBoundSet.has(s.key))

  // ── Phase 3 hero — readiness dial once adopted, adopt prompt otherwise ─────
  const readinessHero = (
    <ReadinessHero
      readiness={readiness}
      adopted={adopted}
      canEdit={canEdit}
      onAdopt={openAdoptModal}
      onSelectTarget={setReadinessTarget}
      onGapClick={scrollToStandard}
      reduce={reduce}
      history={history}
    />
  )

  const commandCenter = (
    <DomainCommandCenter
      showAddData
      moduleKey="accreditation"
      eyebrow="Domain · Accreditation engine · system of record"
      title="Accreditation"
      Icon={BadgeCheck}
      attentionCount={attentionItems.length}
      kpis={kpis}
      tabs={CENTER_TABS}
      activeTab={tab}
      onTabChange={setTab}
      onNew={canEdit ? openAdd : null}
      registerTable={
        tab === 'domains' ? domainGrid : tab === 'evidence' ? evidenceTab : registerTable
      }
      attentionItems={attentionItems}
      aboveKpis={readinessHero}
      headerAside={
        canEdit && adopted ? (
          <button
            type="button"
            onClick={openAdoptModal}
            className="inline-flex items-center gap-1.5 rounded-full border border-rule/70 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-navy transition hover:border-[#F59E0B]/60"
          >
            <Award size={14} className="text-[#F59E0B]" /> Frameworks
          </button>
        ) : null
      }
    />
  )

  const overlays = (
    <>
      {/* Expanded standard → its evidence, shown as a light panel below the center
          (the register table rows can't host their own tbody sub-row cleanly, so the
          evidence for the open row lives here — the interaction is preserved). */}
      {expandedStandard ? (
        <div className="mx-auto max-w-page px-4 pb-8 sm:px-10">
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
              createEvidence={createEvidenceAndRefresh}
              updateEvidence={updateEvidenceAndRefresh}
              removeEvidence={removeEvidenceAndRefresh}
              schoolId={schoolId}
              standard={expandedStandard}
              rubricLabels={labelsFor(expandedStandard)}
              onRubric={canEdit ? setRubric : null}
              fetchSuggestions={fetchSuggestions}
              linkStrategy={linkStrategy}
              clearStrategy={clearStrategy}
              signalPanel={
                <SignalPanel
                  rows={expandedSignalRows}
                  boundKeys={expandedBoundKeys}
                  period={signals.period}
                  loading={signals.loading}
                  error={signals.error}
                  notLicensed={signals.notLicensed}
                />
              }
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

      <AdoptFrameworkModal
        open={adoptOpen}
        onClose={() => setAdoptOpen(false)}
        frameworks={frameworks}
        onAdopt={adoptFramework}
        reduce={reduce}
      />
    </>
  )

  if (uiV2) {
    return (
      <ModuleAccent moduleKey="accreditation">
        <ModuleTabs
          moduleKey="accreditation"
          overview={commandCenter}
          addData={<AddDataTab module="accreditation" schoolId={schoolId} canEdit={canEdit} />}
          records={
            <ModuleRegister
              moduleKey="accreditation"
              hue={moduleHue('accreditation')}
              tabs={REGISTER_TABS}
              // The Records tab hosts the standards register and nothing else, so
              // a shared 'domains' / 'evidence' selection falls back rather than
              // rendering an active tab that isn't in its list.
              activeTab={tab === 'domains' || tab === 'evidence' ? 'standards' : tab}
              onTabChange={setTab}
              onNew={canEdit ? openAdd : null}
              registerTable={registerTable}
            />
          }
        />
        {overlays}
      </ModuleAccent>
    )
  }

  return (
    <>
      {commandCenter}
      {overlays}
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

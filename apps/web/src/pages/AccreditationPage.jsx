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
// operations" SourcePicker). Premium UI P4 (a2): the evidence drawer and the
// source picker are light float Panels now (hairline, one radius, --sh-float);
// the standard create/edit form rides the shared EntityFormModal.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  Award,
  BadgeCheck,
  BookOpen,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  FileText,
  Gauge,
  Landmark,
  Layers,
  Link as LinkIcon,
  ListChecks,
  Paperclip,
  Pencil,
  Plus,
  Route,
  ShieldAlert,
  StickyNote,
  Trash2,
  TrendingUp,
  User as UserIcon,
  X,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EntityFormModal, { Field, Select, fieldInput, fieldTextarea } from '../components/ui/EntityFormModal.jsx'
import DomainCommandCenter, { DomainStatePanel } from '../components/domain/DomainCommandCenter.jsx'
import { Panel, Button, Pill } from '../components/ui/surface/index.js'
import useDtOverflow from '../components/ui/surface/useDtOverflow.js'
import '../styles/pending/a2-carry.css'
import '../styles/pending/aurora-accred.css'
import { AuroraButton, AuroraTile, AuroraTileGrid, HowThisWorks, VerdictEm } from '../components/ui/aurora/index.js'
import DomainResolvePanel from '../components/accreditation/DomainResolvePanel.jsx'
import StandardImprovePanel from '../components/accreditation/StandardImprovePanel.jsx'
import ModuleTabs, { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import ModuleRegister from '../components/module/ModuleRegister.jsx'
import RegisterEmpty from '../components/module/RegisterEmpty.jsx'
import { moduleHue } from '../components/module/moduleAnatomy.js'
import AddDataTab from '../components/wizard/AddDataTab.jsx'
import DatePicker from '../components/ui/DatePicker.jsx'
import { formatShortDate } from '../lib/format.js'
import { useSchools } from '../context/SchoolContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useUiV2 } from '../context/UiFlagContext.jsx'
import { useAccreditation } from '../hooks/useAccreditation.js'
import { accreditationApi, schoolsApi } from '../lib/api.js'
import { memberLabel } from '../lib/memberLabels.js'
import {
  frameworkPillLabel,
  frameworkPillLabels,
  buildRubricLabelsByFrameworkId,
  labelsForStandard,
} from '../lib/frameworkLabels.js'
import { useReadinessTrend } from '../hooks/useReadinessTrend.js'
import { useAccreditationSignals } from '../hooks/useAccreditationSignals.js'
import { useEvidenceReadiness } from '../hooks/useEvidenceReadiness.js'
import { useCommendations } from '../hooks/useCommendations.js'
// ── F1 The Journey: the six-year cycle payload + the tab that paints it ───────
import { useAccreditationCycle } from '../hooks/useAccreditationCycle.js'
import JourneyTab from '../components/accreditation/JourneyTab.jsx'
// ── F3: the plain-language explainer (the expanded row's second flip) ─────────
import ExplainerDrawer from '../components/accreditation/ExplainerDrawer.jsx'
// ── Accreditor-recognition badges (NCPSA / ICAISA) ────────────────────────────
import RecognitionChips from '../components/accreditation/RecognitionChips.jsx'
import EvidencePlatformChip from '../components/accreditation/EvidencePlatformChip.jsx'
// ── Phase 3: framework catalog + rubric readiness + evidence warehouse ────────
import ReadinessHero from '../components/accreditation/ReadinessHero.jsx'
import ReadinessDial from '../components/accreditation/ReadinessDial.jsx'
import CycleStepper from '../components/accreditation/CycleStepper.jsx'
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
// AIC Phase F — the prior visiting-team findings register (Evidence tab).
import PriorVisitPanel from '../components/accreditation/PriorVisitPanel.jsx'
import CommendationsPanel from '../components/accreditation/CommendationsPanel.jsx'
import EvidenceDateField from '../components/accreditation/EvidenceDateField.jsx'
import CurrencyChip from '../components/accreditation/CurrencyChip.jsx'
// ── Phase E: the EARLY WARNING ENGINE (the digital twin) ─────────────────────
// The attention rail on this page IS the early-warning UI. Everything below reads
// ONE payload (useAccreditationTwin) and renders it verbatim: rationales,
// consequences, unlock copy, driver details and not-evaluated messages are all
// server-composed. Nothing here turns an ordinal likelihood into a percentage,
// invents a horizon, or renders a rule we could not evaluate as a passing check.
import { useAccreditationTwin } from '../hooks/useAccreditationTwin.js'
import { DemoChip } from '../components/accreditation/ReadinessTrendStrip.jsx'
import DomainBandStrip from '../components/accreditation/DomainBandStrip.jsx'
import RiskChip from '../components/accreditation/RiskChip.jsx'
import SignalCoverageTable from '../components/accreditation/SignalCoverageTable.jsx'
import HorizonTimeline from '../components/accreditation/HorizonTimeline.jsx'
import CoverageCta from '../components/accreditation/CoverageCta.jsx'
import NamedHolesPanel from '../components/accreditation/NamedHolesPanel.jsx'
import ImprovementPlaceholder, { improvementCandidates } from '../components/accreditation/ImprovementPlaceholder.jsx'
import { mergeAttentionRail } from '../components/accreditation/attentionRail.js'
import {
  actionsForFinding,
  NOT_YET_RECORDED_TOOLTIP,
  SEVERITY_RANK,
  SEVERITY_TONE,
} from '../components/accreditation/ruleActions.js'

// ── Register badges: status Pills (Premium UI P4) — a 2px mark + ink text,
//    never a tinted chip. `tone` is the mark's colour; the WORD is always printed.
const COVERAGE_BADGE = {
  'no-evidence': { label: 'No evidence', tone: 'watch' },
  covered: { label: 'Evidenced', tone: 'good' },
}

const REVIEW_BADGE = {
  overdue: { label: 'Review overdue', tone: 'risk' },
  'due-soon': { label: 'Review approaching', tone: 'watch' },
  current: { label: 'Review current', tone: 'good' },
  unknown: { label: 'No review date', tone: 'neutral' },
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
  met: { label: 'Met', tone: 'good' },
  partially_met: { label: 'Partially met', tone: 'watch' },
  not_met: { label: 'Not met', tone: 'risk' },
  not_started: { label: 'Not started', tone: 'neutral' },
}

function RatingBadge({ rating }) {
  const b = RATING_BADGE[rating] ?? RATING_BADGE.not_started
  return (
    <Pill variant="status" tone={b.tone}>
      {b.label}
    </Pill>
  )
}

/** A parent standard's rating rollup over its descendant leaves ("3/5 met · 70%"). */
function RollupBadge({ leafSummary }) {
  if (!leafSummary || leafSummary.leafCount === 0) return null
  const { metCount, leafCount, ratingCoveragePct } = leafSummary
  return (
    <Pill variant="count" title={`${metCount} of ${leafCount} indicators met · ${ratingCoveragePct}% weighted`}>
      {metCount}/{leafCount} met · {ratingCoveragePct}%
    </Pill>
  )
}

function CoverageBadge({ coverage, evidenceCount }) {
  const b = COVERAGE_BADGE[coverage] ?? COVERAGE_BADGE['no-evidence']
  return (
    <Pill variant="status" tone={b.tone} title={`${evidenceCount} evidence item${evidenceCount === 1 ? '' : 's'}`}>
      {b.label}
      {coverage === 'covered' ? ` · ${evidenceCount}` : ''}
    </Pill>
  )
}

function ReviewBadge({ status, reviewDate, daysUntilReview }) {
  if (status === 'unknown') return <span className="text-[12px] text-ink2">—</span>
  const b = REVIEW_BADGE[status] ?? REVIEW_BADGE.unknown
  let suffix = ''
  if (status === 'due-soon' && typeof daysUntilReview === 'number') suffix = ` · in ${daysUntilReview}d`
  else if (status === 'overdue' && typeof daysUntilReview === 'number')
    suffix = ` · ${Math.abs(daysUntilReview)}d ago`
  return (
    <Pill variant="status" tone={b.tone} title={reviewDate ? `Review date: ${reviewDate}` : ''}>
      {b.label}
      {suffix}
    </Pill>
  )
}

// ── The register table primitives — the shared `.dt` discipline (Premium UI
//    P3/P4): sticky caps head on the ground, 36px hairline rows, numerics right. ─
function Th({ children, right }) {
  return (
    <th scope="col" className={right ? 'dt-num' : undefined}>
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
      className={`btn btn-quiet btn-sm !px-1.5 ${danger ? 'hover:!text-risk' : ''}`}
    >
      <ActionIcon size={15} />
    </button>
  )
}

function TableShell({ children, cols }) {
  const wrapRef = useDtOverflow([children])
  return (
    <div ref={wrapRef} className="dt-wrap">
      <table className="dt">
        <thead>
          <tr>{cols}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function StateRow({ children }) {
  return <div className="border-y border-hair px-6 py-12 text-center">{children}</div>
}

// ── Light-theme entitlement / license gate ───────────────────────────────────
// ── Entitlement / license gate: the Aurora band + one line + one button ─────
function GatePanel({ notLicensed }) {
  const { activeSchool } = useSchools()
  const isOwner = activeSchool?.role === 'owner'
  return (
    <ModuleAccent moduleKey="accreditation">
      <DomainStatePanel
        showBack
        moduleKey="accreditation"
        title="Accreditation"
        icon={BadgeCheck}
        verdict={notLicensed ? 'Accreditation isn\u2019t on your plan yet.' : 'Your subscription is paused.'}
        // Only an owner can change the plan, so only an owner gets the button —
        // everyone else gets the one true next step in words (no dead button).
        primaryAction={
          isOwner ? (
            <AuroraButton variant="primary" to="/settings/billing" icon={<CreditCard size={19} aria-hidden="true" />}>
              {notLicensed ? 'See plans' : 'Resume your plan'}
            </AuroraButton>
          ) : null
        }
        text={
          !isOwner
            ? notLicensed
              ? 'Ask an owner to add Accreditation.'
              : 'Ask an owner to resume your plan.'
            : notLicensed
              ? 'Add Accreditation to score your standards, attach proof and watch readiness build.'
              : 'Resume your plan to manage accreditation.'
        }
      />
    </ModuleAccent>
  )
}

const EMPTY_FORM = {
  code: '',
  title: '',
  category: '',
  parentId: '',
  rating: 'not_started',
  reviewDate: '',
  // F2 delegation: a VALIDATED member (uuid) is the real owner; the legacy
  // free-text `owner` survives as the "not a member" fallback (a diocesan
  // consultant, a committee that isn't a login). The picker offers both.
  ownerUserId: '',
  owner: '',
  notes: '',
}

// The Owner select's "someone who isn't a member" sentinel — never sent.
const OWNER_FREE_TEXT = '__free_text__'

function toStandardBody(form) {
  return {
    code: form.code.trim(),
    title: form.title.trim(),
    category: form.category.trim() ? form.category.trim() : null,
    parentId: form.parentId ? form.parentId : null,
    rating: form.rating || 'not_started',
    reviewDate: form.reviewDate ? form.reviewDate : null,
    // Explicit null CLEARS (the API contract) — picking a member clears the
    // free text and vice versa, so the register never shows two owners.
    ownerUserId: form.ownerUserId && form.ownerUserId !== OWNER_FREE_TEXT ? form.ownerUserId : null,
    owner:
      (!form.ownerUserId || form.ownerUserId === OWNER_FREE_TEXT) && form.owner.trim()
        ? form.owner.trim()
        : null,
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

export function StandardFormModal({
  open,
  initial,
  onClose,
  onSave,
  reduce,
  standards = [],
  editingId = null,
  // F2 — the members roster for the Owner picker (memberLabel'd). Empty for a
  // viewer or while loading; the free-text fallback always remains.
  members = [],
}) {
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
        {/* THE MEMBER PICKER (F2). The bare free-text input asked an owner to
            remember a colleague's exact spelling; the roster + memberLabel
            ("Jo Ruiz — Business Manager") is how every other assignment surface
            already asks. Free text survives as the explicit "not a member" row
            — a consultant or a committee is a legitimate owner with no login. */}
        <Select
          value={form.ownerUserId || (form.owner ? OWNER_FREE_TEXT : '')}
          onChange={(e) => {
            const v = e.target.value
            setForm((f) => ({
              ...f,
              ownerUserId: v,
              // Picking a member clears the free text; picking the fallback
              // keeps whatever was typed.
              owner: v === OWNER_FREE_TEXT ? f.owner : '',
            }))
          }}
          aria-label="Standard owner"
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {memberLabel(m)}
            </option>
          ))}
          <option value={OWNER_FREE_TEXT}>Someone else (not a member)…</option>
        </Select>
        {form.ownerUserId === OWNER_FREE_TEXT || (!form.ownerUserId && form.owner) ? (
          <input
            value={form.owner}
            onChange={set('owner')}
            maxLength={200}
            placeholder="Name of the owner"
            aria-label="Owner name (free text)"
            className={`${fieldInput} mt-1.5`}
          />
        ) : null}
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
function AssuranceGateChip({ satisfied }) {
  const Icon = satisfied ? Check : ShieldAlert
  return (
    <Pill
      variant="status"
      tone={satisfied ? 'good' : 'watch'}
      title={
        satisfied
          ? 'Assurance satisfied — evidence attached'
          : 'Assurance gate — attach evidence to satisfy it'
      }
    >
      <Icon size={11} aria-hidden />
      {satisfied ? 'Assurance met' : 'Assurance unmet'}
    </Pill>
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
    <label className="col-span-2 flex items-start gap-2 text-[13px] leading-snug text-ink">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[#2563eb]"
      />
      <span>
        This also lives in our accreditor&apos;s portal
        <span className="ml-1 text-ink2">
          — leave it unchecked if you haven&apos;t checked; we&apos;ll print &ldquo;—&rdquo;, never
          &ldquo;No&rdquo;.
        </span>
      </span>
    </label>
  )
}

/** The lazy-loaded evidence sub-list for one expanded standard row. Premium UI P4
 *  (a2): light — the drawer that hosts it is a float Panel, evidence rows are
 *  ruled rows on white, fields are plain, actions are flat Buttons; `.a2-ink`
 *  translates the four still-navy children it hosts (see a2-carry.css). Phase 3 adds the
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
  // WS2 — the framework's long-form tier phrases (subtext under the active
  // label word). Null for frameworks that publish single words only.
  rubricDescriptors = null,
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
    <div className="a2-ink px-5 py-4 sm:px-6">
      {/* ── Phase 3 header strip: rubric self-score + strategy link ─────────── */}
      {standard && (standard.isLeaf !== false || linkStrategy) ? (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {standard.isLeaf !== false ? (
            standard.isAssurance ? (
              // Assurance leaves are binary evidence gates — no rubric pips.
              <AssuranceGateChip satisfied={(standard.evidenceCount ?? 0) > 0} />
            ) : (
              <>
                <RubricPicker
                  showLabel
                  value={standard.rubricScore ?? null}
                  labels={rubricLabels}
                  descriptors={rubricDescriptors}
                  activeLabel={standard.rubricLabel ?? null}
                  disabled={!canEdit || !onRubric}
                  onChange={onRubric ? (v) => onRubric(standard.id, v) : undefined}
                />
                {/* PROVENANCE, finally read. Who asserted this score and when has
                    been recorded on every change since Phase A — and rendered
                    nowhere, an honesty ledger with no reader. A self-score is an
                    assertion; this chip says whose. (Scorer deleted → SetNull
                    keeps the score and drops the name; the chip degrades to the
                    date. Older scores predate the stamp → no chip, no guess.) */}
                {standard.rubricScore != null && standard.rubricScoredAt ? (
                  <Pill>
                    {standard.scoreProvenance === 'peer_reviewed'
                      ? 'Peer-reviewed'
                      : standard.scoreProvenance === 'externally_validated'
                        ? 'Externally validated'
                        : 'Self-scored'}
                    {standard.rubricScoredBy ? ` · ${standard.rubricScoredBy}` : ''}
                    {` · ${standard.rubricScoredAt}`}
                  </Pill>
                ) : null}
              </>
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
        <p className="text-small text-ink2">Loading evidence…</p>
      ) : items.length === 0 ? (
        <p className="border-y border-hair py-3 text-small text-ink2">No evidence attached yet.</p>
      ) : (
        <ul className="a2-rows a2-rows-tight">
          {items.map((ev) => {
            const Icon = KIND_ICON[ev.kind] ?? FileText
            if (canEdit && editingId === ev.id) {
              return (
                <li key={ev.id}>
                  <form onSubmit={submitEdit} className="grid grid-cols-2 gap-2">
                    <input
                      value={editForm.title}
                      onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                      maxLength={200}
                      placeholder="Evidence title"
                      className="a2-field col-span-2"
                    />
                    <select
                      value={editForm.kind}
                      onChange={(e) => setEditForm((f) => ({ ...f, kind: e.target.value }))}
                      className="a2-field"
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
                      className="a2-field"
                    />
                    <input
                      value={editForm.reference}
                      onChange={(e) => setEditForm((f) => ({ ...f, reference: e.target.value }))}
                      maxLength={2000}
                      placeholder="Reference (URL / doc path / citation)"
                      className="a2-field col-span-2"
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
                      <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" variant="primary" type="submit">
                        Save
                      </Button>
                    </div>
                  </form>
                </li>
              )
            }
            return (
              <li
                key={ev.id}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Icon size={15} className="shrink-0 text-ink2" aria-hidden />
                  <span className="truncate text-small font-semibold text-ink">{ev.title}</span>
                  {ev.sourceType && ev.sourceType !== 'manual' && ev.sourceLink ? (
                    <Link
                      to={ev.sourceLink}
                      className="pill shrink-0 hover:border-hair/30"
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
                      className="dt-link truncate text-[12px] underline underline-offset-2"
                    >
                      link
                    </a>
                  ) : ev.reference ? (
                    <span className="truncate text-[12px] text-ink2">{ev.reference}</span>
                  ) : null}
                  {/* Phase C: the period this artifact covers, when the school told
                      us. Absent → nothing is shown; we never print an upload date
                      here to fill the space. */}
                  {ev.effectiveDate ? (
                    <Pill title="Which period this covers" className="shrink-0">
                      covers {formatShortDate(String(ev.effectiveDate).slice(0, 10))}
                    </Pill>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEdit(ev)}
                      aria-label={`Edit evidence ${ev.title}`}
                      className="a2-icon-btn"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(ev)}
                      aria-label={`Delete evidence ${ev.title}`}
                      data-tone="risk"
                      className="a2-icon-btn"
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
              className="a2-field col-span-2"
            />
            <select
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
              className="a2-field"
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
              className="a2-field"
            />
            <input
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              maxLength={2000}
              placeholder="Reference (URL / doc path / citation)"
              className="a2-field col-span-2"
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
            {err ? (
              <p className="a2-note col-span-2" data-tone="risk">
                {err}
              </p>
            ) : null}
            <div className="col-span-2 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" type="submit">
                Add evidence
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)} icon={<Plus size={14} />}>
              Add evidence
            </Button>
            <Button size="sm" variant="secondary" onClick={openPicker} icon={<Landmark size={14} />}>
              Attach from operations
            </Button>
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
        <div className="a2-block">
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
  // A modal dialog owns focus: it takes it on open (the Close button), Escape
  // closes it, and focus goes back to the trigger when it unmounts.
  const closeBtnRef = useRef(null)
  useEffect(() => {
    const opener = typeof document !== 'undefined' ? document.activeElement : null
    closeBtnRef.current?.focus()
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Attach from operations"
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="a2-dialog max-h-[80vh] w-full max-w-lg overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-3 border-b border-hair px-5 py-4">
          <h2 className="font-serif text-[22px] font-medium leading-7 text-ink">
            Attach from operations
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="a2-icon-btn"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 pb-5 pt-4">
        <p className="mb-4 text-small text-ink2">
          Link an existing policy or board report as evidence for this standard — one click, a
          live deep link.
        </p>
        {loading ? (
          <p className="text-small text-ink2">Loading your artifacts…</p>
        ) : (
          <div className="space-y-5">
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
                  <h3 className="sec-label mb-1.5">
                    {g.label}
                  </h3>
                  {list.length === 0 ? (
                    <p className="border-y border-hair py-2 text-small text-ink2">{g.empty}</p>
                  ) : (
                    <ul className="a2-rows">
                      {list.map((src) => (
                        <li key={attachKey(src)}>
                          <button
                            type="button"
                            disabled={attaching !== null}
                            onClick={() => onAttach(src)}
                            className="group flex w-full items-center justify-between gap-3 rounded-[var(--r-ctl)] px-1 py-1 text-left transition hover:bg-ink/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2563eb]/50 disabled:opacity-50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-small font-semibold text-ink">
                                {src.label}
                                {src.fiveYear ? (
                                  <span className="pill ml-1.5">5-year</span>
                                ) : null}
                              </span>
                              {src.date ? (
                                <span className="block text-[12px] text-ink2">{src.date}</span>
                              ) : null}
                            </span>
                            <span className="btn btn-secondary btn-sm shrink-0 group-hover:border-hair/30">
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
                <h3 className="sec-label mb-1.5">
                  Governance report
                </h3>
                <ul className="a2-rows">
                  {governanceRows.map((src) => (
                    <li key={attachKey(src)}>
                      <button
                        type="button"
                        disabled={attaching !== null}
                        onClick={() => onAttach(src)}
                        className="group flex w-full items-center justify-between gap-3 rounded-[var(--r-ctl)] px-1 py-1 text-left transition hover:bg-ink/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2563eb]/50 disabled:opacity-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-small font-semibold text-ink">
                            {src.label}
                          </span>
                        </span>
                        <span className="btn btn-secondary btn-sm shrink-0 group-hover:border-hair/30">
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
        {err ? (
          <p className="a2-note mt-4" data-tone="risk">
            {err}
          </p>
        ) : null}
        </div>
      </motion.div>
    </div>
  )
}

// ═══════════════════════════ LIGHT STANDARDS TABLE ══════════════════════════

/** The Owner cell — validated member name (server-joined) first, legacy free
 *  text as fallback, an em-dash when nobody owns it. Initials chip + name. */
function OwnerCell({ standard }) {
  const name = standard.ownerName ?? standard.owner ?? null
  if (!name) return <span className="text-[12px] text-muted/60">—</span>
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
  return (
    <span className="inline-flex items-center gap-1.5" title={name}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-navy/20 bg-navy/5 text-[10px] font-bold text-navy">
        {initials || <UserIcon size={11} aria-hidden />}
      </span>
      <span className="max-w-[120px] truncate text-[12.5px] font-medium text-navy/85">{name}</span>
    </span>
  )
}

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
  // WS2: (standard) => rubricDescriptors[4] | null — the read framework's
  // long-form tier phrases, tooltip-only at register density.
  descriptorsFor = null,
  // F2: "make it a task" — navigates to /tasks with the standard prefilled.
  onMakeTask = null,
  // frameworkId → pill label, passed ONLY when this school holds more than one
  // accreditation. Null for everyone else, and the register renders exactly as it
  // always did — a chip naming the only framework you have says nothing.
  frameworkChipById = null,
  /** (standard) => void — opens the "how do I raise this" panel. Optional. */
  onImprove = null,
  onRubric = null,
  // Phase C: standardId → the WORST currency state among the required artifacts
  // this standard is served by, straight off the evidence-readiness payload. A
  // standard with no requirement rows is simply absent from the map and renders no
  // chip at all — sparseness holds, and the row looks exactly as it did before.
  currencyByStandard = null,
  // Phase E: standardId → the TwinStandardRisk row for this standard, straight off
  // the twin payload. A standard the engine did not score is simply absent from the
  // map and renders no chip at all — sparseness holds and the row is unchanged.
  // THE CHIP IS A BAND WORD, NEVER THE NUMBER: see RiskChip's header for why.
  riskByStandard = null,
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
      <RegisterEmpty
        icon={BadgeCheck}
        text="No standards yet."
        sub="Adopt a framework, or add your first standard."
        actionLabel="Add a standard"
      />
    )

  return (
    <TableShell
      cols={
        <>
          <Th>Code</Th>
          <Th>Standard</Th>
          <Th>Rating</Th>
          <Th>Coverage</Th>
          <Th>Risk</Th>
          <Th>Owner</Th>
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
                  <span className="whitespace-nowrap rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[12px] font-semibold text-muted">
                    {s.code}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="font-semibold text-navy" style={{ paddingLeft: `${(s.depth ?? 0) * 18}px` }}>
                  {/* THE TITLE IS THE WAY IN. A row stated three problems and
                      offered three icon buttons, none of which was the answer —
                      knowing that a rating comes from the rubric and that
                      evidence lives in a separate panel is product knowledge a
                      head of school does not have. Clicking the standard opens
                      the steps that actually raise it. */}
                  {onImprove ? (
                    <button
                      type="button"
                      onClick={() => onImprove(s)}
                      className="text-left underline-offset-2 hover:underline"
                    >
                      {s.title}
                    </button>
                  ) : (
                    s.title
                  )}
                  {/* WHOSE STANDARD IS THIS? In a mixed register the same code
                      space is shared by two accreditors, and a row's rubric now
                      speaks its own framework's vocabulary — so the row has to
                      say which framework it belongs to for either to be read
                      correctly. */}
                  {frameworkChipById && s.frameworkId && frameworkChipById[s.frameworkId] ? (
                    <span className="ml-2 rounded-full border border-rule/70 bg-section px-1.5 py-0.5 align-middle text-[10.5px] font-semibold tracking-wide text-muted">
                      {frameworkChipById[s.frameworkId]}
                    </span>
                  ) : null}
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
                        descriptors={descriptorsFor ? descriptorsFor(s) : null}
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
                {/* Phase E — the early-warning band for this standard. Absent from
                    the map → nothing renders. Never a zero, never a percentage. */}
                <RiskChip entry={riskByStandard?.[s.id] ?? null} size="sm" />
              </td>
              <td className="px-4 py-3">
                {/* F2 — whose standard to chase. Leaves only: a parent's "owner"
                    would be ambiguous between "owns the domain" and a rollup. */}
                {s.isLeaf === false ? (
                  <span className="text-[12px] text-muted/60">—</span>
                ) : (
                  <OwnerCell standard={s} />
                )}
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
                      {/* F2 — "make it a task": lands on /tasks with this
                          standard prefilled (the GovernancePage pattern), so the
                          work flows into the briefing under workflow for free. */}
                      {onMakeTask && s.isLeaf !== false ? (
                        <IconAction
                          Icon={ListChecks}
                          onClick={() => onMakeTask(s)}
                          label={`Make a task for ${s.code}`}
                          title="Make it a task"
                        />
                      ) : null}
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
//
// PHASE E completes the restructure into FIVE tabs of ONE command center, and
// changes the default landing tab from Standards to Domains. That reordering is
// the product argument of the phase, made in the navigation: a head of school
// opening this page should first see WHERE they are exposed across the ten
// domains, not an alphabetical list of standard codes. The register is one click
// away and unchanged; nothing was deleted to make room.
//
//   Domains     — early-warning bands (Phase E) above the rubric grid (Phase B)
//   Standards   — the register, plus one new column: the per-standard risk band
//   Evidence    — the artifact-axis index + commendations (Phase C), untouched
//   Signals     — what the engine could read, what it could not, the 24-month
//                 horizon, the coverage CTAs, and the named holes
//   Improvement — the honest Phase-G placeholder plus a real candidate list
//
// Records still hosts exactly ONE register, so it falls back to 'standards' for
// any center-only tab.
// F1 adds the SIXTH tab — Journey — placed FIRST. Phase E moved the default to
// Domains arguing a head of school should first see WHERE they are exposed; the
// same argument now says they should first see WHEN — exposure is one click
// away. AURORA retires the default landing: the overview shows the six as
// tiles (each with its own count) and opens none until the reader picks one —
// the cycle has its own section above, so auto-opening Journey drew it twice.
// Deep links use `?center=journey` (the briefing's `?center=` convention, never
// `?tab=` — ModuleTabs owns that one) and still open their tab.
const REGISTER_TABS = [{ key: 'standards', label: 'Standards' }]
const CENTER_TABS = [
  { key: 'journey', label: 'Journey' },
  { key: 'domains', label: 'Domains' },
  { key: 'standards', label: 'Standards' },
  { key: 'evidence', label: 'Proof' },
  { key: 'signals', label: 'Warnings' },
  { key: 'improvement', label: 'Improvement' },
]

function AccreditationWorkspace() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()
  const uiV2 = useUiV2()
  // F2 — who is looking (the Mine filter + "you own N standards" rail item).
  const { user } = useAuth()
  const currentUserId = user?.id ?? null

  const {
    standards,
    summary,
    ratingSummary,
    loading,
    error,
    notLicensed,
    notEntitled,
    refresh,
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
    frameworkId,
    selectFramework,
    frameworks,
    loadFrameworks,
    adoptFramework,
    frameworkRemovalImpact,
    removeFramework,
    setReadinessTarget,
    setRubric,
    fetchSuggestions,
    linkStrategy,
  } = useAccreditation(schoolId)

  // ── THE PAGE'S ONE FRAMEWORK SELECTION ─────────────────────────────────────
  // Every scored surface on this page — hero, evidence, signals, commendations,
  // trend — used to resolve its own framework independently, by two DIFFERENT
  // default rules (the read services pick the framework with the most linked
  // standards; the trend picks by its own series ordering). For the ordinary
  // school holding one accreditation that never showed. For a school holding two
  // it meant the hero could describe FCIS while the strip below it charted Cognia,
  // with nothing on screen naming either.
  //
  // So the selection is owned HERE and passed down, and the server's dominance
  // rule survives as the no-selection default. `activeFrameworkId` is what the
  // server actually resolved — the selection once one is made, otherwise whatever
  // dominance chose — which is what the panels and the switcher must agree on.
  const activeFrameworkId = frameworkId ?? readiness?.framework?.id ?? null

  // WHAT THE PANELS ARE GIVEN is the explicit selection (`frameworkId`), NOT
  // `activeFrameworkId`. Until the user picks, every read service applies the same
  // dominance rule, so sending the resolved id back would change nothing except to
  // make each panel refetch the moment readiness lands — an extra round-trip per
  // panel on every page load, for an identical answer.

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
    frameworkId,
  })

  // Phase C: the EVIDENCE READINESS payload — one request for the whole page, used
  // by the Evidence tab AND by the per-row currency chip on the standards register
  // (which is why it is not deferred until the tab is opened). Gated on the same
  // already-made module check as the two hooks above, for the same reason.
  const evidence = useEvidenceReadiness(schoolId, {
    enabled: !loading && !notLicensed && !notEntitled,
    frameworkId,
  })

  // Phase C: the strengths surface. Separate endpoint because it needs the signals
  // service AND the currency service; separate hook because a commendations hiccup
  // must never take the evidence index down with it.
  const commendations = useCommendations(schoolId, {
    enabled: !loading && !notLicensed && !notEntitled,
    frameworkId,
  })

  // Phase E: the EARLY WARNING ENGINE. One request for the whole page — the rail,
  // the domain bands, the per-standard risk column, the horizon timeline, the
  // coverage CTAs, the named holes and the improvement candidates all slice this
  // single payload. Gated on the same already-made module check as its siblings
  // (hooks run above the page's entitlement return), and fail-soft on its own: a
  // twin hiccup degrades these surfaces and never blanks the register.
  const twin = useAccreditationTwin(schoolId, {
    enabled: !loading && !notLicensed && !notEntitled,
  })

  // F1: THE CYCLE — one payload for the Journey tab, the hero's countdown strip
  // and the "Review due" KPI switch. Keyed off the page's ONE framework
  // selection exactly like its siblings (the explicit choice; the server's
  // dominance rule is the no-selection default), so the road and the hero can
  // never describe different frameworks. Gated on the same already-made module
  // check as every hook above.
  const cycleHook = useAccreditationCycle(schoolId, {
    enabled: !loading && !notLicensed && !notEntitled,
    frameworkId,
  })
  const cycle = cycleHook.cycle
  const cycleConfigured = cycleHook.configured

  // Phase E: Domains leads. See the CENTER_TABS header for why the default moved.
  //
  // DEEP LINK from the morning briefing. STEP 2.16 emits
  // `/accreditation?center=signals&rule=<RULE-ID>`, and the whole navigation story
  // of the phase rests on it: the head of school clicks the one early-warning line
  // on the brief and must arrive where that rule's blocking signal and horizon
  // live. The page previously read no search params at all and always opened on
  // Domains, so the flagship path silently did nothing.
  //
  // The param is `?center=`, NOT `?tab=`: under ui.v2 this page is wrapped in
  // ModuleTabs, which owns `?tab=` for its own panels (overview | add | records) —
  // see `openAdd` below, which uses exactly that. Two readers of one param is how
  // a deep link resolves differently depending on which shell rendered it.
  const [searchParams, setSearchParams] = useSearchParams()
  // AURORA: the Records section is a grid of six tiles and NOTHING is open
  // until the reader picks one (the approved mockup) — the cycle already has
  // its own section above, so opening Journey by default drew it twice. A
  // `?center=` deep link still opens its tab, exactly as before.
  const [tab, setTab] = useState(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('center')
      return CENTER_TABS.some((x) => x.key === t) ? t : null
    } catch {
      return null
    }
  })
  // The rule the reader was SENT to look at — it leads the rail and says so, so
  // "which of these did the brief mean?" has an answer on screen.
  const [focusRule, setFocusRule] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('rule')
    } catch {
      return null
    }
  })
  // The one finding the brief actually NAMED. The briefing caps at one item per
  // ruleId, but three briefable rules are per-standard/per-artifact, so a school
  // with six unmet assurances gets a single line naming COG-A1. Chipping every
  // finding that shares the ruleId told the reader the brief mentioned five
  // standards it never mentioned — so the chip keys on the finding, while
  // `focusRule` still decides what leads the rail.
  const [focusFinding, setFocusFinding] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('finding')
    } catch {
      return null
    }
  })
  // The ONE standard the reader was sent to open — from the Mock Visit's Act 4
  // "Serves" chips. Read once, consumed once, exactly like `rule` and `finding`.
  const [focusStandard] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('standard')
    } catch {
      return null
    }
  })
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (
        !searchParams.get('center') &&
        !searchParams.get('rule') &&
        !searchParams.get('finding') &&
        !searchParams.get('standard')
      )
        return
      const next = new URLSearchParams(searchParams)
      next.delete('center')
      next.delete('rule')
      next.delete('finding')
      next.delete('standard')
      setSearchParams(next, { replace: true })
    })
    return () => {
      cancelled = true
    }
    // Mount-only: consumed once, so refresh and back behave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // The focus marker is a one-visit hint, not a sticky filter: once the reader
  // changes tab they are navigating on their own and the rail goes back to pure
  // severity order.
  const chooseTab = useCallback((key) => {
    setFocusRule(null)
    setTab(key)
  }, [])
  // AURORA: a Records tile (or the cycle section's door) opens its panel and
  // brings it into view — the panel sits under the six tiles, which on a
  // phone is a screen further down.
  const openRecord = useCallback(
    (key) => {
      chooseTab(key)
      window.setTimeout(() => {
        document
          .getElementById('acc-records-open')
          ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
      }, 60)
    },
    [chooseTab, reduce],
  )
  const openJourney = useCallback(() => openRecord('journey'), [openRecord])
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(null) // the expanded standard id, or null
  // F3 — which half of the expanded panel's flip is showing. Always lands back
  // on Evidence when a different row opens.
  const [expandedView, setExpandedView] = useState('evidence')
  const [adoptOpen, setAdoptOpen] = useState(false)

  // "+ Add" now launches the multi-step batch wizard (Add-data tab, deep-linked);
  // the modal below stays for EDITING an existing standard.
  const openAdd = () => navigate('/accreditation?tab=add&add=standard')
  const openEdit = (s) => {
    setEditing(s)
    setModalOpen(true)
  }
  const toggleExpanded = (id) => {
    setExpandedView('evidence')
    setExpanded((cur) => (cur === id ? null : id))
  }

  // ── Phase 3 derived state ──────────────────────────────────────────────────
  // A framework is "adopted" when any standard carries a frameworkId.
  const adopted = useMemo(() => standards.some((s) => s.frameworkId), [standards])

  // How many DISTINCT frameworks this register actually holds — the fact that
  // decides whether this page needs a switcher at all.
  const registerFrameworkIds = useMemo(
    () => [...new Set(standards.map((s) => s.frameworkId).filter(Boolean))],
    [standards],
  )
  const multiFramework = registerFrameworkIds.length > 1

  // The catalog is normally fetched lazily, when the adopt modal opens. A
  // multi-framework school needs it up front for two things it cannot get from
  // the register rows: every framework's NAME (for the switcher) and its RUBRIC
  // LABELS (for the rows below). WS1/WS2 widen this to EVERY adopted school —
  // the catalog now also carries the division list (the seal selector), the
  // supersession flag (the quiet upgrade banner) and the upgrade seam, none of
  // which exist on the register rows. Unadopted schools keep the lazy fetch.
  useEffect(() => {
    if ((adopted || multiFramework) && frameworks == null) loadFrameworks()
  }, [adopted, multiFramework, frameworks, loadFrameworks])

  const adoptedFrameworks = useMemo(
    () => (frameworks ?? []).filter((f) => f.adopted),
    [frameworks],
  )

  // The switcher's pills, collision-disambiguated the same way as the row chips.
  const switcherLabels = useMemo(() => frameworkPillLabels(adoptedFrameworks), [adoptedFrameworks])

  // ── F2: the members roster (Owner picker + Mine filter) ────────────────────
  // Editors only — the endpoint is owner/accountant-gated; a viewer keeps an
  // empty picker and the register still renders ownerName (server-joined).
  const [members, setMembers] = useState([])
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(async () => {
      if (cancelled || !schoolId || !canEdit || notLicensed || notEntitled) {
        if (!cancelled) setMembers([])
        return
      }
      try {
        const res = await schoolsApi.members(schoolId)
        if (!cancelled) setMembers((res.data ?? []).filter((m) => m.status === 'active'))
      } catch {
        if (!cancelled) setMembers([])
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, canEdit, notLicensed, notEntitled])

  // ── F2/F4: the register's client-side lens ─────────────────────────────────
  // 'mine' = standards whose validated owner is the reader (TasksPage's own
  // pattern — no server filter needed at register scale); 'unbacked' = scored
  // rows with no evidence (the hero risk chip's destination).
  const [registerFilter, setRegisterFilter] = useState(null)

  // The active framework's CATALOG row — divisions, supersession, upgrade seam.
  const activeCatalogFw = useMemo(
    () => (frameworks ?? []).find((f) => f.id === activeFrameworkId) ?? null,
    [frameworks, activeFrameworkId],
  )

  // ── WS1: the division/seal choice (PATCH profile, owner/accountant) ────────
  const [divisionBusy, setDivisionBusy] = useState(false)
  const onSelectDivision = useCallback(
    async (code, divisionValue) => {
      if (!schoolId) return
      setDivisionBusy(true)
      try {
        await accreditationApi.setFrameworkProfile(schoolId, code, {
          division: divisionValue || null,
        })
        // The seal line lives on the readiness payload; the catalog carries the
        // choice — both must repaint.
        await Promise.all([loadFrameworks(), refresh()])
      } catch {
        /* fail-soft — the selector snaps back to the server's answer */
      } finally {
        setDivisionBusy(false)
      }
    },
    [schoolId, loadFrameworks, refresh],
  )

  // ── WS2: the upgrade seam (read-only preflight, then the re-point) ─────────
  const onUpgradeImpact = useCallback(
    async (code) => {
      if (!schoolId) return null
      const res = await accreditationApi.getFrameworkUpgradeImpact(schoolId, code)
      return res.data ?? null
    },
    [schoolId],
  )
  const onUpgradeFramework = useCallback(
    async (code) => {
      if (!schoolId) return null
      const res = await accreditationApi.upgradeFramework(schoolId, code)
      // Everything keyed by framework id just changed identity: hand the
      // selection back to the server's dominance rule (which now resolves the
      // successor), then repaint the register, the catalog and the cycle.
      await selectFramework(null)
      await Promise.all([refresh(), loadFrameworks()])
      cycleHook.refresh()
      return res.data ?? null
    },
    [schoolId, selectFramework, refresh, loadFrameworks, cycleHook],
  )

  // ── F1: writing the cycle anchor. The frameworkId travels in the body; the
  // Journey tab supplies the rest. Configured payloads name their own
  // framework; before that the page's selection (or the only adopted row)
  // decides. ─────────────────────────────────────────────────────────────────
  const saveCycle = useCallback(
    async (body) => {
      const fwId =
        cycle?.framework?.id ??
        activeFrameworkId ??
        cycle?.frameworks?.[0]?.id ??
        registerFrameworkIds[0] ??
        null
      if (!fwId) throw new Error('no framework')
      await cycleHook.save({ frameworkId: fwId, ...body })
    },
    [cycle, activeFrameworkId, registerFrameworkIds, cycleHook],
  )

  // F4 — the target pill choice now ALSO persists server-side (the cycle PUT
  // carries targetIndex), so Penny and the briefing can finally say "22 points
  // from Merit" with a server-authored figure. localStorage stays the
  // optimistic cache (setReadinessTarget writes it exactly as before); a
  // viewer's click never attempts the write it is not allowed to make.
  const onSelectTarget = useCallback(
    async (target) => {
      await setReadinessTarget(target)
      if (canEdit) {
        try {
          await saveCycle({ targetIndex: target ?? null })
        } catch {
          /* the local cache still holds the choice; the server catches up next save */
        }
      }
    },
    [setReadinessTarget, canEdit, saveCycle],
  )

  // Milestone links ("/accreditation?center=evidence") stay INSIDE this page:
  // the mount-only param consumption cannot re-run on a same-route navigate, so
  // in-page links resolve their `?center=` directly and anything else navigates.
  const openCenterLink = useCallback(
    (path) => {
      try {
        const url = new URL(path, window.location.origin)
        const center = url.searchParams.get('center')
        if (url.pathname === '/accreditation' && CENTER_TABS.some((t) => t.key === center)) {
          chooseTab(center)
          return
        }
      } catch {
        /* fall through to a plain navigate */
      }
      navigate(path)
    },
    [chooseTab, navigate],
  )

  // ── F2: "make it a task" — the GovernancePage location.state pattern. The
  // due date defaults milestone-aware: the next milestone's own dueDate when a
  // cycle is configured (a future server date), else blank. ──────────────────
  const makeTaskFromStandard = useCallback(
    (s) => {
      const due = cycle?.configured ? (cycle.countdown?.dueDate ?? '') : ''
      navigate('/tasks', {
        state: {
          prefill: {
            title: `Work standard ${s.code} — ${s.title}`.slice(0, 200),
            sourceType: 'accreditation',
            sourceRef: s.id,
            dueDate: due ? String(due).slice(0, 10) : '',
          },
        },
      })
    },
    [navigate, cycle],
  )

  // ── F3: the explainer fetch (lazy, per opened drawer) ──────────────────────
  const fetchExplainer = useCallback(
    async (standardId) => {
      if (!schoolId) return null
      const res = await accreditationApi.getStandardExplainer(schoolId, standardId)
      return res.data ?? null
    },
    [schoolId],
  )

  // PER-ROW RUBRIC LABELS, framework by framework.
  //
  // The readiness payload carries ONE framework's labels — the one being read.
  // Rows belonging to any other adopted framework used to be handed `null` and
  // rendered their 1–4 rubric as bare numbers with no words: a school holding two
  // accreditations saw half its register lose the vocabulary that makes a rubric
  // score mean anything. Each row now gets ITS OWN framework's labels from the
  // catalog, so the register reads correctly whichever framework is selected —
  // and a hand-made row with no framework link still falls back to the read
  // framework's labels, as before.
  const rubricLabelsByFrameworkId = useMemo(
    () => buildRubricLabelsByFrameworkId(frameworks, readiness?.framework),
    [frameworks, readiness],
  )

  // Only built for a multi-framework register — see StandardsTable's prop docs.
  // WS2: labels come from frameworkPillLabels, which disambiguates ONLY on
  // collision — a school holding both Cognia editions mid-transition reads
  // "COGNIA 2022" beside "COGNIA 2025"; everyone else keeps the year-free pill.
  const frameworkChipById = useMemo(() => {
    if (!multiFramework) return null
    const map = {}
    for (const [id, label] of frameworkPillLabels(frameworks)) map[id] = label
    return map
  }, [multiFramework, frameworks])

  const rubricLabels = readiness?.framework?.rubricLabels ?? null
  const labelsFor = useCallback(
    (s) => labelsForStandard(s, rubricLabelsByFrameworkId, rubricLabels),
    [rubricLabels, rubricLabelsByFrameworkId],
  )

  // WS2 — the read framework's long-form rubric descriptors, handed ONLY to
  // rows that belong to it (or hand-made rows with no link): another
  // framework's row must never wear Cognia's tier phrases. The readiness
  // payload is the one place descriptors travel, so other frameworks' rows
  // simply get none — words or nothing, never somebody else's.
  const readFrameworkId = readiness?.framework?.id ?? null
  const readDescriptors = readiness?.framework?.rubricDescriptors ?? null
  const descriptorsFor = useCallback(
    (s) => {
      if (!Array.isArray(readDescriptors) || readDescriptors.length === 0) return null
      if (s?.frameworkId && s.frameworkId !== readFrameworkId) return null
      return readDescriptors
    },
    [readDescriptors, readFrameworkId],
  )

  // ── The switcher drives the TREND STRIP too ────────────────────────────────
  // History is keyed by framework CODE (`seriesKey`), not by id — the recorded
  // series outlives any single framework row, which is why the two vocabularies
  // exist and why they are NOT unified. This is the one seam that translates
  // between them, so the hero and the strip beneath it can never chart different
  // frameworks. Guarded on the series actually existing: a framework adopted
  // today has no recorded history, and asking for a series that was never
  // recorded would blank a strip that was correctly showing another.
  const historySetSeriesKey = history.setSeriesKey
  const activeFrameworkCode = readiness?.framework?.code ?? null
  const availableSeriesKeys = history.series?.series
  useEffect(() => {
    if (!activeFrameworkCode) return
    const keys = (availableSeriesKeys ?? []).map((x) => x?.seriesKey)
    if (!keys.includes(activeFrameworkCode)) return
    historySetSeriesKey(activeFrameworkCode)
  }, [activeFrameworkCode, availableSeriesKeys, historySetSeriesKey])

  // DEEP-LINKABLE. `?framework=<id>` lets the briefing, Penny and a bookmark land
  // on the framework they are talking about rather than on whichever one happens
  // to dominate the register. Applied once, and only for a framework this school
  // actually holds — a stale or foreign id in a URL must be ignored, not sent.
  const frameworkParam = searchParams.get('framework')
  const frameworkParamAppliedRef = useRef(false)
  useEffect(() => {
    if (frameworkParamAppliedRef.current) return
    if (!frameworkParam || registerFrameworkIds.length === 0) return
    frameworkParamAppliedRef.current = true
    if (registerFrameworkIds.includes(frameworkParam)) selectFramework(frameworkParam)
  }, [frameworkParam, registerFrameworkIds, selectFramework])

  const onSelectFramework = useCallback(
    (id) => {
      selectFramework(id)
      frameworkParamAppliedRef.current = true // our own write must not re-trigger
      setSearchParams(
        (cur) => {
          const next = new URLSearchParams(cur)
          if (id) next.set('framework', id)
          else next.delete('framework')
          return next
        },
        { replace: true },
      )
    },
    [selectFramework, setSearchParams],
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
      setExpandedView('evidence')
      setExpanded(standardId)
      window.setTimeout(() => {
        document
          .getElementById(`accr-std-${standardId}`)
          ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
      }, 80)
    },
    [reduce],
  )

  // `/accreditation?center=standards&standard=<id>` — the deep link the Mock
  // Visit's Act 4 chips use. Without it those chips were rendered as buttons and
  // did nothing, because the visit surface had no handler to give them; the
  // vocabulary is `?center=`'s, and the param is consumed once by the effect above
  // so refresh and back behave like every other deep link on this page.
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled || !focusStandard) return
      scrollToStandard(focusStandard)
    })
    return () => {
      cancelled = true
    }
    // Mount-only: consumed once, exactly like `rule` and `finding`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clearStrategy = (standardId) => linkStrategy(standardId, null)

  // ── Phase C: keep the currency surfaces honest after an evidence write ──────
  // The twin's refresh, hoisted above the evidence wrapper that now needs it.
  const refreshTwinAfterWrite = twin.refresh

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
    // AND THE TWIN. Live-caught: a school attached the artifact that satisfies an
    // assurance gate, watched the gate flip to "Assurance met" in front of it, and
    // the early-warning grid above went on reporting the same "2 critical" —
    // because the twin is a separate read that only re-pulls on mount or on
    // `penny:data-changed`, and this path dispatched neither.
    //
    // Evidence is an INPUT to that engine, not a decoration on it:
    // ACC-ASSURANCE-GAP, ACC-UNSUPPORTED-SCORE and EVI-MISSING-REQUIRED all fire
    // off evidence. The prior-visit path already learned this and refreshed the
    // twin for exactly the same reason — see afterPriorVisitWrite below. This one
    // was simply missed, so a school was shown a stale warning about work it had
    // just done.
    refreshTwinAfterWrite()
  }, [refreshEvidenceReadiness, refreshCommendations, refreshTwinAfterWrite])

  // AIC Phase F — the SAME idea for the prior-visit register, and it matters more
  // there. Writing an open citation against a code the school holds moves
  // `acc.prior_visit_findings` from no_data to available AND raises
  // ACC-PRIOR-FINDING-OPEN on that standard — so the attention rail, the Signals
  // tab and the horizon are all stale the instant the modal closes. The twin is a
  // separate read that only re-pulls on mount or on `penny:data-changed`, and the
  // panel dispatches neither, so without this the phase's headline finding never
  // appeared after the write that created it.
  const afterPriorVisitWrite = useCallback(async () => {
    await Promise.allSettled([refreshTwinAfterWrite(), refreshEvidenceReadiness()])
  }, [refreshTwinAfterWrite, refreshEvidenceReadiness])

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
      ownerUserId: editing.ownerUserId ?? '',
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
  // AURORA: the band shows FOUR glass cards and a chip row for the rest, so the
  // order is the argument. Once a framework is adopted the four are the
  // mockup's: the projected score, the next milestone, standards scored and
  // standards with proof. Every verdict comes from a band the page already had
  // (the framework's own status bands, the cycle payload's milestone states,
  // the coverage thresholds) — none is invented here, and a figure with nothing
  // to judge is `neutral` (no pill).
  const kpis = useMemo(() => {
    const total = summary.total ?? 0
    const withEvidence = summary.withEvidence ?? 0
    const gaps = summary.gaps ?? 0
    const pct = total === 0 ? 0 : summary.pctCovered ?? 0

    // 1) Coverage — "Standards with proof".
    const coverageKpi = {
      label: 'Standards with proof',
      icon: FileCheck2,
      value: total === 0 ? '—' : String(withEvidence),
      unit: total === 0 ? null : `of ${total}`,
      status: total === 0 ? 'neutral' : pct >= 80 ? 'good' : pct >= 50 ? 'watch' : 'risk',
      sub:
        total === 0
          ? { text: 'No standards yet', tone: 'neutral' }
          : gaps > 0
            ? { text: `${gaps} missing`, tone: pct >= 50 ? 'neutral' : 'bad' }
            : { text: 'Every standard has proof', tone: 'good' },
    }

    // 2) Evidence gaps — "Missing proof" (a chip once a framework is adopted;
    //    the coverage card's caption already says it).
    const gapsKpi = {
      label: 'Missing proof',
      icon: ShieldAlert,
      value: total === 0 ? '—' : String(gaps),
      status: total === 0 ? 'neutral' : gaps > 0 ? 'risk' : 'good',
      sub:
        total === 0
          ? { text: 'No standards yet', tone: 'neutral' }
          : gaps > 0
            ? { text: 'Standards with no proof', tone: 'bad' }
            : { text: 'All have proof', tone: 'good' },
    }

    // 3) Rating coverage (met %) over LEAF standards — the accreditor-judgement
    //    dimension, distinct from evidence coverage above.
    const leafCount = ratingSummary?.leafCount ?? 0
    const metCount = ratingSummary?.metCount ?? 0
    const ratingPct = ratingSummary?.ratingCoveragePct ?? 0
    const ratingKpi = {
      label: 'Rated met',
      icon: BadgeCheck,
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
          ? { text: `${total} in your records`, tone: 'neutral' }
          : { text: `${metCount} of ${leafCount} met`, tone: ratingPct >= 80 ? 'good' : ratingPct >= 50 ? 'neutral' : 'bad' },
    }

    // 4) Review due. F1 SWITCHES THIS CARD: once a cycle is configured it reads
    //    the server's countdown — the next milestone of the six-year journey —
    //    instead of the per-standard reviewDate fields nobody fills ("no review
    //    dates set" was the tell that the school-level anchor did not exist).
    //    Unconfigured schools keep the per-standard reading, verbatim.
    const countdown = cycleConfigured ? (cycle?.countdown ?? null) : null
    const milestoneStates = cycleConfigured
      ? (cycle?.milestones ?? []).map((m) => m.state)
      : []
    const reviewDue = standards.filter(
      (s) => s.reviewStatus === 'overdue' || s.reviewStatus === 'due-soon',
    ).length
    const hasReviewData = standards.some((s) => s.reviewStatus && s.reviewStatus !== 'unknown')
    const reviewKpi = countdown
      ? {
          label: 'Next milestone',
          icon: CalendarClock,
          value: typeof countdown.daysRemaining === 'number' ? String(countdown.daysRemaining) : '—',
          unit: typeof countdown.daysRemaining === 'number' ? (countdown.daysRemaining === 1 ? 'day' : 'days') : null,
          status: milestoneStates.includes('overdue')
            ? 'risk'
            : milestoneStates.includes('at_risk')
              ? 'watch'
              : 'good',
          sub: milestoneStates.includes('overdue')
            ? { text: 'A milestone is overdue', tone: 'bad' }
            : { text: countdown.dueDate ? `Due ${formatShortDate(String(countdown.dueDate).slice(0, 10))}` : countdown.label, tone: 'neutral' },
        }
      : {
          label: 'Review due',
          icon: CalendarClock,
          value: !hasReviewData ? '—' : String(reviewDue),
          status: !hasReviewData ? 'neutral' : reviewDue > 0 ? 'risk' : 'good',
          sub: !hasReviewData
            ? { text: 'No review dates set', tone: 'neutral' }
            : reviewDue > 0
              ? { text: 'Past review date', tone: 'bad' }
              : { text: 'All current', tone: 'good' },
        }

    // 5) Documented / Defensible (Phase A) — once a framework is adopted. This
    //    slot deliberately does NOT carry the blended readiness percentage: a
    //    single number that averages "what you claim" with "what you can prove"
    //    reads as a grade and hides the only figure an accreditor will press on,
    //    which is the DIFFERENCE between the two. Same source and same instant as
    //    the ProvenancePair in the "Your score" card.
    if (adopted && readiness) {
      const documented = typeof readiness.selfScoredPct === 'number' ? readiness.selfScoredPct : null
      const defensible = typeof readiness.verifiedPct === 'number' ? readiness.verifiedPct : null
      const scored = readiness.scoredCount ?? 0
      const covered = readiness.coveredCount ?? 0
      const rLeaves = readiness.leafCount ?? 0
      const hasPair = documented != null && defensible != null
      const spread = hasPair ? documented - defensible : null
      const fw = readiness.framework ?? null
      const hasIndex = fw?.indexMin != null && fw?.indexMax != null && readiness.projectedIndex != null
      const below = readiness.belowThreshold === true

      // The projected score — the framework's OWN status bands are its verdict:
      // below every band → At risk, landed in one → Good.
      const indexKpi = hasIndex
        ? {
            label: 'Projected score',
            icon: Gauge,
            value: String(readiness.projectedIndex),
            status: below ? 'risk' : 'good',
            sub: readiness.target?.bandLabel && readiness.target?.index != null
              ? { text: `${readiness.target.bandLabel} needs ${readiness.target.index}`, tone: below ? 'bad' : 'neutral' }
              : readiness.band
                ? { text: readiness.band, tone: below ? 'bad' : 'good' }
                : null,
          }
        : null

      // Standards scored — the verdict is the cycle payload's own state for the
      // self-assessment milestone (the server measured "scored" and banded it);
      // with no cycle there is no band, so no pill.
      const selfAssess = cycleConfigured
        ? (cycle?.milestones ?? []).find((m) => m?.measure?.kind === 'scored')
        : null
      const scoredStatus = !selfAssess
        ? 'neutral'
        : selfAssess.state === 'overdue'
          ? 'risk'
          : selfAssess.state === 'at_risk'
            ? 'watch'
            : selfAssess.state === 'done' || selfAssess.state === 'on_track'
              ? 'good'
              : 'neutral'
      const scoredKpi = {
        label: 'Standards scored',
        icon: ListChecks,
        value: rLeaves === 0 ? '—' : String(scored),
        unit: rLeaves === 0 ? null : `of ${rLeaves}`,
        status: rLeaves === 0 ? 'neutral' : scoredStatus,
        sub:
          rLeaves === 0
            ? { text: 'Nothing to score yet', tone: 'neutral' }
            : scored === 0
              ? { text: 'Not started', tone: 'bad' }
              : scored < rLeaves
                ? { text: `${rLeaves - scored} still to score`, tone: 'neutral' }
                : { text: 'All scored', tone: 'good' },
      }

      const pairKpi = {
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
          ? { text: 'not available yet', tone: 'neutral' }
          : {
              text: `${scored} scored · ${covered} evidenced of ${rLeaves}`,
              tone: spread > 0 && spread >= 20 ? 'bad' : spread > 0 ? 'neutral' : 'good',
            },
      }

      // Standards with proof — once adopted, from the SAME readiness leaves as
      // "Standards scored" and the "Your score" card, so the band can never say
      // 2 have proof while the card under it says 0. The register-wide summary
      // (hand-made rows included) stays the reading before a framework.
      const proofPct = rLeaves === 0 ? 0 : Math.round((covered / rLeaves) * 100)
      const proofKpi = {
        label: 'Standards with proof',
        icon: FileCheck2,
        value: rLeaves === 0 ? '—' : String(covered),
        unit: rLeaves === 0 ? null : `of ${rLeaves}`,
        status: rLeaves === 0 ? 'neutral' : proofPct >= 80 ? 'good' : proofPct >= 50 ? 'watch' : 'risk',
        sub:
          rLeaves === 0
            ? { text: 'Nothing to back yet', tone: 'neutral' }
            : covered < rLeaves
              ? { text: `${rLeaves - covered} missing`, tone: proofPct >= 50 ? 'neutral' : 'bad' }
              : { text: 'Every standard has proof', tone: 'good' },
      }

      return [indexKpi, reviewKpi, scoredKpi, proofKpi, pairKpi, ratingKpi].filter(Boolean)
    }

    return [coverageKpi, ratingKpi, gapsKpi, reviewKpi]
  }, [summary, ratingSummary, standards, adopted, readiness, cycle, cycleConfigured])

  // ── AURORA: the band's ONE plain sentence, from the same payloads ──────────
  // Readiness first (where the index lands, or how far it is from the target),
  // then the cycle's next milestone. Every number is the server's.
  const bandVerdict = useMemo(() => {
    const total = summary.total ?? 0
    const countdown = cycleConfigured ? (cycle?.countdown ?? null) : null
    const states = cycleConfigured ? (cycle?.milestones ?? []).map((m) => m.state) : []
    const nextTone = states.includes('overdue') ? 'risk' : states.includes('at_risk') ? 'watch' : null
    const next =
      countdown && typeof countdown.daysRemaining === 'number' ? (
        <>
          {' '}
          Next up: {countdown.label}, in{' '}
          <VerdictEm tone={nextTone}>
            {countdown.daysRemaining} day{countdown.daysRemaining === 1 ? '' : 's'}
          </VerdictEm>
          .
        </>
      ) : null
    if (adopted && readiness) {
      const fw = readiness.framework ?? null
      const hasIndex = fw?.indexMin != null && fw?.indexMax != null && readiness.projectedIndex != null
      const below = readiness.belowThreshold === true
      const gap = readiness.target?.pointGap ?? null
      if (hasIndex && readiness.band && !below) {
        return (
          <>
            You&apos;d land <VerdictEm tone="good">{readiness.band}</VerdictEm> today.
            {readiness.nextBand ? (
              <>
                {' '}
                <VerdictEm>
                  {readiness.nextBand.pointGap} point{readiness.nextBand.pointGap === 1 ? '' : 's'}
                </VerdictEm>{' '}
                from {readiness.nextBand.label}.
              </>
            ) : null}
            {next}
          </>
        )
      }
      if (hasIndex && gap != null && gap > 0) {
        return (
          <>
            You are{' '}
            <VerdictEm tone={below ? 'risk' : null}>
              {gap} point{gap === 1 ? '' : 's'}
            </VerdictEm>{' '}
            from {readiness.target?.bandLabel ?? 'your target'}.{next}
          </>
        )
      }
      if (hasIndex && readiness.target) {
        return (
          <>
            You&apos;ve reached <VerdictEm tone="good">{readiness.target.bandLabel}</VerdictEm>.{next}
          </>
        )
      }
      const leaves = readiness.leafCount ?? 0
      if (leaves > 0) {
        return (
          <>
            <VerdictEm>
              {readiness.scoredCount ?? 0} of {leaves}
            </VerdictEm>{' '}
            standards scored, <VerdictEm>{readiness.coveredCount ?? 0}</VerdictEm> with proof.{next}
          </>
        )
      }
    }
    if (loading) return <>Loading your accreditation records…</>
    if (total === 0) return <>Add your standards and this page fills in.</>
    return (
      <>
        <VerdictEm>
          {summary.withEvidence ?? 0} of {total}
        </VerdictEm>{' '}
        standards have proof.{next}
      </>
    )
  }, [summary, adopted, readiness, cycle, cycleConfigured, loading])

  // The band's eyebrow — the framework and where the school is in its cycle
  // (the chip already names the school; the title the module).
  const bandEyebrow = useMemo(() => {
    const cfw = cycle?.framework ?? null
    const fwLabel = cfw?.accreditor
      ? `${cfw.accreditor}${cfw.version ? ` ${cfw.version}` : ''}`
      : (readiness?.framework?.name ?? null)
    const phase = cycleConfigured ? (cycle?.phase ?? null) : null
    const term = cycleConfigured ? (cycle?.anchor?.termYears ?? null) : null
    const yearLine = phase?.yearOfCycle != null && term != null ? `Year ${phase.yearOfCycle} of ${term}` : null
    return [adopted ? fwLabel : null, yearLine].filter(Boolean).join(' · ') || null
  }, [cycle, cycleConfigured, readiness, adopted])

  // ── Phase E derived state ──────────────────────────────────────────────────
  // standardId → its TwinStandardRisk row, for the register's Risk column. Built
  // here (not in the table) so the table stays presentational and the map is
  // computed once per payload rather than once per row.
  const twinPerStandardRisk = twin.perStandardRisk
  const riskByStandard = useMemo(() => {
    const out = {}
    for (const r of twinPerStandardRisk) out[r.standardId] = r
    return out
  }, [twinPerStandardRisk])

  // domainKey → label, taken from the READINESS payload's own `domains[].label`
  // (the server's DOMAIN_LABELS). The twin's bands carry keys only, and inventing
  // a second set of English domain names on the client is exactly how two panels
  // on one page end up disagreeing about what a domain is called.
  const readinessDomains = readiness?.domains
  const domainLabels = useMemo(() => {
    const out = {}
    for (const d of readinessDomains ?? []) if (d?.domainKey) out[d.domainKey] = d.label
    return out
  }, [readinessDomains])

  // The read-only façade handed to ruleActions. It can navigate and it can move
  // the tab; it cannot mutate anything, which is why the acknowledge control is
  // composed below rather than inside the rule map.
  const ruleApi = useMemo(
    () => ({
      goTab: chooseTab,
      navigate,
      scrollToStandard,
      // Opens the standard's own "what raises this" panel — which is where the
      // attach controls live — rather than scrolling the page toward it.
      improveStandard: (id) => {
        const s = standardsRef.current.find((row) => row.id === id)
        if (s) setImproveStandard(s)
        else scrollToStandard(id)
      },
    }),
    [chooseTab, navigate, scrollToStandard],
  )

  // ── "Finance is High. Now what?" ───────────────────────────────────────────
  // The band grid named ten problems and offered nothing to do about any of
  // them. Clicking a domain now opens its open findings with the actions that go
  // where each fix lives. The findings are filtered by the SAME domainKeys the
  // engine attributed them to — no re-derivation here, or the panel could
  // disagree with the card that opened it.
  const [improveStandard, setImproveStandard] = useState(null)
  // Read inside ruleApi's stable callback — joining its dependency array would
  // rebuild every finding's actions on each register refresh.
  const standardsRef = useRef(standards)
  standardsRef.current = standards

  // THE OPEN DRAWER FOLLOWS THE REGISTER. Attaching evidence inside the drawer
  // refreshes `standards`, but the drawer was holding the row object captured
  // when it opened — so a school could attach a document, watch it appear in the
  // list below, and still be told by the step above that it had not. The panel
  // re-reads its row by id on every refresh; a row that has gone (its framework
  // removed from another surface) closes the drawer rather than freezing a
  // standard that no longer exists.
  useEffect(() => {
    if (!improveStandard) return
    const fresh = standards.find((row) => row.id === improveStandard.id)
    if (!fresh) setImproveStandard(null)
    else if (fresh !== improveStandard) setImproveStandard(fresh)
  }, [standards, improveStandard])
  const [resolveDomain, setResolveDomain] = useState(null)
  const resolveFindings = useMemo(() => {
    if (!resolveDomain) return []
    return (twin.findings ?? []).filter((f) =>
      (f.domainKeys ?? []).includes(resolveDomain.domainKey),
    )
  }, [resolveDomain, twin.findings])

  // ── THE EARLY-WARNING RAIL ENTRIES ─────────────────────────────────────────
  // F7, verbatim: the shared server AttentionItem contract is NOT touched. These
  // are composed CLIENT-SIDE from `ruleId` + `scopeKey`, exactly as every other
  // domain page in this app composes its own rail.
  //
  // EVERY SENTENCE ON A ROW IS A SERVER STRING. `title` is the standard code the
  // finding would be cited under (G3, visible in the rail) plus the rule's own
  // headline; `why` is the rationale followed by the accreditation consequence.
  // Not one number is interpolated here — the engine already rendered them, and
  // every numeral in a rationale is backed by that finding's evidence chain.
  const twinFindings = twin.findings
  const twinAck = twin.ack
  const twinNow = twin.now
  const twinDemo = twin.demoData
  const earlyWarningItems = useMemo(() => {
    // `info` IS NOT AN INBOX ITEM. An info finding (SCHOOL-NOT-REPORTING) is a
    // statement about OUR OWN VISIBILITY, and briefing.service.ts excludes the
    // severity from STEP 2.16 for exactly that reason. The rail was letting it
    // outrank an unmet-assurance or no-evidence readiness prompt in six slots,
    // so the two surfaces disagreed about what an inbox is. It stays fully
    // visible on the Signals tab and in the horizon timeline.
    const rows = twinFindings.filter((f) => !f.findingCleared && f.severity !== 'info')
    // The rule the briefing sent the reader to look at LEADS, whatever its
    // severity — otherwise "we sent you here" and "here is what we sent you to"
    // are two different rows and the reader has to guess which.
    // Then: critical → warn, then the OLDEST problem leads within a severity.
    const sorted = [...rows].sort((a, b) => {
      const fa = focusRule && a.ruleId === focusRule ? 0 : 1
      const fb = focusRule && b.ruleId === focusRule ? 0 : 1
      if (fa !== fb) return fa - fb
      const sev = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
      if (sev !== 0) return sev
      const at = a.firstSeenAt ?? ''
      const bt = b.firstSeenAt ?? ''
      if (at === bt) return (a.findingKey ?? '').localeCompare(b.findingKey ?? '')
      // A row-less finding (firstSeenAt null) is brand new — it sorts last within
      // its severity rather than pretending to be the oldest.
      if (!at) return 1
      if (!bt) return -1
      return at < bt ? -1 : 1
    })

    return sorted.map((f) => {
      const code = (f.standardTags ?? [])[0] ?? null
      const actions = actionsForFinding(f, ruleApi)
      // Acknowledge is offered only when the ledger row exists AND the reader can
      // edit. A row-less finding gets the disabled control in `meta` with the
      // tooltip, because a live-firing finding must still be visible immediately.
      const canAck = canEdit && Boolean(f.id)
      const allActions = canAck
        ? [...actions, { label: 'Mute 45 days', onClick: () => twinAck(f.id) }]
        : actions
      // MUTED, OR MERELY ONCE-MUTED? `mutedUntil` is deliberately NOT cleared by
      // the server when the window lapses — notify-policy detects the lapse by
      // comparing it to `now` and re-notifies exactly once. Testing for PRESENCE
      // therefore kept the navy "Acknowledged" chip on a finding that had already
      // re-armed and already emailed: the one surface a head of school reads every
      // morning saying "handled" at the moment the system decided it is not. The
      // comparison is against the PAYLOAD's clock (`twin.now`), never the
      // browser's — the same discipline the horizon timeline uses.
      const mutedDay = f.mutedUntil ? String(f.mutedUntil).slice(0, 10) : null
      const muted = Boolean(mutedDay && twinNow && mutedDay > twinNow)
      const reArmed = Boolean(mutedDay && twinNow && mutedDay <= twinNow)
      // `focused` orders the rail (the rule you followed leads it). `fromBriefing`
      // is a CLAIM ABOUT THE BRIEF and is therefore stricter: it needs the exact
      // finding the brief named. When no `finding` param is present — an older
      // link, or any entry point that is not the brief — nothing is chipped rather
      // than everything sharing the ruleId being chipped.
      const focused = Boolean(focusRule && f.ruleId === focusRule)
      const fromBriefing = Boolean(focusFinding && f.findingKey === focusFinding)

      return {
        id: `ew-${f.findingKey ?? f.factKey}`,
        // Carried OUT of the mapper for the merged rail comparator: the concat
        // that preceded it compared nothing across the two lists.
        severity: f.severity,
        focused,
        tone: SEVERITY_TONE[f.severity] ?? 'neutral',
        title: code ? `${code} — ${f.title}` : f.title,
        why: `${f.rationale} ${f.consequence}`,
        meta: (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* THE WORD, never a percentage. */}
            <span className="rounded-md border border-rule/60 bg-section px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">
              {f.likelihood}
            </span>
            {(f.standardTags ?? []).slice(1, 3).map((t) => (
              <span
                key={t}
                className="rounded-md border border-[#F59E0B]/35 bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700"
              >
                {t}
              </span>
            ))}
            {/* PROVENANCE, on the row. The readiness strip a few hundred pixels
                above stamps DEMO DATA on the same series these findings are
                derived from; leaving the rail unmarked told the reader two
                different things about one dataset. Same chip, one vocabulary. */}
            {twinDemo || f.isDemo ? <DemoChip /> : null}
            {fromBriefing ? (
              <span className="rounded-md border border-[#F59E0B]/50 bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700">
                From your briefing
              </span>
            ) : null}
            {muted ? (
              // Acknowledged findings STAY in the rail. Hiding one would make an
              // acknowledgement look like a fix; it is labelled instead.
              <span className="rounded-md border border-navy/20 bg-navy/5 px-1.5 py-0.5 text-[10.5px] font-semibold text-navy">
                Acknowledged
              </span>
            ) : null}
            {reArmed ? (
              // The ack window LAPSED. Dropping the chip silently would leave no
              // trace of a state the system has already acted on (it re-notified).
              <span className="rounded-md border border-[#F59E0B]/50 bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700">
                Re-armed
              </span>
            ) : null}
            {canEdit && !f.id ? (
              <button
                type="button"
                disabled
                title={NOT_YET_RECORDED_TOOLTIP}
                className="cursor-not-allowed rounded-full border border-rule/60 bg-section px-2 py-0.5 text-[10.5px] font-semibold text-muted opacity-70"
              >
                Mute 45 days
              </button>
            ) : null}
          </div>
        ),
        actions: allActions,
      }
    })
  }, [twinFindings, ruleApi, canEdit, twinAck, twinNow, twinDemo, focusRule])

  // ── Needs-attention items (most-urgent first, capped at 6) ─────────────────
  // Phase 3: readiness entries are composed CLIENT-SIDE from the readiness
  // endpoint (the frozen decision — briefing.service.ts is untouched this phase):
  // unmet assurances upgrade their no-evidence row, unscored top gaps append.
  //
  // Phase E: the EARLY WARNINGS LEAD. They are the answer to "what would a
  // visiting team find?", which outranks "which of your standards has no evidence
  // attached" — and every one of them already names the standard it would be
  // cited under, so nothing is lost by putting them first. A viewer sees them too
  // (they can read /twin), with navigation actions and no acknowledge control.
  const attentionItems = useMemo(() => {
    if (!canEdit) {
      // Viewers get engine findings only (they cannot act on readiness prompts) —
      // already severity-sorted upstream. Same {list, more} shape as the editor
      // branch so the overflow line renders for both.
      return {
        list: earlyWarningItems.slice(0, 6),
        more: Math.max(0, earlyWarningItems.length - 6),
      }
    }
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
        // Readiness prompts now carry a SEVERITY so the merged comparator can
        // weigh them against engine findings instead of concatenating blind.
        // 'warn', not 'critical': an unmet gate is serious, but when the twin
        // agrees it emits its own ACC-ASSURANCE-GAP critical — the prompt is the
        // reminder, the finding is the alarm, and the alarm must outrank it.
        severity: 'warn',
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
        severity: 'watch',
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
        severity: 'watch',
        sortKey: 2,
        title: `${g.code} is unscored`,
        why: lift != null ? `${g.title} · worth +${lift} points at full marks` : g.title,
        actions: [
          { label: 'Score it', primary: true, onClick: () => scrollToStandard(g.standardId) },
        ],
      })
    }

    // 4) F2 — YOUR OWN QUEUE, one line: standards the reader owns that still
    //    have no evidence. Client-composed like every rail item here, counted
    //    over the validated ownerUserId only (free-text owners are display
    //    names, not logins, and must never match by coincidence).
    const mineNoEvidence = currentUserId
      ? standards.filter(
          (s) => s.ownerUserId && s.ownerUserId === currentUserId && s.coverage === 'no-evidence',
        )
      : []
    if (mineNoEvidence.length > 0) {
      items.push({
        id: 'mine-gaps',
        tone: 'watch',
        severity: 'warn',
        sortKey: 0.5,
        title: `You own ${mineNoEvidence.length} standard${mineNoEvidence.length === 1 ? '' : 's'} with no evidence`,
        why: 'Assigned to you and still waiting on a first artifact',
        actions: [
          {
            label: 'See mine',
            primary: true,
            onClick: () => {
              setRegisterFilter('mine')
              chooseTab('standards')
            },
          },
        ],
      })
    }

    // ONE LIST, ONE COMPARATOR — mergeAttentionRail (attentionRail.js), where
    // the ordering rules are documented and behaviourally tested. The shape it
    // replaces reserved four slots for the engine and concatenated two lists
    // whose sort keys were never compared, so a fifth open CRITICAL was evicted
    // by a watch-level "«code» is unscored" prompt — and viewers, who skipped
    // the concat, saw a strictly better list than editors.
    return mergeAttentionRail(earlyWarningItems, items)
  }, [standards, canEdit, readiness, scrollToStandard, earlyWarningItems, currentUserId, chooseTab])

  // ── F2/F4: the register lens ───────────────────────────────────────────────
  // Client-side slicing at register scale (TasksPage's own Mine pattern):
  // 'mine' by validated ownerUserId, 'unbacked' = scored rows with nothing
  // behind the score (the hero risk chip's destination). Null = everything.
  const filteredStandards = useMemo(() => {
    if (registerFilter === 'mine' && currentUserId) {
      return standards.filter((s) => s.ownerUserId && s.ownerUserId === currentUserId)
    }
    if (registerFilter === 'unbacked') {
      return standards.filter((s) => s.rubricScore != null && s.coverage === 'no-evidence')
    }
    return standards
  }, [standards, registerFilter, currentUserId])
  const mineCount = useMemo(
    () =>
      currentUserId
        ? standards.filter((s) => s.ownerUserId && s.ownerUserId === currentUserId).length
        : 0,
    [standards, currentUserId],
  )

  // ── Gate ───────────────────────────────────────────────────────────────────
  if (notLicensed || notEntitled) return <GatePanel notLicensed={notLicensed} />

  // ── WS2: the quiet upgrade banner — over the standards center, informational
  // and never blocking (the register keeps every path it ever had). ───────────
  const upgradeBanner =
    activeCatalogFw?.adopted && activeCatalogFw?.supersededBy ? (
      <Panel data-testid="upgrade-banner" tone="attention" className="panel-watch">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-small leading-relaxed text-ink">
            <span className="font-semibold">
              Rev. {activeCatalogFw.supersededBy.version ?? activeCatalogFw.supersededBy.code}{' '}
              available.
            </span>{' '}
            Your {activeCatalogFw.name} register keeps working exactly as it is — upgrading carries
            every score and evidence link over.
          </p>
          {canEdit ? (
            <Button variant="secondary" size="sm" onClick={openAdoptModal} className="shrink-0">
              Review upgrade
            </Button>
          ) : null}
        </div>
      </Panel>
    ) : null

  // The register lens bar — Mine (when anyone owns anything) + the transient
  // "scored, no evidence" chip the hero risk chip lands on.
  const filterBar =
    mineCount > 0 || registerFilter ? (
      <div className="flex flex-wrap items-center gap-2">
        {mineCount > 0 ? (
          <span className="seg">
            <button
              type="button"
              data-testid="mine-filter-pill"
              aria-pressed={registerFilter === 'mine'}
              onClick={() => setRegisterFilter((cur) => (cur === 'mine' ? null : 'mine'))}
              className="seg-btn"
            >
              <UserIcon size={13} aria-hidden /> Mine · {mineCount}
            </button>
          </span>
        ) : null}
        {registerFilter === 'unbacked' ? (
          <button
            type="button"
            data-testid="unbacked-filter-chip"
            onClick={() => setRegisterFilter(null)}
            className="pill pill-status tone-watch transition-colors hover:bg-ink/[.03]"
            title="Clear this filter"
          >
            <i className="pill-mark" aria-hidden="true" />
            Scored, no evidence · {filteredStandards.length}
            <X size={12} aria-hidden />
          </button>
        ) : null}
        {registerFilter === 'mine' && filteredStandards.length === 0 ? (
          <span className="text-small text-ink2">Nothing is assigned to you yet.</span>
        ) : null}
      </div>
    ) : null

  const registerTable = (
    <div className="space-y-3">
      {upgradeBanner}
      {filterBar}
      <StandardsTable
        standards={filteredStandards}
        loading={loading}
        error={error}
        canEdit={canEdit}
        reduce={reduce}
        expanded={expanded}
        onToggle={toggleExpanded}
        onEdit={openEdit}
        onDelete={onDelete}
        labelsFor={labelsFor}
        descriptorsFor={descriptorsFor}
        frameworkChipById={frameworkChipById}
        onImprove={setImproveStandard}
        onRubric={canEdit ? setRubric : null}
        onMakeTask={canEdit ? makeTaskFromStandard : null}
        currencyByStandard={evidence.byStandard}
        riskByStandard={riskByStandard}
      />
    </div>
  )

  const expandedStandard = expanded ? standards.find((s) => s.id === expanded) : null

  // ── Phase B: the Domains tab ───────────────────────────────────────────────
  // Rendered in the command center's register slot when the Domains tab is
  // active. It reads the SAME readiness payload the hero reads, so a card can
  // never describe a different population than the number above it.
  // Phase E stacks the ordinal early-warning bands ABOVE it. Two grids, two
  // questions ("what are the numbers warning about?" vs "what do your standards
  // say?"), never blended into one figure — see DomainBandStrip's header.
  const domainGrid = (
    <>
      <DomainBandStrip
        domainBands={twin.domainBands}
        labels={domainLabels}
        loading={twin.loading}
        error={twin.error}
        notLicensed={twin.notLicensed}
        demoData={twin.demoData}
        onOpenDomain={setResolveDomain}
      />
      <DomainGrid
        readiness={readiness}
        signals={signals.signals}
        byDomain={signals.byDomain}
        signalsLoading={signals.loading}
        signalsUnavailable={Boolean(signals.notLicensed || signals.error)}
        onOpenStandards={() => chooseTab('standards')}
        reduce={reduce}
      />
    </>
  )

  // ── Phase C: the Evidence tab ──────────────────────────────────────────────
  // Requirement-driven and grouped BY TAG ACROSS STANDARDS — the axis the
  // standards table cannot express. COMMENDATIONS LEAD: a visiting team writes
  // commendations before recommendations, and every other panel on this page is
  // about what is missing, so the strengths surface sits above the ask list rather
  // than buried under it.
  //
  // AIC PHASE F adds the PRIOR-VISIT register beneath it, on this tab and no
  // other. It belongs on the artifact axis: it is a document request answered by a
  // document, and "what the last team wrote" is the same kind of fact as "what
  // they will ask to see". It sits BELOW the requirement index deliberately — the
  // index is what the school must produce next; the prior visit is the record of
  // what it was already told, and it is the note a reader should leave on.
  const evidenceTab = (
    <div className="space-y-5">
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
      <PriorVisitPanel
        schoolId={schoolId}
        canEdit={canEdit}
        reduce={reduce}
        onOpenStandard={scrollToStandard}
        onSaved={afterPriorVisitWrite}
      />
    </div>
  )

  // ── Phase E: the Signals tab ───────────────────────────────────────────────
  // The whole engine, made legible in one screen, in this deliberate order:
  //   1. what we could read and what we could not, with the reason verbatim;
  //   2. the operating numbers themselves (the SAME SignalPanel the standard
  //      drawer renders — one component, one vocabulary, sliced differently);
  //   3. the twenty-four-month horizon, WITH its equally prominent column of
  //      findings we refuse to date;
  //   4. the two honest CTAs — more years, and modules not licensed;
  //   5. the rules that can never fire today, each naming what would unlock it.
  // Ordering matters: coverage before consequence, and the holes last so they are
  // the note a reader leaves on rather than a disclaimer they scrolled past.
  // AURORA (plainer, shorter): the tab is now "Warnings". What is coming
  // (the horizon) and the school's own numbers lead; the two long reference
  // lists — what the engine could read, and the rules that cannot run yet —
  // sit behind disclosures that open in place, in the same order as before
  // (coverage first, the holes last). Nothing is dropped: both still render
  // the server's sentences verbatim, one click away.
  const signalsTab = (
    <div className="space-y-5">
      <HowThisWorks inline title="What KYRO could read — and what it couldn't" className="acc-disclose">
        <SignalCoverageTable
          rows={twin.signals}
          counts={twin.coverage?.signals ?? null}
          notEvaluated={twin.notEvaluated}
          loading={twin.loading}
        />
      </HowThisWorks>

      <HorizonTimeline findings={twin.findings} now={twin.now} loading={twin.loading} />

      {/* The Phase-B panel, hoisted to the whole-school view — the same light
          ledger block the standard drawer renders, on the ground (no card). */}
      <div>
        <SignalPanel
          rows={signals.signals}
          boundKeys={signals.signals.map((s) => s.key)}
          period={signals.period}
          loading={signals.loading}
          error={signals.error}
          notLicensed={signals.notLicensed}
          // Whole-school view: the empty-state sentence must not say "this standard".
          scope="school"
        />
      </div>

      <CoverageCta coverage={twin.coverage} />

      <HowThisWorks inline title="Warnings that can't run yet — and what would unlock them" className="acc-disclose">
        <NamedHolesPanel
          namedHoles={twin.coverage?.namedHoles ?? []}
          notEvaluated={twin.notEvaluated}
          loading={twin.loading}
        />
      </HowThisWorks>
    </div>
  )

  // ── Phase E: the Improvement tab ───────────────────────────────────────────
  // A placeholder that says it is one. See the component header for the list of
  // fake controls it deliberately does not ship.
  const improvementTab = (
    <ImprovementPlaceholder findings={twin.findings} loading={twin.loading} />
  )

  // ── F1: the Journey tab — WHERE the school is in its six-year cycle ────────
  const journeyTab = (
    <JourneyTab
      cycle={cycle}
      loading={cycleHook.loading}
      error={cycleHook.error}
      notLicensed={cycleHook.notLicensed}
      canEdit={canEdit}
      onSave={saveCycle}
      history={history}
      reduce={reduce}
      onNavigate={openCenterLink}
    />
  )

  // ── AURORA: the Records section — six tiles, each with ONE count ─────────
  // The approved mockup's navigation: a 3×2 grid (Journey, Domains, Standards,
  // Proof, Warnings, Improvement), each tile one short line and one pill built
  // from counts this page ALREADY holds. A pill only judges when a band exists
  // (the cycle's milestone states, the coverage thresholds the band uses, an
  // open warning); otherwise it is a grey count. Clicking a tile opens its
  // panel underneath with a compact pill bar to switch.
  const recordTiles = (() => {
    const states = cycleConfigured ? (cycle?.milestones ?? []).map((m) => m?.state) : []
    const overdue = states.filter((x) => x === 'overdue').length
    const atRisk = states.filter((x) => x === 'at_risk').length
    const journey = !cycle
      ? { verdict: null, label: null }
      : !cycleConfigured
        ? { verdict: null, label: 'Not set up' }
        : overdue > 0
          ? { verdict: 'risk', label: `${overdue} overdue` }
          : atRisk > 0
            ? { verdict: 'watch', label: `${atRisk} at risk` }
            : { verdict: 'good', label: 'On track' }

    const doms = Array.isArray(readiness?.domains) ? readiness.domains : []
    const measured = doms.filter((d) => d?.measured === true).length
    const domains = doms.length
      ? { verdict: null, label: `${measured} of ${doms.length} scored` }
      : { verdict: null, label: null }

    const leaves = adopted && readiness ? (readiness.leafCount ?? 0) : 0
    const scored = readiness?.scoredCount ?? 0
    const covered = readiness?.coveredCount ?? 0
    const selfAssess = cycleConfigured ? (cycle?.milestones ?? []).find((m) => m?.measure?.kind === 'scored') : null
    const scoredVerdict =
      selfAssess?.state === 'overdue'
        ? 'risk'
        : selfAssess?.state === 'at_risk'
          ? 'watch'
          : selfAssess && (selfAssess.state === 'done' || selfAssess.state === 'on_track')
            ? 'good'
            : null
    const total = summary.total ?? 0
    const standardsPill =
      leaves > 0
        ? { verdict: scoredVerdict, label: `${scored} of ${leaves} scored` }
        : total > 0
          ? { verdict: null, label: `${total} in your records` }
          : { verdict: null, label: null }

    const proofDen = leaves > 0 ? leaves : total
    const proofNum = leaves > 0 ? covered : (summary.withEvidence ?? 0)
    const proofPct = proofDen === 0 ? 0 : Math.round((proofNum / proofDen) * 100)
    const proof =
      proofDen === 0
        ? { verdict: null, label: null }
        : proofNum >= proofDen
          ? { verdict: 'good', label: 'All backed' }
          : {
              verdict: proofPct >= 80 ? 'good' : proofPct >= 50 ? 'watch' : 'risk',
              label: `${proofDen - proofNum} missing`,
            }

    const open = earlyWarningItems.length
    const warnings = twin.loading
      ? { verdict: null, label: null }
      : open > 0
        ? { verdict: 'risk', label: `${open} open` }
        : { verdict: 'good', label: 'None open' }

    const cand = improvementCandidates(twin.findings ?? []).length
    const improvement =
      twin.loading || cand === 0 ? { verdict: null, label: null } : { verdict: null, label: `${cand} to plan` }

    return [
      { key: 'journey', icon: Route, desc: 'Every milestone in your cycle, with dates.', ...journey },
      { key: 'domains', icon: Layers, desc: 'The big areas the accreditor reviews.', ...domains },
      { key: 'standards', icon: ListChecks, desc: 'Score each standard against the rubric.', ...standardsPill },
      { key: 'evidence', icon: Paperclip, desc: 'Files that back up each score.', ...proof },
      { key: 'signals', icon: AlertTriangle, desc: 'Gaps KYRO found, with the fix for each.', ...warnings },
      { key: 'improvement', icon: TrendingUp, desc: 'Plans to close the gaps.', ...improvement },
    ]
  })()

  const activeRecordLabel = CENTER_TABS.find((t) => t.key === tab)?.label ?? null
  const recordsBody = (
    <div className="acc-records">
      <AuroraTileGrid cols={3} data-testid="records-tiles">
        {recordTiles.map((t) => {
          const label = CENTER_TABS.find((x) => x.key === t.key)?.label ?? t.key
          const on = t.key === tab
          return (
            <AuroraTile
              key={t.key}
              icon={t.icon}
              title={label}
              desc={t.desc}
              verdict={t.verdict}
              verdictLabel={t.label}
              onClick={() => openRecord(t.key)}
              ariaLabel={`Open ${label}`}
              className={on ? 'acc-rec-on' : ''}
              data-testid={`records-tile-${t.key}`}
              aria-current={on ? 'true' : undefined}
            />
          )
        })}
      </AuroraTileGrid>
      {tab ? (
        <div id="acc-records-open" className="acc-records-open">
          <div role="tablist" aria-label="Records" className="au-tabs">
            {CENTER_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={t.key === tab}
                onClick={() => chooseTab(t.key)}
                className="au-tab"
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="au-card au-card-flat au-register min-w-0" aria-label={activeRecordLabel ?? undefined} role="tabpanel">
            {tab === 'journey'
              ? journeyTab
              : tab === 'domains'
                ? domainGrid
                : tab === 'evidence'
                  ? evidenceTab
                  : tab === 'signals'
                    ? signalsTab
                    : tab === 'improvement'
                      ? improvementTab
                      : registerTable}
          </div>
        </div>
      ) : null}
    </div>
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
      onSelectTarget={onSelectTarget}
      onGapClick={scrollToStandard}
      reduce={reduce}
      history={history}
      cycle={cycle}
      onOpenJourney={openJourney}
      onUnbackedClick={() => {
        setRegisterFilter('unbacked')
        chooseTab('standards')
      }}
      // AURORA: the index is drawn on the band (ReadinessDial) and the cycle
      // has its own section above, so neither is repeated here.
      dial={false}
      showCountdown={!cycleConfigured}
      onImproveStandard={ruleApi.improveStandard}
      first={!cycleConfigured && !(cycle && adopted)}
    />
  )

  // ── AURORA: the sections under the band — where the school is in its
  // cycle, then the readiness sections (quickest wins, must-pass checks, the
  // score). The full road and every register stay one tab away below.
  const overviewSections = (
    <>
      <CycleStepper
        cycle={cycle}
        notLicensed={cycleHook.notLicensed}
        adopted={adopted}
        onOpenJourney={openJourney}
        first
      />
      {readinessHero}
    </>
  )

  // The Needs-attention strip merges two lists; its subtitle names both, by
  // what each counts, so it agrees with the Records "Warnings" tile (open
  // engine warnings only) instead of calling every to-do a warning.
  // The rail is the engine's open warnings (earlyWarningItems — the SAME list
  // the tile counts) merged with the readiness to-dos; its total minus the
  // warnings is exactly the to-dos.
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  const railWarnings = earlyWarningItems.length
  const railTodos = Math.max(0, attentionItems.list.length + attentionItems.more - railWarnings)
  const attentionSubtitle =
    railWarnings + railTodos === 0
      ? 'Nothing waiting on you'
      : [
          railWarnings > 0 ? plural(railWarnings, 'open warning') : null,
          railTodos > 0 ? plural(railTodos, 'to-do') : null,
        ]
          .filter(Boolean)
          .join(' · ')

  const commandCenter = (
    <DomainCommandCenter
      showAddData
      moduleKey="accreditation"
      eyebrow={bandEyebrow}
      title="Accreditation"
      verdict={bandVerdict}
      heroAside={adopted && readiness ? <ReadinessDial readiness={readiness} reduce={reduce} /> : null}
      attentionCount={attentionItems.list.length}
      kpis={kpis}
      // AURORA: the six registers are TILES (recordsBody), not a tab bar —
      // DCC's own tab bar is switched off by handing it no tabs.
      tabs={[]}
      registerTitle="Records"
      registerTable={recordsBody}
      attentionItems={attentionItems.list}
      attentionMoreCount={attentionItems.more}
      attentionOnMore={() => openRecord('signals')}
      aboveKpis={overviewSections}
      registerSubtitle="Everything behind the score"
      attentionSubtitle={attentionSubtitle}
      howItWorks={
        <>
          <p>
            Your projected score is the average of your own rubric scores across the framework&apos;s
            standards. Proof backs a score; it does not raise it. Must-pass checks are pass or fail and sit
            outside the score.
          </p>
          <p>
            Warnings come from KYRO&apos;s early-warning rules over your school&apos;s own numbers. A rule we
            cannot check is listed as not checked, never as passed.
          </p>
        </>
      }
      // THE DENSEST REGISTER IN THE APP. Standards carries code, standard,
      // rating, coverage, risk, review and actions; at two-thirds width the last
      // two sat behind a horizontal scrollbar, so a reader had to scroll sideways
      // to find out whether a standard needed a decision. Full width, with the
      // needs-attention rail beneath rather than squeezed beside.
      wideRegister
      actions={
        /* AIC PHASE H — the one entry control into the Mock Visit. A LINK, not a
           button, and never role-gated: a viewer is exactly the audience for
           "what would a visiting team find?", and the visit route reads for
           owner, accountant and viewer alike. */
        <AuroraButton to="/accreditation/visit" icon={<ClipboardCheck size={19} aria-hidden="true" />}>
          Mock visit
        </AuroraButton>
      }
      headerAside={
        <>
          {/* THE FRAMEWORK SWITCHER. Rendered only for a school that actually
              holds more than one accreditation — for everyone else this page
              gains no new control at all. Not role-gated: choosing which
              framework you are LOOKING at changes nothing about the school, and
              a viewer is exactly the person who needs to look at both. */}
          {multiFramework && adoptedFrameworks.length > 1 ? (
            <div
              data-testid="framework-switcher"
              role="group"
              aria-label="Which framework this page is read against"
              className="seg"
            >
              {adoptedFrameworks.map((f) => {
                const on = f.id === activeFrameworkId
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onSelectFramework(f.id)}
                    title={f.name}
                    className="seg-btn"
                  >
                    {switcherLabels.get(f.id) ?? frameworkPillLabel(f)}
                  </button>
                )
              })}
            </div>
          ) : null}
          {/* WS1 — the DIVISION/SEAL selector: only for a framework that has
              divisions (Cognia's NCA CASI / SACS CASI / NWAC), owner/accountant
              only (it writes the profile). The seal LINE it produces renders in
              the hero, server-composed. */}
          {canEdit && activeCatalogFw?.divisions?.length ? (
            <label data-testid="division-selector" className="inline-flex items-center gap-1.5 text-small font-semibold text-ink2">
              Division:
              <select
                value={activeCatalogFw.division ?? ''}
                disabled={divisionBusy}
                onChange={(e) => onSelectDivision(activeCatalogFw.code, e.target.value)}
                aria-label="Accreditor division held"
                className="sel !h-9"
              >
                <option value="">None</option>
                {activeCatalogFw.divisions.map((d) => (
                  <option key={d.code} value={d.code} title={d.fullName}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {/* Accreditor-recognition badges (NCPSA / ICAISA) for the framework
              this page reads — absent for most, Cognia included. */}
          <RecognitionChips recognitions={activeCatalogFw?.recognitions} light />
          {/* The accreditor's evidence portal (FCC → "Filed in Accreditrac") —
              nothing for the (many) frameworks without one. */}
          <EvidencePlatformChip platform={activeCatalogFw?.evidencePlatform} light />
          {canEdit && adopted ? (
            <Button variant="secondary" onClick={openAdoptModal} icon={<Award size={14} />}>
              Frameworks
            </Button>
          ) : null}
        </>
      }
    />
  )

  const overlays = (
    <>
      {/* The band grid's answer to "now what?" — see the resolveDomain note above. */}
      <StandardImprovePanel
        open={!!improveStandard}
        standard={improveStandard}
        rubricLabels={improveStandard ? labelsFor(improveStandard) : null}
        canEdit={canEdit}
        onRubric={setRubric}
        onOpenImprovement={() => chooseTab('improvement')}
        onClose={() => setImproveStandard(null)}
        // THE SAME PANEL THE EXPANDED ROW RENDERS, not a copy — one attach flow
        // in this product, hosted wherever the instruction to attach appears.
        evidenceSlot={
          improveStandard ? (
            // A ruled section of the drawer, flush with the step's own text:
            // the panel's register-row inset is dropped here.
            <div className="a2-block [&>.a2-ink]:!px-0 [&>.a2-ink]:!pt-0">
              <EvidencePanel
                key={improveStandard.id}
                standardId={improveStandard.id}
                canEdit={canEdit}
                reduce={reduce}
                listEvidenceSources={listEvidenceSources}
                listEvidence={listEvidence}
                createEvidence={createEvidenceAndRefresh}
                updateEvidence={updateEvidenceAndRefresh}
                removeEvidence={removeEvidenceAndRefresh}
                schoolId={schoolId}
                standard={improveStandard}
                rubricLabels={labelsFor(improveStandard)}
                rubricDescriptors={descriptorsFor(improveStandard)}
                // The rubric has its own step above; a second picker here would
                // be two controls for one value.
                onRubric={null}
                fetchSuggestions={fetchSuggestions}
                linkStrategy={linkStrategy}
                clearStrategy={clearStrategy}
              />
            </div>
          ) : null
        }
      />
      <DomainResolvePanel
        open={!!resolveDomain}
        band={resolveDomain}
        label={resolveDomain ? (domainLabels?.[resolveDomain.domainKey] ?? resolveDomain.domainKey) : ''}
        findings={resolveFindings}
        api={ruleApi}
        onClose={() => setResolveDomain(null)}
      />
      {/* Expanded standard → its evidence, shown as a light panel below the center
          (the register table rows can't host their own tbody sub-row cleanly, so the
          evidence for the open row lives here — the interaction is preserved). */}
      {expandedStandard ? (
        <div className="mx-auto max-w-page px-4 pb-8 sm:px-10">
          <motion.div
            layout={!reduce}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="a2-drawer"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-5 py-3 sm:px-6">
              <div className="flex min-w-0 flex-1 basis-[20rem] items-start gap-2">
                <span className="a2-code mt-px shrink-0">{expandedStandard.code}</span>
                <span className="min-w-0 text-[15px] font-semibold leading-snug text-ink">
                  {expandedStandard.title}
                </span>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {/* F3 — the two-tab FLIP: Evidence | What this means. The
                    explainer exists only for catalog-linked standards (there is
                    no authored layer behind a hand-made row). */}
                {expandedStandard.catalogStandardId ? (
                  <div role="tablist" aria-label="Evidence or explanation" className="seg">
                    {[
                      { key: 'evidence', label: 'Evidence', Icon: FileText },
                      { key: 'explain', label: 'What this means', Icon: BookOpen },
                    ].map(({ key, label, Icon: TabIcon }) => {
                      const on = expandedView === key
                      return (
                        <button
                          key={key}
                          type="button"
                          role="tab"
                          aria-selected={on}
                          data-testid={`expanded-flip-${key}`}
                          onClick={() => setExpandedView(key)}
                          className="seg-btn"
                        >
                          <TabIcon size={12} aria-hidden /> {label}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setExpanded(null)}
                  aria-label="Close evidence panel"
                  className="a2-icon-btn"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            {expandedView === 'explain' && expandedStandard.catalogStandardId ? (
              <div className="a2-ink px-5 py-4 sm:px-6">
                <ExplainerDrawer
                  key={expandedStandard.id}
                  standardId={expandedStandard.id}
                  fetchExplainer={fetchExplainer}
                  canEdit={canEdit}
                  onAttachSuggestion={async (sug) => {
                    const body = { sourceType: sug.sourceType }
                    if (sug.sourceRef) body.sourceRef = sug.sourceRef
                    if (sug.tag) body.tag = sug.tag
                    await createEvidenceAndRefresh(expandedStandard.id, body)
                  }}
                  onLinkPlan={
                    canEdit
                      ? async (sug) => {
                          await linkStrategy(expandedStandard.id, 'strategic_plan', sug.sourceRef)
                        }
                      : null
                  }
                />
              </div>
            ) : (
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
                rubricDescriptors={descriptorsFor(expandedStandard)}
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
            )}
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
        members={members}
      />

      <AdoptFrameworkModal
        open={adoptOpen}
        onClose={() => setAdoptOpen(false)}
        frameworks={frameworks}
        onAdopt={adoptFramework}
        onRemovalImpact={frameworkRemovalImpact}
        onRemove={removeFramework}
        onUpgradeImpact={onUpgradeImpact}
        onUpgrade={onUpgradeFramework}
        onSaveCycleDate={(body) => cycleHook.save(body)}
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
              // any center-only selection (domains / evidence / signals /
              // improvement) falls back rather than rendering an active tab that
              // isn't in its list. Expressed against REGISTER_TABS so a sixth
              // center tab can never reintroduce the bug.
              activeTab={REGISTER_TABS.some((t) => t.key === tab) ? tab : 'standards'}
              onTabChange={chooseTab}
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
    <div className="acc-hue min-h-screen">
      <BillingBanner />
      <AccreditationWorkspace />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Facilities route — the DOMAIN COMMAND CENTER (Phase 4 register, redesigned to
// match Governance). A LIGHT command-center: Penny lands you on facilities' slice
// of the briefing — the KPIs that define its health (open items, high-priority
// open, overdue, deferred backlog), the items that need a decision (the attention
// rail with one-click Update actions), with the maintenance register a tab away.
// Built on the reusable DomainCommandCenter scaffold shared with Governance /
// Advancement / Accreditation.
//
// School-scoped (no period selector). Route stays /facilities. Gated by the
// 'facilities' module — a finance-only school direct-navving here gets a friendly
// light "module not on your plan" panel (the API 402 → notLicensed). The create /
// edit form modal is kept as a dark navy/gold overlay over the light page.
// SEPARATE from the capital schedule (deferred-maintenance ≠ planned capital).
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
  Wrench,
  Pencil,
  Trash2,
  Check,
  TrendingDown,
  AlertTriangle,
  Clock,
  MapPin,
  RotateCw,
  Gavel,
  Wallet,
  Trophy,
  ShieldCheck,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import { useNavigate } from 'react-router-dom'
import DomainCommandCenter from '../components/domain/DomainCommandCenter.jsx'
import ModuleTabs, { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import ModuleRegister from '../components/module/ModuleRegister.jsx'
import { moduleHue } from '../components/module/moduleAnatomy.js'
import AddDataTab from '../components/wizard/AddDataTab.jsx'
import DatePicker from '../components/ui/DatePicker.jsx'
import EntityFormModal, {
  Field,
  Select,
  fieldInput,
  fieldTextarea,
} from '../components/ui/EntityFormModal.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useUiV2 } from '../context/UiFlagContext.jsx'
import { useFacilities, useFacilitiesBudget } from '../hooks/useFacilities.js'
import FacilitiesBudgetCard from '../components/facilities/FacilitiesBudgetCard.jsx'
import MaintenanceBidsPanel from '../components/facilities/MaintenanceBidsPanel.jsx'
import VendorsPanel, { VendorFormModal, vendorToForm } from '../components/facilities/VendorsPanel.jsx'
import {
  COMPLIANCE_KIND_NOTE,
  COMPLIANCE_KIND_OPTIONS,
  complianceKindBadge,
} from '../components/facilities/complianceKindMeta.js'
import { shortDate } from '../lib/dates.js'
import { PageHeader, DataTable, Toolbar, Pill } from '../components/ui/surface/index.js'
import '../styles/pending/b1-domain.css'

const PRIORITIES = ['low', 'medium', 'high', 'critical']
const STATUSES = ['open', 'scheduled', 'in_progress', 'resolved']
const RECURRENCES = ['none', 'weekly', 'monthly', 'quarterly', 'annual']

const PRIORITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }
const STATUS_LABEL = {
  open: 'Open',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  resolved: 'Resolved',
}
const RECURRENCE_LABEL = {
  none: 'One-off',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
}

// ── Priority + urgency → status Pill tones (2px mark + ink text) ────────────
const PRIORITY_BADGE = {
  low: { label: 'Low', tone: 'neutral' },
  medium: { label: 'Medium', tone: 'neutral' },
  high: { label: 'High', tone: 'watch' },
  critical: { label: 'Critical', tone: 'risk' },
}

const URGENCY_BADGE = {
  overdue: { label: 'Overdue', tone: 'risk' },
  'due-soon': { label: 'Due soon', tone: 'watch' },
  'on-track': { label: 'On track', tone: 'good' },
  none: null,
}

function fmtMoney(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0'
  return `$${Math.round(value).toLocaleString('en-US')}`
}

/** A status Pill from a { label, tone } def (null-safe). */
function StatusPill({ def, suffix }) {
  if (!def) return null
  return (
    <Pill variant="status" tone={def.tone}>
      {def.label}
      {suffix ?? ''}
    </Pill>
  )
}

// ── Attention-rail meta line: ink text, a 2px mark only where it is a status ─
function AttentionChip({ tone, icon: ChipIcon, children }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink2">
      {tone ? <i className={`mark tone-${tone}`} aria-hidden="true" /> : null}
      {ChipIcon ? <ChipIcon size={11} aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

/** The muted "where · what" line under an attention-rail title. */
function attentionWhy(it) {
  if (it.location && it.category) return `${it.location} · ${it.category}`
  return it.location ?? it.category ?? 'Maintenance item'
}

/** The chip row under an attention-rail entry: urgency, priority, place, cost. */
function attentionMeta(it) {
  const days = typeof it.daysUntilTarget === 'number' ? it.daysUntilTarget : null
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {it.urgency === 'overdue' ? (
        <AttentionChip tone="risk" icon={AlertTriangle}>
          {days != null ? `Overdue ${Math.abs(days)}d` : 'Overdue'}
        </AttentionChip>
      ) : it.urgency === 'due-soon' ? (
        <AttentionChip tone="watch" icon={Clock}>
          {days != null ? `Due in ${days}d` : 'Due soon'}
        </AttentionChip>
      ) : null}
      {PRIORITY_BADGE[it.priority] ? (
        <AttentionChip tone={PRIORITY_BADGE[it.priority].tone === 'neutral' ? null : PRIORITY_BADGE[it.priority].tone}>
          {PRIORITY_BADGE[it.priority].label}
        </AttentionChip>
      ) : null}
      {it.location ? (
        <AttentionChip icon={MapPin}>
          {it.location}
        </AttentionChip>
      ) : null}
      {typeof it.estimatedCost === 'number' ? (
        <AttentionChip>
          {fmtMoney(it.estimatedCost)}
        </AttentionChip>
      ) : null}
    </div>
  )
}

/** Chip row for a needs-decision rail entry: pending bids, urgency, bid range (spec
 *  §4.5 — quote spread triage without opening the slide-over; falls back to the
 *  item's estimate when the list didn't carry a range). */
function attentionMetaBids(it) {
  const n = it.pendingBidCount ?? 0
  const days = typeof it.daysUntilTarget === 'number' ? it.daysUntilTarget : null
  const hasRange = typeof it.pendingBidMin === 'number' && typeof it.pendingBidMax === 'number'
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      <AttentionChip tone="watch" icon={Gavel}>
        {n} bid{n === 1 ? '' : 's'} pending
      </AttentionChip>
      {it.urgency === 'overdue' ? (
        <AttentionChip tone="risk" icon={AlertTriangle}>
          {days != null ? `Overdue ${Math.abs(days)}d` : 'Overdue'}
        </AttentionChip>
      ) : null}
      {PRIORITY_BADGE[it.priority] ? (
        <AttentionChip tone={PRIORITY_BADGE[it.priority].tone === 'neutral' ? null : PRIORITY_BADGE[it.priority].tone}>
          {PRIORITY_BADGE[it.priority].label}
        </AttentionChip>
      ) : null}
      {hasRange ? (
        <AttentionChip>
          {it.pendingBidMin === it.pendingBidMax
            ? fmtMoney(it.pendingBidMin)
            : `${fmtMoney(it.pendingBidMin)}–${fmtMoney(it.pendingBidMax)}`}
        </AttentionChip>
      ) : typeof it.estimatedCost === 'number' ? (
        <AttentionChip>
          {fmtMoney(it.estimatedCost)}
        </AttentionChip>
      ) : null}
    </div>
  )
}

// ── Register atoms: quiet icon actions, a ruled state row ────────────────────
function IconAction(props) {
  const { onClick, label, title, danger } = props
  const ActionIcon = props.Icon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={`b1-icon-act${danger ? ' b1-icon-act-danger' : ''}`}
    >
      <ActionIcon size={15} />
    </button>
  )
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

// ── Entitlement / license gate: a plain page header, no hero card ────────────
function GatePanel({ notLicensed }) {
  return (
    <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      <BackLink />
      <PageHeader
        eyebrow="Facilities"
        title={notLicensed ? 'Facilities isn\u2019t on your plan yet' : 'Your subscription is paused'}
        meta={
          notLicensed
            ? 'Add the Facilities module to track deferred maintenance and its capital backlog, and land its slice of the briefing here.'
            : 'Resume your plan to manage the maintenance register.'
        }
      />
    </div>
  )
}

// ═══════════════════════════ MAINTENANCE MODAL ══════════════════════════════
// Built on the shared premium EntityFormModal (dark navy/gold overlay over the
// light page) — same luxe surface as Governance / Advancement / Accreditation.

const EMPTY_FORM = {
  title: '',
  location: '',
  category: '',
  vendor: '',
  vendorId: '',
  priority: 'medium',
  status: 'open',
  estimatedCost: '',
  actualCost: '',
  targetDate: '',
  recurrence: 'none',
  // AIC Phase F — blank means "not a compliance inspection", which is what almost
  // every maintenance item is. It is NEVER inferred from title/category/location.
  complianceKind: '',
  notes: '',
}

function toItemBody(form) {
  const cost = form.estimatedCost.trim()
  const actual = form.actualCost.trim()
  return {
    title: form.title.trim(),
    location: form.location.trim() ? form.location.trim() : null,
    category: form.category.trim() ? form.category.trim() : null,
    vendor: form.vendor.trim() ? form.vendor.trim() : null,
    vendorId: form.vendorId ? form.vendorId : null,
    priority: form.priority,
    status: form.status,
    estimatedCost: cost === '' ? null : Number(cost),
    actualCost: actual === '' ? null : Number(actual),
    targetDate: form.targetDate ? form.targetDate : null,
    recurrence: form.recurrence,
    // Blank → null, which CLEARS the kind and returns the item to an ordinary
    // maintenance item. The closed vocabulary has no catch-all on purpose: a kind
    // we did not model is recorded as null, never as "other".
    complianceKind: form.complianceKind ? form.complianceKind : null,
    notes: form.notes.trim() ? form.notes.trim() : null,
  }
}

export function MaintenanceFormModal({ open, initial, vendors = [], onClose, onSave, reduce }) {
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
    if (form.actualCost.trim() && Number.isNaN(Number(form.actualCost))) {
      setErr('Actual cost must be a number.')
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

  return (
    <EntityFormModal
      open={open}
      icon={Wrench}
      title={initial ? 'Edit maintenance item' : 'Add maintenance item'}
      subtitle="Recurring or one-off upkeep"
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={initial ? 'Save item' : 'Add item'}
      reduce={reduce}
    >
      <Field label="Title" span={2} index={0} reduce={reduce}>
        <input
          value={form.title}
          onChange={set('title')}
          maxLength={200}
          placeholder="e.g. Replace gym roof membrane"
          className={fieldInput}
          autoFocus
        />
      </Field>
      <Field label="Location" index={1} reduce={reduce}>
        <input
          value={form.location}
          onChange={set('location')}
          maxLength={200}
          placeholder="e.g. Gymnasium"
          className={fieldInput}
        />
      </Field>
      <Field label="Category" index={2} reduce={reduce}>
        <input
          value={form.category}
          onChange={set('category')}
          maxLength={80}
          placeholder="e.g. Roofing"
          className={fieldInput}
        />
      </Field>
      <Field label="Vendor" index={3} reduce={reduce}>
        <Select value={form.vendorId} onChange={set('vendorId')}>
          <option value="">— none —</option>
          {vendors
            .filter((v) => v.active !== false || v.id === form.vendorId)
            .map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Or vendor name (free text)" index={3} reduce={reduce}>
        <input
          value={form.vendor}
          onChange={set('vendor')}
          maxLength={160}
          placeholder="e.g. ACME Roofing Co."
          className={fieldInput}
        />
      </Field>
      <Field label="Priority" index={4} reduce={reduce}>
        <Select value={form.priority} onChange={set('priority')}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status" index={5} reduce={reduce}>
        <Select value={form.status} onChange={set('status')}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Estimated cost ($)" index={6} reduce={reduce}>
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.estimatedCost}
          onChange={set('estimatedCost')}
          placeholder="e.g. 125000"
          className={fieldInput}
        />
      </Field>
      <Field label="Actual cost ($)" index={7} reduce={reduce}>
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.actualCost}
          onChange={set('actualCost')}
          placeholder="e.g. 138500"
          className={fieldInput}
        />
      </Field>
      <Field label="Target date" index={8} reduce={reduce}>
        <DatePicker
          value={form.targetDate}
          onChange={(v) => set('targetDate')({ target: { value: v } })}
          className={fieldInput}
        />
      </Field>
      <Field label="Repeats" index={9} reduce={reduce}>
        <Select value={form.recurrence} onChange={set('recurrence')}>
          {RECURRENCES.map((r) => (
            <option key={r} value={r}>
              {RECURRENCE_LABEL[r]}
            </option>
          ))}
        </Select>
      </Field>
      {/* AIC Phase F — WHAT KIND of regulatory inspection this item is. Blank is
          the default and the honest answer for almost every item; the copy under
          the select is frozen and rendered verbatim. */}
      <Field label="Compliance inspection" span={2} index={10} reduce={reduce}>
        <Select value={form.complianceKind} onChange={set('complianceKind')}>
          <option value="">— not a compliance inspection —</option>
          {COMPLIANCE_KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <span className="mt-1 block text-[11.5px] text-ink2">{COMPLIANCE_KIND_NOTE}</span>
      </Field>
      <Field label="Notes" span={2} index={11} reduce={reduce}>
        <textarea
          value={form.notes}
          onChange={set('notes')}
          maxLength={4000}
          rows={2}
          className={fieldTextarea}
        />
      </Field>
    </EntityFormModal>
  )
}

// ═══════════════════════════ LIGHT REGISTER TABLE ═══════════════════════════

function MaintenanceTable({
  items,
  loading,
  error,
  canEdit,
  onEdit,
  onDelete,
  onOpenBids,
  // Optional replacement empty state — the compliance filter needs to say why the
  // list is empty ("you have flagged none") rather than "you have no items", which
  // would be false.
  emptyState = null,
}) {
  if (loading) return <StateRow>Loading maintenance items…</StateRow>
  if (error) return <StateRow error>{error}</StateRow>
  if (items.length === 0)
    return (
      emptyState ?? (
        <StateRow title="No maintenance items yet">
          Add your first item to start tracking the deferred-maintenance backlog.
        </StateRow>
      )
    )

  const columns = [
    {
      key: 'title',
      header: 'Item',
      sortable: true,
      render: (it) => {
        const kind = complianceKindBadge(it.complianceKind)
        const recurring = it.recurrence && it.recurrence !== 'none'
        const vendor = it.vendorName ?? it.vendor
        const pending = it.pendingBidCount ?? 0
        return (
          <div className="min-w-[13rem] py-1.5">
            <span className="font-semibold">{it.title}</span>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink2">
              {it.location ? <span>{it.location}</span> : null}
              {it.category ? <span>{it.category}</span> : null}
              {/* AIC Phase F — the kind appears only when the SCHOOL said what
                  kind of inspection this is. It is never derived from the
                  category beside it, however suggestive that free text is. */}
              {kind ? (
                <Pill variant="status" tone={kind.tone} title="Recorded as a compliance inspection">
                  <ShieldCheck size={11} aria-hidden="true" />
                  {kind.label}
                </Pill>
              ) : null}
              {recurring ? (
                <span
                  className="inline-flex items-center gap-1"
                  title={`Preventive maintenance — spawns the next occurrence on resolve (${RECURRENCE_LABEL[it.recurrence] ?? it.recurrence})`}
                >
                  <RotateCw size={11} aria-hidden="true" />
                  {RECURRENCE_LABEL[it.recurrence] ?? it.recurrence}
                </span>
              ) : null}
              {vendor ? <span>{vendor}</span> : null}
              {onOpenBids ? (
                <button type="button" onClick={() => onOpenBids(it)} title="Vendor bids on this item" className="dt-link">
                  {pending > 0 ? <i className="mark tone-watch" aria-hidden="true" /> : null}
                  {it.selectedBidId ? <Trophy size={11} aria-hidden="true" /> : <Gavel size={11} aria-hidden="true" />}
                  Bids{pending > 0 ? ` (${pending})` : ''}
                </button>
              ) : null}
            </div>
          </div>
        )
      },
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      sortValue: (it) => PRIORITIES.indexOf(it.priority),
      render: (it) => <StatusPill def={PRIORITY_BADGE[it.priority]} />,
    },
    {
      // Due date and status share one column (the date, then status · urgency
      // under it), so the six columns fit beside the needs-attention rail at
      // 1280. Sorts by target date, as the old Target column did.
      key: 'targetDate',
      header: 'Due',
      sortable: true,
      render: (it) => (
        <>
          <span className="whitespace-nowrap font-semibold">{it.targetDate ? shortDate(it.targetDate) : '—'}</span>
          {it.urgency === 'overdue' && typeof it.daysUntilTarget === 'number' ? (
            <span className="dt-sub">{Math.abs(it.daysUntilTarget)}d overdue</span>
          ) : it.urgency === 'due-soon' && typeof it.daysUntilTarget === 'number' ? (
            <span className="dt-sub">in {it.daysUntilTarget}d</span>
          ) : null}
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-ink2">{STATUS_LABEL[it.status] ?? it.status}</span>
            <StatusPill def={URGENCY_BADGE[it.urgency]} />
          </span>
        </>
      ),
    },
    {
      key: 'estimatedCost',
      header: 'Est. cost',
      num: true,
      sortable: true,
      sortValue: (it) => (typeof it.estimatedCost === 'number' ? it.estimatedCost : null),
      render: (it) => (
        <>
          <span className="font-semibold">
            {typeof it.estimatedCost === 'number' ? fmtMoney(it.estimatedCost) : '—'}
          </span>
          {typeof it.actualCost === 'number' ? (
            <span className="dt-sub whitespace-nowrap">
              act {fmtMoney(it.actualCost)}
              {typeof it.variance === 'number' && it.variance !== 0 ? (
                <span className="flex items-center justify-end gap-1 font-semibold text-ink">
                  <i className={`mark ${it.variance > 0 ? 'tone-risk' : 'tone-good'}`} aria-hidden="true" />
                  {it.variance > 0 ? '+' : '−'}
                  {fmtMoney(Math.abs(it.variance))}
                </span>
              ) : null}
            </span>
          ) : null}
        </>
      ),
    },
  ]
  if (canEdit)
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      headerClassName: 'dt-num',
      className: 'dt-num',
      render: (it) => (
        <div className="dt-actions inline-flex justify-end gap-1">
          <IconAction Icon={Pencil} onClick={() => onEdit(it)} label={`Edit ${it.title}`} />
          <IconAction Icon={Trash2} danger onClick={() => onDelete(it)} label={`Delete ${it.title}`} />
        </div>
      ),
    })

  return (
    <DataTable
      caption="Maintenance register"
      columns={columns}
      rows={items}
      markOf={(it) =>
        it.urgency === 'overdue' || it.priority === 'critical'
          ? 'risk'
          : it.urgency === 'due-soon' || it.priority === 'high'
            ? 'watch'
            : null
      }
    />
  )
}

const TABS = [
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'vendors', label: 'Vendors' },
]

// Frozen needs-decision rule (mirrors the server's summarizeDecisions helper):
// an unresolved item with ≥2 pending bids, or ≥1 pending bid while overdue.
function needsDecision(it) {
  const pending = it.pendingBidCount ?? 0
  return (
    it.status !== 'resolved' && (pending >= 2 || (pending >= 1 && it.urgency === 'overdue'))
  )
}

const HIGH_PRIORITIES = new Set(['high', 'critical'])
const OPEN_STATUSES = new Set(['open', 'scheduled', 'in_progress'])

// ═══════════════════════════ PAGE ═══════════════════════════════════════════

function FacilitiesWorkspace() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const isOwner = activeSchool?.role === 'owner'
  const canEdit = isOwner || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()
  const uiV2 = useUiV2()

  const {
    items,
    vendors,
    summary,
    loading,
    error,
    notLicensed,
    notEntitled,
    refresh,
    createItem,
    updateItem,
    removeItem,
    createVendor,
    updateVendor,
    removeVendor,
  } = useFacilities(schoolId)

  // The inherited Finance budget — re-derived whenever anything moves committed /
  // actual (item saves/deletes, bid accepts) via the token.
  const [budgetToken, setBudgetToken] = useState(0)
  const bumpBudget = () => setBudgetToken((t) => t + 1)
  const {
    budget,
    loading: budgetLoading,
    saveConfig,
  } = useFacilitiesBudget(schoolId, budgetToken)

  const [tab, setTab] = useState('maintenance')
  // AIC Phase F — the register filter. A view, not a fact: it hides rows, it does
  // not change a count, a KPI or anything the server computed.
  const [inspectionsOnly, setInspectionsOnly] = useState(false)
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  // Bids slide-over (lazy — bids fetch on open) + vendor add/edit modal.
  const [bidsItem, setBidsItem] = useState(null)
  const [vendorModal, setVendorModal] = useState(null) // { editing: vendor|null } | null

  // "+ Add" launches the batch wizard; the modal stays for EDITING an item.
  const openAdd = () => navigate('/facilities?tab=add&add=maintenance')
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
      vendor: editing.vendor ?? '',
      priority: editing.priority ?? 'medium',
      status: editing.status ?? 'open',
      estimatedCost:
        editing.estimatedCost === null || editing.estimatedCost === undefined
          ? ''
          : String(editing.estimatedCost),
      actualCost:
        editing.actualCost === null || editing.actualCost === undefined
          ? ''
          : String(editing.actualCost),
      targetDate: editing.targetDate ?? '',
      recurrence: editing.recurrence ?? 'none',
      complianceKind: editing.complianceKind ?? '',
      notes: editing.notes ?? '',
      vendorId: editing.vendorId ?? '',
    }
  }, [editing])

  const onSave = async (body) => {
    if (editing) await updateItem(editing.id, body)
    else await createItem(body)
    bumpBudget()
  }

  const onDelete = async (it) => {
    if (window.confirm(`Delete "${it.title}"?`)) {
      await removeItem(it.id)
      bumpBudget()
    }
  }

  // A bid accept/reopen/add moved committed money and the item stamps — re-pull
  // the register AND re-derive the budget.
  const onBidsChanged = () => {
    refresh()
    bumpBudget()
  }

  const vendorInitial = useMemo(
    () => (vendorModal?.editing ? vendorToForm(vendorModal.editing) : null),
    [vendorModal],
  )

  const onSaveVendor = async (body) => {
    if (vendorModal?.editing) await updateVendor(vendorModal.editing.id, body)
    else await createVendor(body)
  }

  // ── KPIs (computed from the summary) ───────────────────────────────────────
  const kpis = useMemo(() => {
    const total = summary.total ?? 0
    const openCount = summary.openCount ?? 0
    const highPriorityOpenCount = summary.highPriorityOpenCount ?? 0
    const criticalOpen = summary.criticalOpen ?? 0
    const overdueOpen = summary.overdueOpen ?? 0
    const backlogCost = summary.backlogCost ?? 0

    const openKpi = {
      label: 'Open items',
      value: total > 0 ? `${openCount}/${total}` : String(openCount),
      status: overdueOpen > 0 ? 'risk' : highPriorityOpenCount > 0 ? 'watch' : 'good',
      sub:
        overdueOpen > 0
          ? { icon: TrendingDown, text: `${overdueOpen} overdue`, tone: 'bad' }
          : highPriorityOpenCount > 0
            ? { icon: Clock, text: `${highPriorityOpenCount} high priority`, tone: 'neutral' }
            : { icon: Check, text: 'all clear', tone: 'good' },
    }

    const highKpi = {
      label: 'High-priority open',
      value: String(highPriorityOpenCount),
      status: criticalOpen > 0 ? 'risk' : highPriorityOpenCount > 0 ? 'watch' : 'good',
      sub:
        criticalOpen > 0
          ? { icon: AlertTriangle, text: `${criticalOpen} critical`, tone: 'bad' }
          : { icon: Check, text: 'manageable', tone: 'good' },
    }

    const overdueKpi = {
      label: 'Overdue',
      value: String(overdueOpen),
      status: overdueOpen > 0 ? 'risk' : 'good',
      sub:
        overdueOpen > 0
          ? { icon: AlertTriangle, text: 'past target date', tone: 'bad' }
          : { icon: Check, text: 'on schedule', tone: 'good' },
    }

    const backlogKpi = {
      label: 'Deferred backlog',
      value: fmtMoney(backlogCost),
      status: 'neutral',
      sub: { icon: Wrench, text: 'open maintenance cost', tone: 'neutral' },
    }

    // KPI 5 — the inherited Finance budget's remaining headroom.
    const hasBudget = !!budget?.hasBudget
    const overBudget = !!budget?.overBudget
    const budgetKpi = {
      label: 'Budget remaining',
      value: hasBudget ? fmtMoney(budget.remaining ?? 0) : '—',
      status: overBudget ? 'risk' : hasBudget ? 'good' : 'neutral',
      sub: overBudget
        ? { icon: AlertTriangle, text: 'over budget', tone: 'bad' }
        : hasBudget
          ? { icon: Wallet, text: `of ${fmtMoney(budget.budgetTotal ?? 0)} inherited`, tone: 'neutral' }
          : { icon: Wallet, text: 'inherit from Finance', tone: 'neutral' },
    }

    // KPI 6 — items whose bids await a Leadership decision.
    const needsDecisionCount = summary.needsDecisionCount ?? 0
    const decisionKpi = {
      label: 'Needs decision',
      value: String(needsDecisionCount),
      status: needsDecisionCount > 0 ? 'watch' : 'good',
      sub:
        needsDecisionCount > 0
          ? { icon: Gavel, text: 'bids await Leadership', tone: 'neutral' }
          : { icon: Check, text: 'no bids waiting', tone: 'good' },
    }

    return [openKpi, highKpi, overdueKpi, backlogKpi, budgetKpi, decisionKpi]
  }, [summary, budget])

  // ── Needs-attention items (most-urgent first, capped at 6) ─────────────────
  const attentionItems = useMemo(() => {
    const list = []
    const seen = new Set()

    const openItems = items.filter((it) => OPEN_STATUSES.has(it.status))

    // 0) Over-budget rail banner (the inherited Finance budget is blown).
    if (budget?.hasBudget && budget.overBudget) {
      list.push({
        id: 'budget-over',
        tone: 'risk',
        sortKey: -1,
        title: 'Facilities is over budget',
        why: `${fmtMoney(Math.abs(budget.remaining ?? 0))} past the budget inherited from Finance`,
        actions: [{ label: 'View budget', primary: true, onClick: () => navigate('/budget') }],
      })
    }

    // 0.5) Needs-decision entries — pending bids awaiting Leadership. Sorted
    // BETWEEN overdue (0) and high-priority (1/2); risk tone when the item is
    // itself overdue, watch otherwise. "Review bids" opens the slide-over —
    // readable by every role (Leadership alone can accept inside).
    for (const it of openItems.filter(needsDecision)) {
      seen.add(it.id)
      const overdueNow = it.urgency === 'overdue'
      const n = it.pendingBidCount ?? 0
      list.push({
        id: `decision-${it.id}`,
        tone: overdueNow ? 'risk' : 'watch',
        sortKey: overdueNow ? 0.5 : 1.5,
        title: it.title,
        why: `${n} bid${n === 1 ? '' : 's'} pending — Leadership picks the winner`,
        meta: attentionMetaBids(it),
        actions: [
          { label: 'Review bids', primary: true, onClick: () => setBidsItem(it) },
          ...(canEdit ? [{ label: 'Update', primary: false, onClick: () => openEdit(it) }] : []),
        ],
      })
    }

    // 1) Overdue open items (not already flagged as needing a decision).
    const overdueItems = openItems.filter((it) => it.urgency === 'overdue' && !seen.has(it.id))
    for (const it of overdueItems) {
      seen.add(it.id)
      list.push({
        id: `overdue-${it.id}`,
        tone: 'risk',
        sortKey: 0,
        title: it.title,
        why: attentionWhy(it),
        meta: attentionMeta(it),
        actions: canEdit ? [{ label: 'Update', primary: true, onClick: () => openEdit(it) }] : [],
      })
    }

    // 2) Critical / high-priority open items not already flagged as overdue.
    const highItems = openItems.filter(
      (it) => HIGH_PRIORITIES.has(it.priority) && !seen.has(it.id),
    )
    // Critical first, then high.
    highItems.sort((a, b) => (b.priority === 'critical' ? 1 : 0) - (a.priority === 'critical' ? 1 : 0))
    for (const it of highItems) {
      list.push({
        id: `high-${it.id}`,
        tone: it.priority === 'critical' ? 'risk' : 'watch',
        sortKey: it.priority === 'critical' ? 1 : 2,
        title: it.title,
        why: attentionWhy(it),
        meta: attentionMeta(it),
        actions: canEdit ? [{ label: 'Update', primary: false, onClick: () => openEdit(it) }] : [],
      })
    }

    return list.sort((a, b) => a.sortKey - b.sortKey).slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, canEdit, budget])

  // ── AIC Phase F: the compliance-inspection slice of the register ───────────
  // A row counts as a compliance inspection ONLY because the school said so —
  // `complianceKind` is a closed vocabulary the school picks, never inferred from
  // `title`, `category` or `location`, all of which are free text.
  const complianceCount = useMemo(
    () => items.filter((it) => !!it.complianceKind).length,
    [items],
  )
  const visibleItems = useMemo(
    () => (inspectionsOnly ? items.filter((it) => !!it.complianceKind) : items),
    [items, inspectionsOnly],
  )

  // ── Gate ───────────────────────────────────────────────────────────────────
  if (notLicensed || notEntitled) return <GatePanel notLicensed={notLicensed} />

  const registerTable =
    tab === 'vendors' ? (
      <VendorsPanel
        vendors={vendors}
        loading={loading}
        canEdit={canEdit}
        onEdit={(v) => setVendorModal({ editing: v })}
        onDelete={(v) => removeVendor(v.id)}
        onToggleActive={(v) => updateVendor(v.id, { active: !v.active })}
      />
    ) : (
      <div className="space-y-2">
        {/* The compliance-inspection filter. `complianceCount` is a count of the
            rows the SCHOOL flagged — nothing is inferred from a title or a
            category, so a school that has flagged nothing sees a plain zero. */}
        <Toolbar aria-label="Filter the maintenance register">
          <div className="seg">
            {[
              { key: false, label: 'All items', n: items.length },
              { key: true, label: 'Compliance inspections', n: complianceCount },
            ].map((f) => {
              const active = inspectionsOnly === f.key
              return (
                <button
                  key={String(f.key)}
                  type="button"
                  onClick={() => setInspectionsOnly(f.key)}
                  aria-pressed={active}
                  className="seg-btn"
                >
                  {f.key ? <ShieldCheck size={12} aria-hidden="true" /> : null}
                  {f.label}
                  <span className="tabular-nums opacity-70">{f.n}</span>
                </button>
              )
            })}
          </div>
        </Toolbar>
        <MaintenanceTable
          items={visibleItems}
          loading={loading}
          error={error}
          canEdit={canEdit}
          onEdit={openEdit}
          onDelete={onDelete}
          onOpenBids={(it) => setBidsItem(it)}
          emptyState={
            inspectionsOnly && items.length > 0 ? (
              <StateRow title="No item is flagged as a compliance inspection">
                {COMPLIANCE_KIND_NOTE} Open an item and set its kind. We will not read it off a title
                or a category.
              </StateRow>
            ) : null
          }
        />
      </div>
    )

  const onNew = canEdit ? (tab === 'vendors' ? () => setVendorModal({ editing: null }) : openAdd) : null

  // The inherited-budget card sits BETWEEN the KPI row and the register.
  const budgetCard = (
    <FacilitiesBudgetCard
      budget={budget}
      loading={budgetLoading}
      canEdit={canEdit}
      onSaveConfig={saveConfig}
    />
  )

  const commandCenter = (
    <DomainCommandCenter
      showAddData
      moduleKey="facilities"
      eyebrow={`Facilities · ${activeSchool?.name ?? 'School'}`}
      title="Facilities"
      Icon={Wrench}
      attentionCount={attentionItems.length}
      kpis={kpis}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      onNew={onNew}
      registerTable={registerTable}
      attentionItems={attentionItems}
      beforeBody={budgetCard}
      registerTitle="Maintenance register"
      // Location rides in the Item meta line (beside category and vendor) so
      // the six columns fit in two thirds at 1280 and the rail stays a side rail.
    />
  )

  const modal = (
    <>
      <MaintenanceFormModal
        key={editing ? editing.id : 'new'}
        open={modalOpen}
        initial={initialForm}
        vendors={vendors}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
        reduce={reduce}
      />
      <VendorFormModal
        key={vendorModal?.editing ? `v-${vendorModal.editing.id}` : 'v-new'}
        open={!!vendorModal}
        initial={vendorInitial}
        onClose={() => setVendorModal(null)}
        onSave={onSaveVendor}
        reduce={reduce}
      />
      {bidsItem ? (
        <MaintenanceBidsPanel
          schoolId={schoolId}
          item={bidsItem}
          vendors={vendors}
          canEdit={canEdit}
          isOwner={isOwner}
          onClose={() => setBidsItem(null)}
          onChanged={onBidsChanged}
        />
      ) : null}
    </>
  )

  if (uiV2) {
    return (
      <ModuleAccent moduleKey="facilities">
        <ModuleTabs
          moduleKey="facilities"
          overview={commandCenter}
          addData={<AddDataTab module="facilities" schoolId={schoolId} canEdit={canEdit} />}
          records={
            <ModuleRegister
              moduleKey="facilities"
              hue={moduleHue('facilities')}
              tabs={TABS}
              activeTab={tab}
              onTabChange={setTab}
              onNew={onNew}
              registerTable={registerTable}
            />
          }
        />
        {modal}
      </ModuleAccent>
    )
  }

  return (
    <>
      {commandCenter}
      {modal}
    </>
  )
}

export default function FacilitiesPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <FacilitiesWorkspace />
    </div>
  )
}

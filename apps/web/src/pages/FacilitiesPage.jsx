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
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Wrench,
  Pencil,
  Trash2,
  Check,
  TrendingDown,
  AlertTriangle,
  Clock,
  RotateCw,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter from '../components/domain/DomainCommandCenter.jsx'
import ModuleTabs, { ModuleAccent } from '../components/module/ModuleTabs.jsx'
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
import { useFacilities } from '../hooks/useFacilities.js'

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

// ── Light-theme priority badge (restyled from the old dark pills) ────────────
const PRIORITY_BADGE = {
  low: { label: 'Low', cls: 'border-rule/60 bg-section text-muted' },
  medium: { label: 'Medium', cls: 'border-sky-300/70 bg-sky-50 text-sky-700' },
  high: { label: 'High', cls: 'border-gold/40 bg-gold/10 text-[#7a5e00]' },
  critical: { label: 'Critical', cls: 'border-danger/30 bg-danger/10 text-danger' },
}

// ── Light-theme urgency badge ────────────────────────────────────────────────
const URGENCY_BADGE = {
  overdue: { label: 'Overdue', cls: 'border-danger/30 bg-danger/10 text-danger' },
  'due-soon': { label: 'Due soon', cls: 'border-gold/40 bg-gold/10 text-[#7a5e00]' },
  'on-track': { label: 'On track', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' },
  none: null,
}

function fmtMoney(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0'
  return `$${Math.round(value).toLocaleString('en-US')}`
}

/** A small light-theme pill (shared idiom for priority + urgency signals). */
function Pill({ def, suffix }) {
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

// ── Light-theme entitlement / license gate ───────────────────────────────────
function GatePanel({ notLicensed }) {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-10 sm:py-8">
      <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
          <Wrench size={26} />
        </span>
        {notLicensed ? (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">
              Facilities isn&apos;t on your plan yet
            </h2>
            <p className="max-w-md text-[15px] text-muted">
              Add the Facilities module to track deferred maintenance and its capital backlog — and
              land its slice of the briefing here.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">Your subscription is paused</h2>
            <p className="max-w-md text-[15px] text-muted">
              Resume your plan to manage the maintenance register.
            </p>
          </>
        )}
      </div>
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
  priority: 'medium',
  status: 'open',
  estimatedCost: '',
  actualCost: '',
  targetDate: '',
  recurrence: 'none',
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
    priority: form.priority,
    status: form.status,
    estimatedCost: cost === '' ? null : Number(cost),
    actualCost: actual === '' ? null : Number(actual),
    targetDate: form.targetDate ? form.targetDate : null,
    recurrence: form.recurrence,
    notes: form.notes.trim() ? form.notes.trim() : null,
  }
}

export function MaintenanceFormModal({ open, initial, onClose, onSave, reduce }) {
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
      <Field label="Vendor" span={2} index={3} reduce={reduce}>
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
      <Field label="Notes" span={2} index={10} reduce={reduce}>
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

function MaintenanceTable({ items, loading, error, canEdit, reduce, onEdit, onDelete }) {
  if (loading)
    return (
      <StateRow>
        <p className="text-[14px] text-muted">Loading maintenance items…</p>
      </StateRow>
    )
  if (error)
    return (
      <StateRow>
        <p className="text-[14px] text-danger">{error}</p>
      </StateRow>
    )
  if (items.length === 0)
    return (
      <StateRow>
        <p className="font-serif text-[16px] italic text-muted">No maintenance items yet.</p>
        <p className="mt-1 text-[13px] text-muted">
          Add your first item to start tracking the deferred-maintenance backlog.
        </p>
      </StateRow>
    )

  return (
    <TableShell
      cols={
        <>
          <Th>Item</Th>
          <Th>Location</Th>
          <Th>Priority</Th>
          <Th>Status</Th>
          <Th right>Est / Actual</Th>
          <Th>Target</Th>
          {canEdit ? <Th right>Actions</Th> : null}
        </>
      }
    >
      <AnimatePresence initial={false}>
        {items.map((it) => (
          <motion.tr
            key={it.id}
            layout={!reduce}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            className="group border-t border-rule/50"
          >
            <td className="px-4 py-3">
              <div className="font-semibold text-navy">{it.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {it.category ? (
                  <span className="inline-flex items-center rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[11px] font-semibold text-muted">
                    {it.category}
                  </span>
                ) : null}
                {it.recurrence && it.recurrence !== 'none' ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-md border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] font-semibold text-[#7a5e00]"
                    title={`Preventive maintenance — spawns the next occurrence on resolve (${RECURRENCE_LABEL[it.recurrence] ?? it.recurrence})`}
                  >
                    <RotateCw size={11} />
                    {RECURRENCE_LABEL[it.recurrence] ?? it.recurrence}
                  </span>
                ) : null}
                {it.vendor ? (
                  <span className="inline-flex items-center rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[11px] text-muted">
                    {it.vendor}
                  </span>
                ) : null}
              </div>
            </td>
            <td className="px-4 py-3 text-muted">{it.location ?? '—'}</td>
            <td className="px-4 py-3">
              <Pill def={PRIORITY_BADGE[it.priority]} />
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[12px] capitalize text-muted">
                  {STATUS_LABEL[it.status] ?? it.status}
                </span>
                <Pill
                  def={URGENCY_BADGE[it.urgency]}
                  suffix={
                    it.urgency === 'overdue' && typeof it.daysUntilTarget === 'number'
                      ? ` · ${Math.abs(it.daysUntilTarget)}d ago`
                      : it.urgency === 'due-soon' && typeof it.daysUntilTarget === 'number'
                        ? ` · in ${it.daysUntilTarget}d`
                        : ''
                  }
                />
              </div>
            </td>
            <td className="px-4 py-3 text-right">
              <div className="font-semibold text-navy">
                {typeof it.estimatedCost === 'number' ? fmtMoney(it.estimatedCost) : '—'}
              </div>
              {typeof it.actualCost === 'number' ? (
                <div className="mt-0.5 text-[12px] text-muted">
                  act {fmtMoney(it.actualCost)}
                  {typeof it.variance === 'number' && it.variance !== 0 ? (
                    <span
                      className={`ml-1 font-semibold ${it.variance > 0 ? 'text-danger' : 'text-emerald-600'}`}
                    >
                      {it.variance > 0 ? '+' : '−'}
                      {fmtMoney(Math.abs(it.variance))}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </td>
            <td className="px-4 py-3 text-muted">{it.targetDate ?? '—'}</td>
            {canEdit ? (
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1.5 opacity-60 transition group-hover:opacity-100">
                  <IconAction Icon={Pencil} onClick={() => onEdit(it)} label={`Edit ${it.title}`} />
                  <IconAction
                    Icon={Trash2}
                    danger
                    onClick={() => onDelete(it)}
                    label={`Delete ${it.title}`}
                  />
                </div>
              </td>
            ) : null}
          </motion.tr>
        ))}
      </AnimatePresence>
    </TableShell>
  )
}

const TABS = [{ key: 'maintenance', label: 'Maintenance' }]

const HIGH_PRIORITIES = new Set(['high', 'critical'])
const OPEN_STATUSES = new Set(['open', 'scheduled', 'in_progress'])

// ═══════════════════════════ PAGE ═══════════════════════════════════════════

function FacilitiesWorkspace() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()
  const uiV2 = useUiV2()

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

  const [tab, setTab] = useState('maintenance')
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
      notes: editing.notes ?? '',
    }
  }, [editing])

  const onSave = async (body) => {
    if (editing) await updateItem(editing.id, body)
    else await createItem(body)
  }

  const onDelete = async (it) => {
    if (window.confirm(`Delete "${it.title}"?`)) await removeItem(it.id)
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

    return [openKpi, highKpi, overdueKpi, backlogKpi]
  }, [summary])

  // ── Needs-attention items (most-urgent first, capped at 6) ─────────────────
  const attentionItems = useMemo(() => {
    const list = []
    const seen = new Set()

    const openItems = items.filter((it) => OPEN_STATUSES.has(it.status))

    // 1) Overdue open items.
    const overdueItems = openItems.filter((it) => it.urgency === 'overdue')
    for (const it of overdueItems) {
      seen.add(it.id)
      const days = typeof it.daysUntilTarget === 'number' ? Math.abs(it.daysUntilTarget) : null
      list.push({
        id: `overdue-${it.id}`,
        tone: 'risk',
        sortKey: 0,
        title: `${it.title} is overdue`,
        why:
          days != null
            ? `${days} day${days === 1 ? '' : 's'} past its target date`
            : 'Past its target date',
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
        title: `${it.title} needs attention`,
        why: `high-priority · ${it.location ?? 'no location'}`,
        actions: canEdit ? [{ label: 'Update', primary: false, onClick: () => openEdit(it) }] : [],
      })
    }

    return list.sort((a, b) => a.sortKey - b.sortKey).slice(0, 6)
  }, [items, canEdit])

  // ── Gate ───────────────────────────────────────────────────────────────────
  if (notLicensed || notEntitled) return <GatePanel notLicensed={notLicensed} />

  const registerTable = (
    <MaintenanceTable
      items={items}
      loading={loading}
      error={error}
      canEdit={canEdit}
      reduce={reduce}
      onEdit={openEdit}
      onDelete={onDelete}
    />
  )

  const onNew = canEdit ? openAdd : null

  const commandCenter = (
    <DomainCommandCenter
      eyebrow="Domain · Facilities engine · system of record"
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
    />
  )

  const modal = (
    <MaintenanceFormModal
      key={editing ? editing.id : 'new'}
      open={modalOpen}
      initial={initialForm}
      onClose={() => setModalOpen(false)}
      onSave={onSave}
      reduce={reduce}
    />
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

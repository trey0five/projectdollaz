// ─────────────────────────────────────────────────────────────────────────────
// Advancement route — the DOMAIN COMMAND CENTER (Phase 4 register, redesigned to
// match Governance). A LIGHT command-center (matches the Finance home, not the old
// dark banner+list page): Penny lands you on advancement's slice of the briefing —
// the KPIs that define its health (raised this year, active campaigns, behind goal,
// closing soon), the items that need a decision (the attention rail with one-click
// Update actions), with the campaign register a tab away. Built on the reusable
// DomainCommandCenter scaffold.
//
// School-scoped (no period selector). Route stays /advancement. Gated by the
// 'advancement' module — a finance-only school direct-navving here gets a friendly
// light "module not on your plan" panel (the API 402 → notLicensed). The create /
// edit CampaignFormModal is kept as a dark navy/gold overlay over the light page.
// AGGREGATE-only (no per-donor PII).
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  HeartHandshake,
  Pencil,
  Trash2,
  X,
  Check,
  TrendingDown,
  Clock,
  CalendarClock,
  AlertTriangle,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter from '../components/domain/DomainCommandCenter.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useAdvancement } from '../hooks/useAdvancement.js'

const STATUSES = ['planned', 'active', 'closed']
const CAMPAIGN_TYPES = ['annual_fund', 'capital', 'other']

const TYPE_LABEL = {
  annual_fund: 'Annual Fund',
  capital: 'Capital Campaign',
  other: 'Other',
}

const STATUS_LABEL = {
  planned: 'Planned',
  active: 'Active',
  closed: 'Closed',
}

// ── Light-theme urgency badge (restyled from the old dark pills) ──────────────
const URGENCY_BADGE = {
  overdue: { label: 'Overdue', cls: 'border-danger/30 bg-danger/10 text-danger' },
  'closing-soon': { label: 'Closing soon', cls: 'border-gold/40 bg-gold/10 text-[#7a5e00]' },
  'on-track': { label: 'On track', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' },
  none: null,
}

function fmtMoney(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0'
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 10_000) return `$${Math.round(value / 1_000)}K`
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function fmtMoneyFull(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0'
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function fmtPct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return `${Math.round(value * 100)}%`
}

// ── Short "Jul 6" date from a yyyy-mm-dd string (UTC-safe, no tz drift). ──────
function shortDate(iso) {
  if (!iso) return null
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
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

function Badge({ def }) {
  if (!def) return null
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${def.cls}`}
    >
      {def.label}
    </span>
  )
}

/** A light-theme pct-of-goal bar. pct is a RATIO (0.54 = 54%); null → an "unset" bar. */
function ProgressBar({ pct, reduce }) {
  const has = typeof pct === 'number' && Number.isFinite(pct)
  const clamped = has ? Math.min(Math.max(pct, 0), 1) : 0
  const over = has && pct > 1
  return (
    <div className="h-2 w-full overflow-hidden rounded-full border border-rule/50 bg-section">
      <motion.div
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${clamped * 100}%` }}
        transition={{ duration: reduce ? 0 : 0.6, ease: 'easeOut' }}
        className={`h-full ${over ? 'bg-emerald-500' : 'bg-gold-gradient'}`}
      />
    </div>
  )
}

// ── Light-theme entitlement / license gate ───────────────────────────────────
function GatePanel({ notLicensed }) {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-10 sm:py-8">
      <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
          <HeartHandshake size={26} />
        </span>
        {notLicensed ? (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">
              Advancement isn&apos;t on your plan yet
            </h2>
            <p className="max-w-md text-[15px] text-muted">
              Add the Advancement module to track fundraising campaigns and their giving progress —
              and land its slice of the briefing here.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">Your subscription is paused</h2>
            <p className="max-w-md text-[15px] text-muted">
              Resume your plan to manage the advancement register.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════ CAMPAIGN MODAL (dark overlay, reused) ═══════════

const EMPTY_FORM = {
  name: '',
  campaignType: '',
  goalAmount: '',
  raisedAmount: '',
  fiscalYear: '',
  startDate: '',
  closeDate: '',
  status: 'active',
  notes: '',
}

function toCampaignBody(form) {
  const goal = form.goalAmount.trim()
  const raised = form.raisedAmount.trim()
  const fy = form.fiscalYear.trim()
  return {
    name: form.name.trim(),
    campaignType: form.campaignType ? form.campaignType : null,
    goalAmount: goal === '' ? null : Number(goal),
    raisedAmount: raised === '' ? 0 : Number(raised),
    fiscalYear: fy === '' ? null : Number(fy),
    startDate: form.startDate ? form.startDate : null,
    closeDate: form.closeDate ? form.closeDate : null,
    status: form.status,
    notes: form.notes.trim() ? form.notes.trim() : null,
  }
}

const inputCls =
  'mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60'

function CampaignFormModal({ initial, onClose, onSave, reduce }) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setErr('A campaign name is required.')
      return
    }
    if (form.goalAmount.trim() && Number.isNaN(Number(form.goalAmount))) {
      setErr('Goal amount must be a number.')
      return
    }
    if (form.raisedAmount.trim() && Number.isNaN(Number(form.raisedAmount))) {
      setErr('Raised amount must be a number.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onSave(toCampaignBody(form))
      onClose()
    } catch {
      setErr('Could not save this campaign.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg rounded-2xl border-2 border-gold/30 bg-navy-gradient p-6 shadow-navy-glow"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-[18px] uppercase tracking-[0.12em] text-gold-light">
            {initial ? 'Edit campaign' : 'Add campaign'}
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
              Campaign name
              <input
                value={form.name}
                onChange={set('name')}
                maxLength={200}
                placeholder="e.g. 2026 Annual Fund"
                className={inputCls}
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Type
              <select value={form.campaignType} onChange={set('campaignType')} className={inputCls}>
                <option value="">—</option>
                {CAMPAIGN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[13px] text-white/70">
              Status
              <select value={form.status} onChange={set('status')} className={inputCls}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[13px] text-white/70">
              Goal amount ($)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.goalAmount}
                onChange={set('goalAmount')}
                placeholder="e.g. 250000"
                className={inputCls}
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Raised so far ($)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.raisedAmount}
                onChange={set('raisedAmount')}
                placeholder="e.g. 135000"
                className={inputCls}
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Fiscal year
              <input
                type="number"
                min="2000"
                max="2100"
                value={form.fiscalYear}
                onChange={set('fiscalYear')}
                placeholder="e.g. 2026"
                className={inputCls}
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Start date
              <input type="date" value={form.startDate} onChange={set('startDate')} className={inputCls} />
            </label>
            <label className="block text-[13px] text-white/70">
              Close date
              <input type="date" value={form.closeDate} onChange={set('closeDate')} className={inputCls} />
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
              {saving ? 'Saving…' : 'Save campaign'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ═══════════════════════════ LIGHT REGISTER TABLE ═══════════════════════════

function CampaignsTable({ campaigns, loading, error, canEdit, reduce, onEdit, onDelete }) {
  if (loading) return <StateRow><p className="text-[14px] text-muted">Loading campaigns…</p></StateRow>
  if (error)
    return (
      <StateRow>
        <p className="text-[14px] text-danger">{error}</p>
      </StateRow>
    )
  if (campaigns.length === 0)
    return (
      <StateRow>
        <p className="font-serif text-[16px] italic text-muted">No campaigns yet.</p>
        <p className="mt-1 text-[13px] text-muted">
          Add your first campaign to start tracking fundraising progress.
        </p>
      </StateRow>
    )

  return (
    <TableShell
      cols={
        <>
          <Th>Campaign</Th>
          <Th>Type</Th>
          <Th>Progress</Th>
          <Th right>Raised · Goal</Th>
          <Th>Close</Th>
          {canEdit ? <Th right>Actions</Th> : null}
        </>
      }
    >
      <AnimatePresence initial={false}>
        {campaigns.map((c) => {
          const pctLabel = fmtPct(c.pctOfGoal)
          return (
            <motion.tr
              key={c.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              className="group border-t border-rule/50"
            >
              <td className="px-4 py-3">
                <div className="font-semibold text-navy">{c.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[11px] capitalize text-muted">
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                  <Badge def={URGENCY_BADGE[c.urgency]} />
                </div>
              </td>
              <td className="px-4 py-3 text-muted">{TYPE_LABEL[c.campaignType] ?? '—'}</td>
              <td className="px-4 py-3">
                <div className="w-32">
                  <ProgressBar pct={c.pctOfGoal} reduce={reduce} />
                  <div className="mt-1 text-[11.5px] font-semibold text-muted">
                    {pctLabel ? `${pctLabel} of goal` : 'no goal set'}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="font-semibold text-navy">{fmtMoneyFull(c.raisedAmount ?? 0)}</span>
                <span className="text-muted">
                  {typeof c.goalAmount === 'number' ? ` / ${fmtMoneyFull(c.goalAmount)}` : ''}
                </span>
              </td>
              <td className="px-4 py-3 text-muted">{c.closeDate ? (shortDate(c.closeDate) ?? c.closeDate) : '—'}</td>
              {canEdit ? (
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5 opacity-60 transition group-hover:opacity-100">
                    <IconAction Icon={Pencil} onClick={() => onEdit(c)} label={`Edit ${c.name}`} />
                    <IconAction Icon={Trash2} danger onClick={() => onDelete(c)} label={`Delete ${c.name}`} />
                  </div>
                </td>
              ) : null}
            </motion.tr>
          )
        })}
      </AnimatePresence>
    </TableShell>
  )
}

const TABS = [{ key: 'campaigns', label: 'Campaigns' }]

// ═══════════════════════════ PAGE ═══════════════════════════════════════════

function AdvancementWorkspace() {
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
  } = useAdvancement(schoolId)

  const [tab, setTab] = useState('campaigns')
  const [modal, setModal] = useState(null) // { entity } | null

  const openCreate = () => setModal({ entity: null })
  const openEdit = (entity) => setModal({ entity })
  const closeModal = () => setModal(null)

  const onDelete = async (c) => {
    if (window.confirm(`Delete "${c.name}"?`)) await removeItem(c.id)
  }

  // ── KPIs (computed from the summary) ───────────────────────────────────────
  const kpis = useMemo(() => {
    const totalGoal = summary.totalGoal ?? 0
    const totalRaised = summary.totalRaised ?? 0
    const overallPct = summary.overallPctOfGoal
    const activeCount = summary.activeCount ?? 0
    const behind = summary.behindGoalActiveCount ?? 0
    const closingSoon = summary.closingSoonActiveCount ?? 0
    const overdue = summary.overdueActiveCount ?? 0
    const onGoalPace = typeof overallPct === 'number' && overallPct >= 0.9

    // 1) Raised this year.
    const raisedKpi = {
      label: 'Raised this year',
      value: fmtMoney(totalRaised),
      status: onGoalPace ? 'good' : 'watch',
      sub: {
        icon: onGoalPace ? Check : TrendingDown,
        text:
          totalGoal > 0
            ? `${fmtPct(overallPct) ?? '0%'} of ${fmtMoney(totalGoal)} goal`
            : 'no goal set',
        tone: onGoalPace ? 'good' : 'neutral',
      },
    }

    // 2) Active campaigns.
    const activeKpi = {
      label: 'Active campaigns',
      value: String(activeCount),
      status: behind > 0 ? 'risk' : 'good',
      sub:
        behind > 0
          ? { icon: TrendingDown, text: `${behind} behind goal`, tone: 'bad' }
          : { icon: Check, text: 'on pace', tone: 'good' },
    }

    // 3) Behind goal.
    const behindKpi = {
      label: 'Behind goal',
      value: String(behind),
      status: behind > 0 ? 'risk' : 'good',
      sub:
        behind > 0
          ? { icon: TrendingDown, text: 'active campaigns under pace', tone: 'bad' }
          : { icon: Check, text: 'all on pace', tone: 'good' },
    }

    // 4) Closing soon.
    const closingKpi = {
      label: 'Closing soon',
      value: String(closingSoon),
      status: closingSoon > 0 ? 'watch' : 'neutral',
      sub:
        overdue > 0
          ? { icon: AlertTriangle, text: `${overdue} past close date`, tone: 'bad' }
          : { icon: CalendarClock, text: 'within 45 days', tone: 'neutral' },
    }

    return [raisedKpi, activeKpi, behindKpi, closingKpi]
  }, [summary])

  // ── Needs-attention items (most-urgent first, capped at 6) ─────────────────
  const attentionItems = useMemo(() => {
    const active = items.filter((c) => c.status === 'active')
    const raw = []

    // 1) Overdue active campaigns (past their close date).
    for (const c of active.filter((c) => c.urgency === 'overdue')) {
      raw.push({
        id: `overdue-${c.id}`,
        tone: 'risk',
        sortKey: 0,
        title: `${c.name} is past its close date`,
        why:
          typeof c.daysUntilClose === 'number'
            ? `Closed ${Math.abs(c.daysUntilClose)} day${Math.abs(c.daysUntilClose) === 1 ? '' : 's'} ago · still open`
            : 'Past its close date · still open',
        actions: canEdit ? [{ label: 'Update', primary: true, onClick: () => openEdit(c) }] : [],
      })
    }

    // 2) Active campaigns behind goal.
    const behind = active.filter(
      (c) => typeof c.pctOfGoal === 'number' && c.pctOfGoal < 0.9 && c.urgency !== 'overdue',
    )
    for (const c of behind) {
      raw.push({
        id: `behind-${c.id}`,
        tone: 'watch',
        sortKey: 1,
        title: `${c.name} is behind goal`,
        why: `${fmtPct(c.pctOfGoal) ?? '0%'} of goal raised`,
        actions: canEdit ? [{ label: 'Update', primary: false, onClick: () => openEdit(c) }] : [],
      })
    }

    // 3) Active campaigns closing soon.
    for (const c of active.filter((c) => c.urgency === 'closing-soon')) {
      const days = typeof c.daysUntilClose === 'number' ? c.daysUntilClose : null
      raw.push({
        id: `closing-${c.id}`,
        tone: 'watch',
        sortKey: 2,
        title: days != null ? `${c.name} closes in ${days} day${days === 1 ? '' : 's'}` : `${c.name} closes soon`,
        why:
          typeof c.pctOfGoal === 'number'
            ? `${fmtPct(c.pctOfGoal)} of goal raised so far`
            : 'Approaching its close date',
        actions: canEdit ? [{ label: 'Update', primary: false, onClick: () => openEdit(c) }] : [],
      })
    }

    return raw.sort((a, b) => a.sortKey - b.sortKey).slice(0, 6)
  }, [items, canEdit])

  // ── Gate ───────────────────────────────────────────────────────────────────
  if (notLicensed || notEntitled) return <GatePanel notLicensed={notLicensed} />

  const registerTable = (
    <CampaignsTable
      campaigns={items}
      loading={loading}
      error={error}
      canEdit={canEdit}
      reduce={reduce}
      onEdit={openEdit}
      onDelete={onDelete}
    />
  )

  const onNew = canEdit ? () => openCreate() : null

  const onSave = async (body) => {
    if (modal?.entity) await updateItem(modal.entity.id, body)
    else await createItem(body)
  }

  const initialForm = modal?.entity
    ? {
        name: modal.entity.name ?? '',
        campaignType: modal.entity.campaignType ?? '',
        goalAmount:
          modal.entity.goalAmount === null || modal.entity.goalAmount === undefined
            ? ''
            : String(modal.entity.goalAmount),
        raisedAmount:
          modal.entity.raisedAmount === null || modal.entity.raisedAmount === undefined
            ? ''
            : String(modal.entity.raisedAmount),
        fiscalYear:
          modal.entity.fiscalYear === null || modal.entity.fiscalYear === undefined
            ? ''
            : String(modal.entity.fiscalYear),
        startDate: modal.entity.startDate ?? '',
        closeDate: modal.entity.closeDate ?? '',
        status: modal.entity.status ?? 'active',
        notes: modal.entity.notes ?? '',
      }
    : null

  return (
    <>
      <DomainCommandCenter
        eyebrow="Domain · Advancement engine · system of record"
        title="Advancement"
        Icon={HeartHandshake}
        attentionCount={attentionItems.length}
        kpis={kpis}
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        onNew={onNew}
        registerTable={registerTable}
        attentionItems={attentionItems}
      />

      {modal ? (
        <CampaignFormModal
          key={modal.entity ? modal.entity.id : 'new'}
          initial={initialForm}
          onClose={closeModal}
          onSave={onSave}
          reduce={reduce}
        />
      ) : null}
    </>
  )
}

export default function AdvancementPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <AdvancementWorkspace />
    </div>
  )
}

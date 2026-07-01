// ─────────────────────────────────────────────────────────────────────────────
// Advancement route (Phase 4 v1): AppShell chrome + the fundraising campaign register.
// School-scoped (no period selector). Gated by the 'advancement' module — the nav
// item is hidden by hasModule, but a direct-nav for a finance-only school renders a
// friendly "module not on your plan" panel (the API 402 → notLicensed). A giving
// summary banner headlines total raised vs goal + overall progress; each row shows a
// status/urgency badge, a pct-of-goal progress bar, and raised/goal. Navy/gold theme,
// reduced-motion safe, no setState-in-effect. AGGREGATE-only (no per-donor PII).
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { HeartHandshake, Pencil, Plus, Trash2, X } from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useAdvancement } from '../hooks/useAdvancement.js'

const STATUSES = ['planned', 'active', 'closed']
const CAMPAIGN_TYPES = ['annual_fund', 'capital', 'other']

const STATUS_BADGE = {
  planned: { label: 'Planned', cls: 'border-sky-400/50 bg-sky-500/15 text-sky-200' },
  active: { label: 'Active', cls: 'border-gold/50 bg-gold/15 text-gold-light' },
  closed: { label: 'Closed', cls: 'border-white/20 bg-white/5 text-white/60' },
}

const URGENCY_BADGE = {
  overdue: { label: 'Overdue', cls: 'border-red-400/50 bg-red-500/15 text-red-200' },
  'closing-soon': { label: 'Closing soon', cls: 'border-amber-400/50 bg-amber-500/15 text-amber-200' },
  'on-track': { label: 'On track', cls: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' },
  none: null,
}

const TYPE_LABEL = {
  annual_fund: 'Annual Fund',
  capital: 'Capital Campaign',
  other: 'Other',
}

function fmtMoney(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0'
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function fmtPct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return `${Math.round(value * 100)}%`
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

/** A navy-on-gold progress bar. pct is a RATIO (0.54 = 54%); null → an "unset" bar. */
function ProgressBar({ pct, reduce }) {
  const has = typeof pct === 'number' && Number.isFinite(pct)
  const clamped = has ? Math.min(Math.max(pct, 0), 1) : 0
  const over = has && pct > 1
  return (
    <div className="h-2 w-full overflow-hidden rounded-full border border-white/10 bg-navy/60">
      <motion.div
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${clamped * 100}%` }}
        transition={{ duration: reduce ? 0 : 0.6, ease: 'easeOut' }}
        className={`h-full ${over ? 'bg-emerald-400' : 'bg-gold'}`}
      />
    </div>
  )
}

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

function CampaignFormModal({ open, initial, onClose, onSave, reduce }) {
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
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Type
              <select
                value={form.campaignType}
                onChange={set('campaignType')}
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              >
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
              Goal amount ($)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.goalAmount}
                onChange={set('goalAmount')}
                placeholder="e.g. 250000"
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
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
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
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
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Start date
              <input
                type="date"
                value={form.startDate}
                onChange={set('startDate')}
                className="mt-1 w-full rounded-lg border-2 border-white/20 bg-navy/40 px-3 py-2 text-white outline-none focus:border-gold/60"
              />
            </label>
            <label className="block text-[13px] text-white/70">
              Close date
              <input
                type="date"
                value={form.closeDate}
                onChange={set('closeDate')}
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
              {saving ? 'Saving…' : 'Save campaign'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function AdvancementPanel() {
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
      campaignType: editing.campaignType ?? '',
      goalAmount: editing.goalAmount === null || editing.goalAmount === undefined ? '' : String(editing.goalAmount),
      raisedAmount: editing.raisedAmount === null || editing.raisedAmount === undefined ? '' : String(editing.raisedAmount),
      fiscalYear: editing.fiscalYear === null || editing.fiscalYear === undefined ? '' : String(editing.fiscalYear),
      startDate: editing.startDate ?? '',
      closeDate: editing.closeDate ?? '',
      status: editing.status ?? 'active',
      notes: editing.notes ?? '',
    }
  }, [editing])

  const onSave = async (body) => {
    if (editing) await updateItem(editing.id, body)
    else await createItem(body)
  }

  const onDelete = async (c) => {
    if (window.confirm(`Delete "${c.name}"?`)) {
      await removeItem(c.id)
    }
  }

  const showList = !notLicensed && !notEntitled && !loading && !error

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/15 text-gold-light shadow-glow">
            <HeartHandshake size={22} />
          </span>
          <div>
            <h1 className="font-serif text-[22px] uppercase tracking-[0.12em] text-gold-light">
              Advancement
            </h1>
            <p className="text-[13px] text-white/60">
              Your fundraising campaigns — goal, raised, close date, and giving progress.
            </p>
          </div>
        </div>
        {canEdit && showList ? (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-gold/60 bg-gold/15 px-4 py-2 text-[14px] font-semibold text-gold-light hover:bg-gold/25"
          >
            <Plus size={16} /> Add campaign
          </button>
        ) : null}
      </div>

      {/* Giving summary banner */}
      {showList && summary.total > 0 ? (
        <div className="mb-6 rounded-2xl border-2 border-gold/20 bg-navy/40 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[12px] uppercase tracking-[0.1em] text-white/50">Total raised vs goal</p>
              <p className="mt-1 text-[24px] font-semibold text-white">
                {fmtMoney(summary.totalRaised)}
                <span className="text-[16px] font-normal text-white/50">
                  {' '}/ {summary.totalGoal > 0 ? fmtMoney(summary.totalGoal) : 'no goal set'}
                </span>
              </p>
            </div>
            <p className="text-[22px] font-semibold text-gold-light">
              {fmtPct(summary.overallPctOfGoal) ?? '—'}
            </p>
          </div>
          <div className="mt-3">
            <ProgressBar pct={summary.overallPctOfGoal} reduce={reduce} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-navy/40 p-3">
              <p className="text-[11px] uppercase tracking-[0.1em] text-white/50">Active</p>
              <p className="mt-0.5 text-[20px] font-semibold text-white">{summary.activeCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-navy/40 p-3">
              <p className="text-[11px] uppercase tracking-[0.1em] text-white/50">Behind goal</p>
              <p className="mt-0.5 text-[20px] font-semibold text-amber-200">
                {summary.behindGoalActiveCount}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-navy/40 p-3">
              <p className="text-[11px] uppercase tracking-[0.1em] text-white/50">Closing soon</p>
              <p className="mt-0.5 text-[20px] font-semibold text-amber-200">
                {summary.closingSoonActiveCount}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-navy/40 p-3">
              <p className="text-[11px] uppercase tracking-[0.1em] text-white/50">Overdue</p>
              <p className="mt-0.5 text-[20px] font-semibold text-red-200">
                {summary.overdueActiveCount}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {notLicensed ? (
        <div className="rounded-2xl border-2 border-gold/30 bg-navy/30 p-8 text-center">
          <p className="text-[15px] text-white/80">
            The Advancement module isn&apos;t on your plan yet.
          </p>
          <p className="mt-1 text-[13px] text-white/55">
            Add Advancement to track fundraising campaigns and their giving progress.
          </p>
        </div>
      ) : notEntitled ? (
        <div className="rounded-2xl border-2 border-gold/30 bg-navy/30 p-8 text-center">
          <p className="text-[15px] text-white/80">Your subscription is paused.</p>
          <p className="mt-1 text-[13px] text-white/55">
            Resume your plan to manage the advancement register.
          </p>
        </div>
      ) : loading ? (
        <div className="rounded-2xl border-2 border-white/10 bg-navy/30 p-8 text-center text-white/50">
          Loading campaigns…
        </div>
      ) : error ? (
        <div className="rounded-2xl border-2 border-red-400/30 bg-red-500/10 p-6 text-center text-red-200">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-white/20 bg-navy/30 p-10 text-center">
          <p className="text-[15px] text-white/80">No campaigns yet.</p>
          <p className="mt-1 text-[13px] text-white/55">
            Add your first campaign to start tracking fundraising progress.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((c) => (
            <div
              key={c.id}
              className="overflow-hidden rounded-2xl border-2 border-gold/20 bg-navy/30 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-white">{c.name}</span>
                    {c.campaignType ? (
                      <span className="rounded-md border border-white/20 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/60">
                        {TYPE_LABEL[c.campaignType] ?? c.campaignType}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge def={STATUS_BADGE[c.status]} />
                    <Badge
                      def={URGENCY_BADGE[c.urgency]}
                      suffix={
                        c.urgency === 'overdue' && typeof c.daysUntilClose === 'number'
                          ? ` · ${Math.abs(c.daysUntilClose)}d ago`
                          : c.urgency === 'closing-soon' && typeof c.daysUntilClose === 'number'
                            ? ` · in ${c.daysUntilClose}d`
                            : ''
                      }
                    />
                    {fmtPct(c.pctOfGoal) ? (
                      <span className="text-[12px] font-semibold text-gold-light">
                        {fmtPct(c.pctOfGoal)} of goal
                      </span>
                    ) : null}
                    <span className="text-[12px] text-white/45">
                      {fmtMoney(c.raisedAmount ?? 0)}
                      {typeof c.goalAmount === 'number' ? ` / ${fmtMoney(c.goalAmount)}` : ''}
                    </span>
                    {c.closeDate ? (
                      <span className="text-[12px] text-white/45">closes {c.closeDate}</span>
                    ) : null}
                  </div>
                  {typeof c.pctOfGoal === 'number' ? (
                    <div className="mt-2">
                      <ProgressBar pct={c.pctOfGoal} reduce={reduce} />
                    </div>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex gap-1.5">
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
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <CampaignFormModal
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

export default function AdvancementPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <AdvancementPanel />
    </div>
  )
}

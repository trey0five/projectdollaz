// ─────────────────────────────────────────────────────────────────────────────
// FacilitiesBudgetCard — the INHERITED Finance budget slice, rendered between the
// KPI row and the register on the Facilities command center. Facilities never
// writes budget lines: the Finance PeriodBudget is the single source of truth and
// this card only shows the mapped expense-line slice (default ['facilities']),
// what's committed (open-item estimates — accepted bids included automatically
// because Accept stamps estimatedCost), what's actually spent this fiscal year,
// and what remains. The burn bar makes the story visual: solid orange = actual,
// hatched orange = committed, red pulse = overflow past the budget.
//
// Empty states CTA to Finance (/data?open=budget opens the existing BudgetImport
// embed; /budget is the read view) — NO facilities-side budget entry exists.
// The gear (owner/accountant only) edits WHICH of the 10 canonical expense lines
// (EXPENSE_LINE_KEYS from @finrep/analytics) count as facilities money.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Wallet, Settings2, ArrowRight, AlertTriangle, Check } from 'lucide-react'
import { EXPENSE_LINE_KEYS, EXPENSE_LINE_LABELS } from '@finrep/analytics'
import EntityFormModal from '../ui/EntityFormModal.jsx'

const FAC_HUE = '#EA580C'

function fmtMoney(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0'
  const abs = Math.round(Math.abs(value)).toLocaleString('en-US')
  return `${value < 0 ? '−$' : '$'}${abs}`
}

// ── The mapping gear modal — an EntityFormModal checkbox list of the 10 lines ─
function BudgetConfigModal({ open, mappedKeys, onClose, onSave, reduce }) {
  const [keys, setKeys] = useState(() => new Set(mappedKeys))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const toggle = (k) =>
    setKeys((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  const submit = async (e) => {
    e.preventDefault()
    const list = EXPENSE_LINE_KEYS.filter((k) => keys.has(k))
    if (list.length === 0) {
      setErr('Pick at least one expense line.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onSave(list)
      onClose()
    } catch {
      setErr('Could not save the budget mapping.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EntityFormModal
      open={open}
      icon={Settings2}
      title="Budget mapping"
      subtitle="Which Finance expense lines count as facilities money"
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel="Save mapping"
      reduce={reduce}
    >
      <div className="sm:col-span-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {EXPENSE_LINE_KEYS.map((k) => {
          const on = keys.has(k)
          return (
            <label
              key={k}
              className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[13.5px] font-semibold transition ${
                on
                  ? 'border-[#EA580C]/60 bg-[#EA580C]/10 text-navy'
                  : 'border-rule/60 bg-cream/40 text-muted hover:border-[#EA580C]/40'
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(k)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition ${
                  on ? 'border-[#EA580C] bg-[#EA580C] text-white' : 'border-rule bg-white'
                }`}
              >
                {on ? <Check size={12} strokeWidth={3} /> : null}
              </span>
              {EXPENSE_LINE_LABELS[k] ?? k}
            </label>
          )
        })}
      </div>
      <p className="sm:col-span-2 text-[12px] leading-snug text-muted">
        Facilities inherits these lines from your Finance budget — it never edits them.
      </p>
    </EntityFormModal>
  )
}

// ── The stacked burn bar: actual (solid) + committed (hatched) vs budget ──────
function BurnBar({ budgetTotal, committed, actual, overBudget, reduce }) {
  const spent = Math.max(committed, 0) + Math.max(actual, 0)
  const scale = Math.max(budgetTotal, spent, 1)
  const pct = (v) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`
  const budgetPct = (Math.max(budgetTotal, 0) / scale) * 100

  return (
    <div>
      <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-section">
        {/* Actual — solid orange, from the left */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-l-full"
          style={{ backgroundColor: FAC_HUE }}
          initial={reduce ? { width: pct(actual) } : { width: 0 }}
          animate={{ width: pct(actual) }}
          transition={{ type: 'spring', stiffness: 120, damping: 22 }}
        />
        {/* Committed — hatched 60%-opacity orange, stacked after actual */}
        <motion.div
          className="absolute inset-y-0"
          style={{
            left: pct(actual),
            opacity: 0.6,
            backgroundImage: `repeating-linear-gradient(135deg, ${FAC_HUE}, ${FAC_HUE} 5px, ${FAC_HUE}88 5px, ${FAC_HUE}88 10px)`,
          }}
          initial={reduce ? { width: pct(committed) } : { width: 0 }}
          animate={{ width: pct(committed) }}
          transition={{ type: 'spring', stiffness: 120, damping: 22, delay: reduce ? 0 : 0.1 }}
        />
        {/* Overflow past the budget — danger red with a subtle pulse */}
        {overBudget && spent > budgetTotal ? (
          <div
            className={`absolute inset-y-0 rounded-r-full bg-danger ${reduce ? '' : 'animate-pulse'}`}
            style={{ left: pct(budgetTotal), width: pct(spent - budgetTotal) }}
          />
        ) : null}
        {/* Budget marker */}
        {budgetPct > 0 && budgetPct < 100 ? (
          <div
            aria-hidden
            className="absolute inset-y-0 w-[2px] bg-navy/70"
            style={{ left: pct(budgetTotal) }}
          />
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] font-semibold text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: FAC_HUE }} />
          Actual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{
              opacity: 0.6,
              backgroundImage: `repeating-linear-gradient(135deg, ${FAC_HUE}, ${FAC_HUE} 2px, ${FAC_HUE}88 2px, ${FAC_HUE}88 4px)`,
            }}
          />
          Committed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-[2px] bg-navy/70" />
          Budget
        </span>
        {overBudget ? (
          <span className="inline-flex items-center gap-1.5 text-danger">
            <span className="h-2.5 w-2.5 rounded-sm bg-danger" />
            Over budget
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Figure({ label, value, tone = 'navy' }) {
  const cls =
    tone === 'danger' ? 'text-danger' : tone === 'orange' ? 'text-[#EA580C]' : 'text-navy'
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className={`mt-0.5 font-serif text-[22px] font-semibold leading-none tabular-nums ${cls}`}>
        {value}
      </p>
    </div>
  )
}

// ── The empty-state CTA card (no budget yet / no category lines yet) ──────────
function EmptyBudgetCard({ reason }) {
  return (
    <div className="card-soft relative overflow-hidden p-5 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: `linear-gradient(120deg, ${FAC_HUE}10, transparent 55%)` }}
      />
      <div className="relative flex flex-wrap items-center gap-4">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-glow"
          style={{ backgroundColor: FAC_HUE }}
        >
          <Wallet size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-[18px] font-semibold text-navy">Facilities budget</h2>
          <p className="mt-0.5 text-[13.5px] text-muted">
            {reason === 'no_lines'
              ? 'Your budget has no category lines yet — import or edit it in Finance'
              : 'Set up your budget in Finance — Facilities inherits it automatically'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/data?open=budget"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white shadow-glow transition hover:brightness-110"
            style={{ backgroundColor: FAC_HUE }}
          >
            Set up in Finance
            <ArrowRight size={14} />
          </Link>
          <Link
            to="/budget"
            className="inline-flex items-center gap-1 rounded-full border border-rule/70 bg-white px-4 py-2 text-[13px] font-semibold text-navy transition hover:border-[#EA580C]/50 hover:text-[#EA580C]"
          >
            View in Finance
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function FacilitiesBudgetCard({ budget, loading, canEdit, onSaveConfig }) {
  const reduce = useReducedMotion()
  const [configOpen, setConfigOpen] = useState(false)

  if (loading && !budget) {
    return (
      <div className="card-soft p-5 sm:p-6">
        <p className="text-[13.5px] text-muted">Loading the facilities budget…</p>
      </div>
    )
  }
  if (!budget) return null

  if (!budget.hasBudget) {
    return (
      <>
        <EmptyBudgetCard reason={budget.reason} />
        {canEdit ? (
          <BudgetConfigModal
            key={configOpen ? 'open' : 'closed'}
            open={configOpen}
            mappedKeys={budget.mappedKeys ?? ['facilities']}
            onClose={() => setConfigOpen(false)}
            onSave={onSaveConfig}
            reduce={reduce}
          />
        ) : null}
      </>
    )
  }

  const {
    period,
    mappedLines = [],
    budgetTotal = 0,
    committed = 0,
    actual = 0,
    remaining = 0,
    overBudget = false,
    resolvedMissingActualCount = 0,
  } = budget

  return (
    <>
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className={`card-soft relative overflow-hidden p-5 sm:p-6 ${
          overBudget ? 'border border-danger/40' : ''
        }`}
      >
        {/* Hue wash — flips to danger when over budget */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: overBudget
              ? 'linear-gradient(120deg, rgba(220,38,38,0.08), transparent 55%)'
              : `linear-gradient(120deg, ${FAC_HUE}10, transparent 55%)`,
          }}
        />
        <div className="relative space-y-4">
          {/* Header row */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-glow"
                style={{ backgroundColor: overBudget ? '#DC2626' : FAC_HUE }}
              >
                {overBudget ? <AlertTriangle size={20} /> : <Wallet size={20} />}
              </span>
              <div>
                <h2 className="font-serif text-[18px] font-semibold text-navy">
                  Facilities budget
                  {overBudget ? (
                    <span className="ml-2 align-middle rounded-md border border-danger/30 bg-danger/10 px-2 py-0.5 text-[11px] font-semibold not-italic text-danger">
                      Over budget
                    </span>
                  ) : null}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span
                    className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      borderColor: `${FAC_HUE}55`,
                      backgroundColor: `${FAC_HUE}14`,
                      color: '#9A3412',
                    }}
                  >
                    Inherited from Finance
                  </span>
                  {period?.label ? (
                    <span className="inline-flex items-center rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[11px] font-semibold text-muted">
                      {period.label}
                    </span>
                  ) : null}
                  {mappedLines.map((l) => (
                    <span
                      key={l.key}
                      className="inline-flex items-center rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[11px] text-muted"
                      title={`${l.label}: ${fmtMoney(l.amount)}`}
                    >
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setConfigOpen(true)}
                  aria-label="Edit budget mapping"
                  title="Which expense lines count as facilities money"
                  className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:text-navy"
                  style={{ '--tw-ring-color': FAC_HUE }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${FAC_HUE}88`)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '')}
                >
                  <Settings2 size={15} />
                </button>
              ) : null}
              <Link
                to="/budget"
                className="inline-flex items-center gap-1 text-[13px] font-semibold transition hover:brightness-110"
                style={{ color: FAC_HUE }}
              >
                View in Finance
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          {/* Figures */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure label="Budget" value={fmtMoney(budgetTotal)} />
            <Figure label="Committed" value={fmtMoney(committed)} tone="orange" />
            <Figure label="Actual (this FY)" value={fmtMoney(actual)} tone="orange" />
            <Figure
              label="Remaining"
              value={fmtMoney(remaining)}
              tone={overBudget ? 'danger' : 'navy'}
            />
          </div>

          {/* Burn bar */}
          <BurnBar
            budgetTotal={budgetTotal}
            committed={committed}
            actual={actual}
            overBudget={overBudget}
            reduce={reduce}
          />

          {resolvedMissingActualCount > 0 ? (
            <p className="text-[12px] italic text-muted">
              {resolvedMissingActualCount} resolved item
              {resolvedMissingActualCount === 1 ? ' has' : 's have'} no actual cost — add actuals so
              this year&apos;s spend is complete.
            </p>
          ) : null}
        </div>
      </motion.div>

      {canEdit ? (
        <BudgetConfigModal
          key={configOpen ? 'open' : 'closed'}
          open={configOpen}
          mappedKeys={budget.mappedKeys ?? ['facilities']}
          onClose={() => setConfigOpen(false)}
          onSave={onSaveConfig}
          reduce={reduce}
        />
      ) : null}
    </>
  )
}

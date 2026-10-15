// ─────────────────────────────────────────────────────────────────────────────
// FacilitiesBudgetCard — the INHERITED Finance budget slice, rendered between the
// KPI row and the register on the Facilities command center. Facilities never
// writes budget lines: the Finance PeriodBudget is the single source of truth and
// this card only shows the mapped expense-line slice (default ['facilities']),
// what's committed (open-item estimates — accepted bids included automatically
// because Accept stamps estimatedCost), what's actually spent this fiscal year,
// and what remains. Premium UI P4: a Section on the ground (no orange wash, no
// card) — a StatStrip of the four figures and a thin burn rule: solid ink =
// actual, hatched ink = committed, risk red = overflow past the budget, an ink
// tick at the budget line. Colour is semantic only.
//
// Empty states CTA to Finance's REAL budget setup — NO facilities-side budget
// entry exists. The href is flag-aware via addDataHref(): under ui.v2 that is the
// direct deep link /finance?tab=add&add=budget, because the old '/data?open=budget'
// went through a redirect that DROPS the query string and dumped the user on the
// trial-balance chooser — copy said budget, destination said something else.
// The gear (owner/accountant only) edits WHICH of the 10 canonical expense lines
// (EXPENSE_LINE_KEYS from @finrep/analytics) count as facilities money.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Settings2, ArrowRight, Check } from 'lucide-react'
import { EXPENSE_LINE_KEYS, EXPENSE_LINE_LABELS } from '@finrep/analytics'
import EntityFormModal from '../ui/EntityFormModal.jsx'
import { useUiV2 } from '../../context/UiFlagContext.jsx'
import { addDataHref } from '../../lib/dataDestinations.js'
import { Section, StatStrip, Stat, Pill, Button } from '../ui/surface/index.js'
import '../../styles/pending/b1-domain.css'

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
              className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 text-[13.5px] font-semibold transition ${
                on ? 'border-ink/40 text-ink' : 'border-hair text-ink2 hover:border-ink/25'
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
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border transition ${
                  on ? 'border-ink bg-ink text-white' : 'border-ink/30 bg-white'
                }`}
              >
                {on ? <Check size={12} strokeWidth={3} /> : null}
              </span>
              {EXPENSE_LINE_LABELS[k] ?? k}
            </label>
          )
        })}
      </div>
      <p className="sm:col-span-2 text-[12px] leading-snug text-ink2">
        Facilities inherits these lines from your Finance budget — it never edits them.
      </p>
    </EntityFormModal>
  )
}

// ── The burn rule: actual (solid ink) + committed (hatched ink) vs budget ────
const INK = 'rgb(var(--c-ink))'
const HATCH = `repeating-linear-gradient(135deg, ${INK} 0 3px, rgb(var(--c-ink) / 0.35) 3px 6px)`

function BurnBar({ budgetTotal, committed, actual, overBudget, reduce }) {
  const spent = Math.max(committed, 0) + Math.max(actual, 0)
  const scale = Math.max(budgetTotal, spent, 1)
  const pct = (v) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`
  const budgetPct = (Math.max(budgetTotal, 0) / scale) * 100
  const grow = (delay = 0) =>
    reduce ? {} : { initial: { scaleX: 0 }, animate: { scaleX: 1 }, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay } }

  return (
    <div>
      <div
        className="relative h-1.5 w-full bg-hair/[.12]"
        role="img"
        aria-label={`Actual ${fmtMoney(actual)}, committed ${fmtMoney(committed)} of a ${fmtMoney(budgetTotal)} budget`}
      >
        <motion.div className="absolute inset-y-0 left-0 origin-left" style={{ width: pct(actual), background: INK }} {...grow()} />
        <motion.div
          className="absolute inset-y-0 origin-left"
          style={{ left: pct(actual), width: pct(committed), backgroundImage: HATCH }}
          {...grow(0.1)}
        />
        {overBudget && spent > budgetTotal ? (
          <div className="absolute inset-y-0 bg-risk" style={{ left: pct(budgetTotal), width: pct(spent - budgetTotal) }} />
        ) : null}
        {budgetPct > 0 && budgetPct < 100 ? (
          <div aria-hidden className="absolute -inset-y-1 w-px bg-ink" style={{ left: pct(budgetTotal) }} />
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] font-semibold text-ink2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3" style={{ background: INK }} />
          Actual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3" style={{ backgroundImage: HATCH }} />
          Committed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-px bg-ink" />
          Budget
        </span>
        {overBudget ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 bg-risk" />
            Over budget
          </span>
        ) : null}
      </div>
    </div>
  )
}

// ── The empty state (no budget yet / no category lines yet): a ruled row ─────
function EmptyBudget({ reason }) {
  const uiV2 = useUiV2()
  return (
    <Section label="Facilities budget" aside={<span>Inherited from Finance</span>}>
      <div className="b1-empty">
        <p className="b1-empty-title">No budget to inherit yet</p>
        <p>
          {reason === 'no_lines'
            ? 'Your budget has no category lines yet. Import or edit it in Finance.'
            : 'Set up your budget in Finance and Facilities inherits it automatically.'}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" size="sm" to={addDataHref(uiV2, { add: 'budget' })} icon={<ArrowRight size={14} />}>
            Set up the budget
          </Button>
          <Button size="sm" to="/budget">
            View in Finance
          </Button>
        </div>
      </div>
    </Section>
  )
}

export default function FacilitiesBudgetCard({ budget, loading, canEdit, onSaveConfig }) {
  const reduce = useReducedMotion()
  const [configOpen, setConfigOpen] = useState(false)

  if (loading && !budget) {
    return (
      <Section label="Facilities budget">
        <p className="text-[13px] text-ink2">Loading the facilities budget…</p>
      </Section>
    )
  }
  if (!budget) return null

  const configModal = canEdit ? (
    <BudgetConfigModal
      key={configOpen ? 'open' : 'closed'}
      open={configOpen}
      mappedKeys={budget.mappedKeys ?? ['facilities']}
      onClose={() => setConfigOpen(false)}
      onSave={onSaveConfig}
      reduce={reduce}
    />
  ) : null

  if (!budget.hasBudget) {
    return (
      <>
        <EmptyBudget reason={budget.reason} />
        {configModal}
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

  const money = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fmtMoney(v))

  return (
    <>
      <Section
        label="Facilities budget"
        aside={
          <>
            {overBudget ? (
              <Pill variant="status" tone="risk">
                Over budget
              </Pill>
            ) : null}
            <span>Inherited from Finance{period?.label ? ` · ${period.label}` : ''}</span>
            {canEdit ? (
              <button
                type="button"
                onClick={() => setConfigOpen(true)}
                aria-label="Edit budget mapping"
                title="Which expense lines count as facilities money"
                className="b1-icon-act"
              >
                <Settings2 size={15} />
              </button>
            ) : null}
            <Link to="/budget" className="sec-more !mt-0">
              View in Finance
              <ArrowRight size={14} />
            </Link>
          </>
        }
      >
        <StatStrip cols={4} className="stats-compact">
          <Stat label="Budget" value={money(budgetTotal)} format="currency" />
          <Stat label="Committed" value={money(committed)} format="currency" />
          <Stat label="Actual (this FY)" value={money(actual)} format="currency" />
          <Stat label="Remaining" value={money(remaining)} format="currency" status={overBudget ? 'risk' : 'good'} />
        </StatStrip>

        <div className="mt-4">
          <BurnBar
            budgetTotal={budgetTotal}
            committed={committed}
            actual={actual}
            overBudget={overBudget}
            reduce={reduce}
          />
        </div>

        {mappedLines.length ? (
          <p className="sec-note">
            Counts {mappedLines.map((l) => `${l.label} (${fmtMoney(l.amount)})`).join(' · ')}
          </p>
        ) : null}
        {resolvedMissingActualCount > 0 ? (
          <p className="sec-note">
            {resolvedMissingActualCount} resolved item
            {resolvedMissingActualCount === 1 ? ' has' : 's have'} no actual cost. Add actuals so
            this year&apos;s spend is complete.
          </p>
        ) : null}
      </Section>
      {configModal}
    </>
  )
}

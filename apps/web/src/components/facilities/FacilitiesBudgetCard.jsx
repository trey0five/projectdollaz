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
//
// AURORA (2026-10-15): an AuroraSection "Budget" strip over ONE white AuroraCard
// — a one-line answer ("$12,000 left" / "$4,000 over budget") and vertical
// columns (budget dashed, spent, committed, left) — or a designed AuroraEmpty
// (one line + one button) when there is nothing to inherit yet.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Settings2, ArrowRight, Check, Wallet } from 'lucide-react'
import { EXPENSE_LINE_KEYS, EXPENSE_LINE_LABELS } from '@finrep/analytics'
import EntityFormModal from '../ui/EntityFormModal.jsx'
import { useUiV2 } from '../../context/UiFlagContext.jsx'
import { addDataHref } from '../../lib/dataDestinations.js'
import {
  AuroraSection,
  AuroraCard,
  AuroraColumns,
  AuroraEmpty,
  AuroraLightButton,
  fyLabel,
} from '../ui/aurora/index.js'

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

// The section strip every state shares: medallion, title, one short line.
function BudgetSection({ count = null, aside = null, children }) {
  return (
    <AuroraSection icon={Wallet} title="Budget" subtitle="Your Finance budget for upkeep" count={count} aside={aside}>
      {children}
    </AuroraSection>
  )
}

// ── The empty state (no budget yet / no category lines yet): one line + one button
function EmptyBudget({ reason }) {
  const uiV2 = useUiV2()
  return (
    <BudgetSection>
      <AuroraEmpty
        icon={Wallet}
        text={reason === 'no_lines' ? 'Your budget has no category lines yet.' : 'No budget to show yet.'}
        sub="Facilities reads it from Finance."
        action={
          <AuroraLightButton
            variant="ghost"
            to={addDataHref(uiV2, { add: 'budget' })}
            icon={<ArrowRight size={15} aria-hidden="true" />}
          >
            Set up the budget
          </AuroraLightButton>
        }
      />
    </BudgetSection>
  )
}

export default function FacilitiesBudgetCard({ budget, loading, canEdit, onSaveConfig }) {
  const reduce = useReducedMotion()
  const [configOpen, setConfigOpen] = useState(false)

  if (loading && !budget) {
    return (
      <BudgetSection>
        <AuroraEmpty icon={Wallet} text="Loading the facilities budget…" aria-busy="true" />
      </BudgetSection>
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

  const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const bars = [
    { key: 'budget', label: 'Budget', value: fin(budgetTotal), display: fmtMoney(budgetTotal), dashed: true },
    { key: 'actual', label: 'Spent', value: fin(actual), display: fmtMoney(actual), color: 'var(--au-h)' },
    { key: 'committed', label: 'Committed', value: fin(committed), display: fmtMoney(committed), color: 'var(--au-h2)' },
    {
      key: 'remaining',
      label: overBudget ? 'Over' : 'Left',
      value: fin(remaining),
      display: fmtMoney(remaining),
      color: overBudget ? 'var(--au-risk-h)' : 'var(--au-good-h)',
    },
  ]

  return (
    <>
      <BudgetSection
        count={period?.label ? fyLabel(period.label) : null}
        aside={
          canEdit ? (
            <AuroraLightButton
              size="sm"
              variant="ghost"
              onClick={() => setConfigOpen(true)}
              aria-label="Edit budget mapping"
              title="Which expense lines count as facilities money"
              icon={<Settings2 size={15} aria-hidden="true" />}
            >
              Lines
            </AuroraLightButton>
          ) : null
        }
      >
        <AuroraCard
          title="Budget vs. spending"
          subtitle="Spent and committed against what Finance set aside"
          verdict={overBudget ? 'risk' : 'good'}
          verdictLabel={overBudget ? 'Over budget' : 'Within budget'}
          big={overBudget ? `${fmtMoney(Math.abs(remaining))} over budget` : `${fmtMoney(remaining)} left`}
          bigTone={overBudget ? 'risk' : 'good'}
          footer={
            <AuroraLightButton to="/budget" icon={<ArrowRight size={15} aria-hidden="true" />}>
              View in Finance
            </AuroraLightButton>
          }
        >
          <AuroraColumns
            ariaLabel={`Facilities budget ${fmtMoney(budgetTotal)}: spent ${fmtMoney(actual)}, committed ${fmtMoney(committed)}, ${overBudget ? 'over by' : 'left'} ${fmtMoney(Math.abs(remaining))}`}
            bars={bars}
          />
          {mappedLines.length || resolvedMissingActualCount > 0 ? (
            <div className="mt-3 space-y-1">
              {mappedLines.length ? (
                <p className="text-[12.5px] text-ink2">
                  Counts {mappedLines.map((l) => `${l.label} (${fmtMoney(l.amount)})`).join(' · ')}
                </p>
              ) : null}
              {resolvedMissingActualCount > 0 ? (
                <p className="text-[12.5px] text-ink2">
                  {resolvedMissingActualCount} finished repair
                  {resolvedMissingActualCount === 1 ? ' has' : 's have'} no actual cost yet.
                </p>
              ) : null}
            </div>
          ) : null}
        </AuroraCard>
      </BudgetSection>
      {configModal}
    </>
  )
}

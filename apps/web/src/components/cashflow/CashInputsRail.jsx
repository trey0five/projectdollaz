// ─────────────────────────────────────────────────────────────────────────────
// CashInputsRail — every line that feeds the forecast, in two honest groups:
//
//   GROUP A · "From QuickBooks" — the DERIVED lines (open invoices, bills,
//   history, budget phasing, the tuition driver). Read-only except for ONE
//   control: the include switch, which writes a line ADJUSTMENT server-side —
//   the source data is never touched, and an excluded line stays visible at
//   zero so it can be un-excluded. The switch flips optimistically and reverts
//   on error; the projection itself is refetched, never recomputed here.
//
//   GROUP B · "Your expected items" — the school's own commitments, edited
//   directly (pencil / trash / row click).
//
// Volume discipline: Group A shows the top 8 lines by size with an "and N more"
// expander — a 200-invoice school gets a readable rail, not a ledger dump.
//
// DEGRADED MODE: `flows === null` with a projection present means the API image
// predates line-level detail. Group A renders a note, never crashes — and Group
// B keeps working, because commitments never depended on flows.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Section, Pill } from '../ui/surface/index.js'
import '../../styles/pending/b2-finance.css'
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react'

const ORIGIN_ORDER = ['qbo_ar', 'qbo_ap', 'qbo_history', 'budget', 'tuition_driver']

const RECURRENCE_LABELS = {
  once: 'Once',
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annually',
}

// The three teaching examples. Label/direction/category ONLY — a template never
// pre-fills an amount or a date the school did not state.
const EXAMPLES = [
  { chip: 'A gala', seed: { label: 'Spring gala', direction: 'in', category: 'fundraising' } },
  {
    chip: 'A roof repair',
    seed: { label: 'Roof repair', direction: 'out', category: 'capital_project' },
  },
  { chip: 'A grant', seed: { label: 'Grant award', direction: 'in', category: 'grants' } },
]

const prettyCategory = (c) => (c ? String(c).replaceAll('_', ' ') : '')
const shortDate = (iso) => (iso ? iso.slice(0, 10) : '')

function IncludeSwitch({ checked, onToggle, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-[20px] w-[36px] shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/50 focus-visible:ring-offset-1 disabled:opacity-40 ${
        checked ? 'bg-[#2563EB]' : 'bg-ink/20'
      }`}
    >
      <span
        className={`absolute top-[2px] h-4 w-4 rounded-full bg-white transition-all duration-200 ${
          checked ? 'left-[18px]' : 'left-[2px]'
        }`}
      />
    </button>
  )
}

function TeachingCard({ icon: Icon, children }) {
  return (
    <div className="flex items-start gap-3 border-y border-hair py-4">
      {Icon ? <Icon size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-ink2" /> : null}
      <div className="min-w-0 text-small leading-relaxed text-ink2">{children}</div>
    </div>
  )
}

export default function CashInputsRail({
  flows, // FlowRow[] | null (null = the API doesn't send flows yet)
  hasProjection,
  commitments = [],
  sourceLabels = {},
  format,
  onToggleFlow, // async (flow, include) — throws to revert the switch
  onAddItem, // (seed?) => open the modal
  onEditItem, // (commitment) => open the modal in edit mode
  onRemoveItem, // async (id)
  busy = false,
}) {
  const reduce = useReducedMotion()
  const fmt = typeof format === 'function' ? format : (n) => `$${Math.round(n).toLocaleString()}`
  const [expanded, setExpanded] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [removeError, setRemoveError] = useState('')

  // The optimistic layer for the include switches: sourceRef → desired state.
  // Cleared whenever a fresh flows array arrives (the server is the truth);
  // an entry is dropped early only when its PUT/DELETE fails (revert).
  // Render-phase derived reset (React's sanctioned pattern) — no effect cascade.
  const [pendingToggles, setPendingToggles] = useState({})
  const [seenFlows, setSeenFlows] = useState(flows)
  if (flows !== seenFlows) {
    setSeenFlows(flows)
    setPendingToggles({})
  }

  const adjustable = useMemo(
    () =>
      (flows ?? [])
        .filter((f) => f.editable === 'adjustable')
        .sort((a, b) => Math.abs(b.derivedTotal) - Math.abs(a.derivedTotal)),
    [flows],
  )
  const visible = expanded ? adjustable : adjustable.slice(0, 8)
  const hiddenCount = adjustable.length - visible.length

  // Group the visible slice by origin, in a stable narrative order.
  const groups = useMemo(() => {
    const by = new Map()
    for (const f of visible) {
      if (!by.has(f.origin)) by.set(f.origin, [])
      by.get(f.origin).push(f)
    }
    return ORIGIN_ORDER.filter((o) => by.has(o))
      .concat([...by.keys()].filter((o) => !ORIGIN_ORDER.includes(o)))
      .map((o) => ({ origin: o, rows: by.get(o) }))
  }, [visible])

  const isIncluded = (f) =>
    pendingToggles[f.sourceRef] ?? !(f.adjustment && f.adjustment.kind === 'exclude')

  const toggle = async (f) => {
    const next = !isIncluded(f)
    setPendingToggles((p) => ({ ...p, [f.sourceRef]: next }))
    try {
      await onToggleFlow(f, next)
    } catch {
      // Revert — the server did not accept the change.
      setPendingToggles((p) => {
        const q = { ...p }
        delete q[f.sourceRef]
        return q
      })
    }
  }

  const remove = async (id) => {
    setRemoving(id)
    setRemoveError('')
    try {
      await onRemoveItem(id)
    } catch {
      // The server refused the delete — the row is still there; say so.
      setRemoveError('Could not remove this item. Please try again.')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div>
      {/* ── GROUP A · From QuickBooks ─────────────────────────────────────── */}
      {/* id: Penny walkthrough anchor 'cashFlow.linesTable' — the derived lines
          she can propose excluding or re-totalling. */}
      <Section
        id="cf-lines"
        label={
          <span className="inline-flex items-center gap-1.5">
            <Zap size={12} aria-hidden="true" /> From QuickBooks
          </span>
        }
        aside={
          adjustable.length > 0 ? (
            <span>
              {adjustable.length} line{adjustable.length === 1 ? '' : 's'} · switch off anything
              that shouldn&apos;t count
            </span>
          ) : null
        }
        className="!mt-0"
      >

        {!hasProjection ? (
          <TeachingCard icon={Zap}>
            Build the forecast first — every line that feeds it appears here, each with a switch.
          </TeachingCard>
        ) : flows == null ? (
          // The projection came from an API image that predates line-level
          // detail. Say so plainly; never crash, never invent rows.
          <TeachingCard icon={Zap}>
            Line-level detail isn&apos;t available for this forecast yet. Rebuild the forecast
            after the next platform update to see — and switch off — the individual QuickBooks
            lines inside it.
          </TeachingCard>
        ) : adjustable.length === 0 ? (
          <TeachingCard icon={Zap}>
            <p>
              Connect QuickBooks and your open invoices and bills type themselves into this
              forecast — no keying.
            </p>
            <Link to="/finance?tab=add&add=tb" className="btn btn-primary btn-sm mt-2">
              <Zap size={12} aria-hidden="true" /> Connect QuickBooks
            </Link>
          </TeachingCard>
        ) : (
          <div className="space-y-4">
            {groups.map(({ origin, rows }) => (
              <div key={origin}>
                <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
                  {sourceLabels[origin] ?? origin}
                </h3>
                <div className="border-t border-hair">
                  {rows.map((f) => {
                    const included = isIncluded(f)
                    return (
                      <div
                        key={f.sourceRef}
                        className={`flex min-h-[44px] items-center gap-3 border-b border-hair py-2 transition-opacity hover:bg-ink/[0.03] ${
                          included ? '' : 'opacity-60'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-ink">
                            {f.label}
                          </p>
                          <p className="text-[11.5px] text-ink2">
                            {f.eventCount > 1
                              ? `${f.eventCount} events · ${shortDate(f.firstDate)} – ${shortDate(f.lastDate)}`
                              : shortDate(f.firstDate)}
                          </p>
                        </div>
                        <Pill className="hidden capitalize sm:inline-flex">{prettyCategory(f.category)}</Pill>
                        <span
                          className={`w-28 shrink-0 text-right text-[13px] font-semibold tabular-nums ${
                            included ? 'text-ink' : 'text-ink2 line-through'
                          }`}
                        >
                          {f.direction === 'in' ? '+' : '−'}
                          {fmt(Math.abs(f.derivedTotal))}
                        </span>
                        <IncludeSwitch
                          checked={included}
                          disabled={busy}
                          onToggle={() => toggle(f)}
                          label={`Include ${f.label} in the forecast`}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {hiddenCount > 0 || expanded ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="dt-link"
                aria-expanded={expanded}
              >
                <ChevronDown
                  size={14}
                  className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
                {expanded ? 'Show fewer' : `and ${hiddenCount} more`}
              </button>
            ) : null}
          </div>
        )}
      </Section>

      {/* ── GROUP B · Your expected items ─────────────────────────────────── */}
      <Section
        label="Your expected items"
        aside={
          <button
            // Penny walkthrough anchor 'cashFlow.addCommitment'. THE CANONICAL
            // one of the three "Add expected item" buttons — the other two (the
            // hero pill and the overview summary card) open the same flow and
            // deliberately carry no id, because two elements answering to one
            // anchor key is a coin that glides somewhere different each time.
            id="cf-add-item"
            type="button"
            onClick={() => onAddItem()}
            className="btn btn-secondary btn-sm"
          >
            <Plus size={13} aria-hidden="true" /> Add expected item
          </button>
        }
      >
        {removeError ? (
          <p className="b2-callout b2-risk mb-2" role="alert">
            {removeError}
          </p>
        ) : null}

        {commitments.length === 0 ? (
          <TeachingCard>
            <p>
              Add what you know is coming — a gala, a roof repair, a grant. The forecast rebuilds
              the moment you save one.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.chip}
                  type="button"
                  onClick={() => onAddItem(ex.seed)}
                  className="b2-chip !min-h-[28px] !py-1 !text-[12.5px]"
                >
                  {ex.chip}
                </button>
              ))}
            </div>
          </TeachingCard>
        ) : (
          <div className="border-t border-hair">
            <AnimatePresence initial={false}>
              {commitments.map((c) => (
                <motion.div
                  key={c.id}
                  id={`cf-item-${c.id}`}
                  layout={reduce ? false : true}
                  initial={false}
                  exit={
                    reduce
                      ? { opacity: 0 }
                      : { opacity: 0, height: 0, marginTop: 0, overflow: 'hidden' }
                  }
                  transition={{ duration: 0.28, ease: [0.22, 0.8, 0.2, 1] }}
                  className="flex min-h-[44px] cursor-pointer items-center gap-3 border-b border-hair py-2 transition-colors hover:bg-ink/[0.03]"
                  onClick={() => onEditItem(c)}
                >
                  {c.direction === 'in' ? (
                    <ArrowUpRight size={15} aria-label="cash in" className="shrink-0 text-ink2" />
                  ) : (
                    <ArrowDownRight size={15} aria-label="cash out" className="shrink-0 text-ink2" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink">{c.label}</p>
                    <p className="text-[11.5px] text-ink2">
                      {shortDate(c.startDate)}
                      {c.recurrence !== 'once' && c.endDate ? ` – ${shortDate(c.endDate)}` : ''}
                    </p>
                  </div>
                  <Pill className="hidden sm:inline-flex">{RECURRENCE_LABELS[c.recurrence] ?? c.recurrence}</Pill>
                  <Pill className="hidden capitalize md:inline-flex">{c.confidence}</Pill>
                  <span className="w-24 shrink-0 text-right text-[13px] font-semibold tabular-nums text-ink">
                    {c.direction === 'in' ? '+' : '−'}
                    {fmt(Math.abs(c.amount))}
                  </span>
                  <button
                    type="button"
                    aria-label={`Edit ${c.label}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditItem(c)
                    }}
                    className="rounded-[4px] p-1.5 text-ink2 transition hover:bg-ink/[0.05] hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2563EB]/50"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${c.label}`}
                    disabled={removing === c.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(c.id)
                    }}
                    className="rounded-[4px] p-1.5 text-ink2 transition hover:bg-ink/[0.05] hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2563EB]/50 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </Section>
    </div>
  )
}

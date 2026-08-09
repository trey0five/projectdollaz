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
      className={`relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:opacity-40 ${
        checked ? 'bg-gold' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${
          checked ? 'left-[20px]' : 'left-[3px]'
        }`}
      />
    </button>
  )
}

function TeachingCard({ icon: Icon, children }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-rule/70 bg-cream/40 p-4">
      {Icon ? <Icon size={16} className="mt-0.5 shrink-0 text-gold" /> : null}
      <div className="min-w-0 text-[13.5px] leading-relaxed text-muted">{children}</div>
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
    <div className="space-y-5">
      {/* ── GROUP A · From QuickBooks ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-rule/60 bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
            <Zap size={14} className="text-gold" /> From QuickBooks
          </h2>
          {adjustable.length > 0 ? (
            <span className="text-[12px] text-muted">
              {adjustable.length} line{adjustable.length === 1 ? '' : 's'} · switch off anything
              that shouldn&apos;t count
            </span>
          ) : null}
        </div>

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
            <Link
              to="/finance?tab=add&add=tb"
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg btn-cta px-3.5 py-1.5 text-[12.5px] font-semibold"
            >
              <Zap size={12} /> Connect QuickBooks
            </Link>
          </TeachingCard>
        ) : (
          <div className="space-y-4">
            {groups.map(({ origin, rows }) => (
              <div key={origin}>
                <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted/80">
                  {sourceLabels[origin] ?? origin}
                </h3>
                <div className="space-y-1.5">
                  {rows.map((f) => {
                    const included = isIncluded(f)
                    return (
                      <div
                        key={f.sourceRef}
                        className={`flex items-center gap-3 rounded-xl border border-rule/60 px-3.5 py-2.5 transition-opacity ${
                          included ? 'bg-white' : 'bg-section/60 opacity-70'
                        }`}
                      >
                        <Zap size={14} className="shrink-0 text-gold/80" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold text-navy">
                            {f.label}
                          </p>
                          <p className="text-[11.5px] text-muted">
                            {f.eventCount > 1
                              ? `${f.eventCount} events · ${shortDate(f.firstDate)} – ${shortDate(f.lastDate)}`
                              : shortDate(f.firstDate)}
                          </p>
                        </div>
                        <span className="hidden rounded-full border border-rule/70 bg-section px-2 py-0.5 text-[11px] font-semibold capitalize text-muted sm:inline-block">
                          {prettyCategory(f.category)}
                        </span>
                        <span
                          className={`w-28 shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums ${
                            included
                              ? f.direction === 'in'
                                ? 'text-emerald-700'
                                : 'text-navy'
                              : 'text-muted line-through'
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-rule/70 px-3 py-1.5 text-[12.5px] font-semibold text-muted transition hover:border-gold/60 hover:text-navy"
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
      </section>

      {/* ── GROUP B · Your expected items ─────────────────────────────────── */}
      <section className="rounded-2xl border border-rule/60 bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
            Your expected items
          </h2>
          <button
            type="button"
            onClick={() => onAddItem()}
            className="inline-flex items-center gap-1.5 rounded-lg btn-cta px-3.5 py-1.5 text-[12.5px] font-semibold"
          >
            <Plus size={13} /> Add expected item
          </button>
        </div>

        {removeError ? <p className="mb-2 text-[12.5px] text-danger">{removeError}</p> : null}

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
                  className="rounded-full border border-gold/40 bg-gold-pale/50 px-3 py-1 text-[12.5px] font-semibold text-navy transition hover:border-gold hover:bg-gold-pale"
                >
                  {ex.chip}
                </button>
              ))}
            </div>
          </TeachingCard>
        ) : (
          <div className="space-y-1.5">
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
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-rule/60 bg-white px-3.5 py-2.5 transition-colors hover:border-gold/50"
                  onClick={() => onEditItem(c)}
                >
                  {c.direction === 'in' ? (
                    <ArrowUpRight size={15} className="shrink-0 text-emerald-600" />
                  ) : (
                    <ArrowDownRight size={15} className="shrink-0 text-rose-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-navy">{c.label}</p>
                    <p className="text-[11.5px] text-muted">
                      {shortDate(c.startDate)}
                      {c.recurrence !== 'once' && c.endDate ? ` – ${shortDate(c.endDate)}` : ''}
                    </p>
                  </div>
                  <span className="hidden rounded-full border border-rule/70 bg-section px-2 py-0.5 text-[11px] font-semibold text-muted sm:inline-block">
                    {RECURRENCE_LABELS[c.recurrence] ?? c.recurrence}
                  </span>
                  <span className="hidden rounded-full border border-rule/70 bg-section px-2 py-0.5 text-[11px] font-semibold capitalize text-muted md:inline-block">
                    {c.confidence}
                  </span>
                  <span
                    className={`w-24 shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums ${
                      c.direction === 'in' ? 'text-emerald-700' : 'text-navy'
                    }`}
                  >
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
                    className="rounded-md p-1.5 text-muted transition hover:bg-section hover:text-navy"
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
                    className="rounded-md p-1.5 text-muted transition hover:bg-red-50 hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>
    </div>
  )
}

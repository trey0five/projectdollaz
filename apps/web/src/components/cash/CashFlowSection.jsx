// ─────────────────────────────────────────────────────────────────────────────
// CashFlowSection — the /cash "Live cash flow" block, above the aging bars. It
// renders QuickBooks' native cash-flow breakdown as a compact diverging waterfall:
// Operating / Investing / Financing each grow left (outflow, coral) or right
// (inflow, blue) from a center zero axis, summing to an emphasized "Net change in
// cash" row. A "months of cash" runway chip headlines the section when we can
// compute it (openingCash ÷ burn), and a subtle "(derived)" footnote appears when
// the breakdown was synthesized from our own statements (source==='computed-scf')
// rather than pulled from QuickBooks' native CashFlow report.
//
// A Section on the ground (diverging blue / coral, ink text). framer-motion
// grow-in from the zero axis; STATIC under reduced motion. Decorative, so the
// whole section is .no-print. Mobile-safe (bars live inside the card, no h-scroll).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Waves, TrendingUp } from 'lucide-react'
import { Section, Pill } from '../ui/surface/index.js'

// Diverging pair around the zero axis (dataviz: two hues + a neutral midpoint):
// primary blue for cash in, a warm coral for cash out. Text stays ink.
const NAVY = '#2563EB' // inflow / positive
const GOLD = '#D9774B' // outflow / negative (name kept for the call sites)

function fmtMoney(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
  const neg = v < 0
  return `${neg ? '−' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`
}

function FlowBar({ label, value, maxAbs, emphasized, reduce }) {
  const v = Number(value ?? 0)
  const neg = v < 0
  // Width as a share of the HALF-track (each side of the center axis is 50%).
  const pct = maxAbs > 0 ? Math.min(50, (Math.abs(v) / maxAbs) * 50) : 0
  const color = neg ? GOLD : NAVY

  return (
    <div className="grid grid-cols-[84px_1fr_auto] items-center gap-2.5 sm:grid-cols-[110px_1fr_auto] sm:gap-3">
      <span
        className={`truncate text-[12.5px] ${
          emphasized ? 'text-[13px] font-semibold text-ink' : 'font-medium text-ink2'
        }`}
      >
        {label}
      </span>
      <div className="relative h-6">
        {/* Center zero axis */}
        <div aria-hidden className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hair/30" />
        {pct > 0 ? (
          <motion.div
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            style={{
              background: color,
              width: `${pct}%`,
              transformOrigin: neg ? 'right' : 'left',
              ...(neg ? { right: '50%' } : { left: '50%' }),
            }}
            className={`absolute top-1/2 ${emphasized ? 'h-[14px]' : 'h-[12px]'} -translate-y-1/2 ${
              neg ? 'rounded-l-[4px]' : 'rounded-r-[4px]'
            }`}
          />
        ) : null}
      </div>
      <span
        className={`text-right tabular-nums ${
          emphasized ? 'text-[15px] font-semibold text-ink' : 'text-[13px] font-semibold text-ink'
        }`}
      >
        {fmtMoney(v)}
      </span>
    </div>
  )
}

function RunwayChip({ runway }) {
  const months = runway?.months
  if (typeof months !== 'number' || !Number.isFinite(months)) return null
  const rounded = Math.max(0, Math.round(months))
  const burn = runway?.monthlyBurn
  return (
    <span className="inline-flex items-center gap-2 text-small text-ink">
      <TrendingUp size={14} aria-hidden="true" className="text-ink2" />
      <span className="font-semibold tabular-nums">
        {rounded} month{rounded === 1 ? '' : 's'} of cash
        <span className="ml-1 font-normal text-ink2">at current burn</span>
      </span>
      {typeof burn === 'number' && Number.isFinite(burn) && burn !== 0 ? (
        <span className="hidden border-l border-hair pl-2 text-[12px] tabular-nums text-ink2 sm:inline">
          {fmtMoney(burn)}/mo
        </span>
      ) : null}
    </span>
  )
}

export default function CashFlowSection({ cashflow, runway, source }) {
  const reduce = useReducedMotion()
  const cf = cashflow ?? {}
  const rows = [
    { key: 'operating', label: 'Operating', value: cf.operating },
    { key: 'investing', label: 'Investing', value: cf.investing },
    { key: 'financing', label: 'Financing', value: cf.financing },
  ]
  const net = Number(cf.netChange ?? 0)
  const maxAbs = Math.max(
    1,
    ...rows.map((r) => Math.abs(Number(r.value ?? 0))),
    Math.abs(net),
  )
  const derived = source === 'computed-scf'
  const anyMovement = rows.some((r) => Number(r.value ?? 0) !== 0) || net !== 0

  return (
    <Section
      label={
        <span className="inline-flex items-center gap-2">
          <Waves size={13} aria-hidden="true" />
          Cash flow
          {derived ? <Pill className="normal-case tracking-normal">derived</Pill> : null}
        </span>
      }
      aside={<RunwayChip runway={runway} />}
      className="no-print !mt-0"
    >

      {anyMovement ? (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <FlowBar
              key={r.key}
              label={r.label}
              value={r.value}
              maxAbs={maxAbs}
              reduce={reduce}
            />
          ))}
          <div className="mt-1 border-t border-hair pt-2.5">
            <FlowBar label="Net change" value={net} maxAbs={maxAbs} emphasized reduce={reduce} />
          </div>
        </div>
      ) : (
        <p className="py-2 text-[12.5px] italic text-ink2">No cash-flow movement in this period.</p>
      )}

      {/* The Cash in/out key only means something when there are bars to read. */}
      {(anyMovement || derived) && (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11.5px] text-ink2">
        {anyMovement ? (
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: NAVY }} />
            Cash in
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GOLD }} />
            Cash out
          </span>
        </span>
        ) : null}
        {derived ? (
          <span className="italic">Derived from your statements — QuickBooks’ native report wasn’t available.</span>
        ) : null}
      </div>
      )}
    </Section>
  )
}

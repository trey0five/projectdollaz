// ─────────────────────────────────────────────────────────────────────────────
// AgingBars — the two aging-bucket bar groups (Receivables + Payables) for the
// Cash & Collections page. Each group is a single horizontal stacked bar split
// into the five canonical aging buckets (Current · 1–30 · 31–60 · 61–90 · 90+)
// on a one-hue sequential blue ramp that darkens with age, with the 90+ segment
// in the risk red so overdue money reads at a glance (dataviz: sequential = one
// hue light→dark; status colour reserved for the one state that is a risk). Segment width = that bucket's share of the group total.
//
// Hover OR keyboard-focus a segment → a tooltip with the bucket's dollars + item
// count (counts are derived by the page from the capped register rows, so they
// reflect the visible open items). framer-motion grow-in from zero width (one
// shot); static under reduced motion. A Section on the ground — no card.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Section } from '../ui/surface/index.js'

// Bucket ramp: light → dark primary blue with age, 90+ in risk red. Inline hex so
// the ramp is fully controlled and identical in every theme. The lightest step is
// #93C5FD (not #BFDBFE) so "Current" still reads against the surface; segments
// sit 2px apart (the flex gap) so neighbours never merge.
const BUCKETS = [
  { key: 'current', label: 'Current', color: '#93C5FD' },
  { key: 'd1_30', label: '1–30 days', color: '#60A5FA' },
  { key: 'd31_60', label: '31–60 days', color: '#2563EB' },
  { key: 'd61_90', label: '61–90 days', color: '#1E40AF' },
  { key: 'd90_plus', label: '90+ days', color: '#B91C1C' },
]

function fmtMoney(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '$0'
  const neg = v < 0
  return `${neg ? '−' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`
}

function BarGroup({ label, total, buckets, counts, reduce }) {
  const safeTotal = typeof total === 'number' && total > 0 ? total : 0
  // counts is null when the register is capped/empty — dollars are always exact, but
  // per-bucket counts derived from a truncated list would understate, so we hide them.
  const hasCounts = counts != null
  const segments = BUCKETS.map((b) => {
    const amount = Number(buckets?.[b.key] ?? 0)
    return {
      ...b,
      amount,
      count: Number(counts?.[b.key] ?? 0),
      pct: safeTotal > 0 ? Math.max(0, (amount / safeTotal) * 100) : 0,
    }
  }).filter((s) => s.amount > 0)

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
          {label}
        </span>
        <span className="font-serif text-[20px] font-medium text-ink tabular-nums">
          {fmtMoney(total ?? 0)}
        </span>
      </div>

      {safeTotal <= 0 || segments.length === 0 ? (
        <div className="flex h-7 items-center justify-center border-y border-hair text-[12px] italic text-ink2">
          Nothing outstanding
        </div>
      ) : (
        <div className="flex h-6 w-full gap-[2px]">
          {segments.map((s, i) => (
            <div
              key={s.key}
              className="group/seg relative h-full min-w-[3px] rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/50 focus-visible:ring-offset-1"
              style={{ width: `${s.pct}%` }}
              tabIndex={0}
              role="img"
              aria-label={`${label}, ${s.label}: ${fmtMoney(s.amount)}${hasCounts ? `, ${s.count} ${s.count === 1 ? 'item' : 'items'}` : ''}`}
            >
              <motion.div
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.7, delay: reduce ? 0 : i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                style={{ background: s.color, transformOrigin: 'left' }}
                className="h-full w-full rounded-[2px] transition-[filter] group-hover/seg:brightness-110"
              />
              {/* Hover tooltip — bucket $ + count. */}
              <div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-[#101C3D] px-2.5 py-1.5 text-center text-white shadow-float group-hover/seg:block group-focus-visible/seg:block">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60">
                  {s.label}
                </div>
                <div className="text-[13px] font-semibold tabular-nums">{fmtMoney(s.amount)}</div>
                {hasCounts ? (
                  <div className="text-[11px] text-white/70">
                    {s.count} {s.count === 1 ? 'item' : 'items'}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AgingBars({ ar, ap, arCounts, apCounts }) {
  const reduce = useReducedMotion()

  return (
    <Section
      label="Aging profile"
      className="first:!mt-0"
      aside={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {BUCKETS.map((b) => (
            <span key={b.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-ink2">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: b.color }} />
              {b.label}
            </span>
          ))}
        </span>
      }
    >
      <div className="space-y-4">
        <BarGroup
          label="Receivables"
          total={ar?.total ?? 0}
          buckets={ar?.buckets}
          counts={arCounts}
          reduce={reduce}
        />
        <BarGroup
          label="Payables"
          total={ap?.total ?? 0}
          buckets={ap?.buckets}
          counts={apCounts}
          reduce={reduce}
        />
      </div>
    </Section>
  )
}

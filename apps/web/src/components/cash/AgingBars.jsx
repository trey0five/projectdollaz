// ─────────────────────────────────────────────────────────────────────────────
// AgingBars — the two aging-bucket bar groups (Receivables + Payables) for the
// Cash & Collections page. Each group is a single horizontal stacked bar split
// into the five canonical aging buckets (Current · 1–30 · 31–60 · 61–90 · 90+)
// on a navy → gold → danger ramp, with the 90+ segment in danger so overdue money
// reads red at a glance. Segment width = that bucket's share of the group total.
//
// Hover a segment → a tooltip with the bucket's dollars + item count (counts are
// derived by the page from the capped register rows, so they reflect the visible
// open items). framer-motion grow-in from zero width; static under reduced motion.
// Presentational + on-theme (navy/gold, EB Garamond headings via the page).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'

// Bucket ramp: navy (freshest) → gold (mid) → danger (90+). Inline hex so the ramp
// is fully controlled and identical in every theme.
const BUCKETS = [
  { key: 'current', label: 'Current', color: '#1f3d72' },
  { key: 'd1_30', label: '1–30 days', color: '#3a5c9f' },
  { key: 'd31_60', label: '31–60 days', color: '#b89650' },
  { key: 'd61_90', label: '61–90 days', color: '#a2691e' },
  { key: 'd90_plus', label: '90+ days', color: '#8b1a1a' },
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
        <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
          {label}
        </span>
        <span className="font-serif text-[17px] font-semibold text-navy tabular-nums">
          {fmtMoney(total ?? 0)}
        </span>
      </div>

      {safeTotal <= 0 || segments.length === 0 ? (
        <div className="flex h-7 items-center justify-center rounded-lg border border-dashed border-rule/60 bg-cream/50 text-[12px] italic text-muted">
          Nothing outstanding
        </div>
      ) : (
        <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-lg">
          {segments.map((s, i) => (
            <div
              key={s.key}
              className="group/seg relative h-full min-w-[3px] first:rounded-l-lg last:rounded-r-lg"
              style={{ width: `${s.pct}%` }}
            >
              <motion.div
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.7, delay: reduce ? 0 : i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                style={{ background: s.color, transformOrigin: 'left' }}
                className="h-full w-full first:rounded-l-lg last:rounded-r-lg"
              />
              {/* Hover tooltip — bucket $ + count. */}
              <div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-navy px-2.5 py-1.5 text-center text-white shadow-lg group-hover/seg:block">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gold">
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
    <div className="card-soft p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold text-navy">Aging profile</h2>
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {BUCKETS.map((b) => (
            <span key={b.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: b.color }}
              />
              {b.label}
            </span>
          ))}
        </div>
      </div>

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
    </div>
  )
}

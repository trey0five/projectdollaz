// ─────────────────────────────────────────────────────────────────────────────
// CashHeroTile — the cash-forecast hero figure, in the V2StatTile idiom (frosted
// navy tile + soft SEMANTIC status glow from statusStyle/analytics-v2.css). Two
// deliberate departures from V2StatTile, both because this hero is INTERACTIVE:
//   • the value re-counts on every re-projection (useCountUp keyed by the value
//     string), so an edit in the inputs rail is answered by the numerals moving;
//   • optional `action` (the pencil that jumps to the inputs tab) and `chip`
//     (the "Use QuickBooks balance" offer) slots, because the tile is where the
//     user reaches to change the number it shows.
// `countUp={false}` renders the value verbatim — for date values ("Oct 15, 2026"),
// where animating the day-of-month digits would be nonsense.
// Reduced-motion: fade only, no lift, no count-up (useCountUp gates itself).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import Sparkline from '../analytics/charts/Sparkline.jsx'
import { useCountUp } from '../analytics/charts/useCountUp.js'
import { darkStatus } from '../analytics/v2/statusStyle.js'

export default function CashHeroTile({
  label,
  value, // PRE-FORMATTED display string — this component never formats numbers
  sub = null,
  status = 'neutral', // 'good' | 'watch' | 'risk' | 'neutral'
  sparkVals = null, // number[] | null → sparkline omitted
  chip = null, // optional interactive chip beside the sub line
  action = null, // optional small control in the label row (e.g. the pencil)
  wide = false, // T1 spans two columns
  countUp = true,
  index = 0, // stagger slot
}) {
  const reduce = useReducedMotion()
  const ds = darkStatus(status)
  const display = useCountUp(value ?? '—', { duration: 600, enabled: countUp })
  const spark = (sparkVals ?? []).filter((v) => Number.isFinite(v))

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: 'easeOut' }}
      whileHover={reduce ? undefined : { y: -4 }}
      className={`relative flex min-w-0 flex-col gap-1.5 rounded-2xl p-4 ${ds.tile} ${ds.ring} ${
        wide ? 'sm:col-span-2' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
          {label}
        </span>
        {action}
      </div>
      {/* Proportional figures at display size (matching V2StatTile — tabular
          makes large numerals look loose); rail rows keep tabular instead. */}
      <span className="text-[30px] font-semibold leading-tight text-white">{display}</span>

      <div className="flex min-h-[22px] flex-wrap items-center gap-x-2 gap-y-1">
        {sub ? <span className="min-w-0 text-[12px] leading-snug text-white/55">{sub}</span> : null}
        {chip}
      </div>

      {spark.length >= 2 ? (
        <div className="mt-auto h-10">
          <Sparkline vals={spark} color={ds.spark} h={40} fill stretch />
        </div>
      ) : null}
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// V2StatTile — the analytics-v2 KPI tile that lives ON the dark hero band (the
// navy-gradient panel the Overview opens with). Four-layer anatomy, top→down:
//   1. 11px uppercase tracked label (white/60)
//   2. 32px tabular-nums white value, count-up on mount (~600ms, once)
//   3. delta chip — tinted by SEMANTIC tone (emerald improving / red worsening /
//      slate flat), arrow by raw direction
//   4. a 40px sparkline with a gradient-fade area fill in the STATUS hue
// Status = a soft glow ring on the tile (risk red / watch amber / on-track calm
// blue — subtle, never neon; classes live in analytics-v2.css). Hover: a slight
// -translate-y (framer whileHover, so it never fights the entrance transform) +
// a deepened hue-tinted shadow. Entrance: staggered fade-up (60ms/tile, once);
// reduced-motion → opacity only, no hover lift, no count-up (useCountUp gates).
//
// Value strings arrive PRE-FORMATTED (the same @finrep/analytics-formatted string
// the Scorecard row prints — value parity); this component never formats numbers.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import Sparkline from '../charts/Sparkline.jsx'
import { useCountUp } from '../charts/useCountUp.js'
import { darkStatus, DELTA_CHIP_DARK } from './statusStyle.js'

export default function V2StatTile({
  label,
  value,
  delta = null, // raw signed delta (arrow direction); null → no chip
  deltaText = null, // formatted delta string (canonical formatter, upstream)
  deltaTone = 'neutral', // 'good' | 'bad' | 'neutral' (semantic, via deltaTone())
  status = 'neutral', // 'good' | 'watch' | 'risk' | 'neutral' (registry status)
  sparkVals = null, // number[] | null → sparkline omitted
  sub = null, // small context line — shown in the chip slot when no delta exists
  index = 0, // stagger slot
}) {
  const reduce = useReducedMotion()
  const ds = darkStatus(status)
  const display = useCountUp(value ?? '—', { duration: 600 })
  const flat = delta == null || delta === 0
  const Arrow = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight
  const chipTone = flat ? 'neutral' : deltaTone
  const spark = (sparkVals ?? []).filter((v) => Number.isFinite(v))

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: 'easeOut' }}
      whileHover={reduce ? undefined : { y: -4 }}
      className={`relative flex min-w-0 flex-col gap-1.5 rounded-2xl p-4 ${ds.tile} ${ds.ring}`}
    >
      <span className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">{label}</span>
      <span className="text-[32px] font-semibold leading-tight text-white tabular-nums">{display}</span>

      <div className="flex min-h-[22px] items-center">
        {deltaText != null ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${DELTA_CHIP_DARK[chipTone] ?? DELTA_CHIP_DARK.neutral}`}
          >
            <Arrow size={12} strokeWidth={2.5} />
            {deltaText}
          </span>
        ) : sub ? (
          <span className="truncate text-[12px] text-white/50">{sub}</span>
        ) : (
          <span className="text-[12px] text-white/35">—</span>
        )}
      </div>

      <div className="mt-auto h-10">
        {spark.length >= 2 && <Sparkline vals={spark} color={ds.spark} h={40} fill stretch />}
      </div>
    </motion.div>
  )
}

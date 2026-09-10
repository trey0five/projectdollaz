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
      className={`relative flex h-full min-w-0 flex-col gap-1.5 rounded-2xl p-4 ${ds.tile} ${ds.ring}`}
    >
      {/* Two-line label box (never `truncate`): a milestone label like
          "Implement & gather evidence of impact" must READ, and a fixed 2-line
          min-height keeps every tile's value on the same baseline, so sibling
          tiles in one grid row line up whether the label wraps or not. */}
      <span className="line-clamp-2 min-h-[2.6em] text-[11px] font-bold uppercase leading-[1.3] tracking-[0.14em] text-white/60">
        {label}
      </span>
      {/* Big value wears proportional figures (tabular-nums makes 121 look loose
          at display size); the delta chip below keeps tabular for alignment. */}
      <span className="text-[32px] font-semibold leading-tight text-white">{display}</span>

      {/* label / big value / context line. min-h keeps the tile rhythm; a tile
          with neither delta nor sub renders NOTHING here (no stray em-dash). */}
      <div className="flex min-h-[22px] items-center">
        {/* The sub line clamps to two lines, never `truncate`: "25 of 31
            standards self-rated; 0 of 6 assurances satisfied" is the sentence. */}
        {deltaText != null ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${DELTA_CHIP_DARK[chipTone] ?? DELTA_CHIP_DARK.neutral}`}
          >
            <Arrow size={12} strokeWidth={2.5} />
            {deltaText}
          </span>
        ) : sub ? (
          <span className="line-clamp-2 text-[12px] leading-snug text-white/50">{sub}</span>
        ) : null}
      </div>

      {/* The sparkline slot exists only when there is a sparkline to draw. An
          empty 40px box was dead space at the foot of every tile without series
          data (the Journey road tiles), and in a stretched grid it padded every
          sibling row too. Tiles WITH a sparkline are unchanged. */}
      {spark.length >= 2 ? (
        <div className="mt-auto h-10">
          <Sparkline vals={spark} color={ds.spark} h={40} fill stretch />
        </div>
      ) : null}
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// V2StatTile — a single `Stat` for the two DARK STAGES P4 still owns (the
// accreditation JourneyTab measure grid, the enrollment vitals band). Premium
// UI P3 moved every analytics surface to StatStrip/Stat on the ground; this
// adapter keeps the old prop contract alive for those call sites by rendering
// one stage-toned Stat (white ink, no box, no glow) that fills its grid cell:
//   1. 11px caps label, clamped to two lines (never truncated)
//   2. the value (pre-formatted string, counts up once on mount)
//   3. a 2px status mark + the delta Pill / context line
//   4. an optional sparkline
// Value strings arrive PRE-FORMATTED (the same @finrep/analytics-formatted
// string the Scorecard row prints — value parity); this never formats numbers.
// Reduced-motion → no count-up (useCountUp gates), no entrance motion.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import Sparkline from '../charts/Sparkline.jsx'
import { useCountUp } from '../charts/useCountUp.js'
import { Pill } from '../../ui/surface/index.js'
import { darkStatus, DELTA_TONE, MARK } from './statusStyle.js'


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
  const tone = flat ? 'neutral' : DELTA_TONE[deltaTone] ?? 'neutral'
  const spark = (sparkVals ?? []).filter((v) => Number.isFinite(v))
  const mark = MARK[status]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: reduce ? 0 : index * 0.06, ease: 'easeOut' }}
      className="stats stats-stage flex h-full min-w-0 flex-col"
    >
      <div className="stat flex h-full min-w-0 flex-col !pr-0">
        <span className="stat-label line-clamp-2 min-h-[2.6em]">{label}</span>
        <span className="stat-value num">{display}</span>
        {mark ? <span className={`stat-mark tone-${mark}`} aria-hidden="true" /> : null}
        <div className="stat-foot min-h-[22px]">
          {deltaText != null ? (
            <Pill variant="status" tone={tone}>
              <Arrow size={11} strokeWidth={2.5} aria-hidden="true" />
              {deltaText}
            </Pill>
          ) : sub ? (
            <span className="line-clamp-2 leading-snug">{sub}</span>
          ) : null}
        </div>
        {spark.length >= 2 ? (
          <div className="mt-auto h-10 pt-2">
            <Sparkline vals={spark} color={ds.spark} h={40} fill stretch />
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}

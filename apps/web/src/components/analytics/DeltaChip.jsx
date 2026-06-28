import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { formatDelta, deltaTone } from '../../lib/metricMeta.js'

/**
 * Period-over-period delta pill. Color is driven by the metric's goodDirection
 * (NOT the raw sign): improvement = emerald (the app's existing positive cue),
 * regression = red, contextual/neutral/zero = muted. Reuses the SummaryStrip
 * chip vocabulary (emerald-50 / red-50). On a light surface by default; pass
 * onDark for the navy headline band.
 */
export default function DeltaChip({ delta, format, goodDirection, onDark = false }) {
  const text = formatDelta(delta, format)
  if (text == null) return null

  const tone = deltaTone(delta, goodDirection)
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus

  const light = {
    good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    bad: 'bg-red-50 text-red-700 border-red-200',
    neutral: 'bg-section text-muted border-border',
  }
  const dark = {
    good: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
    bad: 'bg-red-400/15 text-red-300 border-red-400/30',
    neutral: 'bg-white/10 text-gold-pale border-white/20',
  }
  const cls = (onDark ? dark : light)[tone]

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] font-semibold ${cls}`}
      title="Change vs the prior period"
    >
      <Icon size={12} />
      {text}
    </span>
  )
}

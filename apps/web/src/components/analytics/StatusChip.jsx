import StatusDot from './StatusDot.jsx'
import { statusMeta } from '../../lib/metricMeta.js'

/**
 * Status pill: dot + label (On track / Watch / At risk / Contextual). On-theme
 * navy/gold composition; risk uses danger sparingly. Neutral metrics show
 * "Contextual" with no risk coloring.
 */
export default function StatusChip({ status }) {
  const meta = statusMeta(status)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold uppercase tracking-[0.08em] ${meta.chip}`}
    >
      <StatusDot status={status} size={7} />
      {meta.label}
    </span>
  )
}

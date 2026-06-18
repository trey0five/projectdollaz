import { statusMeta } from '../../lib/metricMeta.js'

/**
 * Small status indicator dot (good=gold, watch=navy-soft, risk=danger,
 * neutral=muted). A separate level cue from the DeltaChip (which signals change).
 */
export default function StatusDot({ status, size = 8 }) {
  const meta = statusMeta(status)
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ${meta.dot}`}
      style={{ width: size, height: size }}
    />
  )
}

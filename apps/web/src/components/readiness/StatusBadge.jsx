import StatusDot from '../analytics/StatusDot.jsx'
import { complianceStatusMeta } from '../../lib/complianceMeta.js'

/**
 * 5-state compliance status badge composed over the 4-token health palette
 * (pass=good, reportable=watch, material=risk, needs_data/manual/not_applicable=
 * neutral). Composes like StatusChip — dot + uppercase label in the meta.chip pill.
 */
export default function StatusBadge({ status }) {
  const { palette, label } = complianceStatusMeta(status)
  const chip = complianceStatusMeta(status).meta.chip
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold uppercase tracking-[0.08em] ${chip}`}
    >
      <StatusDot status={palette} size={7} />
      {label}
    </span>
  )
}

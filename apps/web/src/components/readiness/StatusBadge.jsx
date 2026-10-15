import { complianceStatusMeta } from '../../lib/complianceMeta.js'
import { Pill } from '../ui/surface/index.js'

/**
 * 5-state compliance status badge composed over the 4-token health palette
 * (pass=good, reportable=watch, material=risk, needs_data/manual/not_applicable=
 * neutral). Premium UI P4: the ONE Pill shape — a 2px status mark + ink text.
 */
export default function StatusBadge({ status }) {
  const { palette, label } = complianceStatusMeta(status)
  return (
    <Pill variant="status" tone={palette}>
      {label}
    </Pill>
  )
}

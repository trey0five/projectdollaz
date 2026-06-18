// ─────────────────────────────────────────────────────────────────────────────
// Phase 2D — Corrective Action Plan UI metadata. Maps the 3 CAP statuses onto the
// existing health palette (good/watch/risk/neutral) with ZERO new colors — defers
// to statusMeta() from metricMeta.js for the class bundle. Severity reuses the 2A
// complianceStatusMeta() mapping (material=risk, reportable=watch).
// ─────────────────────────────────────────────────────────────────────────────
import { CircleDashed, Clock, CheckCircle2 } from 'lucide-react'
import { statusMeta } from './metricMeta.js'

// status -> { palette (health token), label, Icon }.
const CAP_STATUS = {
  open: { palette: 'risk', label: 'Open', Icon: CircleDashed },
  in_progress: { palette: 'watch', label: 'In progress', Icon: Clock },
  complete: { palette: 'good', label: 'Complete', Icon: CheckCircle2 },
}

/** The 3 status options, in order, for the selector. */
export const CAP_STATUS_OPTIONS = [
  { value: 'open', ...CAP_STATUS.open },
  { value: 'in_progress', ...CAP_STATUS.in_progress },
  { value: 'complete', ...CAP_STATUS.complete },
]

/** Resolve a CAP status -> { palette, label, Icon, meta } (meta = health token bundle). */
export function capStatusMeta(status) {
  const base = CAP_STATUS[status] ?? CAP_STATUS.open
  return { ...base, meta: statusMeta(base.palette) }
}

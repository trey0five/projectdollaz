import { Link } from 'react-router-dom'
import { Printer } from 'lucide-react'

/**
 * Phase 2C — opens the dedicated Workpapers Packet print route in a new tab (so the
 * checklist editor state is never disturbed). The print page fetches the aggregated
 * packet fresh and auto-prints. Mirrors CapExportButton.
 */
export default function WorkpapersExportButton({ periodId }) {
  if (!periodId) return null
  return (
    <Link
      to={`/readiness/workpapers/print?period=${encodeURIComponent(periodId)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="btn btn-primary"
    >
      <Printer size={15} /> Generate Workpapers Packet
    </Link>
  )
}

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
      className="inline-flex items-center gap-2 rounded-lg bg-gold-gradient px-4 py-2 text-[13px] font-semibold text-white shadow-glow transition-all hover:opacity-90"
    >
      <Printer size={15} /> Generate Workpapers Packet
    </Link>
  )
}

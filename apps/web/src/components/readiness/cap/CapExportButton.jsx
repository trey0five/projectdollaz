import { Link } from 'react-router-dom'
import { Printer } from 'lucide-react'

/**
 * Opens the dedicated print/export route in a new tab (so the editor state is
 * never disturbed). The print page fetches the merged CAP fresh and auto-prints.
 */
export default function CapExportButton({ periodId }) {
  if (!periodId) return null
  return (
    <Link
      to={`/readiness/cap/print?period=${encodeURIComponent(periodId)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-[13px] font-semibold text-navy transition-all hover:border-gold/50 hover:text-gold"
    >
      <Printer size={15} /> Print / Export CAP
    </Link>
  )
}

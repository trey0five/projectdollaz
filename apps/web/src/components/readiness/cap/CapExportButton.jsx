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
      className="btn btn-secondary"
    >
      <Printer size={15} /> Print / Export CAP
    </Link>
  )
}

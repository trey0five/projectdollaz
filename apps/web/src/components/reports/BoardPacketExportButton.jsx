import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'

/**
 * Opens the board-packet print/export route in a new tab. The print page
 * aggregates the period's insight + metrics + compliance/CAP/reconciliation
 * status and auto-prints (save-as-PDF) without disturbing the dashboard.
 */
export default function BoardPacketExportButton({ periodId, className = '' }) {
  if (!periodId) return null
  return (
    <Link
      to={`/board-packet/print?period=${encodeURIComponent(periodId)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`btn btn-secondary ${className}`}
    >
      <FileText size={14} aria-hidden="true" /> Board packet
    </Link>
  )
}

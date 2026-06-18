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
      className={`inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-[13px] font-semibold text-gold-light transition-all hover:border-gold/70 ${className}`}
    >
      <FileText size={15} /> Board packet
    </Link>
  )
}

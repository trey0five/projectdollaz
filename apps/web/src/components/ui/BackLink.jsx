// ─────────────────────────────────────────────────────────────────────────────
// BackLink — the ONE back affordance for pages DEEPER than one hop from the
// dashboard. If the router has an in-app previous entry (react-router stamps
// history.state.idx; 0 = the first in-app entry), it renders a true Back that
// walks history -1 — so from Finance → Statements, "Back" returns to Finance,
// not the dashboard. On a cold deep-link (no in-app history) it falls back to a
// plain link (default: the dashboard). Pages that ARE one hop from the dashboard
// (module homes, Settings) should keep their explicit "Back to dashboard" links
// and not use this.
// ─────────────────────────────────────────────────────────────────────────────
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

const CLS =
  'inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted transition-colors hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40'

export default function BackLink({ fallback = '/app', fallbackLabel = 'Back to dashboard', className = '' }) {
  const navigate = useNavigate()
  const hasBack = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0
  if (!hasBack) {
    return (
      <Link to={fallback} className={`${CLS} ${className}`}>
        <ArrowLeft size={14} /> {fallbackLabel}
      </Link>
    )
  }
  return (
    <button type="button" onClick={() => navigate(-1)} className={`${CLS} ${className}`}>
      <ArrowLeft size={14} /> Back
    </button>
  )
}

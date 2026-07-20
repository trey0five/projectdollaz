// ─────────────────────────────────────────────────────────────────────────────
// BackLink — the ONE back affordance for pages DEEPER than one hop from the
// dashboard. If the router has an in-app previous entry (react-router stamps
// history.state.idx; 0 = the first in-app entry), it renders a true Back that
// walks history -1 — so from Finance → Statements, "Back" returns to Finance,
// not the dashboard. On a cold deep-link (no in-app history) it falls back to a
// plain link (default: the dashboard). Pages that ARE one hop from the dashboard
// (module homes, Settings) should keep their explicit "Back to dashboard" links
// and not use this.
//
// Style: a rounded "pill" with a circled arrow that nudges left on hover — far
// easier to spot than the old muted mini-caps text. BACK_PILL / BackPillBody are
// exported so the explicit "Back to dashboard" links render identically.
// ─────────────────────────────────────────────────────────────────────────────
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

// The shared fancy back-button styling. Light surfaces (module pages, etc.) use
// BACK_PILL; dark navy surfaces (Settings, Penny Studio) use BACK_PILL_DARK.
export const BACK_PILL =
  'group inline-flex items-center gap-2 rounded-full border border-navy/12 bg-white px-3 py-1.5 text-[13px] font-semibold text-navy shadow-sm transition-all hover:-translate-x-0.5 hover:border-navy/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40'
export const BACK_PILL_DARK =
  'group inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white shadow-sm backdrop-blur-sm transition-all hover:-translate-x-0.5 hover:border-white/30 hover:bg-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50'

// The circled arrow + label shared by every back pill. `tone` matches the pill.
export function BackPillBody({ label, tone = 'light' }) {
  const chip =
    tone === 'dark' ? 'bg-white/15 text-white' : 'bg-navy/10 text-navy'
  return (
    <>
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full transition-transform group-hover:-translate-x-0.5 ${chip}`}
      >
        <ArrowLeft size={13} />
      </span>
      {label}
    </>
  )
}

export default function BackLink({ fallback = '/app', fallbackLabel = 'Back to dashboard', className = '' }) {
  const navigate = useNavigate()
  const hasBack = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0
  if (!hasBack) {
    return (
      <Link to={fallback} className={`${BACK_PILL} ${className}`}>
        <BackPillBody label={fallbackLabel} />
      </Link>
    )
  }
  return (
    <button type="button" onClick={() => navigate(-1)} className={`${BACK_PILL} ${className}`}>
      <BackPillBody label="Back" />
    </button>
  )
}

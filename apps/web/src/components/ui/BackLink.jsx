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
// PREMIUM UI P2: the pill (hue gradient, circled chip, shadow) is gone. Back is
// a QUIET TEXT LINK — 13px/600 ink-2, an arrow that nudges left on hover — in
// the eyebrow grammar of the page header above it. BACK_PILL / BACK_PILL_DARK /
// BackPillBody keep their names (nine call sites) and now resolve to that link:
// `.back-link` on light ground, `.back-link.back-link-dark` on the ink stage.
// ─────────────────────────────────────────────────────────────────────────────
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export const BACK_PILL = 'back-link'
export const BACK_PILL_DARK = 'back-link back-link-dark'

// The arrow + label shared by every back link. `tone` is kept for call sites.
export function BackPillBody({ label }) {
  return (
    <>
      <ArrowLeft size={14} aria-hidden="true" />
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

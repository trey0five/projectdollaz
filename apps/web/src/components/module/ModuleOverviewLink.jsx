// ─────────────────────────────────────────────────────────────────────────────
// ModuleOverviewLink — "Back to <Module> overview" for a module's inner panels
// (Records, Reports). A relative link to the bare pathname, which clears ?tab=
// — the exact URL model ModuleTabs reads — so the sidebar's active row follows.
// Mirrors the Add-data wizard's Choose-step escape hatch, so every panel a user
// can land on has a visible way home.
//
// STYLING: it wears the SAME pill as "Back to dashboard" (BACK_PILL +
// BackPillBody from BackLink), so both back controls read as one family and the
// pill picks up the module hue automatically inside ModuleAccent.
// ─────────────────────────────────────────────────────────────────────────────
import { Link, useLocation } from 'react-router-dom'
import { BACK_PILL, BackPillBody } from '../ui/BackLink.jsx'
import { moduleLabel } from './moduleAnatomy.js'

export default function ModuleOverviewLink({ module, label, className = '' }) {
  const { pathname } = useLocation()
  const name = label ?? `${moduleLabel(module) ?? 'module'} overview`
  return (
    <Link to={pathname} className={`${BACK_PILL} ${className}`}>
      <BackPillBody label={`Back to ${name}`} />
    </Link>
  )
}

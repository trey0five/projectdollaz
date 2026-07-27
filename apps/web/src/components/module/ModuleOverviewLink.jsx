// ─────────────────────────────────────────────────────────────────────────────
// ModuleOverviewLink — "Back to <Module> overview" for a module's inner panels
// (Records, Reports). A relative link to the bare pathname, which clears ?tab=
// — the exact URL model ModuleTabs reads — so the sidebar's active row follows.
// Mirrors the Add-data wizard's Choose-step escape hatch, so every panel a user
// can land on has a visible way home.
// ─────────────────────────────────────────────────────────────────────────────
import { Link, useLocation } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { moduleLabel } from './moduleAnatomy.js'

export default function ModuleOverviewLink({ module, label, className = '' }) {
  const { pathname } = useLocation()
  const name = label ?? `${moduleLabel(module) ?? 'module'} overview`
  return (
    <Link
      to={pathname}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13.5px] font-semibold text-muted outline-none transition-colors hover:text-navy focus-visible:ring-2 focus-visible:ring-navy/40 ${className}`}
    >
      <ChevronLeft size={16} /> Back to {name}
    </Link>
  )
}

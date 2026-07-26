// ─────────────────────────────────────────────────────────────────────────────
// AddDataCta — the prominent on-page "Add data" call-to-action for module pages.
// The Add-data wizard has always lived a click away in the LEFT SIDEBAR; this
// puts the same entry front-and-center on the module's main page so adding
// records is obvious. It is a plain relative link to `?tab=add` — the exact URL
// model ModuleTabs already reads — so it needs no state, works on every module
// route, and deep-links/back-button behave identically to the sidebar entry.
// Styled with the token gradient, so it automatically wears the active module's
// hue (ModuleAccent re-themes bg-gold-gradient per module).
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom'
import { CloudUpload } from 'lucide-react'

export default function AddDataCta({ label = 'Add data', className = '' }) {
  return (
    <Link
      to="?tab=add"
      className={`inline-flex items-center gap-2 rounded-full bg-gold-gradient px-4 py-2 text-[13.5px] font-semibold text-navy shadow-glow transition hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 ${className}`}
    >
      <CloudUpload size={16} />
      {label}
    </Link>
  )
}

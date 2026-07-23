// ─────────────────────────────────────────────────────────────────────────────
// AdminShell — the lean chrome for the platform-admin console. Deliberately
// DISTINCT from the tenant AppShell (no school switcher, no Penny, no module
// nav): a full-width navy top bar with a cross-tenant pill so the founder always
// knows they're looking ACROSS ALL tenants, plus a horizontal tab strip. The
// section pages render into the <Outlet/>.
// ─────────────────────────────────────────────────────────────────────────────
import { NavLink, Outlet, Link } from 'react-router-dom'
import { LogOut, ArrowLeft } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'

const TABS = [
  { to: 'overview', label: 'Overview' },
  { to: 'geography', label: 'Geography' },
  { to: 'users', label: 'Users' },
  { to: 'organizations', label: 'Organizations' },
]

function tabClass({ isActive }) {
  return [
    'whitespace-nowrap border-b-2 px-1 pb-2 pt-1 text-sm font-medium transition-colors',
    isActive
      ? 'border-[#2563EB] text-white'
      : 'border-transparent text-white/60 hover:text-white',
  ].join(' ')
}

export default function AdminShell() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-cream">
      {/* Top bar */}
      <header className="bg-navy-deep text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-6 py-3">
          <span className="font-serif text-lg tracking-tight">
            KYRO <span className="text-white/50">·</span> Platform Admin
          </span>
          <span className="rounded-full bg-coral/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-coral">
            All tenants
          </span>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user?.email && <span className="hidden text-white/70 sm:inline">{user.email}</span>}
            <Link
              to="/app"
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft size={14} /> Exit to app
            </Link>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-danger/20 hover:text-white"
            >
              <LogOut size={14} /> Log out
            </button>
          </div>
        </div>
        {/* Tab strip */}
        <nav className="border-t border-white/10 bg-navy-deep">
          <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-6">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} className={tabClass}>
                {t.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AdminShell — the chrome for the platform-admin console. Deliberately DISTINCT
// from the tenant AppShell (no school switcher, no Penny, no module nav): a dark
// navy LEFT SIDEBAR (glassy, per-section accent hues) with a cross-tenant pill so
// the founder always knows they're looking ACROSS ALL tenants, plus a colorful
// per-section page header. On mobile the sidebar collapses to a top bar with a
// horizontal-scroll nav. The section pages render into the <Outlet/>.
// ─────────────────────────────────────────────────────────────────────────────
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import {
  LogOut,
  ArrowLeft,
  LayoutDashboard,
  Globe2,
  Users,
  Building2,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'

// Each section owns a hue — carried into the sidebar active state, the icon
// tiles and the page header — so the console reads colorful and navigable rather
// than a flat wall of tables. Messages is any-admin; Admins is super-admin only.
const BASE_NAV = [
  {
    to: 'overview',
    label: 'Overview',
    Icon: LayoutDashboard,
    hue: '#2563EB',
    hue2: '#3b82f6',
    title: 'Overview',
    subtitle: 'Platform health across every tenant',
  },
  {
    to: 'geography',
    label: 'Geography',
    Icon: Globe2,
    hue: '#06b6d4',
    hue2: '#22d3ee',
    title: 'Geography',
    subtitle: 'Where your users sign in from',
  },
  {
    to: 'users',
    label: 'Users',
    Icon: Users,
    hue: '#8b5cf6',
    hue2: '#a78bfa',
    title: 'Users',
    subtitle: 'Every account on the platform',
  },
  {
    to: 'organizations',
    label: 'Organizations',
    Icon: Building2,
    hue: '#6366f1',
    hue2: '#818cf8',
    title: 'Organizations',
    subtitle: 'Tenants and the people inside them',
  },
  {
    to: 'messages',
    label: 'Messages',
    Icon: Send,
    hue: '#FF6B5E',
    hue2: '#ff9182',
    title: 'Messages',
    subtitle: "Broadcast to your users' inboxes",
  },
]
const ADMINS_NAV = {
  to: 'admins',
  label: 'Admins',
  Icon: ShieldCheck,
  hue: '#f59e0b',
  hue2: '#fbbf24',
  title: 'Admins',
  subtitle: 'Manage who can access this console',
}

function NavItem({ item, onNavigate }) {
  const { to, label, Icon, hue, hue2 } = item
  return (
    <NavLink to={to} onClick={onNavigate} className="group relative block outline-none">
      {({ isActive }) => (
        <div
          className={[
            'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
            isActive ? 'text-white' : 'text-white/55 hover:bg-white/[0.04] hover:text-white/90',
          ].join(' ')}
          style={isActive ? { backgroundColor: `${hue}1f`, boxShadow: `inset 0 0 0 1px ${hue}33` } : undefined}
        >
          {isActive && (
            <span
              aria-hidden
              className="absolute -left-1 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full"
              style={{ background: `linear-gradient(${hue},${hue2})`, boxShadow: `0 0 12px ${hue}` }}
            />
          )}
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200"
            style={
              isActive
                ? { background: `linear-gradient(135deg,${hue},${hue2})`, boxShadow: `0 6px 16px -6px ${hue}` }
                : { backgroundColor: 'rgba(255,255,255,0.05)', color: hue2 }
            }
          >
            <Icon size={17} className={isActive ? 'text-white' : ''} />
          </span>
          <span>{label}</span>
        </div>
      )}
    </NavLink>
  )
}

export default function AdminShell() {
  const { user, logout } = useAuth()
  const location = useLocation()

  // Super-admin-only: append the Admins management tab. A regular db/env admin
  // never sees it (and AdminsRoute forwards them off the route server-side gate).
  const nav = user?.isSuperadmin ? [...BASE_NAV, ADMINS_NAV] : BASE_NAV

  // Resolve the active section for the colorful page header (index → overview).
  const path = location.pathname.replace(/\/+$/, '')
  const active = nav.find((n) => path.endsWith(`/${n.to}`)) || nav[0]

  const brand = (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-[0_8px_20px_-8px_rgba(37,99,235,0.7)]"
        style={{ background: 'linear-gradient(135deg,#2563EB,#8b5cf6)' }}
      >
        <ShieldCheck size={19} />
      </span>
      <div className="leading-tight">
        <div className="font-serif text-[17px] tracking-tight text-white">KYRO</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
          Platform Admin
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f6f9ff] to-[#eaf0fb] lg:flex">
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="relative hidden w-64 shrink-0 flex-col overflow-hidden bg-[#0a1229] lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(600px 280px at 20% -5%, rgba(37,99,235,0.20), transparent 60%), radial-gradient(480px 360px at 90% 108%, rgba(139,92,246,0.16), transparent 60%)',
          }}
        />
        <div className="relative flex h-full flex-col">
          <div className="px-5 pb-4 pt-6">
            {brand}
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-coral/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-coral">
              <span className="h-1.5 w-1.5 rounded-full bg-coral" /> All tenants
            </span>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
            {nav.map((item) => (
              <NavItem key={item.to} item={item} />
            ))}
          </nav>

          <div className="border-t border-white/10 px-3 py-4">
            {user?.email && (
              <div className="mb-2 truncate px-2 text-[12px] text-white/45" title={user.email}>
                {user.email}
              </div>
            )}
            <div className="flex flex-col gap-1">
              <Link
                to="/app"
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <ArrowLeft size={15} /> Exit to app
              </Link>
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium text-white/70 transition-colors hover:bg-danger/20 hover:text-white"
              >
                <LogOut size={15} /> Log out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ──────────────────────────────────────────────── */}
      <header className="relative overflow-hidden bg-[#0a1229] lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          {brand}
          <div className="flex items-center gap-2">
            <Link
              to="/app"
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
            >
              <ArrowLeft size={13} /> App
            </Link>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-danger/20"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-white/10 px-3 pb-3 pt-2">
          {nav.map((item) => {
            const { to, label, Icon, hue, hue2 } = item
            return (
              <NavLink key={to} to={to} className="shrink-0 outline-none">
                {({ isActive }) => (
                  <span
                    className={[
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
                      isActive ? 'text-white' : 'text-white/55',
                    ].join(' ')}
                    style={isActive ? { background: `linear-gradient(135deg,${hue},${hue2})` } : undefined}
                  >
                    <Icon size={14} /> {label}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
          {/* Colorful per-section header */}
          <div className="mb-6 flex items-center gap-4">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
              style={{
                background: `linear-gradient(135deg,${active.hue},${active.hue2})`,
                boxShadow: `0 12px 28px -10px ${active.hue}`,
              }}
            >
              <active.Icon size={24} />
            </span>
            <div className="min-w-0">
              <h1 className="font-serif text-2xl leading-tight text-ink">{active.title}</h1>
              <p className="text-sm text-muted">{active.subtitle}</p>
            </div>
          </div>

          <Outlet />
        </div>
      </main>
    </div>
  )
}

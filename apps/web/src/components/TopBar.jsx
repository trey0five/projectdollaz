import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LogOut,
  LineChart,
  Settings,
  FileStack,
  BarChart3,
  ShieldCheck,
  LayoutDashboard,
  Wallet,
  FileBarChart2,
  Landmark,
  ListChecks,
  Database,
  Menu,
  X,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useBilling } from '../context/BillingContext.jsx'
import SchoolSwitcher from './SchoolSwitcher.jsx'

export default function TopBar() {
  const { logout } = useAuth()
  const { hasModule } = useBilling()
  const location = useLocation()
  const path = location.pathname
  const onHome = path === '/'
  const onData = path.startsWith('/data')
  const onSettings = path.startsWith('/settings')
  // Statements & Periods absorbs the old History route — highlight on both so
  // the /history -> /statements redirect target still lights up correctly.
  const onStatements = path.startsWith('/statements') || path.startsWith('/history')
  const onAnalytics = path.startsWith('/analytics')
  const onBudget = path.startsWith('/budget')
  const onReports = path.startsWith('/reports')
  const onReadiness = path.startsWith('/readiness')
  const onGovernance = path.startsWith('/governance')
  const onTasks = path.startsWith('/tasks')

  // Mobile drawer (<lg). The old bar crammed 8 icon buttons + switcher + sign-out
  // into one row, which overflowed/looked messy on phones. Below lg we now show a
  // single hamburger that opens a labeled slide-down menu; lg+ keeps the inline nav.
  const [menuOpen, setMenuOpen] = useState(false)
  // Close on navigation (route change) so the drawer never lingers over a new page.
  // Deferred to a microtask so it isn't a synchronous setState-in-effect
  // (react-hooks/set-state-in-effect); setMenuOpen(false) is idempotent.
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) setMenuOpen(false)
    })
    return () => {
      cancelled = true
    }
  }, [path])
  // Close on Escape; lock body scroll while the drawer is open.
  useEffect(() => {
    if (!menuOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  // Self-describing IA: a native tooltip (title) mirrors the aria-label for
  // sighted-hover discoverability, and the label text shows from lg+ so the
  // command-center nav is readable, not icon-guesswork.
  const navItem = (active) =>
    `flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-white/70 transition-all hover:border-gold/60 hover:text-white outline-none ring-gold/50 focus-visible:ring-2 ${
      active ? 'border-gold/60 text-gold-light' : 'border-white/20'
    }`
  const navLabel = 'text-[14px] font-semibold uppercase tracking-[0.1em]'

  // navId = the stable DOM id Penny's target registry anchors her glide to (desktop
  // nav only). Mobile links don't need ids (the coin guides on the desktop layout).
  const NAV = [
    { to: '/', navId: 'nav-home', label: 'Home', Icon: LayoutDashboard, active: onHome },
    { to: '/data', navId: 'nav-data', label: 'Data', Icon: Database, active: onData },
    { to: '/statements', navId: 'nav-statements', label: 'Statements', Icon: FileStack, active: onStatements },
    { to: '/analytics', navId: 'nav-analytics', label: 'Analytics', Icon: BarChart3, active: onAnalytics },
    { to: '/budget', navId: 'nav-budget', label: 'Budget', Icon: Wallet, active: onBudget },
    { to: '/reports', navId: 'nav-reports', label: 'Reports', Icon: FileBarChart2, active: onReports },
    { to: '/readiness', navId: 'nav-readiness', label: 'Readiness', Icon: ShieldCheck, active: onReadiness },
    // Gated by the 'governance' module: hidden for a finance-only school, shown for
    // a trial (all-access) school. hasModule defaults to true while billing loads,
    // so the item never flashes a gate pre-load.
    ...(hasModule('governance')
      ? [{ to: '/governance', navId: 'nav-governance', label: 'Governance', Icon: Landmark, active: onGovernance }]
      : []),
    // Tasks (Phase 3 Workflow) is CORE — ALWAYS shown (no hasModule guard),
    // contrast Governance above (a licensed module).
    { to: '/tasks', navId: 'nav-tasks', label: 'Tasks', Icon: ListChecks, active: onTasks },
    { to: '/settings', navId: 'nav-settings', label: 'Settings', Icon: Settings, active: onSettings },
  ]

  return (
    <header className="no-print sticky top-0 z-40 flex h-20 items-center justify-between gap-3 border-b-2 border-gold/30 bg-navy-gradient px-4 shadow-navy-glow sm:px-10">
      <Link
        to="/"
        aria-label="Go to home dashboard"
        title="Home dashboard"
        className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none ring-gold/50 transition-opacity hover:opacity-90 focus-visible:ring-2 sm:gap-3.5"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold-light shadow-glow">
          <LineChart size={22} />
        </span>
        <span className="truncate font-serif text-[15px] uppercase tracking-[0.14em] text-gold-light sm:text-[16px] sm:tracking-[0.18em]">
          Project Dollaz
        </span>
      </Link>

      {/* ── Desktop nav (lg+): inline labeled command-center bar ─────────────── */}
      <nav aria-label="Primary" className="hidden shrink-0 items-center gap-3 lg:flex">
        <SchoolSwitcher />
        {NAV.map((item) => (
          <Link
            key={item.to}
            id={item.navId}
            to={item.to}
            aria-label={item.label}
            aria-current={item.active ? 'page' : undefined}
            title={item.label}
            className={navItem(item.active)}
          >
            <item.Icon size={17} />
            <span className={navLabel}>{item.label}</span>
          </Link>
        ))}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={logout}
          className="flex min-h-[44px] items-center gap-2 rounded-lg border-2 border-white/20 px-4 py-2 text-[14px] font-semibold uppercase tracking-[0.12em] text-white/70 transition-all hover:border-gold/60 hover:text-white"
        >
          <LogOut size={15} /> Sign Out
        </motion.button>
      </nav>

      {/* ── Mobile (<lg): switcher + hamburger only ──────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 lg:hidden">
        <SchoolSwitcher />
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-white/20 text-white/80 transition-all hover:border-gold/60 hover:text-white"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className="fixed inset-0 top-20 z-30 bg-navy-deep/50 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            <motion.nav
              id="mobile-nav"
              aria-label="Primary"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-x-0 top-20 z-40 max-h-[calc(100vh-5rem)] overflow-y-auto border-b-2 border-gold/30 bg-navy-gradient px-4 py-4 shadow-navy-glow lg:hidden"
            >
              <ul className="grid grid-cols-2 gap-2.5">
                {NAV.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      aria-current={item.active ? 'page' : undefined}
                      className={`flex min-h-[52px] items-center gap-2.5 rounded-xl border-2 px-4 py-2.5 transition-all ${
                        item.active
                          ? 'border-gold/60 bg-gold/10 text-gold-light'
                          : 'border-white/15 text-white/80 hover:border-gold/50 hover:text-white'
                      }`}
                    >
                      <item.Icon size={18} className="shrink-0" />
                      <span className={navLabel}>{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={logout}
                className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border-2 border-white/20 px-4 py-2.5 text-[14px] font-semibold uppercase tracking-[0.12em] text-white/80 transition-all hover:border-gold/60 hover:text-white"
              >
                <LogOut size={16} /> Sign Out
              </motion.button>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </header>
  )
}

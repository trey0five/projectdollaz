import { motion } from 'framer-motion'
import { LogOut, LineChart, Settings, FileStack, BarChart3, ShieldCheck, LayoutDashboard, Wallet, FileBarChart2 } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import SchoolSwitcher from './SchoolSwitcher.jsx'

export default function TopBar() {
  const { logout } = useAuth()
  const location = useLocation()
  const path = location.pathname
  const onHome = path === '/'
  const onSettings = path.startsWith('/settings')
  // Statements & Periods absorbs the old History route — highlight on both so
  // the /history -> /statements redirect target still lights up correctly.
  const onStatements = path.startsWith('/statements') || path.startsWith('/history')
  const onAnalytics = path.startsWith('/analytics')
  const onBudget = path.startsWith('/budget')
  const onReports = path.startsWith('/reports')
  const onReadiness = path.startsWith('/readiness')

  // Self-describing IA: a native tooltip (title) mirrors the aria-label for
  // sighted-hover discoverability, and the label text shows from lg+ so the
  // command-center nav is readable, not icon-guesswork. Icon-only collapse on
  // smaller widths keeps the bar from overflowing on tablet/phone.
  const navItem = (active) =>
    `flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-white/70 transition-all hover:border-gold/60 hover:text-white outline-none ring-gold/50 focus-visible:ring-2 ${
      active ? 'border-gold/60 text-gold-light' : 'border-white/20'
    }`
  const navLabel = 'hidden text-[12px] font-semibold uppercase tracking-[0.1em] lg:inline'

  const NAV = [
    { to: '/', label: 'Home', Icon: LayoutDashboard, active: onHome },
    { to: '/statements', label: 'Statements', Icon: FileStack, active: onStatements },
    { to: '/analytics', label: 'Analytics', Icon: BarChart3, active: onAnalytics },
    { to: '/budget', label: 'Budget', Icon: Wallet, active: onBudget },
    { to: '/reports', label: 'Reports', Icon: FileBarChart2, active: onReports },
    { to: '/readiness', label: 'Readiness', Icon: ShieldCheck, active: onReadiness },
    { to: '/settings', label: 'Settings', Icon: Settings, active: onSettings },
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
        <span className="truncate font-serif text-[13px] uppercase tracking-[0.14em] text-gold-light sm:text-[16px] sm:tracking-[0.18em]">
          Project Dollaz
        </span>
      </Link>
      <nav aria-label="Primary" className="flex shrink-0 items-center gap-2 sm:gap-3">
        <SchoolSwitcher />
        {NAV.map((item) => (
          <Link
            key={item.to}
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
          className="flex min-h-[44px] items-center gap-2 rounded-lg border-2 border-white/20 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/70 transition-all hover:border-gold/60 hover:text-white"
        >
          <LogOut size={15} /> <span className="hidden sm:inline">Sign Out</span>
        </motion.button>
      </nav>
    </header>
  )
}

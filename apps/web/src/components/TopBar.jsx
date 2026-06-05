import { motion } from 'framer-motion'
import { LogOut, LineChart } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import SchoolSwitcher from './SchoolSwitcher.jsx'

export default function TopBar() {
  const { logout } = useAuth()

  return (
    <header className="no-print sticky top-0 z-40 flex h-20 items-center justify-between gap-3 border-b-2 border-gold/30 bg-navy-gradient px-4 shadow-navy-glow sm:px-10">
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold-light shadow-glow">
          <LineChart size={22} />
        </span>
        <span className="truncate font-serif text-[13px] uppercase tracking-[0.14em] text-gold-light sm:text-[16px] sm:tracking-[0.18em]">
          Project Dollaz
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:gap-5">
        <SchoolSwitcher />
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={logout}
          className="flex min-h-[44px] items-center gap-2 rounded-lg border-2 border-white/20 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/70 transition-all hover:border-gold/60 hover:text-white"
        >
          <LogOut size={15} /> <span className="hidden sm:inline">Sign Out</span>
        </motion.button>
      </div>
    </header>
  )
}

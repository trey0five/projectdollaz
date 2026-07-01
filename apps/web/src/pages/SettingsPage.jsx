// Settings shell: the navy app chrome (reusing TopBar) + a responsive sidebar
// and an animated cream panel that renders the active nested section via Outlet.
import { motion } from 'framer-motion'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import SettingsSidebar from '../components/settings/SettingsSidebar.jsx'

export default function SettingsPage() {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-navy-deep bg-navy-radial">
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-serif text-[24px] font-semibold text-gold-light sm:text-[28px]">
            Settings
          </h1>
          <Link
            to="/"
            className="flex min-h-[44px] items-center gap-2 text-[15px] font-semibold text-white/70 transition-colors hover:text-gold-light"
          >
            <ArrowLeft size={15} /> Back to dashboard
          </Link>
        </div>

        <div className="sm:flex sm:gap-8">
          <SettingsSidebar />
          <div className="min-w-0 flex-1">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Outlet />
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  )
}

// Settings shell: PageHeader + a responsive section nav + the active nested section
// (rendered via Outlet), on the light ground.
import { motion, useReducedMotion } from 'framer-motion'
import { Outlet, useLocation } from 'react-router-dom'
import BackLink from '../components/ui/BackLink.jsx'
import { PageHeader } from '../components/ui/surface/index.js'
import SettingsSidebar from '../components/settings/SettingsSidebar.jsx'

// Premium UI P4: Settings sits on the light ground like every other page (the
// navy page was a third dark surface — the ledger allows exactly two). BackLink
// + PageHeader on the hairline, a quiet ruled section nav on the left, each
// section's forms in Panels (SettingsCard) on the right.
export default function SettingsPage() {
  const location = useLocation()
  const reduce = useReducedMotion()

  return (
    <div className="min-h-screen">
      <main className="mx-auto w-full max-w-page px-4 py-6 sm:px-10">
        <BackLink className="mb-2" />
        <PageHeader
          eyebrow="Account · Settings"
          title="Settings"
          meta="Your account, your school and organization, members, integrations, billing and your data."
          hue="16 28 61"
        />

        <div className="mt-6 sm:flex sm:gap-10">
          <SettingsSidebar />
          <div className="min-w-0 flex-1">
            <motion.div
              key={location.pathname}
              initial={reduce ? false : { opacity: 0, y: 8 }}
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

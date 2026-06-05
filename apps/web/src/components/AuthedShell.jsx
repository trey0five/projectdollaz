// The authenticated app entry. Resolves the user's schools, then either:
//  - shows a loading splash while schools load,
//  - shows CreateSchoolForm when the user has none, or
//  - renders the existing Dashboard, with AppProvider fed the SELECTED school so
//    the client-side report preview is scoped to that school's begin-balances.
import { motion } from 'framer-motion'
import { useSchools } from '../context/SchoolContext.jsx'
import { AppProvider } from '../context/AppContext.jsx'
import CreateSchoolForm from './CreateSchoolForm.jsx'
import Dashboard from './Dashboard.jsx'

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-deep bg-navy-radial">
      <motion.div
        className="h-10 w-10 rounded-full border-4 border-gold/30 border-t-gold"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  )
}

export default function AuthedShell() {
  const { schools, activeSchool, loading } = useSchools()

  if (loading) return <Splash />
  if (schools.length === 0) return <CreateSchoolForm />

  // `key` forces a fresh AppProvider when the active school changes, so intake
  // state can't bleed across schools even if the reset effect were skipped.
  return (
    <AppProvider key={activeSchool?.id ?? 'none'} school={activeSchool}>
      <Dashboard />
    </AppProvider>
  )
}

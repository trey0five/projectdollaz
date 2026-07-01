// Home route (IA overhaul): the TopBar + the trial banner + the hybrid command
// center. Mirrors AnalyticsPage's shell — inherits SchoolProvider/BillingProvider/
// PersistenceProvider from AuthedLayout. AppContext/useApp is NOT needed here.
import BillingBanner from '../components/BillingBanner.jsx'
import HomeDashboard from '../components/home/HomeDashboard.jsx'

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <HomeDashboard />
    </div>
  )
}

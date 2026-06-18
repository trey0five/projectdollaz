// Review Readiness route (Phase 2A): TopBar + the Florida-scholarship-AUP
// readiness panel. Mirrors AnalyticsPage's shell — inherits SchoolProvider/
// BillingProvider/PersistenceProvider from AuthedLayout. All roles may read.
import TopBar from '../components/TopBar.jsx'
import BillingBanner from '../components/BillingBanner.jsx'
import ReviewReadinessPanel from '../components/readiness/ReviewReadinessPanel.jsx'

export default function ReadinessPage() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <BillingBanner />
      <ReviewReadinessPanel />
    </div>
  )
}

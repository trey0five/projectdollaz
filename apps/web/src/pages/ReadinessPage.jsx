// Review Readiness route (Phase 2A): AppShell chrome + the Florida-scholarship-AUP
// readiness panel. Mirrors AnalyticsPage's shell — inherits SchoolProvider/
// BillingProvider/PersistenceProvider from AuthedLayout. All roles may read.
import BillingBanner from '../components/BillingBanner.jsx'
import ReviewReadinessPanel from '../components/readiness/ReviewReadinessPanel.jsx'

export default function ReadinessPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <ReviewReadinessPanel />
    </div>
  )
}

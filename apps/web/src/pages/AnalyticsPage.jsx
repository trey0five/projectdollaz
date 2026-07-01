// Analytics route (Phase 4A): the AppShell chrome + the financial-insights dashboard.
// Mirrors HistoryPage's shell — inherits SchoolProvider/BillingProvider/
// PersistenceProvider from AuthedLayout. All roles may read.
import BillingBanner from '../components/BillingBanner.jsx'
import AnalyticsDashboard from '../components/analytics/AnalyticsDashboard.jsx'

export default function AnalyticsPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <AnalyticsDashboard />
    </div>
  )
}

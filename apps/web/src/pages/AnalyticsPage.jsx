// Analytics route (Phase 4A): the TopBar + the financial-insights dashboard.
// Mirrors HistoryPage's shell — inherits SchoolProvider/BillingProvider/
// PersistenceProvider from AuthedLayout. All roles may read.
import TopBar from '../components/TopBar.jsx'
import BillingBanner from '../components/BillingBanner.jsx'
import AnalyticsDashboard from '../components/analytics/AnalyticsDashboard.jsx'

export default function AnalyticsPage() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <BillingBanner />
      <AnalyticsDashboard />
    </div>
  )
}

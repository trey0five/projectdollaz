// Analytics route (Phase 4A → Phase D): the AppShell chrome + the financial-insights
// dashboard. Mirrors HistoryPage's shell — inherits SchoolProvider/BillingProvider/
// PersistenceProvider from AuthedLayout. All roles may read.
//
// ui.v2 fork: under the redesign flag the page renders the Phase-D AnalyticsV2 IA
// (scope × Overview/Charts/Scorecard); flag-off renders the unchanged v1
// AnalyticsDashboard BYTE-IDENTICALLY (the v1 arm is untouched).
import BillingBanner from '../components/BillingBanner.jsx'
import AnalyticsDashboard from '../components/analytics/AnalyticsDashboard.jsx'
import AnalyticsV2 from '../components/analytics/v2/AnalyticsV2.jsx'
import { useUiV2 } from '../context/UiFlagContext.jsx'

export default function AnalyticsPage() {
  const v2 = useUiV2()
  return (
    <div className="min-h-screen">
      <BillingBanner />
      {v2 ? <AnalyticsV2 /> : <AnalyticsDashboard />}
    </div>
  )
}

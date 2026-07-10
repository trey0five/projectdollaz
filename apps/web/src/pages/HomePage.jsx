// Home route (IA overhaul): the AppShell chrome + the trial banner + the hybrid command
// center. Mirrors AnalyticsPage's shell — inherits SchoolProvider/BillingProvider/
// PersistenceProvider from AuthedLayout. AppContext/useApp is NOT needed here.
//
// ui.v2: behind the redesign flag the home is the TILE dashboard (HomeTiles);
// flag-off renders the existing HomeDashboard byte-identically. BillingBanner is
// billing truth (chrome, not theme) — it stays outside the branch in both worlds.
import BillingBanner from '../components/BillingBanner.jsx'
import HomeDashboard from '../components/home/HomeDashboard.jsx'
import HomeTiles from '../components/home/HomeTiles.jsx'
import { useUiV2 } from '../context/UiFlagContext.jsx'

export default function HomePage() {
  const uiV2 = useUiV2()
  return (
    <div className="min-h-screen">
      <BillingBanner />
      {uiV2 ? <HomeTiles /> : <HomeDashboard />}
    </div>
  )
}

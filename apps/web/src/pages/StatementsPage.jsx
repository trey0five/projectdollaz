// Statements & Periods route (IA overhaul). The TopBar (rendered once here) +
// the merged workspace: the saved-periods list + the full live statements
// workspace (intake -> generate -> the four statements -> save). Inherits
// SchoolProvider/BillingProvider/PersistenceProvider from AuthedLayout; the live
// AppProvider is scoped inside StatementsWorkspace.
import TopBar from '../components/TopBar.jsx'
import BillingBanner from '../components/BillingBanner.jsx'
import StatementsWorkspace from '../components/statements/StatementsWorkspace.jsx'

export default function StatementsPage() {
  return (
    <div className="min-h-screen">
      <TopBar />
      {/* Rendered once at the page shell (like HomePage) so the trial/billing
          banner is always visible on /statements — including the read-only
          saved-snapshot view, where Dashboard (which used to host it) isn't
          mounted. */}
      <BillingBanner />
      <StatementsWorkspace />
    </div>
  )
}

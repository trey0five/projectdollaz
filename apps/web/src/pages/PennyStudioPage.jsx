// Penny Studio route (/penny): a full-page AI workspace that REUSES the existing
// Penny engine (usePennyChat). Thin shell mirroring HomePage — the trial banner
// plus the orchestrating <PennyStudio/>. The floating coin is suppressed on this
// path (Penny.jsx) so there is exactly one engine instance mounted.
import BillingBanner from '../components/BillingBanner.jsx'
import PennyStudio from '../components/penny/studio/PennyStudio.jsx'

export default function PennyStudioPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <PennyStudio />
    </div>
  )
}

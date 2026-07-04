// Penny Studio route (/penny): a full-page AI workspace that REUSES the existing
// Penny engine (usePennyChat). Thin shell mirroring HomePage — the trial banner
// plus the orchestrating <PennyStudio/>. The floating coin is suppressed on this
// path (Penny.jsx) so there is exactly one engine instance mounted.
import BillingBanner from '../components/BillingBanner.jsx'
import PennyStudio from '../components/penny/studio/PennyStudio.jsx'

export default function PennyStudioPage() {
  // Bound the page to the viewport below the app-shell's fixed h-14 top strip, as a
  // flex column: the (optional) trial banner takes its own space and PennyStudio
  // fills the rest. This lets Penny Studio scroll internally — the conversation
  // transcript and the landing each get their own scroll region — so the docked
  // composer can never float over the last message and there's no whole-page scroll.
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <BillingBanner />
      <div className="min-h-0 flex-1">
        <PennyStudio />
      </div>
    </div>
  )
}

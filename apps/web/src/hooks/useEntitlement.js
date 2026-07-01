// ─────────────────────────────────────────────────────────────────────────────
// useEntitlement — thin convenience wrapper over BillingContext for FUTURE
// module-gated features. Reads the same source of truth the backend guard uses.
//
//   const { entitled, hasModule, loading } = useEntitlement()
//   const { entitled, licensed, loading } = useEntitlement('planning')
//
// `licensed` is true when the (optional) module argument is on the plan. Both
// default toward ACCESS while billing loads, mirroring the backend no-lockout
// (trial = all-access, legacy/null → finance). Nothing gates today (every
// entitled school has finance); this is scaffolding for when non-finance modules
// ship.
// ─────────────────────────────────────────────────────────────────────────────
import { useBilling } from '../context/BillingContext.jsx'

export function useEntitlement(moduleKey) {
  const { entitled, hasModule, licensedModules, loading } = useBilling()
  return {
    entitled,
    hasModule,
    licensedModules,
    loading,
    licensed: moduleKey ? hasModule(moduleKey) : entitled,
  }
}

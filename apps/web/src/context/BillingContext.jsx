// ─────────────────────────────────────────────────────────────────────────────
// BillingContext — Phase 1D. Tracks the ACTIVE school's subscription/trial state
// so the Billing settings section, the trial/entitlement banner, and the
// generation controls all read one source of truth.
//
//   • Loads { status, plan, trialEnd, currentPeriodEnd, daysLeft, isEntitled }
//     for the active school (the backend lazily seeds a trial, so a fresh school
//     reads as 'trialing').
//   • entitled = status 'active' OR 'trialing' with a future trial_end (the
//     backend computes isEntitled; we mirror it for instant UI).
//   • Owner-only mutations (checkout/portal) redirect to the Stripe URL.
//
// State-sync follows the repo pattern: await BEFORE setState; the effect only
// kicks off a deferred async (satisfies react-hooks/set-state-in-effect).
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { billingApi, apiErrorMessage } from '../lib/api.js'
import { useSchools } from './SchoolContext.jsx'

const BillingContext = createContext(null)

export function BillingProvider({ children }) {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const role = activeSchool?.role ?? null

  const [billing, setBilling] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (sid) => {
    setError('')
    try {
      const res = await billingApi.get(sid)
      setBilling(res.data)
    } catch {
      setError('Could not load billing status.')
      setBilling(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (schoolId) {
        setLoading(true)
        load(schoolId)
      } else {
        setBilling(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, load])

  const refresh = useCallback(
    () => (schoolId ? load(schoolId) : Promise.resolve()),
    [schoolId, load],
  )

  // Owner-only. Redirects the browser to the returned Stripe Checkout URL.
  const startCheckout = useCallback(
    async (plan) => {
      if (!schoolId) return
      const res = await billingApi.checkout(schoolId, plan)
      const url = res.data?.url
      if (url) window.location.assign(url)
    },
    [schoolId],
  )

  // Owner-only. Modular per-module checkout — subscribes to `modules` (core added
  // implicitly server-side). Redirects to the returned Stripe Checkout URL.
  const startModuleCheckout = useCallback(
    async (modules) => {
      if (!schoolId) return
      const res = await billingApi.checkout(schoolId, undefined, modules)
      const url = res.data?.url
      if (url) window.location.assign(url)
    },
    [schoolId],
  )

  // Owner-only. Redirects to the Stripe Customer Portal.
  const openPortal = useCallback(async () => {
    if (!schoolId) return
    const res = await billingApi.portal(schoolId)
    const url = res.data?.url
    if (url) window.location.assign(url)
  }, [schoolId])

  // Per-module gate mirror of the backend isEntitledForModule. Order matches the
  // backend: entitlement is checked FIRST (a lapsed/canceled school is NOT
  // licensed to anything — not even 'core'), THEN core-always / trial-all-access /
  // the licensed set (legacy/null → finance). Defaults toward ACCESS only while
  // billing is still loading (never flash a gate pre-load). Nothing hides today
  // since every entitled school has finance.
  const hasModule = useCallback(
    (key) => {
      if (!billing) return true // still loading — don't flash a gate
      if (!billing.isEntitled) return false // parity with backend: not entitled → nothing, incl. core
      if (key === 'core') return true
      if (billing.status === 'trialing') return true
      const set = billing.licensedModules ?? [{ key: 'finance' }]
      return set.some((m) => m.key === key)
    },
    [billing],
  )

  const value = {
    billing,
    loading,
    error,
    role,
    isOwner: role === 'owner',
    // entitled mirrors the backend gate; default true while loading so we never
    // flash a "subscribe" gate before status arrives.
    entitled: billing ? billing.isEntitled : true,
    licensedModules: billing?.licensedModules ?? [],
    hasModule,
    refresh,
    startCheckout,
    startModuleCheckout,
    openPortal,
    apiErrorMessage,
  }

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
}

export function useBilling() {
  const ctx = useContext(BillingContext)
  if (!ctx) throw new Error('useBilling must be used within a BillingProvider')
  return ctx
}

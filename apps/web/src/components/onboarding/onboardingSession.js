// Tiny subscribable flag: "the onboarding wizard is mid-flight". The wizard
// creates the first school partway through, which would flip OnboardingGate's
// no-schools condition and eject the user before the optional MFA/QuickBooks
// steps — so the gate ALSO keys on this store (via useSyncExternalStore, so
// clearing it re-renders the gate immediately, with no reliance on a router
// re-render). Module state on purpose: a reload mid-flow just lands in the app.
let active = false
const subscribers = new Set()

export const onboardingSession = {
  get: () => active,
  set(value) {
    if (active === value) return
    active = value
    subscribers.forEach((fn) => fn())
  },
  subscribe(fn) {
    subscribers.add(fn)
    return () => subscribers.delete(fn)
  },
}

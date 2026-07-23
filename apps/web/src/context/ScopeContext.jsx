// ─────────────────────────────────────────────────────────────────────────────
// ScopeContext — the "who am I looking at" axis from the architecture doc: a
// single school vs. the whole ORGANIZATION (the multi-school consolidation view).
// Distinct from SchoolContext (which school) and BillingContext (what's licensed).
//
// It resolves the caller's org once (orgsApi.me → { id, name, schools[] }); the
// scope TOGGLE surfaces whenever the caller belongs to an organization — even a
// single-school one (the onboarding wizard lets a signup NAME their org, so it
// must be visible; a 1-school org view simply mirrors the school and is where
// "add more schools" lives). Scope persists to localStorage, but is FORCED to
// 'school' when the caller has NO org — a stale 'org' can never strand anyone on
// an empty org view. isMultiSchool still gates the genuinely multi-school
// features (compare/peers analytics, diocesan import). Read-only; no writes.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { orgsApi } from '../lib/api.js'
import { useSchools } from './SchoolContext.jsx'

const STORAGE_KEY = 'finrep_scope_mode'
const ScopeContext = createContext(null)

const readStored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'org' ? 'org' : 'school'
  } catch {
    return 'school'
  }
}

export function ScopeProvider({ children }) {
  // activeId is our "authed + schools loaded" signal; re-resolve the org if the
  // active school changes (the caller could switch into a different org's school).
  const { activeId } = useSchools()
  const [org, setOrg] = useState(null) // { id, name, schoolCount } | null
  // True once the org fetch has RESOLVED (success, failure, or no-auth) — readers
  // that must not act on a not-yet-loaded isMultiSchool gate on this.
  const [orgResolved, setOrgResolved] = useState(false)
  const [scope, setScopeState] = useState(readStored)

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(async () => {
      if (!activeId) {
        if (!cancelled) {
          setOrg(null)
          setOrgResolved(true)
        }
        return
      }
      try {
        const res = await orgsApi.me()
        if (cancelled) return
        const d = res.data
        const schoolCount = Array.isArray(d?.schools) ? d.schools.length : 0
        setOrg(d?.id ? { id: d.id, name: d.name ?? 'Organization', schoolCount } : null)
        setOrgResolved(true)
      } catch {
        if (!cancelled) {
          setOrg(null)
          setOrgResolved(true)
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeId])

  const hasOrg = !!org?.id
  const isMultiSchool = (org?.schoolCount ?? 0) > 1
  // A caller with no org is always in school scope, whatever localStorage holds.
  const effectiveScope = hasOrg ? scope : 'school'

  const setScope = useCallback((next) => {
    const value = next === 'org' ? 'org' : 'school'
    setScopeState(value)
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      /* ignore quota / private-mode failures */
    }
  }, [])

  const value = useMemo(
    () => ({
      scope: effectiveScope,
      setScope,
      hasOrg,
      isMultiSchool,
      orgId: org?.id ?? null,
      orgName: org?.name ?? null,
      orgSchoolCount: org?.schoolCount ?? 0,
      orgResolved,
    }),
    [effectiveScope, setScope, hasOrg, isMultiSchool, org, orgResolved],
  )

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}

export function useScope() {
  const ctx = useContext(ScopeContext)
  if (!ctx) {
    // Safe default for any tree rendered outside the provider.
    return {
      scope: 'school',
      setScope: () => {},
      hasOrg: false,
      isMultiSchool: false,
      orgId: null,
      orgName: null,
      orgSchoolCount: 0,
      orgResolved: false,
    }
  }
  return ctx
}

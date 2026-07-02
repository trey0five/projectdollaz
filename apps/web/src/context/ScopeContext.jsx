// ─────────────────────────────────────────────────────────────────────────────
// ScopeContext — the "who am I looking at" axis from the architecture doc: a
// single school vs. the whole ORGANIZATION (the multi-school consolidation view).
// Distinct from SchoolContext (which school) and BillingContext (what's licensed).
//
// It resolves the caller's org once (orgsApi.me → { id, name, schools[] }); the
// scope TOGGLE only ever surfaces when the caller belongs to a multi-school org
// (schools.length > 1). Scope persists to localStorage, but is FORCED to 'school'
// whenever the caller isn't multi-school — so a stale 'org' can never strand a
// single-school user on an empty org view. Read-only resolution; no writes.
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
  const [scope, setScopeState] = useState(readStored)

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(async () => {
      if (!activeId) {
        if (!cancelled) setOrg(null)
        return
      }
      try {
        const res = await orgsApi.me()
        if (cancelled) return
        const d = res.data
        const schoolCount = Array.isArray(d?.schools) ? d.schools.length : 0
        setOrg(d?.id ? { id: d.id, name: d.name ?? 'Organization', schoolCount } : null)
      } catch {
        if (!cancelled) setOrg(null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeId])

  const isMultiSchool = (org?.schoolCount ?? 0) > 1
  // A single-school caller is always in school scope, whatever localStorage holds.
  const effectiveScope = isMultiSchool ? scope : 'school'

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
      isMultiSchool,
      orgId: org?.id ?? null,
      orgName: org?.name ?? null,
      orgSchoolCount: org?.schoolCount ?? 0,
    }),
    [effectiveScope, setScope, isMultiSchool, org],
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
      isMultiSchool: false,
      orgId: null,
      orgName: null,
      orgSchoolCount: 0,
    }
  }
  return ctx
}

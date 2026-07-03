// ─────────────────────────────────────────────────────────────────────────────
// SchoolContext — the authenticated user's schools + the SELECTED one. The active
// school replaces the old engine-SCHOOLS + PIN: it carries the begin-balance
// fields the pure engine needs ({ id, name, netAssetsBegin, pyNetAssetsBegin,
// auditNetAssetsBegin }) and is fed straight into the existing client-side report
// preview via AppContext.
//
// Schools are loaded once the user is authenticated. The active school persists
// across reloads in localStorage (by id) and is re-resolved against the freshly
// fetched list. Creating a school appends + selects it.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { schoolsApi, apiErrorMessage } from '../lib/api.js'
import { getPendingInvite, clearPendingInvite } from '../lib/pendingInvite.js'
import { useAuth } from './AuthContext.jsx'

const SchoolContext = createContext(null)
const ACTIVE_KEY = 'finrep_active_school_id'

export function SchoolProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [schools, setSchools] = useState([])
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_KEY) || null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Async loader. The first statement awaits, so every setState here runs OUTSIDE
  // the synchronous effect body (satisfies react-hooks/set-state-in-effect) while
  // still legitimately synchronizing React state with the external API.
  const loadSchools = useCallback(async () => {
    setError('')
    // Redeem a stashed member invite (from an emailed /login?invite=<token> link)
    // BEFORE listing, so the just-joined school is in this very list and the token
    // is only ever spent once. Fires a result event the app surfaces; a bad/expired
    // invite (or wrong-email) never blocks the normal school load.
    let joinedSchoolId = null
    const invite = getPendingInvite()
    if (invite) {
      try {
        const res = await schoolsApi.acceptInvite(invite)
        joinedSchoolId = res.data?.school_id ?? null
        window.dispatchEvent(
          new CustomEvent('finrep:invite-result', { detail: { ok: true } }),
        )
      } catch (e) {
        window.dispatchEvent(
          new CustomEvent('finrep:invite-result', {
            detail: {
              ok: false,
              message: apiErrorMessage(
                e,
                'That invitation is no longer valid — ask for a fresh invite.',
              ),
            },
          }),
        )
      } finally {
        clearPendingInvite()
      }
    }
    try {
      const res = await schoolsApi.list()
      const list = res.data || []
      setSchools(list)
      // Re-resolve the active selection: prefer the school just joined via invite.
      setActiveId((cur) => {
        if (joinedSchoolId && list.some((s) => s.id === joinedSchoolId)) return joinedSchoolId
        if (cur && list.some((s) => s.id === cur)) return cur
        return list.length ? list[0].id : null
      })
    } catch {
      setError('Could not load your schools.')
      setSchools([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    // Defer to a microtask so the state updates aren't synchronous-in-effect.
    Promise.resolve().then(() => {
      if (cancelled) return
      if (isAuthenticated) {
        setLoading(true)
        loadSchools()
      } else {
        setSchools([])
        setActiveId(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, loadSchools])

  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId)
    else localStorage.removeItem(ACTIVE_KEY)
  }, [activeId])

  const setActiveSchool = useCallback((id) => setActiveId(id), [])

  const createSchool = useCallback(async (payload) => {
    const res = await schoolsApi.create(payload)
    const created = res.data
    setSchools((prev) => [...prev, created])
    setActiveId(created.id)
    return created
  }, [])

  // Persist a partial school update (e.g. confirmed opening balances) and
  // reflect the returned record in local state so the engine input updates.
  const updateSchool = useCallback(async (id, patch) => {
    const res = await schoolsApi.update(id, patch)
    const updated = res.data
    setSchools((prev) => prev.map((s) => (s.id === id ? updated : s)))
    return updated
  }, [])

  const activeSchool = schools.find((s) => s.id === activeId) || null

  const value = {
    schools,
    activeSchool,
    activeId,
    loading,
    error,
    setActiveSchool,
    createSchool,
    updateSchool,
    reloadSchools: loadSchools,
  }

  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>
}

export function useSchools() {
  const ctx = useContext(SchoolContext)
  if (!ctx) throw new Error('useSchools must be used within a SchoolProvider')
  return ctx
}

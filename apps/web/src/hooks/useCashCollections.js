// ─────────────────────────────────────────────────────────────────────────────
// useCashCollections — the /cash "Cash & Collections" data hook. Pulls the live+
// cached AR/AP aging payload (AgingResponse) for the active school. School-scoped
// (NOT period-scoped). Same await-BEFORE-setState discipline as useFacilities
// (microtask defer + cancelled flag) so it is react-hooks/set-state-in-effect safe.
//
// The endpoint NEVER 500s: on a token/QBO failure it returns the last stored
// snapshot with `stale:true`, and for a CSV-only / never-connected school it
// returns `{ connected:false }`. So `error` here only ever reflects a transport
// failure (network / auth) — the page treats that as its own soft error panel.
//
// `refresh()` re-pulls bypassing the server cache (`?refresh=true`) and drives the
// header Refresh spinner via `refreshing`.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from 'react'
import { qboApi } from '../lib/api.js'

export function useCashCollections(schoolId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  // Monotonic request id: only the LATEST load() may commit, so a slow response for a
  // previously-selected school can't render under the school the user switched to.
  const reqIdRef = useRef(0)

  const load = useCallback(async (sid, { refresh = false } = {}) => {
    const myReq = ++reqIdRef.current
    setError('')
    try {
      const res = await qboApi.aging(sid, refresh ? { refresh: true } : {})
      if (reqIdRef.current !== myReq) return
      setData(res.data ?? null)
    } catch {
      if (reqIdRef.current !== myReq) return
      setError('Could not reach the Cash & Collections service.')
      setData(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (schoolId) {
        setLoading(true)
        load(schoolId).finally(() => {
          if (!cancelled) setLoading(false)
        })
      } else {
        setData(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, load])

  const refresh = useCallback(async () => {
    if (!schoolId) return
    setRefreshing(true)
    try {
      await load(schoolId, { refresh: true })
    } finally {
      setRefreshing(false)
    }
  }, [schoolId, load])

  // Penny / sync can broadcast a data change for 'cash' — re-pull so a snapshot a
  // sync just refreshed shows without a manual reload (mirrors useFacilities).
  useEffect(() => {
    const onDataChanged = (e) => {
      if (schoolId && e?.detail?.key === 'cash') load(schoolId)
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [schoolId, load])

  return {
    data,
    loading,
    refreshing,
    error,
    connected: data?.connected ?? false,
    orgFed: data?.orgFed ?? false,
    refresh,
  }
}

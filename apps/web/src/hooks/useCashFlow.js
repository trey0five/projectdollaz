// ─────────────────────────────────────────────────────────────────────────────
// useCashFlow — the /cash "Live cash flow + reconciliation" data hook. Pulls the
// live+cached CashFlowResponse (QuickBooks' native cash-flow breakdown + the
// reconciliation trust-check tying our computed statements to QBO's own reports)
// for the active school. School-scoped (NOT period-scoped). Sibling of
// useCashCollections — SAME await-BEFORE-setState discipline (microtask defer +
// cancelled flag + monotonic request id) so it is react-hooks/set-state-in-effect
// safe, and the SAME fail-soft posture.
//
// This is an INDEPENDENT second hook on the page: the endpoint never 500s (a QBO
// failure returns the last snapshot with `stale:true`; a never-connected school
// returns `{ connected:false }`), so `error` here only reflects a transport
// failure. The page renders the aging surface even if this hook errors, and vice
// versa — the two are fully decoupled.
//
// `refresh()` re-pulls bypassing the server cache (`?refresh=true`) and drives the
// header Refresh spinner via `refreshing`.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from 'react'
import { qboApi } from '../lib/api.js'

export function useCashFlow(schoolId) {
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
      const res = await qboApi.cashflow(sid, refresh ? { refresh: true } : {})
      if (reqIdRef.current !== myReq) return
      setData(res.data ?? null)
    } catch {
      if (reqIdRef.current !== myReq) return
      setError('Could not reach the cash-flow service.')
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
  // sync just refreshed shows without a manual reload (mirrors useCashCollections).
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
    refresh,
  }
}

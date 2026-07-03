// ─────────────────────────────────────────────────────────────────────────────
// Data hub — unified data-status hook. Reads the read-only aggregation endpoint
// GET /schools/:s/periods/:p/data-status and exposes {data, loading, error,
// refetch}. Refetches when the period changes AND on window focus / tab-visible
// (so status stays fresh when the user returns from a LINKED page like
// /statements, /budget, /reports/schedules, /readiness, or after an embedded
// panel saves). Follows the project idiom: microtask-deferred effect writes
// (satisfies react-hooks/set-state-in-effect), a cancelled flag, and a stable
// refetch. Tolerates the qbo {configured:false,connected:false} 401 fallback —
// the server already folds that into the payload, so no special-casing here.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { dataHubApi, isPaymentRequired } from '../lib/api.js'

export function useDataStatus(schoolId, periodId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid, pid) => {
    setError('')
    setNotEntitled(false)
    try {
      const res = await dataHubApi.status(sid, pid)
      setData(res.data ?? null)
    } catch (e) {
      setData(null)
      if (isPaymentRequired(e)) setNotEntitled(true)
      else if (e?.response?.status === 404) {
        // Transient during a school switch: the selected period isn't owned by the
        // now-active school yet (persistence is mid-reload, so the still-stale
        // period id is cross-tenant). Not a real failure — stay quiet and let the
        // period re-resolve, rather than flashing the "couldn't load" panel.
        setError('')
      } else setError('Could not load your data status.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (schoolId && periodId) {
        setLoading(true)
        load(schoolId, periodId)
      } else {
        setData(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, periodId, load])

  const refetch = useCallback(
    () => (schoolId && periodId ? load(schoolId, periodId) : Promise.resolve()),
    [schoolId, periodId, load],
  )

  // Refetch on focus / tab re-visible so returning from a linked intake page (or
  // a stale-after-monthly-upload panel) advances the checklist + the mascot.
  useEffect(() => {
    if (!schoolId || !periodId) return undefined
    const onFocus = () => {
      if (document.visibilityState === 'hidden') return
      refetch()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [schoolId, periodId, refetch])

  return { data, loading, error, notEntitled, refetch }
}

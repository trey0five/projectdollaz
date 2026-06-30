// ─────────────────────────────────────────────────────────────────────────────
// Attention-briefing hook. Mirrors useAnalytics exactly (await-BEFORE-setState:
// microtask defer + cancelled flag) to satisfy react-hooks/set-state-in-effect.
// Fail-soft like useInsights: any non-402 error leaves items empty + an error
// string so the panel can collapse without ever blocking the vitals below. A 402
// flips notEntitled so the panel hides like the rest of the gated dashboard.
// The no-snapshot case is a normal 200 (one info item) — no special-casing here.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { briefingApi, isPaymentRequired } from '../lib/api.js'

export function useBriefing(schoolId, periodId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid, pid) => {
    setError('')
    setNotEntitled(false)
    try {
      const res = await briefingApi.get(sid, pid)
      setData(res.data)
    } catch (e) {
      if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setData(null)
      } else {
        setError('Could not load your briefing.')
        setData(null)
      }
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

  const reload = useCallback(
    () => (schoolId && periodId ? load(schoolId, periodId) : Promise.resolve()),
    [schoolId, periodId, load],
  )

  return {
    data,
    items: data?.items ?? [],
    summary: data?.summary ?? null,
    loading,
    error,
    notEntitled,
    reload,
  }
}

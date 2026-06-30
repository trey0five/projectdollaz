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

// Scope × Lens: the optional `lens` arg previews a NARROWER lens (the server
// clamps to the caller's ceiling, so it can only narrow). The response carries
// the effective lens + callerRole (ceiling) + availableLenses, which the
// HomeBriefing pill + owner-only preview switcher render. Absent fields (older
// deploy) leave the indicator/switcher hidden — fully back-compatible.
export function useBriefing(schoolId, periodId, lens) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid, pid, ln) => {
    setError('')
    setNotEntitled(false)
    try {
      const res = await briefingApi.get(sid, pid, ln)
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
        load(schoolId, periodId, lens)
      } else {
        setData(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, periodId, lens, load])

  const reload = useCallback(
    () => (schoolId && periodId ? load(schoolId, periodId, lens) : Promise.resolve()),
    [schoolId, periodId, lens, load],
  )

  return {
    data,
    items: data?.items ?? [],
    summary: data?.summary ?? null,
    lens: data?.lens ?? null,
    callerRole: data?.callerRole ?? null,
    availableLenses: data?.availableLenses ?? [],
    loading,
    error,
    notEntitled,
    reload,
  }
}

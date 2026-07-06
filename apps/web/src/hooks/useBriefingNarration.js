// ─────────────────────────────────────────────────────────────────────────────
// useBriefingNarration — fetches the server-composed "Penny's morning brief"
// narration for the current scope (school or org). POSTs the right route with a
// `dayPart` derived from the browser's local hour (the server can't know the TZ),
// and exposes `reload(regenerate)` for the ↻ affordance.
//
// FAIL-SOFT: any error leaves `data` null + an `error` string so the card can
// collapse (render null) — a narration hiccup must never block Home. Mirrors
// useBriefing's await-BEFORE-setState idiom (microtask defer + cancelled flag) to
// satisfy react-hooks/set-state-in-effect and to drop stale responses when the
// school / org / period / lens changes mid-flight.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { assistantApi, analyticsApi } from '../lib/api.js'

function dayPartNow() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

export function useBriefingNarration({
  scope,
  schoolId,
  orgId,
  periodId,
  fiscalYearStart,
  lens,
}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Monotonic request id: only the newest in-flight fetch may commit its result,
  // so a response for a stale school / org / period / lens is dropped.
  const reqIdRef = useRef(0)

  const load = useCallback(
    async (regenerate) => {
      const reqId = (reqIdRef.current += 1)
      const commit = (fn) => {
        if (reqId === reqIdRef.current) fn()
      }
      setError('')
      try {
        const dayPart = dayPartNow()
        let res
        if (scope === 'org') {
          if (!orgId) {
            commit(() => {
              setData(null)
              setLoading(false)
            })
            return
          }
          res = await analyticsApi.narrateOrgBriefing(orgId, {
            ...(fiscalYearStart ? { fiscalYearStart } : {}),
            ...(lens ? { lens } : {}),
            dayPart,
            ...(regenerate ? { regenerate: true } : {}),
          })
        } else {
          if (!schoolId || !periodId) {
            commit(() => {
              setData(null)
              setLoading(false)
            })
            return
          }
          res = await assistantApi.narrateBriefing(schoolId, {
            periodId,
            ...(lens ? { lens } : {}),
            dayPart,
            ...(regenerate ? { regenerate: true } : {}),
          })
        }
        commit(() => {
          setData(res.data)
          setLoading(false)
        })
      } catch {
        // Fail-soft — the card collapses; never surface a scary error on Home.
        commit(() => {
          setError('narration_unavailable')
          setData(null)
          setLoading(false)
        })
      }
    },
    [scope, schoolId, orgId, periodId, fiscalYearStart, lens],
  )

  useEffect(() => {
    let cancelled = false
    const ready = scope === 'org' ? !!orgId : !!(schoolId && periodId)
    Promise.resolve().then(() => {
      if (cancelled) return
      if (ready) {
        setLoading(true)
        load(false)
      } else {
        setData(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [scope, schoolId, orgId, periodId, fiscalYearStart, lens, load])

  const reload = useCallback(
    (regenerate = true) => {
      setLoading(true)
      return load(regenerate)
    },
    [load],
  )

  return {
    data,
    segments: data?.segments ?? [],
    loading,
    error,
    reload,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2C — Workpapers Packet data hook (single GET, used by the print page).
// Mirrors useCorrectiveActionPlan's load lifecycle; notEntitled flips on a 402.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { workpapersApi, isPaymentRequired } from '../lib/api.js'

export function useWorkpapers(schoolId, periodId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid, pid) => {
    setError('')
    setNotEntitled(false)
    try {
      const res = await workpapersApi.get(sid, pid)
      setData(res.data)
    } catch (e) {
      if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setData(null)
      } else {
        setError('Could not load the workpapers packet for this period.')
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

  return { data, loading, error, notEntitled, reload }
}

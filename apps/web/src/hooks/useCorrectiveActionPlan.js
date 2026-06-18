// ─────────────────────────────────────────────────────────────────────────────
// Phase 2D — Corrective Action Plan data hook. Mirrors useReconciliation
// (await-BEFORE-setState, microtask defer + cancelled flag; notEntitled flips on a
// 402 so the page shows the friendly paused panel). Exposes save() for the PUT.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { correctiveActionApi, isPaymentRequired } from '../lib/api.js'

export function useCorrectiveActionPlan(schoolId, periodId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid, pid) => {
    setError('')
    setNotEntitled(false)
    try {
      const res = await correctiveActionApi.get(sid, pid)
      setData(res.data)
    } catch (e) {
      if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setData(null)
      } else {
        setError('Could not load the corrective action plan for this period.')
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

  const save = useCallback(
    async (entries) => {
      if (!schoolId || !periodId) return
      const res = await correctiveActionApi.save(schoolId, periodId, entries)
      setData(res.data)
      return res.data
    },
    [schoolId, periodId],
  )

  // Dismiss (archived=true) or restore (false) a resolved row. Server returns the
  // fresh plan, so the resolved/dismissed lists update in one round-trip.
  const setArchived = useCallback(
    async (ruleId, archived) => {
      if (!schoolId || !periodId) return
      const res = await correctiveActionApi.setArchived(schoolId, periodId, ruleId, archived)
      setData(res.data)
      return res.data
    },
    [schoolId, periodId],
  )

  return {
    data,
    entries: data?.entries ?? [],
    archived: data?.archived ?? [],
    summary: data?.summary ?? null,
    loading,
    error,
    notEntitled,
    reload,
    save,
    setArchived,
  }
}

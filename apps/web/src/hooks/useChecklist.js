// ─────────────────────────────────────────────────────────────────────────────
// Phase 2C — Year-End checklist data hook. Mirrors useCorrectiveActionPlan
// (await-BEFORE-setState, microtask defer + cancelled flag; notEntitled flips on a
// 402 so the page shows the friendly paused panel). Exposes save() for the PUT;
// the server response is the source of truth for the recomputed rollup.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { checklistApi, isPaymentRequired } from '../lib/api.js'

export function useChecklist(schoolId, periodId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid, pid) => {
    setError('')
    setNotEntitled(false)
    try {
      const res = await checklistApi.get(sid, pid)
      setData(res.data)
    } catch (e) {
      if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setData(null)
      } else {
        setError('Could not load the year-end checklist for this period.')
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
    async (items) => {
      if (!schoolId || !periodId) return
      const res = await checklistApi.save(schoolId, periodId, items)
      setData(res.data)
      return res.data
    },
    [schoolId, periodId],
  )

  return {
    data,
    groups: data?.groups ?? [],
    rollup: data?.rollup ?? null,
    loading,
    error,
    notEntitled,
    reload,
    save,
  }
}

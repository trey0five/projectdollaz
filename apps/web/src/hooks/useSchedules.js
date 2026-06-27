// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — supporting-schedule data hooks. Mirror useForecast/useBudget: the
// microtask-defer + cancelled-flag read pattern (satisfies
// react-hooks/set-state-in-effect), a stable `refetch` used after a save lands,
// and a 402 → notEntitled flip so the page can show the paused panel instead of
// a raw error.
//
// GET never 404s on a missing row, so a fresh period reads as an empty array
// with updatedAt: null — the editors seed cleanly from that.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { schedulesApi, isPaymentRequired } from '../lib/api.js'

export function useCapitalSchedule(schoolId, periodId) {
  const [items, setItems] = useState([])
  const [updatedAt, setUpdatedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid, pid) => {
    setError('')
    setNotEntitled(false)
    try {
      const res = await schedulesApi.getCapital(sid, pid)
      setItems(Array.isArray(res.data?.items) ? res.data.items : [])
      setUpdatedAt(res.data?.updatedAt ?? null)
    } catch (e) {
      if (isPaymentRequired(e)) setNotEntitled(true)
      else setError('Could not load the capital budget.')
      setItems([])
      setUpdatedAt(null)
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
        setItems([])
        setUpdatedAt(null)
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

  return { items, updatedAt, loading, error, notEntitled, refetch }
}

export function useCashSchedule(schoolId, periodId) {
  const [accounts, setAccounts] = useState([])
  const [updatedAt, setUpdatedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid, pid) => {
    setError('')
    setNotEntitled(false)
    try {
      const res = await schedulesApi.getCash(sid, pid)
      setAccounts(Array.isArray(res.data?.accounts) ? res.data.accounts : [])
      setUpdatedAt(res.data?.updatedAt ?? null)
    } catch (e) {
      if (isPaymentRequired(e)) setNotEntitled(true)
      else setError('Could not load cash & investments.')
      setAccounts([])
      setUpdatedAt(null)
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
        setAccounts([])
        setUpdatedAt(null)
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

  return { accounts, updatedAt, loading, error, notEntitled, refetch }
}

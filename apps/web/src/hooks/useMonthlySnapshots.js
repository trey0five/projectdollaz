// ─────────────────────────────────────────────────────────────────────────────
// Monthly Actuals Foundation — loaded-months list hook. Encapsulates the
// monthlyApi.list fetch + loading/error + refetch so the panel stays free of
// in-render fetch logic. Mirrors useReconciliation's await-BEFORE-setState,
// microtask-defer + cancelled-flag pattern; notEntitled flips on a 402 so the
// surface can show a friendly paused state instead of a raw error.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { monthlyApi, isPaymentRequired } from '../lib/api.js'
import { fyStartForMonth } from '../lib/monthlyShapes.js'

export function useMonthlySnapshots(schoolId, periodId) {
  const [fiscalYearStart, setFiscalYearStart] = useState(null)
  const [months, setMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid, pid) => {
    setError('')
    setNotEntitled(false)
    try {
      const res = await monthlyApi.list(sid, pid)
      const data = res.data || {}
      const list = Array.isArray(data.months) ? data.months : []
      // Prefer the server's fiscalYearStart; fall back to deriving from a loaded
      // month so the FY month picker still renders if the field is ever absent.
      const fyStart =
        data.fiscalYearStart || (list[0] ? fyStartForMonth(list[0].monthKey) : null)
      setFiscalYearStart(fyStart)
      setMonths(list)
    } catch (e) {
      if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setMonths([])
        setFiscalYearStart(null)
      } else {
        setError('Could not load the monthly snapshots for this period.')
        setMonths([])
        setFiscalYearStart(null)
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
        setMonths([])
        setFiscalYearStart(null)
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

  return { fiscalYearStart, months, loading, error, notEntitled, reload }
}

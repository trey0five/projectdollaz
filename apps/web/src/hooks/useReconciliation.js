// ─────────────────────────────────────────────────────────────────────────────
// Phase 2B reconciliation data hooks. Mirrors useCompliance (await-BEFORE-
// setState, microtask defer + cancelled flag; notEntitled flips on a 402 so the
// page shows the friendly paused panel instead of a raw error).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { reconciliationApi, isPaymentRequired } from '../lib/api.js'

export function useReconciliation(schoolId, periodId) {
  const [result, setResult] = useState(null)
  const [disbursements, setDisbursements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid, pid) => {
    setError('')
    setNotEntitled(false)
    try {
      const [recon, rows] = await Promise.all([
        reconciliationApi.get(sid, pid),
        reconciliationApi.listDisbursements(sid, pid),
      ])
      setResult(recon.data)
      setDisbursements(rows.data)
    } catch (e) {
      if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setResult(null)
        setDisbursements([])
      } else {
        setError('Could not load the scholarship reconciliation for this period.')
        setResult(null)
        setDisbursements([])
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
        setResult(null)
        setDisbursements([])
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
    result: result?.result ?? null,
    meta: result ?? null,
    disbursements,
    loading,
    error,
    notEntitled,
    reload,
  }
}

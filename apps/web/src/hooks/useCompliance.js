// ─────────────────────────────────────────────────────────────────────────────
// Review Readiness data hooks (Phase 2A). Same await-BEFORE-setState pattern as
// useAnalytics (microtask defer + cancelled flag). notEntitled flips on a 402 so
// the page shows the friendly paused panel instead of a raw error.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { complianceApi, isPaymentRequired } from '../lib/api.js'

export function useCompliance(schoolId, periodId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid, pid) => {
    setError('')
    setNotEntitled(false)
    try {
      const res = await complianceApi.get(sid, pid)
      setData(res.data)
    } catch (e) {
      if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setData(null)
      } else {
        setError('Could not load the readiness checks for this period.')
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
    summary: data?.summary ?? null,
    findings: data?.findings ?? [],
    sections: data?.sections ?? [],
    loading,
    error,
    notEntitled,
    reload,
  }
}

export function useComplianceInputs(schoolId, periodId) {
  const [inputs, setInputs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid, pid) => {
    setError('')
    setNotEntitled(false)
    try {
      const res = await complianceApi.getInputs(sid, pid)
      setInputs(res.data)
    } catch (e) {
      if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setInputs(null)
      } else {
        setError('Could not load the compliance intake.')
        setInputs(null)
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
        setInputs(null)
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

  return { inputs, loading, error, notEntitled, reload }
}

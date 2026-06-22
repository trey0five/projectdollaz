// ─────────────────────────────────────────────────────────────────────────────
// Analytics data hooks. await-BEFORE-setState (microtask defer + cancelled flag),
// mirroring BillingContext/SchoolContext to satisfy react-hooks/set-state-in-effect.
// notEntitled flips on a 402 so the dashboard shows the friendly paused panel
// instead of a raw error even if BillingContext lags.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { analyticsApi, isPaymentRequired } from '../lib/api.js'

export function useAnalytics(schoolId, periodId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid, pid) => {
    setError('')
    setNotEntitled(false)
    try {
      const res = await analyticsApi.metrics(sid, pid)
      setData(res.data)
    } catch (e) {
      if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setData(null)
      } else {
        setError('Could not load insights for this period.')
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

  // Stable refetch for the current school+period (used to relight Tier-2 cards
  // after operational data is saved). No-op when nothing is selected.
  const reload = useCallback(
    () => (schoolId && periodId ? load(schoolId, periodId) : Promise.resolve()),
    [schoolId, periodId, load],
  )

  return { data, metrics: data?.metrics ?? [], loading, error, notEntitled, reload }
}

// ── Phase 4B: per-period operational data (enrollment + aid) ─────────────────
export function useOperational(schoolId, periodId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid, pid) => {
    setError('')
    setNotEntitled(false)
    try {
      const res = await analyticsApi.operational(sid, pid)
      setData(res.data)
    } catch (e) {
      if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setData(null)
      } else {
        setError('Could not load operational data.')
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

  return { operational: data, loading, error, notEntitled, reload }
}

// ── Phase 3: per-period budget (budget-vs-actual). Mirrors useOperational. ─────
export function useBudget(schoolId, periodId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid, pid) => {
    setError('')
    setNotEntitled(false)
    try {
      const res = await analyticsApi.budget(sid, pid)
      setData(res.data)
    } catch (e) {
      if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setData(null)
      } else {
        setError('Could not load the budget.')
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

  const save = useCallback(
    async (body) => {
      if (!schoolId || !periodId) return
      const res = await analyticsApi.saveBudget(schoolId, periodId, body)
      setData(res.data)
      return res.data
    },
    [schoolId, periodId],
  )

  return { budget: data, loading, error, notEntitled, save }
}

// ── Budget builder context: prior actuals + history + drivers (read-only) ─────
// Loads alongside useBudget; never blocks the budget UI (failure just disables
// the smart build methods, leaving manual entry working).
export function useBudgetContext(schoolId, periodId) {
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (sid, pid) => {
    try {
      const res = await analyticsApi.budgetContext(sid, pid)
      setContext(res.data)
    } catch {
      setContext(null)
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
        setContext(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, periodId, load])

  return { context, loading }
}

// ── Phase 4C: per-school dashboard layout (order + visibility + chart variant) ─
// Fetches GET /dashboard on schoolId change (same microtask-defer + cancelled
// pattern). Exposes the layout plus save/reset actions for customize mode. A 402
// flips notEntitled so the page shows the paused panel, identical to useAnalytics.
export function useDashboardLayout(schoolId) {
  const [layout, setLayout] = useState(null)
  const [isDefault, setIsDefault] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid) => {
    setError('')
    setNotEntitled(false)
    try {
      const res = await analyticsApi.dashboard(sid)
      setLayout(res.data?.layout ?? null)
      setIsDefault(Boolean(res.data?.isDefault))
    } catch (e) {
      if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setLayout(null)
      } else {
        setError('Could not load your dashboard layout.')
        setLayout(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (schoolId) {
        setLoading(true)
        load(schoolId)
      } else {
        setLayout(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, load])

  const reload = useCallback(
    () => (schoolId ? load(schoolId) : Promise.resolve()),
    [schoolId, load],
  )

  // Persist a new layout (owner only). Returns true on success.
  const save = useCallback(
    async (nextLayout) => {
      if (!schoolId) return false
      await analyticsApi.saveDashboard(schoolId, { layout: nextLayout })
      await load(schoolId)
      return true
    },
    [schoolId, load],
  )

  // Reset to the registry default (DELETE the row), then re-fetch.
  const reset = useCallback(async () => {
    if (!schoolId) return false
    await analyticsApi.resetDashboard(schoolId)
    await load(schoolId)
    return true
  }, [schoolId, load])

  return { layout, isDefault, loading, error, notEntitled, reload, save, reset }
}

// ── Phase 4D: AI insight summary ─────────────────────────────────────────────
// Same microtask-defer + cancelled pattern. NEVER throws to the UI: on any error
// the text is left empty so the InsightBand simply hides. Re-fetches on period
// change. The backend always returns deterministic rule-based text with no key.
export function useInsights(schoolId, periodId) {
  const [text, setText] = useState('')
  const [source, setSource] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (sid, pid) => {
    try {
      const res = await analyticsApi.insights(sid, pid)
      setText(res.data?.text ?? '')
      setSource(res.data?.source ?? null)
    } catch {
      setText('')
      setSource(null)
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
        setText('')
        setSource(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, periodId, load])

  return { text, source, loading }
}

export function useTrends(schoolId, metricKey) {
  const [trend, setTrend] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (sid, key) => {
    try {
      const res = await analyticsApi.trends(sid, key)
      setTrend(res.data)
    } catch {
      setTrend(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (schoolId && metricKey) {
        setLoading(true)
        load(schoolId, metricKey)
      } else {
        setTrend(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, metricKey, load])

  return { trend, loading }
}

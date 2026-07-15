// ─────────────────────────────────────────────────────────────────────────────
// data.js — small read-only hooks the analytics-v2 shell composes (await-before-
// setState + cancelled-flag, matching useAnalytics.js). These cover the reads the
// existing hooks don't: a chosen school's snapshot periods (school scope can point
// at any in-org school, not just the active one), per-key sparkline trends for the
// calm Overview, and a multi-school trend fan-out for the compare/org time
// charts (the compare endpoint is single-FY; time series come from /trends).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { analyticsApi, periodsApi } from '../../../lib/api.js'

/** A school's snapshot-bearing periods, newest-first (id, label, periodEndDate). */
export function useSchoolPeriods(schoolId) {
  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(async () => {
      if (cancelled) return
      if (!schoolId) {
        setPeriods([])
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const res = await periodsApi.list(schoolId)
        if (cancelled) return
        const rows = (res.data || res.data?.periods || [])
        const list = (Array.isArray(rows) ? rows : rows.periods || [])
          .filter((p) => p.hasSnapshot)
          .sort((a, b) => (a.periodEndDate < b.periodEndDate ? 1 : -1))
        setPeriods(list)
      } catch {
        if (!cancelled) setPeriods([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId])

  return { periods, loading }
}

/** Sparkline trends for a set of metric keys at one school (fetched once/school). */
export function useSparkTrends(schoolId, keys) {
  const [trends, setTrends] = useState({})
  const keySig = (keys || []).join(',')

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(async () => {
      if (cancelled || !schoolId || !keys?.length) {
        if (!cancelled) setTrends({})
        return
      }
      try {
        const results = await Promise.all(
          keys.map((k) =>
            analyticsApi
              .trends(schoolId, k)
              .then((r) => [k, r.data])
              .catch(() => [k, null]),
          ),
        )
        if (cancelled) return
        const map = {}
        for (const [k, v] of results) if (v) map[k] = v
        setTrends(map)
      } catch {
        if (!cancelled) setTrends({})
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, keySig])

  return trends
}

/**
 * Fan out /trends for one metric across several schools → { [schoolId]: MetricTrend }.
 * Powers the compare/org multi-series line, emphasis line, small multiples, and
 * bar race — all from REAL registry trend points (no invented series).
 */
export function useMultiSchoolTrends(schoolIds, metricKey) {
  const [bySchool, setBySchool] = useState({})
  const [loading, setLoading] = useState(false)
  const sig = (schoolIds || []).join(',') + '|' + (metricKey || '')

  const load = useCallback(async (ids, key) => {
    setLoading(true)
    try {
      const results = await Promise.all(
        ids.map((id) =>
          analyticsApi
            .trends(id, key)
            .then((r) => [id, r.data])
            .catch(() => [id, null]),
        ),
      )
      const map = {}
      for (const [id, v] of results) if (v) map[id] = v
      setBySchool(map)
    } catch {
      setBySchool({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (schoolIds?.length && metricKey) load(schoolIds, metricKey)
      else setBySchool({})
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, load])

  return { bySchool, loading }
}

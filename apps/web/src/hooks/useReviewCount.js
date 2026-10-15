// ─────────────────────────────────────────────────────────────────────────────
// useReviewCount — how many accounts the SAVED statements for a period could
// not place (A4). Read from the latest snapshot (payload.unmapped), which the
// server builds with the school's real mapping — so it is the truth even after
// a reload, when this browser alone can't see the school's picks.
//
// Refetches when anything says the numbers changed (`penny:data-changed`, which
// a category pick fires after the server has rebuilt the statements), so the
// Finance band stops asking the moment the last account is sorted.
// await-BEFORE-setState (microtask defer + cancelled flag) like useAnalytics.
// → number | null (null = unknown / no saved statements / still loading).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { statementsApi } from '../lib/api.js'
import { snapshotReviewCount } from '../lib/reviewQueue.js'

export function useReviewCount(schoolId, periodId) {
  const [state, setState] = useState({ key: null, count: null })
  const [tick, setTick] = useState(0)
  const key = schoolId && periodId ? `${schoolId}:${periodId}` : null

  useEffect(() => {
    const onChanged = () => setTick((t) => t + 1)
    window.addEventListener('penny:data-changed', onChanged)
    return () => window.removeEventListener('penny:data-changed', onChanged)
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!key) return undefined
    Promise.resolve()
      .then(() => statementsApi.latest(schoolId, periodId))
      .then((res) => {
        if (!cancelled) setState({ key, count: snapshotReviewCount(res?.data) })
      })
      .catch(() => {
        if (!cancelled) setState({ key, count: null })
      })
    return () => {
      cancelled = true
    }
  }, [key, schoolId, periodId, tick])

  return state.key === key ? state.count : null
}

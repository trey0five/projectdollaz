// ─────────────────────────────────────────────────────────────────────────────
// useNavBadges — attention counts for the sidebar, derived from the prioritised
// briefing (the platform's attention layer) for the active school's latest saved
// period. Returns { [source]: { count, critical } } keyed by AttentionSource
// (workflow / governance / facilities / accreditation / advancement / …).
//
// Advisory chrome: fail-SOFT to {} on any error / missing school-or-period, never
// blocks the shell. One read per school+period; the briefing is already computed
// for Home, so this is a cache-friendly reuse rather than new work.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { briefingApi } from '../lib/api.js'

export function useNavBadges(schoolId, periodId) {
  const [counts, setCounts] = useState({})

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(async () => {
      if (cancelled) return
      if (!schoolId || !periodId) {
        setCounts({})
        return
      }
      try {
        const res = await briefingApi.get(schoolId, periodId)
        if (cancelled) return
        const items = res.data?.items ?? []
        const next = {}
        for (const item of items) {
          const source = item?.source
          if (!source) continue
          const cur = next[source] ?? { count: 0, critical: false }
          cur.count += 1
          if (item.severity === 'critical') cur.critical = true
          next[source] = cur
        }
        setCounts(next)
      } catch {
        if (!cancelled) setCounts({})
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, periodId])

  return counts
}

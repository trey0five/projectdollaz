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

// Shared pure reducer over briefing items — the ONE implementation behind both the
// sidebar badges (this hook) and the HOME v2 tile chips (HomeTiles), so the two
// surfaces can never drift. Without `sourcesMap` it groups by `item.source`
// verbatim (the hook's original behavior). With `sourcesMap`
// ({ [key]: AttentionSource[] }) it rolls sources up into the map's keys instead
// (e.g. the finance tile's ['metric','compliance','data','cash']); sources absent
// from the map are dropped. Returns { [key]: { count, critical } }.
export function summariseBadges(items, sourcesMap) {
  const next = {}
  for (const item of items ?? []) {
    const source = item?.source
    if (!source) continue
    const keys = sourcesMap
      ? Object.keys(sourcesMap).filter((k) => sourcesMap[k].includes(source))
      : [source]
    for (const key of keys) {
      const cur = next[key] ?? { count: 0, critical: false }
      cur.count += 1
      if (item.severity === 'critical') cur.critical = true
      next[key] = cur
    }
  }
  return next
}

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
        setCounts(summariseBadges(res.data?.items ?? []))
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

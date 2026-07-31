// ─────────────────────────────────────────────────────────────────────────────
// useReadinessTrend — Phase A Accreditation Intelligence: the readiness HISTORY.
//
// Loads the school's readiness SERIES list, then the points + observed change for
// the selected series. A school that has adopted two frameworks has two fully
// independent series (seriesKey = the framework code, or 'none' for standards
// linked to no framework) — the server picks a defaultSeriesKey (most leaves) and
// flags requiresSelection when there is more than one; nothing here ever blends
// two series together.
//
// Fail-soft by design: readiness history is a decoration on top of the register,
// so a hiccup here must never blank the Accreditation page. Errors resolve to
// trend === null plus an error string, and the module 402 (MODULE_NOT_LICENSED)
// surfaces as notLicensed via the shared isModuleNotLicensed helper — same shape
// as useAccreditation, whose await-BEFORE-setState pattern (microtask defer +
// cancelled flag + stale-school ref) this mirrors exactly.
//
// NOTE the deliberate absence of any client-side math: every number rendered
// downstream is server-computed and server-validated. When history is too thin
// the payload says so (change.available === false + a human reason) and the UI
// renders that verbatim — it never estimates a direction to fill the hole.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { accreditationApi, isModuleNotLicensed } from '../lib/api.js'

export function useReadinessTrend(schoolId, { enabled = true } = {}) {
  const [series, setSeries] = useState(null) // the /series payload (null until loaded)
  const [seriesKey, setSeriesKeyState] = useState(null)
  const [trend, setTrend] = useState(null) // the /trend payload for seriesKey
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)

  // STALE-RESPONSE GUARD — identical to useAccreditation: on a rapid school swap
  // the previous school's in-flight responses can resolve LAST and pin its history
  // on the new school's hero (a cross-tenant display mix-up). Every awaited setter
  // checks the sid it fetched for is still the active school before writing state.
  const activeSchoolRef = useRef(schoolId)
  activeSchoolRef.current = schoolId

  // THE OPERATOR'S SERIES PICK, held in a ref. `load` is memoized on [loadTrend]
  // only, so anything it closes over from state is frozen at first render: a
  // multi-framework school that picked NSBECS would be snapped silently back to
  // the default series by the next refresh (a Penny apply, a register edit) with
  // no user action. The ref is the same discipline activeSchoolRef uses, and it
  // is the ONLY thing `load` may read for the selection.
  const seriesKeyRef = useRef(null)
  const selectSeriesKey = useCallback((key) => {
    seriesKeyRef.current = key
    setSeriesKeyState(key)
  }, [])

  const loadTrend = useCallback(async (sid, key) => {
    try {
      const res = await accreditationApi.getReadinessTrend(sid, key ? { seriesKey: key } : {})
      if (activeSchoolRef.current !== sid) return // stale school swap — drop
      setTrend(res.data ?? null)
    } catch (e) {
      if (activeSchoolRef.current !== sid) return
      setTrend(null)
      if (isModuleNotLicensed(e)) setNotLicensed(true)
      else setError('Could not load your readiness history.')
    }
  }, [])

  const load = useCallback(
    async (sid) => {
      setError('')
      setNotLicensed(false)
      try {
        const res = await accreditationApi.getReadinessSeries(sid)
        if (activeSchoolRef.current !== sid) return // stale school swap — drop
        const payload = res.data ?? null
        setSeries(payload)
        // The server's defaultSeriesKey is the series with the most leaves; keep
        // the operator's current pick when it still exists in the new payload.
        const keys = (payload?.series ?? []).map((s) => s.seriesKey)
        const picked = seriesKeyRef.current
        const key = keys.includes(picked) ? picked : (payload?.defaultSeriesKey ?? null)
        selectSeriesKey(key)
        await loadTrend(sid, key)
      } catch (e) {
        if (activeSchoolRef.current !== sid) return
        setSeries(null)
        setTrend(null)
        if (isModuleNotLicensed(e)) setNotLicensed(true)
        else setError('Could not load your readiness history.')
      } finally {
        if (activeSchoolRef.current === sid) setLoading(false)
      }
    },
    [loadTrend, selectSeriesKey],
  )

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      // GATED. The page mounts this hook above its own module gate (hooks cannot
      // sit behind an early return), so without `enabled` a finance-only tenant
      // landing on /accreditation would fire two extra requests that both 402.
      // The caller flips this on only once it knows the school is licensed.
      if (schoolId && enabled) {
        setLoading(true)
        load(schoolId)
      } else {
        setSeries(null)
        setTrend(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, enabled, load])

  // Switch series (multi-framework schools). Only the points change — the series
  // list is already loaded, so this is a single round-trip.
  const setSeriesKey = useCallback(
    async (key) => {
      if (!schoolId || key === seriesKey) return
      selectSeriesKey(key)
      setTrend(null)
      setError('')
      await loadTrend(schoolId, key)
    },
    [schoolId, seriesKey, loadTrend, selectSeriesKey],
  )

  const refresh = useCallback(
    () => (schoolId && enabled ? load(schoolId) : Promise.resolve()),
    [schoolId, enabled, load],
  )

  // A rubric score / evidence change writes an EVENT snapshot server-side, so the
  // strip re-pulls when the register broadcasts a change (same channel Penny's
  // confirm-then-apply uses). Fail-soft: refresh() never rejects.
  useEffect(() => {
    const onDataChanged = (e) => {
      if (e?.detail?.key === 'accreditation') refresh()
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [refresh])

  return { series, seriesKey, setSeriesKey, trend, loading, error, notLicensed, refresh }
}

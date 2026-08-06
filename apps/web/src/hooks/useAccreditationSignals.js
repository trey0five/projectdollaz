// ─────────────────────────────────────────────────────────────────────────────
// useAccreditationSignals — Phase B Accreditation Intelligence: the OPERATIONAL
// SIGNALS bound to a school's standards.
//
// One request per school. The payload carries every metric the platform catalog
// binds to any of this school's standards, valued against the latest
// snapshot-bearing period, plus the two indexes the surfaces need:
//   byStandard  schoolStandardId → the metric keys bound to it
//   byDomain    all ten accreditation domain keys → { bound, live, unavailable }
// The page slices those down to the Standard Drawer and the Domains grid; nothing
// fetches per standard.
//
// Fail-soft, exactly like useReadinessTrend: signals decorate the register and
// the domain cards, so a hiccup here must never blank either. Errors resolve to
// a null payload plus an error string, and the module 402 surfaces as
// notLicensed. Same await-BEFORE-setState discipline: microtask defer + cancelled
// flag + activeSchoolRef stale-school guard (a rapid school swap must never let
// the previous tenant's numbers land on the new school's cards).
//
// NOTE there is no client-side math and no client-side formatting decision here.
// Every value, band, status, as-of date and unavailability REASON is computed and
// worded server-side; the components render them verbatim (formatting only, via
// the one shared lib/metricMeta.js authority). When a value is missing the server
// says why — we never substitute a zero, a stale figure or a guess.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { accreditationApi, isModuleNotLicensed } from '../lib/api.js'

const EMPTY_SIGNALS = []
const EMPTY_MAP = {}

export function useAccreditationSignals(
  schoolId,
  { enabled = true, periodId = null, frameworkId = null } = {},
) {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)

  // STALE-RESPONSE GUARD — see useReadinessTrend: on a rapid school swap the
  // previous school's in-flight response can resolve LAST and pin its operating
  // numbers on the new school's standards (a cross-tenant display mix-up).
  const activeSchoolRef = useRef(schoolId)
  activeSchoolRef.current = schoolId

  const load = useCallback(
    async (sid) => {
      setError('')
      setNotLicensed(false)
      try {
        // frameworkId: which adopted framework's standards this panel grades.
        // Omitted for the single-accreditation school, where the server's
        // dominance rule and the page's selection are the same framework anyway.
        const res = await accreditationApi.getSignals(sid, {
          ...(periodId ? { periodId } : {}),
          ...(frameworkId ? { frameworkId } : {}),
        })
        if (activeSchoolRef.current !== sid) return // stale school swap — drop
        setPayload(res.data ?? null)
      } catch (e) {
        if (activeSchoolRef.current !== sid) return
        setPayload(null)
        if (isModuleNotLicensed(e)) setNotLicensed(true)
        else setError('Operating signals are unavailable right now.')
      } finally {
        if (activeSchoolRef.current === sid) setLoading(false)
      }
    },
    [periodId, frameworkId],
  )

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      // GATED. The page mounts this hook above its own module gate (hooks cannot
      // sit behind an early return), so without `enabled` a finance-only tenant
      // landing on /accreditation would fire an extra request that 402s.
      if (schoolId && enabled) {
        setLoading(true)
        load(schoolId)
      } else {
        setPayload(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, enabled, load])

  const refresh = useCallback(
    () => (schoolId && enabled ? load(schoolId) : Promise.resolve()),
    [schoolId, enabled, load],
  )

  // A trial-balance import, an evidence attach or a Penny apply can change what
  // is bound or what a metric reads, so re-pull on the same channel the register
  // and the trend strip already listen to. Fail-soft: refresh() never rejects.
  useEffect(() => {
    const onDataChanged = (e) => {
      if (e?.detail?.key === 'accreditation') refresh()
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [refresh])

  const signals = payload?.signals ?? EMPTY_SIGNALS
  const byStandard = payload?.byStandard ?? EMPTY_MAP
  const byDomain = payload?.byDomain ?? null

  // key → the valued signal, for O(1) lookup on the cards and in the drawer.
  const byKey = useMemo(() => {
    const out = {}
    for (const s of signals) out[s.key] = s
    return out
  }, [signals])

  return {
    signals,
    byKey,
    byStandard,
    byDomain,
    period: payload?.period ?? null,
    asOf: payload?.asOf ?? null,
    unavailable: payload?.unavailable ?? null,
    loading,
    error,
    notLicensed,
    refresh,
  }
}

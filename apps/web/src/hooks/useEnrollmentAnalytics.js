// ─────────────────────────────────────────────────────────────────────────────
// useEnrollmentAnalytics — the ONE read behind the Enrollment module's Analytics
// tab. Mirrors useAnalytics/useBriefing exactly (await-BEFORE-setState: microtask
// defer + a cancelled flag) so react-hooks/set-state-in-effect stays satisfied.
//
// The endpoint is gated by @RequiresModule('enrollment'), so a finance-only
// school gets a 402 MODULE_NOT_LICENSED rather than an error — surfaced as
// `notLicensed` so the page can show the same friendly gate panel the Overview
// already has, instead of a red box.
//
// The payload is a whole dashboard and EVERY block is independently nullable
// (only `trend` is always an object). Nothing is defaulted or back-filled here:
// a null block means the server could not honestly compute it, and the card that
// reads it is responsible for saying so. Filling a gap with `{}` in this hook is
// how an empty state turns into a chart of zeros.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { enrollmentApi, isPaymentRequired, isModuleNotLicensed, apiErrorMessage } from '../lib/api.js'

export function useEnrollmentAnalytics(schoolId, periodId, { years = 5, cohortWindow = null } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)
  const [notLicensed, setNotLicensed] = useState(false)

  // `cohortWindow` (the cohort ladder LENGTH) is a request parameter, so changing
  // it refetches — the panel set at four grades is a different set of cohorts,
  // not a filter over one payload, and the server owns which ones exist.
  const load = useCallback(async (sid, pid, yrs, win) => {
    setError('')
    setNotEntitled(false)
    setNotLicensed(false)
    try {
      // periodId is OPTIONAL server-side (it resolves the latest period itself),
      // so a school whose periods have not loaded yet still gets a real answer
      // rather than an empty tab.
      const res = await enrollmentApi.analytics(sid, {
        periodId: pid ?? undefined,
        years: yrs,
        cohortWindow: win ?? undefined,
      })
      setData(res.data ?? res)
    } catch (e) {
      // Order matters: a module-not-licensed 402 is ALSO a payment-required 402.
      if (isModuleNotLicensed(e)) setNotLicensed(true)
      else if (isPaymentRequired(e)) setNotEntitled(true)
      else setError(apiErrorMessage(e, 'Could not load enrollment analytics.'))
      setData(null)
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
        load(schoolId, periodId, years, cohortWindow)
      } else {
        setData(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, periodId, years, cohortWindow, load])

  const reload = useCallback(
    () => (schoolId ? load(schoolId, periodId, years, cohortWindow) : Promise.resolve()),
    [schoolId, periodId, years, cohortWindow, load],
  )

  return { data, loading, error, notEntitled, notLicensed, reload }
}

export default useEnrollmentAnalytics

// ─────────────────────────────────────────────────────────────────────────────
// useCommendations — Phase C: the STRENGTHS surface.
//
// A visiting team writes commendations before recommendations, and KYRO can only
// defend a strength when all three are true at once: the school scored the
// standard highly, the evidence behind it is CURRENT (not merely present, not
// expiring, not undated), and an independently-derived operating figure agrees.
// The server enforces all three; nothing here relaxes them.
//
// ZERO COMMENDATIONS IS A LEGITIMATE AND COMMON ANSWER, so the payload always
// carries `exclusions` — how many standards were eligible, and how many fell out
// at each of the three tests. The panel renders those counts rather than an empty
// box, and never pads the list with a rubric-only "strength".
//
// Fail-soft and gated exactly like useAccreditationSignals: microtask defer +
// cancelled flag + activeSchoolRef stale-school guard, errors resolve to an empty
// payload plus an error string, the module 402 surfaces as notLicensed.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { accreditationApi, isModuleNotLicensed } from '../lib/api.js'

const EMPTY = []

export function useCommendations(schoolId, { enabled = true, frameworkId = null } = {}) {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)

  const activeSchoolRef = useRef(schoolId)
  activeSchoolRef.current = schoolId

  const load = useCallback(
    async (sid) => {
      setError('')
      setNotLicensed(false)
      try {
        const res = await accreditationApi.getCommendations(
          sid,
          frameworkId ? { frameworkId } : {},
        )
        if (activeSchoolRef.current !== sid) return // stale school swap — drop
        setPayload(res.data ?? null)
      } catch (e) {
        if (activeSchoolRef.current !== sid) return
        setPayload(null)
        if (isModuleNotLicensed(e)) setNotLicensed(true)
        else setError('Commendations are unavailable right now.')
      } finally {
        if (activeSchoolRef.current === sid) setLoading(false)
      }
    },
    [frameworkId],
  )

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
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

  // A rubric score, an evidence date or a new operating figure can each create or
  // destroy a commendation, so re-pull on the shared change channel.
  useEffect(() => {
    const onDataChanged = (e) => {
      if (e?.detail?.key === 'accreditation') refresh()
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [refresh])

  return {
    commendations: payload?.commendations ?? EMPTY,
    exclusions: payload?.exclusions ?? null,
    caveat: payload?.caveat ?? '',
    // WHY there are none, when the reason is KYRO's and not the school's: no
    // fiscal period, no saved statements, an unlicensed Finance module. Without
    // it "No favorable figure: 31" reads as a verdict on the school instead of a
    // statement about what we could not value, so it is carried, never dropped.
    signalsUnavailable: payload?.signalsUnavailable ?? null,
    demoData: payload?.demoData ?? false,
    loading,
    error,
    notLicensed,
    refresh,
  }
}

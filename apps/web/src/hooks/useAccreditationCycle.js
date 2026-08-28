// ─────────────────────────────────────────────────────────────────────────────
// useAccreditationCycle — F1 The Journey: the school's six-year cycle payload.
//
// One request per school (re-pulled on framework switch — the cycle anchor is
// per-(school, framework), so a dual-accredited school has one journey per
// register). The server computes EVERYTHING: the phase, the countdown, every
// milestone's state word and threshold sentence, every not-measurable reason.
// The web paints the payload and does no date math beyond formatting.
//
// `configured:false` is a first-class answer, not an error: it carries the
// server's own suggestion (derived from the prior-visit ledger, human-confirmed
// in the setup card, never silently adopted) and the journey tab renders the
// setup card in place of the road.
//
// Fail-soft like every sibling hook (useEvidenceReadiness et al): a cycle hiccup
// must never blank the register. Same await-BEFORE-setState discipline:
// microtask defer + cancelled flag + activeSchoolRef stale-school guard.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { accreditationApi, isModuleNotLicensed } from '../lib/api.js'

export function useAccreditationCycle(schoolId, { enabled = true, frameworkId = null } = {}) {
  const [cycle, setCycle] = useState(null) // null until loaded / fail-soft
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)

  // STALE-RESPONSE GUARD — see useReadinessTrend / useAccreditationSignals.
  const activeSchoolRef = useRef(schoolId)
  activeSchoolRef.current = schoolId

  const load = useCallback(
    async (sid) => {
      setError('')
      setNotLicensed(false)
      try {
        const res = await accreditationApi.getCycle(sid, frameworkId ? { frameworkId } : {})
        if (activeSchoolRef.current !== sid) return // stale school swap — drop
        setCycle(res.data ?? null)
      } catch (e) {
        if (activeSchoolRef.current !== sid) return
        setCycle(null)
        if (isModuleNotLicensed(e)) setNotLicensed(true)
        else setError('Your accreditation cycle is unavailable right now.')
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
      // GATED. The page mounts this hook above its own module gate (hooks cannot
      // sit behind an early return), so without `enabled` a finance-only tenant
      // landing on /accreditation would fire an extra request that 402s.
      if (schoolId && enabled) {
        setLoading(true)
        load(schoolId)
      } else {
        setCycle(null)
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

  /**
   * Write the anchor (owner/accountant only — the server 403s a viewer). The
   * body is passed through verbatim ({ frameworkId, lastReviewDate?,
   * nextReviewDate?, termYears?, targetIndex? }; explicit nulls clear) and the
   * payload is re-pulled so the road repaints from the server's answer, never
   * from an optimistic local copy of the milestone math.
   */
  const save = useCallback(
    async (body) => {
      if (!schoolId) return null
      const res = await accreditationApi.putCycle(schoolId, body)
      await load(schoolId)
      return res.data ?? null
    },
    [schoolId, load],
  )

  // Prior-visit writes change the suggestion AND the progress-report measure;
  // re-pull on the same channel every accreditation surface listens to.
  useEffect(() => {
    const onDataChanged = (e) => {
      if (e?.detail?.key === 'accreditation') refresh()
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [refresh])

  return {
    cycle,
    configured: cycle?.configured === true,
    loading,
    error,
    notLicensed,
    refresh,
    save,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// useVisit — AIC Phase H: the MOCK VISIT read model.
//
// ONE request, one payload, six acts. `GET /schools/:id/accreditation/visit` is
// composed server-side by the single pure composer (`composeMockVisit`), which
// SELECTS and ORDERS and writes no sentence about any finding — so this hook, and
// every component reading it, composes nothing either. Rationales, consequences,
// basis `display` strings, unlock copy, the evidence health sentence, the
// commendation caveat and all six executive-summary segments arrive rendered and
// are printed verbatim.
//
// WHY A SHARED HOOK RATHER THAN A FETCH PER PAGE: three surfaces read this payload
// — the Mock Visit screen, the Board Readiness One-Pager and the Visiting-Team
// Preview. Three fetches would be three chances for one of them to reshape a
// default, and the whole premise of the phase is that the screen, the paper and
// the email say the same thing.
//
// Fail-soft and gated exactly like useAccreditationTwin / useCommendations:
// microtask defer + cancelled flag + an activeSchoolRef stale-school guard, the
// module 402 surfaces as `notLicensed`, a plain 402 as `notEntitled`, and any
// other failure resolves to a null payload plus an error string. It NEVER
// substitutes an empty act for a failed read — an empty Mock Visit and an
// unreachable one are different facts.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { accreditationApi, isModuleNotLicensed, isPaymentRequired } from '../lib/api.js'

const EMPTY_SEGMENTS = []

export function useVisit(schoolId, { enabled = true } = {}) {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)

  const activeSchoolRef = useRef(schoolId)
  activeSchoolRef.current = schoolId

  const load = useCallback(async (sid) => {
    setError('')
    setNotLicensed(false)
    setNotEntitled(false)
    try {
      const res = await accreditationApi.getVisit(sid)
      if (activeSchoolRef.current !== sid) return // stale school swap — drop
      setPayload(res.data ?? null)
    } catch (e) {
      if (activeSchoolRef.current !== sid) return
      setPayload(null)
      // MODULE_NOT_LICENSED is checked FIRST: it is itself a 402, so testing the
      // generic entitlement case first would swallow the upsell every time.
      if (isModuleNotLicensed(e)) setNotLicensed(true)
      else if (isPaymentRequired(e)) setNotEntitled(true)
      else setError('The mock visit is unavailable right now.')
    } finally {
      if (activeSchoolRef.current === sid) setLoading(false)
    }
  }, [])

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

  // Adopting a plan item, dating an artifact or scoring a standard all change what
  // a visiting team would find, so re-pull on the shared change channel like every
  // sibling hook. `improvement` is included because Act 6's draft shrinks the
  // moment an item is adopted (the server drops it from `adoptedKeys`).
  useEffect(() => {
    const onDataChanged = (e) => {
      const key = e?.detail?.key
      if (key === 'accreditation' || key === 'improvement' || key === 'strategy') refresh()
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [refresh])

  const acts = payload?.acts ?? null

  return {
    visit: payload,
    acts,
    // The six acts, named. `acts` is an OBJECT with six fixed keys and never an
    // array — an array invites a caller to filter it, and `unanswered` is the act
    // reviewers try to cut (§2.3, acceptance 6).
    arrival: acts?.arrival ?? null,
    commendations: acts?.commendations ?? null,
    findings: acts?.findings ?? null,
    requests: acts?.requests ?? null,
    unanswered: acts?.unanswered ?? null,
    plan: acts?.plan ?? null,
    // ALWAYS all six segments, in order — the same array the one-pager prints and
    // the narration player speaks.
    summarySegments: payload?.executiveSummary?.segments ?? EMPTY_SEGMENTS,
    disclaimer: payload?.disclaimer ?? '',
    framework: payload?.framework ?? null,
    demoData: payload?.demoData ?? false,
    snapshotAsOf: payload?.snapshotAsOf ?? null,
    generatedAt: payload?.generatedAt ?? null,
    loading,
    error,
    notLicensed,
    notEntitled,
    refresh,
  }
}

export default useVisit

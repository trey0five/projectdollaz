// ─────────────────────────────────────────────────────────────────────────────
// useImprovement — AIC Phase G. The flat, school-scoped, GOAL-AGNOSTIC initiative
// register behind /improvement, plus the server-composed recommendations rail.
//
// Cloned from useStrategy's shape on purpose: the same await-BEFORE-setState
// pattern (microtask defer + a `cancelled` flag) so it is react-hooks
// set-state-in-effect safe, the same `notLicensed` flip on the module 402, the
// same owner-roster fetch in its own guard, and the same "mutate then reload"
// wrappers so a computed rollup can never lag a write.
//
// GATING: /improvement rides on `accreditation` OR `strategy` — there is no
// `improvement` module key and there must not be one. The 402 body therefore names
// `accreditation` in `module` (plus an additive `modules` array), and
// isModuleNotLicensed reads `code`, so the existing helper needs no change.
//
// TWO CALLS, TWO GUARDS. Recommendations are enriched by the accreditation engine
// and can be degraded (no framework adopted, coverage too thin) while the register
// is perfectly healthy — so a failed recommendations call yields an EMPTY RAIL,
// never a blanked page and never a fabricated suggestion.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import {
  improvementApi,
  schoolsApi,
  isModuleNotLicensed,
  isPaymentRequired,
} from '../lib/api.js'

export const EMPTY_COUNTS = {
  planned: 0,
  in_progress: 0,
  blocked: 0,
  done: 0,
  cancelled: 0,
}

// meanProgressPct is deliberately NULL, not 0: "no measured initiative yet" and
// "every measured initiative is at zero" are different facts, and the KPI card
// renders an em dash for the first.
export const EMPTY_SUMMARY = {
  total: 0,
  overdue: 0,
  behind: 0,
  unowned: 0,
  statusOnly: 0,
  meanProgressPct: null,
}

export function useImprovement(schoolId) {
  const [data, setData] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [recommendationsError, setRecommendationsError] = useState(false)
  // WHY the rail is empty, straight from the server. Null = not answered yet.
  const [recommendationsBasis, setRecommendationsBasis] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid) => {
    setError('')
    setNotLicensed(false)
    setNotEntitled(false)
    try {
      const res = await improvementApi.get(sid)
      setData(res.data ?? null)
    } catch (e) {
      if (isModuleNotLicensed(e)) setNotLicensed(true)
      else if (isPaymentRequired(e)) setNotEntitled(true)
      else setError('Could not load your improvement plan.')
      setData(null)
      setRecommendations([])
      setRecommendationsBasis(null)
      setLoading(false)
      return
    }
    // Its own try/catch: a degraded recommendations engine must not blank the
    // register that is loading fine.
    try {
      const rec = await improvementApi.recommendations(sid)
      // The envelope is not frozen in the build contract — accept both the bare
      // array and the { recommendations } wrapper rather than guessing one.
      const list = Array.isArray(rec.data) ? rec.data : (rec.data?.recommendations ?? [])
      setRecommendations(Array.isArray(list) ? list : [])
      // `basis` says WHY an empty rail is empty — nothing left to work, no
      // framework adopted, or no accreditation licence. The rail renders three
      // different sentences and must never claim the first when it means the
      // others. A server that does not send one leaves this null and the rail
      // falls back to the neutral wording.
      setRecommendationsBasis(rec.data?.basis ?? null)
      setRecommendationsError(false)
    } catch {
      setRecommendations([])
      setRecommendationsBasis(null)
      setRecommendationsError(true)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (schoolId) {
        setLoading(true)
        load(schoolId)
      } else {
        setData(null)
        setRecommendations([])
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, load])

  const refresh = useCallback(
    () => (schoolId ? load(schoolId) : Promise.resolve()),
    [schoolId, load],
  )

  // Penny writes initiatives through create_initiative, whose REFRESH keys are
  // BOTH 'strategy' and 'accreditation' — this page shows work from either side,
  // so it listens for both.
  useEffect(() => {
    const onChanged = (e) => {
      const key = e?.detail?.key
      if (key === 'strategy' || key === 'accreditation' || key === 'improvement') refresh()
    }
    window.addEventListener('penny:data-changed', onChanged)
    return () => window.removeEventListener('penny:data-changed', onChanged)
  }, [refresh])

  // Owner-picker roster. Editor-only endpoint; a viewer 403s → keep [] (the forms
  // simply omit the Owner picker), so this never blocks the page.
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (!schoolId) {
        setMembers([])
        return
      }
      schoolsApi
        .members(schoolId)
        .then((res) => {
          if (!cancelled) setMembers(Array.isArray(res.data) ? res.data : (res.data?.members ?? []))
        })
        .catch(() => {
          if (!cancelled) setMembers([])
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId])

  const mutate = useCallback(
    (fn) =>
      async (...args) => {
        if (!schoolId) return undefined
        const r = await fn(...args)
        await load(schoolId)
        return r
      },
    [schoolId, load],
  )

  const updateInitiative = mutate((id, body) => improvementApi.updateInitiative(schoolId, id, body))
  const deleteInitiative = mutate((id) => improvementApi.deleteInitiative(schoolId, id))
  const recordProgress = mutate((id, body) => improvementApi.recordProgress(schoolId, id, body))

  return {
    initiatives: data?.initiatives ?? [],
    counts: data?.counts ?? EMPTY_COUNTS,
    summary: data?.summary ?? EMPTY_SUMMARY,
    dataAsOf: data?.dataAsOf ?? null,
    recommendations,
    recommendationsError,
    recommendationsBasis,
    members,
    loading,
    error,
    notLicensed,
    notEntitled,
    refresh,
    updateInitiative,
    deleteInitiative,
    recordProgress,
  }
}

export default useImprovement

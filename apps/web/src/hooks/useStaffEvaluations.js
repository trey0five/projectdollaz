// ─────────────────────────────────────────────────────────────────────────────
// useStaffEvaluations — AIC Phase F. The staff-evaluation register hook.
// School-scoped (NOT period-scoped). Same await-BEFORE-setState discipline as
// useFacilities / useCommittees (microtask defer + cancelled flag) so it is
// react-hooks/set-state-in-effect safe.
//
// TWO ENDPOINTS, TWO AUDIENCES, ON PURPOSE:
//
//   • /summary  — COUNTS ONLY, readable by owner, accountant AND viewer. It is
//     what the KPI card binds to FOR EVERY ROLE so there is exactly one code path
//     behind the number, and it is the only staff-evaluation figure any surface
//     other than the register is ever given.
//   • the LIST — names people, and is owner/accountant only. A viewer gets 403.
//
// So the list is only REQUESTED when the caller says the role may read it, and a
// 403 is still handled as a first-class, expected answer (`restricted: true`) —
// never an error string, never a crash. The page renders the frozen restriction
// sentence in both cases; there is one sentence and one behaviour whether we
// declined to ask or the server declined to answer.
//
// notLicensed flips on the module 402 (MODULE_NOT_LICENSED, module:'hr') so an
// unlicensed school gets the friendly upsell panel rather than a raw failure.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from 'react'
import { hrApi, isModuleNotLicensed, isPaymentRequired } from '../lib/api.js'

/**
 * The summary for a school that HAS an answer and the answer is nothing.
 *
 * It is reserved for a genuine 200. `summary` is NULL whenever we could not read
 * the register — the distinction the whole signal catalog is built to preserve
 * (`no_data` vs `available` with value 0), and the last surface it could be
 * discarded at. A 500 from /summary used to reset the state to this object while
 * setting `error`, so the /hr KPI card rendered a GREEN ZERO reading "no cycle
 * recorded yet" for a school with seven overdue evaluations — "we could not look"
 * shown as "we looked and it is fine". The error text only appeared in the
 * register panel below, which a viewer never sees at all.
 */
const EMPTY_SUMMARY = {
  total: 0,
  overdue: 0,
  oldestOverdueDays: 0,
  byStatus: {},
  completedLast12m: 0,
}

/** The list envelope is tolerated in either shape (array, or a keyed wrapper). */
function normalizeList(data) {
  if (Array.isArray(data)) return data
  return data?.evaluations ?? data?.items ?? []
}

function isForbidden(err) {
  return err?.response?.status === 403
}

export function useStaffEvaluations(schoolId, { canRead = false } = {}) {
  const [evaluations, setEvaluations] = useState([])
  // null === "we have not read it, or we could not". Never a zero we did not see.
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)
  // The server said 403, or the caller's role is one we already know it will 403.
  const [restricted, setRestricted] = useState(!canRead)

  // Stale-school-swap guard (the useCommendations pattern): a response that comes
  // back after the user switched schools is dropped rather than written.
  const activeSchoolRef = useRef(schoolId)
  activeSchoolRef.current = schoolId

  const load = useCallback(async (sid, mayRead) => {
    setError('')
    setNotLicensed(false)
    setNotEntitled(false)
    setRestricted(!mayRead)
    try {
      // The summary is the ONE request every role makes. The list rides along only
      // when the role may read it — we do not fire a request we know 403s.
      const [sres, lres] = await Promise.all([
        hrApi.getStaffEvaluationSummary(sid),
        mayRead
          ? hrApi.listStaffEvaluations(sid).catch((e) => {
              if (isForbidden(e)) return { data: null, forbidden: true }
              throw e
            })
          : Promise.resolve({ data: null, forbidden: true }),
      ])
      if (activeSchoolRef.current !== sid) return
      setSummary(sres.data ?? EMPTY_SUMMARY)
      if (lres?.forbidden) {
        setRestricted(true)
        setEvaluations([])
      } else {
        setEvaluations(normalizeList(lres?.data))
      }
    } catch (e) {
      if (activeSchoolRef.current !== sid) return
      setEvaluations([])
      // NOT EMPTY_SUMMARY. We did not read the register, so we have no count to
      // publish, and a zero here is indistinguishable from a clean register.
      setSummary(null)
      if (isModuleNotLicensed(e)) setNotLicensed(true)
      else if (isPaymentRequired(e)) setNotEntitled(true)
      else if (isForbidden(e)) setRestricted(true)
      else setError('Could not load your staff-evaluation register.')
    } finally {
      if (activeSchoolRef.current === sid) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (schoolId) {
        setLoading(true)
        load(schoolId, canRead)
      } else {
        setEvaluations([])
        setSummary(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, canRead, load])

  const refresh = useCallback(
    () => (schoolId ? load(schoolId, canRead) : Promise.resolve()),
    [schoolId, canRead, load],
  )

  const createEvaluation = useCallback(
    async (body) => {
      if (!schoolId) return
      await hrApi.createStaffEvaluation(schoolId, body)
      await load(schoolId, canRead)
    },
    [schoolId, canRead, load],
  )

  const updateEvaluation = useCallback(
    async (evaluationId, body) => {
      if (!schoolId) return
      await hrApi.updateStaffEvaluation(schoolId, evaluationId, body)
      await load(schoolId, canRead)
    },
    [schoolId, canRead, load],
  )

  const removeEvaluation = useCallback(
    async (evaluationId) => {
      if (!schoolId) return
      await hrApi.removeStaffEvaluation(schoolId, evaluationId)
      await load(schoolId, canRead)
    },
    [schoolId, canRead, load],
  )

  return {
    evaluations,
    summary,
    loading,
    error,
    notLicensed,
    notEntitled,
    restricted,
    refresh,
    createEvaluation,
    updateEvaluation,
    removeEvaluation,
  }
}

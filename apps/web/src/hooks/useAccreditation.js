// ─────────────────────────────────────────────────────────────────────────────
// useAccreditation — Phase 4 Accreditation v1 (the Standards + Evidence register).
// School-scoped (NOT period-scoped). Same await-BEFORE-setState pattern as
// usePolicies (microtask defer + cancelled flag) so it is react-hooks/set-state-in-
// effect safe.
//
// notLicensed flips true on the module 402 (MODULE_NOT_LICENSED) so a finance-only
// school that direct-navigates to /accreditation sees a friendly "add the module"
// panel rather than a raw crash. Evidence is loaded LAZILY per expanded standard
// (listEvidence/createEvidence/removeEvidence) so the list stays cheap.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from 'react'
import { accreditationApi, isModuleNotLicensed, isPaymentRequired } from '../lib/api.js'

const EMPTY_RATING_SUMMARY = {
  leafCount: 0,
  metCount: 0,
  partiallyMetCount: 0,
  notMetCount: 0,
  notStartedCount: 0,
  ratingCoveragePct: 0,
}

// The chosen readiness target index (e.g. 280 "Accredited" / 320 "Merit") persists
// per school so the hero remembers your ambition across sessions.
const targetKey = (sid) => `accreditation.readinessTarget.${sid}`
function readStoredTarget(sid) {
  try {
    const raw = window.localStorage.getItem(targetKey(sid))
    const n = raw == null ? NaN : Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function useAccreditation(schoolId) {
  const [standards, setStandards] = useState([])
  const [summary, setSummary] = useState({ total: 0, withEvidence: 0, gaps: 0, pctCovered: 0 })
  const [ratingSummary, setRatingSummary] = useState(EMPTY_RATING_SUMMARY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)
  // ── Phase 3 additive state: rubric readiness + framework catalog ────────────
  const [readiness, setReadiness] = useState(null) // null until loaded / fail-soft
  const [frameworks, setFrameworks] = useState(null) // null = not yet fetched

  // STALE-RESPONSE GUARD: on a rapid school swap the previous school's in-flight
  // responses can resolve LAST and pin its data on the new school's page (a
  // cross-tenant display mix-up). Every awaited setter below checks that the sid
  // it fetched for is still the active schoolId before writing state.
  const activeSchoolRef = useRef(schoolId)
  activeSchoolRef.current = schoolId

  // WHICH FRAMEWORK THIS PAGE IS READING. Null = let the server pick (the
  // dominant one — most linked standards), which is what every read did before
  // and what a single-accreditation school still gets.
  //
  // A school may hold several accreditations at once, and the register has always
  // been able to carry both; what it could not do was SAY which one the scored
  // surfaces described, or let you look at the other. This is that choice, owned
  // by the page and handed to every panel, so the hero, the evidence table, the
  // signals and the trend can never be describing different frameworks.
  const [frameworkId, setFrameworkId] = useState(null)

  // Fail-soft readiness pull — a readiness hiccup must never blank the register.
  const loadReadiness = useCallback(async (sid, targetOverride, fwId) => {
    try {
      const target = targetOverride !== undefined ? targetOverride : readStoredTarget(sid)
      const res = await accreditationApi.getReadiness(sid, {
        ...(target != null ? { target } : {}),
        ...(fwId ? { frameworkId: fwId } : {}),
      })
      if (activeSchoolRef.current !== sid) return // stale school swap — drop
      setReadiness(res.data ?? null)
    } catch {
      if (activeSchoolRef.current !== sid) return
      setReadiness(null)
    }
  }, [])

  // The selection must reach loadReadiness WITHOUT joining its dependency array —
  // `load` is depended on by the mount effect, so a changing identity there would
  // re-run the entire register fetch on every switch.
  const frameworkIdRef = useRef(null)
  frameworkIdRef.current = frameworkId

  const load = useCallback(async (sid) => {
    setError('')
    setNotLicensed(false)
    setNotEntitled(false)
    try {
      const [res] = await Promise.all([
        accreditationApi.listStandards(sid),
        loadReadiness(sid, undefined, frameworkIdRef.current), // self-catching
      ])
      if (activeSchoolRef.current !== sid) return // stale school swap — drop
      setStandards(res.data?.standards ?? [])
      setSummary(res.data?.summary ?? { total: 0, withEvidence: 0, gaps: 0, pctCovered: 0 })
      setRatingSummary(res.data?.ratingSummary ?? EMPTY_RATING_SUMMARY)
    } catch (e) {
      if (activeSchoolRef.current !== sid) return // stale school swap — drop
      if (isModuleNotLicensed(e)) {
        setNotLicensed(true)
        setStandards([])
        setRatingSummary(EMPTY_RATING_SUMMARY)
      } else if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setStandards([])
        setRatingSummary(EMPTY_RATING_SUMMARY)
      } else {
        setError('Could not load your accreditation standards.')
        setStandards([])
        setRatingSummary(EMPTY_RATING_SUMMARY)
      }
    } finally {
      setLoading(false)
    }
  }, [loadReadiness])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (schoolId) {
        setLoading(true)
        load(schoolId)
      } else {
        setStandards([])
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

  // Penny confirm-then-create: a create_standard apply broadcasts 'penny:data-changed'
  // with key 'accreditation'; re-pull the list so a standard Penny just created shows up
  // without a manual reload (mirrors useTasks/useDocuments).
  useEffect(() => {
    const onDataChanged = (e) => {
      if (e?.detail?.key === 'accreditation') refresh()
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [refresh])

  const createStandard = useCallback(
    async (body) => {
      if (!schoolId) return
      await accreditationApi.createStandard(schoolId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const updateStandard = useCallback(
    async (standardId, body) => {
      if (!schoolId) return
      await accreditationApi.updateStandard(schoolId, standardId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const removeStandard = useCallback(
    async (standardId) => {
      if (!schoolId) return
      await accreditationApi.removeStandard(schoolId, standardId)
      await load(schoolId)
    },
    [schoolId, load],
  )

  // Discover the school's operational artifacts (policies + board reports) that can be
  // attached as evidence. Called lazily from the "Attach from operations" click handler.
  const listEvidenceSources = useCallback(async () => {
    if (!schoolId) return { policies: [], boardReports: [] }
    const res = await accreditationApi.listEvidenceSources(schoolId)
    return res.data ?? { policies: [], boardReports: [] }
  }, [schoolId])

  // Lazy evidence ops — the page calls these when a standard row is expanded.
  const listEvidence = useCallback(
    async (standardId) => {
      if (!schoolId) return []
      const res = await accreditationApi.listEvidence(schoolId, standardId)
      return res.data?.evidence ?? []
    },
    [schoolId],
  )

  const createEvidence = useCallback(
    async (standardId, body) => {
      if (!schoolId) return
      await accreditationApi.createEvidence(schoolId, standardId, body)
      await load(schoolId) // refresh coverage counts
    },
    [schoolId, load],
  )

  const updateEvidence = useCallback(
    async (standardId, evidenceId, body) => {
      if (!schoolId) return
      await accreditationApi.updateEvidence(schoolId, standardId, evidenceId, body)
      await load(schoolId) // refresh coverage counts + any linkage change
    },
    [schoolId, load],
  )

  const removeEvidence = useCallback(
    async (standardId, evidenceId) => {
      if (!schoolId) return
      await accreditationApi.removeEvidence(schoolId, standardId, evidenceId)
      await load(schoolId)
    },
    [schoolId, load],
  )

  // ── Phase 3: framework catalog + rubric readiness ──────────────────────────
  // Lazy framework list (fetched when the adopt modal opens). Fail-soft to [].
  const loadFrameworks = useCallback(async () => {
    if (!schoolId) return []
    try {
      const res = await accreditationApi.listFrameworks(schoolId)
      const list = res.data?.frameworks ?? []
      setFrameworks(list)
      return list
    } catch {
      setFrameworks([])
      return []
    }
  }, [schoolId])

  // Adopt (or re-adopt — idempotent, fills gaps) a framework into the register.
  const adoptFramework = useCallback(
    async (code) => {
      if (!schoolId) return
      await accreditationApi.adoptFramework(schoolId, code)
      await Promise.all([load(schoolId), loadFrameworks()])
    },
    [schoolId, load, loadFrameworks],
  )

  // Pick a readiness target index (persisted per school); null reverts to the
  // framework's defaultTarget server-side.
  const setReadinessTarget = useCallback(
    async (target) => {
      if (!schoolId) return
      try {
        if (target == null) window.localStorage.removeItem(targetKey(schoolId))
        else window.localStorage.setItem(targetKey(schoolId), String(target))
      } catch {
        /* private mode — target just won't persist */
      }
      await loadReadiness(schoolId, target, frameworkIdRef.current)
    },
    [schoolId, loadReadiness],
  )

  /**
   * Switch which adopted framework this page reads. Re-pulls readiness ONLY —
   * the register itself is framework-agnostic (it holds every adopted standard,
   * always), so a switch must not blank and refetch the list the user is
   * looking at. Passing null hands the choice back to the server's dominance rule.
   */
  const selectFramework = useCallback(
    async (nextId) => {
      const id = nextId || null
      setFrameworkId(id)
      frameworkIdRef.current = id
      if (schoolId) await loadReadiness(schoolId, undefined, id)
    },
    [schoolId, loadReadiness],
  )

  // Self-score one standard on the 1–4 rubric (null clears). Optimistic paint,
  // then the authoritative reload refreshes rollups + readiness (or reverts on error).
  const setRubric = useCallback(
    async (standardId, score) => {
      if (!schoolId) return
      setStandards((rows) =>
        rows.map((s) => (s.id === standardId ? { ...s, rubricScore: score } : s)),
      )
      try {
        await accreditationApi.updateStandard(schoolId, standardId, { rubricScore: score })
      } finally {
        await load(schoolId)
      }
    },
    [schoolId, load],
  )

  // Deterministic evidence suggestions for one standard (catalog tag matching).
  const fetchSuggestions = useCallback(
    async (standardId) => {
      if (!schoolId) return []
      const res = await accreditationApi.getSuggestions(schoolId, standardId)
      return res.data?.suggestions ?? []
    },
    [schoolId],
  )

  // Bind / clear a standard's strategy link (plan or goal). Passing a null type
  // clears both fields (the API contract's explicit-null clear).
  const linkStrategy = useCallback(
    async (standardId, type, ref) => {
      if (!schoolId) return
      await accreditationApi.updateStandard(
        schoolId,
        standardId,
        type
          ? { strategySourceType: type, strategySourceRef: ref }
          : { strategySourceType: null, strategySourceRef: null },
      )
      await load(schoolId)
    },
    [schoolId, load],
  )

  return {
    standards,
    summary,
    ratingSummary,
    loading,
    error,
    notLicensed,
    notEntitled,
    refresh,
    createStandard,
    updateStandard,
    removeStandard,
    listEvidenceSources,
    listEvidence,
    createEvidence,
    updateEvidence,
    removeEvidence,
    // Phase 3 additive surface
    readiness,
    // The page's framework selection. `frameworkId` is null until the user
    // chooses; `readiness.framework.id` is what the server actually resolved,
    // and is what the switcher should show as active.
    frameworkId,
    selectFramework,
    frameworks,
    loadFrameworks,
    adoptFramework,
    setReadinessTarget,
    setRubric,
    fetchSuggestions,
    linkStrategy,
  }
}

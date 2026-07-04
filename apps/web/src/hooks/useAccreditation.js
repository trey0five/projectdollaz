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
import { useState, useEffect, useCallback } from 'react'
import { accreditationApi, isModuleNotLicensed, isPaymentRequired } from '../lib/api.js'

const EMPTY_RATING_SUMMARY = {
  leafCount: 0,
  metCount: 0,
  partiallyMetCount: 0,
  notMetCount: 0,
  notStartedCount: 0,
  ratingCoveragePct: 0,
}

export function useAccreditation(schoolId) {
  const [standards, setStandards] = useState([])
  const [summary, setSummary] = useState({ total: 0, withEvidence: 0, gaps: 0, pctCovered: 0 })
  const [ratingSummary, setRatingSummary] = useState(EMPTY_RATING_SUMMARY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid) => {
    setError('')
    setNotLicensed(false)
    setNotEntitled(false)
    try {
      const res = await accreditationApi.listStandards(sid)
      setStandards(res.data?.standards ?? [])
      setSummary(res.data?.summary ?? { total: 0, withEvidence: 0, gaps: 0, pctCovered: 0 })
      setRatingSummary(res.data?.ratingSummary ?? EMPTY_RATING_SUMMARY)
    } catch (e) {
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
  }, [])

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
  }
}

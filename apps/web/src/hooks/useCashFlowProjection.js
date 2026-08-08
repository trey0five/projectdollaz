// ─────────────────────────────────────────────────────────────────────────────
// useCashFlowProjection — the forward cash view.
//
// PROJECTING IS A WRITE and this hook does not hide that. Every run is frozen
// server-side so a forecast can be compared against the actual later, so the
// projection is requested explicitly rather than fired on every render: a hook
// that re-projected on each mount would fill the archive with duplicates and make
// the eventual back-test meaningless.
//
// Same await-BEFORE-setState discipline as the rest of this app — microtask
// defer, cancelled flag, and an activeSchoolRef so a rapid school swap can never
// let the previous tenant's cash position land on the new school's screen.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { cashFlowApi, isModuleNotLicensed } from '../lib/api.js'

export function useCashFlowProjection(schoolId, { enabled = true } = {}) {
  const [opening, setOpening] = useState(null)
  const [assumptions, setAssumptions] = useState(null)
  const [commitments, setCommitments] = useState([])
  const [projection, setProjection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [projecting, setProjecting] = useState(false)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)

  const activeSchoolRef = useRef(schoolId)
  activeSchoolRef.current = schoolId

  const load = useCallback(async (sid) => {
    setError('')
    setNotLicensed(false)
    try {
      const [o, a, c] = await Promise.all([
        cashFlowApi.getOpening(sid),
        cashFlowApi.getAssumptions(sid),
        cashFlowApi.listCommitments(sid),
      ])
      if (activeSchoolRef.current !== sid) return // stale school swap — drop
      setOpening(o.data ?? null)
      setAssumptions(a.data ?? null)
      setCommitments(c.data?.commitments ?? [])
    } catch (e) {
      if (activeSchoolRef.current !== sid) return
      if (isModuleNotLicensed(e)) setNotLicensed(true)
      else setError('Could not load your cash forecast settings.')
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
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, enabled, load])

  const project = useCallback(
    async (body) => {
      if (!schoolId) return null
      setProjecting(true)
      setError('')
      try {
        const res = await cashFlowApi.project(schoolId, body)
        if (activeSchoolRef.current !== schoolId) return null
        setProjection(res.data ?? null)
        // The opening view carries the age of the stated balance; a fresh run
        // has just restated it, so re-read rather than leaving a stale "keyed 34
        // days ago" beside a balance keyed a second ago.
        cashFlowApi
          .getOpening(schoolId)
          .then((o) => {
            if (activeSchoolRef.current === schoolId) setOpening(o.data ?? null)
          })
          .catch(() => {})
        return res.data ?? null
      } catch {
        if (activeSchoolRef.current === schoolId) {
          setError('Could not build the forecast. Please try again.')
        }
        return null
      } finally {
        if (activeSchoolRef.current === schoolId) setProjecting(false)
      }
    },
    [schoolId],
  )

  const saveAssumptions = useCallback(
    async (body) => {
      if (!schoolId) return null
      const res = await cashFlowApi.saveAssumptions(schoolId, body)
      setAssumptions(res.data ?? null)
      return res.data ?? null
    },
    [schoolId],
  )

  const addCommitment = useCallback(
    async (body) => {
      if (!schoolId) return null
      const res = await cashFlowApi.createCommitment(schoolId, body)
      const list = await cashFlowApi.listCommitments(schoolId)
      setCommitments(list.data?.commitments ?? [])
      return res.data ?? null
    },
    [schoolId],
  )

  const removeCommitment = useCallback(
    async (id) => {
      if (!schoolId) return
      await cashFlowApi.removeCommitment(schoolId, id)
      const list = await cashFlowApi.listCommitments(schoolId)
      setCommitments(list.data?.commitments ?? [])
    },
    [schoolId],
  )

  return {
    opening,
    assumptions,
    commitments,
    projection,
    loading,
    projecting,
    error,
    notLicensed,
    project,
    saveAssumptions,
    addCommitment,
    removeCommitment,
    refresh: () => (schoolId ? load(schoolId) : Promise.resolve()),
  }
}

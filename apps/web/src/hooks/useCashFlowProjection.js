// ─────────────────────────────────────────────────────────────────────────────
// useCashFlowProjection — the forward cash view.
//
// PROJECTING IS A WRITE and this hook does not hide that. Every run is frozen
// server-side so a forecast can be compared against the actual later, so the
// projection is requested explicitly rather than fired on every render: a hook
// that re-projected on each mount would fill the archive with duplicates and make
// the eventual back-test meaningless.
//
// The ONE mount-time exception is REHYDRATION: when a school already has a built
// forecast (opening.openingCash != null), the page restores it once per mount as
// a persist:false PREVIEW — a re-read of the last built state, never a new
// frozen run — so returning to the page lands on the forecast, not the setup
// screen. The "projecting is a write" rule still holds for persisted builds:
// only the explicit Build/Rebuild click freezes a run into the archive.
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
  const [adjustments, setAdjustments] = useState([])
  const [projection, setProjection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [projecting, setProjecting] = useState(false)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)

  const activeSchoolRef = useRef(schoolId)
  activeSchoolRef.current = schoolId

  // The last body sent to project() — so a mutation (a new commitment, a flipped
  // include switch) can re-run the SAME projection as a persist:false preview.
  const lastBodyRef = useRef(null)

  // The adjustments endpoint ships with the flows upgrade; an older API image
  // simply doesn't have it. Its absence degrades to "no adjustments" — never an
  // error on a page that otherwise works.
  const refreshAdjustments = useCallback(async (sid) => {
    try {
      const r = await cashFlowApi.listAdjustments(sid)
      if (activeSchoolRef.current === sid) setAdjustments(r.data?.adjustments ?? [])
    } catch {
      /* endpoint not there yet (old API) — leave whatever we have */
    }
  }, [])

  const load = useCallback(
    async (sid) => {
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
        refreshAdjustments(sid) // fire-and-forget; self-degrading
      } catch (e) {
        if (activeSchoolRef.current !== sid) return
        if (isModuleNotLicensed(e)) setNotLicensed(true)
        else setError('Could not load your cash forecast settings.')
      } finally {
        if (activeSchoolRef.current === sid) setLoading(false)
      }
    },
    [refreshAdjustments],
  )

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
      lastBodyRef.current = body
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

  // Re-run the LAST projection as a preview. persist:false is the archive
  // discipline: only the explicit "Build forecast" click freezes a run, so a
  // burst of toggles and edits can never fill the archive with duplicates.
  const reproject = useCallback(() => {
    if (!lastBodyRef.current) return Promise.resolve(null)
    return project({ ...lastBodyRef.current, persist: false })
  }, [project])

  // Toggle-driven re-projections are DEBOUNCED (~500ms): each switch flip saves
  // its adjustment immediately, but a run of quick flips coalesces into one
  // rebuild — one shimmer, one redraw, one set of tile tweens.
  const reprojectTimerRef = useRef(null)
  const scheduleReproject = useCallback(() => {
    if (reprojectTimerRef.current) clearTimeout(reprojectTimerRef.current)
    reprojectTimerRef.current = setTimeout(() => {
      reprojectTimerRef.current = null
      reproject()
    }, 500)
  }, [reproject])
  useEffect(
    () => () => {
      if (reprojectTimerRef.current) clearTimeout(reprojectTimerRef.current)
    },
    [],
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

  const updateCommitment = useCallback(
    async (id, body) => {
      if (!schoolId) return null
      const res = await cashFlowApi.updateCommitment(schoolId, id, body)
      const list = await cashFlowApi.listCommitments(schoolId)
      if (activeSchoolRef.current === schoolId) setCommitments(list.data?.commitments ?? [])
      return res.data ?? null
    },
    [schoolId],
  )

  // Save (or clear) a line adjustment, then schedule a preview rebuild. These
  // THROW on failure so the caller's optimistic switch can revert.
  const setAdjustment = useCallback(
    async (body) => {
      if (!schoolId) return null
      const res = await cashFlowApi.saveAdjustment(schoolId, body)
      refreshAdjustments(schoolId)
      scheduleReproject()
      return res.data ?? null
    },
    [schoolId, refreshAdjustments, scheduleReproject],
  )

  const clearAdjustment = useCallback(
    async (id) => {
      if (!schoolId) return
      await cashFlowApi.removeAdjustment(schoolId, id)
      refreshAdjustments(schoolId)
      scheduleReproject()
    },
    [schoolId, refreshAdjustments, scheduleReproject],
  )

  return {
    opening,
    assumptions,
    commitments,
    adjustments,
    projection,
    // The per-source-line breakdown of the CURRENT projection. Absent (null) on
    // responses from an API image that predates flows — the page renders the
    // QuickBooks group as an empty state with a note, never crashes.
    flows: projection?.flows ?? null,
    loading,
    projecting,
    error,
    notLicensed,
    project,
    reproject,
    saveAssumptions,
    addCommitment,
    updateCommitment,
    removeCommitment,
    setAdjustment,
    clearAdjustment,
    refresh: () => (schoolId ? load(schoolId) : Promise.resolve()),
  }
}

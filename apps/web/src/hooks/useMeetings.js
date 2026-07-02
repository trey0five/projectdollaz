// ─────────────────────────────────────────────────────────────────────────────
// useMeetings — Phase 3 Governance depth (the Meeting register). School-scoped.
// Mirrors usePolicies: await-BEFORE-setState (microtask defer + cancelled flag).
// Exposes `summary` (the aggregate signal) and an `approveMinutes(id)` action that
// PATCHes the server-owned approval fields then reloads. notLicensed flips on the
// module 402 (MODULE_NOT_LICENSED).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { meetingsApi, isModuleNotLicensed, isPaymentRequired } from '../lib/api.js'

const EMPTY_SUMMARY = {
  total: 0,
  upcomingCount: 0,
  agendaMissingSoonCount: 0,
  minutesPendingCount: 0,
  minutesOverdueCount: 0,
  nextMeetingAt: null,
  earliestMinutesPendingHeldAt: null,
}

export function useMeetings(schoolId) {
  const [meetings, setMeetings] = useState([])
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid) => {
    setError('')
    setNotLicensed(false)
    setNotEntitled(false)
    try {
      const res = await meetingsApi.list(sid)
      setMeetings(res.data?.meetings ?? [])
      setSummary(res.data?.summary ?? EMPTY_SUMMARY)
    } catch (e) {
      if (isModuleNotLicensed(e)) {
        setNotLicensed(true)
        setMeetings([])
        setSummary(EMPTY_SUMMARY)
      } else if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setMeetings([])
        setSummary(EMPTY_SUMMARY)
      } else {
        setError('Could not load your meetings.')
        setMeetings([])
        setSummary(EMPTY_SUMMARY)
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
        setMeetings([])
        setSummary(EMPTY_SUMMARY)
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

  const create = useCallback(
    async (body) => {
      if (!schoolId) return
      await meetingsApi.create(schoolId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const update = useCallback(
    async (meetingId, body) => {
      if (!schoolId) return
      await meetingsApi.update(schoolId, meetingId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const remove = useCallback(
    async (meetingId) => {
      if (!schoolId) return
      await meetingsApi.remove(schoolId, meetingId)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const approveMinutes = useCallback(
    async (meetingId) => {
      if (!schoolId) return
      await meetingsApi.approveMinutes(schoolId, meetingId)
      await load(schoolId)
    },
    [schoolId, load],
  )

  return {
    meetings,
    summary,
    loading,
    error,
    notLicensed,
    notEntitled,
    refresh,
    create,
    update,
    remove,
    approveMinutes,
  }
}

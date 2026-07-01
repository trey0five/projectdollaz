// ─────────────────────────────────────────────────────────────────────────────
// useFacilities — Phase 4 Facilities v1 (the deferred-maintenance register).
// School-scoped (NOT period-scoped). Same await-BEFORE-setState pattern as
// useAccreditation (microtask defer + cancelled flag) so it is react-hooks/set-
// state-in-effect safe.
//
// notLicensed flips true on the module 402 (MODULE_NOT_LICENSED) so a finance-only
// school that direct-navigates to /facilities sees a friendly "add the module"
// panel rather than a raw crash. Single flat resource (no lazy sub-resource).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { facilitiesApi, isModuleNotLicensed, isPaymentRequired } from '../lib/api.js'

const EMPTY_SUMMARY = {
  total: 0,
  openCount: 0,
  highPriorityOpenCount: 0,
  criticalOpen: 0,
  overdueOpen: 0,
  backlogCost: 0,
}

export function useFacilities(schoolId) {
  const [items, setItems] = useState([])
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
      const res = await facilitiesApi.listMaintenance(sid)
      setItems(res.data?.items ?? [])
      setSummary(res.data?.summary ?? EMPTY_SUMMARY)
    } catch (e) {
      if (isModuleNotLicensed(e)) {
        setNotLicensed(true)
        setItems([])
      } else if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setItems([])
      } else {
        setError('Could not load your maintenance register.')
        setItems([])
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
        setItems([])
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

  const createItem = useCallback(
    async (body) => {
      if (!schoolId) return
      await facilitiesApi.createMaintenance(schoolId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const updateItem = useCallback(
    async (itemId, body) => {
      if (!schoolId) return
      await facilitiesApi.updateMaintenance(schoolId, itemId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const removeItem = useCallback(
    async (itemId) => {
      if (!schoolId) return
      await facilitiesApi.removeMaintenance(schoolId, itemId)
      await load(schoolId)
    },
    [schoolId, load],
  )

  return {
    items,
    summary,
    loading,
    error,
    notLicensed,
    notEntitled,
    refresh,
    createItem,
    updateItem,
    removeItem,
  }
}

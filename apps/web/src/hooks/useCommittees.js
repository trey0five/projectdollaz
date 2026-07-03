// ─────────────────────────────────────────────────────────────────────────────
// useCommittees — Phase 3 Governance depth (the Committee register). School-scoped.
// Mirrors usePolicies: await-BEFORE-setState (microtask defer + cancelled flag) so
// it is react-hooks/set-state-in-effect safe. notLicensed flips on the module 402
// (MODULE_NOT_LICENSED) so an unlicensed school sees the "add the module" panel.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { committeesApi, isModuleNotLicensed, isPaymentRequired } from '../lib/api.js'

export function useCommittees(schoolId) {
  const [committees, setCommittees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid) => {
    setError('')
    setNotLicensed(false)
    setNotEntitled(false)
    try {
      const res = await committeesApi.list(sid)
      setCommittees(res.data?.committees ?? [])
    } catch (e) {
      if (isModuleNotLicensed(e)) {
        setNotLicensed(true)
        setCommittees([])
      } else if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setCommittees([])
      } else {
        setError('Could not load your committees.')
        setCommittees([])
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
        setCommittees([])
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

  // Penny confirm-then-create: a governance-module apply broadcasts 'penny:data-changed'
  // with key 'governance'; re-pull the list so a committee Penny just created shows up
  // without a manual reload (mirrors useTasks/useDocuments).
  useEffect(() => {
    const onDataChanged = (e) => {
      if (e?.detail?.key === 'governance') refresh()
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [refresh])

  const create = useCallback(
    async (body) => {
      if (!schoolId) return
      await committeesApi.create(schoolId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const update = useCallback(
    async (committeeId, body) => {
      if (!schoolId) return
      await committeesApi.update(schoolId, committeeId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const remove = useCallback(
    async (committeeId) => {
      if (!schoolId) return
      await committeesApi.remove(schoolId, committeeId)
      await load(schoolId)
    },
    [schoolId, load],
  )

  return { committees, loading, error, notLicensed, notEntitled, refresh, create, update, remove }
}

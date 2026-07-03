// ─────────────────────────────────────────────────────────────────────────────
// usePolicies — Phase 3 Governance v1 (the Policy Register). School-scoped (NOT
// period-scoped). Same await-BEFORE-setState pattern as useCompliance (microtask
// defer + cancelled flag) so it is react-hooks/set-state-in-effect safe.
//
// notLicensed flips true when the API returns the module 402 (MODULE_NOT_LICENSED)
// so a finance-only school that direct-navigates to /governance sees a friendly
// "add the module" panel rather than a raw crash. Mutations call the API then
// re-load the list.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { policiesApi, isModuleNotLicensed, isPaymentRequired } from '../lib/api.js'

export function usePolicies(schoolId) {
  const [policies, setPolicies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid) => {
    setError('')
    setNotLicensed(false)
    setNotEntitled(false)
    try {
      const res = await policiesApi.list(sid)
      setPolicies(res.data?.policies ?? [])
    } catch (e) {
      if (isModuleNotLicensed(e)) {
        setNotLicensed(true)
        setPolicies([])
      } else if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setPolicies([])
      } else {
        setError('Could not load your policies.')
        setPolicies([])
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
        setPolicies([])
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

  // Penny confirm-then-create: a create_policy/create_committee/create_meeting apply
  // broadcasts 'penny:data-changed' with key 'governance'; re-pull the list so a record
  // Penny just created shows up without a manual reload (mirrors useTasks/useDocuments).
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
      await policiesApi.create(schoolId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const update = useCallback(
    async (policyId, body) => {
      if (!schoolId) return
      await policiesApi.update(schoolId, policyId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const remove = useCallback(
    async (policyId) => {
      if (!schoolId) return
      await policiesApi.remove(schoolId, policyId)
      await load(schoolId)
    },
    [schoolId, load],
  )

  return {
    policies,
    loading,
    error,
    notLicensed,
    notEntitled,
    refresh,
    create,
    update,
    remove,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// usePeople — Governance Phase 2 (the People roster: board / finance team /
// staff). School-scoped. Mirrors useCommittees: await-BEFORE-setState (microtask
// defer + cancelled flag) so it is react-hooks/set-state-in-effect safe.
// notLicensed flips on the module 402 (MODULE_NOT_LICENSED) so an unlicensed
// school sees the "add the module" panel. The list is loaded UNFILTERED — the
// page's group pills filter client-side (the API also accepts ?group=&active=
// for other callers via governancePeopleApi.list params).
// getDetail(personId) fetches the PersonDetail shape (memberships + documents).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { governancePeopleApi, isModuleNotLicensed, isPaymentRequired } from '../lib/api.js'

/** The contract returns PersonPublic[] — tolerate an { people: [...] } wrapper. */
function normalizeList(data) {
  if (Array.isArray(data)) return data
  return data?.people ?? []
}

export function usePeople(schoolId) {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid) => {
    setError('')
    setNotLicensed(false)
    setNotEntitled(false)
    try {
      const res = await governancePeopleApi.list(sid)
      setPeople(normalizeList(res.data))
    } catch (e) {
      if (isModuleNotLicensed(e)) {
        setNotLicensed(true)
        setPeople([])
      } else if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setPeople([])
      } else {
        setError('Could not load your people.')
        setPeople([])
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
        setPeople([])
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

  // Penny confirm-then-create: governance-module applies broadcast
  // 'penny:data-changed' with key 'governance' — re-pull so a person created via
  // the wizard/Penny shows up without a manual reload (mirrors useCommittees).
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
      await governancePeopleApi.create(schoolId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const update = useCallback(
    async (personId, body) => {
      if (!schoolId) return
      await governancePeopleApi.update(schoolId, personId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const remove = useCallback(
    async (personId) => {
      if (!schoolId) return
      await governancePeopleApi.remove(schoolId, personId)
      await load(schoolId)
    },
    [schoolId, load],
  )

  /** PersonDetail (PersonPublic + memberships[] + documents[]) — resolves data. */
  const getDetail = useCallback(
    async (personId) => {
      if (!schoolId) return null
      const res = await governancePeopleApi.get(schoolId, personId)
      return res.data ?? null
    },
    [schoolId],
  )

  return {
    people,
    loading,
    error,
    notLicensed,
    notEntitled,
    refresh,
    create,
    update,
    remove,
    getDetail,
  }
}

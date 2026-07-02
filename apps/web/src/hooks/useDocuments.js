// ─────────────────────────────────────────────────────────────────────────────
// useDocuments — Phase 4 Knowledge document store (CORE). School-scoped. Same
// await-BEFORE-setState pattern (microtask defer + cancelled flag) as useAdvancement,
// so it is react-hooks/set-state-in-effect safe.
//
// notConfigured flips true when the API returns 503 (storage not configured) on an
// upload/download — the page then shows "Document storage isn't configured yet" while
// the list still renders. There is NO module gate (CORE), so no notLicensed path.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { documentsApi, isPaymentRequired } from '../lib/api.js'

function is503(err) {
  return err?.response?.status === 503
}

export function useDocuments(schoolId) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)

  const load = useCallback(async (sid) => {
    setError('')
    setNotEntitled(false)
    try {
      const res = await documentsApi.list(sid)
      setItems(res.data?.documents ?? [])
      setTotal(res.data?.total ?? 0)
    } catch (e) {
      if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setItems([])
        setTotal(0)
      } else {
        setError('Could not load your documents.')
        setItems([])
        setTotal(0)
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
        setTotal(0)
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

  const upload = useCallback(
    async (formData) => {
      if (!schoolId) return
      setNotConfigured(false)
      try {
        await documentsApi.upload(schoolId, formData)
      } catch (e) {
        if (is503(e)) {
          setNotConfigured(true)
        }
        throw e
      }
      await load(schoolId)
    },
    [schoolId, load],
  )

  const remove = useCallback(
    async (id) => {
      if (!schoolId) return
      await documentsApi.remove(schoolId, id)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const updateMeta = useCallback(
    async (id, body) => {
      if (!schoolId) return
      await documentsApi.patch(schoolId, id, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const getDownloadUrl = useCallback(
    async (id) => {
      if (!schoolId) return null
      setNotConfigured(false)
      try {
        const res = await documentsApi.downloadUrl(schoolId, id)
        return res.data?.url ?? null
      } catch (e) {
        if (is503(e)) setNotConfigured(true)
        throw e
      }
    },
    [schoolId],
  )

  return {
    items,
    total,
    loading,
    error,
    notEntitled,
    notConfigured,
    refresh,
    upload,
    remove,
    updateMeta,
    getDownloadUrl,
  }
}

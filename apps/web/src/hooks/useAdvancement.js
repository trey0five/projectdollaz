// ─────────────────────────────────────────────────────────────────────────────
// useAdvancement — Phase 4 Advancement v1 (the fundraising campaign register).
// School-scoped (NOT period-scoped). Same await-BEFORE-setState pattern as
// useFacilities (microtask defer + cancelled flag) so it is react-hooks/set-state-
// in-effect safe.
//
// notLicensed flips true on the module 402 (MODULE_NOT_LICENSED) so a finance-only
// school that direct-navigates to /advancement sees a friendly "add the module"
// panel rather than a raw crash. The API returns { campaigns, summary } — this hook
// exposes campaigns as `items` (parallel to useFacilities).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { advancementApi, isModuleNotLicensed, isPaymentRequired } from '../lib/api.js'

const EMPTY_SUMMARY = {
  total: 0,
  activeCount: 0,
  totalGoal: 0,
  totalRaised: 0,
  overallPctOfGoal: null,
  behindGoalActiveCount: 0,
  closingSoonActiveCount: 0,
  overdueActiveCount: 0,
}

export function useAdvancement(schoolId) {
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
      const res = await advancementApi.listCampaigns(sid)
      // The API returns { campaigns, summary } (NOT { items }).
      setItems(res.data?.campaigns ?? [])
      setSummary(res.data?.summary ?? EMPTY_SUMMARY)
    } catch (e) {
      if (isModuleNotLicensed(e)) {
        setNotLicensed(true)
        setItems([])
      } else if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setItems([])
      } else {
        setError('Could not load your advancement register.')
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

  // Penny confirm-then-create: a create_campaign apply broadcasts 'penny:data-changed'
  // with key 'advancement'; re-pull the list so a campaign Penny just created shows up
  // without a manual reload (mirrors useTasks/useDocuments).
  useEffect(() => {
    const onDataChanged = (e) => {
      if (e?.detail?.key === 'advancement') refresh()
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [refresh])

  const createItem = useCallback(
    async (body) => {
      if (!schoolId) return
      await advancementApi.createCampaign(schoolId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const updateItem = useCallback(
    async (campaignId, body) => {
      if (!schoolId) return
      await advancementApi.updateCampaign(schoolId, campaignId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const removeItem = useCallback(
    async (campaignId) => {
      if (!schoolId) return
      await advancementApi.removeCampaign(schoolId, campaignId)
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

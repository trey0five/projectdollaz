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
  needsDecisionCount: 0,
}

export function useFacilities(schoolId) {
  const [items, setItems] = useState([])
  const [vendors, setVendors] = useState([])
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
      // Vendors ride along with the register (they feed the vendor Select + the
      // Vendors tab) but never block it — a vendors failure degrades to [].
      const [res, vres] = await Promise.all([
        facilitiesApi.listMaintenance(sid),
        facilitiesApi.listVendors(sid).catch(() => null),
      ])
      setItems(res.data?.items ?? [])
      setSummary(res.data?.summary ?? EMPTY_SUMMARY)
      setVendors(vres?.data?.vendors ?? [])
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

  // Penny confirm-then-create: a create_maintenance_item apply broadcasts
  // 'penny:data-changed' with key 'facilities'; re-pull the list so an item Penny just
  // created shows up without a manual reload (mirrors useTasks/useDocuments).
  useEffect(() => {
    const onDataChanged = (e) => {
      if (e?.detail?.key === 'facilities') refresh()
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [refresh])

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

  // ── Vendor CRUD (reload the whole register — vendor names surface on items) ──
  const createVendor = useCallback(
    async (body) => {
      if (!schoolId) return
      await facilitiesApi.createVendor(schoolId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const updateVendor = useCallback(
    async (vendorId, body) => {
      if (!schoolId) return
      await facilitiesApi.updateVendor(schoolId, vendorId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const removeVendor = useCallback(
    async (vendorId) => {
      if (!schoolId) return
      await facilitiesApi.removeVendor(schoolId, vendorId)
      await load(schoolId)
    },
    [schoolId, load],
  )

  return {
    items,
    vendors,
    summary,
    loading,
    error,
    notLicensed,
    notEntitled,
    refresh,
    createItem,
    updateItem,
    removeItem,
    createVendor,
    updateVendor,
    removeVendor,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// useFacilitiesBudget — the INHERITED Finance budget slice (read-only derivation
// on the API; facilities never writes budget lines). `refreshToken` lets the page
// re-derive after anything that moves committed/actual (item saves, bid accepts).
// Module 402s degrade to budget:null silently — the page-level gate already
// handles the not-licensed panel.
// ─────────────────────────────────────────────────────────────────────────────
export function useFacilitiesBudget(schoolId, refreshToken = 0) {
  const [budget, setBudget] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (sid) => {
    setError('')
    try {
      const res = await facilitiesApi.getBudget(sid)
      setBudget(res.data ?? null)
    } catch (e) {
      if (isModuleNotLicensed(e) || isPaymentRequired(e)) {
        setBudget(null)
      } else {
        setError('Could not load the facilities budget.')
        setBudget(null)
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
        setBudget(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, refreshToken, load])

  const saveConfig = useCallback(
    async (keys) => {
      if (!schoolId) return
      await facilitiesApi.putBudgetConfig(schoolId, keys)
      await load(schoolId)
    },
    [schoolId, load],
  )

  return { budget, loading, error, saveConfig }
}

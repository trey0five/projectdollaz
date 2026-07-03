// ─────────────────────────────────────────────────────────────────────────────
// PersistenceContext — Phase 1C. Turns the in-memory report flow into a durable,
// API-backed product:
//   • HYDRATE on school select: fetch periods + the latest period's imports +
//     latest snapshot, rebuilt into FileEntry[] (the exact shape AppContext's
//     loadFiles emits) so a refresh restores where the user was.
//   • SAVE: POST uploaded imports + request the server-side canonical snapshot.
//   • HISTORY: list saved periods; reopen a stored snapshot read-only.
//   • AUTO-COMPARATIVES: expose history-derived PY/Audited so dropping ONLY a CY
//     file auto-fills the comparative columns "from saved history".
//
// State-sync follows SchoolContext.loadSchools (await BEFORE setState; the effect
// only kicks off a deferred async) to satisfy react-hooks/set-state-in-effect.
// AppContext consumes hydratedFiles via lazy useState seeding + a remount key
// (NO setState-in-effect injection).
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { validateDataset, findUnmapped } from '@finrep/engine'
import { periodsApi, importsApi, statementsApi, isPaymentRequired } from '../lib/api.js'
import { useSchools } from './SchoolContext.jsx'
import { useBilling } from './BillingContext.jsx'

const PersistenceContext = createContext(null)

// Build a FileEntry shaped EXACTLY like AppContext.loadFiles produces, from a
// stored import's rows. `source:'history'` marks comparative fills auto-loaded
// from a different period; uploaded-into-this-period imports are source:'period'.
function importToFileEntry(imp, { source, historyPeriodLabel = null } = {}) {
  const rows = imp.rows || []
  return {
    id: imp.id,
    importId: imp.id,
    fileName: imp.sourceName,
    fileSize: 0,
    status: 'ready',
    rows,
    metadata: imp.metadata || {},
    suggestion: { role: imp.role, confidence: 1 },
    role: imp.role,
    roleConfirmed: true,
    balance: validateDataset(rows),
    unmappedCount: findUnmapped(rows).length,
    persisted: true,
    fromHistory: source === 'history',
    historyPeriodLabel,
    source: source || 'period',
  }
}

export function PersistenceProvider({ children }) {
  const { activeSchool } = useSchools()
  const { refresh: refreshBilling } = useBilling()
  const schoolId = activeSchool?.id ?? null

  const [hydrating, setHydrating] = useState(true)
  const [error, setError] = useState('')
  const [periods, setPeriods] = useState([]) // PeriodWithCoverage[] newest-first
  const [activePeriod, setActivePeriod] = useState(null) // the hydrated period
  const [periodImports, setPeriodImports] = useState([]) // full imports of activePeriod
  const [latestSnapshot, setLatestSnapshot] = useState(null)
  // Bumped whenever a hydrate completes or a save lands — drives AppProvider's
  // remount key so freshly-seeded files mount cleanly (no effect injection).
  const [hydrationToken, setHydrationToken] = useState(0)
  const [saveState, setSaveState] = useState('idle') // idle|saving|saved|error
  const [savedPeriodLabel, setSavedPeriodLabel] = useState(null)

  // Fetch active (latest-per-role) full imports for a period.
  const fetchActiveImports = useCallback(async (sid, periodId) => {
    const res = await importsApi.listForPeriod(sid, periodId)
    const summaries = (res.data || []).filter((i) => i.active)
    const full = await Promise.all(
      summaries.map((s) => importsApi.get(sid, s.id).then((r) => r.data)),
    )
    return full
  }, [])

  // Hydrate everything for a school. Awaits FIRST, then a single batch of
  // setState — never synchronous-in-effect.
  const loadForSchool = useCallback(
    async (sid) => {
      setError('')
      try {
        const pres = await periodsApi.list(sid)
        const list = pres.data || []
        if (list.length === 0) {
          setPeriods([])
          setActivePeriod(null)
          setPeriodImports([])
          setLatestSnapshot(null)
          setHydrating(false)
          setHydrationToken((t) => t + 1)
          return
        }
        const newest = list[0]
        const imports = await fetchActiveImports(sid, newest.id)
        let snapshot = null
        if (newest.hasSnapshot) {
          try {
            snapshot = (await statementsApi.latest(sid, newest.id)).data
          } catch {
            snapshot = null
          }
        }
        setPeriods(list)
        setActivePeriod(newest)
        setPeriodImports(imports)
        setLatestSnapshot(snapshot)
        setHydrating(false)
        setHydrationToken((t) => t + 1)
      } catch {
        setError('Could not load saved statements for this school.')
        setPeriods([])
        setActivePeriod(null)
        setPeriodImports([])
        setLatestSnapshot(null)
        setHydrating(false)
        setHydrationToken((t) => t + 1)
      }
    },
    [fetchActiveImports],
  )

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (schoolId) {
        setHydrating(true)
        setSaveState('idle')
        setSavedPeriodLabel(null)
        loadForSchool(schoolId)
      } else {
        setPeriods([])
        setActivePeriod(null)
        setPeriodImports([])
        setLatestSnapshot(null)
        setHydrating(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, loadForSchool])

  // ── Hydrated FileEntry[] for AppContext seeding ───────────────────────────
  // The active period's own uploaded imports become slotted files. (Comparative
  // auto-fill is layered in AppContext from historyComparatives below.)
  const hydratedFiles = useMemo(
    () => periodImports.map((imp) => importToFileEntry(imp, { source: 'period' })),
    [periodImports],
  )

  // ── History-derived comparatives (auto-load from saved history) ───────────
  // Resolution rule (mirrors backend): Prior Year = most-recent EARLIER period's
  // active CY import; Audited = the latest stored audited import school-wide.
  // These are exposed as ready-made FileEntry the engine can consume directly.
  const [historyPY, setHistoryPY] = useState(null) // FileEntry | null
  const [historyAudit, setHistoryAudit] = useState(null)

  const resolveHistoryComparatives = useCallback(
    async (sid, targetPeriod, list) => {
      if (!targetPeriod) {
        setHistoryPY(null)
        setHistoryAudit(null)
        return
      }
      try {
        const targetEnd = targetPeriod.periodEndDate
        // Prior Year: most-recent earlier period that has a CY import.
        const earlierWithCy = list
          .filter((p) => p.periodEndDate < targetEnd && p.roles?.cy)
          .sort((a, b) => (a.periodEndDate < b.periodEndDate ? 1 : -1))[0]
        let pyEntry = null
        if (earlierWithCy) {
          const imps = await fetchActiveImports(sid, earlierWithCy.id)
          const cy = imps.find((i) => i.role === 'cy')
          if (cy) {
            pyEntry = importToFileEntry(
              { ...cy, role: 'py' },
              { source: 'history', historyPeriodLabel: earlierWithCy.label },
            )
          }
        }
        // Audited: latest stored audited import school-wide (any period).
        const periodWithAudit = list
          .filter((p) => p.roles?.audit)
          .sort((a, b) => (a.periodEndDate < b.periodEndDate ? 1 : -1))[0]
        let auditEntry = null
        if (periodWithAudit) {
          const imps = await fetchActiveImports(sid, periodWithAudit.id)
          const audit = imps.find((i) => i.role === 'audit')
          if (audit) {
            auditEntry = importToFileEntry(audit, {
              source: 'history',
              historyPeriodLabel: periodWithAudit.label,
            })
          }
        }
        setHistoryPY(pyEntry)
        setHistoryAudit(auditEntry)
      } catch {
        setHistoryPY(null)
        setHistoryAudit(null)
      }
    },
    [fetchActiveImports],
  )

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (schoolId && activePeriod) {
        resolveHistoryComparatives(schoolId, activePeriod, periods)
      } else {
        setHistoryPY(null)
        setHistoryAudit(null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, activePeriod, periods, resolveHistoryComparatives])

  const historyComparatives = useMemo(
    () => ({ py: historyPY, audit: historyAudit }),
    [historyPY, historyAudit],
  )

  // ── SAVE: persist uploaded imports + request the canonical snapshot ───────
  // `payload` = { periodEndDate, periodType, label, imports: [{role, sourceName,
  // rows, metadata}] }. Only NEWLY-UPLOADED (non-history, non-persisted) imports
  // are POSTed — history-filled slots already exist as imports.
  //
  // Persist ONE period: createOrGet → per-import create → generate the canonical
  // snapshot. Pure network work: NO local-state refresh, NO hydrationToken bump
  // (the batch driver hydrates ONCE at the end). Returns { period, snapshot }.
  const persistOnePeriod = useCallback(async (sid, payload) => {
    const period = (
      await periodsApi.createOrGet(sid, {
        periodEndDate: payload.periodEndDate,
        periodType: payload.periodType,
        label: payload.label,
      })
    ).data

    for (const imp of payload.imports) {
      await importsApi.create(sid, {
        role: imp.role,
        periodEndDate: payload.periodEndDate,
        periodType: payload.periodType,
        label: payload.label,
        sourceName: imp.sourceName,
        rows: imp.rows,
        metadata: imp.metadata || {},
      })
    }

    const snapshot = (await statementsApi.generate(sid, period.id, {})).data
    return { period, snapshot }
  }, [])

  // Re-hydrate live state around the LAST successfully-saved period so the hub
  // settles focus there. This is the ex-tail of the old savePeriod, factored out
  // so the batch driver runs it EXACTLY ONCE (one periodsApi.list, one
  // fetchActiveImports, one hydrationToken bump — not one per saved period).
  const refreshAfterSave = useCallback(
    async (sid, lastPeriod, lastSnapshot, savedLabel = null) => {
      const pres = await periodsApi.list(sid)
      const list = pres.data || []
      const refreshed = list.find((p) => p.id === lastPeriod.id) || lastPeriod
      const imports = await fetchActiveImports(sid, lastPeriod.id)

      setPeriods(list)
      setActivePeriod(refreshed)
      setPeriodImports(imports)
      setLatestSnapshot(lastSnapshot)
      // A caller may override the saved-period label (e.g. to also name a PY
      // period auto-promoted in the same batch). Falls back to the period's own
      // label so the normal single-save case is unchanged.
      setSavedPeriodLabel(savedLabel ?? refreshed.label ?? lastPeriod.label)
      setHydrationToken((t) => t + 1)
    },
    [fetchActiveImports],
  )

  // Settle live state after a batch. The `focus` payload (when the caller passes
  // one) is the intended-focus period — normally the primary CY. It drives the
  // remount-causing refresh ONLY when it actually saved. If the focus payload
  // FAILED (e.g. a transient error on the primary CY while an earlier PY
  // promotion succeeded), we refresh only the periods LIST (so the saved
  // side-period shows up) but do NOT bump hydrationToken / swap the active period
  // — the caller's AppProvider must stay mounted so the user's still-unsaved
  // uploads remain on screen to retry. With NO focus hint (bulk), the last saved
  // payload is the focus, so the single terminal refresh behaves exactly as before.
  const settleAfterBatch = useCallback(
    async (sid, saved, focus, savedLabel) => {
      if (saved.length === 0) return
      const focusEntry = focus
        ? saved.find((s) => s.payload === focus) || null
        : saved[saved.length - 1]
      if (focusEntry) {
        await refreshAfterSave(sid, focusEntry.period, focusEntry.snapshot, savedLabel)
        return
      }
      try {
        const pres = await periodsApi.list(sid)
        setPeriods(pres.data || [])
      } catch {
        /* leave the periods list unchanged on a refresh failure */
      }
    },
    [refreshAfterSave],
  )

  // ── BATCH SAVE: persist N periods, hydrate ONCE at the end ────────────────
  // Loops persistOnePeriod per payload (calling onProgress before each), collects
  // { saved, failed }. Transient per-period errors are pushed to `failed` and the
  // loop CONTINUES (partial success is desired). A 402 (lapsed trial) is terminal:
  // settle around whatever saved so far, flip to 'blocked', refresh billing, and
  // bail with { blocked:true }. `focus` names the intended-focus payload (see
  // settleAfterBatch); `savedLabel` overrides the saved-period label on success.
  const savePeriods = useCallback(
    async (payloads, { onProgress, focus = null, savedLabel = null } = {}) => {
      if (!schoolId) return { saved: [], failed: [] }
      setSaveState('saving')
      setError('')
      const saved = []
      const failed = []
      const total = payloads.length
      for (let index = 0; index < total; index += 1) {
        const payload = payloads[index]
        onProgress?.({ index, total, payload })
        try {
          const { period, snapshot } = await persistOnePeriod(schoolId, payload)
          saved.push({ payload, period, snapshot })
        } catch (e) {
          // 402 from the entitlement gate: terminal. Settle on what saved so far.
          if (isPaymentRequired(e)) {
            await settleAfterBatch(schoolId, saved, focus, savedLabel)
            setSaveState('blocked')
            setError('Your trial has ended — subscribe to generate and save statements.')
            refreshBilling()
            return { saved, failed, blocked: true }
          }
          failed.push({ payload, error: e })
        }
      }

      await settleAfterBatch(schoolId, saved, focus, savedLabel)
      setSaveState(failed.length ? 'error' : 'saved')
      if (failed.length) setError('Some periods could not be saved. Please try again.')
      return { saved, failed }
    },
    [schoolId, persistOnePeriod, settleAfterBatch, refreshBilling],
  )

  // Thin single-period wrapper — behaviorally identical to the old savePeriod for
  // every existing caller (AppContext.save's single-payload path, autosave). It
  // returns the saved snapshot, or null when blocked/failed.
  const savePeriod = useCallback(
    async (payload) => {
      const { saved, blocked } = await savePeriods([payload])
      return blocked ? null : saved[0]?.snapshot ?? null
    },
    [savePeriods],
  )

  // ── HISTORY: reopen a saved period's stored snapshot (read-only) ──────────
  const reopenPeriod = useCallback(
    async (periodId) => {
      if (!schoolId) return null
      try {
        const snapshot = (await statementsApi.latest(schoolId, periodId)).data
        return snapshot
      } catch {
        return null
      }
    },
    [schoolId],
  )

  const value = {
    schoolId,
    hydrating,
    error,
    periods,
    activePeriod,
    hydratedFiles,
    latestSnapshot,
    historyComparatives,
    hydrationToken,
    saveState,
    savedPeriodLabel,
    savePeriod,
    savePeriods,
    reopenPeriod,
    refresh: () => (schoolId ? loadForSchool(schoolId) : Promise.resolve()),
  }

  return <PersistenceContext.Provider value={value}>{children}</PersistenceContext.Provider>
}

export function usePersistence() {
  const ctx = useContext(PersistenceContext)
  if (!ctx) throw new Error('usePersistence must be used within a PersistenceProvider')
  return ctx
}

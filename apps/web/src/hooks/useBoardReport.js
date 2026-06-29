// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Board Report data hook. Wraps the single server-side "assemble" GET
// (boardReportApi.assemble) which returns a fully-computed BoardReportBundle
// (sharedShapes); the web layer does ZERO financial math over it. A `save` helper
// PUTs only editable state (explanations / MD&A / title / committee / markGenerated)
// and re-folds the merged editable fields back into the local bundle so a refresh
// never loses work. Mirrors useAnalytics: await-BEFORE-setState (microtask defer +
// cancelled flag) to satisfy react-hooks/set-state-in-effect; a 402 flips
// notEntitled so callers can show the friendly paused panel.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { boardReportApi, isPaymentRequired } from '../lib/api.js'

export function useBoardReport(schoolId, periodId, granularity = 'annual', monthKey = null, quarter = null) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [monthError, setMonthError] = useState('')
  const [quarterError, setQuarterError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const load = useCallback(async (sid, pid, gran, month, qtr) => {
    setError('')
    setMonthError('')
    setQuarterError('')
    setNotEntitled(false)
    try {
      const res = await boardReportApi.assemble(sid, pid, gran, month, qtr)
      setData(res.data)
    } catch (e) {
      if (isPaymentRequired(e)) {
        setNotEntitled(true)
        setData(null)
      } else {
        // The monthly/quarterly paths return coded 400s (month_required /
        // month_not_loaded / quarter_required / quarter_not_loaded) when the
        // granularity/selection pairing is incomplete or the snapshot is missing.
        // Surface those as a friendly granularity-specific notice (not the generic
        // load failure) and keep the panel from crashing.
        const code = e?.response?.data?.code
        if (code === 'month_not_loaded' || code === 'month_required') {
          const msg =
            e?.response?.data?.message ||
            (code === 'month_required'
              ? 'Select a month to view the monthly report.'
              : 'That month has not been loaded for this period.')
          setMonthError(msg)
          setData(null)
        } else if (code === 'quarter_not_loaded' || code === 'quarter_required') {
          const msg =
            e?.response?.data?.message ||
            (code === 'quarter_required'
              ? 'Select a quarter to view the quarterly report.'
              : 'That quarter has not been loaded for this period.')
          setQuarterError(msg)
          setData(null)
        } else {
          setError('Could not load the board report for this period.')
          setData(null)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      // Monthly/quarterly granularity needs a chosen month/quarter before we hit
      // the server; until one is picked, idle without firing a guaranteed-400
      // request.
      const monthlyWithoutMonth = granularity === 'monthly' && !monthKey
      const quarterlyWithoutQuarter = granularity === 'quarterly' && !quarter
      if (schoolId && periodId && !monthlyWithoutMonth && !quarterlyWithoutQuarter) {
        setLoading(true)
        load(schoolId, periodId, granularity, monthKey, quarter)
      } else {
        setData(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, periodId, granularity, monthKey, quarter, load])

  // Persist editable state (owner/accountant). The PUT returns the saved+merged
  // BoardReport row (settings/mda/explanations only — NOT financials), so we fold
  // those fields back into the assembled bundle WITHOUT re-deriving any numbers.
  const save = useCallback(
    async (body) => {
      if (!schoolId || !periodId) return null
      const res = await boardReportApi.save(schoolId, periodId, body)
      const row = res.data || {}
      setData((cur) => {
        if (!cur) return cur
        const next = { ...cur }
        next.settings = {
          ...cur.settings,
          reportTitle: row.reportTitle ?? null,
          committeeName: row.committeeName ?? cur.settings?.committeeName ?? null,
          generatedAt: row.generatedAt ?? cur.settings?.generatedAt ?? null,
        }
        next.mda = {
          text: row.mdaText ?? null,
          source: row.mdaSource ?? null,
        }
        // Re-merge explanations into the operations rows so the table + print doc
        // reflect saved comments immediately (server is the source of numbers,
        // explanations are the editable overlay).
        if (cur.operations && row.explanations) {
          const merge = (rows, kind) =>
            (rows || []).map((r) => ({
              ...r,
              explanation: row.explanations?.[kind]?.[r.key] ?? r.explanation ?? null,
            }))
          next.operations = {
            ...cur.operations,
            revenue: merge(cur.operations.revenue, 'revenue'),
            expense: merge(cur.operations.expense, 'expense'),
          }
        }
        return next
      })
      return row
    },
    [schoolId, periodId],
  )

  // Imperative refresh (e.g. after a branding PATCH that changes logo/brandColor,
  // which lives on the school record and is surfaced inside the assembled bundle).
  const reload = useCallback(
    () =>
      schoolId && periodId
        ? load(schoolId, periodId, granularity, monthKey, quarter)
        : Promise.resolve(),
    [schoolId, periodId, granularity, monthKey, quarter, load],
  )

  return { data, loading, error, monthError, quarterError, notEntitled, save, reload }
}

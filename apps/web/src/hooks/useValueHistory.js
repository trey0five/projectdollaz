// ─────────────────────────────────────────────────────────────
// Value-history fetch hook ("how did this number change?").
//
// A twin of useQbDrill: one tiny state machine shared by LineageDrawer +
// MetricDrawer. Given a schoolId + periodId, `run(sel)` POSTs the selection
// (`{ metricKey }` for a metric, or `{ statement, variant, lineKey }` for a
// statement line) to the value-history endpoint and exposes
// { status, result, error }. Every setState runs inside an async callback
// (never synchronously in an effect body), so it is React-19 / react-compiler
// lint-clean. The drawers own WHEN to fire (on the gold "How this … changed"
// click, never on open) — this hook only owns the request lifecycle.
//
// `result` is the canonical ValueHistoryResult (see the audit contract): it
// carries `kind`, `label`, `unit`, `latest`, `first`, `netChange`,
// `versions[]` (each attributed to its trigger + actor), `sparkline[]`, and
// `collapsed`. The API path takes periodId in the URL, so run() only needs the
// selection body.
// ─────────────────────────────────────────────────────────────
import { useCallback, useRef, useState } from 'react'
import { statementsApi } from '../lib/api.js'

const IDLE = { status: 'idle', result: null, error: null }

export function useValueHistory(schoolId, periodId) {
  const [state, setState] = useState(IDLE)
  // Monotonic request id: only the LATEST run() may commit. A history fired for
  // line/metric A that resolves after the user switches to B must not render A's
  // versions under B — the same guard useQbDrill uses.
  const reqIdRef = useRef(0)

  const run = useCallback(
    async (sel) => {
      if (!schoolId || !periodId) return
      const myReq = ++reqIdRef.current
      setState({ status: 'loading', result: null, error: null })
      try {
        const res = await statementsApi.valueHistory(schoolId, periodId, sel)
        if (reqIdRef.current !== myReq) return // superseded — drop the stale result
        setState({ status: 'done', result: res.data, error: null })
      } catch (err) {
        if (reqIdRef.current !== myReq) return
        setState({ status: 'error', result: null, error: err })
      }
    },
    [schoolId, periodId],
  )

  // reset also invalidates any in-flight request so its resolution can't commit.
  const reset = useCallback(() => {
    reqIdRef.current += 1
    setState(IDLE)
  }, [])

  return { ...state, run, reset }
}

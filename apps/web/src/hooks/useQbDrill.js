// ─────────────────────────────────────────────────────────────
// QuickBooks transaction drill-down fetch hook.
//
// One tiny state machine shared by LineageDrawer + MetricDrawer: given a
// schoolId, `run(body)` POSTs to the drill endpoint and exposes
// { status, result, error }. Every setState runs inside an async callback
// (never synchronously in an effect body), so it is React-19 / react-compiler
// lint-clean. The drawers own WHEN to fire (on the "View transactions" click,
// never on open) — this hook only owns the request lifecycle.
//
// `result` is the canonical QbDrillResult (see the drill contract): it carries
// `drillable`, an optional `reason`, `line`, `window`, `accounts[]`,
// `transactions[]`, `reconcile{}`, `source{}`, and (for ratios) `components[]`.
// ─────────────────────────────────────────────────────────────
import { useCallback, useRef, useState } from 'react'
import { qboApi } from '../lib/api.js'

// Honest, on-theme copy for every non-drillable / degraded drill outcome, keyed
// by the QbDrillResult `reason`. Shared by LineageDrawer + MetricDrawer.
export const DRILL_STATE_COPY = {
  'not-connected': 'Reconnect QuickBooks to view transactions.',
  'unsupported-topology-b': "Transaction detail isn't available for organization-split QuickBooks yet.",
  empty: 'No transactions in this period.',
  subtotal: 'Calculated subtotal — drill its component lines instead.',
  ratio: 'This is a ratio — drill its component lines instead.',
  'no-snapshot': 'Regenerate statements to enable transaction drill.',
  'no-account-map': "These accounts aren't traceable to QuickBooks transactions.",
  'not-quickbooks': 'This column was uploaded, not synced from QuickBooks.',
}

const IDLE = { status: 'idle', result: null, error: null }

export function useQbDrill(schoolId) {
  const [state, setState] = useState(IDLE)
  // Monotonic request id: only the LATEST run() may commit. A drill fired for line A
  // that resolves after the user switches to line B must not render A's txns under B.
  const reqIdRef = useRef(0)

  const run = useCallback(
    async (body) => {
      if (!schoolId) return
      const myReq = ++reqIdRef.current
      setState({ status: 'loading', result: null, error: null })
      try {
        const res = await qboApi.transactions(schoolId, body)
        if (reqIdRef.current !== myReq) return // superseded — drop the stale result
        setState({ status: 'done', result: res.data, error: null })
      } catch (err) {
        if (reqIdRef.current !== myReq) return
        setState({ status: 'error', result: null, error: err })
      }
    },
    [schoolId],
  )

  // reset also invalidates any in-flight request so its resolution can't commit.
  const reset = useCallback(() => {
    reqIdRef.current += 1
    setState(IDLE)
  }, [])

  return { ...state, run, reset }
}

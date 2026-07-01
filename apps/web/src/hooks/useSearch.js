// ─────────────────────────────────────────────────────────────────────────────
// useSearch — Phase 4 platform-wide search. Owns { q, setQ, results, loading,
// error } for the global top-strip search box.
//
// DEBOUNCE + STALE-GUARD: a single useEffect keyed on [trimmed, schoolId]. When the
// trimmed query is under MIN_LEN it clears results (no request); otherwise it
// debounces (~250ms) then fetches. Out-of-order responses are dropped two ways: an
// AbortController cancels the prior in-flight request, and a monotonic request-id
// ref ignores any late resolver that isn't the newest.
//
// react-hooks/set-state-in-effect safe: every state write is deferred off the
// synchronous effect body — the min-length clear via a Promise.resolve().then()
// microtask (guarded by a cancelled flag, same pattern as usePolicies/useFacilities)
// and the fetch writes via the debounce setTimeout callback.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { searchApi } from '../lib/api.js'

export const MIN_SEARCH_LEN = 2
const DEBOUNCE_MS = 250
const EMPTY = { query: '', total: 0, groups: [] }

export function useSearch(schoolId) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const reqId = useRef(0)

  const trimmed = q.trim()

  useEffect(() => {
    // Nothing to search: clear + skip (no request, no billing hit). Deferred off
    // the effect body via a microtask (cancelled-flag guarded) to satisfy the
    // set-state-in-effect rule, mirroring the sibling data hooks.
    if (!schoolId || trimmed.length < MIN_SEARCH_LEN) {
      let cancelled = false
      Promise.resolve().then(() => {
        if (cancelled) return
        setResults(EMPTY)
        setLoading(false)
        setError('')
      })
      return () => {
        cancelled = true
      }
    }

    const id = ++reqId.current
    const controller = new AbortController()

    const timer = setTimeout(() => {
      setLoading(true)
      setError('')
      searchApi
        .query(schoolId, trimmed, controller.signal)
        .then((res) => {
          if (id !== reqId.current) return // a newer request superseded this one
          setResults(res.data ?? EMPTY)
          setLoading(false)
        })
        .catch(() => {
          if (controller.signal.aborted || id !== reqId.current) return
          setError('Search is unavailable right now.')
          setResults(EMPTY)
          setLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, schoolId])

  return { q, setQ, results, loading, error }
}

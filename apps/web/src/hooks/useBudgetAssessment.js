// ─────────────────────────────────────────────────────────────────────────────
// useBudgetAssessment — POSTs a budget (a driver `draft` or a parsed `spread`) to
// the read-only /budget/assess endpoint and exposes { assessment, loading }.
//
// THROTTLE (the whole point): the fetch is gated on a STABLE string `key`, not on
// the `body` object (which the caller rebuilds every render). The effect only
// re-fetches when the key actually changes — so typing that doesn't move the
// rounded totals never re-hits the LLM. Disable entirely by passing key = '' (or
// enabled=false). ADVISORY: any error degrades to assessment=null (panel hides).
//
// React-Compiler safe: the only setState happens inside the async callback (a
// microtask), never synchronously in the effect body or in render — matching the
// established await-BEFORE-setState pattern used across the data hooks here.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { analyticsApi } from '../lib/api.js'

export function useBudgetAssessment(schoolId, periodId, body, key) {
  const [assessment, setAssessment] = useState(null)
  const [loading, setLoading] = useState(false)

  // Keep the latest body in a ref WITHOUT writing during render (React-Compiler
  // forbids ref writes in render). Updated in its own effect; the fetch effect
  // below reads it but is keyed on the stable `key`, so it only runs when the
  // rounded inputs actually change — never on every body rebuild.
  const bodyRef = useRef(body)
  useEffect(() => {
    bodyRef.current = body
  }, [body])

  useEffect(() => {
    const enabled = Boolean(schoolId && periodId && key && bodyRef.current)
    if (!enabled) {
      // Off-screen / disabled: clear any stale result, never fetch.
      Promise.resolve().then(() => {
        setAssessment(null)
        setLoading(false)
      })
      return undefined
    }

    let cancelled = false
    const requestBody = bodyRef.current
    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      analyticsApi
        .assessBudget(schoolId, periodId, requestBody)
        .then((res) => {
          if (!cancelled) setAssessment(res.data)
        })
        .catch(() => {
          // Advisory only — swallow errors so the tree never sees a throw.
          if (!cancelled) setAssessment(null)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })

    return () => {
      cancelled = true
    }
    // Intentionally keyed on the STABLE `key`, not `body`: that is the throttle.
  }, [schoolId, periodId, key])

  return { assessment, loading }
}

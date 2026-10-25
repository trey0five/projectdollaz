// useFinanceOnFile — the "Already on file" inventory (GET /finance/on-file) for
// one school. Reloads when any figure changes ('penny:data-changed') and when
// the saved years re-hydrate (a save, a removal, a restore). Never throws: a
// failed load lands in `error` and the drop zone keeps working.
import { useCallback, useEffect, useRef, useState } from 'react'
import { financeFilesApi } from '../lib/api.js'
import { usePersistence } from '../context/PersistenceContext.jsx'

export function useFinanceOnFile(schoolId) {
  const { hydrationToken } = usePersistence()
  // `for` pins the result to the school it was loaded for, so a school swap
  // never shows the previous school's years for a frame.
  const [state, setState] = useState({ for: null, data: null, loading: false, error: null })
  const seqRef = useRef(0)

  const load = useCallback(async () => {
    if (!schoolId) return
    seqRef.current += 1
    const n = seqRef.current
    setState((s) => (s.for === schoolId ? { ...s, loading: !s.data, error: null } : { for: schoolId, data: null, loading: true, error: null }))
    try {
      const res = await financeFilesApi.onFile(schoolId)
      if (n !== seqRef.current) return
      setState({ for: schoolId, data: res?.data ?? null, loading: false, error: null })
    } catch (e) {
      if (n !== seqRef.current) return
      setState((s) => ({ for: schoolId, data: s.for === schoolId ? s.data : null, loading: false, error: e || new Error('load failed') }))
    }
  }, [schoolId])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
    }
  }, [load, hydrationToken])

  useEffect(() => {
    const onChange = () => void load()
    window.addEventListener('penny:data-changed', onChange)
    return () => window.removeEventListener('penny:data-changed', onChange)
  }, [load])

  const mine = schoolId != null && state.for === schoolId
  return {
    data: mine ? state.data : null,
    loading: schoolId != null && (!mine || state.loading),
    error: mine ? state.error : null,
    reload: load,
  }
}

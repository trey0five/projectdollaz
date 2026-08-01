// ─────────────────────────────────────────────────────────────────────────────
// useEvidenceReadiness — Phase C Accreditation Intelligence: EVIDENCE CURRENCY.
//
// One request per school. The payload answers the only question a visiting team
// actually asks — "what would you ask us for, does it exist, is it dated, and is
// it still current" — grouped BY TAG across standards, so one financial audit
// serving nine standards is ONE row with nine `servesStandards` entries. That
// grouping is the visible form of "enter data once".
//
// Every string on screen is composed server-side and rendered verbatim here and
// downstream: the per-group `message`, the not-tracked wording, the CTA labels,
// the auto-link note, `health.basis`. THE WEB COMPOSES NO HONESTY COPY. There is
// no client-side date math, no client-side state derivation and no fallback
// sentence that could contradict the server — a missing field renders as nothing,
// never as a guess.
//
// Fail-soft, exactly like useAccreditationSignals: the evidence tab and the
// register's currency chips are a decoration on top of the standards register, so
// a hiccup here must never blank the page. Errors resolve to a null payload plus
// an error string; the module 402 surfaces as notLicensed. Same await-BEFORE-
// setState discipline: microtask defer + cancelled flag + activeSchoolRef
// stale-school guard (a rapid school swap must never let the previous tenant's
// evidence land on the new school's standards).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { accreditationApi, isModuleNotLicensed } from '../lib/api.js'

const EMPTY_GROUPS = []
const EMPTY_NUDGES = []

export function useEvidenceReadiness(schoolId, { enabled = true, frameworkId = null } = {}) {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)

  // STALE-RESPONSE GUARD — see useReadinessTrend / useAccreditationSignals.
  const activeSchoolRef = useRef(schoolId)
  activeSchoolRef.current = schoolId

  const load = useCallback(
    async (sid) => {
      setError('')
      setNotLicensed(false)
      try {
        const res = await accreditationApi.getEvidenceReadiness(
          sid,
          frameworkId ? { frameworkId } : {},
        )
        if (activeSchoolRef.current !== sid) return // stale school swap — drop
        setPayload(res.data ?? null)
      } catch (e) {
        if (activeSchoolRef.current !== sid) return
        setPayload(null)
        if (isModuleNotLicensed(e)) setNotLicensed(true)
        else setError('Evidence readiness is unavailable right now.')
      } finally {
        if (activeSchoolRef.current === sid) setLoading(false)
      }
    },
    [frameworkId],
  )

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      // GATED. The page mounts this hook above its own module gate (hooks cannot
      // sit behind an early return), so without `enabled` a finance-only tenant
      // landing on /accreditation would fire an extra request that 402s.
      if (schoolId && enabled) {
        setLoading(true)
        load(schoolId)
      } else {
        setPayload(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, enabled, load])

  const refresh = useCallback(
    () => (schoolId && enabled ? load(schoolId) : Promise.resolve()),
    [schoolId, enabled, load],
  )

  // THE DEMO MOMENT depends on this listener. Uploading an audit to the document
  // store, adopting a policy in Governance or dating an attached artifact all
  // change what this endpoint returns with ZERO accreditation-module interaction,
  // so the tab re-pulls on the same channel the register, the trend strip and the
  // signal panel already listen to. Fail-soft: refresh() never rejects.
  useEffect(() => {
    const onDataChanged = (e) => {
      if (e?.detail?.key === 'accreditation') refresh()
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [refresh])

  const groups = payload?.groups ?? EMPTY_GROUPS

  // standardId → the WORST currency state among the requirements that standard is
  // served by, for the per-row chip on the standards register. Worst-first is the
  // server's own group ordering, and each `servesStandards` entry carries its own
  // per-standard state, so this is a lookup, not a re-derivation: a standard with
  // zero requirement rows is simply absent from the map and renders no chip at all
  // (sparseness — it behaves exactly as it did pre-Phase-C).
  const byStandard = useMemo(() => {
    const out = {}
    for (const g of groups) {
      for (const s of g.servesStandards ?? []) {
        const prev = out[s.standardId]
        // The server sorts `groups` worst-first, so the first writer wins and any
        // later group can only be equal or better. `not_tracked` never overwrites
        // a real state, and never becomes one: it sorts last by construction.
        if (!prev) out[s.standardId] = { state: s.state, expiresOn: s.expiresOn ?? null, tag: g.tag }
      }
    }
    return out
  }, [groups])

  return {
    payload,
    framework: payload?.framework ?? null,
    health: payload?.health ?? null,
    counts: payload?.counts ?? null,
    groups,
    nudges: payload?.nudges ?? EMPTY_NUDGES,
    byStandard,
    demoData: payload?.demoData ?? false,
    disclaimer: payload?.disclaimer ?? '',
    generatedAt: payload?.generatedAt ?? null,
    loading,
    error,
    notLicensed,
    refresh,
  }
}

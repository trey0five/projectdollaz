// ─────────────────────────────────────────────────────────────────────────────
// useAccreditationTwin — Phase E: the EARLY WARNING ENGINE read model.
//
// "What would a visiting team likely find, and — just as loudly — what can we NOT
// answer?" One request per school. Everything on screen is server-derived and
// server-composed: rationales, consequences, driver details, unlock copy and the
// not-evaluated messages all arrive rendered. THIS HOOK COMPOSES NO COPY AND NO
// NUMBERS, and neither may any component reading it.
//
// THE THREE THINGS THIS PAYLOAD REFUSES TO DO, carried through verbatim:
//   · A rule that could not be evaluated is NOT a pass and NOT a fail. It lands in
//     `notEvaluated[]` naming the blocking signal and the intake/module that would
//     unlock it, and the UI must render it that way — never as a green check.
//   · `likelihood` is the WORD 'possible' or 'likely'. It is never converted to a
//     percentage anywhere in this app.
//   · `horizon.kind === 'none'` is a legitimate, common answer. Its `reason` is the
//     product, not a blank to be filled with a guessed date.
//
// An unlicensed module lowers `coverage`, never the score, and never produces a
// finding — so a finance-only school reading this page sees an honest empty engine
// rather than a wall of invented risk.
//
// Fail-soft and gated exactly like useCommendations / useEvidenceReadiness:
// microtask defer + cancelled flag + activeSchoolRef stale-school guard, errors
// resolve to an empty payload plus an error string, the module 402 surfaces as
// notLicensed. A twin hiccup must NEVER blank the standards register beneath it.
//
// Contract fixture: apps/web/src/hooks/__fixtures__/twin.example.json (a copy of
// apps/api/src/twin/__fixtures__/twin.example.json, which is the authority).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { accreditationApi, isModuleNotLicensed } from '../lib/api.js'

const EMPTY_ARRAY = []

export function useAccreditationTwin(schoolId, { enabled = true } = {}) {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)

  const activeSchoolRef = useRef(schoolId)
  activeSchoolRef.current = schoolId

  const load = useCallback(async (sid) => {
    setError('')
    setNotLicensed(false)
    try {
      const res = await accreditationApi.getTwin(sid)
      if (activeSchoolRef.current !== sid) return // stale school swap — drop
      setPayload(res.data ?? null)
    } catch (e) {
      if (activeSchoolRef.current !== sid) return
      setPayload(null)
      if (isModuleNotLicensed(e)) setNotLicensed(true)
      else setError('Early warnings are unavailable right now.')
    } finally {
      if (activeSchoolRef.current === sid) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
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

  // Any evidence write, rubric score or fresh import can create or clear a
  // finding, so re-pull on the shared change channel like every sibling hook.
  useEffect(() => {
    const onDataChanged = (e) => {
      if (e?.detail?.key === 'accreditation') refresh()
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [refresh])

  // ── Human lifecycle actions ────────────────────────────────────────────────
  // Each resolves after the refresh so the rail reflects the write. A finding
  // whose ledger row does not exist yet (`id === null`) cannot be acked at all —
  // the caller must not offer the control, and this guard is the belt to that
  // brace rather than a silent no-op that looks like a failed click.
  const ack = useCallback(
    async (findingId, reason) => {
      if (!schoolId || !findingId) return null
      const body = reason ? { reason } : {}
      const res = await accreditationApi.ackFinding(schoolId, findingId, body)
      await refresh()
      return res?.data ?? null
    },
    [schoolId, refresh],
  )

  const mute = useCallback(
    async (findingId, days, reason) => {
      if (!schoolId || !findingId) return null
      const res = await accreditationApi.muteFinding(schoolId, findingId, { days, reason })
      await refresh()
      return res?.data ?? null
    },
    [schoolId, refresh],
  )

  const setStatus = useCallback(
    async (findingId, status, note) => {
      if (!schoolId || !findingId) return null
      const body = note ? { status, note } : { status }
      const res = await accreditationApi.setFindingStatus(schoolId, findingId, body)
      await refresh()
      return res?.data ?? null
    },
    [schoolId, refresh],
  )

  return {
    twin: payload,
    findings: payload?.findings ?? EMPTY_ARRAY,
    cleared: payload?.cleared ?? EMPTY_ARRAY,
    // ALWAYS rendered — the rules we could not evaluate are the deliverable, not
    // the shortfall. Dropping this array would turn "we cannot see it" into
    // silence, which reads as "it is fine".
    notEvaluated: payload?.notEvaluated ?? EMPTY_ARRAY,
    coverage: payload?.coverage ?? null,
    perStandardRisk: payload?.perStandardRisk ?? EMPTY_ARRAY,
    // Always all ten when present; a null band means NOT MEASURED and carries its
    // own reason. Never backfilled client-side.
    domainBands: payload?.domainBands ?? EMPTY_ARRAY,
    // OPTIONAL on the wire: the collected signal set. Absent → the Signals tab
    // renders the guaranteed coverage counts plus the blocked signals named in
    // notEvaluated, and says so. It never fabricates a row.
    signals: payload?.signals ?? EMPTY_ARRAY,
    // The yyyy-mm-dd the engine ran against. The horizon timeline anchors on THIS,
    // never on the browser's clock: a payload rendered tomorrow morning must draw
    // the same picture it drew when the rules were evaluated.
    now: payload?.now ?? null,
    frameworkCode: payload?.frameworkCode ?? null,
    snapshotAsOf: payload?.snapshotAsOf ?? null,
    demoData: payload?.demoData ?? false,
    loading,
    error,
    notLicensed,
    refresh,
    ack,
    mute,
    setStatus,
  }
}

export default useAccreditationTwin

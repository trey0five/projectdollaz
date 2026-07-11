// ─────────────────────────────────────────────────────────────────────────────
// wizardEmbeds.jsx — thin fetch-wrappers so two existing status-driven cards can
// be EMBEDDED unchanged in the Add-data wizard. These add NO new UI of their own
// beyond a loading line; they only fetch the `status`/`quickbooks` payload the
// card needs (the parent page normally supplies it) and hand it straight through.
// Both cards leave the app for OAuth (window.location.assign) — the wizard's
// Confirm copy covers the "returned connected" case.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from 'react'
import { useDataStatus } from '../../hooks/useDataStatus.js'
import { enrollmentApi } from '../../lib/api.js'
import QuickBooksCard from '../datahub/QuickBooksCard.jsx'
import EnrollmentConnectCard from '../enrollment/EnrollmentConnectCard.jsx'

const skeleton = 'h-28 animate-pulse rounded-2xl border-2 border-rule/50 bg-white/60'

/** QuickBooks connect fast-path — reuses the DataHub QuickBooksCard verbatim,
 *  feeding it the `quickbooks` block from the shared data-status payload. */
export function QboConnectEmbed({ schoolId, periodId }) {
  const { data } = useDataStatus(schoolId, periodId)
  if (!data) return <div className={skeleton} aria-hidden="true" />
  return <QuickBooksCard quickbooks={data.quickbooks} />
}

/** SIS connector — reuses EnrollmentConnectCard verbatim (which itself houses the
 *  roster upload), fetching + reloading its connection `status`. */
export function EnrollmentConnectEmbed({ schoolId, canEdit, onSaved }) {
  const [status, setStatus] = useState(null)

  const load = useCallback(async () => {
    if (!schoolId) return
    try {
      const res = await enrollmentApi.status(schoolId)
      setStatus(res?.data ?? res ?? null)
    } catch {
      // Leave status null → the card shows its own "Checking connection…" line;
      // the roster upload inside it still works regardless.
    }
  }, [schoolId])

  useEffect(() => {
    let cancelled = false
    if (schoolId) {
      enrollmentApi
        .status(schoolId)
        .then((res) => {
          if (!cancelled) setStatus(res?.data ?? res ?? null)
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [schoolId])

  const handleChanged = useCallback(() => {
    load()
    onSaved?.()
  }, [load, onSaved])

  return (
    <EnrollmentConnectCard
      schoolId={schoolId}
      canEdit={canEdit}
      status={status}
      onChanged={handleChanged}
    />
  )
}

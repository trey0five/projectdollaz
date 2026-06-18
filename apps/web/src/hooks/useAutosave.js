// Debounced autosave for draft-of-an-existing-record forms. Fires a single
// PUT/PATCH AUTOSAVE_DELAY_MS after the last edit settles, guards against
// overlapping saves, and never retries a failed save until the next edit (so a
// broken endpoint can't spin). Pair with <AutosaveIndicator>/<AutosaveBar>.
//
//   const { saving, error, saveNow } = useAutosave({
//     enabled: canEdit,        // gate (e.g. role); false => never schedules
//     dirty,                   // draft differs from server AND is valid to send
//     signal,                  // value that changes on every edit (resets debounce)
//     save: async () => {...}, // persists the current draft (PUT/PATCH + refetch)
//   })
//
// `signal` drives the debounce reset — pass the draft itself or a serialized key
// of it. `dirty` gates whether anything is scheduled, so keep it false while the
// draft is invalid (the form's inline validation still shows).
import { useEffect, useRef, useState } from 'react'
import { apiErrorMessage } from '../lib/api.js'

const DEFAULT_DELAY_MS = 800

export function useAutosave({ enabled = true, dirty, signal, save, delay = DEFAULT_DELAY_MS }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Only ever touched inside run() (effect/handler context), never during render,
  // so it's safe under the React Compiler refs rule.
  const savingRef = useRef(false)

  const run = async () => {
    if (!enabled || !dirty || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      await save()
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not save your changes — your edits are still here.'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // Re-runs on every edit (signal change); a clean/disabled state schedules nothing.
  // A failed save doesn't reschedule here (deps unchanged) — it waits for the next edit.
  useEffect(() => {
    if (!enabled || !dirty) return undefined
    const t = setTimeout(() => void run(), delay)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, dirty, signal, delay])

  // Latest values for the unmount flush — set in an effect, never during render.
  const latestRef = useRef({ enabled, dirty, save })
  useEffect(() => {
    latestRef.current = { enabled, dirty, save }
  })

  // Flush a pending edit when the component unmounts (navigating away, switching
  // tabs) so the last sub-debounce change isn't lost. Fire-and-forget: the PUT
  // completes even though we're gone; any setState it triggers no-ops harmlessly.
  useEffect(() => {
    return () => {
      const { enabled: en, dirty: d, save: sv } = latestRef.current
      if (en && d && !savingRef.current) {
        savingRef.current = true
        Promise.resolve().then(sv).catch(() => {})
      }
    }
  }, [])

  return { saving, error, saveNow: run, setError }
}

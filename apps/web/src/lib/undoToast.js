// ─────────────────────────────────────────────────────────────────────────────
// undoToast — the "FY25 trial balance removed. [Undo]" toast after a removal.
//
// OUTSIDE React state on purpose (the reviewModalStore pattern): removing a
// saved trial balance re-hydrates the intake, and its AppProvider remounts on
// the new hydration token, which would take a toast that lived in it along.
// The one host (UndoToastHost) is mounted in AppShell and reads this store.
// In memory only.
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore } from 'react'
import { removedToast } from './removalCopy.js'

/** How long Undo is offered on screen (the removal itself is kept 30 days). */
export const UNDO_MS = 10000

const IDLE = Object.freeze({ toast: null, phase: 'idle', message: '' })
let state = IDLE
let seq = 0
const listeners = new Set()

function emit(next) {
  state = next
  for (const l of listeners) l()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => state

/** { toast: {id, schoolId, entry} | null, phase: 'idle'|'restoring'|'done'|'error', message }. */
export function useUndoToast() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Read without subscribing (tests, handlers). */
export function undoToastState() {
  return state
}

/** Offer Undo for a removal (a RemovedEntry); replaces any toast showing. */
export function showUndo({ schoolId, entry }) {
  if (!entry?.id) return
  seq += 1
  emit({ toast: { id: `undo-${seq}`, schoolId, entry }, phase: 'idle', message: removedToast(entry) })
}

/** Move the CURRENT toast on (restoring → done / error). A stale id is ignored. */
export function setUndoPhase(toastId, phase, message) {
  if (!state.toast || state.toast.id !== toastId) return
  emit({ ...state, phase, message })
}

export function dismissUndo(toastId = null) {
  if (!state.toast) return
  if (toastId && state.toast.id !== toastId) return
  emit(IDLE)
}

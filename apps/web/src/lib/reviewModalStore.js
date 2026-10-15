// ─────────────────────────────────────────────────────────────────────────────
// reviewModalStore — is the "Review N accounts" popup open, and what has the
// person chosen so far (A5)?
//
// It lives OUTSIDE React state on purpose. The Data hub intake (AppProvider)
// is keyed on the hydration token and remounts after every autosave, ~1.4 s
// after a file reads — so a popup whose open flag lived in the intake would
// snap shut under the person's mouse, and their half-made picks would vanish.
// Here they survive the remount; the popup re-renders from the fresh intake.
//
// Scoped to ONE school: a popup opened for one school is never shown over
// another's accounts. In memory only — never stored, never sent anywhere.
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore } from 'react'

const CLOSED = Object.freeze({ open: false, schoolId: null, draft: {}, sortedSchoolId: null })
let state = CLOSED
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

/** The live store state: { open, schoolId, draft, sortedSchoolId }. */
export function useReviewModal() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Read without subscribing (tests, handlers). */
export function reviewModalState() {
  return state
}

/** Open the popup for a school. Re-opening keeps the person's unsaved picks. */
export function openReviewModal(schoolId = null) {
  if (state.open && state.schoolId === schoolId) return
  const draft = state.schoolId === schoolId ? state.draft : {}
  emit({ ...state, open: true, schoolId, draft, sortedSchoolId: null })
}

/** Close WITHOUT saving: the person's unsaved picks are dropped. */
export function closeReviewModal() {
  if (!state.open && Object.keys(state.draft).length === 0) return
  emit({ ...state, open: false, draft: {} })
}

/** One pick the person made in the popup (not saved until they press a button). */
export function setReviewPick(acct, category) {
  emit({ ...state, draft: { ...state.draft, [String(acct)]: category ?? '' } })
}

/** Approve succeeded: close, and remember this school just finished sorting. */
export function markReviewSorted(schoolId = state.schoolId) {
  emit({ open: false, schoolId: state.schoolId, draft: {}, sortedSchoolId: schoolId })
}

/** Forget everything (tests / sign-out). */
export function resetReviewModal() {
  emit(CLOSED)
}

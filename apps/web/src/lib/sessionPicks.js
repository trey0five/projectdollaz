// ─────────────────────────────────────────────────────────────────────────────
// sessionPicks — the category picks this tab has SAVED, per school (A1 / A4).
//
// The Data hub intake remounts after every autosave (the provider is keyed on
// the hydration token), which used to wipe this session's picks and re-flag
// accounts the school had just sorted — the server had them, the screen
// didn't. Picks land here only AFTER the PATCH /mapping that stored them
// succeeded, so seeding a remounted intake from them never claims something the
// server doesn't have. In memory only: never written to storage, never sent
// anywhere, gone on reload (where the saved snapshot takes over).
// ─────────────────────────────────────────────────────────────────────────────
const bySchool = new Map() // schoolId → { [String(acct)]: category }

/** Record picks the server has confirmed. */
export function rememberPicks(schoolId, entries) {
  if (!schoolId || !entries) return
  const prev = bySchool.get(schoolId) ?? {}
  bySchool.set(schoolId, { ...prev, ...entries })
}

/** This tab's confirmed picks for a school (a fresh object; {} when none). */
export function sessionPicks(schoolId) {
  if (!schoolId) return {}
  return { ...(bySchool.get(schoolId) ?? {}) }
}

/** Forget (tests / sign-out). */
export function clearSessionPicks(schoolId) {
  if (schoolId) bySchool.delete(schoolId)
  else bySchool.clear()
}

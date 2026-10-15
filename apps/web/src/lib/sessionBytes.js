// ─────────────────────────────────────────────────────────────────────────────
// sessionBytes — keep a just-uploaded file's bytes for this browser tab only.
//
// The Data hub intake autosaves ~1.4 s after a file reads, and the save remounts
// the intake on the stored imports (which carry rows + metadata, never bytes).
// Without this, "Change columns" / "Read with your columns · Change" would
// vanish a second after it appeared. The bytes stay in this tab's memory: they
// are never sent to the API, never written to storage, and are dropped on
// reload.
//
// Keyed by school + stored file name + a FINGERPRINT of the accounts read from
// it (every acct:total). Name + row count was not enough: last year's and this
// year's "Trial Balance.xlsx" often have the same number of accounts, and the
// FY26 card's "Change columns" previewed the FY25 bytes — then autosave
// replaced FY26 with FY25. The fingerprint ties the bytes to what was read.
// ─────────────────────────────────────────────────────────────────────────────
const store = new Map()
const MAX = 12

/** A short, stable fingerprint of a file's rows (FNV-1a over acct:total, cents). */
export function rowsFingerprint(rows) {
  let h = 0x811c9dc5
  const list = Array.isArray(rows) ? rows : []
  const text = list
    .map((r) => `${r?.acct}:${Math.round((Number(r?.total) || 0) * 100)}`)
    .join('|')
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${list.length}.${h.toString(36)}`
}

const keyOf = (schoolId, fileName, rows) => `${schoolId}|${fileName}|${rowsFingerprint(rows)}`

/** Remember a file's bytes for the rows it was read into. */
export function rememberBytes(schoolId, fileName, rows, bytes) {
  if (!schoolId || !fileName || !bytes || !Array.isArray(rows)) return
  const k = keyOf(schoolId, fileName, rows)
  store.delete(k)
  store.set(k, bytes)
  while (store.size > MAX) store.delete(store.keys().next().value)
}

/** The bytes that were read into exactly these rows — null for any other file. */
export function recallBytes(schoolId, fileName, rows) {
  if (!schoolId || !fileName || !Array.isArray(rows)) return null
  return store.get(keyOf(schoolId, fileName, rows)) ?? null
}

/** Forget everything (tests). */
export function clearSessionBytes() {
  store.clear()
}

/** Re-attach this tab's bytes to freshly-hydrated (persisted, uploaded) entries. */
export function withSessionBytes(schoolId, entries) {
  if (!schoolId || !Array.isArray(entries) || store.size === 0) return entries
  return entries.map((f) => {
    if (!f || f.bytes || !f.persisted || f.fromHistory) return f
    const bytes = recallBytes(schoolId, f.fileName, f.rows)
    return bytes ? { ...f, bytes } : f
  })
}

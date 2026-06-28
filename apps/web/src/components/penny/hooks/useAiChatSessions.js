/**
 * useAiChatSessions — new-chat + recent-chats history for Penny AI, persisted
 * entirely in localStorage (NO DB tables). Tenant-scoped by schoolId.
 *
 * Storage keys (all per-school):
 *   finrep:penny:sessions:<schoolId>          -> index [{ id, title, updatedAt }] (most-recent first, cap 20)
 *   finrep:penny:session:<schoolId>:<id>      -> transcript { messages } (last 30, attachment bytes STRIPPED)
 *   finrep:penny:active:<schoolId>            -> active session id
 *
 * Surface:
 *   { sessions, activeSessionId, loadActive(), persist(messages),
 *     setTitleFromFirstMessage(text), newChat(), switchSession(id), deleteSession(id) }
 *
 * persist() is internally debounced (~200ms). It strips heavy attachment
 * payloads (dataBase64 + image preview data: URLs) before writing so the quota
 * isn't blown by base64 files. On schoolId change the active session reloads
 * for tenant isolation.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const INDEX_CAP = 20
const TRANSCRIPT_CAP = 30
const DEBOUNCE_MS = 200

const indexKey = (schoolId) => `finrep:penny:sessions:${schoolId}`
const sessionKey = (schoolId, id) => `finrep:penny:session:${schoolId}:${id}`
const activeKey = (schoolId) => `finrep:penny:active:${schoolId}`

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed == null ? fallback : parsed
  } catch {
    return fallback
  }
}
function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota / disabled storage — ignore */
  }
}
function removeKey(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function newId() {
  // Stable, collision-resistant enough for a localStorage index.
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch {
    /* ignore */
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function readIndex(schoolId) {
  const idx = readJson(indexKey(schoolId), [])
  return Array.isArray(idx) ? idx : []
}

// Strip heavy payloads so the transcript stays small enough for localStorage.
// Removes attachment dataBase64 and any image preview data: URLs; keeps the
// lightweight metadata (name/kind/size) so the UI can still show a chip.
function stripMessage(m) {
  if (!m || typeof m !== 'object') return m
  const out = { ...m }
  if (Array.isArray(out.attachments)) {
    out.attachments = out.attachments.map((a) => {
      if (!a || typeof a !== 'object') return a
      const { dataBase64, preview, ...rest } = a
      void dataBase64
      // Drop preview only when it's an inline data: URL (the big one).
      if (typeof preview === 'string' && preview.startsWith('data:')) {
        return rest
      }
      return preview === undefined ? rest : { ...rest, preview }
    })
  }
  return out
}

function stripMessages(messages) {
  const arr = Array.isArray(messages) ? messages : []
  return arr.slice(-TRANSCRIPT_CAP).map(stripMessage)
}

function deriveTitle(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (!t) return 'New chat'
  return t.length > 48 ? `${t.slice(0, 48)}…` : t
}

export function useAiChatSessions(schoolId) {
  const [sessions, setSessions] = useState(() =>
    schoolId ? readIndex(schoolId) : [],
  )
  const [activeSessionId, setActiveSessionId] = useState(() => {
    if (!schoolId) return null
    const stored = readJson(activeKey(schoolId), null)
    if (stored) return stored
    const idx = readIndex(schoolId)
    return idx[0]?.id || null
  })

  // Latest refs so debounced/persist callbacks read current values.
  const schoolIdRef = useRef(schoolId)
  const activeIdRef = useRef(activeSessionId)
  const debounceRef = useRef(null)
  useEffect(() => {
    activeIdRef.current = activeSessionId
  }, [activeSessionId])

  // Reload this school's sessions + active id whenever the tenant changes.
  // Mirrors the codebase's load-on-change pattern (useReconciliation et al.):
  // the setState is deferred through a microtask + a `cancelled` flag so the
  // tenant switch can't leak the previous school's history. The ref is synced
  // inside the effect (after commit); callbacks run on user events that always
  // fire after the effect has committed, so they read the current tenant.
  useEffect(() => {
    let cancelled = false
    schoolIdRef.current = schoolId
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    Promise.resolve().then(() => {
      if (cancelled) return
      if (!schoolId) {
        activeIdRef.current = null
        setSessions([])
        setActiveSessionId(null)
        return
      }
      const idx = readIndex(schoolId)
      const stored = readJson(activeKey(schoolId), null)
      const nextActive = stored || idx[0]?.id || null
      activeIdRef.current = nextActive
      setSessions(idx)
      setActiveSessionId(nextActive)
    })
    return () => {
      cancelled = true
    }
  }, [schoolId])

  // Flush any pending debounced write on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [])

  const refreshIndex = useCallback(() => {
    const sid = schoolIdRef.current
    if (!sid) return
    setSessions(readIndex(sid))
  }, [])

  const setActive = useCallback((id) => {
    const sid = schoolIdRef.current
    activeIdRef.current = id
    setActiveSessionId(id)
    if (sid) writeJson(activeKey(sid), id)
  }, [])

  // Ensure an active session id exists; mint one (and add to the index) lazily.
  const ensureActiveId = useCallback(() => {
    const sid = schoolIdRef.current
    if (!sid) return null
    let id = activeIdRef.current
    if (id) return id
    id = newId()
    const entry = { id, title: 'New chat', updatedAt: Date.now() }
    const idx = [entry, ...readIndex(sid)].slice(0, INDEX_CAP)
    writeJson(indexKey(sid), idx)
    setSessions(idx)
    setActive(id)
    return id
  }, [setActive])

  // Load the active session's transcript. Never throws; returns { messages }.
  const loadActive = useCallback(() => {
    const sid = schoolIdRef.current
    const id = activeIdRef.current
    if (!sid || !id) return { messages: [] }
    const data = readJson(sessionKey(sid, id), { messages: [] })
    const messages = Array.isArray(data?.messages) ? data.messages : []
    return { messages }
  }, [])

  // Write the transcript + bump the index entry. Debounced internally.
  const persist = useCallback((messages) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      const sid = schoolIdRef.current
      if (!sid) return
      const id = ensureActiveId()
      if (!id) return
      const stripped = stripMessages(messages)
      writeJson(sessionKey(sid, id), { messages: stripped })
      // Bump this session to the top of the index + refresh updatedAt.
      const idx = readIndex(sid)
      const existing = idx.find((s) => s.id === id)
      const title = existing?.title && existing.title !== 'New chat'
        ? existing.title
        : (existing?.title || 'New chat')
      const entry = { id, title, updatedAt: Date.now() }
      const next = [entry, ...idx.filter((s) => s.id !== id)].slice(0, INDEX_CAP)
      writeJson(indexKey(sid), next)
      setSessions(next)
    }, DEBOUNCE_MS)
  }, [ensureActiveId])

  // Title from the first user message (only if still the default).
  const setTitleFromFirstMessage = useCallback((text) => {
    const sid = schoolIdRef.current
    if (!sid) return
    const id = ensureActiveId()
    if (!id) return
    const idx = readIndex(sid)
    const existing = idx.find((s) => s.id === id)
    // Only overwrite the placeholder title.
    if (existing && existing.title && existing.title !== 'New chat') return
    const title = deriveTitle(text)
    const entry = { id, title, updatedAt: Date.now() }
    const next = [entry, ...idx.filter((s) => s.id !== id)].slice(0, INDEX_CAP)
    writeJson(indexKey(sid), next)
    setSessions(next)
  }, [ensureActiveId])

  // Rotate to a brand-new (lazy) session. The consumer clears its transcript.
  const newChat = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    const sid = schoolIdRef.current
    if (!sid) {
      setActiveSessionId(null)
      activeIdRef.current = null
      return null
    }
    const id = newId()
    const entry = { id, title: 'New chat', updatedAt: Date.now() }
    const next = [entry, ...readIndex(sid)].slice(0, INDEX_CAP)
    writeJson(indexKey(sid), next)
    setSessions(next)
    setActive(id)
    // No transcript written yet — an empty new session.
    return id
  }, [setActive])

  // Switch to an existing stored session. Consumer calls loadActive() after.
  const switchSession = useCallback((id) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    setActive(id)
    return id
  }, [setActive])

  // Delete a session (transcript + index entry). If it was active, fall back
  // to the next most-recent session (or null).
  const deleteSession = useCallback((id) => {
    const sid = schoolIdRef.current
    if (!sid) return
    removeKey(sessionKey(sid, id))
    const next = readIndex(sid).filter((s) => s.id !== id)
    writeJson(indexKey(sid), next)
    setSessions(next)
    if (activeIdRef.current === id) {
      setActive(next[0]?.id || null)
    }
  }, [setActive])

  return {
    sessions,
    activeSessionId,
    loadActive,
    persist,
    setTitleFromFirstMessage,
    newChat,
    switchSession,
    deleteSession,
    refreshIndex,
  }
}

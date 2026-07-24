// ─────────────────────────────────────────────────────────────────────────────
// InboxContext — the SINGLE source of truth for the signed-in user's unread
// message count and its ONE poller. Both InboxBell instances (the desktop rail
// foot + the mobile drawer foot) consume this so there is exactly one fetch/poll
// lifecycle and one shared count — previously each bell polled independently, so a
// hidden-but-mounted bell (display:none) kept polling and the two counts could
// drift (marking read in one didn't update the other until its next poll).
//
// Lifecycle: fetch on mount, poll every 60s (skipped while the tab is hidden), and
// refetch on window focus. Fail-soft — a failed count never throws (the shell must
// never crash), the badge just keeps its last known value. Provider is mounted once
// around the app chrome (AppShell), so a single poller runs while authed.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { inboxApi } from '../lib/api.js'

const POLL_MS = 60_000

const InboxContext = createContext(null)

export function InboxProvider({ children }) {
  const [unread, setUnread] = useState(0)

  const refreshCount = useCallback(async () => {
    try {
      const res = await inboxApi.unreadCount()
      setUnread(res.data?.unreadCount ?? 0)
    } catch {
      /* fail-soft: keep the last known count */
    }
  }, [])

  // Fetch on mount + poll (skip while hidden) + refetch on window focus.
  useEffect(() => {
    refreshCount()
    const id = window.setInterval(() => {
      if (!document.hidden) refreshCount()
    }, POLL_MS)
    const onFocus = () => refreshCount()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [refreshCount])

  return (
    <InboxContext.Provider value={{ unread, setUnread, refreshCount }}>
      {children}
    </InboxContext.Provider>
  )
}

// Consumed by both InboxBell instances + InboxPanel. Returns a no-op fallback when
// no provider is mounted so a stray bell can never crash the shell.
export function useInbox() {
  return useContext(InboxContext) ?? { unread: 0, setUnread: () => {}, refreshCount: () => {} }
}

// ─────────────────────────────────────────────────────────────────────────────
// InboxPanel — the popover that lists the signed-in user's messages (newest-first)
// and lets them read + mark-all-read. Mounted only while open (InboxBell owns the
// open state + outside-click/Esc), so it fetches the list on mount. Every mutation
// is optimistic and reports the new unread count up to InboxBell via `setUnread`
// so the rail badge stays in sync. Navy-deep surface, reduced-motion safe.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CheckCheck } from 'lucide-react'
import { inboxApi, apiErrorMessage } from '../../lib/api.js'
import { LoadState, ErrorState, EmptyState, relTime } from '../../pages/admin/_ui.jsx'
import ReadDot from './ReadDot.jsx'

export default function InboxPanel({ setUnread }) {
  const reduce = useReducedMotion()
  const [messages, setMessages] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const res = await inboxApi.list()
      setMessages(res.data.messages || [])
      // Reconcile the rail badge with the authoritative server count.
      if (typeof res.data.unreadCount === 'number') setUnread(res.data.unreadCount)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not load your inbox.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const unreadInList = (messages || []).filter((m) => !m.readAt).length

  const markRead = async (m) => {
    if (m.readAt) return
    // Optimistic: stamp read + decrement the badge, then fire-and-forget the POST.
    setMessages((prev) =>
      (prev || []).map((x) => (x.id === m.id ? { ...x, readAt: new Date().toISOString() } : x)),
    )
    setUnread((u) => Math.max(0, u - 1))
    try {
      await inboxApi.read(m.id)
    } catch {
      /* best-effort; a stale read re-reconciles on the next open/poll */
    }
  }

  const toggle = (m) => {
    const willOpen = expandedId !== m.id
    setExpandedId(willOpen ? m.id : null)
    if (willOpen) markRead(m)
  }

  const markAll = async () => {
    if (unreadInList === 0) return
    const now = new Date().toISOString()
    setMessages((prev) => (prev || []).map((x) => (x.readAt ? x : { ...x, readAt: now })))
    setUnread(0)
    try {
      await inboxApi.readAll()
    } catch {
      /* best-effort */
    }
  }

  return (
    <motion.div
      role="dialog"
      aria-label="Inbox"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-full right-0 z-50 mb-2 w-80 overflow-hidden rounded-xl border border-white/15 bg-navy-deep shadow-2xl"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <h2 className="font-serif text-[15px] text-white">Inbox</h2>
        <button
          type="button"
          onClick={markAll}
          disabled={unreadInList === 0}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <CheckCheck size={14} /> Mark all read
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto">
        {loading && !messages ? (
          <LoadState label="Loading…" />
        ) : err ? (
          <div className="p-3">
            <ErrorState message={err} onRetry={load} />
          </div>
        ) : (messages || []).length === 0 ? (
          <EmptyState label="No messages yet." />
        ) : (
          <ul className="divide-y divide-white/[0.07]">
            {messages.map((m) => {
              const unread = !m.readAt
              const expanded = expandedId === m.id
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => toggle(m)}
                    aria-expanded={expanded}
                    className="flex w-full items-start gap-2.5 px-4 py-3 text-left outline-none ring-inset ring-gold/50 transition-colors hover:bg-white/[0.05] focus-visible:ring-2"
                  >
                    <ReadDot unread={unread} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={`truncate text-[13.5px] ${
                            unread ? 'font-semibold text-white' : 'font-medium text-white/70'
                          }`}
                        >
                          {m.subject}
                        </span>
                        <span className="shrink-0 text-[11px] text-white/40">
                          {relTime(m.createdAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-white/45">
                        {m.senderLabel}
                      </span>
                      {expanded && (
                        <span className="mt-2 block whitespace-pre-wrap text-[13px] leading-relaxed text-white/80">
                          {m.body}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </motion.div>
  )
}

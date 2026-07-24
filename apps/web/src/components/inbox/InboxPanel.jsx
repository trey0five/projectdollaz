// ─────────────────────────────────────────────────────────────────────────────
// InboxPanel — a centered MODAL popup listing the signed-in user's messages
// (newest-first) with read + mark-all-read. Portalled to <body> with a backdrop
// so it always sits center-screen regardless of the trigger's position in the
// chrome (the old absolute popover anchored in the bottom-left rail rendered
// off-screen). Mounted only while open (InboxBell owns open state), so it fetches
// on mount. Every mutation is optimistic and reports the new unread count up via
// `setUnread`. Backdrop-click / Esc / the ✕ all close. Reduced-motion safe.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { CheckCheck, X, Inbox as InboxIcon } from 'lucide-react'
import { inboxApi, apiErrorMessage } from '../../lib/api.js'
import { LoadState, ErrorState, EmptyState, relTime } from '../../pages/admin/_ui.jsx'
import ReadDot from './ReadDot.jsx'

export default function InboxPanel({ setUnread, onClose }) {
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

  // Esc closes; lock body scroll while open.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const unreadInList = (messages || []).filter((m) => !m.readAt).length

  const markRead = async (m) => {
    if (m.readAt) return
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

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        className="absolute inset-0 bg-navy-deep/60 backdrop-blur-sm"
        aria-hidden
      />
      {/* Dialog */}
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Inbox"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/15 bg-navy-deep shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-5 py-4">
          <h2 className="flex items-center gap-2 font-serif text-[17px] text-white">
            <InboxIcon size={18} className="text-white/70" /> Inbox
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={markAll}
              disabled={unreadInList === 0}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <CheckCheck size={14} /> Mark all read
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inbox"
              className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && !messages ? (
            <LoadState label="Loading…" />
          ) : err ? (
            <div className="p-3">
              <ErrorState message={err} onRetry={load} />
            </div>
          ) : (messages || []).length === 0 ? (
            <div className="px-4 py-12 text-center">
              <InboxIcon size={28} className="mx-auto mb-2 text-white/25" />
              <p className="text-sm text-white/50">No messages yet.</p>
              <p className="mt-1 text-xs text-white/30">Notes from the KYRO team will show up here.</p>
            </div>
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
                      className="flex w-full items-start gap-2.5 px-5 py-3.5 text-left outline-none ring-inset ring-gold/50 transition-colors hover:bg-white/[0.05] focus-visible:ring-2"
                    >
                      <ReadDot unread={unread} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span
                            className={`truncate text-[14px] ${
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
    </div>,
    document.body,
  )
}

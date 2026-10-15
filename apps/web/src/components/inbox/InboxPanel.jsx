// ─────────────────────────────────────────────────────────────────────────────
// InboxPanel — a large MASTER-DETAIL inbox dialog (Premium UI P4: a Panel at the
// float elevation, messages as ruled rows with a 2px unread/selected mark). Portalled to <body> with
// a dimmed backdrop, so it always sits center-screen. Left = the message list
// (newest-first), right = a reading pane that opens the selected message in full.
// On mobile the two collapse into one column: tapping a message slides to the
// reading view with a Back arrow. Mounted only while open (InboxBell owns open
// state), so it fetches on mount; every mutation is optimistic and reports the new
// unread count up via `setUnread`. Backdrop / Esc / ✕ close. Reduced-motion safe.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { CheckCheck, X, Inbox as InboxIcon, ChevronLeft, Mail, ArrowRight } from 'lucide-react'
import { inboxApi, apiErrorMessage } from '../../lib/api.js'
import { LoadState, ErrorState, relTime, fmtDateTime } from '../../pages/admin/_ui.jsx'
import Button from '../ui/surface/Button.jsx'
import '../../styles/pending/c1-flows.css'

function initialOf(label = '') {
  return label.trim().charAt(0).toUpperCase() || 'K'
}

// The sender as a quiet ink initial on a hairline square — one shape, no
// per-sender colour (the old gradient avatars were noise, and two were purple).
function Avatar({ label, size = 36 }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-md border border-hair/15 bg-ground font-semibold text-ink2"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {initialOf(label)}
    </span>
  )
}

export default function InboxPanel({ setUnread, onClose }) {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [messages, setMessages] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const res = await inboxApi.list()
      setMessages(res.data.messages || [])
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

  // Esc: back out of a reading view first (mobile), else close. Lock body scroll.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (selectedId) setSelectedId(null)
      else onClose?.()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose, selectedId])

  const list = messages || []
  const unreadInList = list.filter((m) => !m.readAt).length
  const selected = useMemo(() => list.find((m) => m.id === selectedId) || null, [list, selectedId])

  const markRead = async (m) => {
    if (!m || m.readAt) return
    setMessages((prev) =>
      (prev || []).map((x) => (x.id === m.id ? { ...x, readAt: new Date().toISOString() } : x)),
    )
    setUnread((u) => Math.max(0, u - 1))
    try {
      await inboxApi.read(m.id)
    } catch {
      /* best-effort; re-reconciles on next open/poll */
    }
  }

  const select = (m) => {
    setSelectedId(m.id)
    markRead(m)
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      {/* Scrim */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        className="dlg-scrim"
        aria-hidden
      />

      {/* Dialog — a Panel at the float elevation (Premium UI P4). */}
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Inbox"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="dlg flex h-[82vh] max-h-[760px] w-full max-w-4xl flex-col"
      >
        <span className="dlg-rule" aria-hidden />

        {/* Header */}
        <div className="dlg-head items-center">
          <InboxIcon size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink2" />
          <div className="min-w-0 flex-1">
            <h2 className="dlg-title">Inbox</h2>
            <p className="dlg-sub tabular-nums">
              {loading
                ? 'Loading…'
                : unreadInList > 0
                  ? `${unreadInList} unread · ${list.length} message${list.length === 1 ? '' : 's'}`
                  : `${list.length} message${list.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <Button
            variant="quiet"
            size="sm"
            onClick={markAll}
            disabled={unreadInList === 0}
            icon={<CheckCheck size={14} />}
            aria-label="Mark all read"
          >
            <span className="hidden sm:inline">Mark all read</span>
          </Button>
          <button type="button" onClick={onClose} aria-label="Close inbox" className="dlg-x !ml-0">
            <X size={17} />
          </button>
        </div>

        {/* Body: master (list) + detail (reading pane) */}
        <div className="flex min-h-0 flex-1">
          {/* ── List ── */}
          <div
            className={`flex min-h-0 w-full flex-col border-hair md:w-[40%] md:border-r ${
              selected ? 'hidden md:flex' : 'flex'
            }`}
          >
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading && !messages ? (
                <LoadState label="Loading…" />
              ) : err ? (
                <div className="p-3">
                  <ErrorState message={err} onRetry={load} />
                </div>
              ) : list.length === 0 ? (
                <EmptyInbox />
              ) : (
                <ul className="ruled">
                  {list.map((m) => {
                    const unread = !m.readAt
                    const active = m.id === selectedId
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => select(m)}
                          aria-current={active ? 'true' : undefined}
                          className={`relative flex w-full items-start gap-3 px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563eb]/50 ${
                            active ? 'bg-ink/[0.04]' : 'hover:bg-ink/[0.025]'
                          }`}
                        >
                          {/* 2px mark: the selected row in the module hue, unread in coral. */}
                          {(active || unread) && (
                            <span
                              aria-hidden
                              className={`absolute inset-y-0 left-0 w-0.5 ${active ? 'tone-hue bg-current' : 'bg-coral'}`}
                            />
                          )}
                          <Avatar label={m.senderLabel} size={34} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className={`truncate text-[14px] ${unread ? 'font-semibold text-ink' : 'font-medium text-ink2'}`}>
                                {m.subject}
                              </span>
                              <span className="shrink-0 text-[11px] tabular-nums text-ink2">{relTime(m.createdAt)}</span>
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5">
                              {unread && <span className="sr-only">Unread · </span>}
                              <span className="truncate text-[12px] text-ink2">{m.senderLabel}</span>
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* ── Reading pane ── */}
          <div className={`min-h-0 w-full flex-col md:flex md:w-[60%] ${selected ? 'flex' : 'hidden md:flex'}`}>
            <AnimatePresence mode="wait">
              {selected ? (
                <motion.div
                  key={selected.id}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  {/* Reading header */}
                  <div className="border-b border-hair px-5 py-4 sm:px-6">
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="back-link mb-3 md:hidden"
                    >
                      <ChevronLeft size={15} aria-hidden /> Back to inbox
                    </button>
                    <h3 className="font-serif text-title font-medium text-ink">{selected.subject}</h3>
                    <div className="mt-3 flex items-center gap-2.5">
                      <Avatar label={selected.senderLabel} size={30} />
                      <div className="leading-tight">
                        <div className="text-[13px] font-medium text-ink">{selected.senderLabel}</div>
                        <div className="text-[11.5px] tabular-nums text-ink2">{fmtDateTime(selected.createdAt)}</div>
                      </div>
                    </div>
                  </div>
                  {/* Reading body */}
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                    <p className="max-w-[65ch] whitespace-pre-wrap text-[14.5px] leading-[23px] text-ink">
                      {selected.body}
                    </p>
                    {/* THE DOOR. "You've been assigned X" without a way to reach
                        X is a notice that makes the reader go hunting. Renders
                        only when the message carries a destination — broadcasts
                        have nothing to point at and get no dangling button. */}
                    {selected.link ? (
                      <Button
                        variant="primary"
                        className="mt-5"
                        onClick={() => {
                          onClose?.()
                          navigate(selected.link)
                        }}
                      >
                        Open <ArrowRight size={14} aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-1 flex-col items-center justify-center px-8 text-center"
                >
                  <Mail size={28} strokeWidth={1.5} aria-hidden className="mb-3 text-ink2/50" />
                  <p className="text-[15px] font-medium text-ink">Select a message</p>
                  <p className="mt-1 max-w-[240px] text-[12.5px] text-ink2">
                    Pick a message on the left to read it here.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

function EmptyInbox() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      <InboxIcon size={26} strokeWidth={1.5} aria-hidden className="mb-3 text-ink2/50" />
      <p className="text-sm font-medium text-ink">No messages yet</p>
      <p className="mt-1 text-xs text-ink2">Notes from the KYRO team will show up here.</p>
    </div>
  )
}

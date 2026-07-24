// ─────────────────────────────────────────────────────────────────────────────
// InboxPanel — a large, flashy MASTER-DETAIL inbox modal. Portalled to <body> with
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
import { CheckCheck, X, Inbox as InboxIcon, ChevronLeft, Mail } from 'lucide-react'
import { inboxApi, apiErrorMessage } from '../../lib/api.js'
import { LoadState, ErrorState, relTime, fmtDateTime } from '../../pages/admin/_ui.jsx'

// Deterministic gradient per sender label so avatars feel varied but stable.
const AVATAR_TONES = [
  ['#2563EB', '#3b82f6'],
  ['#8b5cf6', '#a78bfa'],
  ['#FF6B5E', '#ff9182'],
  ['#06b6d4', '#22d3ee'],
  ['#6366f1', '#818cf8'],
  ['#f59e0b', '#fbbf24'],
]
function toneFor(label = '') {
  let h = 0
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0
  return AVATAR_TONES[h % AVATAR_TONES.length]
}
function initialOf(label = '') {
  return label.trim().charAt(0).toUpperCase() || 'K'
}

function Avatar({ label, size = 40 }) {
  const [a, b] = toneFor(label)
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(135deg,${a},${b})`,
        boxShadow: `0 8px 20px -8px ${a}`,
      }}
    >
      {initialOf(label)}
    </span>
  )
}

export default function InboxPanel({ setUnread, onClose }) {
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
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        className="absolute inset-0 bg-[#060b1c]/70 backdrop-blur-md"
        aria-hidden
      />

      {/* Dialog */}
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Inbox"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.985 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex h-[82vh] max-h-[760px] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#0a1229] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.85)]"
      >
        {/* Flashy accent bar + aurora glow */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: 'linear-gradient(90deg,#2563EB,#8b5cf6 45%,#FF6B5E)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(620px 240px at 18% -8%, rgba(37,99,235,0.20), transparent 60%), radial-gradient(520px 260px at 92% 0%, rgba(139,92,246,0.16), transparent 60%)',
          }}
        />

        {/* Header */}
        <div className="relative flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-white"
              style={{ background: 'linear-gradient(135deg,#2563EB,#8b5cf6)', boxShadow: '0 10px 26px -10px #2563EB' }}
            >
              <InboxIcon size={22} />
            </span>
            <div>
              <h2 className="font-serif text-[20px] leading-tight text-white">Inbox</h2>
              <p className="text-[12px] text-white/45">
                {loading
                  ? 'Loading…'
                  : unreadInList > 0
                    ? `${unreadInList} unread · ${list.length} message${list.length === 1 ? '' : 's'}`
                    : `${list.length} message${list.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={markAll}
              disabled={unreadInList === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-1.5 text-[12.5px] font-medium text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <CheckCheck size={14} /> <span className="hidden sm:inline">Mark all read</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inbox"
              className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Body: master (list) + detail (reading pane) */}
        <div className="relative flex min-h-0 flex-1">
          {/* ── List ── */}
          <div
            className={`flex min-h-0 w-full flex-col border-white/10 md:w-[40%] md:border-r ${
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
                <ul className="p-2">
                  {list.map((m) => {
                    const unread = !m.readAt
                    const active = m.id === selectedId
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => select(m)}
                          className={`group relative flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left outline-none ring-inset ring-gold/50 transition-colors focus-visible:ring-2 ${
                            active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'
                          }`}
                        >
                          {active && (
                            <span
                              aria-hidden
                              className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full"
                              style={{ background: 'linear-gradient(#2563EB,#8b5cf6)' }}
                            />
                          )}
                          <Avatar label={m.senderLabel} size={38} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span
                                className={`truncate text-[14px] ${
                                  unread ? 'font-semibold text-white' : 'font-medium text-white/70'
                                }`}
                              >
                                {m.subject}
                              </span>
                              <span className="shrink-0 text-[11px] text-white/40">{relTime(m.createdAt)}</span>
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5">
                              {unread && (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-coral shadow-[0_0_8px_#FF6B5E]" />
                              )}
                              <span className="truncate text-[12px] text-white/45">{m.senderLabel}</span>
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
                  initial={reduce ? { opacity: 0 } : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  {/* Reading header */}
                  <div className="border-b border-white/10 px-5 py-4 sm:px-6">
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-white/60 transition-colors hover:text-white md:hidden"
                    >
                      <ChevronLeft size={15} /> Back to inbox
                    </button>
                    <h3 className="font-serif text-[21px] leading-snug text-white">{selected.subject}</h3>
                    <div className="mt-3 flex items-center gap-2.5">
                      <Avatar label={selected.senderLabel} size={34} />
                      <div className="leading-tight">
                        <div className="text-[13px] font-medium text-white/85">{selected.senderLabel}</div>
                        <div className="text-[11.5px] text-white/40">{fmtDateTime(selected.createdAt)}</div>
                      </div>
                    </div>
                  </div>
                  {/* Reading body */}
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                    <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-white/80">
                      {selected.body}
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-1 flex-col items-center justify-center px-8 text-center"
                >
                  <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/30">
                    <Mail size={30} />
                  </span>
                  <p className="text-[15px] font-medium text-white/70">Select a message</p>
                  <p className="mt-1 max-w-[240px] text-[12.5px] text-white/40">
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
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/25">
        <InboxIcon size={26} />
      </span>
      <p className="text-sm font-medium text-white/60">No messages yet</p>
      <p className="mt-1 text-xs text-white/35">Notes from the KYRO team will show up here.</p>
    </div>
  )
}

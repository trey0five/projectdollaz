// PennyHistoryMenu — the "New chat" + recent-chats control in the panel header.
// A single button opens a small dropdown listing recent stored sessions; each
// row switches to that transcript, and a hover X deletes it. New chat starts a
// fresh session. Sessions live in localStorage (managed by useAiChatSessions).
import { useEffect, useRef, useState } from 'react'
import { MessageSquarePlus, History, Check, Trash2, X } from 'lucide-react'

function relativeTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function PennyHistoryMenu({
  sessions = [],
  activeSessionId,
  onNewChat,
  onSwitch,
  onDelete,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            onNewChat()
            setOpen(false)
          }}
          aria-label="Start a new chat"
          title="New chat"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-white/85 transition hover:bg-white/15 hover:text-white"
        >
          <MessageSquarePlus size={16} aria-hidden />
          <span className="hidden sm:inline">New chat</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Recent chats"
          aria-expanded={open}
          aria-haspopup="menu"
          title="Recent chats"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/85 transition hover:bg-white/15 hover:text-white"
        >
          <History size={16} aria-hidden />
        </button>
      </div>

      {open && (
        <div
          role="menu"
          aria-label="Recent chats"
          className="absolute right-0 top-full z-[60] mt-1.5 w-64 overflow-hidden rounded-xl border border-rule/70 bg-white shadow-login motion-safe:animate-[penny-pop_180ms_ease-out]"
        >
          <p className="border-b border-rule/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            Recent chats
          </p>
          {sessions.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-muted">No saved chats yet.</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {sessions.map((s) => {
                const isActive = s.id === activeSessionId
                return (
                  <li key={s.id} className="group flex items-center">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onSwitch(s.id)
                        setOpen(false)
                      }}
                      className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-section ${
                        isActive ? 'text-navy' : 'text-ink'
                      }`}
                    >
                      {isActive ? (
                        <Check size={13} className="shrink-0 text-gold" aria-hidden />
                      ) : (
                        <span className="w-[13px] shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">
                          {s.title || 'New chat'}
                        </span>
                        <span className="block text-[10.5px] text-muted">{relativeTime(s.updatedAt)}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(s.id)}
                      aria-label={`Delete ${s.title || 'chat'}`}
                      className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition hover:bg-danger/10 hover:text-danger focus:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex w-full items-center justify-center gap-1 border-t border-rule/60 px-3 py-2 text-[12px] text-muted transition-colors hover:text-navy"
          >
            <X size={12} aria-hidden /> Close
          </button>
        </div>
      )}
    </div>
  )
}

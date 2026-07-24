// ─────────────────────────────────────────────────────────────────────────────
// InboxBell — the user's inbox entry in the app-chrome rail foot (and the mobile
// drawer foot). An envelope row with a coral unread pill; clicking toggles the
// InboxPanel popover. Owns ONLY the open state + outside-click/Esc; the unread
// count + its single fetch/poll lifecycle live in InboxContext (shared by both
// bell instances), so there's one source of truth and one poller — no drift, no
// redundant polling from a hidden-but-mounted bell. Styled to match the rail rows.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Inbox as InboxIcon } from 'lucide-react'
import { useInbox } from '../../context/InboxContext.jsx'
import InboxPanel from './InboxPanel.jsx'

export default function InboxBell() {
  const [open, setOpen] = useState(false)
  const { unread, setUnread } = useInbox()
  const rootRef = useRef(null)
  const triggerRef = useRef(null)

  // Outside-click + Esc close while open; focus returns to the trigger.
  useEffect(() => {
    if (!open) return undefined
    const trigger = triggerRef.current
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
      if (trigger) trigger.focus()
    }
  }, [open])

  const pill = unread > 0 ? (unread > 99 ? '99+' : String(unread)) : null

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={pill ? `Inbox, ${unread} unread` : 'Inbox'}
        className="group relative flex min-h-[40px] w-full items-center gap-3 rounded-[10px] px-3 py-2 text-[13.5px] font-medium text-white/70 outline-none ring-gold/50 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2"
      >
        <InboxIcon size={17} className="shrink-0 text-white/70 transition-colors group-hover:text-white" />
        <span>Inbox</span>
        {pill && (
          <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-coral px-1.5 text-[10.5px] font-bold text-white">
            {pill}
          </span>
        )}
      </button>
      <AnimatePresence>{open && <InboxPanel setUnread={setUnread} />}</AnimatePresence>
    </div>
  )
}

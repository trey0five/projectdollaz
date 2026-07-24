// ─────────────────────────────────────────────────────────────────────────────
// InboxBell — the user's inbox entry in the app-chrome rail foot (and the mobile
// drawer foot). An envelope row with a coral unread pill; clicking opens the
// InboxPanel MODAL (a centered, portalled popup that owns its own backdrop/Esc
// close). The unread count + its single fetch/poll lifecycle live in InboxContext
// (shared by both bell instances), so there's one source of truth and one poller.
// Styled to match the rail rows.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Inbox as InboxIcon } from 'lucide-react'
import { useInbox } from '../../context/InboxContext.jsx'
import InboxPanel from './InboxPanel.jsx'

export default function InboxBell() {
  const [open, setOpen] = useState(false)
  const { unread, setUnread } = useInbox()

  const pill = unread > 0 ? (unread > 99 ? '99+' : String(unread)) : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
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
      <AnimatePresence>
        {open && <InboxPanel setUnread={setUnread} onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  )
}

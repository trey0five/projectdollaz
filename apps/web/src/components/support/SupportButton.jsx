// ─────────────────────────────────────────────────────────────────────────────
// SupportButton — a first-class "Support" entry in the app-chrome rail foot (and
// the mobile drawer foot), styled to match the InboxBell / nav rows. Owns its own
// open state and renders the SupportModal, whose form POSTs to /support → emails
// support@ourkyro.com (reply-to = the signed-in user). Makes support discoverable
// on the dashboard instead of buried in the avatar dropdown.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { LifeBuoy } from 'lucide-react'
import SupportModal from './SupportModal.jsx'

export default function SupportButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Contact support"
        className="group relative flex min-h-[40px] w-full items-center gap-3 rounded-[10px] px-3 py-2 text-[13.5px] font-medium text-white/70 outline-none ring-gold/50 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2"
      >
        <LifeBuoy size={17} className="shrink-0 text-white/70 transition-colors group-hover:text-white" />
        <span>Support</span>
      </button>
      <SupportModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

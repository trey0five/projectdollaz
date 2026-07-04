// StudioConversation — the transcript for an active Penny Studio session. Reuses
// the pure PennyMessageList (charts, proposals, applied-cards all render inline via
// PennyMessage) wired to the SAME engine instance. The transcript scrolls in its
// own bounded box (auto-pinned to the newest message); the composer is bottom-
// docked by PennyStudio below it. This view is just the transcript + an image
// lightbox.
import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import PennyMessageList from '../chat/PennyMessageList.jsx'

export default function StudioConversation({ chat }) {
  const reduce = useReducedMotion()
  const [lightbox, setLightbox] = useState(null)

  return (
    <div className="mx-auto max-w-[820px]">
      <div className="flex max-h-[calc(100vh-16rem)] min-h-[320px] flex-col overflow-hidden rounded-2xl border border-rule/60 bg-white shadow-card">
        <PennyMessageList
          messages={chat.messages}
          busy={chat.busy}
          streamingContent={chat.streamingContent}
          status={chat.status}
          error={chat.error}
          onPick={chat.send}
          onOpenImage={(src) => setLightbox(src)}
          onRetry={chat.retry}
          onConfirmProposal={chat.confirmProposal}
          onSetProposalStatus={chat.setProposalStatus}
          onUndoProposal={chat.undoApplied}
        />
      </div>

      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: reduce ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.15 }}
            role="dialog"
            aria-modal="true"
            aria-label="Attached image preview"
            onClick={() => setLightbox(null)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setLightbox(null)
            }}
            className="fixed inset-0 z-[70] flex cursor-zoom-out items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            <img src={lightbox} alt="Attached" className="max-h-full max-w-full rounded-lg shadow-login" />
            <button
              type="button"
              onClick={() => setLightbox(null)}
              aria-label="Close image preview"
              className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              <X size={18} aria-hidden />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

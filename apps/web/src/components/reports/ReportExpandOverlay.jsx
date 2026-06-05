// ─────────────────────────────────────────────────────────────
// Full-screen report viewer (lightbox). Renders the SAME active statement on a
// dark backdrop, fit entirely on screen, then lets the user pinch / scroll /
// drag / double-tap to zoom and pan (see ZoomPan). The report is rendered RAW
// (RawReports) so ZoomPan owns the scale instead of the inline auto-fit.
// Escape or the Close button dismisses it; body scroll is locked while open;
// marked no-print so window.print() still prints the underlying page.
// ─────────────────────────────────────────────────────────────
import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import ZoomPan from './ZoomPan.jsx'
import { RawReports } from './ReportScroll.jsx'

export default function ReportExpandOverlay({ open, title, onClose, children }) {
  // Close on Escape + lock body scroll while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="report-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="no-print fixed inset-0 z-[60] flex flex-col bg-navy-deep/95 backdrop-blur-sm"
        >
          {/* header */}
          <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white sm:px-6">
            <h2 className="truncate font-serif text-lg font-semibold sm:text-xl">{title}</h2>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-white/55 md:inline">
                Pinch or scroll to zoom · drag to pan · double-tap to toggle
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close report"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-white/25 text-white transition-colors hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>
          </header>

          {/* zoomable report */}
          <ZoomPan>
            <RawReports>
              <div className="p-3">{children}</div>
            </RawReports>
          </ZoomPan>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

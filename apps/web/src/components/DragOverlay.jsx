import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { UploadCloud } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'

/**
 * Full-window gold-glow drag overlay. Subscribes to window-level drag
 * events with a depth counter (so moving over child elements doesn't
 * flicker). Hidden + pointer-events-none unless a drag is active.
 */
export default function DragOverlay() {
  const { loadFiles, canEdit } = useApp()
  const reduce = useReducedMotion()
  const [active, setActive] = useState(false)
  const depth = useRef(0)

  useEffect(() => {
    if (!canEdit) return undefined
    const hasFiles = (e) =>
      e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')

    const onEnter = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current += 1
      setActive(true)
    }
    const onOver = (e) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onLeave = (e) => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setActive(false)
    }
    // CAPTURE-phase reset: always tears the overlay down on ANY drop/dragend,
    // even when a child target (e.g. EmptySlotCard) calls stopPropagation on
    // its synthetic drop to suppress the bubble-phase auto-classify load below.
    // The HTML DnD spec fires no final dragleave after a successful drop, so
    // without this the overlay could stay stuck after dropping into a slot.
    const onReset = () => {
      depth.current = 0
      setActive(false)
    }
    // BUBBLE-phase load: a child slot's stopPropagation prevents this from
    // firing, so a file dropped INTO a slot is NOT also auto-classified here.
    const onDrop = (e) => {
      e.preventDefault()
      if (e.dataTransfer?.files?.length) loadFiles(e.dataTransfer.files)
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onReset, true)
    window.addEventListener('dragend', onReset, true)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onReset, true)
      window.removeEventListener('dragend', onReset, true)
      window.removeEventListener('drop', onDrop)
    }
  }, [loadFiles, canEdit])

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-deep/80 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            className="flex flex-col items-center gap-5 rounded-3xl border-2 border-dashed border-gold bg-navy/40 px-16 py-14 text-center shadow-glow-lg"
          >
            <motion.span
              className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow"
              animate={reduce ? undefined : { y: [0, -10, 0] }}
              transition={reduce ? undefined : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <UploadCloud size={44} />
            </motion.span>
            <h2 className="font-serif text-3xl font-semibold text-gold-light">
              Release to import trial balances
            </h2>
            <p className="text-sm uppercase tracking-[0.16em] text-white/70">
              .xlsx · .xls · .csv
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

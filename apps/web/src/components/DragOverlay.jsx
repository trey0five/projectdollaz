import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { UploadCloud } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'

/**
 * Full-window drag overlay (a light ground wash + one dashed primary drop target). Subscribes to window-level drag
 * events with a depth counter (so moving over child elements doesn't
 * flicker). Hidden unless a drag is active.
 *
 * STEPPING ASIDE: while active the overlay takes every pointer event, so an
 * in-page drop target under it (an EmptySlotCard, the "Add its Balance Sheet"
 * link — anything marked [data-drop-zone], which useFileDrop zones are) could
 * never receive a drop: the file was always auto-classified here instead of
 * pinned to its slot. Now each dragover hit-tests what is UNDER the overlay;
 * over a [data-drop-zone] the overlay fades out and goes pointer-events-none,
 * so the zone's own highlight shows and its drop (which stops propagation)
 * lands there. Anywhere else the overlay behaves exactly as before.
 */
export default function DragOverlay() {
  const { loadFiles, canEdit } = useApp()
  const [active, setActive] = useState(false)
  const [overZone, setOverZone] = useState(false)
  const depth = useRef(0)
  const overlayRef = useRef(null)

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
      if (!hasFiles(e)) return
      e.preventDefault()
      // Explicit: a page-level guard (useFileDrop's) may have set 'none'.
      e.dataTransfer.dropEffect = 'copy'
    }
    // Is the pointer over a real drop target? Hit-test BENEATH the overlay
    // (elementsFromPoint, skipping it); CAPTURE phase so a zone that stops its
    // dragover propagating (EmptySlotCard) is still seen.
    const zoneUnder = (e) => {
      const skip = (el) => overlayRef.current && overlayRef.current.contains(el)
      let el = null
      if (typeof document.elementsFromPoint === 'function') {
        el = document.elementsFromPoint(e.clientX, e.clientY).find((n) => !skip(n)) ?? null
      } else if (!skip(e.target)) {
        el = e.target
      }
      return !!(el && typeof el.closest === 'function' && el.closest('[data-drop-zone]'))
    }
    const onTrack = (e) => {
      if (hasFiles(e)) setOverZone(zoneUnder(e))
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
      setOverZone(false)
    }
    // BUBBLE-phase load: a child slot's stopPropagation prevents this from
    // firing, so a file dropped INTO a slot is NOT also auto-classified here.
    const onDrop = (e) => {
      e.preventDefault()
      if (e.dataTransfer?.files?.length) loadFiles(e.dataTransfer.files)
    }

    window.addEventListener('dragenter', onTrack, true)
    window.addEventListener('dragover', onTrack, true)
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onReset, true)
    window.addEventListener('dragend', onReset, true)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onTrack, true)
      window.removeEventListener('dragover', onTrack, true)
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
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: overZone ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          data-testid="drag-overlay"
          data-over-zone={overZone ? 'true' : undefined}
          className={`fixed inset-0 z-[60] flex items-center justify-center bg-ground/90 ${
            overZone ? 'pointer-events-none' : ''
          }`}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            className="flex flex-col items-center gap-4 rounded-[8px] border-2 border-dashed border-[#2563EB] bg-white px-16 py-14 text-center shadow-float"
          >
            <span className="flex text-[#2563EB]">
              <UploadCloud size={44} aria-hidden="true" />
            </span>
            <h2 className="font-serif text-display font-medium text-ink">
              Release to import trial balances
            </h2>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
              .xlsx · .xls · .csv
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

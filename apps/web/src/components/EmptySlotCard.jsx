import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Plus } from 'lucide-react'
import { ROLE_META } from '../lib/roleMeta.js'

const ACCEPT = '.xlsx,.xls,.csv'

/**
 * Dashed-gold placeholder for an UNFILLED role slot. Mirrors the
 * HeroDropzone interaction model but scoped to ONE role: it is a drop
 * target AND click-to-add. Files arriving through this card are pinned
 * to THIS slot's role (via the assignFiles callback) so the user's
 * drop/browse intent overrides auto-classification.
 *
 * Props:
 *  - role: 'cy' | 'py' | 'audit'
 *  - assignFiles(fileList): role-stamping loader supplied by IntakeBar
 *  - needsAttention: extra emphasis (e.g. missing required CY blocks preview)
 *  - conflicted: a duplicate-role conflict claims this role — the slot is
 *    intentionally empty (the claimants live in "Needs a role" below), so we
 *    swap the neutral "add a file" copy for a "resolve below" prompt instead
 *    of contradictorily telling the user the role is missing.
 */
export default function EmptySlotCard({
  role,
  assignFiles,
  needsAttention = false,
  conflicted = false,
}) {
  const reduce = useReducedMotion()
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  // Depth counter (mirrors DragOverlay) so moving the cursor across the card's
  // inner children doesn't flicker the gold drop highlight off then on.
  const depth = useRef(0)

  const meta = ROLE_META[role]
  const openDialog = () => inputRef.current?.click()

  const onChange = (e) => {
    if (e.target.files?.length) assignFiles(e.target.files)
    e.target.value = '' // allow re-adding the same filename
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openDialog()
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    // Stop the full-window DragOverlay's bubble-phase drop from ALSO firing
    // and re-loading these files via the auto-classify path. (DragOverlay
    // resets its own overlay via a capture-phase listener, so suppressing the
    // bubble here no longer leaves the overlay stuck.)
    e.stopPropagation()
    depth.current = 0
    setDragOver(false)
    if (e.dataTransfer?.files?.length) assignFiles(e.dataTransfer.files)
  }

  // Border / surface states. Drop highlight uses shadow + bg + the icon
  // tile, not color alone, for a non-color a11y cue.
  const border = dragOver
    ? 'border-gold bg-[#fff8e6] shadow-glow'
    : needsAttention || conflicted
      ? 'border-gold shadow-glow'
      : 'border-gold/60'

  const pulse = needsAttention && !conflicted

  return (
    <motion.div
      layout
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      role="button"
      tabIndex={0}
      aria-label={`Add ${meta.label} file (${meta.required ? 'required' : 'optional'})`}
      onClick={openDialog}
      onKeyDown={onKeyDown}
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onDragEnter={(e) => {
        e.preventDefault()
        depth.current += 1
        setDragOver(true)
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setDragOver(false)
      }}
      className={`group relative flex min-h-[196px] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-section px-4 py-8 text-center outline-none transition-all hover:border-gold hover:shadow-glow focus-visible:border-gold focus-visible:shadow-glow ${border}`}
    >
      <motion.span
        className={`flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-glow ${
          conflicted ? 'bg-gold' : 'bg-gold-gradient'
        }`}
        animate={reduce || !pulse ? undefined : { y: [0, -6, 0] }}
        transition={
          reduce || !pulse
            ? undefined
            : { duration: 4, repeat: Infinity, ease: 'easeInOut' }
        }
      >
        {conflicted ? <AlertTriangle size={22} /> : <Plus size={22} />}
      </motion.span>

      <p className="font-serif text-base font-semibold text-navy">{meta.plainLabel}</p>

      <span
        className={`inline-flex items-center rounded-full border-2 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${
          meta.required
            ? 'border-gold bg-[#fff8e6] text-[#7a5e00]'
            : 'border-border bg-white text-muted'
        }`}
      >
        {meta.requirementLabel}
      </span>

      {conflicted ? (
        <>
          <p className="text-[12px] font-medium text-[#7a5e00]">
            Two files claim this slot
          </p>
          <p className="text-[11px] text-muted">Resolve below to fill this slot</p>
        </>
      ) : (
        <>
          <p className="text-[12px] leading-snug text-muted">{meta.blurb}</p>
          <p className="text-[11px] italic text-muted">{meta.source}</p>
          <p className="text-[11px] text-muted">Drop a file or click to add</p>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={onChange}
      />
    </motion.div>
  )
}

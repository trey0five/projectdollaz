import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Plus } from 'lucide-react'
import { ROLE_META } from '../lib/roleMeta.js'
import { Pill } from './ui/surface/index.js'
import '../styles/pending/b2-finance.css'

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
  const border = needsAttention || conflicted ? '!border-watch/70' : ''

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.26, ease: [0.22, 0.8, 0.2, 1] }}
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
      data-active={dragOver ? 'true' : undefined}
      className={`b2-drop group relative min-h-[196px] w-full gap-3 px-4 py-8 ${border}`}
    >
      <span className={conflicted ? 'flex tone-watch' : 'b2-drop-icon'}>
        {conflicted ? <AlertTriangle size={24} aria-hidden="true" /> : <Plus size={24} aria-hidden="true" />}
      </span>

      <p className="text-[15px] font-semibold text-ink">{meta.plainLabel}</p>

      <Pill variant={meta.required ? 'status' : 'default'} tone="watch">
        {meta.requirementLabel}
      </Pill>

      {conflicted ? (
        <>
          <p className="text-[14px] font-medium text-ink">
            Two files claim this slot
          </p>
          <p className="text-[13px] text-ink2">Resolve below to fill this slot</p>
        </>
      ) : (
        <>
          <p className="text-[14px] leading-snug text-ink2">{meta.blurb}</p>
          <p className="text-[13px] italic text-ink2">{meta.source}</p>
          <p className="text-[13px] text-ink2">Drop a file or click to add</p>
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

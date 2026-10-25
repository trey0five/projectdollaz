// ─────────────────────────────────────────────────────────────────────────────
// UndoToastHost — "FY25 trial balance removed. [Undo]", once, app-wide.
//
// Mounted in AppShell (the intake remounts on every re-hydrate, so the toast
// cannot live there; see lib/undoToast.js). Undo is a REAL server restore
// (POST /finance/removals/:id/restore) — the removed data comes back with its
// history. Bottom-centre so it clears the owl at bottom-right. The 10-second
// countdown pauses while the pointer or keyboard focus is on it.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, Loader2, RotateCcw, X } from 'lucide-react'
import Button from '../ui/surface/Button.jsx'
import { financeFilesApi } from '../../lib/api.js'
import { restoredToast } from '../../lib/removalCopy.js'
import { dismissUndo, setUndoPhase, UNDO_MS, useUndoToast } from '../../lib/undoToast.js'
import { afterFinanceChange, restoreErrorText } from '../../lib/financeRemoval.js'
import { usePersistence } from '../../context/PersistenceContext.jsx'

const HUE = { color: 'rgb(var(--c-module, var(--c-navy-soft)))' }
const HUE_BG = { background: 'rgb(var(--c-module, var(--c-navy-soft)))' }
const DONE_MS = 3500
const ERROR_MS = 6000

export default function UndoToastHost() {
  const { toast, phase, message } = useUndoToast()
  const reduce = useReducedMotion()
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[75] w-[calc(100%-32px)] max-w-md -translate-x-1/2 print:hidden">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto"
          >
            <ToastCard toast={toast} phase={phase} message={message} reduce={reduce} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ToastCard({ toast, phase, message, reduce }) {
  const persistence = usePersistence()
  // A pause belongs to ONE (toast, phase): pressing Undo from the keyboard
  // unmounts the focused button without a blur, so a plain boolean stayed true
  // and the result toast never timed out. A new phase starts unpaused.
  const phaseKey = `${toast.id}:${phase}`
  const [pausedFor, setPausedFor] = useState(null)
  const paused = pausedFor === phaseKey
  // Fraction of the Undo window left when the countdown was last paused.
  const [left, setLeft] = useState(1)
  const clock = useRef({ key: null, remaining: UNDO_MS, startedAt: 0 })

  // One timer per (phase, pause): Undo for 10 s, the result for 3.5 s / 6 s,
  // nothing while the restore is running.
  useEffect(() => {
    const c = clock.current
    const key = `${toast.id}:${phase}`
    if (c.key !== key) {
      c.key = key
      c.remaining = phase === 'done' ? DONE_MS : phase === 'error' ? ERROR_MS : UNDO_MS
    }
    if (phase === 'restoring' || paused) return undefined
    c.startedAt = Date.now()
    const t = window.setTimeout(() => dismissUndo(toast.id), c.remaining)
    return () => {
      window.clearTimeout(t)
      c.remaining = Math.max(0, c.remaining - (Date.now() - c.startedAt))
    }
  }, [toast.id, phase, paused])

  const pause = () => {
    if (paused) return
    const c = clock.current
    if (phase === 'idle') setLeft(Math.max(0, c.remaining - (Date.now() - c.startedAt)) / UNDO_MS)
    setPausedFor(phaseKey)
  }
  const resume = (e) => {
    // Focus moving between the toast's own buttons is not "leaving".
    if (e?.type === 'blur' && e.currentTarget.contains(e.relatedTarget)) return
    setPausedFor(null)
  }

  const undo = async () => {
    setUndoPhase(toast.id, 'restoring', 'Bringing it back…')
    try {
      await financeFilesApi.restore(toast.schoolId, toast.entry.id)
    } catch (e) {
      setUndoPhase(toast.id, 'error', restoreErrorText(e, toast.entry))
      return
    }
    setUndoPhase(toast.id, 'done', restoredToast(toast.entry))
    await afterFinanceChange(persistence)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="undo-toast"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className="dlg flex items-center gap-3 px-4 py-3"
    >
      <span className="shrink-0" style={HUE} aria-hidden="true">
        {phase === 'restoring' ? (
          <Loader2 size={16} className="animate-spin" />
        ) : phase === 'done' ? (
          <CheckCircle2 size={16} />
        ) : (
          <RotateCcw size={16} />
        )}
      </span>
      <p className="min-w-0 flex-1 text-[13.5px] font-medium leading-5 text-ink">{message}</p>
      {phase === 'idle' && (
        <Button size="sm" variant="secondary" onClick={undo}>
          Undo
        </Button>
      )}
      {phase !== 'restoring' && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => dismissUndo(toast.id)}
          className="dlg-x !h-7 !w-7 !ml-0"
        >
          <X size={14} />
        </button>
      )}
      {phase === 'idle' && (
        <span className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden" aria-hidden="true">
          {reduce ? (
            <span className="block h-full w-full" style={HUE_BG} />
          ) : (
            <motion.span
              data-testid="undo-progress"
              className="block h-full w-full origin-left"
              style={HUE_BG}
              initial={{ scaleX: 1 }}
              animate={{ scaleX: paused ? left : 0 }}
              transition={paused ? { duration: 0 } : { duration: (left * UNDO_MS) / 1000, ease: 'linear' }}
            />
          )}
        </span>
      )}
    </div>
  )
}

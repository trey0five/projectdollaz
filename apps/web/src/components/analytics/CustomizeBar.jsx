import { motion, useReducedMotion } from 'framer-motion'
import { Check, Loader2, RotateCcw, SlidersHorizontal, X, AlertTriangle } from 'lucide-react'

/**
 * Sticky customize-mode action bar (mirrors SaveBar vocabulary). Save / Cancel /
 * Reset-to-default with a dirty indicator. Owner-only — the parent only renders
 * this when in customize mode. Save is disabled when not dirty or while saving.
 * Slides in on enter and shows an animated gold dirty pulse; reduced-motion safe.
 */
export default function CustomizeBar({
  dirty,
  saving,
  error,
  onSave,
  onCancel,
  onReset,
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 26 }}
      className="sticky top-2 z-30 mb-5 flex flex-col gap-3 rounded-2xl border border-gold/50 bg-white/95 px-4 py-3 shadow-glow ring-1 ring-gold/10 backdrop-blur sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gold-gradient text-white shadow-glow">
          <SlidersHorizontal size={16} />
          {dirty && (
            <motion.span
              aria-hidden
              className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-white"
              animate={reduce ? undefined : { scale: [1, 1.35, 1] }}
              transition={reduce ? undefined : { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </span>
        <div>
          <p className="font-serif text-sm font-semibold text-navy">Customizing dashboard</p>
          <p className="text-[13px] text-muted">
            {dirty ? 'You have unsaved changes.' : 'Show, hide, reorder, and resize your metrics.'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {error && (
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-red-600">
            <AlertTriangle size={12} /> {error}
          </span>
        )}
        <button
          type="button"
          onClick={onReset}
          disabled={saving}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted transition-colors hover:border-gold/60 hover:text-navy disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw size={14} /> Reset to default
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted transition-colors hover:border-gold/60 hover:text-navy disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X size={14} /> Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed ${
            dirty && !saving
              ? 'bg-gold-gradient text-white hover:opacity-90'
              : 'border border-border text-muted'
          }`}
        >
          {saving ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Check size={14} /> Save layout
            </>
          )}
        </button>
      </div>
    </motion.div>
  )
}

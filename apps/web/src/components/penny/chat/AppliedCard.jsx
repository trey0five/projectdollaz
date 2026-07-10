// AppliedCard — the "here's what I changed" receipt Penny shows AFTER she has
// already executed a validated write autonomously (the backend ran applyAction
// in-process before emitting the SSE `applied` event). There are NO confirm /
// cancel buttons — the change is done and terminal; it's reversible via the
// normal screen. ProposalCard delegates to this when proposal.applied is true,
// so applied records ride the same persisted proposals[] array and rehydrate
// statically (no re-execute).
//
// The single distinguished case is tool === 'import_trial_balance': same shape,
// but a finance-specific header + the parsed-rows details list.
//
// A11Y: role=status so screen readers announce the result. Reduced motion skips
// the entrance animation. Navy/gold/emerald theme.
import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, FileSpreadsheet, RotateCcw, Undo2 } from 'lucide-react'

export default function AppliedCard({ proposal, onUndo, header: headerOverride, primaryAction }) {
  const reduce = useReducedMotion()
  const isImport = proposal?.tool === 'import_trial_balance'
  const summary = proposal?.summary || ''
  const details = Array.isArray(proposal?.details) ? proposal.details : []
  const status = proposal?.status
  const undone = proposal?.undone || status === 'undone'
  // Offer an inline Undo only for a genuinely reversible action that still carries a
  // log id and a handler, and hasn't already been undone.
  const canUndo = !undone && !!proposal?.reversible && !!proposal?.auditId && !!onUndo

  const Icon = isImport ? FileSpreadsheet : CheckCircle2
  // headerOverride lets a richer receipt (e.g. the draft-plan "Created your strategic
  // plan") speak its own verdict; primaryAction hangs an optional deep-link CTA under
  // the details. Both default off, so every existing caller is byte-identical.
  const header = headerOverride || (isImport ? 'Imported your trial balance' : 'Done — here’s what I changed')

  return (
    <motion.div
      role="status"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
      className="mt-2 overflow-hidden rounded-xl border border-emerald-300/70 bg-emerald-50/70 p-2.5 shadow-glow"
    >
      <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-emerald-700">
        <Icon size={13} aria-hidden /> {header}
      </p>

      {summary && <p className="mt-0.5 text-[14.5px] text-ink">{summary}</p>}

      {details.length > 0 && (
        <dl className="mt-2 space-y-1 rounded-lg border border-emerald-200/70 bg-white/70 px-2.5 py-2">
          {details.map((d, i) => (
            <div key={`${d.label}:${i}`} className="flex items-baseline justify-between gap-3">
              <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                {d.label}
              </dt>
              <dd className="text-[13.5px] font-semibold tabular-nums text-navy">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {primaryAction ? <div className="mt-2">{primaryAction}</div> : null}

      {undone ? (
        <p className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-700">
          <CheckCircle2 size={13} aria-hidden /> Undone
        </p>
      ) : status === 'undoing' ? (
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-muted">
          <RotateCcw size={12} aria-hidden className="motion-safe:animate-spin" /> Undoing…
        </p>
      ) : status === 'undo-error' ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-danger">Couldn’t undo — try again.</span>
          {onUndo ? (
            <button
              type="button"
              onClick={onUndo}
              className="inline-flex items-center gap-1 rounded-lg border border-navy/15 bg-white px-2.5 py-1 text-[12.5px] font-semibold text-navy/80 transition-colors hover:border-navy/30 hover:text-navy"
            >
              <Undo2 size={12} aria-hidden /> Retry undo
            </button>
          ) : null}
        </div>
      ) : canUndo ? (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] italic text-muted">Changed your mind?</span>
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/80 bg-white px-2.5 py-1 text-[12.5px] font-semibold text-emerald-800 transition-colors hover:border-emerald-400 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
          >
            <Undo2 size={12} aria-hidden /> Undo
          </button>
        </div>
      ) : (
        <p className="mt-1.5 text-[12px] italic text-muted">
          Reversible from the normal screen if you’d like to change it.
        </p>
      )}
    </motion.div>
  )
}

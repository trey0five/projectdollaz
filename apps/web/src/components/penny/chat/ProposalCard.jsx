// ProposalCard — a single proposed change Penny wants you to confirm. Extracted
// verbatim (states + apply path unchanged) from the former inline PennyChat JSX
// into a module export so there are no in-render component definitions.
//
// The apply path is UNCHANGED: onConfirm → confirmProposal(messageIndex, index,
// action) → assistantApi.apply. An `import_trial_balance` proposal (the new
// attach→import flow) reads with a finance-specific headline but applies through
// the exact same /apply route — the action payload is self-contained.
import { motion } from 'framer-motion'
import { CheckCircle2, FileSpreadsheet, Sparkles } from 'lucide-react'

export default function ProposalCard({ proposal, index, messageIndex, onConfirm, onCancel }) {
  const action = proposal?.action
  const status = proposal?.status
  const isImport = action?.kind === 'import_trial_balance'
  const heading = isImport ? 'Import this trial balance?' : 'Proposed change'

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="mt-2 overflow-hidden rounded-xl border border-gold/40 bg-gold/[0.07] p-2.5 shadow-glow"
    >
      <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-gold">
        {isImport ? <FileSpreadsheet size={13} aria-hidden /> : <Sparkles size={13} aria-hidden />}
        {heading}
      </p>
      <p className="mt-0.5 text-[14.5px] text-ink">{action?.summary}</p>

      {status === 'pending' ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => onConfirm(messageIndex, index, action)}
            className="rounded-lg bg-gold-gradient px-3 py-1 text-[14px] font-semibold text-navy shadow-sm transition-transform hover:-translate-y-px active:translate-y-0 motion-reduce:hover:translate-y-0"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => onCancel(messageIndex, index, 'cancelled')}
            className="rounded-lg border border-border px-3 py-1 text-[14px] font-semibold text-muted transition-colors hover:text-navy"
          >
            Cancel
          </button>
        </div>
      ) : status === 'applying' ? (
        <p className="mt-1 text-[14px] text-muted">Applying…</p>
      ) : status === 'applied' ? (
        <p className="mt-1 inline-flex items-center gap-1 text-[14px] font-semibold text-[#7a5e00]">
          <CheckCircle2 size={14} aria-hidden /> Applied
        </p>
      ) : status === 'error' ? (
        <p className="mt-1 text-[14px] text-danger">Couldn’t apply — try again.</p>
      ) : (
        <p className="mt-1 text-[14px] text-muted">Cancelled.</p>
      )}
    </motion.div>
  )
}

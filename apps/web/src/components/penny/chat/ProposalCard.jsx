// ProposalCard — a single proposed change Penny wants you to confirm. Extracted
// verbatim (states + apply path unchanged) from the former inline PennyChat JSX
// into a module export so there are no in-render component definitions.
//
// The apply path is UNCHANGED: onConfirm → confirmProposal(messageIndex, index,
// action) → assistantApi.apply. An `import_trial_balance` proposal (the new
// attach→import flow) reads with a finance-specific headline but applies through
// the exact same /apply route — the action payload is self-contained.
//
// file_document EXTENSION: when the pending proposal carries a `destination`, a
// "DETECTED DESTINATION · PICK ONE" chip picker renders above the confirm row.
// The detected chip is pre-selected (with its confidence %); the user may switch
// destination before confirming, and the chosen one is passed to onConfirm so it
// OVERRIDES the payload destination on /apply.
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck,
  CheckCircle2,
  FileSpreadsheet,
  Landmark,
  Library,
  Sparkles,
  Wrench,
} from 'lucide-react'
import AppliedCard from './AppliedCard.jsx'

// The four auto-file destinations (label + icon), mirroring the API's closed set.
// 'knowledge' is labelled "Knowledge only" to signal it does NOT create a module
// record (facilities does; accreditation/governance just tag + group).
const DESTINATIONS = [
  { key: 'facilities', label: 'Facilities', Icon: Wrench },
  { key: 'accreditation', label: 'Accreditation', Icon: BadgeCheck },
  { key: 'governance', label: 'Governance', Icon: Landmark },
  { key: 'knowledge', label: 'Knowledge only', Icon: Library },
]
const DESTINATION_LABEL = Object.fromEntries(DESTINATIONS.map((d) => [d.key, d.label]))

export default function ProposalCard({ proposal, index, messageIndex, onConfirm, onCancel }) {
  const action = proposal?.action
  const status = proposal?.status
  const isImport = action?.kind === 'import_trial_balance'
  const isFileDoc = action?.kind === 'file_document'
  const payload = action?.payload ?? {}
  // Only offer the picker when the backend actually classified a destination.
  const hasDestination = isFileDoc && typeof payload.destination === 'string'
  const heading = isImport ? 'Import this trial balance?' : 'Proposed change'

  // Local pick — initialised from the detected destination. Overrides the payload
  // value on confirm (backend re-validates + clamps it). Declared BEFORE the
  // applied-card early return so hooks run in a stable order every render.
  const [chosen, setChosen] = useState(hasDestination ? payload.destination : 'knowledge')

  // Autonomous writes ride the same proposals[] array, flagged applied:true with a
  // terminal status — render the receipt card instead of the confirm UI below.
  if (proposal?.applied) return <AppliedCard proposal={proposal} />

  const confidence =
    typeof payload.confidence === 'number' && Number.isFinite(payload.confidence)
      ? Math.round(payload.confidence)
      : null
  const rationale = typeof payload.rationale === 'string' ? payload.rationale : ''
  const confirmLabel = hasDestination
    ? `Confirm & file to ${DESTINATION_LABEL[chosen] ?? 'Knowledge'}`
    : 'Confirm'

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

      {hasDestination && status === 'pending' ? (
        <div className="mt-2.5 rounded-lg border border-navy/10 bg-white/60 p-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-navy/70">
            Detected destination · pick one
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DESTINATIONS.map((d) => {
              const selected = chosen === d.key
              const detected = payload.destination === d.key
              return (
                <button
                  key={d.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setChosen(d.key)}
                  className={
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-semibold transition-colors ' +
                    (selected
                      ? 'border-gold bg-gold-gradient text-navy shadow-sm'
                      : 'border-navy/15 bg-white text-navy/80 hover:border-navy/30 hover:text-navy')
                  }
                >
                  <d.Icon size={13} aria-hidden />
                  {d.label}
                  {detected && confidence != null ? (
                    <span
                      className={
                        'ml-0.5 rounded-full px-1.5 py-px text-[11px] font-bold ' +
                        (selected ? 'bg-navy/15 text-navy' : 'bg-navy/[0.06] text-navy/70')
                      }
                    >
                      {confidence}%
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
          {rationale ? (
            <p className="mt-1.5 text-[12.5px] leading-snug text-navy/70">{rationale}</p>
          ) : null}
        </div>
      ) : null}

      {status === 'pending' ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() =>
              onConfirm(messageIndex, index, action, hasDestination ? chosen : undefined)
            }
            className="rounded-lg bg-gold-gradient px-3 py-1 text-[14px] font-semibold text-navy shadow-sm transition-transform hover:-translate-y-px active:translate-y-0 motion-reduce:hover:translate-y-0"
          >
            {confirmLabel}
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

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
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  FileSpreadsheet,
  Landmark,
  Library,
  RotateCcw,
  Sparkles,
  Undo2,
  Wrench,
} from 'lucide-react'
import AppliedCard from './AppliedCard.jsx'
import DraftPlanProposalCard from './DraftPlanProposalCard.jsx'

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

export default function ProposalCard({ proposal, index, messageIndex, onConfirm, onCancel, onUndo }) {
  const action = proposal?.action
  const status = proposal?.status
  const isImport = action?.kind === 'import_trial_balance'
  const isFileDoc = action?.kind === 'file_document'
  // The "Penny drafts the plan" centerpiece — a whole strategy tree computed from
  // live numbers. We swap the plain eyebrow/summary for the rich preview body but
  // REUSE every confirm/cancel/applying/applied/error state below (no duplication).
  const isDraftPlan = action?.kind === 'draft_strategy_plan'
  const payload = action?.payload ?? {}
  // Only offer the picker when the backend actually classified a destination.
  const hasDestination = isFileDoc && typeof payload.destination === 'string'
  const heading = isImport ? 'Import this trial balance?' : 'Proposed change'

  // Local pick — initialised from the detected destination. Overrides the payload
  // value on confirm (backend re-validates + clamps it). Declared BEFORE the
  // applied-card early return so hooks run in a stable order every render.
  const [chosen, setChosen] = useState(hasDestination ? payload.destination : 'knowledge')

  // Autonomous writes ride the same proposals[] array, flagged applied:true with a
  // terminal status — render the receipt card instead of the confirm UI below. It
  // carries its own inline Undo when the action is reversible.
  if (proposal?.applied)
    return (
      <AppliedCard
        proposal={proposal}
        onUndo={onUndo ? () => onUndo(messageIndex, index, proposal) : undefined}
      />
    )

  const confidence =
    typeof payload.confidence === 'number' && Number.isFinite(payload.confidence)
      ? Math.round(payload.confidence)
      : null
  const rationale = typeof payload.rationale === 'string' ? payload.rationale : ''
  const confirmLabel = hasDestination
    ? `Confirm & file to ${DESTINATION_LABEL[chosen] ?? 'Knowledge'}`
    : isDraftPlan
      ? 'Create this plan'
      : 'Confirm'

  // Draft-plan receipt figures (read from the frozen §SEAM payload so the receipt
  // is truthful without a round-trip). Used only in the applied branch below.
  const draftPillars =
    payload?.counts?.pillars ?? (Array.isArray(payload?.pillars) ? payload.pillars.length : 0)
  const draftGoals =
    payload?.counts?.goals ??
    (Array.isArray(payload?.pillars)
      ? payload.pillars.reduce((n, p) => n + (Array.isArray(p?.goals) ? p.goals.length : 0), 0)
      : 0)
  const draftHorizon =
    payload?.fyStartYear && payload?.fyEndYear
      ? `FY${payload.fyStartYear}–FY${payload.fyEndYear}`
      : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="mt-2 overflow-hidden rounded-xl border border-penny/40 bg-penny/[0.07] p-2.5 shadow-penny-glow"
    >
      {isDraftPlan ? (
        <DraftPlanProposalCard payload={payload} />
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-penny">
            {isImport ? <FileSpreadsheet size={13} aria-hidden /> : <Sparkles size={13} aria-hidden />}
            {heading}
          </p>
          <p className="mt-0.5 text-[14.5px] text-ink">{action?.summary}</p>
        </>
      )}

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
                      ? 'border-penny bg-penny-gradient text-navy shadow-sm'
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
            className="rounded-lg bg-penny-gradient px-3 py-1 text-[14px] font-semibold text-navy shadow-sm transition-transform hover:-translate-y-px active:translate-y-0 motion-reduce:hover:translate-y-0"
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
      ) : isDraftPlan &&
        (status === 'applied' ||
          status === 'undoing' ||
          status === 'undone' ||
          status === 'undo-error') ? (
        // Rich receipt: reuse AppliedCard (custom header + a deep-link CTA) so the
        // created plan reads as a real, reversible artifact with one tap to open it.
        // Pass the LIVE status through so AppliedCard owns the undoing/undone/undo-error
        // sub-states — the whole receipt stays intact through an Undo (not a bare line).
        <AppliedCard
          header="Created your strategic plan"
          proposal={{
            summary: payload?.isStarter
              ? 'A starter plan to build on — connect your financials to compute live targets.'
              : 'Your goals will now measure themselves against your live numbers.',
            details: [
              { label: 'Pillars', value: draftPillars },
              { label: 'Goals', value: draftGoals },
              ...(draftHorizon ? [{ label: 'Horizon', value: draftHorizon }] : []),
            ],
            reversible: !!proposal?.reversible,
            auditId: proposal?.auditId ?? null,
            status,
          }}
          primaryAction={
            <Link
              to="/strategy"
              className="inline-flex items-center gap-1.5 rounded-lg bg-penny-gradient px-3 py-1 text-[14px] font-semibold text-navy shadow-sm transition-transform hover:-translate-y-px active:translate-y-0 motion-reduce:hover:translate-y-0"
            >
              Open the plan <ArrowRight size={14} aria-hidden />
            </Link>
          }
          onUndo={
            proposal?.reversible && proposal?.auditId && onUndo
              ? () => onUndo(messageIndex, index, proposal)
              : undefined
          }
        />
      ) : status === 'applied' ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#7a5e00]">
            <CheckCircle2 size={14} aria-hidden /> Applied
          </span>
          {proposal?.reversible && proposal?.auditId && onUndo ? (
            <button
              type="button"
              onClick={() => onUndo(messageIndex, index, proposal)}
              className="inline-flex items-center gap-1 rounded-lg border border-navy/15 bg-white px-2.5 py-1 text-[13px] font-semibold text-navy/80 transition-colors hover:border-navy/30 hover:text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-penny/60"
            >
              <Undo2 size={13} aria-hidden /> Undo
            </button>
          ) : null}
        </div>
      ) : status === 'undoing' ? (
        <p className="mt-1 inline-flex items-center gap-1.5 text-[14px] text-muted">
          <RotateCcw size={13} aria-hidden className="motion-safe:animate-spin" /> Undoing…
        </p>
      ) : status === 'undone' ? (
        <p className="mt-1 inline-flex items-center gap-1 text-[14px] font-semibold text-emerald-700">
          <CheckCircle2 size={14} aria-hidden /> Undone
        </p>
      ) : status === 'undo-error' ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-[14px] text-danger">Couldn’t undo — try again.</span>
          {onUndo ? (
            <button
              type="button"
              onClick={() => onUndo(messageIndex, index, proposal)}
              className="inline-flex items-center gap-1 rounded-lg border border-navy/15 bg-white px-2.5 py-1 text-[13px] font-semibold text-navy/80 transition-colors hover:border-navy/30 hover:text-navy"
            >
              <Undo2 size={13} aria-hidden /> Retry undo
            </button>
          ) : null}
        </div>
      ) : status === 'error' ? (
        <p className="mt-1 text-[14px] text-danger">Couldn’t apply — try again.</p>
      ) : (
        <p className="mt-1 text-[14px] text-muted">Cancelled.</p>
      )}
    </motion.div>
  )
}

import { motion } from 'framer-motion'
import { AlertOctagon, CheckCircle2, Info } from 'lucide-react'
import { fmt } from '../lib/format.js'

// Resolve the articulation state purely in the web layer (the engine stays
// frozen — no `status` field). Derived from the engine's `balanced` flag plus
// the OPENING_EQUITY_EXTERNAL issue code:
//   - !balanced              -> 'unbalanced' (complete TB that doesn't net)
//   - balanced + that issue  -> 'opening_external' (management TB, informational)
//   - balanced, no issue     -> 'balanced'
function resolveStatus(validation) {
  if (!validation.balanced) return 'unbalanced'
  const hasOpeningExternal = (validation.issues ?? []).some(
    (i) => i.code === 'OPENING_EQUITY_EXTERNAL'
  )
  return hasOpeningExternal ? 'opening_external' : 'balanced'
}

// In a difference field a true zero should read "0.00", not the accounting
// em-dash fmt() uses for empty cells — otherwise the balanced state would
// show "difference —", which scans as missing data rather than "in balance".
function fmtDiff(n) {
  return n === 0 ? '0.00' : fmt(n)
}

/** Slim figures line shared by all three states. */
function Figures({ totalDebits, totalCredits, difference }) {
  return (
    <>
      Total debits {fmt(totalDebits)} · total credits {fmt(totalCredits)} · difference{' '}
      {fmtDiff(difference)}
    </>
  )
}

const STATES = {
  // COMPLETE TB that nets to zero — calm, slim confirmation (navy on cream).
  balanced: {
    container:
      'no-print mb-6 overflow-hidden rounded-lg border border-l-4 border-rule border-l-navy bg-cream px-5 py-3',
    headerClass: 'text-navy',
    bodyClass: 'text-muted',
    Icon: CheckCircle2,
    eyebrow: 'Trial Balance In Balance',
    body: ({ totalDebits, totalCredits, difference }) => (
      <>
        Debits and credits articulate. Total debits {fmt(totalDebits)} = total credits{' '}
        {fmt(totalCredits)} (difference {fmtDiff(difference)}).
      </>
    ),
  },
  // COMPLETE TB that does NOT net — red error (preserved treatment).
  unbalanced: {
    container:
      'no-print mb-6 overflow-hidden rounded-lg border border-l-4 border-[#e0a0a0] border-l-danger bg-[#fdeeee] px-5 py-4',
    headerClass: 'text-danger',
    bodyClass: 'text-[#6a1414]',
    Icon: AlertOctagon,
    eyebrow: 'Trial Balance Out of Balance',
    body: ({ totalDebits, totalCredits, difference }) => (
      <>
        Debits and credits do not net to zero. Total debits {fmt(totalDebits)} vs total
        credits {fmt(totalCredits)} — difference {fmt(difference)}. Review the imported
        trial balance before relying on these statements.
      </>
    ),
  },
  // MANAGEMENT TB omitting the opening-equity row — neutral amber info.
  opening_external: {
    container:
      'no-print mb-6 overflow-hidden rounded-lg border border-l-4 border-[#e8c96a] border-l-gold bg-[#fff8e6] px-5 py-4',
    headerClass: 'text-[#7a5e00]',
    bodyClass: 'text-[#5a4400]',
    Icon: Info,
    eyebrow: 'Opening Net Assets Supplied Externally',
    body: ({ totalDebits, totalCredits, difference }) => (
      <>
        This management trial balance omits the opening net-assets (equity) row, so debits
        and credits are not asserted to net to zero.{' '}
        <Figures
          totalDebits={totalDebits}
          totalCredits={totalCredits}
          difference={difference}
        />{' '}
        — the difference equals the externally-supplied opening net assets. This is
        informational, not an error.
      </>
    ),
  },
}

/**
 * Always-visible debits=credits articulation banner. Renders one of three
 * states keyed off validation.status: balanced (slim confirmation),
 * unbalanced (red error), opening_external (neutral amber info).
 */
export default function ValidationBanner({ validation }) {
  if (!validation) return null
  const status = resolveStatus(validation)
  const state = STATES[status] ?? STATES.balanced
  const { totalDebits, totalCredits, difference } = validation
  const { Icon } = state

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className={state.container}
    >
      <h4
        className={`mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] ${state.headerClass}`}
      >
        <Icon size={14} /> {state.eyebrow}
      </h4>
      <div className={`text-xs ${state.bodyClass}`}>
        {state.body({ totalDebits, totalCredits, difference })}
      </div>
    </motion.div>
  )
}

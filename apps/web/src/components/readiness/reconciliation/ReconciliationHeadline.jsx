import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react'
import { fmtDollar } from '../../../lib/format.js'
import { StatStrip, Stat, Pill } from '../../ui/surface/index.js'

// Premium UI P4: status = a Pill with a 2px mark (matched good / variance risk /
// needs data neutral), the four figures a StatStrip, the agreement meter two
// 2px-capped rules (blue = disbursed, ink = recorded; the recorded rule takes
// the risk colour only when the engine says "variance"). No tinted card.
const STATUS_META = {
  matched: {
    label: 'Matched',
    Icon: CheckCircle2,
    tone: 'good',
    blurb: 'The recorded scholarship revenue agrees with the funding-org disbursements (within tolerance).',
  },
  variance: {
    label: 'Variance',
    Icon: AlertTriangle,
    tone: 'risk',
    blurb: 'The recorded scholarship revenue differs from the funding-org disbursements beyond tolerance — investigate before the AUP.',
  },
  needs_data: {
    label: 'Needs data',
    Icon: HelpCircle,
    tone: 'neutral',
    blurb: 'Enter the recorded scholarship revenue (in the compliance intake) and import the funding-org disbursements to reconcile.',
  },
}

/**
 * An "agreement meter": two bars (disbursed, recorded) scaled to whichever
 * figure is larger, so the eye reads how closely the books track the funding
 * org. Pure presentation over the SAME numbers the engine returned — it never
 * recomputes status/variance. Hidden when there is no recorded figure yet.
 */
function AgreementMeter({ totalDisbursed, recorded, status }) {
  const reduce = useReducedMotion()
  if (recorded == null) return null
  const scale = Math.max(Math.abs(totalDisbursed), Math.abs(recorded), 1)
  const disbPct = Math.min(100, (Math.abs(totalDisbursed) / scale) * 100)
  const recPct = Math.min(100, (Math.abs(recorded) / scale) * 100)
  const recBar = status === 'variance' ? 'bg-risk' : 'bg-ink'
  const rows = [
    { key: 'disb', label: 'Disbursed (funding org)', pct: disbPct, bar: 'bg-[#2563EB]', val: totalDisbursed },
    { key: 'rec', label: 'Recorded (per books)', pct: recPct, bar: recBar, val: recorded },
  ]
  return (
    <div className="mt-4 space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] sm:flex-nowrap">
          <span className="w-full shrink-0 font-semibold text-ink2 sm:w-44">{r.label}</span>
          <div className="relative h-2.5 min-w-0 flex-1 bg-ink/[0.06]">
            <motion.div
              className={`h-full rounded-r-[2px] ${r.bar}`}
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${Math.max(r.pct, 1.5)}%` }}
              transition={{ duration: 0.55, delay: 0.1 + i * 0.1, ease: 'easeOut' }}
            />
          </div>
          <span className="w-28 shrink-0 text-right font-semibold tabular-nums text-ink">{fmtDollar(r.val)}</span>
        </div>
      ))}
    </div>
  )
}

/** The headline match/variance/needs_data verdict + the figures + variance. */
export default function ReconciliationHeadline({ result }) {
  const reduce = useReducedMotion()
  const meta = STATUS_META[result.status] ?? STATUS_META.needs_data
  const Icon = meta.Icon
  const varTone = result.variance == null || result.variance === 0 ? undefined : 'risk'

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Pill variant="status" tone={meta.tone}>
            <Icon size={11} aria-hidden="true" />
            {meta.label}
          </Pill>
          <p className="mt-1.5 max-w-xl text-small text-ink2">{meta.blurb}</p>
        </div>
      </div>

      <StatStrip cols={result.variancePct != null ? 5 : 4} className="stats-wrap stats-compact mt-3 border-t border-hair">
        <Stat label="Total disbursed (funding org)" value={result.totalDisbursed == null ? null : fmtDollar(result.totalDisbursed)} />
        <Stat label="Recorded scholarship revenue" value={result.recordedScholarshipRevenue == null ? null : fmtDollar(result.recordedScholarshipRevenue)} />
        <Stat label="Variance (recorded − disbursed)" value={result.variance == null ? null : fmtDollar(result.variance)} status={varTone} />
        {result.variancePct != null && (
          <Stat
            label="Variance %"
            value={`${result.variancePct > 0 ? '+' : ''}${result.variancePct.toFixed(2)}%`}
            status={varTone}
          />
        )}
        <Stat label="Disbursements" value={result.count} />
      </StatStrip>

      <AgreementMeter
        totalDisbursed={result.totalDisbursed}
        recorded={result.recordedScholarshipRevenue}
        status={result.status}
      />
    </motion.div>
  )
}

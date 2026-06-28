import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react'
import { fmtDollar } from '../../../lib/format.js'

// matched=good (gold), variance=watch/risk, needs_data=neutral. Reuses the
// health palette — zero new colors.
const STATUS_META = {
  matched: {
    label: 'Matched',
    Icon: CheckCircle2,
    ring: 'border-gold/40 bg-gold/5',
    pill: 'bg-gold/10 text-[#7a5e00] border-gold/40',
    dot: 'bg-gold',
    blurb: 'The recorded scholarship revenue agrees with the funding-org disbursements (within tolerance).',
  },
  variance: {
    label: 'Variance',
    Icon: AlertTriangle,
    ring: 'border-danger/30 bg-danger/5',
    pill: 'bg-danger/10 text-danger border-danger/30',
    dot: 'bg-danger',
    blurb: 'The recorded scholarship revenue differs from the funding-org disbursements beyond tolerance — investigate before the AUP.',
  },
  needs_data: {
    label: 'Needs data',
    Icon: HelpCircle,
    ring: 'border-rule bg-section',
    pill: 'bg-section text-muted border-border',
    dot: 'bg-border',
    blurb: 'Enter the recorded scholarship revenue (in the compliance intake) and import the funding-org disbursements to reconcile.',
  },
}

function Figure({ label, value, accent }) {
  return (
    <div className="flex-1">
      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className={`mt-0.5 font-serif text-lg font-semibold tabular-nums ${accent ?? 'text-navy'}`}>
        {value == null ? '—' : fmtDollar(value)}
      </p>
    </div>
  )
}

/**
 * An on-theme "agreement meter": two bars (disbursed gold, recorded navy) scaled
 * to whichever figure is larger, so the eye reads how closely the books track the
 * funding org. Pure presentation over the SAME numbers the engine returned — it
 * never recomputes status/variance. Hidden when there is no recorded figure yet.
 */
function AgreementMeter({ totalDisbursed, recorded, status }) {
  const reduce = useReducedMotion()
  if (recorded == null) return null
  const scale = Math.max(Math.abs(totalDisbursed), Math.abs(recorded), 1)
  const disbPct = Math.min(100, (Math.abs(totalDisbursed) / scale) * 100)
  const recPct = Math.min(100, (Math.abs(recorded) / scale) * 100)
  const recBar = status === 'variance' ? 'bg-danger/70' : 'bg-navy'
  const rows = [
    { key: 'disb', label: 'Disbursed (funding org)', pct: disbPct, bar: 'bg-gold-gradient', val: totalDisbursed },
    { key: 'rec', label: 'Recorded (per books)', pct: recPct, bar: recBar, val: recorded },
  ]
  return (
    <div className="mt-4 space-y-2.5 border-t border-rule/50 pt-4">
      {rows.map((r, i) => (
        <div key={r.key} className="flex items-center gap-3 text-[13px]">
          <span className="w-40 shrink-0 font-semibold text-muted">{r.label}</span>
          <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-section">
            <motion.div
              className={`h-full rounded-full ${r.bar}`}
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${Math.max(r.pct, 1.5)}%` }}
              transition={{ duration: 0.55, delay: 0.1 + i * 0.1, ease: 'easeOut' }}
            />
          </div>
          <span className="w-28 shrink-0 text-right font-semibold tabular-nums text-navy">
            {fmtDollar(r.val)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The headline match/variance/needs_data hero + the two figures + variance. */
export default function ReconciliationHeadline({ result }) {
  const reduce = useReducedMotion()
  const meta = STATUS_META[result.status] ?? STATUS_META.needs_data
  const Icon = meta.Icon
  const varianceAccent =
    result.variance == null ? 'text-navy' : result.variance === 0 ? 'text-navy' : 'text-danger'

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`rounded-2xl border p-5 ${meta.ring}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-xl border ${meta.pill}`}>
            <Icon size={22} />
          </span>
          <div>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold uppercase tracking-[0.08em] ${meta.pill}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
            <p className="mt-1 max-w-xl text-[14px] text-muted">{meta.blurb}</p>
          </div>
        </div>
        {result.variancePct != null && (
          <div className="text-right">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Variance %</p>
            <p className={`font-serif text-xl font-semibold tabular-nums ${varianceAccent}`}>
              {result.variancePct > 0 ? '+' : ''}
              {result.variancePct.toFixed(2)}%
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-rule/50 pt-4">
        <Figure label="Total disbursed (funding org)" value={result.totalDisbursed} />
        <Figure label="Recorded scholarship revenue" value={result.recordedScholarshipRevenue} />
        <Figure
          label="Variance (recorded − disbursed)"
          value={result.variance}
          accent={varianceAccent}
        />
        <div className="flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Disbursements</p>
          <p className="mt-0.5 font-serif text-lg font-semibold tabular-nums text-navy">{result.count}</p>
        </div>
      </div>

      <AgreementMeter
        totalDisbursed={result.totalDisbursed}
        recorded={result.recordedScholarshipRevenue}
        status={result.status}
      />
    </motion.div>
  )
}

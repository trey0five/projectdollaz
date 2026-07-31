// ─────────────────────────────────────────────────────────────────────────────
// ProvenancePair — Phase A: readiness is NEVER one blended number.
//
// Every readiness figure on the hero is rendered as a PAIR, side by side, on one
// shared caption:
//
//   Documented 78   ·   Defensible 61
//   24 of 31 standards scored, 19 evidenced.
//
//   Documented = your own rubric self-scoring (what you say).
//   Defensible = the share of standards evidence actually backs (what you can show).
//
// The two must never be averaged into a headline, and must never be split across
// screens — the whole point is that the DIFFERENCE is visible, because that
// difference is the work list an accreditor will ask about. Documented is drawn
// translucent-and-outlined (asserted); Defensible is drawn solid (proven), so the
// hierarchy reads without relying on colour alone — the labels carry it too.
//
// Honesty rule: both figures and the caption's three counts come from ONE
// instant — the live readiness payload, computed by the same engine over the
// same leaf set. They are never stitched together from a recorded snapshot and
// a live count, because those describe different moments and the sentence they
// produce can contradict itself. When either figure is missing we render an
// explicit pending state; we never estimate one, and we never fall back to the
// blended readiness figure.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { FileCheck2, PenLine } from 'lucide-react'

/** One half of the pair. `solid` marks the evidence-backed (Defensible) side.
 *  (Icon is read off `props` — the house workaround for the lint rule that misses
 *  destructured JSX component props, same as IconAction on the register page.) */
function Half(props) {
  const { label, value, hint, solid, reduce } = props
  const Icon = props.Icon
  const pct = typeof value === 'number' ? Math.min(Math.max(value, 0), 100) : null
  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
        <Icon size={12} aria-hidden />
        {label}
      </p>
      <p className="mt-0.5 font-serif leading-none text-[#fbbf24]">
        {pct == null ? (
          <span className="text-[30px] text-white/35" aria-label={`${label} not yet recorded`}>
            —
          </span>
        ) : (
          <>
            <span className="text-[34px] font-semibold sm:text-[38px]">{pct}</span>
            <span className="ml-0.5 text-[16px] font-semibold text-[#fbbf24]/70">%</span>
          </>
        )}
      </p>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuenow={pct ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={pct == null ? `${label} not yet recorded` : `${label} ${pct}%`}
      >
        {pct == null ? null : (
          <motion.div
            className={`h-full rounded-full ${solid ? '' : 'border border-[#fbbf24]/60'}`}
            style={
              solid
                ? { background: 'linear-gradient(90deg, #fde68a 0%, #fbbf24 55%, #f59e0b 100%)' }
                : { background: 'rgba(251,191,36,0.22)' }
            }
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 60, damping: 18 }}
          />
        )}
      </div>
      <p className="mt-1.5 text-[11.5px] leading-snug text-white/45">{hint}</p>
    </div>
  )
}

export default function ProvenancePair({
  documentedPct = null,
  defensiblePct = null,
  scoredCount = 0,
  coveredCount = 0,
  leafCount = 0,
  reduce = false,
}) {
  const hasPair = typeof documentedPct === 'number' && typeof defensiblePct === 'number'
  // Exact counts only — never derived, never estimated.
  const unscored = Math.max(leafCount - scoredCount, 0)
  const unevidenced = Math.max(leafCount - coveredCount, 0)
  const gap = hasPair ? documentedPct - defensiblePct : null

  return (
    <div className="rounded-2xl border border-white/10 bg-navy/40 p-4">
      <div className="flex items-start gap-4 sm:gap-6">
        <Half
          label="Documented"
          value={documentedPct}
          hint="What you have scored yourself"
          Icon={PenLine}
          solid={false}
          reduce={reduce}
        />
        <div className="mt-6 h-10 w-px shrink-0 bg-white/12" aria-hidden />
        <Half
          label="Defensible"
          value={defensiblePct}
          hint="What attached evidence backs"
          Icon={FileCheck2}
          solid
          reduce={reduce}
        />
      </div>

      {/* The ONE shared caption — the pair is a single statement, never two cards. */}
      <p className="mt-3 border-t border-white/10 pt-3 text-[12.5px] leading-relaxed text-white/65">
        {leafCount > 0 ? (
          <>
            <span className="font-semibold text-white/80">
              {scoredCount} of {leafCount}
            </span>{' '}
            standards scored,{' '}
            <span className="font-semibold text-white/80">{coveredCount}</span> evidenced.
          </>
        ) : (
          <>No scorable standards in this register yet.</>
        )}
        {hasPair ? (
          gap > 0 ? (
            <>
              {' '}
              The {gap}-point gap is the work list:{' '}
              <span className="font-semibold text-[#fde68a]">
                {unevidenced} standard{unevidenced === 1 ? '' : 's'}
              </span>{' '}
              carry no evidence an accreditor could read.
            </>
          ) : gap < 0 ? (
            unscored > 0 ? (
              <>
                {' '}
                Your evidence is ahead of your scoring —{' '}
                <span className="font-semibold text-[#fde68a]">
                  {unscored} standard{unscored === 1 ? '' : 's'}
                </span>{' '}
                still unscored.
              </>
            ) : (
              <> Evidence covers more than your rubric scoring currently claims.</>
            )
          ) : (
            <> Scoring and evidence are level.</>
          )
        ) : (
          <>
            {' '}
            Documented and Defensible are not available for this register yet — we show neither
            rather than guess.
          </>
        )}
      </p>
    </div>
  )
}

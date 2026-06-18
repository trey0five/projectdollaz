import { motion, useReducedMotion } from 'framer-motion'
import { CalendarClock, ScrollText } from 'lucide-react'
import StatusDot from '../analytics/StatusDot.jsx'
import TierSelector from './TierSelector.jsx'

function usd(n) {
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

/**
 * The $250k AUP-trigger header: a hero card showing whether an AUP is required
 * this year (with the Sept 15 due-date note), the ruleset version + statute year,
 * and the program-tier selector (a read-only mirror of the intake's `programs`).
 */
export default function TriggerHeader({
  summary,
  scholarshipFunds,
  rulesetVersion,
  statuteYear,
  programs = [],
}) {
  const reduce = useReducedMotion()
  const hasFigure = scholarshipFunds !== null && scholarshipFunds !== undefined
  const requiresAup = Boolean(summary?.requiresAup)

  // badge palette: required -> watch (amber), figure entered & not required -> good, missing -> neutral.
  const badge = !hasFigure
    ? { palette: 'neutral', label: 'Needs scholarship figure' }
    : requiresAup
      ? { palette: 'watch', label: 'AUP Required' }
      : { palette: 'good', label: 'AUP Not Required' }

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl bg-navy-gradient p-6 shadow-navy-glow"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        {/* LEFT: the trigger verdict */}
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-gold-light">
            <StatusDot status={badge.palette} size={8} />
            {badge.label}
          </span>
          <div className="mt-3">
            {hasFigure ? (
              <p className="gold-text font-serif text-2xl font-semibold">
                {usd(scholarshipFunds)} received
              </p>
            ) : (
              <p className="font-serif text-xl font-semibold text-white/80">
                Enter scholarship funds in the intake below
              </p>
            )}
          </div>
          {requiresAup && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-gold-light">
              <CalendarClock size={15} /> AUP report due September 15
            </p>
          )}
          <p className="mt-2 text-[12px] text-white/60">
            The $250,000 aggregate threshold determines whether a CPA AUP engagement
            is required this school year.
          </p>
        </div>

        {/* RIGHT: ruleset meta */}
        <div className="shrink-0 text-left sm:text-right">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">
            <ScrollText size={13} className="text-gold-light" />
            Ruleset
          </span>
          <p className="mt-1 font-mono text-[12px] text-gold-light">
            fl-scholarship-aup v{rulesetVersion}
          </p>
          <p className="text-[11px] text-white/50">statute year {statuteYear}</p>
        </div>
      </div>

      {/* TIER SELECTOR (read-only mirror; edit it in the intake form) */}
      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">
          Program tiers
        </p>
        {programs.length > 0 ? (
          <TierSelector selected={programs} size="sm" />
        ) : (
          <p className="text-[12px] italic text-white/50">
            None selected — choose your tiers in the intake form to scope the
            FES-UA checks.
          </p>
        )}
      </div>
    </motion.div>
  )
}

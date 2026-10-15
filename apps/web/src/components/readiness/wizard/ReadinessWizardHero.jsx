// ─────────────────────────────────────────────────────────────────────────────
// ReadinessWizardHero — the catchy top of the Review-Readiness wizard. Answers
// the first-timer's question at a glance: "Am I ready for the AUP, and what do I
// do next?" A navy-gradient hero with the $250k trigger verdict, an animated
// progress ring (steps completed), and ONE next-action CTA that jumps to the
// first unfinished step (or the workpapers export when everything is done).
// Presentational only. Reduced-motion safe.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, CalendarClock, CheckCircle2, ScrollText } from 'lucide-react'
import { Pill, Button } from '../../ui/surface/index.js'

function usd(n) {
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

// Animated SVG progress ring: R=46, stroke 9. Draws to `pct` on mount/update.
// The progress ring, monochrome (Premium UI: ink track, primary-blue stroke,
// drawn once). The count sits in Garamond in the middle.
function ProgressRing({ pct, done, total, reduce }) {
  const R = 46
  const C = 2 * Math.PI * R
  const clamped = Math.max(0, Math.min(100, pct))
  const offset = C - (clamped / 100) * C
  return (
    <div
      className="relative flex h-[120px] w-[120px] shrink-0 items-center justify-center"
      role="img"
      aria-label={`${done} of ${total} steps done`}
    >
      <svg width="120" height="120" viewBox="0 0 128 128" className="-rotate-90" aria-hidden="true">
        <circle cx="64" cy="64" r={R} fill="none" stroke="rgb(16 28 61 / 0.08)" strokeWidth="6" />
        <motion.circle
          cx="64"
          cy="64"
          r={R}
          fill="none"
          stroke="#2563EB"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: reduce ? offset : C }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: reduce ? 0 : 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="font-serif text-[30px] font-medium leading-none tabular-nums text-ink">{done}</span>
        <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">of {total} done</span>
      </div>
    </div>
  )
}

// Premium UI P4: the verdict sits ON THE GROUND (no dark stage — those are
// reserved for the Home briefing band and the KYRO Studio hero): a status Pill,
// the Garamond verdict, the one next action as the primary Button, and the
// progress ring at the right, all closed by a hairline.
export default function ReadinessWizardHero({
  hasFigure,
  requiresAup,
  scholarshipFunds,
  doneCount,
  totalSteps,
  allDone,
  nextLabel,
  onNext,
  rulesetVersion,
  statuteYear,
}) {
  const reduce = useReducedMotion()
  const pct = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0

  // Verdict copy + tone by state.
  let badge
  let headline
  let sub
  if (!hasFigure) {
    badge = { tone: 'neutral', label: 'Let’s get started' }
    headline = 'Let’s get you AUP-ready.'
    sub = 'Start with Step 1 — enter your scholarship funds and a few attestations. Everything else builds from there.'
  } else if (requiresAup) {
    badge = { tone: 'watch', label: 'AUP required' }
    headline = `${usd(scholarshipFunds)} received`
    sub = 'You’re over the $250,000 threshold, so a CPA Agreed-Upon-Procedures engagement is required this year. Work the steps below to be ready.'
  } else {
    badge = { tone: 'good', label: 'AUP not required' }
    headline = `${usd(scholarshipFunds)} received`
    sub = 'You’re under the $250,000 threshold — no CPA AUP engagement is required this school year. You can still self-check below.'
  }

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col gap-6 border-b border-hair pb-6 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="min-w-0">
        <Pill variant="status" tone={badge.tone}>
          {badge.label}
        </Pill>
        <h2 className="mt-3 font-serif text-[30px] font-medium leading-[36px] text-ink sm:text-[36px] sm:leading-[42px]">
          {headline}
        </h2>
        <p className="mt-2 max-w-xl text-body text-ink2">{sub}</p>

        {requiresAup && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-small font-semibold text-ink">
            <CalendarClock size={14} aria-hidden="true" className="text-ink2" /> AUP report due September 15
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={onNext}>
            {allDone ? (
              <>
                <CheckCircle2 size={14} aria-hidden="true" /> Export workpapers for your CPA
              </>
            ) : (
              <>
                {nextLabel} <ArrowRight size={14} aria-hidden="true" />
              </>
            )}
          </Button>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
            <ScrollText size={12} aria-hidden="true" />
            fl-scholarship-aup v{rulesetVersion} · statute {statuteYear}
          </span>
        </div>
      </div>

      <ProgressRing pct={pct} done={doneCount} total={totalSteps} reduce={reduce} />
    </motion.div>
  )
}

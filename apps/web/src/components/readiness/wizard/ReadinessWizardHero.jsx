// ─────────────────────────────────────────────────────────────────────────────
// ReadinessWizardHero — the catchy top of the Review-Readiness wizard. Answers
// the first-timer's question at a glance: "Am I ready for the AUP, and what do I
// do next?" A navy-gradient hero with the $250k trigger verdict, an animated
// progress ring (steps completed), and ONE next-action CTA that jumps to the
// first unfinished step (or the workpapers export when everything is done).
// Presentational only. Reduced-motion safe.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, CalendarClock, CheckCircle2, ScrollText, Sparkles } from 'lucide-react'

function usd(n) {
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

// Animated SVG progress ring: R=46, stroke 9. Draws to `pct` on mount/update.
function ProgressRing({ pct, done, total, reduce }) {
  const R = 46
  const C = 2 * Math.PI * R
  const clamped = Math.max(0, Math.min(100, pct))
  const offset = C - (clamped / 100) * C
  return (
    <div className="relative flex h-[128px] w-[128px] shrink-0 items-center justify-center">
      <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
        <circle cx="64" cy="64" r={R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="9" />
        <motion.circle
          cx="64"
          cy="64"
          r={R}
          fill="none"
          stroke="url(#ring-grad)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: reduce ? offset : C }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: reduce ? 0 : 1, ease: [0.22, 1, 0.36, 1] }}
        />
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7DD3FC" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-[26px] font-semibold leading-none text-white">{done}</span>
        <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50">
          of {total} done
        </span>
      </div>
    </div>
  )
}

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

  // Verdict copy + accent by state.
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

  const badgeCls =
    badge.tone === 'good'
      ? 'bg-emerald-400/15 text-emerald-200 border-emerald-300/30'
      : badge.tone === 'watch'
        ? 'bg-amber-400/15 text-amber-100 border-amber-300/30'
        : 'bg-white/10 text-white/70 border-white/20'

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl bg-navy-gradient p-6 shadow-navy-glow sm:p-8"
    >
      {/* decorative glow */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#2563EB]/25 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(125,211,252,0.6), transparent)' }}
      />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-bold uppercase tracking-[0.1em] ${badgeCls}`}
          >
            {badge.tone === 'good' ? <CheckCircle2 size={13} /> : <Sparkles size={13} />}
            {badge.label}
          </span>
          <h1 className="mt-3 font-serif text-[30px] font-semibold leading-tight text-white sm:text-[38px]">
            {headline}
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/70">{sub}</p>

          {requiresAup && (
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1 text-[13.5px] font-semibold text-sky-100">
              <CalendarClock size={14} /> AUP report due September 15
            </span>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <motion.button
              type="button"
              whileTap={reduce ? undefined : { scale: 0.97 }}
              onClick={onNext}
              className="inline-flex items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#7dd3fc,#3b82f6,#2563eb)] px-6 py-3 text-[14px] font-bold text-white shadow-[0_10px_30px_-8px_rgba(37,99,235,0.7)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 motion-reduce:hover:translate-y-0"
            >
              {allDone ? (
                <>
                  <CheckCircle2 size={16} /> Export workpapers for your CPA
                </>
              ) : (
                <>
                  {nextLabel} <ArrowRight size={16} />
                </>
              )}
            </motion.button>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium uppercase tracking-[0.08em] text-white/45">
              <ScrollText size={12} className="text-sky-300" />
              fl-scholarship-aup v{rulesetVersion} · statute {statuteYear}
            </span>
          </div>
        </div>

        <ProgressRing pct={pct} done={doneCount} total={totalSteps} reduce={reduce} />
      </div>
    </motion.div>
  )
}

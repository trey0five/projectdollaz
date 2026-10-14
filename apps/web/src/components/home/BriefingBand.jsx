// ─────────────────────────────────────────────────────────────────────────────
// BriefingBand — the HOME v2 hero above the tile map: THE ONE DARK STAGE the
// app keeps (Premium UI P2 §2.1 — the other is the Studio hero). Ink #0A1628,
// blue light only (`.stage` + AuroraFlow), no glass, no purple, no gold except
// KYRO's own Play control.
//   LEFT   greeting ("Good evening, {name}.") + "N things that need your
//          attention" + the actions (Open Daily Briefing → onOpenBrief('open');
//          ▶ Play → onOpenBrief('narrate')).
//   RIGHT  the top-3 performing metrics as in-stage Stats (BriefingPerformers,
//          self-contained + fail-soft — renders nothing when there's no genuine
//          win to show).
// Empty school (no saved period): the onboarding line + "Add your trial balance →"
// deep-linking the finance Add-data tab directly (never via the /data redirect).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Sparkles, Play, ArrowRight, Database, School, Clock } from 'lucide-react'
import { LENS_VERB, greeting } from './tileRegistry.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { Button } from '../ui/surface/index.js'
import AuroraFlow from './AuroraFlow.jsx'
import BriefingPerformers from './BriefingPerformers.jsx'
import SchoolCrest from './SchoolCrest.jsx'

export default function BriefingBand({
  summary,
  lens,
  hasPeriod,
  onOpenBrief,
  // School scope (a real saved period) → the top-3 performer stats fetch against
  // these. Absent (org scope / no period) → BriefingPerformers renders nothing.
  schoolId = null,
  periodId = null,
  // School scope (from a multi-school org): `schoolTitle` is the school's name,
  // shown in the crest. The stage itself is ink with blue light only.
  schoolTitle = null,
  // The school's uploaded mark, when there is one. Absent → SchoolCrest draws a
  // monogram from the name instead, so the slot is never empty.
  logoBase64 = null,
  // The whole school record — the panel reads its optional profile fields for a
  // subtitle that is true of THIS school, and prints nothing when none are set.
  school = null,
}) {
  const reduce = useReducedMotion()
  const { user } = useAuth()
  const total = summary?.total ?? 0
  const critical = summary?.critical ?? 0
  const verb = LENS_VERB[lens] ?? 'need attention'
  const firstName = (user?.first_name || user?.name || '').trim().split(/\s+/)[0] || null
  // A gentle read-time estimate for the written brief (UI affordance, not a claim).
  const readMin = Math.max(2, Math.round(total * 0.8) + 1)

  const headline = (
    <h1 className="font-serif text-[28px] font-medium leading-[1.15] text-white sm:text-[34px]">
      {greeting()}
      {firstName ? <>, {firstName}.</> : '.'}
    </h1>
  )

  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      aria-label="Daily briefing summary"
      className="stage p-5 sm:p-6 lg:p-7"
    >
      {/* The alive feature: blue light-streams, settling once. */}
      <AuroraFlow />

      {/* WHOSE briefing this is — the school's mark as the right-hand ground of
          the stage, divided from the content by a hairline, with the name set
          over it. */}
      <SchoolCrest name={schoolTitle} logoBase64={logoBase64} school={school} />

      <div className="relative mb-4">
        <span className="inline-flex items-center gap-1.5 text-micro font-semibold uppercase text-white/55">
          <Sparkles size={12} className="text-white/70" aria-hidden="true" /> Daily briefing
        </span>
      </div>

      {hasPeriod ? (
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-8 lg:pr-[28%]">
          {/* ── LEFT: greeting + actions ── */}
          <div className="flex min-w-0 flex-col gap-4 lg:w-[40%] lg:shrink-0">
            {/* Narrow screens hide the crest, so the name still needs saying. */}
            {schoolTitle && (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-sm border border-white/15 px-2 py-0.5 text-small font-semibold text-white sm:hidden">
                <School size={13} className="text-white/70" aria-hidden="true" />
                {schoolTitle}
              </span>
            )}

            <div>
              {headline}
              <p className="mt-2 text-body text-white/75">
                {total === 0 ? (
                  <>You&rsquo;re all caught up — nothing needs a decision right now.</>
                ) : (
                  <>
                    Here {total === 1 ? 'is' : 'are'}{' '}
                    <span className="font-semibold text-white">
                      {total} thing{total === 1 ? '' : 's'}
                    </span>{' '}
                    that {verb}
                    {critical > 0 && (
                      <>
                        {' '}·{' '}
                        <span className="font-semibold text-coral">{critical} critical</span>
                      </>
                    )}
                    .
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Primary — open the written brief (flat action blue). */}
              <Button variant="primary" onClick={() => onOpenBrief?.('open')} icon={<Play size={14} className="fill-current" />}>
                Open Daily Briefing
              </Button>

              {/* KYRO narrates the brief — stays GOLD (KYRO's reserve). */}
              <button
                type="button"
                onClick={() => onOpenBrief?.('narrate')}
                aria-label="Play — KYRO reads the briefing aloud"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-penny/40 px-3 text-small font-semibold text-penny-light transition-colors hover:border-penny/70 hover:bg-penny/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-penny/60"
              >
                <Sparkles size={13} aria-hidden="true" /> Play
              </button>

              <span className="inline-flex items-center gap-1.5 text-small font-medium text-white/55">
                <Clock size={13} aria-hidden="true" /> {readMin} min read
              </span>
            </div>
          </div>

          {/* ── RIGHT: top-3 performing stats (self-contained; may render null) ── */}
          <BriefingPerformers schoolId={schoolId} periodId={periodId} />
        </div>
      ) : (
        // ── Empty / onboarding: no saved period yet ──────────────────────────────
        <div className="relative flex flex-col gap-4 lg:pr-[30%]">
          <div>
            {headline}
            <p className="mt-2 max-w-xl text-body text-white/75">
              Let&rsquo;s get your first numbers on the board. Add a trial balance and we&rsquo;ll turn it into
              your four financial statements — then every tile below lights up with live status.
            </p>
          </div>
          <div>
            <Button variant="primary" to="/finance?tab=add&add=tb" icon={<Database size={15} />}>
              Add your trial balance <ArrowRight size={15} aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </motion.section>
  )
}

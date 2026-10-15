// ─────────────────────────────────────────────────────────────────────────────
// ClassicBriefingBand — the CLASSIC school-home hero, restored at the owner's
// request ("I want to go back to this look for the school home page"). Forked
// verbatim from the pre-Premium-UI BriefingBand at origin/main 74caaba; the org
// home keeps the shared BriefingBand (the ink stage). Renders ONLY inside the
// `.home-classic` subtree, whose token block (styles/home-classic.css) restores
// the legacy radii/shadows and the Montserrat display face it was drawn with.
//
// Two columns on lg+:
//   LEFT   greeting + "N things that need your attention" + the actions (▶ Play →
//          onOpenBrief('narrate'); Open Daily Briefing → onOpenBrief('open')).
//   RIGHT  the top-3 performing metric cards (ClassicBriefingPerformers,
//          self-contained + fail-soft).
// The "alive" feature is ClassicAuroraFlow. On the frosted-glass path (a school
// in a multi-school org) the band tints to the school hue. Empty school (no saved
// period): the onboarding line + "Add your trial balance →" deep-linking the
// finance Add-data tab directly (never via the /data redirect).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Sparkles, Play, ArrowRight, Database, School, Clock } from 'lucide-react'
import { LENS_VERB, greeting } from '../tileRegistry.jsx'
import { useAuth } from '../../../context/AuthContext.jsx'
import ClassicAuroraFlow from './ClassicAuroraFlow.jsx'
import ClassicBriefingPerformers from './ClassicBriefingPerformers.jsx'
import ClassicSchoolCrest from './ClassicSchoolCrest.jsx'

// The hero CTA gradient — echoes the aurora (blue → violet → coral). Kept off the
// Penny-gold reserve on purpose: gold stays Penny's (the ▶ Play narrate button).
const CTA_GRADIENT = 'linear-gradient(100deg, #3b6ef5 0%, #8b5cf6 52%, #ff6b5c 100%)'

export default function ClassicBriefingBand({
  summary,
  lens,
  hasPeriod,
  onOpenBrief,
  // School scope (a real saved period) → the top-3 performer cards fetch against
  // these. Absent (org scope / no period) → BriefingPerformers renders nothing.
  schoolId = null,
  periodId = null,
  // School scope (from a multi-school org): `hue` is the school's identity colour
  // and `schoolTitle` its name — the band renders as a frosted-glass panel tinted
  // in that colour with the name shown.
  hue = null,
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
  const firstName =
    (user?.first_name || user?.name || '').trim().split(/\s+/)[0] || null
  // A gentle read-time estimate for the written brief (UI affordance, not a claim).
  const readMin = Math.max(2, Math.round(total * 0.8) + 1)

  // Frosted-glass tint from the school hue (mixed against a NEUTRAL dark so warm
  // hues stay warm). Absent hue → the standard navy-gradient band.
  const glass = hue
    ? (pct) => `color-mix(in srgb, ${hue} ${pct}%, rgba(15, 17, 24, 0.9))`
    : null
  const sectionStyle = glass
    ? { background: `linear-gradient(135deg, ${glass(52)} 0%, ${glass(26)} 55%, ${glass(14)} 100%)` }
    : undefined

  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      aria-label="Daily briefing summary"
      style={sectionStyle}
      className={`relative overflow-hidden rounded-2xl p-5 shadow-navy-glow sm:p-6 lg:p-7 ${
        glass ? 'border border-white/15 backdrop-blur-xl' : 'bg-navy-gradient'
      }`}
    >
      {/* The alive feature: flowing aurora ribbons (replaces dots/orbs/shimmer). */}
      <ClassicAuroraFlow />

      {/* ── Header row: what this is, and whose it is ──────────────────────────
          A real row rather than a floated box. Floating the crest pulled it out
          of flow and the performer cards below reflowed around it into a narrow
          column. Both branches hang under this, so the school's identity reads
          identically whether the band is full or still onboarding — and the
          onboarding state is exactly when a reader is most likely to be looking
          at a school they just switched to. */}
      {/* WHOSE briefing this is — the school's mark as the right-hand ground of
          the card, divided from the content by a hairline, with the name set
          over it. A badge with a caption said the same thing on all sixteen
          schools; a bled mark makes each card look like its own school. */}
      <ClassicSchoolCrest name={schoolTitle} logoBase64={logoBase64} hue={hue} school={school} />

      <div className="relative mb-4">
        <span className="inline-flex items-center gap-1.5 font-sans text-[12px] font-bold uppercase tracking-[0.18em] text-white/55">
          <Sparkles size={13} className="text-white/70" /> Daily briefing
        </span>
      </div>

      {hasPeriod ? (
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:pr-[30%]">
          {/* ── LEFT: greeting + actions ── */}
          <div className="flex min-w-0 flex-col gap-4 lg:max-w-[46%]">
            {/* Narrow screens hide the crest, so the name still needs saying. */}
            {schoolTitle && (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[12.5px] font-semibold text-white sm:hidden">
                <School size={13} className="text-white/70" />
                {schoolTitle}
              </span>
            )}

            <div>
              <h1 className="font-serif text-[26px] font-semibold leading-tight text-white sm:text-[32px]">
                {greeting()}
                {firstName ? (
                  <>
                    , <span className="text-white">{firstName}</span>.
                  </>
                ) : (
                  '.'
                )}
              </h1>
              <p className="mt-1.5 text-[16px] leading-relaxed text-white/80 sm:text-[17px]">
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
                        <span className="font-semibold text-red-300">{critical} critical</span>
                      </>
                    )}
                    .
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Primary — open the written brief (aurora gradient, hero CTA). */}
              <button
                type="button"
                onClick={() => onOpenBrief?.('open')}
                style={{ backgroundImage: CTA_GRADIENT }}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold text-white shadow-lg shadow-black/20 transition-transform hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 motion-reduce:hover:translate-y-0"
              >
                <Play size={15} className="fill-current" /> Open Daily Briefing
              </button>

              {/* Penny narrates the brief — stays GOLD (Penny's reserve). */}
              <button
                type="button"
                onClick={() => onOpenBrief?.('narrate')}
                aria-label="Play — KYRO reads the briefing aloud"
                className="inline-flex items-center gap-1.5 rounded-full border border-penny/40 bg-penny/10 px-3.5 py-2 text-[13px] font-semibold text-penny-light transition-colors hover:border-penny/70 hover:bg-penny/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-penny/60"
              >
                <Sparkles size={13} /> Play
              </button>

              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/55">
                <Clock size={13} /> {readMin} min read
              </span>

            </div>
          </div>

          {/* ── RIGHT: top-3 performing cards (self-contained; may render null) ── */}
          <ClassicBriefingPerformers schoolId={schoolId} periodId={periodId} />
        </div>
      ) : (
        // ── Empty / onboarding: no saved period yet ──────────────────────────────
        <div className="relative flex flex-col gap-4 lg:pr-[30%]">
          <div>
            <h1 className="font-serif text-[26px] font-semibold leading-tight text-white sm:text-[32px]">
              {greeting()}
              {firstName ? (
                <>
                  , <span className="text-white">{firstName}</span>.
                </>
              ) : (
                '.'
              )}
            </h1>
            <p className="mt-1.5 max-w-xl text-[16px] leading-relaxed text-white/80">
              Let&rsquo;s get your first numbers on the board. Add a trial balance and
              we&rsquo;ll turn it into your four financial statements — then every tile below
              lights up with live status.
            </p>
          </div>
          <div>
            <Link
              to="/finance?tab=add&add=tb"
              style={{ backgroundImage: CTA_GRADIENT }}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold text-white shadow-lg shadow-black/20 transition-transform hover:-translate-y-px motion-reduce:hover:translate-y-0"
            >
              <Database size={15} /> Add your trial balance <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      )}
    </motion.section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// IngestScrolly — Act II as a pinned scroll-driven set-piece. The SHELL owns
// the 320vh track, the sticky stage, the narration column (kicker + H2 static,
// a beat line + progress ticks that advance with the scroll), the reduced-
// motion static fallback, and beat bookkeeping. The actual choreography lives
// in the scene module (BEATS + Stage): THE LEDGER PRESS. Pure framer-motion
// (useScroll + useTransform on a sticky stage); scrubbing never re-renders —
// the only state is the discrete beat index via useMotionValueEvent.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import {
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
} from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { TimestampMedallion } from './LedgerSpine.jsx'
import { AppWindow, Folder, Press, WindowScreen } from './ingestShared.jsx'
import { BEATS, Stage } from './IngestScenePress.jsx'

const beatIndexFor = (beats, p) => {
  let i = 0
  for (let b = 0; b < beats.length; b++) if (p >= beats[b].at) i = b
  return i
}

// ── Reduced-motion fallback: the story as one static frame ───────────────────
function StaticFrame() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <Folder frontStyle={{}} />
      <ArrowRight size={20} className="text-gold" aria-hidden="true" />
      <Press
        gearRotate={0}
        gearRotateCcw={0}
        lampOn={1}
        inkWidth={'70%'}
        faceTextOpacity={1}
        glow={0.5}
      />
      <ArrowRight size={20} className="text-gold" aria-hidden="true" />
      <div className="w-72">
        <AppWindow>
          <WindowScreen rawStyle={{ opacity: 0 }} stmtStyle={{ opacity: 1 }} briefStyle={{ opacity: 0 }} />
        </AppWindow>
      </div>
    </div>
  )
}

export default function IngestScrolly({ act }) {
  const reduce = useReducedMotion()
  // Scroll-spy: Act II is "active" (its timeframe highlights blue) the whole
  // time its pinned set-piece straddles the viewport center. Same center-band
  // margin the two-column ActSections use, so the highlight hands off cleanly.
  const sectionRef = useRef(null)
  const active = useInView(sectionRef, { margin: '-45% 0px -45% 0px' })
  const trackRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  })
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.35 })

  const [beat, setBeat] = useState(0)
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const next = beatIndexFor(BEATS, v)
    setBeat((cur) => (cur === next ? cur : next))
  })

  if (reduce) {
    return (
      <section
        ref={sectionRef}
        id={act.anchorId}
        aria-labelledby={`${act.id}-h2`}
        className={`relative scroll-mt-24 py-24 ${active ? 'bg-[#1D4ED8]' : 'bg-section'}`}
      >
        <TimestampMedallion time={act.time} active={active} />
        <div className="relative z-[2] mx-auto max-w-6xl px-5 pl-14 pt-12 sm:px-8 sm:pl-16 lg:px-8">
          <p
            className={`text-[12px] font-bold uppercase tracking-[0.22em] ${
              active ? 'text-white' : 'text-[#7a5e00]'
            }`}
          >
            {act.kicker}
          </p>
          <h2
            id={`${act.id}-h2`}
            className={`mt-3 max-w-3xl font-serif text-[32px] font-semibold leading-tight sm:text-[42px] ${
              active ? 'text-white' : 'text-navy'
            }`}
          >
            {act.h2}
          </h2>
          <p
            className={`mt-4 max-w-2xl text-[16px] leading-relaxed ${
              active ? 'text-white/85' : 'text-muted'
            }`}
          >
            {act.body}
          </p>
          <div className="mt-10">
            <StaticFrame />
          </div>
        </div>
      </section>
    )
  }

  return (
    <section ref={sectionRef} id={act.anchorId} aria-labelledby={`${act.id}-h2`} className="relative bg-section">
      {/* Blue flood — fills the whole act while it's the centered timeframe. */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 55%, #1E40AF 100%)' }}
        initial={false}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />
      <p className="sr-only">
        Drop a trial balance on Penny and it becomes your four statements, then tomorrow’s
        briefing — no re-keying, no formatting.
      </p>
      <div ref={trackRef} className="relative h-[200vh] sm:h-[320vh]">
        <div className="sticky top-0 flex h-screen items-center overflow-hidden">
          <TimestampMedallion time={act.time} active={active} />
          <div className="relative z-[2] mx-auto grid w-full max-w-6xl gap-3 px-5 pl-14 sm:gap-8 sm:px-8 sm:pl-16 lg:grid-cols-[1fr_1.5fr] lg:items-center lg:gap-12 lg:px-8">
            {/* ── Narration ──────────────────────────────────────────────── */}
            <div>
              <p
                className={`text-[12px] font-bold uppercase tracking-[0.22em] transition-colors duration-300 ${
                  active ? 'text-white' : 'text-[#7a5e00]'
                }`}
              >
                {act.kicker}
              </p>
              <h2
                id={`${act.id}-h2`}
                className={`mt-3 font-serif text-[26px] font-semibold leading-tight transition-colors duration-300 sm:text-[32px] ${
                  active ? 'text-white' : 'text-navy'
                }`}
              >
                {act.h2}
              </h2>
              <div className="relative mt-5 min-h-[96px]" aria-live="polite">
                {BEATS.map((b, i) => (
                  <motion.div
                    key={b.title}
                    initial={false}
                    animate={{ opacity: beat === i ? 1 : 0, y: beat === i ? 0 : 8 }}
                    transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
                    className={`absolute inset-x-0 top-0 ${beat === i ? '' : 'pointer-events-none'}`}
                  >
                    <p
                      className={`font-serif text-[19px] font-semibold transition-colors duration-300 ${
                        active ? 'text-white' : 'text-navy'
                      }`}
                    >
                      {b.title}
                    </p>
                    <p
                      className={`mt-1.5 text-[15px] leading-relaxed transition-colors duration-300 ${
                        active ? 'text-white/85' : 'text-muted'
                      }`}
                    >
                      {b.line}
                    </p>
                  </motion.div>
                ))}
              </div>
              <div className="mt-6 flex gap-1.5" aria-hidden="true">
                {BEATS.map((b, i) => (
                  <span
                    key={b.at}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      beat >= i
                        ? `w-7 ${active ? 'bg-white' : 'bg-gold'}`
                        : `w-3.5 ${active ? 'bg-white/40' : 'bg-rule/70'}`
                    }`}
                  />
                ))}
              </div>
              {act.chips && (
                <motion.ul
                  initial={false}
                  animate={{ opacity: beat === BEATS.length - 1 ? 1 : 0 }}
                  transition={{ duration: 0.4 }}
                  className="mt-6 hidden flex-wrap gap-2 lg:flex"
                >
                  {act.chips.map((chip) => (
                    <li
                      key={chip}
                      className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors duration-300 ${
                        active
                          ? 'border-white/35 bg-white/15 text-white'
                          : 'border-gold/40 bg-white text-navy'
                      }`}
                    >
                      {chip}
                    </li>
                  ))}
                </motion.ul>
              )}
            </div>

            {/* ── The stage (scene-owned choreography) ───────────────────── */}
            {/* The scene's folder/press/window are positioned by % of a WIDE desktop
                column, where they sit cleanly apart. On a narrow phone the same %s
                overlap — and scaling the phone-width stage can't fix that (it scales
                the overlap too). So we render the stage at its full DESKTOP design
                width (660px, where nothing overlaps) and scale that whole block down
                to fit the phone, top-anchored so it sits high (close to the narration).
                overflow-hidden clips the wide block to the column; ≥lg it's the natural
                full-width stage again. */}
            {/* The block carries a FIXED design size (600×340 — tall enough for the
                press etc. at their %-positions) and is scaled to fit; the phone cell is
                sized to the SCALED result so there's no dead space beneath the scene.
                pt nudges the scene down a touch; the small -translate-x re-centers the
                (right-biased) content so the press doesn't clip at the higher scale.
                ≥sm/lg fall back to the fluid full-height stage. */}
            <div
              className="relative flex h-[226px] items-start justify-center overflow-hidden pt-5 sm:h-[56vh] sm:pt-0 lg:block lg:h-[56vh] lg:overflow-visible"
              aria-hidden="true"
            >
              <div className="relative h-[340px] w-[600px] shrink-0 origin-top -translate-x-4 scale-[0.64] sm:h-full sm:translate-x-0 sm:scale-[0.82] lg:w-full lg:scale-100">
                <Stage p={p} beat={beat} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

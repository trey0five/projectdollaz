// ─────────────────────────────────────────────────────────────────────────────
// IngestScrolly — Act II as a pinned scroll-driven set-piece. The SHELL owns
// the 320vh track, the sticky stage, the narration column (kicker + H2 static,
// a beat line + progress ticks that advance with the scroll), the reduced-
// motion static fallback, and beat bookkeeping. The actual choreography lives
// in a SCENE module (BEATS + Stage): the shipped default is THE LEDGER PRESS;
// two alternates — THE SCAN and THE FLIP — are kept behind a ?scene= query
// param (?scene=scan / ?scene=flip) for design comparison. Pure framer-motion
// (useScroll + useTransform on a sticky stage); scrubbing never re-renders —
// the only state is the discrete beat index via useMotionValueEvent.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
} from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { TimestampMedallion } from './LedgerSpine.jsx'
import { AppWindow, Folder, Press, WindowScreen } from './ingestShared.jsx'
import * as PressScene from './IngestScenePress.jsx'
import * as ScanScene from './IngestSceneScan.jsx'
import * as FlipScene from './IngestSceneFlip.jsx'

const SCENES = {
  press: PressScene,
  scan: ScanScene,
  flip: FlipScene,
}

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
  const [params] = useSearchParams()
  const scene = SCENES[params.get('scene')] ?? SCENES.press
  const { BEATS, Stage } = scene

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
      <section id={act.anchorId} aria-labelledby={`${act.id}-h2`} className="relative bg-section scroll-mt-24 py-24">
        <TimestampMedallion time={act.time} />
        <div className="relative z-[2] mx-auto max-w-6xl px-5 pl-14 pt-12 sm:px-8 sm:pl-16 lg:px-8">
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">{act.kicker}</p>
          <h2 id={`${act.id}-h2`} className="mt-3 max-w-3xl font-serif text-[32px] font-semibold leading-tight text-navy sm:text-[42px]">
            {act.h2}
          </h2>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-muted">{act.body}</p>
          <div className="mt-10">
            <StaticFrame />
          </div>
        </div>
      </section>
    )
  }

  return (
    <section id={act.anchorId} aria-labelledby={`${act.id}-h2`} className="relative bg-section">
      <p className="sr-only">
        Drop a trial balance on Penny and it becomes your four statements, then tomorrow’s
        briefing — no re-keying, no formatting.
      </p>
      <div ref={trackRef} className="relative h-[320vh]">
        <div className="sticky top-0 flex h-screen items-center overflow-hidden">
          <TimestampMedallion time={act.time} />
          <div className="relative z-[2] mx-auto grid w-full max-w-6xl gap-8 px-5 pl-14 sm:px-8 sm:pl-16 lg:grid-cols-[1fr_1.5fr] lg:items-center lg:gap-12 lg:px-8">
            {/* ── Narration ──────────────────────────────────────────────── */}
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">{act.kicker}</p>
              <h2
                id={`${act.id}-h2`}
                className="mt-3 font-serif text-[26px] font-semibold leading-tight text-navy sm:text-[32px]"
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
                    <p className="font-serif text-[19px] font-semibold text-navy">{b.title}</p>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{b.line}</p>
                  </motion.div>
                ))}
              </div>
              <div className="mt-6 flex gap-1.5" aria-hidden="true">
                {BEATS.map((b, i) => (
                  <span
                    key={b.at}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      beat >= i ? 'w-7 bg-gold' : 'w-3.5 bg-rule/70'
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
                      className="rounded-full border border-gold/40 bg-white px-3 py-1 text-[12.5px] font-semibold text-navy"
                    >
                      {chip}
                    </li>
                  ))}
                </motion.ul>
              )}
            </div>

            {/* ── The stage (scene-owned choreography) ───────────────────── */}
            <div className="relative h-[48vh] min-h-[320px] sm:h-[56vh]" aria-hidden="true">
              <Stage p={p} beat={beat} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

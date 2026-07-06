// ─────────────────────────────────────────────────────────────────────────────
// IngestScrolly — Act II as a pinned scroll-driven set-piece ("the hand-off").
// A 320vh track pins a full-viewport stage; scroll progress plays one shot:
// a manila folder gives up the trial balance → Penny carries the sheet across
// the stage → it's absorbed into an app window where the raw rows re-lay into
// the four statements → the window flips to tomorrow's briefing. The narration
// column (kicker + H2 static; one beat line that swaps) tells the same story
// in words, so the scene works skimmed or savored.
//
// Built with framer-motion's useScroll + useTransform on a sticky stage — no
// Webflow/Framer/scrollytelling lib. All motion values feed style props
// (transform/opacity/left/top), so scrubbing never re-renders React. The only
// state is the discrete narration-beat index + Penny's mood, stepped via
// useMotionValueEvent. Reduced motion renders a static composed frame instead
// of pinning (the story told as one picture).
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion'
import { ArrowRight, FileSpreadsheet } from 'lucide-react'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import { TimestampMedallion } from './LedgerSpine.jsx'

// ── Narration beats (index ← scroll progress) ────────────────────────────────
const BEATS = [
  {
    at: 0,
    title: 'It starts as paper.',
    line: 'A trial balance export, five years of history, a folder someone hands you at drop-off.',
  },
  {
    at: 0.24,
    title: 'Drop it on Penny.',
    line: 'She reads it, tells you where it belongs — with her confidence — and waits for your yes.',
  },
  {
    at: 0.54,
    title: 'It lands where it belongs.',
    line: 'The rows re-lay into your four statements. Nothing re-keyed, nothing formatted.',
  },
  {
    at: 0.78,
    title: 'Tomorrow, it’s in your briefing.',
    line: '“Good morning — three things need a decision.” The file never sat in a drawer.',
  },
]

const beatIndexFor = (p) => {
  let i = 0
  for (let b = 0; b < BEATS.length; b++) if (p >= BEATS[b].at) i = b
  return i
}

// ── Small stage props (pure presentation) ────────────────────────────────────

/** The traveling trial-balance sheet — a mini spreadsheet card. */
function SheetCard() {
  return (
    <div className="w-44 overflow-hidden rounded-lg border border-rule/70 bg-white shadow-paper sm:w-52">
      <div className="flex items-center gap-1.5 border-b border-rule/50 bg-section px-2.5 py-1.5">
        <FileSpreadsheet size={12} className="shrink-0 text-[#7a5e00]" />
        <span className="truncate text-[10px] font-semibold tracking-wide text-muted">
          trial_balance_fy26.xlsx
        </span>
      </div>
      <div className="space-y-1.5 px-2.5 py-2">
        {[
          ['4010 Tuition', '9,842,000'],
          ['5020 Salaries', '6,214,300'],
          ['1000 Cash', '1,238,450'],
          ['6110 Plant', '412,880'],
          ['2000 Payables', '389,120'],
        ].map(([acct, amt]) => (
          <div key={acct} className="flex items-center justify-between gap-2">
            <span className="truncate text-[9.5px] text-ink/70">{acct}</span>
            <span className="text-[9.5px] tabular-nums text-muted">{amt}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The manila folder (back panel + tab + front flap the sheet rises from behind). */
function Folder({ frontStyle }) {
  return (
    <div className="relative h-36 w-52 sm:h-40 sm:w-60">
      {/* Back panel + tab */}
      <div className="absolute inset-x-0 bottom-0 top-4 rounded-xl border border-gold/50 bg-gold-pale shadow-card" />
      <div className="absolute left-3 top-0 h-7 w-24 rounded-t-lg border border-b-0 border-gold/50 bg-gold-pale" />
      {/* Front flap (above the sheet's z, so the sheet emerges from inside) */}
      <motion.div
        style={frontStyle}
        className="absolute inset-x-0 bottom-0 z-20 flex h-[70%] origin-bottom items-end rounded-xl border border-gold/60 bg-gold-gradient p-3 shadow-card"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-navy/80">
          FY26 · Finance office
        </span>
      </motion.div>
    </div>
  )
}

/** Inside-window panel: raw rows → statements → briefing (three crossfaded layers). */
function WindowScreen({ rawStyle, stmtStyle, briefStyle }) {
  return (
    <div className="relative h-52 sm:h-60">
      {/* Raw rows (what the sheet 'pours into') */}
      <motion.div style={rawStyle} className="absolute inset-0 space-y-2 p-4">
        {[82, 64, 91, 55, 73, 68].map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-10 rounded bg-navy/15" />
            <span className="h-2 rounded bg-gold/30" style={{ width: `${w * 0.6}%` }} />
          </div>
        ))}
        <p className="pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/70">
          Reading 46 accounts…
        </p>
      </motion.div>
      {/* The four statements */}
      <motion.div style={stmtStyle} className="absolute inset-0 p-4">
        <div className="flex flex-wrap gap-1.5">
          {['Activities', 'Financial Position', 'Cash Flows', 'Net Assets'].map((t, i) => (
            <span
              key={t}
              className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${
                i === 0 ? 'border-gold/60 bg-gold/15 text-[#7a5e00]' : 'border-rule/60 bg-white text-muted'
              }`}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {[
            ['Tuition & fees', '92%'],
            ['Total revenue', '78%'],
            ['Total expense', '64%'],
            ['Change in net assets', '30%'],
          ].map(([label, w]) => (
            <div key={label}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-ink/70">{label}</span>
              </div>
              <div className="mt-0.5 h-2 rounded bg-navy/10">
                <div className="h-2 rounded bg-gold-gradient" style={{ width: w }} />
              </div>
            </div>
          ))}
        </div>
      </motion.div>
      {/* Tomorrow's briefing */}
      <motion.div style={briefStyle} className="absolute inset-0 p-4">
        <p className="font-serif text-[15px] font-semibold leading-snug text-navy">
          Good morning — 3 things need a decision.
        </p>
        <ul className="mt-3 space-y-2">
          {[
            ['bg-danger', 'Cash dips below 60 days in November'],
            ['bg-gold', 'Enrollment is 6 below plan'],
            ['bg-navy/50', 'Two policies due for review'],
          ].map(([dot, text]) => (
            <li key={text} className="flex items-start gap-2 text-[11.5px] leading-snug text-ink/80">
              <span aria-hidden="true" className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
              {text}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7a5e00]">
          Drafted from the file you dropped
        </p>
      </motion.div>
    </div>
  )
}

// ── Reduced-motion / no-JS-scroll fallback: the story as one static frame ────
function StaticFrame() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <Folder frontStyle={{}} />
      <ArrowRight size={22} className="text-gold" aria-hidden="true" />
      <SheetCard />
      <ArrowRight size={22} className="text-gold" aria-hidden="true" />
      <div className="w-72 overflow-hidden rounded-2xl border border-navy/20 bg-white shadow-paper">
        <div className="flex items-center gap-1.5 bg-navy-gradient px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-white/30" />
          <span className="h-2 w-2 rounded-full bg-white/30" />
          <span className="h-2 w-2 rounded-full bg-gold" />
        </div>
        <WindowScreen rawStyle={{ opacity: 0 }} stmtStyle={{ opacity: 1 }} briefStyle={{ opacity: 0 }} />
      </div>
    </div>
  )
}

export default function IngestScrolly({ act }) {
  const reduce = useReducedMotion()
  const trackRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  })
  // A light spring takes the digital edge off scrub reversals.
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.35 })

  // Discrete beat index for the narration + Penny's mood (state on purpose —
  // stepped from a motion-value event, never from an effect).
  const [beat, setBeat] = useState(0)
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const next = beatIndexFor(v)
    setBeat((cur) => (cur === next ? cur : next))
  })

  // ── The choreography (all string keyframes are stage-relative %) ───────────
  // Folder: holds, front flap opens as the sheet leaves, then recedes.
  const folderFlap = useTransform(p, [0.08, 0.3], [0, -68])
  const folderFade = useTransform(p, [0.34, 0.52], [1, 0.35])
  const folderShift = useTransform(p, [0.34, 0.52], ['0%', '-12%'])
  // Sheet: rises out of the folder, arcs across, shrinks into the window.
  const sheetLeft = useTransform(p, [0, 0.22, 0.54, 0.7], ['7%', '7%', '46%', '62%'])
  const sheetTop = useTransform(p, [0, 0.22, 0.4, 0.54, 0.7], ['46%', '20%', '12%', '18%', '30%'])
  const sheetRotate = useTransform(p, [0.22, 0.4, 0.6], [-7, 4, -2])
  const sheetScale = useTransform(p, [0.54, 0.72], [1, 0.5])
  const sheetFade = useTransform(p, [0.66, 0.73], [1, 0])
  // Penny: appears for the hand-off, tracks under the sheet, then parks on the
  // window's lower-left corner (z-30 — above the window, so she never hides).
  const pennyLeft = useTransform(p, [0.2, 0.54, 0.8], ['12%', '40%', '26%'])
  const pennyTop = useTransform(p, [0.2, 0.54, 0.8], ['66%', '52%', '78%'])
  const pennyFade = useTransform(p, [0.16, 0.26], [0, 1])
  // Window: slides in to receive the sheet; a gold ring flashes on absorb.
  const winX = useTransform(p, [0.34, 0.54], ['26%', '0%'])
  const winFade = useTransform(p, [0.34, 0.5], [0, 1])
  const absorbFlash = useTransform(p, [0.64, 0.71, 0.8], [0, 0.85, 0])
  // Screen layers: raw rows → statements → briefing.
  const rawFade = useTransform(p, [0.5, 0.64, 0.74], [1, 1, 0])
  const stmtFade = useTransform(p, [0.7, 0.78, 0.82, 0.88], [0, 1, 1, 0])
  const briefFade = useTransform(p, [0.86, 0.94], [0, 1])

  if (reduce) {
    // No pinning under reduced motion: the act reads as a normal section.
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
      {/* Screen readers get the story in one sentence; the stage is theatre. */}
      <p className="sr-only">
        Drop a trial balance on Penny and it becomes your four statements, then tomorrow’s briefing —
        no re-keying, no formatting.
      </p>
      {/* The scroll track: its height is the scene's running time. */}
      <div ref={trackRef} className="relative h-[320vh]">
        <div className="sticky top-0 flex h-screen items-center overflow-hidden">
          <TimestampMedallion time={act.time} />
          <div className="relative z-[2] mx-auto grid w-full max-w-6xl gap-8 px-5 pl-14 sm:px-8 sm:pl-16 lg:grid-cols-[1fr_1.4fr] lg:items-center lg:gap-14 lg:px-8">
            {/* ── Narration ──────────────────────────────────────────────── */}
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">{act.kicker}</p>
              <h2
                id={`${act.id}-h2`}
                className="mt-3 font-serif text-[26px] font-semibold leading-tight text-navy sm:text-[34px]"
              >
                {act.h2}
              </h2>
              {/* The beat line — swaps as the scene advances. */}
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
              {/* Progress ticks double as a "this section scrubs" affordance. */}
              <div className="mt-6 flex gap-1.5" aria-hidden="true">
                {BEATS.map((b, i) => (
                  <span
                    key={b.at}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      beat >= i ? 'w-8 bg-gold' : 'w-4 bg-rule/70'
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

            {/* ── The stage ──────────────────────────────────────────────── */}
            <div className="relative h-[46vh] min-h-[300px] sm:h-[54vh]" aria-hidden="true">
              {/* Folder (sheet starts behind its front flap) */}
              <motion.div
                style={{ opacity: folderFade, x: folderShift }}
                className="absolute bottom-[8%] left-[2%] z-[15]"
              >
                <Folder frontStyle={{ rotateX: folderFlap, transformPerspective: 600 }} />
              </motion.div>

              {/* The traveling sheet */}
              <motion.div
                style={{
                  left: sheetLeft,
                  top: sheetTop,
                  rotate: sheetRotate,
                  scale: sheetScale,
                  opacity: sheetFade,
                }}
                className="absolute z-10"
              >
                <SheetCard />
              </motion.div>

              {/* Penny the courier */}
              <motion.div
                style={{ left: pennyLeft, top: pennyTop, opacity: pennyFade }}
                className="absolute z-30 drop-shadow-[0_10px_18px_rgba(184,150,80,0.35)]"
              >
                <PennyAvatar size={64} glance={beat >= 3 ? 0 : 1} celebrate={beat === 3} active />
              </motion.div>

              {/* The platform window */}
              <motion.div
                style={{ x: winX, opacity: winFade }}
                className="absolute right-0 top-1/2 z-20 w-[62%] max-w-sm -translate-y-1/2"
              >
                <div className="relative overflow-hidden rounded-2xl border border-navy/20 bg-white shadow-paper">
                  <div className="flex items-center gap-1.5 bg-navy-gradient px-3 py-2">
                    <span className="h-2 w-2 rounded-full bg-white/30" />
                    <span className="h-2 w-2 rounded-full bg-white/30" />
                    <span className="h-2 w-2 rounded-full bg-gold" />
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
                      Project Dollaz
                    </span>
                  </div>
                  <WindowScreen
                    rawStyle={{ opacity: rawFade }}
                    stmtStyle={{ opacity: stmtFade }}
                    briefStyle={{ opacity: briefFade }}
                  />
                  {/* Absorb flash: a gold ring as the sheet lands */}
                  <motion.div
                    style={{ opacity: absorbFlash }}
                    className="pointer-events-none absolute inset-0 rounded-2xl ring-4 ring-inset ring-gold/70"
                  />
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

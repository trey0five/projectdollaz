// ─────────────────────────────────────────────────────────────────────────────
// IngestScrolly — Act II as a pinned scroll-driven set-piece: THE LEDGER PRESS.
// A 320vh track pins a full-viewport stage; scroll scrubs one continuous shot:
// a manila folder gives up the trial balance → the sheet feeds into an ornate
// navy-and-gold press → Penny hops onto the big gold button and RUNS it (gears
// turn with the scroll, the lamp lights, an ink bar fills) → out of the other
// slot rolls the app window — raw rows, then the four statements, then
// tomorrow's briefing. Paper goes in one side; the platform comes out the other.
//
// The machine is the metaphor and the mechanics: the sheet starts fully hidden
// BEHIND the folder (stage z 10 < folder 15), becomes visible only as it's
// pulled out sideways, disappears INTO the press (z 30), and the window (z 20)
// emerges from behind the press's out-slot — all occlusion, no clip-paths.
// Penny (z 40) is unmistakably the operator, never a passenger.
//
// Pure framer-motion (useScroll + useTransform on a sticky stage); motion
// values feed style props so scrubbing never re-renders React. The only state
// is the discrete narration-beat index via useMotionValueEvent. Reduced motion
// renders the story as one static frame (no pinning).
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
    at: 0.16,
    title: 'Feed the press.',
    line: 'The trial balance goes in exactly as it left QuickBooks — no retyping, no cleanup.',
  },
  {
    at: 0.4,
    title: 'Penny runs the press.',
    line: 'She reads every account, maps it to your chart of accounts, and shows her work.',
  },
  {
    at: 0.62,
    title: 'Out comes your platform.',
    line: 'The same numbers, re-set as your four statements — live, not a PDF.',
  },
  {
    at: 0.85,
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
    <div className="w-40 overflow-hidden rounded-lg border border-rule/70 bg-white shadow-paper sm:w-44">
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
            <span className="truncate text-[9px] text-ink/70">{acct}</span>
            <span className="text-[9px] tabular-nums text-muted">{amt}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The manila folder. The sheet hides completely BEHIND it until pulled out. */
function Folder({ frontStyle }) {
  return (
    <div className="relative h-40 w-52 sm:h-48 sm:w-56">
      <div className="absolute inset-x-0 bottom-0 top-4 rounded-2xl border border-gold/50 bg-gold-pale shadow-card" />
      <div className="absolute left-3 top-0 h-7 w-28 rounded-t-xl border border-b-0 border-gold/50 bg-gold-pale" />
      <motion.div
        style={frontStyle}
        className="absolute inset-x-0 bottom-0 z-10 flex h-[78%] origin-bottom items-end rounded-2xl border border-gold/60 bg-gold-gradient p-3.5 shadow-card"
      >
        <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-navy/80">
          FY26 · Finance office
        </span>
      </motion.div>
    </div>
  )
}

/**
 * THE LEDGER PRESS — an ornate navy machine with an in-slot (left), an
 * out-slot (right), two gears that turn with the scroll, a status lamp, an
 * ink-progress bar, and the big gold button Penny operates. All animated
 * parts arrive as MotionValue styles so the machine scrubs, never plays.
 */
function Press({ gearRotate, gearRotateCcw, lampOn, buttonY, inkWidth, faceTextOpacity, glow }) {
  return (
    <div className="relative h-52 w-60 sm:h-60 sm:w-72">
      {/* Pediment */}
      <div className="absolute inset-x-6 top-0 flex h-9 items-center justify-center rounded-t-2xl border border-b-0 border-gold/50 bg-navy-deep">
        <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-gold-light/90">
          The Ledger Press
        </span>
      </div>
      {/* Big gold button (Penny's perch) */}
      <motion.div
        style={{ y: buttonY }}
        className="absolute left-1/2 top-[-14px] h-7 w-16 -translate-x-1/2 rounded-full border border-gold/70 bg-gold-gradient shadow-glow"
      />
      {/* Body */}
      <div className="absolute inset-x-0 bottom-0 top-8 overflow-hidden rounded-2xl border-2 border-gold/50 bg-navy-gradient shadow-navy-glow">
        {/* Face plate */}
        <div className="absolute inset-3 rounded-xl border border-white/10">
          {/* Gears */}
          <motion.div
            style={{ rotate: gearRotate }}
            className="absolute left-3 top-3 h-12 w-12 rounded-full border-4 border-dashed border-gold/45"
          />
          <motion.div
            style={{ rotate: gearRotateCcw }}
            className="absolute left-12 top-9 h-8 w-8 rounded-full border-4 border-dashed border-gold/30"
          />
          {/* Status lamp */}
          <div className="absolute right-3 top-3 h-3.5 w-3.5 rounded-full border border-white/25 bg-white/10">
            <motion.div style={{ opacity: lampOn }} className="h-full w-full rounded-full bg-gold shadow-glow" />
          </div>
          {/* Reading line */}
          <motion.p
            style={{ opacity: faceTextOpacity }}
            className="absolute inset-x-3 top-[52%] text-center text-[9px] font-bold uppercase tracking-[0.22em] text-gold-light"
          >
            Reading 46 accounts…
          </motion.p>
          {/* Ink-progress bar */}
          <div className="absolute inset-x-4 bottom-4 h-2 overflow-hidden rounded-full bg-white/10">
            <motion.div style={{ width: inkWidth }} className="h-full rounded-full bg-gold-gradient" />
          </div>
        </div>
        {/* Working glow */}
        <motion.div
          style={{ opacity: glow }}
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_45%,rgba(212,178,122,0.35),transparent_70%)]"
        />
      </div>
      {/* In-slot (left) + out-slot (right) */}
      <div className="absolute -left-1 top-[46%] h-16 w-2.5 rounded-full border border-gold/60 bg-navy-deep" />
      <div className="absolute -right-1 top-[46%] h-20 w-2.5 rounded-full border border-gold/60 bg-navy-deep" />
    </div>
  )
}

/** Inside-window screens: raw rows → statements → briefing (crossfaded layers). */
function WindowScreen({ rawStyle, stmtStyle, briefStyle }) {
  return (
    <div className="relative h-52 sm:h-56">
      <motion.div style={rawStyle} className="absolute inset-0 space-y-2 p-4">
        {[82, 64, 91, 55, 73, 68].map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-10 rounded bg-navy/15" />
            <span className="h-2 rounded bg-gold/30" style={{ width: `${w * 0.6}%` }} />
          </div>
        ))}
        <p className="pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/70">
          Fresh off the press
        </p>
      </motion.div>
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
              <span className="text-[10px] text-ink/70">{label}</span>
              <div className="mt-0.5 h-2 rounded bg-navy/10">
                <div className="h-2 rounded bg-gold-gradient" style={{ width: w }} />
              </div>
            </div>
          ))}
        </div>
      </motion.div>
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

/** App-window chrome around a screen. */
function AppWindow({ children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-navy/20 bg-white shadow-paper">
      <div className="flex items-center gap-1.5 bg-navy-gradient px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-white/30" />
        <span className="h-2 w-2 rounded-full bg-white/30" />
        <span className="h-2 w-2 rounded-full bg-gold" />
        <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
          Project Dollaz
        </span>
      </div>
      {children}
    </div>
  )
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
        buttonY={0}
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
  const trackRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  })
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.35 })

  const [beat, setBeat] = useState(0)
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const next = beatIndexFor(v)
    setBeat((cur) => (cur === next ? cur : next))
  })

  // ── Choreography (stage-relative % keyframes; occlusion does the hiding) ───
  // Folder: gives up the sheet, then recedes as the left bookend.
  const folderFlap = useTransform(p, [0.1, 0.24], [0, -70])
  const folderFade = useTransform(p, [0.3, 0.46], [1, 0.45])
  const folderScale = useTransform(p, [0.3, 0.46], [1, 0.94])
  // Sheet: starts hidden BEHIND the folder (z 10 < 15), pulls out rightward,
  // then vanishes into the press's in-slot (z 10 < press 30).
  const sheetLeft = useTransform(p, [0, 0.14, 0.3, 0.44], ['3%', '3%', '24%', '46%'])
  const sheetTop = useTransform(p, [0.14, 0.3, 0.44], ['34%', '28%', '28%'])
  const sheetRotate = useTransform(p, [0.14, 0.3, 0.44], [0, -3, 2])
  const sheetScale = useTransform(p, [0.3, 0.44], [1, 0.82])
  // Penny: swoops in and LANDS ON THE BUTTON (0.38); the press only comes
  // alive once she's on it. She hops to the window's corner at the finale.
  const pennyLeft = useTransform(p, [0.26, 0.38, 0.84, 0.94], ['-6%', '59%', '59%', '46%'])
  const pennyTop = useTransform(p, [0.26, 0.38, 0.84, 0.94], ['-12%', '0%', '0%', '60%'])
  const pennyFade = useTransform(p, [0.26, 0.34], [0, 1])
  // Press internals — everything keys off Penny pressing the button at 0.38.
  const buttonY = useTransform(p, [0.38, 0.42], [0, 5])
  const gearRotate = useTransform(p, [0.4, 0.84], [0, 480])
  const gearRotateCcw = useTransform(p, [0.4, 0.84], [0, -480])
  const lampOn = useTransform(p, [0.38, 0.44], [0, 1])
  const inkWidth = useTransform(p, [0.42, 0.64], ['0%', '100%'])
  const faceTextOpacity = useTransform(p, [0.42, 0.46, 0.62, 0.68], [0, 1, 1, 0])
  const pressGlow = useTransform(p, [0.4, 0.5, 0.66, 0.76], [0, 0.8, 0.8, 0])
  const pressScale = useTransform(p, [0.84, 0.94], [1, 0.94])
  const pressFade = useTransform(p, [0.84, 0.94], [1, 0.4])
  const pressX = useTransform(p, [0.84, 0.94], ['0%', '-6%'])
  // Window: rolls OUT of the press's right slot (hidden behind it at z 20),
  // then lifts off the tray and grows to take the spotlight.
  const winLeft = useTransform(p, [0.56, 0.76], ['36%', '48%'])
  const winFade = useTransform(p, [0.55, 0.6], [0, 1])
  const winTop = useTransform(p, [0.78, 0.88], ['30%', '8%'])
  const winScale = useTransform(p, [0.56, 0.88], [0.8, 1])
  // Lifting off the tray = picked up: from here the window rides ABOVE the press.
  const winZ = useTransform(p, (v) => (v >= 0.8 ? 35 : 20))
  // Screens: raw rows → statements → briefing.
  const rawFade = useTransform(p, [0.76, 0.8], [1, 0])
  const stmtFade = useTransform(p, [0.79, 0.83, 0.88, 0.92], [0, 1, 1, 0])
  const briefFade = useTransform(p, [0.9, 0.96], [0, 1])

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
        Drop a trial balance into the press and Penny turns it into your four statements, then
        tomorrow’s briefing — no re-keying, no formatting.
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

            {/* ── The stage ──────────────────────────────────────────────── */}
            <div className="relative h-[48vh] min-h-[320px] sm:h-[56vh]" aria-hidden="true">
              {/* The traveling sheet (z 10 — hides behind folder AND press) */}
              <motion.div
                style={{
                  left: sheetLeft,
                  top: sheetTop,
                  rotate: sheetRotate,
                  scale: sheetScale,
                }}
                className="absolute z-10"
              >
                <SheetCard />
              </motion.div>

              {/* Folder (z 15 — fully conceals the sheet at rest) */}
              <motion.div
                style={{ opacity: folderFade, scale: folderScale }}
                className="absolute left-0 top-[26%] z-[15]"
              >
                <Folder frontStyle={{ rotateX: folderFlap, transformPerspective: 700 }} />
              </motion.div>

              {/* The window (z 20 — emerges from behind the press) */}
              <motion.div
                style={{ left: winLeft, top: winTop, scale: winScale, opacity: winFade, zIndex: winZ }}
                className="absolute z-20 w-[58%] max-w-sm"
              >
                <AppWindow>
                  <WindowScreen
                    rawStyle={{ opacity: rawFade }}
                    stmtStyle={{ opacity: stmtFade }}
                    briefStyle={{ opacity: briefFade }}
                  />
                </AppWindow>
              </motion.div>

              {/* THE PRESS (z 30 — swallows the sheet, hides the unborn window) */}
              <motion.div
                style={{ scale: pressScale, opacity: pressFade, x: pressX }}
                className="absolute left-[42%] top-[14%] z-30"
              >
                <Press
                  gearRotate={gearRotate}
                  gearRotateCcw={gearRotateCcw}
                  lampOn={lampOn}
                  buttonY={buttonY}
                  inkWidth={inkWidth}
                  faceTextOpacity={faceTextOpacity}
                  glow={pressGlow}
                />
              </motion.div>

              {/* Penny the operator (z 40 — always on top) */}
              <motion.div
                style={{ left: pennyLeft, top: pennyTop, opacity: pennyFade }}
                className="absolute z-40 drop-shadow-[0_10px_18px_rgba(184,150,80,0.35)]"
              >
                <PennyAvatar size={60} glance={beat >= 4 ? 0 : 1} celebrate={beat === 4} active />
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

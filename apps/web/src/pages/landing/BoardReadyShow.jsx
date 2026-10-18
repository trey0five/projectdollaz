// ─────────────────────────────────────────────────────────────────────────────
// BoardReadyShow — the ONE-CLICK BUILD: an interactive stage where the
// product's actual promise is the interaction. A glowing "Close June — one
// click" button fires a ~7-second choreographed run:
//   sync        the export and QuickBooks converge into a spinning core
//   statements  four sheets spring out of the core and tie out
//   penny       the stack tightens left; KYRO (the Scholar) drafts the story
//   bind        everything collapses into the sealed packet — spark burst,
//               clock lands on 4:19, CTA morphs in, "Run it again" offered
// The wall-clock chip flips 4:12 → 4:19 beat by beat: the section's claim
// ("board-ready in one afternoon") is acted out, not narrated. Auto-plays
// once when scrolled into view; every replay is a click. NOT scroll-driven —
// the orbit set-piece already owns that pattern on this page.
//
// Restored (2026-10-17) to the pre-P5 glassy stage (74caaba): rounded glass
// stage on a slow-turning halo + dot grid, navy clock chip with a blinking
// colon, floating source chips wired to a pulsing glow button. What it depicts
// is TODAY's app: each statement wears an Aurora band in its hue and a
// Good / Watch verdict pill, KYRO's lines carry the same verdicts, and the
// packet cover is a Finance Aurora band. Phones keep their own pose set (a 2×2
// deal, the stack lifted above KYRO's lines) so nothing leaves the stage.
// Literal radii/shadows + explicit font-sans: under ui.v2 rounded-xl+/named
// shadows clamp and font-serif is EB Garamond (see landing-restore-bottom.css).
// Reduced motion: a static four-step + packet layout, no theater, no loops.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion'
import {
  Activity,
  Check,
  FileBarChart2,
  FileStack,
  Landmark,
  Layers,
  MousePointerClick,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Waves,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import VerdictPill from '../../components/ui/aurora/VerdictPill.jsx'
import useMediaQuery from './useMediaQuery.js'
import '../../styles/landing-restore-bottom.css'

const EASE = [0.2, 0.8, 0.2, 1]
const SPRING = { type: 'spring', stiffness: 200, damping: 24 }

// The run: beat key, dwell (ms), and the minute the clock flips to at its
// start. 4:12 → 4:19 — seven on-screen seconds standing in for seven minutes.
const BEATS = [
  {
    key: 'sync',
    ms: 1400,
    minute: 12,
    label: 'Sync or drop the month',
    Icon: RefreshCw,
  },
  {
    key: 'statements',
    ms: 2100,
    minute: 13,
    label: 'Statements tie out',
    Icon: FileStack,
  },
  {
    key: 'penny',
    ms: 2300,
    minute: 15,
    label: 'KYRO drafts the story',
    Icon: Sparkles,
  },
  {
    key: 'bind',
    ms: 1500,
    minute: 18,
    label: 'Packet binds',
    Icon: FileBarChart2,
  },
]
const DONE_MINUTE = 19

// Each statement gets its own hue (an Aurora band: the hue deepening to its
// dark stop, as on the app's module pages), an icon, a verdict and a sparkline
// that draws itself when the sheet ties out — four documents, not four copies.
const SHEETS = [
  {
    key: 'sfp',
    title: 'Financial Position',
    hue: '#2563EB',
    d0: '#1b45a5',
    d2: '#07142f',
    Icon: Landmark,
    verdict: 'good',
    rows: [
      ['Total assets', '18.4M'],
      ['Net assets', '12.9M'],
    ],
    spark: 'M4 16 L30 13 L56 15 L82 9 L108 11 L134 5 L156 3',
  },
  {
    key: 'soa',
    title: 'Activities',
    hue: '#059669',
    d0: '#047857',
    d2: '#022c22',
    Icon: Activity,
    verdict: 'good',
    rows: [
      ['Revenue', '12.7M'],
      ['Expenses', '11.6M'],
    ],
    spark: 'M4 14 L30 17 L56 10 L82 13 L108 7 L134 9 L156 4',
  },
  {
    key: 'scf',
    title: 'Cash Flows',
    hue: '#d97706',
    d0: '#92400e',
    d2: '#2a1203',
    Icon: Waves,
    verdict: 'watch',
    rows: [
      ['Operating', '+1.3M'],
      ['Ending cash', '2.1M'],
    ],
    spark: 'M4 12 L30 16 L56 18 L82 12 L108 14 L134 6 L156 8',
  },
  {
    key: 'sna',
    title: 'Net Assets',
    hue: '#7c3aed',
    d0: '#5b21b6',
    d2: '#1e0b45',
    Icon: Layers,
    verdict: 'good',
    rows: [
      ['Released', '640K'],
      ['Change', '+1.08M'],
    ],
    spark: 'M4 17 L30 15 L56 12 L82 13 L108 9 L134 7 L156 3',
  },
]

// KYRO's story, each line judged the way the app's morning brief judges it.
const NARRATIVE = [
  { text: 'Cash days recovered to 43 — June tuition landed.', verdict: 'good' },
  { text: 'Program spend 2.1% under budget YTD.', verdict: 'good' },
  {
    text: 'One decision: the boiler contract renews Friday.',
    verdict: 'watch',
  },
]

// Bind-burst sparks: fixed angles/distances/colors, no per-render randomness.
const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  angle: (i / 14) * Math.PI * 2,
  dist: 88 + (i % 3) * 38,
  color: i % 2 === 0 ? '#d4b47a' : '#3b82f6',
}))

const GOLD_CAPS = 'text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]'
const CHIP_SHADOW = '0 14px 30px -16px rgba(16,28,61,0.5)'
const BLUE_GLOW = '0 0 0 1px rgba(37,99,235,0.45), 0 10px 34px rgba(37,99,235,0.35)'

// Beat index for ordering checks; 'idle' → -1, 'done' → past the end.
const beatIdx = (b) => (b === 'idle' ? -1 : b === 'done' ? BEATS.length : BEATS.findIndex((x) => x.key === b))

// Sheet poses per beat (stage px; the stage scales down responsively). Wide
// stages fan the four sheets out in PRE's arc; phones and small tablets (below
// md) get their own pose set — a 2×2 deal, and the stack lifted ABOVE KYRO's
// narrative instead of beside it — so nothing reaches past the stage's edges.
function sheetPose(b, i, phone) {
  const bi = beatIdx(b)
  if (bi < 1) return { x: 0, y: 30, rotate: 0, scale: 0.4, opacity: 0 }
  if (b === 'statements') {
    return phone
      ? {
          x: ((i % 2) - 0.5) * 196,
          y: (i < 2 ? -1 : 1) * 78,
          rotate: ((i % 2) - 0.5) * 4,
          scale: 1,
          opacity: 1,
        }
      : {
          x: (i - 1.5) * 188,
          y: Math.abs(i - 1.5) * 14 - 8,
          rotate: (i - 1.5) * 5,
          scale: 1,
          opacity: 1,
        }
  }
  if (b === 'penny') {
    return phone
      ? {
          x: -9 + i * 6,
          y: -118 + i * 5,
          rotate: -3 + i * 2,
          scale: 0.86,
          opacity: 1,
        }
      : {
          x: -216 + i * 10,
          y: -2 + i * 7,
          rotate: -3 + i * 2,
          scale: 0.94,
          opacity: 1,
        }
  }
  return { x: 0, y: 6, rotate: (i - 1.5) * 2, scale: 0.78, opacity: 0 }
}

function Sheet({ s, delayIdx, active }) {
  return (
    <div
      className="w-[182px] overflow-hidden rounded-[12px] border border-navy/10 bg-white"
      style={{
        boxShadow: `0 22px 50px -22px rgba(16,28,61,0.5), 0 0 30px -14px ${s.hue}80`,
      }}
    >
      {/* The Aurora band — the statement's hue deepening to its dark stop,
          white title on it, the tie-out check stamped in at the right. */}
      <div
        className="relative flex items-center justify-between gap-1.5 px-3 py-2"
        style={{
          background: `radial-gradient(70% 160% at 92% -20%, ${s.hue}cc, transparent 70%), radial-gradient(130% 170% at 0% 0%, ${s.d0} 0%, ${s.d2} 100%)`,
        }}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold leading-tight text-white">
          <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[6px] bg-white/15 text-white">
            <s.Icon size={11} />
          </span>
          <span className="truncate">{s.title}</span>
        </span>
        <motion.span
          initial={false}
          animate={active ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={{ ...SPRING, delay: 0.35 + delayIdx * 0.12 }}
          className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-white text-emerald-700"
        >
          <Check size={11} strokeWidth={3} />
        </motion.span>
      </div>
      <div className="px-3 pb-2.5 pt-2">
        <div className="space-y-1 text-[10.5px] text-navy/70" aria-hidden="true">
          {rows(s)}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          {/* The sparkline draws itself as the sheet ties out. */}
          <svg className="min-w-0 flex-1" height="20" viewBox="0 0 160 20" preserveAspectRatio="none" aria-hidden="true">
            <motion.path
              d={s.spark}
              fill="none"
              stroke={s.hue}
              strokeWidth="1.8"
              strokeLinecap="round"
              initial={false}
              animate={{ pathLength: active ? 1 : 0, opacity: active ? 1 : 0 }}
              transition={{
                duration: 0.8,
                delay: 0.35 + delayIdx * 0.12,
                ease: EASE,
              }}
            />
          </svg>
          <VerdictPill verdict={s.verdict} className="lrb-pill-xs" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

const rows = (s) =>
  s.rows.map(([l, v]) => (
    <div key={l} className="flex justify-between gap-2">
      <span>{l}</span>
      <span className="font-semibold tabular-nums text-navy/85">{v}</span>
    </div>
  ))

// A source the run pulls from: a floating white chip (file name + its check).
function SourceChip({ name, meta, className = '', style }) {
  return (
    <div
      className={`rounded-[12px] border border-navy/10 bg-white px-4 py-3 text-center ${className}`}
      style={{ boxShadow: CHIP_SHADOW, ...style }}
    >
      <span className="block whitespace-nowrap font-mono text-[11px] text-navy/60">{name}</span>
      <span className="text-[10px] font-semibold text-emerald-700">{meta}</span>
    </div>
  )
}

// The packet: a Finance Aurora band for the cover (blue deepening to night,
// a gold-foil sweep as it lands), the verdict tally the app would print, and
// the seal stamped on. The school is fictional.
function PacketCover({ reduce }) {
  return (
    <motion.div
      whileHover={reduce ? undefined : { scale: 1.03, rotate: -1 }}
      transition={SPRING}
      className="w-[250px] rounded-[16px] border border-navy/10 bg-white p-4 ring-1 ring-gold/30"
      style={{ boxShadow: '0 38px 90px -30px rgba(16,28,61,0.6)' }}
    >
      <div
        className="relative overflow-hidden rounded-[12px] px-4 py-6 text-center"
        style={{
          background:
            'radial-gradient(80% 90% at 100% 0%, rgba(56,189,248,0.35), transparent 70%), radial-gradient(120% 140% at 0% 0%, #1b45a5 0%, #0f2a63 42%, #07142f 100%)',
        }}
      >
        {/* Gold-foil sweep across the cover as it lands. */}
        {!reduce && (
          <motion.span
            aria-hidden="true"
            className="absolute inset-y-[-30%] left-0 w-1/3 -skew-x-12"
            style={{
              background:
                'linear-gradient(100deg, transparent, rgba(255,255,255,0.06), rgba(212,180,122,0.4), rgba(255,255,255,0.06), transparent)',
            }}
            initial={{ x: '-150%' }}
            animate={{ x: '420%' }}
            transition={{ duration: 1.1, delay: 0.55, ease: 'easeInOut' }}
          />
        )}
        <span
          aria-hidden="true"
          className="mx-auto block h-px w-24 bg-gradient-to-r from-transparent via-penny-light/70 to-transparent"
        />
        <span className="mt-3 block font-sans text-[19px] font-semibold leading-tight text-white">Bayview Academy</span>
        <span className="mt-1.5 block text-[9.5px] font-bold uppercase tracking-[0.2em] text-penny-light">
          Finance Committee Packet
        </span>
        <span className="mt-2.5 block text-[10.5px] text-white/65">June 2026 · FY26 close</span>
        <span className="mt-1.5 block text-[10px] font-semibold text-white/80">3 good · 1 watch</span>
        <span
          aria-hidden="true"
          className="mx-auto mt-3 block h-px w-24 bg-gradient-to-r from-transparent via-penny-light/70 to-transparent"
        />
      </div>
      {/* The seal — stamped, not faded in. */}
      <motion.div
        initial={reduce ? false : { scale: 2.2, opacity: 0, rotate: -14 }}
        animate={{ scale: 1, opacity: 1, rotate: -6 }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 16,
          delay: reduce ? 0 : 0.4,
        }}
        className="mx-auto -mt-3 flex w-fit items-center gap-1.5 rounded-full border-2 border-emerald-600/70 bg-white px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-emerald-700 shadow-md"
      >
        <Check size={12} /> Board-ready
      </motion.div>
      <span className="mt-2.5 block text-center text-[9.5px] font-bold uppercase tracking-[0.16em] text-navy/45">
        Prepared with KYRO
      </span>
    </motion.div>
  )
}

function Header() {
  return (
    <div className="text-center">
      <p className={GOLD_CAPS}>The board packet</p>
      <h2 id="board-h2" className="mt-3 font-sans text-[32px] font-semibold leading-tight text-navy sm:text-[42px]">
        Board-ready, start to finish.
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-muted">
        From the bookkeeper&rsquo;s export to the packet in the committee&rsquo;s inbox — watch an afternoon happen, then run it
        on your own books.
      </p>
    </div>
  )
}

// ── Reduced-motion fallback: the four beats as cards, no theater. ────────────
function StaticShow() {
  return (
    <section id="board-ready" aria-labelledby="board-h2" className="scroll-mt-20 bg-transparent py-24">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <Header />
        <ol className="mt-12 grid gap-3 sm:grid-cols-2">
          {BEATS.map((t) => (
            <li key={t.key} className="flex items-center gap-3 rounded-[16px] border border-navy/10 bg-white/80 px-5 py-4">
              <span className="font-mono text-[12px] font-bold text-[#7a5e00]">4:{t.minute} PM</span>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#2563EB]/10 text-[#2563EB]"
                aria-hidden="true"
              >
                <t.Icon size={15} />
              </span>
              <b className="text-[14px] font-semibold text-navy">{t.label}</b>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex justify-center">
          <PacketCover reduce />
        </div>
      </div>
    </section>
  )
}

// KYRO talks while its three narrative lines deal in (the last lands ~1.35s
// after the beat starts), then idles beside them.
const NARRATE_MS = 1500
function NarratingOwl() {
  const [talking, setTalking] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setTalking(false), NARRATE_MS)
    return () => clearTimeout(t)
  }, [])
  return <PennyAvatar size={40} speaking={talking} />
}

// The cap toss waits for the CTA row it rides in to fade in (delay 0.5s +
// 0.4s), so the lift plays where it can be seen.
const CTA_SHOWN_MS = 900
function CelebratingOwl() {
  const [celebrate, setCelebrate] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setCelebrate(true), CTA_SHOWN_MS)
    return () => clearTimeout(t)
  }, [])
  return <PennyAvatar size={44} celebrate={celebrate} />
}

export default function BoardReadyShow() {
  const reduce = useReducedMotion()
  const stageRef = useRef(null)
  const inView = useInView(stageRef, { once: true, margin: '-160px' })
  const [beat, setBeat] = useState('idle')
  const timers = useRef([])
  const phone = useMediaQuery('(max-width: 767px)')
  // The button that starts a run unmounts with its beat, so a click run moves
  // focus to the stage itself (not to <body>); the auto-run never takes focus.
  const focusRef = useRef(null)

  const run = (fromClick = false) => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (fromClick === true) focusRef.current?.focus({ preventScroll: true })
    setBeat(BEATS[0].key)
    let at = 0
    for (let i = 1; i <= BEATS.length; i++) {
      at += BEATS[i - 1].ms
      const next = i < BEATS.length ? BEATS[i].key : 'done'
      timers.current.push(setTimeout(() => setBeat(next), at))
    }
  }
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // Auto-fire once when the stage scrolls into view; replays are clicks.
  const autoRan = useRef(false)
  useEffect(() => {
    if (!inView || autoRan.current) return
    autoRan.current = true
    timers.current.push(setTimeout(run, 700))
  }, [inView])

  if (reduce) return <StaticShow />

  const bi = beatIdx(beat)
  const minute = beat === 'idle' ? 12 : beat === 'done' ? DONE_MINUTE : BEATS[bi].minute

  return (
    <section id="board-ready" aria-labelledby="board-h2" className="scroll-mt-20 bg-transparent py-24">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <Header />

        {/* ── The stage ── */}
        <div
          ref={stageRef}
          className="lrb-stage relative mt-12 overflow-hidden rounded-[24px] border border-navy/10 bg-gradient-to-br from-white/90 to-[#dde7f8]/80 shadow-[0_30px_80px_-30px_rgba(16,28,61,0.45)] backdrop-blur-sm"
        >
          {/* Flip clock — navy chip, sky digits, blinking colon; every part
              sits on one centered row so nothing floats off-baseline. */}
          <div
            className="absolute right-4 top-4 z-40 rounded-[12px] bg-navy-gradient px-3.5 py-2 text-center ring-1 ring-white/15"
            style={{ boxShadow: '0 16px 36px -14px rgba(16,28,61,0.7)' }}
          >
            <span className="flex items-center justify-center font-mono text-[21px] font-bold tabular-nums leading-none text-white">
              <span>4</span>
              <motion.span
                aria-hidden="true"
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                className="mx-0.5 text-gold-light"
              >
                :
              </motion.span>
              <span className="relative inline-flex h-[21px] w-[27px] items-center justify-center overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={minute}
                    initial={{ y: 18, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -18, opacity: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="absolute inset-0 flex items-center justify-center text-gold-light"
                  >
                    {minute}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="ml-1 text-[9.5px] font-semibold tracking-wide text-white/60">PM</span>
            </span>
            <span className="mt-1 block text-[8px] font-bold uppercase tracking-[0.16em] text-white/45">This afternoon</span>
          </div>

          <div
            ref={focusRef}
            tabIndex={-1}
            role="group"
            aria-label="Close June: the one-click board packet"
            className="relative h-[420px] outline-none sm:h-[440px]"
          >
            {/* Screen readers hear each beat as the run passes through it. */}
            <p className="sr-only" aria-live="polite">
              {beat === 'idle' ? '' : beat === 'done' ? 'Board packet ready.' : `${BEATS[bi].label}.`}
            </p>
            {/* Ambience: a slow-turning blue/gold halo + a faint dot grid.
                (Margins, not translate classes — framer owns transform.) */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute left-1/2 top-1/2 -ml-[290px] -mt-[290px]">
                <motion.div
                  className="h-[580px] w-[580px] rounded-full opacity-60 blur-3xl"
                  style={{
                    background:
                      'conic-gradient(from 0deg, rgba(37,99,235,0.16), rgba(212,180,122,0.15), rgba(37,99,235,0.04), rgba(124,58,237,0.10), rgba(37,99,235,0.16))',
                  }}
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 28,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                />
              </div>
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: 'radial-gradient(rgba(31,61,114,0.09) 1px, transparent 1px)',
                  backgroundSize: '22px 22px',
                }}
              />
            </div>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-[0.78] sm:scale-90 md:scale-[0.88] lg:scale-100">
              {/* Idle — the sources wait either side of THE BUTTON (above it
                  on phones), wired in by pulsing beams. */}
              <AnimatePresence>
                {beat === 'idle' && (
                  <motion.div
                    key="idle"
                    exit={{
                      opacity: 0,
                      scale: 0.85,
                      transition: { duration: 0.3 },
                    }}
                    className="absolute left-1/2 top-1/2"
                  >
                    {phone ? (
                      <>
                        <motion.span
                          aria-hidden="true"
                          animate={{ opacity: [0.35, 0.9, 0.35] }}
                          transition={{
                            duration: 2.2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                          className="absolute -ml-[66px] -mt-[64px] h-[30px] w-[2px]"
                          style={{
                            background: 'linear-gradient(180deg, rgba(31,61,114,0.15), rgba(212,180,122,0.65))',
                          }}
                        />
                        <motion.span
                          aria-hidden="true"
                          animate={{ opacity: [0.35, 0.9, 0.35] }}
                          transition={{
                            duration: 2.2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: 1.1,
                          }}
                          className="absolute ml-[64px] -mt-[64px] h-[30px] w-[2px]"
                          style={{
                            background: 'linear-gradient(180deg, rgba(31,61,114,0.15), rgba(212,180,122,0.65))',
                          }}
                        />
                      </>
                    ) : (
                      <>
                        <motion.span
                          aria-hidden="true"
                          animate={{ opacity: [0.35, 0.9, 0.35] }}
                          transition={{
                            duration: 2.2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                          className="absolute -ml-[216px] -mt-px h-[2px] w-[82px]"
                          style={{
                            background: 'linear-gradient(90deg, rgba(31,61,114,0.15), rgba(212,180,122,0.65))',
                          }}
                        />
                        <motion.span
                          aria-hidden="true"
                          animate={{ opacity: [0.35, 0.9, 0.35] }}
                          transition={{
                            duration: 2.2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: 1.1,
                          }}
                          className="absolute ml-[134px] -mt-px h-[2px] w-[82px]"
                          style={{
                            background: 'linear-gradient(270deg, rgba(31,61,114,0.15), rgba(212,180,122,0.65))',
                          }}
                        />
                      </>
                    )}
                    <motion.div
                      animate={{ y: [0, -4, 0] }}
                      transition={{
                        duration: 3.1,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                      className={`absolute ${phone ? '-ml-[128px] -mt-[124px] w-[124px]' : '-ml-[330px] -mt-[30px]'}`}
                    >
                      <SourceChip name="June-TB.xlsx" meta="412 rows ✓" />
                    </motion.div>
                    <motion.div
                      animate={{ y: [0, -4, 0] }}
                      transition={{
                        duration: 3.1,
                        repeat: Infinity,
                        ease: 'easeInOut',
                        delay: 1.4,
                      }}
                      className={`absolute ${phone ? 'ml-[4px] -mt-[124px] w-[124px]' : 'ml-[218px] -mt-[30px]'}`}
                    >
                      <SourceChip name="QuickBooks" meta="connected" />
                    </motion.div>
                    {/* THE BUTTON — the product promise, pressable. */}
                    <div className="absolute -ml-[130px] -mt-[34px] w-[260px]">
                      <motion.button
                        type="button"
                        onClick={() => run(true)}
                        animate={{ y: [0, -5, 0] }}
                        transition={{
                          duration: 2.6,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.96 }}
                        className="relative w-full rounded-[16px] btn-cta px-6 py-4 text-[14px] font-bold uppercase tracking-[0.14em] outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2"
                      >
                        <span
                          aria-hidden="true"
                          className="absolute -inset-2 -z-10 animate-pulse rounded-[24px] bg-gold/25 blur-xl motion-reduce:animate-none"
                        />
                        <span className="flex items-center justify-center gap-2">
                          <MousePointerClick size={17} aria-hidden="true" /> Close June — one click
                        </span>
                      </motion.button>
                      <span className="mt-2.5 block text-center text-[11px] text-navy/50">Go on. This is the whole job.</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Sync — the sources rush the core. */}
              <AnimatePresence>
                {beat === 'sync' && (
                  <motion.div
                    key="sync"
                    exit={{
                      opacity: 0,
                      scale: 0.5,
                      transition: { duration: 0.25 },
                    }}
                    className="absolute left-1/2 top-1/2"
                  >
                    <motion.div
                      initial={phone ? { x: -128, y: -94, opacity: 1 } : { x: -330, y: 0, opacity: 1 }}
                      animate={{ x: -60, y: 0, opacity: 0, scale: 0.5 }}
                      transition={{ duration: 1.1, ease: EASE }}
                      className="absolute -mt-[30px]"
                    >
                      <SourceChip name="June-TB.xlsx" meta="412 rows ✓" />
                    </motion.div>
                    <motion.div
                      initial={phone ? { x: 4, y: -94, opacity: 1 } : { x: 218, y: 0, opacity: 1 }}
                      animate={{ x: 10, y: 0, opacity: 0, scale: 0.5 }}
                      transition={{ duration: 1.1, ease: EASE }}
                      className="absolute -mt-[30px]"
                    >
                      <SourceChip name="QuickBooks" meta="connected" />
                    </motion.div>
                    <motion.div
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1, rotate: 360 }}
                      transition={{
                        rotate: { duration: 1.4, ease: 'linear' },
                        scale: SPRING,
                        opacity: { duration: 0.2 },
                      }}
                      className="absolute -ml-[29px] -mt-[29px] rounded-full bg-[#2563EB]/10 p-4 text-[#2563EB]"
                      style={{ boxShadow: '0 0 60px -4px rgba(37,99,235,0.6)' }}
                    >
                      <RefreshCw size={26} />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* The four sheets — dealt, tightened, bound. */}
              {SHEETS.map((s, i) => (
                <motion.div
                  key={s.key}
                  initial={false}
                  animate={sheetPose(beat, i, phone)}
                  transition={{
                    ...SPRING,
                    delay: beat === 'statements' ? i * 0.09 : 0,
                  }}
                  className="absolute left-1/2 top-1/2 -ml-[91px] -mt-[70px]"
                  style={{ zIndex: 10 + i }}
                >
                  <Sheet s={s} delayIdx={i} active={bi >= 1 && bi <= 2} />
                </motion.div>
              ))}

              {/* KYRO's narrative beside the tightened stack (under it on phones). */}
              <AnimatePresence>
                {beat === 'penny' && (
                  <motion.div
                    key="narrative"
                    initial={phone ? { opacity: 0, x: -150, y: 116 } : { opacity: 0, x: 60, y: 0 }}
                    animate={phone ? { opacity: 1, x: -150, y: 92 } : { opacity: 1, x: 96, y: 0 }}
                    exit={
                      phone
                        ? { opacity: 0, y: 112, transition: { duration: 0.25 } }
                        : { opacity: 0, x: 40, transition: { duration: 0.25 } }
                    }
                    transition={SPRING}
                    className="absolute top-1/2 -mt-[120px] w-[300px]"
                  >
                    <div className="flex items-center gap-2.5">
                      <NarratingOwl />
                      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-navy/50">
                        KYRO drafts the story
                      </span>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {NARRATIVE.map((n, k) => (
                        <motion.li
                          key={n.text}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay: 0.3 + k * 0.35,
                            duration: 0.35,
                            ease: EASE,
                          }}
                          className="flex items-center gap-2 rounded-[8px] border border-navy/10 bg-white px-3 py-2 text-[12px] text-navy/80 shadow-sm"
                        >
                          <span className="min-w-0 flex-1">{n.text}</span>
                          <VerdictPill verdict={n.verdict} className="lrb-pill-xs" />
                        </motion.li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bind + done — the sealed packet, spark burst. */}
              <AnimatePresence>
                {(beat === 'bind' || beat === 'done') && (
                  <motion.div
                    key="packet"
                    initial={{ opacity: 0, y: 46, scale: 0.85 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{
                      opacity: 0,
                      scale: 0.85,
                      transition: { duration: 0.2 },
                    }}
                    transition={SPRING}
                    className="absolute left-1/2 top-1/2 z-30 -ml-[125px] -mt-[150px] w-[250px]"
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-14 -z-10 rounded-full bg-[#2563EB]/15 blur-3xl"
                    />
                    {/* Spark burst — fixed angles, fired once per bind. */}
                    {SPARKS.map((sp, k) => (
                      <motion.span
                        key={k}
                        aria-hidden="true"
                        initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                        animate={{
                          x: Math.cos(sp.angle) * sp.dist,
                          y: Math.sin(sp.angle) * sp.dist,
                          opacity: 0,
                          scale: 0.3,
                        }}
                        transition={{
                          duration: 0.9,
                          ease: 'easeOut',
                          delay: 0.15,
                        }}
                        className="absolute left-1/2 top-1/3 h-2 w-2 rounded-full"
                        style={{ background: sp.color, boxShadow: BLUE_GLOW }}
                      />
                    ))}
                    <PacketCover reduce={false} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Done — CTA + replay, pinned to the stage foot (outside the
                scale wrapper so it never shrinks on small screens). The
                Scholar tosses its cap once the row has faded in. */}
            <AnimatePresence>
              {beat === 'done' && (
                <motion.div
                  key="cta"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.5, duration: 0.4, ease: EASE }}
                  className="absolute inset-x-0 bottom-5 z-40 flex flex-wrap items-center justify-center gap-3 px-4"
                >
                  <CelebratingOwl />
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-2 rounded-[12px] btn-cta px-5 py-2.5 text-[12.5px] font-bold uppercase tracking-[0.14em] outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2"
                  >
                    Run it on your books
                  </Link>
                  <button
                    type="button"
                    onClick={() => run(true)}
                    className="inline-flex items-center gap-1.5 rounded-[12px] border border-navy/15 bg-white/80 px-4 py-2.5 text-[12.5px] font-semibold text-navy/70 transition-colors hover:border-navy/35 hover:text-navy outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
                  >
                    <RotateCcw size={13} aria-hidden="true" /> Run it again
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Beat rail — lights as the run passes through, with a blue
              progress line filling across its top edge. ── */}
          <div className="relative border-t border-navy/10 bg-white/60 px-4 py-4 sm:px-8">
            <motion.div
              aria-hidden="true"
              className="absolute left-0 top-0 h-[2px] bg-gold-gradient"
              initial={false}
              animate={{
                width: `${beat === 'done' ? 100 : ((bi + 1) / BEATS.length) * 100}%`,
              }}
              transition={{ duration: 0.5, ease: EASE }}
            />
            <ol className="grid grid-cols-4 gap-2">
              {BEATS.map((t, i) => {
                const state = bi > i || beat === 'done' ? 'past' : bi === i ? 'live' : 'ahead'
                return (
                  <li
                    key={t.key}
                    className={`flex items-center justify-center gap-2 transition-opacity duration-300 ${state === 'ahead' ? 'opacity-35' : 'opacity-100'}`}
                  >
                    <span
                      className={`flex h-7 w-7 flex-none items-center justify-center rounded-full transition-colors duration-300 ${
                        state === 'past'
                          ? 'bg-emerald-600/15 text-emerald-700'
                          : state === 'live'
                            ? 'bg-[#2563EB] text-white shadow-[0_8px_20px_-8px_rgba(37,99,235,0.7)]'
                            : 'bg-navy/10 text-navy/50'
                      }`}
                    >
                      {state === 'past' ? <Check size={13} /> : <t.Icon size={13} />}
                    </span>
                    <span className="hidden text-left text-[11px] font-medium leading-tight text-navy/70 md:block">
                      <span className="block font-mono text-[9.5px] font-bold text-[#7a5e00]">4:{t.minute} PM</span>
                      {t.label}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}

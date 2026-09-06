// ─────────────────────────────────────────────────────────────────────────────
// BoardReadyShow — the ONE-CLICK BUILD: an interactive stage where the
// product's actual promise is the interaction. A gold "Close June — one
// click" button fires a ~7-second choreographed run:
//   sync        the export and QuickBooks converge into a spinning core
//   statements  four sheets spring out of the core and tie out
//   penny       the stack tightens left; Penny's narrative types beside it
//   bind        everything collapses into the sealed packet — spark burst,
//               clock lands on 4:19, CTA morphs in, "Run it again" offered
// The wall-clock chip flips 4:12 → 4:19 beat by beat: the section's claim
// ("board-ready in one afternoon") is acted out, not narrated. Auto-plays
// once when scrolled into view; every replay is a click. NOT scroll-driven —
// the orbit set-piece already owns that pattern on this page.
// Reduced motion: a static four-step + packet layout, no theater.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion'
import { Activity, Check, FileBarChart2, FileStack, Landmark, Layers, MousePointerClick, RefreshCw, RotateCcw, Sparkles, Waves } from 'lucide-react'
import { Link } from 'react-router-dom'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'

const EASE = [0.2, 0.8, 0.2, 1]
const SPRING = { type: 'spring', stiffness: 200, damping: 24 }

// The run: beat key, dwell (ms), and the minute the clock flips to at its
// start. 4:12 → 4:19 — seven on-screen seconds standing in for seven minutes.
const BEATS = [
  { key: 'sync', ms: 1400, minute: 12, label: 'Sync or drop the month', Icon: RefreshCw },
  { key: 'statements', ms: 2100, minute: 13, label: 'Statements tie out', Icon: FileStack },
  { key: 'penny', ms: 2300, minute: 15, label: 'KYRO drafts the story', Icon: Sparkles },
  { key: 'bind', ms: 1500, minute: 18, label: 'Packet binds', Icon: FileBarChart2 },
]
const DONE_MINUTE = 19

// Each statement gets its own hue, icon and a sparkline that draws itself
// when the sheet ties out — four sheets that read as four documents, not
// four copies of one grey card.
const SHEETS = [
  { key: 'sfp', title: 'Financial Position', hue: '#2563EB', Icon: Landmark, rows: [['Total assets', '18.4M'], ['Net assets', '12.9M']], spark: 'M4 16 L30 13 L56 15 L82 9 L108 11 L134 5 L156 3' },
  { key: 'soa', title: 'Activities', hue: '#059669', Icon: Activity, rows: [['Revenue', '12.7M'], ['Expenses', '11.6M']], spark: 'M4 14 L30 17 L56 10 L82 13 L108 7 L134 9 L156 4' },
  { key: 'scf', title: 'Cash Flows', hue: '#d97706', Icon: Waves, rows: [['Operating', '+1.3M'], ['Ending cash', '2.1M']], spark: 'M4 12 L30 16 L56 18 L82 12 L108 14 L134 6 L156 8' },
  { key: 'sna', title: 'Net Assets', hue: '#7c3aed', Icon: Layers, rows: [['Released', '640K'], ['Change', '+1.08M']], spark: 'M4 17 L30 15 L56 12 L82 13 L108 9 L134 7 L156 3' },
]

const NARRATIVE = [
  'Cash days recovered to 43 — June tuition landed.',
  'Program spend 2.1% under budget YTD.',
  'One decision: the boiler contract renews Friday.',
]

// Bind-burst sparks: fixed angles/distances/colors, no per-render randomness.
const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  angle: (i / 14) * Math.PI * 2,
  dist: 88 + (i % 3) * 38,
  color: i % 2 === 0 ? '#d4b47a' : '#3b82f6',
}))

// Beat index for ordering checks; 'idle' → -1, 'done' → past the end.
const beatIdx = (b) => (b === 'idle' ? -1 : b === 'done' ? BEATS.length : BEATS.findIndex((x) => x.key === b))

// Sheet poses per beat (desktop px; the stage scales down responsively).
function sheetPose(b, i) {
  const bi = beatIdx(b)
  if (bi < 1) return { x: 0, y: 30, rotate: 0, scale: 0.4, opacity: 0 }
  if (b === 'statements') return { x: (i - 1.5) * 188, y: Math.abs(i - 1.5) * 14 - 8, rotate: (i - 1.5) * 5, scale: 1, opacity: 1 }
  if (b === 'penny') return { x: -216 + i * 10, y: -2 + i * 7, rotate: -3 + i * 2, scale: 0.94, opacity: 1 }
  return { x: 0, y: 6, rotate: (i - 1.5) * 2, scale: 0.78, opacity: 0 }
}

function Sheet({ s, delayIdx, active }) {
  return (
    <div
      className="w-[182px] overflow-hidden rounded-xl border border-navy/10 bg-white"
      style={{ boxShadow: `0 22px 50px -22px rgba(16,28,61,0.5), 0 0 30px -14px ${s.hue}80` }}
    >
      {/* Hue rail — the document's identity at a glance. */}
      <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${s.hue}, ${s.hue}44)` }} />
      <div className="p-3">
        <div className="flex items-center justify-between gap-1.5">
          <span className="flex min-w-0 items-center gap-1 text-[9px] font-bold uppercase tracking-[0.02em] text-navy/60">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md" style={{ background: `${s.hue}1c`, color: s.hue }}>
              <s.Icon size={11} />
            </span>
            <span className="truncate">{s.title}</span>
          </span>
          <motion.span
            initial={false}
            animate={active ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
            transition={{ ...SPRING, delay: 0.35 + delayIdx * 0.12 }}
            className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700"
          >
            <Check size={11} />
          </motion.span>
        </div>
        <div className="mt-2 space-y-1 text-[10.5px] text-navy/70" aria-hidden="true">
          {rows(s)}
        </div>
        {/* The sparkline draws itself as the sheet ties out. */}
        <svg className="mt-1.5 w-full" height="20" viewBox="0 0 160 20" preserveAspectRatio="none" aria-hidden="true">
          <motion.path
            d={s.spark}
            fill="none"
            stroke={s.hue}
            strokeWidth="1.8"
            strokeLinecap="round"
            initial={false}
            animate={{ pathLength: active ? 1 : 0, opacity: active ? 1 : 0 }}
            transition={{ duration: 0.8, delay: 0.35 + delayIdx * 0.12, ease: EASE }}
          />
        </svg>
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

function PacketCover({ reduce }) {
  return (
    <motion.div
      whileHover={reduce ? undefined : { scale: 1.03, rotate: -1 }}
      transition={SPRING}
      className="w-[250px] rounded-2xl border border-navy/10 bg-white p-4 shadow-[0_38px_90px_-30px_rgba(16,28,61,0.6)] ring-1 ring-gold/30"
    >
      <div className="relative overflow-hidden rounded-xl bg-navy-gradient px-4 py-6 text-center">
        {/* Gold-foil sweep across the cover as it lands. */}
        {!reduce && (
          <motion.span
            aria-hidden="true"
            className="absolute inset-y-[-30%] left-0 w-1/3 -skew-x-12"
            style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.06), rgba(212,180,122,0.4), rgba(255,255,255,0.06), transparent)' }}
            initial={{ x: '-150%' }}
            animate={{ x: '420%' }}
            transition={{ duration: 1.1, delay: 0.55, ease: 'easeInOut' }}
          />
        )}
        <span aria-hidden="true" className="mx-auto block h-px w-24 bg-gradient-to-r from-transparent via-penny-light/70 to-transparent" />
        <span className="mt-3 block font-serif text-[19px] font-semibold leading-tight text-white">St. Brigid&rsquo;s School</span>
        <span className="mt-1.5 block text-[9.5px] font-bold uppercase tracking-[0.2em] text-penny-light">Finance Committee Packet</span>
        <span className="mt-2.5 block text-[10.5px] text-white/65">June 2026 · FY26 close</span>
        <span aria-hidden="true" className="mx-auto mt-3 block h-px w-24 bg-gradient-to-r from-transparent via-penny-light/70 to-transparent" />
      </div>
      {/* The seal — stamped, not faded in. */}
      <motion.div
        initial={reduce ? false : { scale: 2.2, opacity: 0, rotate: -14 }}
        animate={{ scale: 1, opacity: 1, rotate: -6 }}
        transition={{ type: 'spring', stiffness: 300, damping: 16, delay: reduce ? 0 : 0.4 }}
        className="mx-auto -mt-3 flex w-fit items-center gap-1.5 rounded-full border-2 border-emerald-600/70 bg-white px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-emerald-700 shadow-md"
      >
        <Check size={12} /> Board-ready
      </motion.div>
      <span className="mt-2.5 block text-center text-[9.5px] font-bold uppercase tracking-[0.16em] text-navy/45">Prepared with KYRO</span>
    </motion.div>
  )
}

function Header() {
  return (
    <div className="text-center">
      <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">The board packet</p>
      <h2 id="board-h2" className="mt-3 font-serif text-[32px] font-semibold leading-tight text-navy sm:text-[42px]">
        Board-ready, start to finish.
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-muted">
        From the bookkeeper&rsquo;s export to the packet in the committee&rsquo;s inbox — watch
        an afternoon happen, then run it on your own books.
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
        <div className="mt-12 grid gap-3 sm:grid-cols-2">
          {BEATS.map((t) => (
            <div key={t.key} className="flex items-center gap-3 rounded-2xl border border-navy/10 bg-white/80 px-5 py-4">
              <span className="font-mono text-[12px] font-bold text-[#7a5e00]">4:{t.minute} PM</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB]/10 text-[#2563EB]"><t.Icon size={15} /></span>
              <b className="text-[14px] font-semibold text-navy">{t.label}</b>
            </div>
          ))}
        </div>
        <div className="mt-10 flex justify-center"><PacketCover reduce /></div>
      </div>
    </section>
  )
}

export default function BoardReadyShow() {
  const reduce = useReducedMotion()
  const stageRef = useRef(null)
  const inView = useInView(stageRef, { once: true, margin: '-160px' })
  const [beat, setBeat] = useState('idle')
  const timers = useRef([])

  const run = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
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
          className="relative mt-12 overflow-hidden rounded-3xl border border-navy/10 bg-gradient-to-br from-white/90 to-[#dde7f8]/80 shadow-[0_30px_80px_-30px_rgba(16,28,61,0.45)] backdrop-blur-sm"
        >
          {/* Flip clock — navy chip, gold digits, blinking colon; every part
              sits on one centered row so nothing floats off-baseline. */}
          <div className="absolute right-4 top-4 z-40 rounded-xl bg-navy-gradient px-3.5 py-2 text-center shadow-[0_16px_36px_-14px_rgba(16,28,61,0.7)] ring-1 ring-white/15">
            <span className="flex items-center justify-center font-mono text-[21px] font-bold tabular-nums leading-none text-white">
              <span>4</span>
              <motion.span
                aria-hidden="true"
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
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

          <div className="relative h-[380px] sm:h-[440px]">
            {/* Ambience: a slow-turning gold/blue halo + a faint dot grid.
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
                  transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
                />
              </div>
              <div
                className="absolute inset-0"
                style={{ backgroundImage: 'radial-gradient(rgba(31,61,114,0.09) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
              />
            </div>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-[0.55] sm:scale-90 lg:scale-100">
              {/* Idle — the sources wait either side of THE BUTTON. */}
              <AnimatePresence>
                {beat === 'idle' && (
                  <motion.div key="idle" exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.3 } }} className="absolute left-1/2 top-1/2">
                    {/* Dashed beams feeding the button — the sources are wired
                        in and waiting. */}
                    <motion.span
                      aria-hidden="true"
                      animate={{ opacity: [0.35, 0.9, 0.35] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute -ml-[216px] -mt-px h-[2px] w-[82px]"
                      style={{ background: 'linear-gradient(90deg, rgba(31,61,114,0.15), rgba(212,180,122,0.65))' }}
                    />
                    <motion.span
                      aria-hidden="true"
                      animate={{ opacity: [0.35, 0.9, 0.35] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 1.1 }}
                      className="absolute ml-[134px] -mt-px h-[2px] w-[82px]"
                      style={{ background: 'linear-gradient(270deg, rgba(31,61,114,0.15), rgba(212,180,122,0.65))' }}
                    />
                    <motion.div
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 3.1, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute -ml-[330px] -mt-[30px] rounded-xl border border-navy/10 bg-white px-4 py-3 text-center shadow-[0_14px_30px_-16px_rgba(16,28,61,0.5)]"
                    >
                      <span className="block whitespace-nowrap font-mono text-[11px] text-navy/60">June-TB.xlsx</span>
                      <span className="text-[10px] font-semibold text-emerald-700">412 rows ✓</span>
                    </motion.div>
                    <motion.div
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 3.1, repeat: Infinity, ease: 'easeInOut', delay: 1.4 }}
                      className="absolute ml-[218px] -mt-[30px] rounded-xl border border-navy/10 bg-white px-4 py-3 text-center shadow-[0_14px_30px_-16px_rgba(16,28,61,0.5)]"
                    >
                      <span className="block whitespace-nowrap font-mono text-[11px] text-navy/60">QuickBooks</span>
                      <span className="text-[10px] font-semibold text-emerald-700">connected</span>
                    </motion.div>
                    {/* THE BUTTON — the product promise, pressable. */}
                    <div className="absolute -ml-[130px] -mt-[34px] w-[260px]">
                      <motion.button
                        type="button"
                        onClick={run}
                        animate={{ y: [0, -5, 0] }}
                        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.96 }}
                        className="relative w-full rounded-2xl btn-cta px-6 py-4 text-[14px] font-bold uppercase tracking-[0.14em] text-navy-deep shadow-glow-lg outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                      >
                        <span aria-hidden="true" className="absolute -inset-2 -z-10 animate-pulse rounded-3xl bg-gold/25 blur-xl" />
                        <span className="flex items-center justify-center gap-2">
                          <MousePointerClick size={17} /> Close June — one click
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
                  <motion.div key="sync" exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.25 } }} className="absolute left-1/2 top-1/2">
                    <motion.div
                      initial={{ x: -330, opacity: 1 }}
                      animate={{ x: -60, opacity: 0, scale: 0.5 }}
                      transition={{ duration: 1.1, ease: EASE }}
                      className="absolute -mt-[30px] rounded-xl border border-navy/10 bg-white px-4 py-3 text-center shadow-md"
                    >
                      <span className="block whitespace-nowrap font-mono text-[11px] text-navy/60">June-TB.xlsx</span>
                      <span className="text-[10px] font-semibold text-emerald-700">412 rows ✓</span>
                    </motion.div>
                    <motion.div
                      initial={{ x: 218, opacity: 1 }}
                      animate={{ x: 10, opacity: 0, scale: 0.5 }}
                      transition={{ duration: 1.1, ease: EASE }}
                      className="absolute -mt-[30px] rounded-xl border border-navy/10 bg-white px-4 py-3 text-center shadow-md"
                    >
                      <span className="block whitespace-nowrap font-mono text-[11px] text-navy/60">QuickBooks</span>
                      <span className="text-[10px] font-semibold text-emerald-700">connected</span>
                    </motion.div>
                    <motion.div
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1, rotate: 360 }}
                      transition={{ rotate: { duration: 1.4, ease: 'linear' }, scale: SPRING, opacity: { duration: 0.2 } }}
                      className="absolute -ml-[29px] -mt-[29px] rounded-full bg-[#2563EB]/10 p-4 text-[#2563EB] shadow-[0_0_60px_-4px_rgba(37,99,235,0.6)]"
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
                  animate={sheetPose(beat, i)}
                  transition={{ ...SPRING, delay: beat === 'statements' ? i * 0.09 : 0 }}
                  className="absolute left-1/2 top-1/2 -ml-[91px] -mt-[70px]"
                  style={{ zIndex: 10 + i }}
                >
                  <Sheet s={s} delayIdx={i} active={bi >= 1 && bi <= 2} />
                </motion.div>
              ))}

              {/* Penny's narrative beside the tightened stack. */}
              <AnimatePresence>
                {beat === 'penny' && (
                  <motion.div
                    key="narrative"
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 96 }}
                    exit={{ opacity: 0, x: 40, transition: { duration: 0.25 } }}
                    transition={SPRING}
                    className="absolute top-1/2 -mt-[120px] w-[300px]"
                  >
                    <div className="flex items-center gap-2.5">
                      <PennyAvatar size={40} />
                      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-navy/50">KYRO drafts the story</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {NARRATIVE.map((t, k) => (
                        <motion.div
                          key={t}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 + k * 0.35, duration: 0.35, ease: EASE }}
                          className="rounded-lg border border-navy/10 bg-white px-3 py-2 text-[12px] text-navy/80 shadow-sm"
                        >
                          {t}
                        </motion.div>
                      ))}
                    </div>
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
                    exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
                    transition={SPRING}
                    className="absolute left-1/2 top-1/2 z-30 -ml-[125px] -mt-[150px] w-[250px]"
                  >
                    <span aria-hidden="true" className="pointer-events-none absolute -inset-14 -z-10 rounded-full bg-[#2563EB]/15 blur-3xl" />
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
                        transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }}
                        className="absolute left-1/2 top-1/3 h-2 w-2 rounded-full shadow-glow"
                        style={{ background: sp.color }}
                      />
                    ))}
                    <PacketCover reduce={false} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Done — CTA + replay, pinned to the stage foot (outside the
                scale wrapper so it never shrinks on small screens). */}
            <AnimatePresence>
              {beat === 'done' && (
                <motion.div
                  key="cta"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.5, duration: 0.4, ease: EASE }}
                  className="absolute inset-x-0 bottom-5 z-40 flex items-center justify-center gap-3"
                >
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-2 rounded-xl btn-cta px-5 py-2.5 text-[12.5px] font-bold uppercase tracking-[0.14em] text-navy-deep transition-shadow hover:shadow-glow-lg outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                  >
                    Run it on your books
                  </Link>
                  <button
                    type="button"
                    onClick={run}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-navy/15 bg-white/80 px-4 py-2.5 text-[12.5px] font-semibold text-navy/70 transition-colors hover:border-navy/35 hover:text-navy outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
                  >
                    <RotateCcw size={13} /> Run it again
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Beat rail — lights as the run passes through, with a gold
              progress line filling across its top edge. ── */}
          <div className="relative border-t border-navy/10 bg-white/60 px-4 py-4 sm:px-8">
            <motion.div
              aria-hidden="true"
              className="absolute left-0 top-0 h-[2px] bg-gold-gradient"
              initial={false}
              animate={{ width: `${beat === 'done' ? 100 : ((bi + 1) / BEATS.length) * 100}%` }}
              transition={{ duration: 0.5, ease: EASE }}
            />
            <div className="grid grid-cols-4 gap-2">
              {BEATS.map((t, i) => {
                const state = bi > i || beat === 'done' ? 'past' : bi === i ? 'live' : 'ahead'
                return (
                  <div key={t.key} className={`flex items-center justify-center gap-2 transition-opacity duration-300 ${state === 'ahead' ? 'opacity-35' : 'opacity-100'}`}>
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
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

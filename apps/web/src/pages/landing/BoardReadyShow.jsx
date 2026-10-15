// ─────────────────────────────────────────────────────────────────────────────
// BoardReadyShow — the ONE-CLICK BUILD: an interactive stage where the
// product's actual promise is the interaction. A "Close June — one click"
// button fires a ~7-second choreographed run:
//   sync        the export and QuickBooks converge into a turning core
//   statements  four sheets spring out of the core and tie out
//   penny       the stack tightens left; Penny's narrative types beside it
//   bind        everything collapses into the sealed packet — spark burst,
//               clock lands on 4:19, CTA morphs in, "Run it again" offered
// The wall-clock flips 4:12 → 4:19 beat by beat: the section's claim
// ("board-ready in one afternoon") is acted out, not narrated. Auto-plays
// once when scrolled into view; every replay is a click. NOT scroll-driven —
// the orbit set-piece already owns that pattern on this page.
// Premium UI P5: the stage is a Panel (it is the one thing on the page you
// press), white with a hairline; the sheets are paper with a 2px hue rule; the
// packet is a paper cover with a double rule and a stamped seal. Nothing idles:
// no conic halo, no floating sources, no pulsing button, no blinking colon.
// Reduced motion: a static four-step + packet layout, no theater.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion'
import { Activity, Check, FileBarChart2, FileStack, Landmark, Layers, MousePointerClick, RefreshCw, RotateCcw, Sparkles, Waves } from 'lucide-react'
import { Button, Panel } from '../../components/ui/surface/index.js'
import SectionHead from './SectionHead.jsx'
import '../../styles/pending/p5-landing.css'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import useMediaQuery from './useMediaQuery.js'

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

// Each statement keeps its own hue — as a 2px rule and an icon stroke only —
// and a sparkline that draws itself when the sheet ties out: four documents,
// not four copies of one grey card.
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

// Bind-burst sparks: fixed angles/distances, primary only, fired once per bind.
const SPARKS = Array.from({ length: 12 }, (_, i) => ({
  angle: (i / 12) * Math.PI * 2,
  dist: 80 + (i % 3) * 34,
}))

// Beat index for ordering checks; 'idle' → -1, 'done' → past the end.
const beatIdx = (b) => (b === 'idle' ? -1 : b === 'done' ? BEATS.length : BEATS.findIndex((x) => x.key === b))

// Sheet poses per beat (stage px; the stage scales down responsively). Wide
// stages deal the four sheets in one straight row; phones and small tablets get their
// own pose set (below md) — a 2×2 grid, and the stack lifted ABOVE KYRO's narrative
// instead of beside it — so nothing reaches past the Panel's edges.
function sheetPose(b, i, phone) {
  const bi = beatIdx(b)
  if (bi < 1) return { x: 0, y: 30, rotate: 0, scale: 0.4, opacity: 0 }
  if (b === 'statements') {
    return phone
      ? { x: ((i % 2) - 0.5) * 196, y: (i < 2 ? -1 : 1) * 74, rotate: 0, scale: 1, opacity: 1 }
      : { x: (i - 1.5) * 194, y: 0, rotate: 0, scale: 1, opacity: 1 }
  }
  if (b === 'penny') {
    return phone
      ? { x: -9 + i * 6, y: -112 + i * 5, rotate: 0, scale: 0.86, opacity: 1 }
      : { x: -216 + i * 10, y: -2 + i * 7, rotate: -3 + i * 2, scale: 0.94, opacity: 1 }
  }
  return { x: 0, y: 6, rotate: 0, scale: 0.78, opacity: 0 }
}

const CAPS = 'text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink2'

function Sheet({ s, delayIdx, active }) {
  return (
    <div className="w-[182px] overflow-hidden rounded-[4px] border border-hair/[.16] bg-white">
      {/* Hue rule — the document's identity at a glance. */}
      <div className="h-[2px] w-full" style={{ background: s.hue }} />
      <div className="p-3">
        <div className="flex items-center justify-between gap-1.5">
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-ink2">
            <s.Icon size={13} strokeWidth={1.75} style={{ color: s.hue }} className="shrink-0" />
            <span className="truncate">{s.title}</span>
          </span>
          <motion.span
            initial={false}
            animate={active ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
            transition={{ ...SPRING, delay: 0.35 + delayIdx * 0.12 }}
            className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border border-good/60 text-good"
          >
            <Check size={11} />
          </motion.span>
        </div>
        <div className="mt-2 space-y-1 text-[13px] leading-[18px] text-ink" aria-hidden="true">
          {rows(s)}
        </div>
        {/* The sparkline draws itself as the sheet ties out. */}
        <svg className="mt-1.5 w-full" height="20" viewBox="0 0 160 20" preserveAspectRatio="none" aria-hidden="true">
          <motion.path
            d={s.spark}
            fill="none"
            stroke={s.hue}
            strokeWidth="1.5"
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
      <span className="text-ink2">{l}</span>
      <span className="font-semibold tabular-nums">{v}</span>
    </div>
  ))

// A source, as plain text on the ground (no chip): name in ink, meta in ink-2.
// Positioned by the caller (absolute offsets) — the wires carry the link.
function SourceLabel({ name, meta, className = '' }) {
  return (
    <div className={`absolute text-center ${className}`}>
      <span className="block whitespace-nowrap text-[13px] font-semibold leading-[18px] text-ink">{name}</span>
      <span className="block text-[13px] leading-[18px] text-ink2">{meta}</span>
    </div>
  )
}

// The packet: a paper cover — Garamond title between double rules, the seal
// STAMPED on (good-tone ring, ink text), "Prepared with KYRO" in small caps.
function PacketCover() {
  return (
    <div className="w-[250px] rounded-md border border-hair/[.16] bg-white px-5 pb-4 pt-6 text-center">
      <span aria-hidden="true" className="mx-auto block h-[3px] w-28 border-y border-ink/50" />
      <span className="mt-3 block font-serif text-[22px] font-medium leading-7 text-ink">St. Brigid&rsquo;s School</span>
      <span className={`mt-1.5 block ${CAPS}`}>Finance Committee Packet</span>
      <span className="mt-2 block text-[13px] leading-[18px] text-ink2">June 2026 · FY26 close</span>
      <span aria-hidden="true" className="mx-auto mt-3 block h-[3px] w-28 border-y border-ink/50" />
      {/* The seal — stamped, not faded in (one-shot spring). */}
      <motion.div
        initial={{ scale: 1.8, opacity: 0, rotate: -14 }}
        animate={{ scale: 1, opacity: 1, rotate: -6 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.4 }}
        className="mx-auto mt-4 flex w-fit items-center gap-1.5 rounded-sm border-2 border-good/80 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink"
      >
        <Check size={12} className="text-good" /> Board-ready
      </motion.div>
      <span className={`mt-3 block ${CAPS}`}>Prepared with KYRO</span>
    </div>
  )
}

// ── Reduced-motion fallback: the four beats as a ruled list, no theater. ──────
function StaticShow() {
  return (
    <section id="board-ready" aria-labelledby="board-h2" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead id="board-h2" kicker={HEAD.kicker} title={HEAD.title} sub={HEAD.sub} />
        <div className="mt-12 grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_auto]">
          <ol className="border-b border-hair">
            {BEATS.map((t) => (
              <li key={t.key} className="flex items-center gap-4 border-t border-hair py-3">
                <span className="w-16 text-[13px] font-semibold tabular-nums text-ink2">4:{t.minute} PM</span>
                <t.Icon size={16} strokeWidth={1.75} className="text-ink2" aria-hidden="true" />
                <b className="text-[15px] font-semibold text-ink">{t.label}</b>
              </li>
            ))}
          </ol>
          <div className="flex justify-center"><PacketCover /></div>
        </div>
      </div>
    </section>
  )
}

const HEAD = {
  kicker: 'The board packet',
  title: 'Board-ready, start to finish.',
  sub: 'From the bookkeeper’s export to the packet in the committee’s inbox. Watch an afternoon happen, then run it on your own books.',
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
    <section id="board-ready" aria-labelledby="board-h2" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead id="board-h2" kicker={HEAD.kicker} title={HEAD.title} sub={HEAD.sub} />

        {/* ── The stage: a Panel — the one thing in this section you press ── */}
        <div ref={stageRef} className="mt-12">
          <Panel padded={false} className="relative overflow-hidden">
            {/* The wall clock: ink figures on paper, the minute flips per beat. */}
            <div className="absolute right-4 top-4 z-40 border-b border-hair pb-1.5 text-right">
              <span className="flex h-8 items-center justify-end font-serif text-[30px] font-medium leading-8 tabular-nums text-ink">
                <span>4</span>
                <span aria-hidden="true" className="mx-0.5">:</span>
                <span className="relative inline-flex h-8 w-[30px] items-center justify-center overflow-hidden">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={minute}
                      initial={{ y: 18, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -18, opacity: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      {minute}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <span className="ml-1 self-end pb-1 font-sans text-[11px] font-semibold leading-4 text-ink2">PM</span>
              </span>
              <span className={`block ${CAPS}`}>This afternoon</span>
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
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-[0.78] sm:scale-90 md:scale-[0.88] lg:scale-100">
                {/* Idle — the sources wait either side of THE BUTTON (above it
                    on phones), plain text on the ground wired in by hairlines.
                    Nothing bobs; the button waits. */}
                <AnimatePresence>
                  {beat === 'idle' && (
                    <motion.div key="idle" exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.25 } }} className="absolute left-1/2 top-1/2">
                      {phone ? (
                        <>
                          <span aria-hidden="true" className="absolute -ml-[66px] -mt-[66px] h-[38px] w-px bg-ink/20" />
                          <span aria-hidden="true" className="absolute ml-[66px] -mt-[66px] h-[38px] w-px bg-ink/20" />
                        </>
                      ) : (
                        <>
                          <span aria-hidden="true" className="absolute -ml-[216px] -mt-px h-px w-[82px] bg-ink/20" />
                          <span aria-hidden="true" className="absolute ml-[134px] -mt-px h-px w-[82px] bg-ink/20" />
                        </>
                      )}
                      <SourceLabel name="June-TB.xlsx" meta="412 rows" className={phone ? '-ml-[126px] -mt-[112px] w-[120px]' : '-ml-[330px] -mt-[22px] w-[110px]'} />
                      <SourceLabel name="QuickBooks" meta="connected" className={phone ? 'ml-[6px] -mt-[112px] w-[120px]' : 'ml-[222px] -mt-[22px] w-[110px]'} />
                      {/* THE BUTTON — the product promise, pressable. */}
                      <div className="absolute -ml-[130px] -mt-[24px] w-[260px] text-center">
                        <Button variant="primary" onClick={() => run(true)} className="btn-lg w-full">
                          <MousePointerClick size={17} aria-hidden="true" /> Close June — one click
                        </Button>
                        <span className="mt-2.5 block text-[13px] text-ink2">Go on. This is the whole job.</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Sync — the sources rush the core, which turns once. */}
                <AnimatePresence>
                  {beat === 'sync' && (
                    <motion.div key="sync" exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.25 } }} className="absolute left-1/2 top-1/2">
                      <motion.div
                        initial={phone ? { x: -126, y: -90, opacity: 1 } : { x: -330, y: 0, opacity: 1 }}
                        animate={{ x: -55, y: 0, opacity: 0, scale: 0.5 }}
                        transition={{ duration: 1.1, ease: EASE }}
                        className="absolute -mt-[22px]"
                      >
                        <SourceLabel name="June-TB.xlsx" meta="412 rows" className="w-[110px]" />
                      </motion.div>
                      <motion.div
                        initial={phone ? { x: 6, y: -90, opacity: 1 } : { x: 222, y: 0, opacity: 1 }}
                        animate={{ x: -55, y: 0, opacity: 0, scale: 0.5 }}
                        transition={{ duration: 1.1, ease: EASE }}
                        className="absolute -mt-[22px]"
                      >
                        <SourceLabel name="QuickBooks" meta="connected" className="w-[110px]" />
                      </motion.div>
                      <motion.div
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1, rotate: 360 }}
                        transition={{ rotate: { duration: 1.4, ease: 'easeInOut' }, scale: SPRING, opacity: { duration: 0.2 } }}
                        className="absolute -ml-[29px] -mt-[29px] rounded-full border border-[#2563EB]/40 bg-white p-4 text-[#2563EB]"
                      >
                        <RefreshCw size={26} strokeWidth={1.75} />
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* The four sheets — dealt, tightened, bound. */}
                {SHEETS.map((sh, i) => (
                  <motion.div
                    key={sh.key}
                    initial={false}
                    animate={sheetPose(beat, i, phone)}
                    transition={{ ...SPRING, delay: beat === 'statements' ? i * 0.09 : 0 }}
                    className="absolute left-1/2 top-1/2 -ml-[91px] -mt-[70px]"
                    style={{ zIndex: 10 + i }}
                  >
                    <Sheet s={sh} delayIdx={i} active={bi >= 1 && bi <= 2} />
                  </motion.div>
                ))}

                {/* KYRO's narrative beside the tightened stack. */}
                <AnimatePresence>
                  {beat === 'penny' && (
                    <motion.div
                      key="narrative"
                      initial={phone ? { opacity: 0, x: -150, y: 116 } : { opacity: 0, x: 60, y: 0 }}
                      animate={phone ? { opacity: 1, x: -150, y: 92 } : { opacity: 1, x: 96, y: 0 }}
                      exit={phone ? { opacity: 0, y: 112, transition: { duration: 0.25 } } : { opacity: 0, x: 40, transition: { duration: 0.25 } }}
                      transition={SPRING}
                      className="absolute top-1/2 -mt-[120px] w-[300px]"
                    >
                      <div className="flex items-center gap-2.5">
                        <PennyAvatar size={40} />
                        <span className={CAPS}>KYRO drafts the story</span>
                      </div>
                      <ul className="mt-3 border-b border-hair bg-white">
                        {NARRATIVE.map((t, k) => (
                          <motion.li
                            key={t}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 + k * 0.35, duration: 0.35, ease: EASE }}
                            className="flex gap-2.5 border-t border-hair py-2 text-[13px] leading-[18px] text-ink"
                          >
                            <span aria-hidden="true" className="w-[2px] shrink-0 self-stretch bg-penny" />
                            {t}
                          </motion.li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bind + done — the sealed packet, one spark burst. */}
                <AnimatePresence>
                  {(beat === 'bind' || beat === 'done') && (
                    <motion.div
                      key="packet"
                      initial={{ opacity: 0, y: 40, scale: 0.88 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.88, transition: { duration: 0.2 } }}
                      transition={SPRING}
                      className="absolute left-1/2 top-1/2 z-30 -ml-[125px] -mt-[150px] w-[250px]"
                    >
                      {SPARKS.map((sp, k) => (
                        <motion.span
                          key={k}
                          aria-hidden="true"
                          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                          animate={{ x: Math.cos(sp.angle) * sp.dist, y: Math.sin(sp.angle) * sp.dist, opacity: 0, scale: 0.3 }}
                          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }}
                          className="absolute left-1/2 top-1/3 h-1.5 w-1.5 rounded-full"
                          style={{ background: '#2563EB' }}
                        />
                      ))}
                      <PacketCover />
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
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 0.5, duration: 0.4, ease: EASE }}
                    className="absolute inset-x-0 bottom-5 z-40 flex flex-wrap items-center justify-center gap-3 px-4"
                  >
                    <Button to="/register" variant="primary">
                      Run it on your books
                    </Button>
                    <Button variant="secondary" onClick={() => run(true)} icon={<RotateCcw size={13} />}>
                      Run it again
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Beat rail — lights as the run passes through, with a 2px
                primary progress rule filling across its top edge. ── */}
            <div className="relative border-t border-hair px-4 py-4 sm:px-8">
              <motion.div
                aria-hidden="true"
                className="absolute left-0 top-[-1px] h-[2px] bg-[#2563EB]"
                initial={false}
                animate={{ width: `${beat === 'done' ? 100 : ((bi + 1) / BEATS.length) * 100}%` }}
                transition={{ duration: 0.5, ease: EASE }}
              />
              <ol className="grid grid-cols-4 gap-2">
                {BEATS.map((t, i) => {
                  const state = bi > i || beat === 'done' ? 'past' : bi === i ? 'live' : 'ahead'
                  return (
                    <li key={t.key} className={`flex items-center justify-center gap-2 transition-opacity duration-300 ${state === 'ahead' ? 'opacity-40' : 'opacity-100'}`}>
                      <span
                        className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border transition-colors duration-300 ${
                          state === 'past'
                            ? 'border-good/60 text-good'
                            : state === 'live'
                              ? 'border-[#2563EB] bg-[#2563EB] text-white'
                              : 'border-hair/[.2] text-ink2'
                        }`}
                      >
                        {state === 'past' ? <Check size={13} /> : <t.Icon size={13} strokeWidth={1.75} />}
                      </span>
                      <span className="hidden text-left text-[13px] leading-[18px] text-ink md:block">
                        <span className="block text-[11px] font-semibold tabular-nums text-ink2">4:{t.minute} PM</span>
                        {t.label}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </div>
          </Panel>
        </div>
      </div>
    </section>
  )
}

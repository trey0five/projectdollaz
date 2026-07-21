// ─────────────────────────────────────────────────────────────────────────────
// BoardReadyShow — "board-ready, start to finish": an auto-advancing SLIDESHOW
// of the four-step path (sync/upload → statements → Penny's narrative → export)
// with dot/arrow navigation and a per-slide animated visual, followed by the
// FINAL DEMO: a fanned three-page mock of the finance-committee packet itself.
// Light-ground; auto-advance + micro-animations sit behind reduced motion.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useInView, useReducedMotion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileStack,
  Sparkles,
  FileBarChart2,
  Check,
} from 'lucide-react'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import '../../styles/landing-orbit.css'

const SLIDES = [
  {
    key: 'sync',
    Icon: RefreshCw,
    title: 'Sync or drop the month',
    line: 'Pull June straight from QuickBooks — or drop the trial-balance export. Either way it lands mapped.',
  },
  {
    key: 'statements',
    Icon: FileStack,
    title: 'Statements generate themselves',
    line: 'Financial Position, Activities, Cash Flows, Net Assets — produced and tied out in about a minute.',
  },
  {
    key: 'penny',
    Icon: Sparkles,
    title: 'Penny drafts the story',
    line: 'The numbers get a narrative: what changed, what needs a decision, what the committee will ask.',
  },
  {
    key: 'export',
    Icon: FileBarChart2,
    title: 'Export the packet',
    line: 'One click — an NBOA-style finance-committee packet, ready to attach to the board email.',
  },
]

// Per-slide animated visual (mounted fresh on each slide swap).
function SlideVisual({ slideKey, reduce }) {
  if (slideKey === 'sync') {
    return (
      <div className="flex h-full items-center justify-center gap-6">
        <div className="rounded-xl border border-navy/10 bg-white px-4 py-3 text-center shadow-sm">
          <span className="block font-mono text-[11px] text-navy/60">June-TB.xlsx</span>
          <span className="text-[10px] text-emerald-700">412 rows ✓</span>
        </div>
        <div className="bw-pulse relative flex h-14 w-14 items-center justify-center rounded-full">
          <RefreshCw size={22} className="text-[#2563EB]" />
        </div>
        <div className="rounded-xl border border-navy/10 bg-white px-4 py-3 text-center shadow-sm">
          <span className="block font-mono text-[11px] text-navy/60">QuickBooks</span>
          <span className="text-[10px] text-emerald-700">connected</span>
        </div>
      </div>
    )
  }
  if (slideKey === 'statements') {
    return (
      <div className="grid h-full content-center grid-cols-2 gap-3 px-6">
        {['Financial Position', 'Activities', 'Cash Flows', 'Net Assets'].map((t, i) => (
          <motion.div
            key={t}
            initial={reduce ? false : { opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: reduce ? 0 : 0.15 + i * 0.12, type: 'spring', stiffness: 260, damping: 18 }}
            className="rounded-xl border border-navy/10 bg-white px-3 py-3 text-center shadow-sm"
          >
            <span className="mx-auto mb-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-[#2563EB]/10 text-[#2563EB]"><Check size={13} /></span>
            <span className="block text-[11.5px] font-semibold text-navy">{t}</span>
          </motion.div>
        ))}
      </div>
    )
  }
  if (slideKey === 'penny') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8">
        <PennyAvatar size={52} />
        {[
          'Cash days recovered to 43 — June tuition landed.',
          'Program spend 2.1% under budget YTD.',
          'One decision: the boiler contract renews Friday.',
        ].map((t, i) => (
          <motion.div
            key={t}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.3 + i * 0.3 }}
            className="w-full rounded-lg border border-navy/10 bg-white px-3 py-2 text-[12px] text-navy/80 shadow-sm"
          >
            {t}
          </motion.div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex h-full items-center justify-center">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16, rotate: -2 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        className="w-52 rounded-lg border border-navy/15 bg-white p-4 shadow-[0_18px_40px_-18px_rgba(16,28,61,0.45)]"
      >
        <div className="rounded-md bg-navy-gradient px-3 py-3 text-center">
          <span className="block font-serif text-[13px] font-semibold text-white">St. Brigid’s School</span>
          <span className="block text-[9px] uppercase tracking-[0.14em] text-penny-light">Finance Committee Packet</span>
        </div>
        <div className="mt-2.5 space-y-1.5">
          <div className="h-1.5 w-3/4 rounded bg-navy/10" />
          <div className="h-1.5 w-full rounded bg-navy/10" />
          <div className="h-1.5 w-5/6 rounded bg-navy/10" />
        </div>
        <motion.div
          initial={reduce ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: reduce ? 0 : 0.55, type: 'spring', stiffness: 300, damping: 15 }}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-emerald-600/10 py-1.5 text-[11px] font-bold text-emerald-700"
        >
          <Check size={12} /> Exported · June 2026
        </motion.div>
      </motion.div>
    </div>
  )
}

// ── The packet COVERFLOW: three pages in real 3-D perspective. The front page
// sits flat center-stage; the other two angle back at the sides. The deck
// auto-rotates (and the side pages / labels are clickable), so it reads as
// "flip through the packet" rather than scattered cards. Entrance: pages rise
// from below and settle into the perspective arrangement, staggered. ──────────

// Pose per slot: 0 = front-center, 1 = right-back, 2 = left-back.
const PACKET_POSES = [
  { x: 0, y: -10, rotateY: 0, scale: 1.05, opacity: 1, zIndex: 30, filter: 'blur(0px)' },
  { x: 240, y: 16, rotateY: -38, scale: 0.85, opacity: 0.75, zIndex: 10, filter: 'blur(0.5px)' },
  { x: -240, y: 16, rotateY: 38, scale: 0.85, opacity: 0.75, zIndex: 10, filter: 'blur(0.5px)' },
]
const PACKET_LABELS = ['Cover', 'KPI dashboard', 'Statements']

// Page bodies (functions of `reduce` so one-shot flourishes stay motion-safe).
const PACKET_PAGES = [
  {
    key: 'cover',
    body: (reduce) => (
      <>
        <div className="relative overflow-hidden rounded-xl bg-navy-gradient px-4 py-6 text-center">
          {!reduce && (
            <motion.span
              aria-hidden="true"
              className="absolute inset-y-[-30%] left-0 w-1/3 -skew-x-12"
              style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.06), rgba(212,180,122,0.35), rgba(255,255,255,0.06), transparent)' }}
              initial={{ x: '-140%' }}
              whileInView={{ x: '420%' }}
              viewport={{ once: true }}
              transition={{ duration: 1.1, delay: 1.1, ease: 'easeInOut' }}
            />
          )}
          <span aria-hidden="true" className="mx-auto block h-px w-24 bg-gradient-to-r from-transparent via-penny-light/70 to-transparent" />
          <span className="mt-3 block font-serif text-[20px] font-semibold leading-tight text-white">St. Brigid&rsquo;s School</span>
          <span className="mt-1.5 block text-[9.5px] font-bold uppercase tracking-[0.2em] text-penny-light">Finance Committee Packet</span>
          <motion.span
            aria-hidden="true"
            className="mx-auto mt-4 flex h-12 w-12 items-center justify-center rounded-full border-2 border-penny-light/60 text-penny-light"
            initial={reduce ? false : { scale: 0, rotate: -30 }}
            whileInView={{ scale: 1, rotate: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.7, type: 'spring', stiffness: 260, damping: 14 }}
          >
            <Check size={20} />
          </motion.span>
          <span className="mt-3 block text-[10.5px] text-white/65">June 2026 · FY26 close</span>
          <span aria-hidden="true" className="mx-auto mt-3 block h-px w-24 bg-gradient-to-r from-transparent via-penny-light/70 to-transparent" />
        </div>
        <span className="mt-3 block text-center text-[9.5px] font-bold uppercase tracking-[0.16em] text-navy/45">Prepared with KYRO</span>
      </>
    ),
  },
  {
    key: 'dash',
    body: (reduce) => (
      <>
        <span className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-navy/50">Dashboard · June 2026</span>
        <div className="mt-2.5 grid grid-cols-2 gap-2" aria-hidden="true">
          {[['Op margin', '4.0%'], ['Days cash', '43'], ['Reserve', '7.7 mo'], ['Net tuition', '$9,647']].map(([l, v]) => (
            <div key={l} className="rounded-lg bg-[#eef3fc] px-2.5 py-2">
              <span className="block text-[9px] uppercase tracking-[0.1em] text-navy/45">{l}</span>
              <span className="font-serif text-[16px] font-semibold text-navy">{v}</span>
            </div>
          ))}
        </div>
        <svg className="mt-2.5 w-full" height="38" viewBox="0 0 220 38" preserveAspectRatio="none" aria-hidden="true">
          <motion.path
            d="M4 32 L40 27 L76 29 L112 18 L148 21 L184 10 L216 5"
            fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.1, delay: 0.8, ease: 'easeOut' }}
          />
        </svg>
      </>
    ),
  },
  {
    key: 'stmt',
    body: () => (
      <>
        <span className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-navy/50">Statement of Activities</span>
        <div className="mt-2.5 space-y-[6px] text-[11px] text-navy/75" aria-hidden="true">
          {[['Tuition & fees, net', '10,850,000'], ['Contributions', '1,240,000'], ['Total revenue', '12,700,000'], ['Total expenses', '11,620,000']].map(([l, v], k) => (
            <div key={l} className={`flex justify-between gap-2 ${k >= 2 ? 'border-t border-navy/15 pt-[4px] font-semibold text-navy' : ''}`}>
              <span>{l}</span>
              <span className="tabular-nums">{v}</span>
            </div>
          ))}
          <div className="flex justify-between gap-2 border-t-2 border-navy/50 pt-1.5 text-[11.5px] font-bold text-navy">
            <span>Change in net assets</span>
            <span className="tabular-nums">1,080,000</span>
          </div>
        </div>
      </>
    ),
  },
]

export default function BoardReadyShow() {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)

  // Packet coverflow: which page is front-center; auto-rotates once on screen.
  const stageRef = useRef(null)
  const entered = useInView(stageRef, { once: true, margin: '-120px' })
  const entranceDone = useRef(false)
  const [front, setFront] = useState(0)
  useEffect(() => {
    if (!entered || reduce) return undefined
    const settle = setTimeout(() => { entranceDone.current = true }, 1200)
    const t = setInterval(() => setFront((v) => (v + 1) % 3), 3900)
    return () => { clearTimeout(settle); clearInterval(t) }
  }, [entered, reduce])

  useEffect(() => {
    if (reduce) return undefined
    const t = setInterval(() => setI((v) => (v + 1) % SLIDES.length), 4600)
    return () => clearInterval(t)
  }, [reduce])

  const s = SLIDES[i]

  return (
    <section aria-labelledby="board-h2" className="bg-transparent py-24">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <div className="text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">
            The board packet
          </p>
          <h2 id="board-h2" className="mt-3 font-serif text-[32px] font-semibold leading-tight text-navy sm:text-[42px]">
            Board-ready, start to finish.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-muted">
            The whole path from a bookkeeper&rsquo;s export to the packet in your committee&rsquo;s
            inbox — four steps, one afternoon.
          </p>
        </div>

        {/* ── The slideshow ── */}
        <div className="mt-12 overflow-hidden rounded-2xl border border-navy/10 bg-white/75 shadow-[0_24px_60px_-24px_rgba(16,28,61,0.35)] backdrop-blur-sm">
          <div className="grid min-h-[300px] lg:grid-cols-2">
            {/* text side */}
            <div className="flex flex-col justify-center gap-3 px-7 py-8 sm:px-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={s.key}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
                  transition={{ duration: 0.35 }}
                >
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-navy/45">
                    Step {i + 1} of {SLIDES.length}
                  </span>
                  <h3 className="mt-2 flex items-center gap-2.5 font-serif text-[24px] font-semibold text-navy">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2563EB]/10 text-[#2563EB]">
                      <s.Icon size={18} />
                    </span>
                    {s.title}
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted">{s.line}</p>
                </motion.div>
              </AnimatePresence>

              {/* controls */}
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Previous step"
                  onClick={() => setI((v) => (v - 1 + SLIDES.length) % SLIDES.length)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-navy/15 text-navy/60 transition-colors hover:border-navy/40 hover:text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
                >
                  <ChevronLeft size={15} />
                </button>
                <div className="flex gap-1.5">
                  {SLIDES.map((sl, j) => (
                    <button
                      key={sl.key}
                      type="button"
                      aria-label={`Step ${j + 1}: ${sl.title}`}
                      onClick={() => setI(j)}
                      className={`h-2 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 ${
                        j === i ? 'w-7 bg-[#2563EB]' : 'w-2 bg-navy/20 hover:bg-navy/35'
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  aria-label="Next step"
                  onClick={() => setI((v) => (v + 1) % SLIDES.length)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-navy/15 text-navy/60 transition-colors hover:border-navy/40 hover:text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            {/* visual side */}
            <div className="relative min-h-[240px] border-t border-navy/10 bg-gradient-to-br from-[#eef3fc] to-[#dde7f8] lg:border-l lg:border-t-0">
              <AnimatePresence mode="wait">
                <motion.div
                  key={s.key}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 p-4"
                >
                  <SlideVisual slideKey={s.key} reduce={reduce} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* ── The final demo: the packet COVERFLOW — front page center-stage,
            the others angled back in perspective; auto-rotates, labels/side
            pages clickable, staggered rise-and-settle entrance. ── */}
        <div className="mt-16 text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-navy/50">
            The result — a committee packet your board can read in ten minutes
          </p>
        </div>
        <div
          ref={stageRef}
          className="relative mx-auto mt-4 h-[340px] w-full max-w-3xl scale-[0.62] sm:h-[440px] sm:scale-100"
          style={{ perspective: 1200 }}
        >
          {/* Glow aura + floor shadow grounding the deck. */}
          <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2563EB]/15 blur-3xl sm:h-[420px] sm:w-[560px]" />
          <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[36%] h-40 w-40 -translate-x-1/2 rounded-full bg-gold/20 blur-3xl" />
          <span aria-hidden="true" className="pointer-events-none absolute bottom-3 left-1/2 h-6 w-80 -translate-x-1/2 rounded-full bg-navy/15 blur-xl" />

          {PACKET_PAGES.map((page, p) => {
            const slot = (p - front + 3) % 3
            const pose = PACKET_POSES[slot]
            return (
              <motion.div
                key={page.key}
                role={slot === 0 ? undefined : 'button'}
                aria-label={slot === 0 ? undefined : `Show the ${PACKET_LABELS[p]} page`}
                onClick={() => setFront(p)}
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: 0, y: 130, scale: 0.7, rotateY: 0 }}
                animate={entered ? (reduce ? { opacity: 1, ...{ x: PACKET_POSES[slot].x, y: 0, rotateY: 0, scale: 0.9, zIndex: pose.zIndex } } : pose) : undefined}
                transition={{ type: 'spring', stiffness: 200, damping: 23, delay: entranceDone.current ? 0 : p * 0.14 }}
                whileHover={reduce || slot === 0 ? undefined : { scale: 0.92, opacity: 0.95 }}
                className={`absolute left-1/2 top-1/2 -ml-[140px] -mt-[165px] ${slot === 0 ? '' : 'cursor-pointer'}`}
                style={{ transformStyle: 'preserve-3d' }}
              >
                <div className="w-[280px] rounded-2xl border border-navy/10 bg-white p-4 shadow-[0_34px_80px_-28px_rgba(16,28,61,0.55)]">
                  {page.body(reduce)}
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Page labels — the deck's navigation. */}
        <div className="mt-2 flex items-center justify-center gap-2 sm:mt-6">
          {PACKET_LABELS.map((l, p) => (
            <button
              key={l}
              type="button"
              onClick={() => setFront(p)}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 ${
                front === p
                  ? 'bg-navy text-white shadow-[0_8px_20px_-8px_rgba(16,28,61,0.6)]'
                  : 'border border-navy/15 bg-white/70 text-navy/60 hover:border-navy/35 hover:text-navy'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// OrbitScrolly — THE landing set-piece: a pinned, scroll-scrubbed 3-D orbital
// system with Penny at the center and the eight domains as planets.
//
// Choreography over the 560vh track (progress 0→1):
//   0.00–0.10  FORMATION — planets erupt from the core (overshoot) onto a
//              tilted ellipse; rings + giant type fade in.
//   0.10–0.90  EIGHT STOPS — the system rotates 315°; each domain docks at the
//              FRONT (bottom, scaled up, hue-lit), fires a core flare + shock-
//              wave, connects a packet-flow beam into Penny, and deals in its
//              live payload card (counting stat + self-drawing sparkline).
//   0.90–1.00  COLLAPSE — the system spirals into the core, which re-emerges as
//              the briefing pill: "Good morning — 3 things need a decision."
//
// Implementation notes: ONE useMotionValueEvent handler does the trig and
// writes planet/beam/core styles imperatively via refs (zero re-renders while
// scrubbing — the IngestScrolly discipline); React state changes ONLY on dock
// (active index), driving the payload card, nebula, type and shockwave.
// Reduced motion: a static settled frame (no pin theatrics).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import {
  motion,
  AnimatePresence,
  animate,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
} from 'framer-motion'
import {
  CircleDollarSign,
  GraduationCap,
  Landmark,
  BadgeCheck,
  Wrench,
  HeartHandshake,
  Target,
  Users,
} from 'lucide-react'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import '../../styles/landing-orbit.css'

// The eight domains — hue, proof line, and the payload stat. Real platform
// truths (statements from a TB; SIS name-matching; self-measuring plans…).
const DOMAINS = [
  { key: 'finance', label: 'Finance', hue: '#2563EB', Icon: CircleDollarSign, line: 'Trial balance in — four board-ready statements out.', stat: 4, unit: 'statements' },
  { key: 'enrollment', label: 'Enrollment', hue: '#0891b2', Icon: GraduationCap, line: 'SIS rosters reconcile by name; projections flow into tuition and cash.', stat: 412, unit: 'students synced' },
  { key: 'governance', label: 'Governance', hue: '#7c3aed', Icon: Landmark, line: 'Policies, meetings, minutes — reviewed on schedule, never lost.', stat: 36, unit: 'policies tracked' },
  { key: 'accreditation', label: 'Accreditation', hue: '#d97706', Icon: BadgeCheck, line: 'Standards and evidence tracked; gaps surface in the briefing.', stat: 87, unit: '% evidence ready' },
  { key: 'facilities', label: 'Facilities', hue: '#ea580c', Icon: Wrench, line: 'Maintenance with real costs — variance you can defend.', stat: 23, unit: 'work orders' },
  { key: 'advancement', label: 'Advancement', hue: '#e11d48', Icon: HeartHandshake, line: 'Campaigns, gifts, pledges — pacing vs goal at a glance.', stat: 72, unit: '% to goal' },
  { key: 'strategy', label: 'Strategy', hue: '#8b5cf6', Icon: Target, line: 'A strategic plan that measures itself against the live numbers.', stat: 9, unit: 'goals on pace' },
  { key: 'hr', label: 'HR', hue: '#059669', Icon: Users, line: 'Staffing feeds student-teacher ratio straight into analytics.', stat: 14, unit: 'students per teacher' },
]

// Starfield — positions computed ONCE at module load (stable across renders).
const STARS = Array.from({ length: 90 }, () => ({
  left: Math.random() * 100,
  top: Math.random() * 100,
  size: Math.random() * 2 + 1,
  gold: Math.random() > 0.8,
  dur: 2.2 + Math.random() * 3,
  delay: Math.random() * 4,
}))

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1)
const backOut = (t) => { const c = 1.70158; return 1 + (--t) * t * ((c + 1) * t + c) }
const smooth = (t) => t * t * (3 - 2 * t)

// Payload stat that counts up on every dock.
function CountStat({ target }) {
  const ref = useRef(null)
  useEffect(() => {
    const controls = animate(0, target, {
      duration: 0.65,
      ease: 'easeOut',
      onUpdate: (v) => { if (ref.current) ref.current.textContent = Math.round(v) },
    })
    return () => controls.stop()
  }, [target])
  return <span ref={ref}>0</span>
}

export default function OrbitScrolly() {
  const reduce = useReducedMotion()
  const trackRef = useRef(null)
  const sysRef = useRef(null)
  const planetRefs = useRef([])
  const beamRef = useRef(null)
  const beamFlowRef = useRef(null)
  const coreRef = useRef(null)
  const ringRefs = useRef([])
  const typeRef = useRef(null)
  const payWrapRef = useRef(null)
  const finaleRef = useRef(null)

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] })
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.35 })

  const [active, setActive] = useState(0)
  const [shockKey, setShockKey] = useState(0)
  const activeRef = useRef(0)

  useMotionValueEvent(p, 'change', (v) => {
    const sys = sysRef.current
    if (!sys) return
    const form = backOut(seg(v, 0, 0.1))
    const collapse = smooth(seg(v, 0.9, 1))
    const mp = seg(v, 0.1, 0.9)
    const spin = mp * 315
    const W = sys.clientWidth
    const RX = W * 0.5 - 34
    const RY = RX * 0.46
    const rf = Math.max(form * (1 - collapse), 0.001)
    let frontX = 0
    let frontY = 0

    DOMAINS.forEach((_, i) => {
      const el = planetRefs.current[i]
      if (!el) return
      const a = ((i * 45 - spin + 90) * Math.PI) / 180
      const x = Math.cos(a) * RX * rf
      const y = Math.sin(a) * RY * rf
      const depth = (Math.sin(a) + 1) / 2 // 1 = front (bottom of ellipse)
      const sc = (0.62 + 0.55 * depth) * (form < 1 ? 0.5 + 0.5 * form : 1) * (1 - collapse * 0.7)
      el.style.transform = `translate(${x}px, ${y}px) scale(${sc})`
      el.style.zIndex = String(30 + Math.round(depth * 40))
      el.style.opacity = String((0.45 + 0.55 * depth) * (1 - collapse))
      el.style.filter = depth < 0.35 ? 'blur(1.2px)' : 'none'
      if (i === activeRef.current) { frontX = x; frontY = y }
    })

    // Beam: core → docked planet, visible only mid-stop (retracts in transit).
    const stopP = (mp * 7) % 1
    const midStop = (stopP > 0.18 && stopP < 0.82) || mp === 0 || mp === 1
    const show = mp > 0 && collapse === 0 && form >= 1 && midStop
    const cx = W / 2
    const cy = sys.clientHeight / 2
    ;[beamRef.current, beamFlowRef.current].forEach((l) => {
      if (!l) return
      l.setAttribute('x1', cx)
      l.setAttribute('y1', cy)
      l.setAttribute('x2', cx + frontX)
      l.setAttribute('y2', cy + frontY)
      l.style.opacity = show ? 1 : 0
    })

    // Dock: active index change → React state (payload/nebula/type/shockwave).
    const idx = clamp(Math.round(mp * 7), 0, 7)
    if (mp > 0 && idx !== activeRef.current) {
      activeRef.current = idx
      setActive(idx)
      setShockKey((k) => k + 1)
    }

    // Rings, giant type, core scale, payload + finale opacity.
    ringRefs.current.forEach((r) => { if (r) r.style.opacity = String(form * (1 - collapse)) })
    if (typeRef.current) typeRef.current.style.opacity = String(0.9 * form * (1 - collapse))
    if (coreRef.current) {
      coreRef.current.style.transform = `scale(${1 + 0.5 * collapse})`
      coreRef.current.style.opacity = String(1 - seg(v, 0.94, 1))
    }
    if (payWrapRef.current) payWrapRef.current.style.opacity = String(form * (1 - seg(v, 0.88, 0.94)))
    if (finaleRef.current) {
      const f = seg(v, 0.94, 1)
      finaleRef.current.style.opacity = String(f)
      finaleRef.current.style.transform = `translate(-50%, -50%) scale(${0.6 + 0.4 * backOut(f)})`
    }
  })

  const d = DOMAINS[active]

  // ── Reduced motion: one static, settled composition — no pin, no scrub. ────
  if (reduce) {
    return (
      <section aria-labelledby="orbit-h2" className="relative overflow-hidden bg-[#070d1d] py-24">
        <div className="mx-auto max-w-4xl px-5 text-center sm:px-8">
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-penny-light">One AI · Eight domains</p>
          <h2 id="orbit-h2" className="mt-3 font-serif text-[32px] font-semibold leading-tight text-white sm:text-[42px]">
            Everything orbits Penny.
          </h2>
          <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-3">
            <PennyAvatar size={72} />
            {DOMAINS.map(({ key, label, hue, Icon }) => (
              <span key={key} className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-[13px] font-semibold text-white/85">
                <Icon size={14} style={{ color: hue }} /> {label}
              </span>
            ))}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="orbit-h2" className="relative bg-[#070d1d]">
      {/* Intro header — scrolls away before the pin engages. */}
      <div className="mx-auto max-w-4xl px-5 pb-10 pt-24 text-center sm:px-8">
        <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-penny-light">One AI · Eight domains</p>
        <h2 id="orbit-h2" className="mt-3 font-serif text-[34px] font-semibold leading-tight text-white sm:text-[46px]">
          Everything orbits Penny.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-white/70">
          Eight domains, one AI at the center. Scroll — every one of them docks, hands its
          numbers to Penny, and lands in a single morning briefing.
        </p>
      </div>

      <div ref={trackRef} className="relative h-[560vh]">
        <div
          className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden transition-[background] duration-1000"
          style={{ background: `radial-gradient(760px 540px at 50% 34%, ${d.hue}40, transparent 65%), #070d1d` }}
        >
          {/* Starfield (CSS twinkle; positions frozen at module load). */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-0">
            {STARS.map((s, i) => (
              <span
                key={i}
                className="orbit-star absolute rounded-full"
                style={{
                  left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size,
                  background: s.gold ? '#e8d4a8' : '#fff', opacity: 0.2,
                  '--tw-dur': `${s.dur}s`, '--tw-delay': `${s.delay}s`,
                }}
              />
            ))}
          </span>

          {/* Giant kinetic type behind the system. */}
          <AnimatePresence mode="popLayout">
            <motion.div
              key={d.key}
              ref={typeRef}
              aria-hidden="true"
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 0.9 }}
              exit={{ x: -60, opacity: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-none absolute left-1/2 top-[42%] z-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-serif font-bold"
              style={{ fontSize: 'clamp(90px, 16vw, 220px)', color: 'transparent', WebkitTextStroke: '1.5px rgba(255,255,255,0.10)' }}
            >
              {d.label}
            </motion.div>
          </AnimatePresence>

          {/* The system: rings + beam + core + planets. */}
          <div ref={sysRef} aria-hidden="true" className="relative z-[2] w-[min(560px,92vw)] flex-none" style={{ aspectRatio: '1 / 0.78' }}>
            {[{ w: '124%', h: '57%', o: 'border-white/5' }, { w: '100%', h: '46%', o: 'border-penny/25' }, { w: '74%', h: '33%', o: 'border-dashed border-white/10' }].map((r, i) => (
              <span
                key={i}
                ref={(el) => (ringRefs.current[i] = el)}
                className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border ${r.o}`}
                style={{ width: r.w, height: r.h }}
              />
            ))}
            <svg className="pointer-events-none absolute inset-0 z-[40] h-full w-full overflow-visible">
              <line ref={beamRef} strokeWidth="3" strokeLinecap="round" style={{ stroke: d.hue, filter: `drop-shadow(0 0 8px ${d.hue})`, transition: 'opacity .3s' }} />
              <line ref={beamFlowRef} className="orbit-beam-flow" stroke="#fff" strokeWidth="3" strokeLinecap="round" style={{ transition: 'opacity .3s' }} />
            </svg>

            {/* Core: Penny + hue flare + dock shockwave. */}
            <div className="absolute left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2">
              <div
                ref={coreRef}
                className="relative rounded-full transition-shadow duration-700 will-change-transform"
                style={{ boxShadow: `0 0 70px ${d.hue}, 0 0 130px ${d.hue}66` }}
              >
                <PennyAvatar size={96} />
                <span
                  key={shockKey}
                  className="orbit-shock pointer-events-none absolute inset-0 rounded-full border-2"
                  style={{ borderColor: d.hue }}
                />
              </div>
            </div>

            {/* Planets. */}
            {DOMAINS.map(({ key, label, hue, Icon }, i) => {
              const on = i === active
              return (
                <div
                  key={key}
                  ref={(el) => (planetRefs.current[i] = el)}
                  className="absolute left-1/2 top-1/2 -m-10 w-20 text-center will-change-transform"
                >
                  <span
                    className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-[1.5px] backdrop-blur-sm transition-all duration-500"
                    style={
                      on
                        ? { background: hue, borderColor: '#fff', color: '#fff', boxShadow: `0 0 40px ${hue}, 0 0 90px ${hue}88` }
                        : { background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.85)' }
                    }
                  >
                    <Icon size={24} />
                  </span>
                  <span
                    className={`mt-1.5 block whitespace-nowrap font-mono text-[10.5px] tracking-[0.06em] transition-colors duration-500 ${on ? 'font-bold text-white' : 'text-white/60'}`}
                  >
                    {label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Live payload card — deals in on every dock. */}
          <div ref={payWrapRef} className="relative z-[3] mt-3 w-[min(500px,90vw)]">
            <motion.div
              key={d.key}
              initial={{ y: 16, rotate: -1.2, opacity: 0.2 }}
              animate={{ y: 0, rotate: 0, opacity: 1 }}
              transition={{ duration: 0.42, ease: [0.2, 0.9, 0.2, 1] }}
              className="grid grid-cols-[1fr_auto] items-center gap-x-5 gap-y-1 rounded-2xl border border-white/15 bg-[#0a1022]/75 px-6 py-4 backdrop-blur-md"
            >
              <b className="font-serif text-[24px] font-semibold text-white">{d.label}</b>
              <div className="col-start-2 row-span-2 text-right">
                <b className="font-serif text-[36px] tabular-nums text-penny-pale"><CountStat target={d.stat} /></b>
                <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-white/50">{d.unit}</span>
              </div>
              <p className="col-start-1 text-[13.5px] leading-snug text-white/70">{d.line}</p>
              <svg className="col-span-2 mt-2 w-full" height="30" viewBox="0 0 440 30" preserveAspectRatio="none" aria-hidden="true">
                <motion.path
                  key={d.key}
                  d="M4 25 L60 21 L116 23 L172 14 L228 17 L284 9 L340 12 L436 4"
                  fill="none" stroke="#d4b47a" strokeWidth="2.4" strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                />
              </svg>
            </motion.div>
          </div>

          {/* Collapse finale: the system becomes tomorrow's briefing. */}
          <div
            ref={finaleRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[42%] z-[70] w-max max-w-[88vw] rounded-full border-[1.5px] border-penny bg-navy-gradient px-8 py-4 text-center opacity-0"
            style={{ boxShadow: '0 0 80px rgba(212,180,122,0.4)' }}
          >
            <b className="whitespace-nowrap font-serif text-[clamp(16px,2.6vw,24px)] font-semibold text-white">
              Good morning — 3 things need a decision.
            </b>
            <span className="mt-0.5 block font-mono text-[10.5px] uppercase tracking-[0.18em] text-penny">
              Every orbit lands in one briefing · 7:02 AM
            </span>
          </div>

          <div className="absolute bottom-5 left-1/2 z-[9] -translate-x-1/2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/45">
            scroll — formation · 8 stops · collapse
          </div>
        </div>
      </div>
    </section>
  )
}

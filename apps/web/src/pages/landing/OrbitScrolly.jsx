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
  useInView,
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
  Sparkles,
  Play,
  Clock,
} from 'lucide-react'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import AuroraFlow from '../../components/home/AuroraFlow.jsx'
import '../../styles/landing-orbit.css'

// The eight domains — hue, proof line, the payload stat, and a PHOTOGRAPH.
// Real platform truths (statements from a TB; SIS name-matching…).
//
// The photos live in /public/landing/orbit-*.jpg (Unsplash — free commercial
// license, no attribution required) and each was chosen for the domain it rides
// with, not for generic office ambience: a classroom full of students for
// Enrollment, an empty board table for Governance, thrown graduation caps for
// Accreditation, the campus building itself for Facilities, cupped hands giving
// for Advancement, a sticky-note planning wall for Strategy, a staff training
// session for HR, and two people working the numbers for Finance. The card
// re-mounts per dock, so the photo swaps with the same deal-in the rest of the
// payload gets.
// Each domain also carries its EXPLANATION (three concrete, platform-true
// points — what the module actually does, no adjectives doing the work) and a
// SAMPLE BRIEFING ITEM (severity + sentence, styled like the real app's
// attention rail) for the flanking panels beside the orbit.
const DOMAINS = [
  { key: 'finance', label: 'Finance', hue: '#2563EB', Icon: CircleDollarSign, line: 'Trial balance in — four board-ready statements out.', stat: 4, unit: 'statements', img: '/landing/orbit-finance.jpg', imgAlt: 'Two people working through financial statements together' , points: ['Upload a trial balance or connect QuickBooks \u2014 four board-ready statements build themselves.', 'Analytics, budget vs actual and the board packet read from the same numbers.', 'A cash forecast dates the summer trough before it arrives.'], brief: { sev: 'critical', text: 'Days cash on hand fell below 60 \u2014 first shortfall projected July 18.' } },
  { key: 'enrollment', label: 'Enrollment', hue: '#0891b2', Icon: GraduationCap, line: 'SIS rosters reconcile by name; projections flow into tuition and cash.', stat: 412, unit: 'students synced', img: '/landing/orbit-enrollment.jpg', imgAlt: 'A classroom full of students' , points: ['SIS rosters sync and reconcile by name \u2014 FACTS, Blackbaud, OneRoster.', 'Enrollment flows into tuition, aid and cash projections automatically.', 'Demographics and retention read from the same roster.'], brief: { sev: 'watch', text: 'Enrollment is 12 under plan \u2014 projected tuition impact \u2212$146K.' } },
  { key: 'governance', label: 'Governance', hue: '#7c3aed', Icon: Landmark, line: 'Policies, meetings, minutes — reviewed on schedule, never lost.', stat: 36, unit: 'policies tracked', img: '/landing/orbit-governance.jpg', imgAlt: 'An empty boardroom table before a meeting' , points: ['Policies with owners and review dates that actually come due.', 'Meetings, minutes and committees in one register.', 'Review lapses surface in the briefing before an auditor finds them.'], brief: { sev: 'watch', text: '4 policies are past their scheduled review \u2014 the oldest by 210 days.' } },
  { key: 'accreditation', label: 'Accreditation', hue: '#d97706', Icon: BadgeCheck, line: 'Standards and evidence tracked; gaps surface in the briefing.', stat: 87, unit: '% evidence ready', img: '/landing/orbit-accreditation.jpg', imgAlt: 'Graduates throwing their caps' , points: ['Adopt your accreditor\u2019s framework \u2014 Cognia, FCIS, ACSI, WASC, SAIS.', 'Score standards on the rubric; attach evidence where it lives.', 'A mock visit shows what a visiting team would find today.'], brief: { sev: 'critical', text: 'An assurance gate is unmet \u2014 one attached artifact settles it.' } },
  { key: 'facilities', label: 'Facilities', hue: '#ea580c', Icon: Wrench, line: 'Maintenance with real costs — variance you can defend.', stat: 23, unit: 'work orders', img: '/landing/orbit-facilities.jpg', imgAlt: 'A school campus building and grounds' , points: ['Work orders with real costs, not estimates that never close.', 'Recurring maintenance on a calendar, with inspection records.', 'Variance against the facilities budget you can defend to a board.'], brief: { sev: 'watch', text: 'Maintenance backlog reached 23 work orders \u2014 $41K over budget.' } },
  { key: 'advancement', label: 'Advancement', hue: '#e11d48', Icon: HeartHandshake, line: 'Campaigns, gifts, pledges — pacing vs goal at a glance.', stat: 72, unit: '% to goal', img: '/landing/orbit-advancement.jpg', imgAlt: 'Cupped hands holding a donation' , points: ['Campaigns, gifts and pledges in one register.', 'Pledge pacing versus goal, visible at a glance.', 'Giving flows into the finance picture automatically.'], brief: { sev: 'info', text: 'Annual fund reached 72% of goal \u2014 $84K ahead of last year\u2019s pace.' } },
  { key: 'strategy', label: 'Strategy', hue: '#8b5cf6', Icon: Target, line: 'A strategic plan that measures itself against the live numbers.', stat: 9, unit: 'goals on pace', img: '/landing/orbit-strategy.jpg', imgAlt: 'A team planning with sticky notes on a wall' , points: ['Goals bound to live metrics \u2014 progress computes itself.', 'Direction-aware pacing: ahead or behind, with no manual updates.', 'Strategy-linked tasks land with the people who own them.'], brief: { sev: 'info', text: '9 of 12 goals on pace \u2014 two need attention before the board meets.' } },
  { key: 'hr', label: 'HR', hue: '#059669', Icon: Users, line: 'Staffing feeds student-teacher ratio straight into analytics.', stat: 14, unit: 'students per teacher', img: '/landing/orbit-hr.jpg', imgAlt: 'Staff in a professional development session' , points: ['A staff roster with credentials, clearances and evaluations.', 'Student-teacher ratio feeds analytics straight from staffing.', 'Professional development tracked with dates that come due.'], brief: { sev: 'watch', text: 'Student-teacher ratio hit 27.9:1 \u2014 above the board\u2019s threshold.' } },
]

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1)
const backOut = (t) => { const c = 1.70158; return 1 + (--t) * t * ((c + 1) * t + c) }
const smooth = (t) => t * t * (3 - 2 * t)

// ── Per-domain payload visualizations — each dock deals in its OWN chart type
// (area, bars, gauge, stacked status, thermometer, milestones, pictogram), hue-
// colored and replayed on every dock (the card re-mounts per domain key). ──────
function VizArea({ hue }) {
  const line = 'M4 44 L64 36 L124 40 L184 24 L244 29 L304 14 L364 18 L436 6'
  return (
    <svg className="h-14 w-full" viewBox="0 0 440 56" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="orbit-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hue} stopOpacity="0.45" />
          <stop offset="100%" stopColor={hue} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={`${line} L436 54 L4 54 Z`}
        fill="url(#orbit-area)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      />
      <motion.path
        d={line} fill="none" stroke={hue} strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }}
      />
      <motion.circle
        cx="436" cy="6" r="4" fill="#fff"
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.85, type: 'spring', stiffness: 300, damping: 16 }}
        style={{ filter: `drop-shadow(0 0 7px ${hue})` }}
      />
    </svg>
  )
}

function VizBars({ hue }) {
  const H = [18, 24, 21, 30, 27, 36, 33, 46]
  return (
    <svg className="h-14 w-full" viewBox="0 0 440 56" preserveAspectRatio="none" aria-hidden="true">
      {H.map((h, i) => (
        <motion.rect
          key={i}
          x={10 + i * 55} width="34" rx="4"
          fill={i === H.length - 1 ? hue : `${hue}55`}
          initial={{ height: 0, y: 54 }}
          animate={{ height: h, y: 54 - h }}
          transition={{ delay: 0.15 + i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          style={i === H.length - 1 ? { filter: `drop-shadow(0 0 8px ${hue})` } : undefined}
        />
      ))}
    </svg>
  )
}

function VizStacked({ hue }) {
  const SEGS = [
    { label: 'Reviewed', w: 62, o: 1 },
    { label: 'Current', w: 26, o: 0.55 },
    { label: 'Due', w: 12, o: 0.25 },
  ]
  return (
    <div aria-hidden="true" className="w-full">
      <div className="flex h-4 w-full gap-1 overflow-hidden rounded-full">
        {SEGS.map((s, i) => (
          <motion.span
            key={s.label}
            className="h-full rounded-full"
            style={{ background: hue, opacity: s.o }}
            initial={{ width: 0 }}
            animate={{ width: `${s.w}%` }}
            transition={{ delay: 0.25 + i * 0.16, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>
      <div className="mt-2 flex gap-4">
        {SEGS.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-navy/55">
            <i className="h-1.5 w-1.5 rounded-full" style={{ background: hue, opacity: s.o }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function VizGauge({ hue }) {
  // Semicircle fully INSIDE the viewBox (chord at y=80, apex at y=14 — the old
  // 0..64 box clipped the arc's crown) + the 87% tip dot on the arc itself.
  const arc = 'M14 80 A66 66 0 0 1 146 80'
  return (
    <svg className="mx-auto h-20" viewBox="0 0 160 92" aria-hidden="true">
      <path d={arc} fill="none" stroke="rgba(16,28,61,0.12)" strokeWidth="9" strokeLinecap="round" />
      <motion.path
        d={arc} fill="none" stroke={hue} strokeWidth="9" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 0.87 }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        style={{ filter: `drop-shadow(0 0 8px ${hue}aa)` }}
      />
      <motion.circle
        cx="140.5" cy="54" r="4.5" fill="#fff"
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.9, type: 'spring', stiffness: 300, damping: 15 }}
        style={{ filter: `drop-shadow(0 0 6px ${hue})` }}
      />
    </svg>
  )
}

function VizRows({ hue }) {
  const ROWS = [
    { label: 'HVAC', w: 78 },
    { label: 'Roofing', w: 52 },
    { label: 'Grounds', w: 34 },
  ]
  return (
    <div aria-hidden="true" className="w-full space-y-1.5">
      {ROWS.map((r, i) => (
        <div key={r.label} className="flex items-center gap-2.5">
          <span className="w-14 font-mono text-[9.5px] uppercase tracking-[0.08em] text-navy/55">{r.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-navy/10">
            <motion.span
              className="block h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${hue}88, ${hue})` }}
              initial={{ width: 0 }}
              animate={{ width: `${r.w}%` }}
              transition={{ delay: 0.2 + i * 0.14, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function VizThermo({ hue }) {
  return (
    <div aria-hidden="true" className="relative w-full pt-1">
      <div className="h-3.5 w-full overflow-hidden rounded-full bg-navy/10">
        <motion.span
          className="relative block h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${hue}77, ${hue})` }}
          initial={{ width: 0 }}
          animate={{ width: '72%' }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <motion.span
        className="absolute top-0.5 h-4.5 w-4.5 rounded-full border-2 border-white"
        style={{ background: hue, left: 'calc(72% - 9px)', height: 18, width: 18, top: 1, filter: `drop-shadow(0 0 8px ${hue})` }}
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8, type: 'spring', stiffness: 280, damping: 14 }}
      />
      <span className="absolute right-0 top-0 font-mono text-[9.5px] uppercase tracking-[0.1em] text-navy/50" style={{ top: -14 }}>
        goal
      </span>
    </div>
  )
}

function VizMilestones({ hue }) {
  return (
    <div aria-hidden="true" className="relative flex w-full items-center justify-between px-1 py-2">
      <span className="absolute inset-x-2 top-1/2 h-px bg-navy/15" />
      {Array.from({ length: 9 }).map((_, i) => (
        <motion.span
          key={i}
          className="relative h-3 w-3 rotate-45 rounded-[3px]"
          style={{ background: i < 7 ? hue : 'rgba(16,28,61,0.15)', filter: i < 7 ? `drop-shadow(0 0 6px ${hue}aa)` : 'none' }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 320, damping: 17 }}
        />
      ))}
    </div>
  )
}

function VizRatio({ hue }) {
  return (
    <div aria-hidden="true" className="flex w-full items-center justify-center gap-1.5 py-2">
      {Array.from({ length: 14 }).map((_, i) => (
        <motion.span
          key={i}
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: `${hue}cc` }}
          initial={{ scale: 0, y: 6 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ delay: 0.12 + i * 0.05, type: 'spring', stiffness: 320, damping: 16 }}
        />
      ))}
      <span className="mx-1 font-mono text-[13px] font-bold text-navy/60">:</span>
      <motion.span
        className="flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] border-white text-white"
        style={{ background: hue }}
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.85, type: 'spring', stiffness: 280, damping: 14 }}
      >
        <Users size={11} />
      </motion.span>
    </div>
  )
}

const VIZ = {
  finance: VizArea,
  enrollment: VizBars,
  governance: VizStacked,
  accreditation: VizGauge,
  facilities: VizRows,
  advancement: VizThermo,
  strategy: VizMilestones,
  hr: VizRatio,
}

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

  // Warm the eight photos once the section is near — the card mounts each one
  // at dock time, and a photo that pops in a beat after its own card undoes the
  // deal-in. Fire-and-forget; a failed fetch just means the browser loads it on
  // dock like it would have anyway.
  useEffect(() => {
    for (const { img } of DOMAINS) {
      const el = new Image()
      el.src = img
    }
  }, [])
  const trackRef = useRef(null)
  const stageRef = useRef(null)
  const introRef = useRef(null)
  const sysRef = useRef(null)
  const planetRefs = useRef([])
  const beamRef = useRef(null)
  const beamFlowRef = useRef(null)
  const coreRef = useRef(null)
  const typeRef = useRef(null)
  const payWrapRef = useRef(null)
  const photoWrapRef = useRef(null)
  const flankLRef = useRef(null)
  const flankRRef = useRef(null)
  const finaleRef = useRef(null)

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] })
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.35 })

  const [active, setActive] = useState(0)
  const [shockKey, setShockKey] = useState(0)
  const activeRef = useRef(0)

  // Penny's Lottie-style entrance: drop-in with squash-and-stretch the first
  // time the orbit scrolls into view, then periodic blinks while it's on screen.
  const pennyIn = useInView(stageRef, { once: true, amount: 0.55 })
  const blinkOn = useInView(stageRef, { amount: 0.3 })
  const [blink, setBlink] = useState(false)
  useEffect(() => {
    if (!blinkOn || reduce) return undefined
    let t2
    const t = setInterval(() => {
      setBlink(true)
      t2 = setTimeout(() => setBlink(false), 160)
    }, 3400)
    return () => {
      clearInterval(t)
      clearTimeout(t2)
    }
  }, [blinkOn, reduce])

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
      // Gathered near the core (formation start / collapse end) the planets sit
      // BEHIND Penny (z < core's 60) and branch out from her; only once the
      // orbit is formed do front-half passes layer above the coin.
      el.style.zIndex = String(rf < 0.85 ? 10 + Math.round(depth * 20) : 30 + Math.round(depth * 40))
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

    // Giant type, core scale, payload + finale opacity.
    // Giant type is GONE before the finale card arrives (was: faded with
    // `collapse`, which left a ghost "HR" hanging behind the briefing).
    if (typeRef.current) typeRef.current.style.opacity = String(seg(v, 0.1, 0.14) * (1 - seg(v, 0.88, 0.93)))
    if (introRef.current) introRef.current.style.opacity = String(1 - seg(v, 0.05, 0.11))
    if (coreRef.current) {
      coreRef.current.style.transform = `scale(${1 + 0.5 * collapse})`
      coreRef.current.style.opacity = String(1 - seg(v, 0.94, 1))
    }
    if (payWrapRef.current) payWrapRef.current.style.opacity = String(seg(v, 0.1, 0.14) * (1 - seg(v, 0.88, 0.94)))
    // The flanking panels ride the same window as the payload card.
    const flankO = String(seg(v, 0.1, 0.14) * (1 - seg(v, 0.88, 0.94)))
    if (flankLRef.current) flankLRef.current.style.opacity = flankO
    if (flankRRef.current) flankRRef.current.style.opacity = flankO
    // The backdrop photograph rides the FORMATION: it fades in as the planets
    // erupt from behind Penny (the same 0→0.1 window `form` runs on), so the
    // room fills with Finance while the system is assembling — not a beat after
    // it. Stays through the finale (the briefing floats over the last scene).
    if (photoWrapRef.current) photoWrapRef.current.style.opacity = String(seg(v, 0.02, 0.1))
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
      <section aria-labelledby="orbit-h2" className="relative overflow-hidden bg-[#e9f0fb] py-24">
        <div className="mx-auto max-w-4xl px-5 text-center sm:px-8">
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">One AI · Eight domains</p>
          <h2 id="orbit-h2" className="mt-3 font-serif text-[32px] font-semibold leading-tight text-navy sm:text-[42px]">
            Everything orbits Penny.
          </h2>
          <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-3">
            <PennyAvatar size={72} />
            {DOMAINS.map(({ key, label, hue, Icon }) => (
              <span key={key} className="inline-flex items-center gap-2 rounded-full border border-navy/20 px-3 py-1.5 text-[13px] font-semibold text-navy/80">
                <Icon size={14} style={{ color: hue }} /> {label}
              </span>
            ))}
          </div>
        </div>
      </section>
    )
  }

  return (
    // Top padding clears the hero's straddling glass card (its -mb overhang
    // lands on this section). The heading lives INSIDE the pinned stage now —
    // no standalone header block, no dead empty viewport before the scene.
    <section aria-labelledby="orbit-h2" className="relative bg-[#e9f0fb] pt-44 sm:pt-56 lg:pt-64">
      <div ref={trackRef} className="relative h-[560vh]">
        <div
          ref={stageRef}
          className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden"
          style={{ background: 'linear-gradient(168deg, #f4f7fd 0%, #e2ebf9 55%, #d4e1f6 100%)' }}
        >
          {/* ── The module's PHOTOGRAPH, as the whole section's backdrop ──────
              Fills the pinned frame — all the whitespace around the system —
              and crossfades on every dock. Under a heavy light veil, because
              the scene on top is pastel UI with navy type: the photo is meant
              to read as context, not compete as content. The veil is lightest
              at the edges (where there is only whitespace) and densest in the
              middle (where the orbit, giant type and payload card live), and it
              carries the dock's hue radial so the docked-domain glow still
              tints the room. The stage keeps its plain gradient underneath as
              the first-paint fallback while a photo streams in. */}
          {/* STARTS INVISIBLE (opacity 0, handler-written): the very first frame
              belongs to Penny alone — the photograph fades in WITH the planets'
              eruption, so the room fills with Finance as the system assembles. */}
          <div ref={photoWrapRef} aria-hidden="true" className="absolute inset-0 z-0 overflow-hidden" style={{ opacity: 0 }}>
            <AnimatePresence initial={false}>
              <motion.img
                key={d.key}
                src={d.img}
                alt=""
                draggable="false"
                initial={{ opacity: 0, scale: 1.06 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </AnimatePresence>
            <div
              className="absolute inset-0 transition-[background] duration-1000"
              style={{
                // Tuned DOWN once already — the first veil washed the photos to
                // near-invisibility. Centre stays milky enough for navy type and
                // the pastel card; the edges drop to a light haze so the image
                // actually reads as a scene, not a stain.
                background: `radial-gradient(760px 540px at 50% 34%, ${d.hue}30, transparent 65%), radial-gradient(105% 80% at 50% 45%, rgba(240,245,252,0.82) 28%, rgba(236,242,251,0.46) 60%, rgba(233,240,251,0.16) 100%)`,
              }}
            />
          </div>
          {/* The heading, lowered INTO the scene: overlays the stage top during
              Penny's entrance + formation, fades as the first dock lands. */}
          <div
            ref={introRef}
            className="pointer-events-none absolute inset-x-0 top-[7%] z-[80] px-5 text-center"
          >
            <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">One AI · Eight domains</p>
            <h2 id="orbit-h2" className="mt-2.5 font-serif text-[30px] font-semibold leading-tight text-navy sm:text-[42px]">
              Everything orbits Penny.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
              Eight domains, one AI at the center. Scroll — every one of them docks, hands its
              numbers to Penny, and lands in a single morning briefing.
            </p>
          </div>
          {/* Domain watermark behind the system — a refined treatment (was a
              cropped 1px-outline giant, which read cheap): CONTAINED serif type
              with a hue→white gradient FILL clipped to the glyphs, low opacity,
              and a radial mask so it dissolves at the edges instead of hitting
              the viewport crop. Rises softly on each dock. */}
          {/* OUTER wrapper owns visibility (handler-written, STARTS hidden — the
              inner framer entrance animates on mount and would otherwise show
              the type before any scroll event fires). */}
          <div
            ref={typeRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-[30%] z-0"
            style={{ opacity: 0 }}
          >
            <AnimatePresence mode="popLayout">
              <motion.div
                key={d.key}
                initial={{ y: 26, opacity: 0, scale: 0.97 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="mx-auto w-max select-none whitespace-nowrap font-serif font-bold uppercase"
                style={{
                  fontSize: 'clamp(52px, 8.4vw, 128px)',
                  letterSpacing: '0.06em',
                  // Heavier fill than the pre-photo era: bold weight, hue at ~65%
                  // alpha and a navy (not transparent) tail — semibold at 35%
                  // dissolved into the backdrop photograph.
                  backgroundImage: `linear-gradient(180deg, ${d.hue}a6 0%, rgba(16,28,61,0.38) 60%, rgba(16,28,61,0.12) 100%)`,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                  maskImage: 'radial-gradient(72% 90% at 50% 50%, #000 55%, transparent 100%)',
                  WebkitMaskImage: 'radial-gradient(72% 90% at 50% 50%, #000 55%, transparent 100%)',
                }}
              >
                {d.label}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* The system: beam + core + planets (rings retired — the motion
              itself draws the orbit). */}
          <div ref={sysRef} aria-hidden="true" className="relative z-[2] w-[min(560px,92vw)] flex-none" style={{ aspectRatio: '1 / 0.78' }}>
            <svg className="pointer-events-none absolute inset-0 z-[40] h-full w-full overflow-visible">
              {/* opacity 0 initially — a zero-length round-cap line paints a dot
                  at the svg origin before the first handler write. */}
              <line ref={beamRef} strokeWidth="3" strokeLinecap="round" style={{ stroke: d.hue, filter: `drop-shadow(0 0 8px ${d.hue})`, transition: 'opacity .3s', opacity: 0 }} />
              <line ref={beamFlowRef} className="orbit-beam-flow" stroke="#fff" strokeWidth="3" strokeLinecap="round" style={{ transition: 'opacity .3s', opacity: 0 }} />
            </svg>

            {/* Core: Penny (bigger) + hue flare + dock shockwave. The Lottie-style
                drop-in lives on an INNER wrapper so it composes with the outer
                handler-driven collapse transform. */}
            <div className="absolute left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2">
              <div
                ref={coreRef}
                className="relative rounded-full transition-shadow duration-700 will-change-transform"
                style={{ boxShadow: pennyIn ? `0 0 80px ${d.hue}, 0 0 150px ${d.hue}66` : 'none' }}
              >
                <motion.div
                  initial={{ y: -150, opacity: 0 }}
                  animate={
                    pennyIn
                      ? {
                          y: [-150, 0, -18, 0],
                          scaleY: [1, 0.82, 1.06, 1],
                          scaleX: [1, 1.12, 0.97, 1],
                          opacity: 1,
                        }
                      : {}
                  }
                  transition={{ duration: 0.9, times: [0, 0.55, 0.8, 1], ease: ['easeIn', 'easeOut', 'easeIn', 'easeOut'] }}
                  style={{ transformOrigin: '50% 100%' }}
                >
                  <PennyAvatar size={128} blink={blink} />
                </motion.div>
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
                  className="absolute left-1/2 top-1/2 -m-10 w-20 text-center will-change-transform sm:-m-12 sm:w-24"
                  style={{ opacity: 0 }}
                >
                  <span
                    className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-[1.5px] backdrop-blur-sm transition-all duration-500 sm:h-[68px] sm:w-[68px] sm:rounded-[20px]"
                    style={
                      on
                        ? { background: hue, borderColor: '#fff', color: '#fff', boxShadow: `0 0 40px ${hue}, 0 0 90px ${hue}88` }
                        : { background: 'rgba(16,28,61,0.06)', borderColor: 'rgba(16,28,61,0.16)', color: '#16284f' }
                    }
                  >
                    <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
                  </span>
                  <span
                    className={`mt-1.5 block whitespace-nowrap font-mono text-[10.5px] tracking-[0.06em] transition-colors duration-500 ${on ? 'font-bold text-navy' : 'text-navy/60'}`}
                  >
                    {label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* ── The flanking panels: WHAT IT DOES (left) and the module in
              practice as a real briefing item (right). Absolutely placed so the
              orbit's trig layout is untouched; hidden below xl where there is
              no room beside the system. Both re-mount per dock, sliding in from
              their own side, and ride the payload card's opacity ramp. */}
          {/* ANCHORED OFF CENTER, not the viewport: `right-[calc(50%+330px)]`
              pins this panel's inner edge just outside the orbit, so on an
              ultrawide monitor it hugs the system instead of drifting to the
              screen edge — which is exactly what it shipped doing. */}
          <div
            ref={flankLRef}
            className="pointer-events-none absolute right-[calc(50%+330px)] top-1/2 z-[3] hidden w-[300px] -translate-y-1/2 xl:block"
            style={{ opacity: 0 }}
          >
            <AnimatePresence mode="popLayout">
              <motion.div
                key={d.key}
                initial={{ x: -36, opacity: 0, rotate: -2.5, scale: 0.95 }}
                animate={{ x: 0, opacity: 1, rotate: 0, scale: 1 }}
                exit={{ x: -20, opacity: 0, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              >
                {/* Gentle idle float, offset from the right panel's phase so the
                    pair breathes rather than bounces in lockstep. */}
                <motion.div
                  animate={{ y: [0, -7, 0] }}
                  transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="relative overflow-hidden rounded-2xl border px-5 py-4 backdrop-blur-md"
                  style={{
                    borderColor: `${d.hue}33`,
                    background: `linear-gradient(160deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.78) 60%, ${d.hue}14 100%)`,
                    boxShadow: `0 24px 60px -24px rgba(16,28,61,0.35), 0 0 40px -18px ${d.hue}66`,
                  }}
                >
                  <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${d.hue}, transparent)` }} />
                  {/* The beam toward the core — these panels ORBIT the system,
                      they are not stray cards. */}
                  <span aria-hidden="true" className="absolute left-full top-1/2 h-px w-9 -translate-y-1/2" style={{ background: `linear-gradient(90deg, ${d.hue}88, transparent)` }} />
                  <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: d.hue }}>
                    <span aria-hidden="true" className="inline-block h-[7px] w-[7px] rounded-full" style={{ backgroundColor: d.hue, boxShadow: `0 0 8px ${d.hue}` }} />
                    What it does
                  </p>
                  <ul className="mt-2.5 space-y-2.5">
                    {d.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-2.5 text-[13px] leading-snug text-navy/80">
                        <span aria-hidden="true" className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: d.hue }} />
                        {pt}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div
            ref={flankRRef}
            className="pointer-events-none absolute left-[calc(50%+330px)] top-1/2 z-[3] hidden w-[300px] -translate-y-1/2 xl:block"
            style={{ opacity: 0 }}
          >
            <AnimatePresence mode="popLayout">
              <motion.div
                key={d.key}
                initial={{ x: 36, opacity: 0, rotate: 2.5, scale: 0.95 }}
                animate={{ x: 0, opacity: 1, rotate: 0, scale: 1 }}
                exit={{ x: 20, opacity: 0, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              >
                <motion.div
                  animate={{ y: [0, -7, 0] }}
                  transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 1.6 }}
                  className="relative overflow-hidden rounded-2xl border px-5 py-4 backdrop-blur-md"
                  style={{
                    borderColor: `${d.hue}33`,
                    background: `linear-gradient(200deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.78) 60%, ${d.hue}14 100%)`,
                    boxShadow: `0 24px 60px -24px rgba(16,28,61,0.35), 0 0 40px -18px ${d.hue}66`,
                  }}
                >
                  <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${d.hue}, transparent)` }} />
                  <span aria-hidden="true" className="absolute right-full top-1/2 h-px w-9 -translate-y-1/2" style={{ background: `linear-gradient(270deg, ${d.hue}88, transparent)` }} />
                  <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: d.hue }}>
                    <span aria-hidden="true" className="inline-block h-[7px] w-[7px] rounded-full" style={{ backgroundColor: d.hue, boxShadow: `0 0 8px ${d.hue}` }} />
                    In your morning briefing
                  </p>
                {/* One attention item, the way the app actually renders one:
                    severity dot, the sentence, and where it takes you. */}
                <div className="mt-2.5 rounded-xl border border-navy/10 bg-white px-3.5 py-3">
                  <div className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-[5px] h-[8px] w-[8px] shrink-0 rounded-full"
                      style={{ backgroundColor: d.brief.sev === 'critical' ? '#ef4444' : d.brief.sev === 'watch' ? '#f59e0b' : '#3b82f6' }}
                    />
                    <p className="text-[13px] font-medium leading-snug text-navy">{d.brief.text}</p>
                  </div>
                  <p className="mt-2 pl-[18px] font-mono text-[10.5px] uppercase tracking-[0.12em] text-navy/45">
                    {d.brief.sev === 'critical' ? 'Needs a decision' : d.brief.sev === 'watch' ? 'Worth watching' : 'Good news travels too'} · {d.label}
                  </p>
                </div>
                  <p className="mt-2.5 text-[12px] leading-snug text-navy/55">
                    Penny reads this domain every morning and says only what needs saying.
                  </p>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Live payload card — deals in on every dock. */}
          <div ref={payWrapRef} className="relative z-[3] mt-3 w-[min(500px,90vw)]" style={{ opacity: 0 }}>
            <motion.div
              key={d.key}
              initial={{ y: 16, rotate: -1.2, opacity: 0.2 }}
              animate={{ y: 0, rotate: 0, opacity: 1 }}
              transition={{ duration: 0.42, ease: [0.2, 0.9, 0.2, 1] }}
              className="relative grid grid-cols-[1fr_auto] items-center gap-x-5 gap-y-1 overflow-hidden rounded-2xl border border-navy/10 bg-white/80 px-6 py-4 shadow-[0_24px_60px_-24px_rgba(16,28,61,0.35)] backdrop-blur-md"
            >
              {/* Domain-hue hairline across the card's top edge. */}
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${d.hue}, transparent)` }}
              />
              <b className="font-serif text-[24px] font-semibold text-navy">{d.label}</b>
              <div className="col-start-2 row-span-2 text-right">
                <b className="font-serif text-[36px] tabular-nums text-[#8a6a20]"><CountStat target={d.stat} /></b>
                <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-navy/55">{d.unit}</span>
              </div>
              <p className="col-start-1 text-[13.5px] leading-snug text-muted">{d.line}</p>
              {/* Each domain deals in its OWN chart (area/bars/gauge/…), hue-lit. */}
              <div className="col-span-2 mt-3">
                {(() => { const Viz = VIZ[d.key]; return <Viz hue={d.hue} /> })()}
              </div>
            </motion.div>
          </div>

          {/* Collapse finale: the system becomes tomorrow's briefing — styled
              like the in-app briefing hero (aurora ribbons + gradient CTA). */}
          <div
            ref={finaleRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[42%] z-[70] w-[min(560px,90vw)] opacity-0"
          >
            <div
              className="relative overflow-hidden rounded-2xl border border-penny/60 bg-navy-gradient px-7 py-7 text-center sm:px-10"
              style={{ boxShadow: '0 0 90px rgba(212,180,122,0.35), 0 30px 80px -20px rgba(0,0,0,0.6)' }}
            >
              <AuroraFlow />
              <div className="relative">
                <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.22em] text-penny-light">
                  <Sparkles size={12} /> Daily briefing · 7:02 AM
                </span>
                <b className="mt-2.5 block font-serif text-[clamp(20px,3.2vw,30px)] font-semibold leading-tight text-white">
                  Good morning — 3 things need a decision.
                </b>
                <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-white/70">
                  Every domain you just watched dock — distilled into one morning read.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <span
                    className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-lg shadow-black/25"
                    style={{ backgroundImage: 'linear-gradient(100deg, #3b6ef5 0%, #8b5cf6 52%, #ff6b5c 100%)' }}
                  >
                    <Play size={14} className="fill-current" /> Open Daily Briefing
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-penny/40 bg-penny/10 px-3.5 py-2 text-[12.5px] font-semibold text-penny-light">
                    <Clock size={13} /> 2 min read
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}

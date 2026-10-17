// ─────────────────────────────────────────────────────────────────────────────
// OrbitScrolly — THE landing set-piece: a pinned, scroll-scrubbed 3-D orbital
// system with KYRO (the owl) at the center and the nine domains as planets.
//
// Choreography over the 560vh track (progress 0→1):
//   0.00–0.10  FORMATION — planets erupt from the core (overshoot) onto a
//              tilted ellipse; the watermark type fades in.
//   0.10–0.90  NINE STOPS — the planets sit 40° apart (360° ÷ 9) and the system
//              rotates 320° (8 × 40°); each domain docks at the
//              FRONT (bottom, scaled up, hue ring), fires a one-shot shock-
//              wave, draws a beam into KYRO, and deals in its payload figure
//              (photo plate + counting stat + self-drawing chart).
//   0.90–1.00  COLLAPSE — the system spirals into the core, which re-emerges as
//              the briefing card: "Good morning — 3 things need a decision."
//
// KYRO PERFORMS the scroll (orbitOwl.js — pure functions of scroll progress):
// it flies in on an arc as the track scrolls up into view and lands on the
// core as the stage pins, waves while the planets erupt, then per dock listens
// (the planet hands its numbers over), talks (its briefing line) and thinks
// (in transit), and tosses its cap once every domain is in. Scrubbing back up
// plays it backwards — it takes off and flies out the way it came.
//
// Implementation notes: ONE useMotionValueEvent handler does the trig and
// writes planet/beam/core styles imperatively via refs (zero re-renders while
// scrubbing); React state changes ONLY on dock
// (active index), driving the payload figure, flanks, type and shockwave.
// Reduced motion: a static settled frame (no pin theatrics).
//
// Premium UI P5 ("the ledger" at editorial scale): the stage is the page
// ground — no backdrop photograph, no glass, no glow, no looping beam. The
// module hue appears only as strokes (planet ring + icon, the beam, chart
// lines) and the payload's 2px top rule; each domain's photograph is a framed
// plate inside the payload figure. Flanking text sits on the ground under
// 11px caps label rules; the finale is a Panel, the in-app briefing card.
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
  BookOpenCheck,
  Wrench,
  HeartHandshake,
  Target,
  Users,
  Sparkles,
  Play,
  Clock,
} from 'lucide-react'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import useMediaQuery from './useMediaQuery.js'
import {
  DOCKS,
  FLIGHT_IDLE_MS,
  beatOwl,
  flightPhase,
  flightPoint,
  flightProgress,
  orbitBeat,
  settleDuration,
  settleTarget,
  travelDir,
} from './orbitOwl.js'
import '../../styles/landing-orbit.css'

// The nine domains — hue, proof line, the payload stat, and a PHOTOGRAPH.
// Real platform truths (statements from a TB; SIS name-matching…).
//
// The photos live in /public/landing/orbit-*.jpg (Unsplash — free commercial
// license, no attribution required — except Academics, generated to match them:
// 1000×520 progressive JPEG) and each was chosen for the domain it rides
// with, not for generic office ambience: a classroom full of students for
// Enrollment, a teacher going over a results sheet with two students for
// Academics, an empty board table for Governance, thrown graduation caps for
// Accreditation, the campus building itself for Facilities, cupped hands giving
// for Advancement, a sticky-note planning wall for Strategy, a staff training
// session for HR, and two people working the numbers for Finance. Each rides
// as a framed plate in the payload figure, which re-mounts per dock, so the
// photo swaps with the same deal-in the rest of the payload gets.
// Each domain also carries its EXPLANATION (three concrete, platform-true
// points — what the module actually does, no adjectives doing the work) and a
// SAMPLE BRIEFING ITEM (severity + sentence, styled like the real app's
// attention rail) for the flanking columns beside the orbit.
const DOMAINS = [
  { key: 'finance', label: 'Finance', hue: '#2563EB', Icon: CircleDollarSign, line: 'Trial balance in — four board-ready statements out.', stat: 4, unit: 'statements', img: '/landing/orbit-finance.jpg', imgAlt: 'Two people working through financial statements together' , points: ['Upload a trial balance or connect QuickBooks \u2014 four board-ready statements build themselves.', 'Analytics, budget vs actual and the board packet read from the same numbers.', 'A cash forecast dates the summer trough before it arrives.'], brief: { sev: 'critical', text: 'Days cash on hand fell below 60 \u2014 first shortfall projected July 18.' } },
  { key: 'enrollment', label: 'Enrollment', hue: '#0891b2', Icon: GraduationCap, line: 'SIS rosters reconcile by name; projections flow into tuition and cash.', stat: 412, unit: 'students synced', img: '/landing/orbit-enrollment.jpg', imgAlt: 'A classroom full of students' , points: ['SIS rosters sync and reconcile by name \u2014 Blackbaud, OneRoster, or a roster file.', 'Enrollment flows into tuition, aid and cash projections automatically.', 'Demographics and retention read from the same roster.'], brief: { sev: 'watch', text: 'Enrollment is 12 under plan \u2014 projected tuition impact \u2212$146K.' } },
  { key: 'academics', label: 'Academics', hue: '#0D9488', Icon: BookOpenCheck, line: 'ACT, SAT and TerraNova in one place \u2014 measured against peer schools.', stat: 24, unit: 'average ACT', img: '/landing/orbit-academics.jpg', imgAlt: 'A teacher going over a results sheet with two high-school students', points: ['ACT, SAT and TerraNova results in one place \u2014 upload the score report as it arrives.', 'See where you stand against peer schools, grade by grade.', 'Follow progress over time and the same class year to year; groups too small to show stay hidden.'], brief: { sev: 'watch', text: 'Grade 5 math fell 14 national percentile points on TerraNova \u2014 reading held steady.' } },
  { key: 'governance', label: 'Governance', hue: '#7c3aed', Icon: Landmark, line: 'Policies, meetings, minutes — reviewed on schedule, never lost.', stat: 36, unit: 'policies tracked', img: '/landing/orbit-governance.jpg', imgAlt: 'An empty boardroom table before a meeting' , points: ['Policies with owners and review dates that actually come due.', 'Meetings, minutes and committees in one register.', 'Review lapses surface in the briefing before an auditor finds them.'], brief: { sev: 'watch', text: '4 policies are past their scheduled review \u2014 the oldest by 210 days.' } },
  { key: 'accreditation', label: 'Accreditation', hue: '#d97706', Icon: BadgeCheck, line: 'Standards and evidence tracked; gaps surface in the briefing.', stat: 87, unit: '% evidence ready', img: '/landing/orbit-accreditation.jpg', imgAlt: 'Graduates throwing their caps' , points: ['Adopt your accreditor\u2019s framework \u2014 Cognia, FCIS, ACSI, WASC, SAIS.', 'Score standards on the rubric; attach evidence where it lives.', 'A mock visit shows what a visiting team would find today.'], brief: { sev: 'critical', text: 'An assurance gate is unmet \u2014 one attached artifact settles it.' } },
  { key: 'facilities', label: 'Facilities', hue: '#ea580c', Icon: Wrench, line: 'Maintenance with real costs — variance you can defend.', stat: 23, unit: 'work orders', img: '/landing/orbit-facilities.jpg', imgAlt: 'A school campus building and grounds' , points: ['Work orders with real costs, not estimates that never close.', 'Recurring maintenance on a calendar, with inspection records.', 'Variance against the facilities budget you can defend to a board.'], brief: { sev: 'watch', text: 'Maintenance backlog reached 23 work orders \u2014 $41K over budget.' } },
  { key: 'advancement', label: 'Advancement', hue: '#e11d48', Icon: HeartHandshake, line: 'Campaigns, gifts, pledges — pacing vs goal at a glance.', stat: 72, unit: '% to goal', img: '/landing/orbit-advancement.jpg', imgAlt: 'Cupped hands holding a donation' , points: ['Campaigns, gifts and pledges in one register.', 'Pledge pacing versus goal, visible at a glance.', 'Giving flows into the finance picture automatically.'], brief: { sev: 'info', text: 'Annual fund reached 72% of goal \u2014 $84K ahead of last year\u2019s pace.' } },
  { key: 'strategy', label: 'Strategy', hue: '#8b5cf6', Icon: Target, line: 'A strategic plan that measures itself against the live numbers.', stat: 9, unit: 'goals on pace', img: '/landing/orbit-strategy.jpg', imgAlt: 'A team planning with sticky notes on a wall' , points: ['Goals bound to live metrics \u2014 progress computes itself.', 'Direction-aware pacing: ahead or behind, with no manual updates.', 'Strategy-linked tasks land with the people who own them.'], brief: { sev: 'info', text: '9 of 12 goals on pace \u2014 two need attention before the board meets.' } },
  { key: 'hr', label: 'HR', hue: '#059669', Icon: Users, line: 'Staffing feeds student-teacher ratio straight into analytics.', stat: 14, unit: 'students per teacher', img: '/landing/orbit-hr.jpg', imgAlt: 'Staff in a professional development session' , points: ['A staff roster with credentials, clearances and evaluations.', 'Student-teacher ratio feeds analytics straight from staffing.', 'Professional development tracked with dates that come due.'], brief: { sev: 'watch', text: 'Student-teacher ratio hit 27.9:1 \u2014 above the board\u2019s threshold.' } },
]

// Orbit geometry from the domain count: planets sit STEP° apart and the system
// turns one STEP per dock — STOPS hand-offs, SPIN° in all (9 → 40°, 8, 320°).
const STEP = 360 / DOMAINS.length
const STOPS = DOMAINS.length - 1
const SPIN = STOPS * STEP
// The Scholar's beats (orbitOwl.js) are scheduled for DOCKS docks; a domain
// added here without bumping DOCKS would put its listen/talk out of step.
if (import.meta.env?.DEV && DOMAINS.length !== DOCKS) {
  console.error(`OrbitScrolly: ${DOMAINS.length} domains but orbitOwl DOCKS = ${DOCKS}`)
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1)
const backOut = (t) => { const c = 1.70158; return 1 + (--t) * t * ((c + 1) * t + c) }
const smooth = (t) => t * t * (3 - 2 * t)

// ── Per-domain payload visualizations — each dock deals in its OWN chart type
// (area, bars, gauge, stacked status, thermometer, milestones, pictogram, peer
// strip), replayed on every dock (the card re-mounts per domain key). Marks are ink
// tones; the module hue is only ever a STROKE (line, arc, ring). ─────────────
const INK = 'rgb(16 28 61)'
const ink = (a) => `rgb(16 28 61 / ${a})`
const CAPS = 'text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink2'

function VizArea({ hue }) {
  const line = 'M4 44 L64 36 L124 40 L184 24 L244 29 L304 14 L364 18 L436 6'
  return (
    <svg className="h-14 w-full" viewBox="0 0 440 56" preserveAspectRatio="none" aria-hidden="true">
      <motion.path
        d={`${line} L436 54 L4 54 Z`}
        fill={ink(0.05)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      />
      <motion.path
        d={line} fill="none" stroke={hue} strokeWidth="2" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }}
      />
    </svg>
  )
}

function VizBars() {
  const H = [18, 24, 21, 30, 27, 36, 33, 46]
  return (
    <svg className="h-14 w-full" viewBox="0 0 440 56" preserveAspectRatio="none" aria-hidden="true">
      {H.map((h, i) => (
        <motion.rect
          key={i}
          x={10 + i * 55} width="34" rx="2"
          fill={i === H.length - 1 ? INK : ink(0.14)}
          initial={{ height: 0, y: 54 }}
          animate={{ height: h, y: 54 - h }}
          transition={{ delay: 0.15 + i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </svg>
  )
}

function VizStacked() {
  const SEGS = [
    { label: 'Reviewed', w: 62, o: 0.85 },
    { label: 'Current', w: 26, o: 0.4 },
    { label: 'Due', w: 12, o: 0.22 },
  ]
  return (
    <div aria-hidden="true" className="w-full">
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-sm">
        {SEGS.map((s, i) => (
          <motion.span
            key={s.label}
            className="h-full"
            style={{ background: ink(s.o) }}
            initial={{ width: 0 }}
            animate={{ width: `${s.w}%` }}
            transition={{ delay: 0.25 + i * 0.16, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>
      <div className="mt-2 flex gap-4">
        {SEGS.map((s) => (
          <span key={s.label} className={`flex items-center gap-1.5 ${CAPS}`}>
            <i className="h-2 w-2 rounded-sm" style={{ background: ink(s.o) }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function VizGauge({ hue }) {
  // Semicircle fully INSIDE the viewBox (chord at y=80, apex at y=14) + the
  // 87% tip on the arc itself.
  const arc = 'M14 80 A66 66 0 0 1 146 80'
  return (
    <svg className="mx-auto h-20" viewBox="0 0 160 92" aria-hidden="true">
      <path d={arc} fill="none" stroke={ink(0.1)} strokeWidth="8" strokeLinecap="round" />
      <motion.path
        d={arc} fill="none" stroke={hue} strokeWidth="8" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 0.87 }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  )
}

function VizRows() {
  const ROWS = [
    { label: 'HVAC', w: 78 },
    { label: 'Roofing', w: 52 },
    { label: 'Grounds', w: 34 },
  ]
  return (
    <div aria-hidden="true" className="w-full space-y-1.5">
      {ROWS.map((r, i) => (
        <div key={r.label} className="flex items-center gap-2.5">
          <span className={`w-16 ${CAPS}`}>{r.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-sm" style={{ background: ink(0.07) }}>
            <motion.span
              className="block h-full"
              style={{ background: ink(0.7) }}
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
    <div aria-hidden="true" className="relative w-full pt-4">
      <span className={`absolute right-0 top-0 ${CAPS}`}>Goal</span>
      <div className="h-2.5 w-full overflow-hidden rounded-sm" style={{ background: ink(0.07) }}>
        <motion.span
          className="block h-full"
          style={{ background: ink(0.75) }}
          initial={{ width: 0 }}
          animate={{ width: '72%' }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <motion.span
        className="absolute rounded-full border-2 bg-white"
        style={{ borderColor: hue, left: 'calc(72% - 8px)', height: 16, width: 16, top: 13 }}
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8, type: 'spring', stiffness: 280, damping: 18 }}
      />
    </div>
  )
}

function VizMilestones() {
  return (
    <div aria-hidden="true" className="relative flex w-full items-center justify-between px-1 py-2">
      <span className="absolute inset-x-2 top-1/2 h-px" style={{ background: ink(0.14) }} />
      {Array.from({ length: 9 }).map((_, i) => (
        <motion.span
          key={i}
          className="relative h-2.5 w-2.5 rotate-45 rounded-[2px]"
          style={{ background: i < 7 ? INK : '#ffffff', boxShadow: i < 7 ? 'none' : `inset 0 0 0 1.5px ${ink(0.25)}` }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 320, damping: 20 }}
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
          className="h-2 w-2 rounded-full"
          style={{ background: ink(0.55) }}
          initial={{ scale: 0, y: 6 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ delay: 0.12 + i * 0.05, type: 'spring', stiffness: 320, damping: 20 }}
        />
      ))}
      <span className="mx-1 text-[13px] font-semibold text-ink2">:</span>
      <motion.span
        className="flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] bg-white"
        style={{ borderColor: hue, color: hue }}
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.85, type: 'spring', stiffness: 280, damping: 18 }}
      >
        <Users size={11} />
      </motion.span>
    </div>
  )
}

// Standing among peers: the peer schools as ink dots on one score scale
// (anonymous, as the app shows them), your school a hue ring that drops in last.
function VizStanding({ hue }) {
  const PEERS = [12, 21, 30, 38, 47, 55, 81, 90]
  const YOU = 68
  return (
    <div aria-hidden="true" className="w-full">
      <div className="relative h-6">
        <span className="absolute inset-x-0 top-1/2 h-px" style={{ background: ink(0.14) }} />
        {PEERS.map((x, i) => (
          <motion.span
            key={x}
            className="absolute top-1/2 -ml-1 -mt-1 h-2 w-2 rounded-full"
            style={{ left: `${x}%`, background: ink(0.45) }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.12 + i * 0.06, type: 'spring', stiffness: 320, damping: 20 }}
          />
        ))}
        <motion.span
          className="absolute top-1/2 -ml-2 -mt-2 h-4 w-4 rounded-full border-2 bg-white"
          style={{ left: `${YOU}%`, borderColor: hue }}
          initial={{ scale: 0, y: -10 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ delay: 0.7, type: 'spring', stiffness: 280, damping: 18 }}
        />
      </div>
      {/* "Your school" sits under its ring, not at the scale's end. */}
      <div className="relative mt-1 h-4">
        <span className={`absolute left-0 ${CAPS}`}>Peer schools</span>
        <span className={`absolute -translate-x-1/2 whitespace-nowrap ${CAPS}`} style={{ left: `${YOU}%` }}>
          Your school
        </span>
      </div>
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
  academics: VizStanding,
}

// Severity → the semantic tone of the briefing item's 2px mark.
const SEV = {
  critical: { tone: 'tone-risk', label: 'Needs a decision' },
  watch: { tone: 'tone-watch', label: 'Worth watching' },
  info: { tone: 'tone-good', label: 'Good news travels too' },
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
  // Below sm the owl perches smaller and only the docked planet keeps its label.
  const phone = useMediaQuery('(max-width: 639px)')

  // Warm the nine photos once the section is near — the payload figure mounts
  // each one at dock time, and a plate that pops in a beat after its own figure
  // undoes the deal-in. Fire-and-forget; a failed fetch just means the browser
  // loads it on dock like it would have anyway.
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
  const coreRef = useRef(null)
  const typeRef = useRef(null)
  const payWrapRef = useRef(null)
  const flankLRef = useRef(null)
  const flankRRef = useRef(null)
  const finaleRef = useRef(null)

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] })
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.35 })

  const [active, setActive] = useState(0)
  const [shockKey, setShockKey] = useState(0)
  const activeRef = useRef(0)

  // KYRO's entrance, scrubbed by scroll: as the track rises from the bottom
  // of the viewport to the pin (`approach` 0→1) the Scholar flies in on an arc
  // from past the left edge (wing beating, mirrored to face its travel),
  // glides the last stretch and lands on the core — its own landing one-shot
  // plays the touchdown. Scrolling back up it takes off and flies back out,
  // facing left. The arc is written straight to the wrapper's style (no
  // re-render per frame); React state changes only when the phase or the
  // direction does.
  //
  // A visitor who STOPS mid-arc (the nav's "How it works" anchor lands there)
  // never leaves the owl hanging: after FLIGHT_IDLE_MS the flight finishes by
  // itself — it lands on the core (scrolling down) or flies back out
  // (scrolling up) — and stays there while the scroll carries on the same
  // way. Turning back, the owl rejoins the scrubbed arc with a short chase
  // instead of a jump. `flight` holds { f, mode: scrub|settle|latched|chase }.
  // Phones: 84px, so the perch lift (below) keeps the cap clear of the
  // three-line subtitle while the owl waves hello.
  const owlSize = phone ? 84 : 140
  const wide = useMediaQuery('(min-width: 1280px)')
  const { scrollYProgress: approachRaw } = useScroll({ target: trackRef, offset: ['start end', 'start start'] })
  const approach = useSpring(approachRaw, { stiffness: 120, damping: 24, mass: 0.35 })
  const flyRef = useRef(null)
  const perchRef = useRef(null)
  const travelRef = useRef({ dir: 1, anchor: 0 })
  const flightRef = useRef({ f: 0, mode: 'scrub', to: null, anim: null, idle: 0 })
  const [flyDir, setFlyDir] = useState(1)
  const [flyPhase, setFlyPhase] = useState('flying')
  const paintFlight = (f, dir) => {
    const pt = flightPoint(f, {
      vw: window.innerWidth,
      vh: window.innerHeight,
      owlW: owlSize * 0.73,
    })
    const el = flyRef.current
    if (el) {
      el.style.transform = `translate3d(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px, 0)`
      el.style.opacity = String(pt.o)
    }
    setFlyPhase(flightPhase(f, dir))
  }
  const paintRef = useRef(paintFlight)
  useEffect(() => {
    paintRef.current = paintFlight
  })
  const runFlight = (to, duration, ease, dir, done) => {
    const F = flightRef.current
    F.anim?.stop()
    F.anim = animate(F.f, to, {
      duration,
      ease,
      onUpdate: (f) => {
        F.f = f
        paintRef.current(f, dir)
      },
      onComplete: done,
    })
  }
  const settleFlight = () => {
    const F = flightRef.current
    const { dir } = travelRef.current
    const to = settleTarget(F.f, dir)
    if (F.mode !== 'scrub' || to == null) return
    F.mode = 'settle'
    F.to = to
    runFlight(to, settleDuration(F.f, to), 'easeInOut', dir, () => {
      F.mode = 'latched'
    })
  }
  useEffect(
    () => () => {
      const F = flightRef.current
      window.clearTimeout(F.idle)
      F.anim?.stop()
    },
    [],
  )
  useMotionValueEvent(approach, 'change', (a) => {
    if (reduce) return
    travelRef.current = travelDir(travelRef.current, a)
    const { dir } = travelRef.current
    const target = flightProgress(a)
    const F = flightRef.current
    window.clearTimeout(F.idle)
    setFlyDir(dir)
    // Carrying on the way it finished (or is finishing): hold there until the
    // scroll catches up, then scrub again.
    if (F.mode === 'settle' || F.mode === 'latched') {
      const sameWay = F.to === 1 ? dir > 0 : dir < 0
      const caughtUp = F.to === 1 ? target >= 1 : target <= 0
      if (caughtUp && F.mode === 'latched') F.mode = 'scrub'
      else if (sameWay) return
      else F.mode = 'chase'
    }
    if (F.mode === 'chase') {
      runFlight(target, 0.35, 'easeOut', dir, () => {
        F.mode = 'scrub'
      })
    } else {
      F.anim?.stop()
      F.f = target
      paintRef.current(target, dir)
    }
    if (settleTarget(target, dir) != null) F.idle = window.setTimeout(settleFlight, FLIGHT_IDLE_MS)
  })

  // Perched, its beat follows the orbit (hello → listen/talk/think per dock →
  // celebrate); see orbitOwl.js. Set only when the beat changes.
  const [owlBeat, setOwlBeat] = useState('arrive')
  const owlBeatRef = useRef('arrive')

  useMotionValueEvent(p, 'change', (v) => {
    const beat = orbitBeat(v)
    if (beat !== owlBeatRef.current) {
      owlBeatRef.current = beat
      setOwlBeat(beat)
    }
    const sys = sysRef.current
    if (!sys) return
    const form = backOut(seg(v, 0, 0.1))
    const collapse = smooth(seg(v, 0.9, 1))
    const mp = seg(v, 0.1, 0.9)
    const spin = mp * SPIN
    const W = sys.clientWidth
    // Phones: pull the orbit in so the far-side planets (and the docked
    // label) stay inside the system instead of clipping at the screen edge.
    const RX = W < 420 ? W * 0.5 - 52 : W * 0.5 - 34
    const RY = RX * 0.46
    const rf = Math.max(form * (1 - collapse), 0.001)
    // Perch lift: the docked planet sits at the ellipse front (y = +RY, scaled
    // ~1.17, layered above the core), so the owl rises just enough for its
    // feet to clear that tile. It rises as the planets come out (they layer
    // above the owl only once rf ≥ 0.85) and settles back as they collapse —
    // so the fly-in still lands exactly on the core.
    const tileReach = (phone ? 40 : 50) * 1.17 // planet centre → tile top (sm+ tiles are bigger)
    const perchLift = Math.max(0, owlSize / 2 + 8 - (RY - tileReach))
    if (perchRef.current) {
      perchRef.current.style.transform = `translate3d(0, ${(-perchLift * clamp(rf / 0.85, 0, 1)).toFixed(1)}px, 0)`
    }
    let frontX = 0
    let frontY = 0

    DOMAINS.forEach((_, i) => {
      const el = planetRefs.current[i]
      if (!el) return
      const a = ((i * STEP - spin + 90) * Math.PI) / 180
      const x = Math.cos(a) * RX * rf
      const y = Math.sin(a) * RY * rf
      const depth = (Math.sin(a) + 1) / 2 // 1 = front (bottom of ellipse)
      const sc = (0.62 + 0.55 * depth) * (form < 1 ? 0.5 + 0.5 * form : 1) * (1 - collapse * 0.7)
      el.style.transform = `translate(${x}px, ${y}px) scale(${sc})`
      // Gathered near the core (formation start / collapse end) the planets sit
      // BEHIND KYRO (z < core's 60) and branch out from it; only once the
      // orbit is formed do front-half passes layer above the owl.
      el.style.zIndex = String(rf < 0.85 ? 10 + Math.round(depth * 20) : 30 + Math.round(depth * 40))
      // Depth is carried by scale + opacity alone (no blur filter). Hidden
      // until formation starts, so they never sit stacked on the empty core
      // (labels overprinting) while the owl flies in — they erupt from it.
      el.style.opacity = String((0.4 + 0.6 * depth) * (1 - collapse) * seg(v, 0, 0.02))
      if (i === activeRef.current) { frontX = x; frontY = y }
    })

    // Beam: core → docked planet, visible only mid-stop (retracts in transit).
    const stopP = (mp * STOPS) % 1
    const midStop = (stopP > 0.18 && stopP < 0.82) || mp === 0 || mp === 1
    const show = mp > 0 && collapse === 0 && form >= 1 && midStop
    const cx = W / 2
    const cy = sys.clientHeight / 2
    const l = beamRef.current
    if (l) {
      l.setAttribute('x1', cx)
      l.setAttribute('y1', cy)
      l.setAttribute('x2', cx + frontX)
      l.setAttribute('y2', cy + frontY)
      l.style.opacity = show ? 1 : 0
    }

    // Dock: active index change → React state (payload/type/shockwave).
    const idx = clamp(Math.round(mp * STOPS), 0, STOPS)
    if (mp > 0 && idx !== activeRef.current) {
      activeRef.current = idx
      setActive(idx)
      setShockKey((k) => k + 1)
    }

    // Watermark type, core scale, payload + flank + finale opacity. The
    // watermark is GONE before the finale arrives (no ghost "HR" behind it).
    if (typeRef.current) typeRef.current.style.opacity = String(seg(v, 0.1, 0.14) * (1 - seg(v, 0.88, 0.93)))
    if (introRef.current) introRef.current.style.opacity = String(1 - seg(v, 0.05, 0.11))
    if (coreRef.current) {
      coreRef.current.style.transform = `scale(${1 + 0.5 * collapse})`
      coreRef.current.style.opacity = String(1 - seg(v, 0.94, 1))
    }
    const payO = String(seg(v, 0.1, 0.14) * (1 - seg(v, 0.88, 0.94)))
    if (payWrapRef.current) payWrapRef.current.style.opacity = payO
    if (flankLRef.current) flankLRef.current.style.opacity = payO
    if (flankRRef.current) flankRRef.current.style.opacity = payO
    if (finaleRef.current) {
      const f = seg(v, 0.94, 1)
      finaleRef.current.style.opacity = String(f)
      finaleRef.current.style.transform = `translate(-50%, -50%) scale(${0.92 + 0.08 * smooth(f)})`
    }
  })

  const d = DOMAINS[active]
  const sev = SEV[d.brief.sev] ?? SEV.info
  // In the air it faces its travel; perched, the orbit beat sets its mood.
  const perchedOwl = beatOwl(owlBeat, { wide })
  const owl =
    flyPhase === 'perched'
      ? perchedOwl
      : { facing: flyDir < 0 ? 'left' : 'right', moodHold: true }
  // The dock shockwave: a centred CIRCLE (not the owl's tall box) about the
  // owl's width, expanding once per dock.
  const shock = Math.round(owlSize * 0.73)

  // ── Reduced motion: one static, settled composition — no pin, no scrub. ────
  if (reduce) {
    return (
      <section id="how-it-works" aria-labelledby="orbit-h2" className="relative scroll-mt-20 bg-ground pb-20 pt-16 lg:pt-48">
        <div className="mx-auto max-w-4xl px-5 text-center sm:px-8">
          <p className={CAPS}>One AI · Nine domains</p>
          <h2 id="orbit-h2" className="mt-3 font-serif text-[32px] font-medium leading-[38px] text-ink sm:text-[40px] sm:leading-[44px]">
            Everything orbits KYRO.
          </h2>
          <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-2">
            {/* Reduced motion: the still Scholar (never in the animation loop). */}
            <PennyAvatar size={72} state="perched" />
            {DOMAINS.map((dom) => (
              <span key={dom.key} className="inline-flex items-center gap-2 rounded-sm border border-hair/[.18] bg-white px-2.5 py-1 text-[13px] font-semibold text-ink">
                <dom.Icon size={14} style={{ color: dom.hue }} aria-hidden="true" /> {dom.label}
              </span>
            ))}
          </div>
        </div>
      </section>
    )
  }

  return (
    // Desktop top padding clears the hero's straddling card (its -mb overhang
    // lands on this section); below lg the KYRO demo band already clears it. The heading lives INSIDE the pinned stage — no standalone
    // header block, no dead empty viewport before the scene.
    <section id="how-it-works" aria-labelledby="orbit-h2" className="relative scroll-mt-20 bg-ground pt-16 lg:pt-64">
      <div ref={trackRef} className="relative h-[560vh]">
        <div
          ref={stageRef}
          className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden bg-ground"
        >
          {/* The heading, lowered INTO the scene: overlays the stage top during
              KYRO's entrance + formation, fades as the first dock lands. */}
          <div
            ref={introRef}
            className="pointer-events-none absolute inset-x-0 top-[7%] z-[80] px-5 text-center"
          >
            <p className={CAPS}>One AI · Nine domains</p>
            <h2 id="orbit-h2" className="mt-2.5 font-serif text-[32px] font-medium leading-[38px] text-ink sm:text-[40px] sm:leading-[44px]">
              Everything orbits KYRO.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-[22px] text-ink2">
              Nine domains, one AI at the center. Scroll — every one of them docks, hands its
              numbers to KYRO, and lands in a single morning briefing.
            </p>
          </div>

          {/* Domain watermark behind the system: contained Garamond in ink at
              6% — a quiet editorial watermark, no gradient fill, no mask. Rises
              softly on each dock. The OUTER wrapper owns visibility
              (handler-written, STARTS hidden). */}
          <div
            ref={typeRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-[21%] z-0"
            style={{ opacity: 0 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={d.key}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0, transition: { duration: 0.18 } }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="mx-auto w-max select-none whitespace-nowrap font-serif font-medium uppercase"
                style={{ fontSize: 'clamp(34px, 8.4vw, 128px)', letterSpacing: '0.06em', color: 'rgb(16 28 61 / 0.06)' }}
              >
                {d.label}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* The system: beam + core + planets. */}
          <div ref={sysRef} aria-hidden="true" className="relative z-[2] w-[min(560px,92vw)] flex-none" style={{ aspectRatio: '1 / 0.78' }}>
            <svg className="pointer-events-none absolute inset-0 z-[40] h-full w-full overflow-visible">
              {/* opacity 0 initially — a zero-length round-cap line paints a dot
                  at the svg origin before the first handler write. */}
              <line ref={beamRef} strokeWidth="1.5" strokeLinecap="round" style={{ stroke: d.hue, transition: 'opacity .3s', opacity: 0 }} />
            </svg>

            {/* Core: KYRO + the dock shockwave (one ring per dock, one-shot).
                The fly-in arc lives on an INNER wrapper so it composes with the
                outer handler-driven collapse transform. */}
            <div className="absolute left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2">
              <div ref={coreRef} className="relative will-change-transform">
                {/* The perch lift (handler-written) keeps the owl's feet above
                    the docked planet; the ring rides with the owl. */}
                <div ref={perchRef} className="relative will-change-transform">
                  {/* The scroll-scrubbed flight (transform + opacity written by
                      the approach handler; starts hidden at the arc's start). No
                      squash here: the Scholar's own landing plays the touchdown. */}
                  <div ref={flyRef} className="will-change-transform" style={{ opacity: 0 }}>
                    <PennyAvatar size={owlSize} state={flyPhase} {...owl} />
                  </div>
                  {/* Centred by margins, not translate: the keyframe owns transform. */}
                  <span
                    key={shockKey}
                    className="orbit-shock pointer-events-none absolute left-1/2 top-1/2 rounded-full border"
                    style={{ borderColor: d.hue, width: shock, height: shock, marginLeft: -shock / 2, marginTop: -shock / 2 }}
                  />
                </div>
              </div>
            </div>

            {/* Planets: white, a hairline at rest; the docked one takes a 2px
                ring and icon stroke in its module hue — never a fill. */}
            {DOMAINS.map((dom, i) => {
              const { key, label, hue } = dom
              const on = i === active
              return (
                <div
                  key={key}
                  ref={(el) => (planetRefs.current[i] = el)}
                  className="absolute left-1/2 top-1/2 -m-10 w-20 text-center will-change-transform sm:-m-12 sm:w-24"
                  style={{ opacity: 0 }}
                >
                  <span
                    className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-white transition-[box-shadow,color] duration-500 sm:h-16 sm:w-16"
                    style={{
                      boxShadow: on ? `inset 0 0 0 2px ${hue}` : 'inset 0 0 0 1px rgb(16 28 61 / 0.14)',
                      color: on ? hue : 'rgb(68 80 110)',
                    }}
                  >
                    <dom.Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.75} />
                  </span>
                  <span
                    className={`mt-1.5 whitespace-nowrap text-[11px] font-semibold tracking-[0.04em] transition-colors duration-500 ${on ? 'block text-ink' : 'hidden text-ink2 sm:block'}`}
                  >
                    {label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* ── The flanking columns: WHAT IT DOES (left) and the module in
              practice as a real briefing item (right). Text on the ground
              under an 11px caps label rule — no panels. Absolutely placed so
              the orbit's trig layout is untouched; hidden below xl. ANCHORED
              OFF CENTER (calc(50% ± 330px)) so on an ultrawide they hug the
              system instead of drifting to the screen edge. Both re-mount per
              dock: the outgoing text clears first (mode="wait"), then the new one
              slides in once from its own side — text never overprints text. */}
          <div
            ref={flankLRef}
            className="pointer-events-none absolute right-[calc(50%+330px)] top-1/2 z-[3] hidden w-[280px] -translate-y-1/2 xl:block"
            style={{ opacity: 0 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={d.key}
                initial={{ x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -12, opacity: 0, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              >
                <div className="sec-head">
                  <p className="sec-label">What it does</p>
                  <span className="sec-rule" aria-hidden="true" />
                </div>
                <ul className="border-b border-hair">
                  {d.points.map((pt) => (
                    <li key={pt} className="border-t border-hair py-2.5 text-[13px] leading-[18px] text-ink">
                      {pt}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>

          <div
            ref={flankRRef}
            className="pointer-events-none absolute left-[calc(50%+330px)] top-1/2 z-[3] hidden w-[280px] -translate-y-1/2 xl:block"
            style={{ opacity: 0 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={d.key}
                initial={{ x: 24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 12, opacity: 0, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              >
                <div className="sec-head">
                  <p className="sec-label">In your morning briefing</p>
                  <span className="sec-rule" aria-hidden="true" />
                </div>
                {/* One attention item, the way the app renders one: a 2px
                    severity mark, the sentence in ink, where it belongs. */}
                <div className={`flex gap-3 border-y border-hair py-3 ${sev.tone}`}>
                  <span aria-hidden="true" className="w-[2px] shrink-0 self-stretch bg-current" />
                  <div className="min-w-0">
                    <p className="text-[13px] leading-[18px] text-ink">{d.brief.text}</p>
                    <p className={`mt-1.5 ${CAPS}`}>
                      {sev.label} · {d.label}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[13px] leading-[18px] text-ink2">
                  KYRO reads this domain every morning and says only what needs saying.
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Payload figure — deals in on every dock: the domain's photograph
              as a framed plate, the counting figure, the proof line, its own
              chart. A 2px hue rule over a hairline-closed figure; no box. The
              wrapper reserves the tallest figure's height, so a shorter chart
              never re-centres the stage and jolts the orbit (and the owl
              perched on it) up or down at a dock. */}
          <div ref={payWrapRef} className="relative z-[3] mt-3 min-h-[224px] w-[min(520px,90vw)] sm:min-h-[208px]" style={{ opacity: 0 }}>
            <motion.figure
              key={d.key}
              initial={{ y: 12, opacity: 0.2 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.42, ease: [0.2, 0.9, 0.2, 1] }}
              className="relative m-0 grid grid-cols-[84px_minmax(0,1fr)] gap-x-4 border-b border-hair pb-3 pt-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-x-5"
            >
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px]" style={{ background: d.hue }} />
              <img
                src={d.img}
                alt={d.imgAlt}
                width="112"
                height="140"
                draggable="false"
                className="h-full max-h-[148px] w-full rounded-md border border-hair object-cover"
              />
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <figcaption className="font-serif text-[22px] font-medium leading-7 text-ink">{d.label}</figcaption>
                  <div className="text-right">
                    <b className="block font-serif text-[30px] font-medium leading-8 tabular-nums text-ink"><CountStat target={d.stat} /></b>
                    <span className={`block ${CAPS}`}>{d.unit}</span>
                  </div>
                </div>
                <p className="mt-1 text-[13px] leading-[18px] text-ink2">{d.line}</p>
                {/* Each domain deals in its OWN chart (area/bars/gauge/…). */}
                <div className="mt-2.5">
                  {(() => { const Viz = VIZ[d.key]; return <Viz hue={d.hue} /> })()}
                </div>
              </div>
            </motion.figure>
          </div>

          {/* Collapse finale: the system becomes tomorrow's briefing — drawn as
              the in-app briefing card (a Panel: the thing you act on). */}
          <div
            ref={finaleRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[42%] z-[70] w-[min(520px,90vw)] opacity-0"
          >
            <div className="panel px-7 py-7 text-center sm:px-10">
              <span className={`inline-flex items-center gap-1.5 ${CAPS}`}>
                <Sparkles size={12} className="text-penny" /> Daily briefing · 7:02 AM
              </span>
              <b className="mt-2.5 block font-serif text-[26px] font-medium leading-8 text-ink sm:text-[30px] sm:leading-9">
                Good morning — 3 things need a decision.
              </b>
              <p className="mx-auto mt-2 max-w-sm text-[13px] leading-[18px] text-ink2">
                Every domain you just watched dock — distilled into one morning read.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                {/* A quiet label, not a button: this whole layer is
                    aria-hidden + pointer-events-none, so nothing here presses. */}
                <span className="pill">
                  <Play size={12} className="fill-current" /> Open Daily Briefing
                </span>
                <span className="pill">
                  <Clock size={12} /> 2 min read
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
